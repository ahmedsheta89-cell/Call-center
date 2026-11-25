/**
 * @file scripts/test_external_integration_security.ts
 * External Integration Security, Durable Replay, STARTTLS SMTP & SIP Fail-Closed Lifecycle Suite
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import express from 'express';
import { apiRouter } from '../server/api/router.ts';
import { db } from '../server/db/store.ts';
import { initializeSeedData, DEMO_ORG_ID } from '../server/db/seed.ts';
import {
  setIdempotencyFilePathForTesting,
  getIdempotencyFilePath,
} from '../server/core/durableIdempotency.ts';
import { EmailChannelAdapter } from '../server/modules/integrations/adapters/emailBridge.ts';
import { SipTelephonyAdapter } from '../server/modules/integrations/adapters/sipTelephony.ts';

process.env.NODE_ENV = 'test';
process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';
process.env.SESSION_SECRET = 'external-integration-security-test-secret-key-32-chars-min';
process.env.CHANNEL_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.AUDIT_CHECKPOINT_HMAC_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, details?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    if (details !== undefined) console.error('     Details:', details);
    failed++;
  }
}

function generateTestTlsCert(tempDir: string): { key: string; cert: string } {
  const keyPath = path.join(tempDir, 'smtp-test-key.pem');
  const certPath = path.join(tempDir, 'smtp-test-cert.pem');
  const opensslBin = fs.existsSync('C:\\Program Files\\Git\\usr\\bin\\openssl.exe')
    ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
    : 'openssl';
  execFileSync(
    opensslBin,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=127.0.0.1',
    ],
    { stdio: 'ignore' }
  );
  return {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8'),
  };
}

/**
 * Isolated local SMTP test server supporting STARTTLS, EHLO, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA,
 * and fault injection (dropAfterData to test lost final 250 OK response).
 */
function startMockSmtpServer(options: {
  expectedUser: string;
  expectedPass: string;
  serverMessageId: string;
  supportStartTls?: boolean;
  tlsCert?: { key: string; cert: string };
  dropAfterData?: boolean;
}) {
  let receivedMessages = 0;
  let dataTransmittedCount = 0;

  const server = net.createServer((rawSocket) => {
    rawSocket.on('error', () => {});
    let activeSocket: net.Socket | tls.TLSSocket = rawSocket;
    let tlsUpgraded = false;
    let inData = false;
    let awaitingAuthLoginUser = false;
    let awaitingAuthLoginPass = false;
    let authUser = '';
    let dataBuffer = '';
    let lineBuffer = '';

    const write = (msg: string) => {
      if (!activeSocket.destroyed) activeSocket.write(msg);
    };

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (inData) {
        dataBuffer += text;
        if (dataBuffer.includes('\r\n.\r\n') || dataBuffer.endsWith('.\r\n')) {
          inData = false;
          dataBuffer = '';
          dataTransmittedCount++;
          if (options.dropAfterData) {
            // Simulate server accepting DATA then client losing final 250 OK response
            activeSocket.destroy();
            return;
          }
          receivedMessages++;
          write(`250 2.0.0 Ok: queued as ${options.serverMessageId}\r\n`);
        }
        return;
      }

      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (awaitingAuthLoginUser) {
          authUser = Buffer.from(line, 'base64').toString('utf8');
          awaitingAuthLoginUser = false;
          awaitingAuthLoginPass = true;
          write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (awaitingAuthLoginPass) {
          const authPass = Buffer.from(line, 'base64').toString('utf8');
          awaitingAuthLoginPass = false;
          if (authUser === options.expectedUser && authPass === options.expectedPass) {
            write('235 2.7.0 Authentication successful\r\n');
          } else {
            write('535 5.7.8 Authentication credentials invalid\r\n');
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          const caps = ['250-mock-smtp.omniflow.local'];
          if (options.supportStartTls && !tlsUpgraded) caps.push('250-STARTTLS');
          caps.push('250-AUTH PLAIN LOGIN');
          caps.push('250 SIZE 10485760\r\n');
          write(caps.join('\r\n'));
        } else if (upper === 'STARTTLS' && options.supportStartTls && options.tlsCert && !tlsUpgraded) {
          write('220 2.0.0 Ready to start TLS\r\n');
          tlsUpgraded = true;
          rawSocket.removeAllListeners('data');
          const tlsSocket = new tls.TLSSocket(rawSocket, {
            isServer: true,
            key: options.tlsCert.key,
            cert: options.tlsCert.cert,
          });
          tlsSocket.on('error', () => {});
          tlsSocket.on('data', handleChunk);
          activeSocket = tlsSocket;
          break;
        } else if (upper.startsWith('AUTH PLAIN')) {
          const b64 = line.slice('AUTH PLAIN'.length).trim();
          const parts = Buffer.from(b64, 'base64').toString('utf8').split('\0');
          const u = parts[1] || parts[0] || '';
          const p = parts[2] || parts[1] || '';
          if (u === options.expectedUser && p === options.expectedPass) {
            write('235 2.7.0 Authentication successful\r\n');
          } else {
            write('535 5.7.8 Authentication credentials invalid\r\n');
          }
        } else if (upper === 'AUTH LOGIN') {
          awaitingAuthLoginUser = true;
          write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          write('250 2.1.0 Ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          write('250 2.1.5 Ok\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          dataBuffer = '';
          write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          write('221 2.0.0 Bye\r\n');
          activeSocket.end();
        } else {
          write('250 Ok\r\n');
        }
      }
    };

    rawSocket.on('data', handleChunk);
    write('220 mock-smtp.omniflow.local ESMTP Service Ready\r\n');
  });

  return {
    server,
    getStats: () => ({ receivedMessages, dataTransmittedCount }),
  };
}

function startMockSipPbxServer(options: { expectedUser: string; expectedPass: string; realm?: string }) {
  const realm = options.realm || 'pbx.omniflow.local';
  const nonce = crypto.randomBytes(8).toString('hex');

  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('\r\n\r\n')) return;
      const reqText = buffer;
      buffer = '';

      const cseqMatch = /CSeq:\s*(\d+\s+REGISTER)/i.exec(reqText);
      const viaMatch = /Via:\s*([^\r\n]+)/i.exec(reqText);
      const fromMatch = /From:\s*([^\r\n]+)/i.exec(reqText);
      const toMatch = /To:\s*([^\r\n]+)/i.exec(reqText);
      const callIdMatch = /Call-ID:\s*([^\r\n]+)/i.exec(reqText);
      const authMatch = /Authorization:\s*Digest\s+([^\r\n]+)/i.exec(reqText);

      const commonHeaders = [
        `Via: ${viaMatch ? viaMatch[1] : 'SIP/2.0/TCP 127.0.0.1'}`,
        `From: ${fromMatch ? fromMatch[1] : '<sip:unknown@local>'}`,
        `To: ${toMatch ? toMatch[1] : '<sip:unknown@local>'};tag=pbx-tag`,
        `Call-ID: ${callIdMatch ? callIdMatch[1] : 'call-1'}`,
        `CSeq: ${cseqMatch ? cseqMatch[1] : '1 REGISTER'}`,
      ];

      if (!authMatch) {
        socket.write(
          [
            'SIP/2.0 401 Unauthorized',
            ...commonHeaders,
            `WWW-Authenticate: Digest realm="${realm}", nonce="${nonce}", algorithm=MD5`,
            'Content-Length: 0',
            '',
            '',
          ].join('\r\n')
        );
        return;
      }

      const authStr = authMatch[1];
      const userM = /username="([^"]+)"/.exec(authStr);
      const uriM = /uri="([^"]+)"/.exec(authStr);
      const respM = /response="([^"]+)"/.exec(authStr);
      const providedUser = userM?.[1] || '';
      const providedUri = uriM?.[1] || '';
      const providedResp = respM?.[1] || '';

      const ha1 = crypto.createHash('md5').update(`${options.expectedUser}:${realm}:${options.expectedPass}`).digest('hex');
      const ha2 = crypto.createHash('md5').update(`REGISTER:${providedUri}`).digest('hex');
      const expectedResp = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

      if (providedUser === options.expectedUser && providedResp === expectedResp) {
        socket.write(['SIP/2.0 200 OK', ...commonHeaders, 'Expires: 60', 'Content-Length: 0', '', ''].join('\r\n'));
      } else {
        socket.write(['SIP/2.0 403 Forbidden', ...commonHeaders, 'Content-Length: 0', '', ''].join('\r\n'));
      }
    });
  });

  return server;
}

async function main() {
  console.log('================================================================================');
  console.log('🔐 EXTERNAL INTEGRATION SECURITY, DURABLE REPLAY, STARTTLS SMTP & SIP SUITE');
  console.log('================================================================================\n');

  const tempDiskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-ext-sec-'));
  const diskFile = path.join(tempDiskDir, 'db_state.json');
  const prevDisk = db.getPersistFilePath();
  db.setPersistFilePathForTesting(diskFile);
  setIdempotencyFilePathForTesting(null);
  initializeSeedData();

  const SECOND_ORG_ID = 'org-second-tenant';
  db.organizations.set(SECOND_ORG_ID, {
    id: SECOND_ORG_ID,
    name: 'Second Tenant Org',
    slug: 'second-tenant',
    plan: 'enterprise',
    status: 'active',
    createdAt: new Date().toISOString(),
  } as any);

  const app = express();
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use('/api/v1', apiRouter);

  const httpServer = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (httpServer.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-admin-01' }),
    });
    const adminToken = ((await adminLoginRes.json()) as any).data?.token;
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };

    const agentLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-agt-01' }),
    });
    const agentToken = ((await agentLoginRes.json()) as any).data?.token;
    const agentHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${agentToken}` };

    // Configure WhatsApp, CEQUENS, Telegram for DEMO_ORG_ID
    const waSecret = 'ext_wa_app_secret_987654321';
    const waVerifyToken = 'ext_wa_verify_token_abc123';
    const waPhoneNumberId = 'PNID_EXT_TEST_001';
    await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        phoneNumberId: waPhoneNumberId,
        wabaId: 'WABA_EXT_TEST_001',
        apiToken: 'EAAG_EXT_VALID_TOKEN',
        appSecret: waSecret,
        verifyToken: waVerifyToken,
      }),
    });

    // Also configure WhatsApp for SECOND_ORG_ID with its own phoneNumberId
    const secondWaSecret = 'second_org_wa_secret_555';
    const secondPhoneNumberId = 'PNID_SECOND_ORG_002';
    db.setChannelConfig(SECOND_ORG_ID, 'chan-whatsapp', {
      phoneNumberId: secondPhoneNumberId,
      wabaId: 'WABA_SECOND_002',
      apiToken: 'EAAG_SECOND_VALID_TOKEN',
      appSecret: secondWaSecret,
      verifyToken: 'second_verify_token',
    });

    const cequensSecret = 'ext_cequens_webhook_secret_456';
    await fetch(`${baseUrl}/integrations/channels/chan-cequens/config`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        apiKey: 'ceq_live_key_123',
        senderName: 'OMNIFLOW_EG',
        webhookSecret: cequensSecret,
      }),
    });

    const tgSecret = 'ext_tg_secret_token_789';
    await fetch(`${baseUrl}/integrations/channels/chan-telegram/config`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        botToken: '99887766:AAF_TEST_BOT_TOKEN',
        webhookSecretToken: tgSecret,
      }),
    });

    db.channelConfigs.delete(`${DEMO_ORG_ID}::chan-email`);

    // -------------------------------------------------------------------------
    // PART 1: Unauthenticated External Webhook Auth & Durable Replay Protection
    // -------------------------------------------------------------------------
    console.log('[Part 1] Testing Unauthenticated Webhook Auth & Durable Tenant-Scoped Replay Protection...');

    const unauthGetStatus = await fetch(`${baseUrl}/integrations/whatsapp/webhook`);
    assert(
      unauthGetStatus.status === 401,
      `Unauthenticated GET /integrations/whatsapp/webhook status probe rejected -> HTTP 401 (got ${unauthGetStatus.status})`
    );

    const unauthGetValid = await fetch(
      `${baseUrl}/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${waVerifyToken}&hub.challenge=META_OK`
    );
    assert(
      unauthGetValid.status === 200 && (await unauthGetValid.text()) === 'META_OK',
      'Meta GET webhook subscription verification succeeds WITHOUT user Authorization header'
    );

    const makeWaBody = (pnid: string, msgs: Array<{ id: string; body: string }>) =>
      JSON.stringify({
        entry: [
          {
            id: 'WABA_1',
            changes: [
              {
                value: {
                  metadata: { phone_number_id: pnid },
                  contacts: [{ wa_id: '201022334455', profile: { name: 'عميل' } }],
                  messages: msgs.map((m) => ({ id: m.id, from: '201022334455', text: { body: m.body } })),
                },
              },
            ],
          },
        ],
      });

    const signWa = (body: string, secret: string) =>
      `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    // 1. Duplicate webhook in same process
    const body1 = makeWaBody(waPhoneNumberId, [{ id: 'wamid.dup.1', body: 'رسالة أولى' }]);
    const res1 = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(body1, waSecret) },
      body: body1,
    });
    assert(res1.status === 200, '1. Valid external WhatsApp webhook without Authorization accepted (200)');

    const res1Dup = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(body1, waSecret) },
      body: body1,
    });
    assert(res1Dup.status === 409, `1b. Duplicate webhook in same process rejected -> HTTP 409 (got ${res1Dup.status})`);

    // 2. Duplicate webhook after simulated cold restart (reload durable idempotency store)
    setIdempotencyFilePathForTesting(null);
    const res1ColdReplay = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(body1, waSecret) },
      body: body1,
    });
    assert(res1ColdReplay.status === 409, `2. Duplicate webhook after cold restart rejected -> HTTP 409 (got ${res1ColdReplay.status})`);

    // 3. Concurrent duplicate callbacks -> exactly 1 succeeds (200), 1 rejected (409)
    const concBody = makeWaBody(waPhoneNumberId, [{ id: 'wamid.concurrent.1', body: 'تزامن' }]);
    const concSig = signWa(concBody, waSecret);
    const [concA, concB] = await Promise.all([
      fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': concSig },
        body: concBody,
      }),
      fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': concSig },
        body: concBody,
      }),
    ]);
    const concStatuses = [concA.status, concB.status].sort();
    assert(
      concStatuses[0] === 200 && concStatuses[1] === 409,
      `3. Concurrent duplicate callbacks: 1 accepted (200), 1 rejected (409) [got ${concStatuses.join(',')}]`
    );

    // 4. Same event ID in different tenants -> BOTH accepted
    const sharedEventId = 'wamid.shared.cross.tenant.1';
    const tenant1Body = makeWaBody(waPhoneNumberId, [{ id: sharedEventId, body: 'مستأجر 1' }]);
    const tenant2Body = makeWaBody(secondPhoneNumberId, [{ id: sharedEventId, body: 'مستأجر 2' }]);
    const t1Res = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(tenant1Body, waSecret) },
      body: tenant1Body,
    });
    const t2Res = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(tenant2Body, secondWaSecret) },
      body: tenant2Body,
    });
    assert(
      t1Res.status === 200 && t2Res.status === 200,
      `4. Same event ID across different tenants accepted independently (200 & 200)`
    );

    // 5. Same event ID from different providers (whatsapp vs cequens) -> BOTH accepted
    const ceqSharedRes = await fetch(`${baseUrl}/webhooks/cequens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cequensSecret}` },
      body: JSON.stringify({ senderName: 'OMNIFLOW_EG', mobileNumber: '201011122233', message: 'SMS', messageId: sharedEventId }),
    });
    assert(ceqSharedRes.status === 200, `5. Same event ID from different provider (CEQUENS) accepted (200)`);

    // 6. Multiple messages in one provider batch, then overlap in second batch
    const batch1 = makeWaBody(waPhoneNumberId, [
      { id: 'wamid.batch.A', body: 'دفعة A' },
      { id: 'wamid.batch.B', body: 'دفعة B' },
    ]);
    const batch1Res = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(batch1, waSecret) },
      body: batch1,
    });
    const batch1Json: any = await batch1Res.json();
    assert(
      batch1Res.status === 200 && batch1Json.data?.processedCount === 2,
      `6a. Multi-message batch [A, B] processed 2 messages`
    );

    const batch2 = makeWaBody(waPhoneNumberId, [
      { id: 'wamid.batch.B', body: 'دفعة B مكررة' },
      { id: 'wamid.batch.C', body: 'دفعة C جديدة' },
    ]);
    const batch2Res = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(batch2, waSecret) },
      body: batch2,
    });
    const batch2Json: any = await batch2Res.json();
    assert(
      batch2Res.status === 200 &&
        batch2Json.data?.processedCount === 1 &&
        Array.isArray(batch2Json.data?.skippedDuplicates) &&
        batch2Json.data.skippedDuplicates.includes('wamid.batch.B'),
      `6b. Overlapping batch [B, C] skipped duplicate B and processed only C`,
      batch2Json
    );

    // 7. Storage failure (corrupted idempotency file) during ingestion -> fails closed 503
    const idemFile = getIdempotencyFilePath();
    const savedIdemContent = fs.readFileSync(idemFile, 'utf8');
    fs.writeFileSync(idemFile, '{CORRUPT_IDEMPOTENCY_JSON', 'utf8');
    const corruptBody = makeWaBody(waPhoneNumberId, [{ id: 'wamid.during.corrupt', body: 'لن يمر' }]);
    const corruptRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(corruptBody, waSecret) },
      body: corruptBody,
    });
    assert(corruptRes.status === 503, `7. Corrupted durable idempotency storage fails closed -> HTTP 503 (got ${corruptRes.status})`);
    fs.writeFileSync(idemFile, savedIdemContent, 'utf8');

    // 8. Replay after retention expiry -> accepted after TTL expires
    const prevTtl = process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS;
    process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS = '80';
    const ttlBody = makeWaBody(waPhoneNumberId, [{ id: 'wamid.ttl.expire.1', body: 'اختبار انتهاء الصلاحية' }]);
    const ttlSig = signWa(ttlBody, waSecret);
    const ttlFirst = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': ttlSig },
      body: ttlBody,
    });
    await new Promise((r) => setTimeout(r, 140));
    const ttlAfterExpiry = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': ttlSig },
      body: ttlBody,
    });
    if (prevTtl === undefined) delete process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS;
    else process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS = prevTtl;
    assert(
      ttlFirst.status === 200 && ttlAfterExpiry.status === 200,
      `8. Event accepted again after retention TTL expiry (${ttlFirst.status} -> ${ttlAfterExpiry.status})`
    );

    // Negative security checks (missing sig, tampered, wrong tenant, disabled, spoofed org, RBAC)
    const missingSigRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body1,
    });
    assert(missingSigRes.status === 401, 'Missing signature rejected (401)');

    const tamperedRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(body1, waSecret) },
      body: body1.replace('أولى', 'مزورة'),
    });
    assert(tamperedRes.status === 401, 'Tampered raw body rejected (401)');

    const spoofOrgBody = JSON.stringify({
      organizationId: SECOND_ORG_ID,
      entry: [{ id: 'WABA_1', changes: [{ value: { metadata: { phone_number_id: waPhoneNumberId }, messages: [{ id: 'wamid.spoof', from: '2010', text: { body: 'x' } }] } }] }],
    });
    const spoofRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signWa(spoofOrgBody, waSecret) },
      body: spoofOrgBody,
    });
    assert(spoofRes.status === 403, 'Spoofed organizationId rejected (403)');

    const unauthConfigRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: 'hacked' }),
    });
    const agentConfigRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: agentHeaders,
      body: JSON.stringify({ verifyToken: 'hacked' }),
    });
    assert(unauthConfigRes.status === 401 && agentConfigRes.status === 403, 'Admin config remains protected (401 unauth, 403 agent)');

    // -------------------------------------------------------------------------
    // PART 2: SMTP STARTTLS, Negative TLS/Auth Tests & Durable Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Part 2] Testing SMTP Mandatory STARTTLS, Negative TLS/Auth & Durable Idempotency...');

    const tlsCert = generateTestTlsCert(tempDiskDir);

    // 2a. Server without STARTTLS -> mandatory TLS rejects insecure connection
    const noTlsServer = startMockSmtpServer({
      expectedUser: 'support@omniflow.local',
      expectedPass: 'SmtpPass!2026',
      serverMessageId: '<no-tls@local>',
      supportStartTls: false,
    });
    await new Promise<void>((r) => noTlsServer.server.listen(0, '127.0.0.1', r));
    const noTlsPort = (noTlsServer.server.address() as net.AddressInfo).port;
    try {
      const strictEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: noTlsPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        allowSimulation: false,
      });
      const noTlsHealth = await strictEmail.fetchHealthStatus();
      assert(
        noTlsHealth.state === 'FAILED' && !noTlsHealth.isHealthy,
        `STARTTLS unavailable on SMTP server fails closed -> FAILED (got ${noTlsHealth.state})`
      );
    } finally {
      noTlsServer.server.close();
    }

    // 2b. Server with self-signed STARTTLS cert -> default tlsRejectUnauthorized=true fails cert verification
    const tlsServer = startMockSmtpServer({
      expectedUser: 'support@omniflow.local',
      expectedPass: 'SmtpPass!2026',
      serverMessageId: '<real-starttls-msg-101@mock-smtp.omniflow.local>',
      supportStartTls: true,
      tlsCert,
    });
    await new Promise<void>((r) => tlsServer.server.listen(0, '127.0.0.1', r));
    const tlsPort = (tlsServer.server.address() as net.AddressInfo).port;
    try {
      const strictCertEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: tlsPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        tlsRejectUnauthorized: true,
        allowSimulation: false,
      });
      const certFailHealth = await strictCertEmail.fetchHealthStatus();
      assert(
        certFailHealth.state === 'FAILED' && !certFailHealth.isHealthy,
        `TLS certificate verification failure (self-signed with rejectUnauthorized=true) -> FAILED`
      );

      // 2c. Auth rejection over valid STARTTLS -> AUTH_FAILED, password redacted
      const badPassSecret = 'SuperSecretWrongPass_9911';
      const badAuthTls = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: tlsPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: badPassSecret,
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const badAuthHealth = await badAuthTls.fetchHealthStatus();
      assert(
        badAuthHealth.state === 'FAILED' && !String(badAuthHealth.details || '').includes(badPassSecret),
        `STARTTLS auth rejection reports FAILED and redacts password`
      );

      // 2d. Missing credentials -> DISABLED/FAILED, never simulated
      const missingCredsEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: tlsPort,
        smtpUser: 'support@omniflow.local',
        allowSimulation: false,
      });
      const missingHealth = await missingCredsEmail.fetchHealthStatus();
      assert(
        missingHealth.state === 'TCP_REACHABLE' && !missingHealth.isHealthy,
        `Missing SMTP password reports TCP_REACHABLE (never CONNECTED or SENT)`
      );

      // 2e. Valid STARTTLS + Auth -> CONNECTED, real messageId, and durable restart idempotency
      const liveEmail1 = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: tlsPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        fromAddress: 'support@omniflow.local',
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const goodHealth = await liveEmail1.fetchHealthStatus();
      assert(goodHealth.state === 'CONNECTED' && goodHealth.isHealthy, `STARTTLS + Auth verified -> CONNECTED`);

      const durableMsgId = crypto.randomUUID();
      const emailPayload: any = {
        id: durableMsgId,
        organizationId: DEMO_ORG_ID,
        customerId: 'cust-1',
        conversationId: 'conv-1',
        channel: 'email',
        direction: 'outbound',
        type: 'text',
        body: 'STARTTLS real delivery test',
        sender: { id: 'usr-1', type: 'agent', name: 'Agent' },
        status: 'pending',
        metadata: { to: 'customer@example.com', subject: 'STARTTLS Delivery' },
        createdAt: new Date().toISOString(),
      };
      const send1 = await liveEmail1.dispatchOutboundMessage(emailPayload);
      assert(
        send1.status === 'sent' &&
          send1.relayAccepted === true &&
          send1.inboxDeliveryConfirmed === false &&
          send1.externalMessageId.length > 0 &&
          tlsServer.getStats().receivedMessages === 1,
        `STARTTLS delivery succeeded, captured Message-ID (${send1.externalMessageId}), and marked inboxDeliveryConfirmed=false`
      );

      // Simulate restart: new adapter instance with cleared in-flight set
      setIdempotencyFilePathForTesting(null);
      const liveEmailAfterRestart = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: tlsPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        fromAddress: 'support@omniflow.local',
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const sendAfterRestart = await liveEmailAfterRestart.dispatchOutboundMessage(emailPayload);
      assert(
        sendAfterRestart.status === 'sent' &&
          sendAfterRestart.externalMessageId === send1.externalMessageId &&
          tlsServer.getStats().receivedMessages === 1,
        `Restart & retry idempotency prevented duplicate send (receivedMessages=${tlsServer.getStats().receivedMessages})`
      );
    } finally {
      tlsServer.server.close();
    }

    // 2f. Server accepts DATA but client loses final response -> must NOT duplicate on retry
    const dropServer = startMockSmtpServer({
      expectedUser: 'support@omniflow.local',
      expectedPass: 'SmtpPass!2026',
      serverMessageId: '<dropped@local>',
      supportStartTls: true,
      tlsCert,
      dropAfterData: true,
    });
    await new Promise<void>((r) => dropServer.server.listen(0, '127.0.0.1', r));
    const dropPort = (dropServer.server.address() as net.AddressInfo).port;
    try {
      const dropEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort: dropPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        fromAddress: 'support@omniflow.local',
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const dropMsg: any = {
        id: crypto.randomUUID(),
        organizationId: DEMO_ORG_ID,
        customerId: 'cust-1',
        conversationId: 'conv-1',
        channel: 'email',
        direction: 'outbound',
        type: 'text',
        body: 'Post-DATA drop test',
        sender: { id: 'usr-1', type: 'agent', name: 'Agent' },
        status: 'pending',
        metadata: { to: 'customer@example.com', subject: 'Drop Test' },
        createdAt: new Date().toISOString(),
      };
      const firstDrop = await dropEmail.dispatchOutboundMessage(dropMsg);
      const retryAfterDrop = await dropEmail.dispatchOutboundMessage(dropMsg);
      assert(
        firstDrop.status === 'failed' &&
          retryAfterDrop.status === 'failed' &&
          dropServer.getStats().dataTransmittedCount === 1,
        `Post-DATA lost response failed safely and blocked duplicate retry (dataTransmittedCount=${dropServer.getStats().dataTransmittedCount})`
      );
    } finally {
      dropServer.server.close();
    }

    // -------------------------------------------------------------------------
    // PART 3: SIP Fail-Closed Call Lifecycle & Provider Transaction Confirmation
    // -------------------------------------------------------------------------
    console.log('\n[Part 3] Testing SIP Fail-Closed Lifecycle & Provider Transaction Confirmation...');

    const pbxServer = startMockSipPbxServer({ expectedUser: 'egypt_trunk_01', expectedPass: 'PbxSecret#2026' });
    await new Promise<void>((r) => pbxServer.listen(0, '127.0.0.1', r));
    const pbxPort = (pbxServer.address() as net.AddressInfo).port;

    try {
      const badSip = new SipTelephonyAdapter({
        sipServerUri: `sip:127.0.0.1:${pbxPort}`,
        sipUsername: 'egypt_trunk_01',
        sipPassword: 'WRONG',
        allowSimulation: false,
      });
      assert((await badSip.fetchHealthStatus()).state === 'FAILED', 'SIP REGISTER rejected (403) -> FAILED');

      const goodSip = new SipTelephonyAdapter({
        sipServerUri: `sip:127.0.0.1:${pbxPort}`,
        sipUsername: 'egypt_trunk_01',
        sipPassword: 'PbxSecret#2026',
        allowSimulation: false,
      });
      assert((await goodSip.fetchHealthStatus()).state === 'REGISTERED', 'SIP REGISTER Digest MD5 200 OK -> REGISTERED');

      const sipWebhookSecret = 'sip_pbx_callback_hmac_secret_2026';
      await fetch(`${baseUrl}/integrations/channels/chan-voice/config`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          sipServerUri: `sip:127.0.0.1:${pbxPort}`,
          sipUsername: 'egypt_trunk_01',
          sipPassword: 'PbxSecret#2026',
          webhookSecret: sipWebhookSecret,
        }),
      });

      // Live /calls/dial MUST fail closed with 501 LIVE_SIP_INVITE_NOT_IMPLEMENTED
      const liveDialRes = await fetch(`${baseUrl}/calls/dial`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ phoneNumber: '01018108979' }),
      });
      const liveDialJson: any = await liveDialRes.json();
      assert(
        liveDialRes.status === 501 && liveDialJson.error?.code === 'LIVE_SIP_INVITE_NOT_IMPLEMENTED',
        `Live POST /calls/dial fails closed -> HTTP 501 LIVE_SIP_INVITE_NOT_IMPLEMENTED (got ${liveDialRes.status})`
      );

      // Unrelated call without pending provider transaction -> /webhooks/sip/call-confirm rejects 409
      const simDialRes = await fetch(`${baseUrl}/calls/dial`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ phoneNumber: '01018108979', simulate: true }),
      });
      const simCallId = ((await simDialRes.json()) as any).data?.id;
      const forgedConfirmRes = await fetch(`${baseUrl}/calls/${simCallId}/confirm`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ providerSessionId: 'forged' }),
      });
      assert(forgedConfirmRes.status === 403, 'User with call.make cannot forge /calls/:id/confirm (403)');

      const unholdBypassRes = await fetch(`${baseUrl}/calls/${simCallId}/control`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ action: 'unhold' }),
      });
      assert(
        unholdBypassRes.status === 409,
        `POST /calls/:id/control action=unhold on ringing call rejected -> HTTP 409 (got ${unholdBypassRes.status})`
      );

      const pendingCallId = crypto.randomUUID();
      db.calls.set(pendingCallId, {
        id: pendingCallId,
        organizationId: DEMO_ORG_ID,
        customerId: 'cust-1',
        customerName: 'عميل SIP',
        agentId: 'usr-admin-01',
        direction: 'outbound',
        status: 'ringing',
        callerNumber: '+20220000000',
        calleeNumber: '01018108979',
        durationSeconds: 0,
        disposition: 'awaiting_provider_confirmation',
        providerTransactionId: 'sip-tx-valid-001',
        startedAt: new Date().toISOString(),
      });

      const confirmPayload = JSON.stringify({
        callId: pendingCallId,
        providerSessionId: 'pbx-call-sess-991122',
        eventId: 'sip-evt-001',
      });
      const validSipSig = `sha256=${crypto.createHmac('sha256', sipWebhookSecret).update(confirmPayload).digest('hex')}`;

      const badCallback = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': 'sha256=bad' },
        body: confirmPayload,
      });
      assert(badCallback.status === 401, 'Invalid SIP callback signature rejected (401)');

      const goodCallback = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': validSipSig },
        body: confirmPayload,
      });
      const goodCallbackJson: any = await goodCallback.json();
      assert(
        goodCallback.status === 200 &&
          goodCallbackJson.data?.status === 'in_progress' &&
          goodCallbackJson.data?.disposition === 'provider_confirmed',
        'Valid signed callback for persisted pending provider transaction confirmed call -> in_progress/provider_confirmed'
      );

      const replayCallback = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': validSipSig },
        body: confirmPayload,
      });
      assert(replayCallback.status === 409, 'Replayed SIP callback rejected (409)');
    } finally {
      pbxServer.close();
    }
  } finally {
    httpServer.close();
    setIdempotencyFilePathForTesting(null);
    db.setPersistFilePathForTesting(prevDisk);
    try {
      fs.rmSync(tempDiskDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 EXTERNAL INTEGRATION SECURITY RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[FATAL EXTERNAL SECURITY TEST ERROR]', err);
  process.exit(1);
});
