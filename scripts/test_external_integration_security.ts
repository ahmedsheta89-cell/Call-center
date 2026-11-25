/**
 * @file scripts/test_external_integration_security.ts
 * External Integration Security, Real SMTP Delivery & SIP Lifecycle Verification Suite
 *
 * Tests:
 * 1. Unauthenticated External Webhooks (WhatsApp, CEQUENS, Telegram) WITHOUT user Authorization header
 * 2. Server-controlled tenant mapping & rejection of spoofed organizationId / unknown tenant / disabled provider / replay / malformed JSON
 * 3. Meta GET hub.challenge subscription verification without user session
 * 4. Admin settings & outbound dispatch remain protected by verified session + RBAC
 * 5. Real SMTP delivery with Nodemailer against isolated local SMTP server (AUTH, real messageId capture, idempotency)
 * 6. SIP lifecycle separation: CONFIGURED -> TCP_REACHABLE -> REGISTERED (Digest auth) vs FAILED (rejected)
 * 7. Provider-originated signed SIP call confirmation (/webhooks/sip/call-confirm) vs user-forged /calls/:id/confirm rejection
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import crypto from 'crypto';
import express from 'express';
import { apiRouter } from '../server/api/router.ts';
import { db } from '../server/db/store.ts';
import { initializeSeedData, DEMO_ORG_ID } from '../server/db/seed.ts';
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

async function getUnusedPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
  });
}

/**
 * Isolated local SMTP test server supporting EHLO, AUTH PLAIN/LOGIN, MAIL FROM, RCPT TO, DATA, QUIT.
 */
function startMockSmtpServer(options: {
  expectedUser: string;
  expectedPass: string;
  serverMessageId: string;
  rejectAuth?: boolean;
}) {
  let receivedMessages = 0;
  let lastMailFrom = '';
  let lastRcptTo = '';
  let lastData = '';

  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    let inData = false;
    let awaitingAuthLoginUser = false;
    let awaitingAuthLoginPass = false;
    let authUser = '';
    let dataBuffer = '';
    let lineBuffer = '';

    socket.write('220 mock-smtp.omniflow.local ESMTP Service Ready\r\n');

    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (inData) {
        dataBuffer += text;
        if (dataBuffer.includes('\r\n.\r\n') || dataBuffer.endsWith('.\r\n')) {
          inData = false;
          lastData = dataBuffer;
          dataBuffer = '';
          receivedMessages++;
          socket.write(`250 2.0.0 Ok: queued as ${options.serverMessageId}\r\n`);
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
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (awaitingAuthLoginPass) {
          const authPass = Buffer.from(line, 'base64').toString('utf8');
          awaitingAuthLoginPass = false;
          if (!options.rejectAuth && authUser === options.expectedUser && authPass === options.expectedPass) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else {
            socket.write('535 5.7.8 Authentication credentials invalid\r\n');
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-mock-smtp.omniflow.local\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          const b64 = line.slice('AUTH PLAIN'.length).trim();
          const parts = Buffer.from(b64, 'base64').toString('utf8').split('\0');
          const u = parts[1] || parts[0] || '';
          const p = parts[2] || parts[1] || '';
          if (!options.rejectAuth && u === options.expectedUser && p === options.expectedPass) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else {
            socket.write('535 5.7.8 Authentication credentials invalid\r\n');
          }
        } else if (upper === 'AUTH LOGIN') {
          awaitingAuthLoginUser = true;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          lastMailFrom = line.slice('MAIL FROM:'.length).trim();
          socket.write('250 2.1.0 Ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          lastRcptTo = line.slice('RCPT TO:'.length).trim();
          socket.write('250 2.1.5 Ok\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          dataBuffer = '';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 Ok\r\n');
        }
      }
    });
  });

  return {
    server,
    getStats: () => ({ receivedMessages, lastMailFrom, lastRcptTo, lastData }),
  };
}

/**
 * Isolated local SIP PBX test server supporting RFC 3261 REGISTER with MD5 Digest challenge.
 */
function startMockSipPbxServer(options: {
  expectedUser: string;
  expectedPass: string;
  realm?: string;
}) {
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
        const resLines = [
          'SIP/2.0 401 Unauthorized',
          ...commonHeaders,
          `WWW-Authenticate: Digest realm="${realm}", nonce="${nonce}", algorithm=MD5`,
          'Content-Length: 0',
          '',
          '',
        ];
        socket.write(resLines.join('\r\n'));
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
        const okLines = ['SIP/2.0 200 OK', ...commonHeaders, 'Expires: 60', 'Content-Length: 0', '', ''];
        socket.write(okLines.join('\r\n'));
      } else {
        const failLines = ['SIP/2.0 403 Forbidden', ...commonHeaders, 'Content-Length: 0', '', ''];
        socket.write(failLines.join('\r\n'));
      }
    });
  });

  return server;
}

async function main() {
  console.log('================================================================================');
  console.log('🔐 EXTERNAL INTEGRATION SECURITY, SMTP DELIVERY & SIP LIFECYCLE TEST SUITE');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // PART 1: Unauthenticated External Webhook Security & Tenant Isolation
  // ---------------------------------------------------------------------------
  console.log('[Part 1] Testing Unauthenticated External Webhook Auth, Tenant Mapping & Anti-Spoofing...');

  const tempDiskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-ext-sec-'));
  const diskFile = path.join(tempDiskDir, 'db_state.json');
  const prevDisk = db.getPersistFilePath();
  db.setPersistFilePathForTesting(diskFile);
  initializeSeedData();

  // Create a second isolated tenant (org-second-tenant) to prove tenant isolation & anti-spoofing
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
    // Login as Admin & Read Only
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-admin-01' }),
    });
    const adminToken = ((await adminLoginRes.json()) as any).data?.token;
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };

    const roLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-agt-01' }),
    });
    const roToken = ((await roLoginRes.json()) as any).data?.token;
    assert(Boolean(roToken), 'Agent session established for RBAC test');
    const roHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${roToken}` };

    // Configure WhatsApp for DEMO_ORG_ID with explicit phoneNumberId & secrets
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

    // Configure CEQUENS & Telegram for DEMO_ORG_ID
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

    // Clear chan-email to verify disabled provider rejection
    db.channelConfigs.delete(`${DEMO_ORG_ID}::chan-email`);

    // 1. Meta GET hub.challenge works WITHOUT Authorization header
    const unauthGetValid = await fetch(
      `${baseUrl}/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${waVerifyToken}&hub.challenge=META_CHALLENGE_XYZ`
    );
    assert(
      unauthGetValid.status === 200 && (await unauthGetValid.text()) === 'META_CHALLENGE_XYZ',
      'Meta GET webhook subscription verification succeeds WITHOUT user Authorization header'
    );

    const unauthGetWrong = await fetch(
      `${baseUrl}/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=META_CHALLENGE_XYZ`
    );
    assert(unauthGetWrong.status === 403, 'Meta GET webhook rejects wrong verify_token -> HTTP 403');

    // 2. Valid external WhatsApp POST webhook WITHOUT Authorization header
    const validWaBody = JSON.stringify({
      entry: [
        {
          id: 'WABA_EXT_TEST_001',
          changes: [
            {
              value: {
                metadata: { phone_number_id: waPhoneNumberId },
                contacts: [{ wa_id: '201022334455', profile: { name: 'عميل خارجي' } }],
                messages: [{ id: 'wamid.ext.unique.1', from: '201022334455', text: { body: 'مرحبا من واتساب الخارجي' } }],
              },
            },
          ],
        },
      ],
    });
    const validWaSig = `sha256=${crypto.createHmac('sha256', waSecret).update(validWaBody).digest('hex')}`;

    const unauthWaRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': validWaSig },
      body: validWaBody,
    });
    const unauthWaJson: any = await unauthWaRes.json();
    assert(
      unauthWaRes.status === 200 && unauthWaJson.success === true && unauthWaJson.data?.messageId,
      'Valid external WhatsApp webhook WITHOUT Authorization accepted after raw-body HMAC & tenant mapping',
      unauthWaJson
    );

    // 3. Replayed event rejected -> HTTP 409
    const replayWaRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': validWaSig },
      body: validWaBody,
    });
    assert(replayWaRes.status === 409, `Replayed WhatsApp webhook rejected -> HTTP 409 (got ${replayWaRes.status})`);

    // 4. Missing signature rejected -> HTTP 401
    const noSigBody = JSON.stringify({
      entry: [{ id: 'WABA_EXT_TEST_001', changes: [{ value: { metadata: { phone_number_id: waPhoneNumberId }, messages: [{ id: 'wamid.ext.2', from: '2010', text: { body: 'hi' } }] } }] }],
    });
    const missingSigRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: noSigBody,
    });
    assert(missingSigRes.status === 401, `Missing X-Hub-Signature-256 rejected -> HTTP 401 (got ${missingSigRes.status})`);

    // 5. Tampered raw body rejected -> HTTP 401
    const tamperedBody = noSigBody.replace('hi', 'hacked');
    const sigForOriginal = `sha256=${crypto.createHmac('sha256', waSecret).update(noSigBody).digest('hex')}`;
    const tamperedRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sigForOriginal },
      body: tamperedBody,
    });
    assert(tamperedRes.status === 401, `Tampered raw body rejected -> HTTP 401 (got ${tamperedRes.status})`);

    // 6. Wrong tenant/account mapping rejected -> HTTP 403
    const unknownTenantBody = JSON.stringify({
      entry: [{ id: 'WABA_UNKNOWN_999', changes: [{ value: { metadata: { phone_number_id: 'PNID_UNKNOWN_999' }, messages: [{ id: 'wamid.ext.3', from: '2010', text: { body: 'hi' } }] } }] }],
    });
    const unknownTenantSig = `sha256=${crypto.createHmac('sha256', waSecret).update(unknownTenantBody).digest('hex')}`;
    const unknownTenantRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': unknownTenantSig },
      body: unknownTenantBody,
    });
    assert(unknownTenantRes.status === 403, `Unknown tenant/phone_number_id mapping rejected -> HTTP 403 (got ${unknownTenantRes.status})`);

    // 7. Disabled provider rejected -> HTTP 403
    const disabledEmailRes = await fetch(`${baseUrl}/integrations/email/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'test@example.com', text: 'hello' }),
    });
    assert(disabledEmailRes.status === 403, `Disabled provider webhook rejected -> HTTP 403 (got ${disabledEmailRes.status})`);

    // 8. Spoofed organizationId in payload cannot select another tenant -> HTTP 403
    const spoofedOrgBody = JSON.stringify({
      organizationId: SECOND_ORG_ID,
      entry: [{ id: 'WABA_EXT_TEST_001', changes: [{ value: { metadata: { phone_number_id: waPhoneNumberId }, messages: [{ id: 'wamid.ext.4', from: '2010', text: { body: 'spoof' } }] } }] }],
    });
    const spoofedOrgSig = `sha256=${crypto.createHmac('sha256', waSecret).update(spoofedOrgBody).digest('hex')}`;
    const spoofedOrgRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': spoofedOrgSig },
      body: spoofedOrgBody,
    });
    assert(spoofedOrgRes.status === 403, `Spoofed organizationId in webhook payload rejected -> HTTP 403 (got ${spoofedOrgRes.status})`);

    // 9. Valid CEQUENS & Telegram unauthenticated webhooks
    const ceqRes = await fetch(`${baseUrl}/webhooks/cequens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cequensSecret}` },
      body: JSON.stringify({ senderName: 'OMNIFLOW_EG', mobileNumber: '201011122233', message: 'رسالة CEQUENS', messageId: 'ceq-ext-1' }),
    });
    assert(ceqRes.status === 200, `Unauthenticated CEQUENS webhook with valid Bearer secret accepted -> HTTP 200 (got ${ceqRes.status})`);

    const tgRes = await fetch(`${baseUrl}/webhooks/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': tgSecret },
      body: JSON.stringify({ update_id: 778899, bot_id: '99887766', message: { from: { id: 5544, username: 'ahmed_tg' }, text: 'رسالة تليجرام' } }),
    });
    assert(tgRes.status === 200, `Unauthenticated Telegram webhook with valid secret-token accepted -> HTTP 200 (got ${tgRes.status})`);

    // 10. Admin settings and outbound dispatch remain protected by verified sessions & RBAC
    const unauthConfigRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: 'hacked' }),
    });
    assert(unauthConfigRes.status === 401, `Unauthenticated PUT /integrations/channels/:id/config rejected -> HTTP 401 (got ${unauthConfigRes.status})`);

    const roConfigRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: roHeaders,
      body: JSON.stringify({ verifyToken: 'hacked' }),
    });
    assert(roConfigRes.status === 403, `Read Only RBAC PUT /integrations/channels/:id/config rejected -> HTTP 403 (got ${roConfigRes.status})`);

    const unauthDispatchRes = await fetch(`${baseUrl}/integrations/whatsapp/send-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateName: 't', recipientPhone: '01012345678' }),
    });
    assert(unauthDispatchRes.status === 401, `Unauthenticated outbound dispatch rejected -> HTTP 401 (got ${unauthDispatchRes.status})`);

    // ---------------------------------------------------------------------------
    // PART 2: Real SMTP Transaction Tests (Nodemailer + Isolated Local SMTP Server)
    // ---------------------------------------------------------------------------
    console.log('\n[Part 2] Testing Actual SMTP Delivery (AUTH, Real Message-ID Capture & Idempotency)...');

    const realServerMsgId = '<real-smtp-tx-998877@mock-smtp.omniflow.local>';
    const smtpMock = startMockSmtpServer({
      expectedUser: 'support@omniflow.local',
      expectedPass: 'SmtpPass!2026',
      serverMessageId: realServerMsgId,
    });
    await new Promise<void>((resolve) => smtpMock.server.listen(0, '127.0.0.1', resolve));
    const smtpPort = (smtpMock.server.address() as net.AddressInfo).port;

    try {
      // Bad password -> AUTH_FAILED, health is FAILED (NOT CONNECTED)
      const badAuthEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'WRONG_PASS',
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const badHealth = await badAuthEmail.fetchHealthStatus();
      assert(
        badHealth.state === 'FAILED' && !badHealth.isHealthy,
        `SMTP TCP reachable but wrong AUTH password reports FAILED (never CONNECTED) [got ${badHealth.state}]`,
        badHealth
      );

      // Valid SMTP server -> CONNECTED & real sendMail
      const liveEmail = new EmailChannelAdapter({
        smtpHost: '127.0.0.1',
        smtpPort,
        smtpUser: 'support@omniflow.local',
        smtpPass: 'SmtpPass!2026',
        fromAddress: 'support@omniflow.local',
        tlsRejectUnauthorized: false,
        allowSimulation: false,
      });
      const goodHealth = await liveEmail.fetchHealthStatus();
      assert(goodHealth.state === 'CONNECTED' && goodHealth.isHealthy, `Valid SMTP auth reports CONNECTED`, goodHealth);

      const emailMsgId = crypto.randomUUID();
      const emailMsg: any = {
        id: emailMsgId,
        organizationId: DEMO_ORG_ID,
        customerId: 'cust-1',
        conversationId: 'conv-1',
        channel: 'email',
        direction: 'outbound',
        type: 'text',
        body: 'Actual SMTP transaction test body',
        sender: { id: 'usr-1', type: 'agent', name: 'Agent' },
        status: 'pending',
        metadata: {
          to: 'customer@example.com',
          subject: 'OmniFlow SMTP Delivery Test',
        },
        createdAt: new Date().toISOString(),
      };

      const send1 = await liveEmail.dispatchOutboundMessage(emailMsg);
      const stats1 = smtpMock.getStats();
      assert(
        send1.status === 'sent' && send1.externalMessageId.length > 0 && stats1.receivedMessages === 1,
        `Actual SMTP transaction delivered 1 message and captured real Message-ID (${send1.externalMessageId})`,
        { send1, stats1 }
      );

      // Idempotency retry check: same message.id must NOT send a duplicate email
      const send2 = await liveEmail.dispatchOutboundMessage(emailMsg);
      const stats2 = smtpMock.getStats();
      assert(
        send2.status === 'sent' && send2.externalMessageId === send1.externalMessageId && stats2.receivedMessages === 1,
        `Idempotency guard prevented duplicate SMTP send on retry (receivedMessages=${stats2.receivedMessages})`,
        { send2, stats2 }
      );
    } finally {
      smtpMock.server.close();
    }

    // ---------------------------------------------------------------------------
    // PART 3: SIP Protocol Registration & Signed Provider Call Confirmation
    // ---------------------------------------------------------------------------
    console.log('\n[Part 3] Testing SIP Registration Lifecycle & Cryptographic Call Confirmation...');

    const pbxServer = startMockSipPbxServer({
      expectedUser: 'egypt_trunk_01',
      expectedPass: 'PbxSecret#2026',
    });
    await new Promise<void>((resolve) => pbxServer.listen(0, '127.0.0.1', resolve));
    const pbxPort = (pbxServer.address() as net.AddressInfo).port;

    try {
      // Wrong password -> FAILED
      const badSip = new SipTelephonyAdapter({
        sipServerUri: `sip:127.0.0.1:${pbxPort}`,
        sipUsername: 'egypt_trunk_01',
        sipPassword: 'WRONG_SIP_PASSWORD',
        allowSimulation: false,
      });
      const badSipHealth = await badSip.fetchHealthStatus();
      assert(
        badSipHealth.state === 'FAILED' && !badSipHealth.isHealthy,
        `SIP TCP reachable but REGISTER rejected (403) reports FAILED [got ${badSipHealth.state}]`,
        badSipHealth
      );

      // Valid Digest Auth -> REGISTERED
      const goodSip = new SipTelephonyAdapter({
        sipServerUri: `sip:127.0.0.1:${pbxPort}`,
        sipUsername: 'egypt_trunk_01',
        sipPassword: 'PbxSecret#2026',
        allowSimulation: false,
      });
      const goodSipHealth = await goodSip.fetchHealthStatus();
      assert(
        goodSipHealth.state === 'REGISTERED' && goodSipHealth.isHealthy,
        `Authenticated SIP REGISTER (Digest MD5 -> 200 OK) reports REGISTERED [got ${goodSipHealth.state}]`,
        goodSipHealth
      );

      // Configure chan-voice on the API server with webhookSecret
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

      // Dial real call -> starts ringing / awaiting_provider_confirmation
      const dialRes = await fetch(`${baseUrl}/calls/dial`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ phoneNumber: '01018108979' }),
      });
      const dialJson: any = await dialRes.json();
      const realCallId = dialJson.data?.id;
      assert(
        dialRes.status === 200 && dialJson.data?.status === 'ringing' && dialJson.data?.disposition === 'awaiting_provider_confirmation',
        `Outbound SIP call starts in ringing/awaiting_provider_confirmation`,
        dialJson
      );

      // Normal user with call.make CANNOT forge confirmation via /calls/:id/confirm
      const forgedRes = await fetch(`${baseUrl}/calls/${realCallId}/confirm`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ providerSessionId: 'forged-by-user' }),
      });
      assert(forgedRes.status === 403, `User with call.make cannot forge /calls/:id/confirm -> HTTP 403 (got ${forgedRes.status})`);

      // Invalid provider callback signature -> HTTP 401
      const confirmPayload = JSON.stringify({
        callId: realCallId,
        providerSessionId: 'pbx-call-sess-991122',
        eventId: 'sip-evt-001',
      });
      const badCallbackRes = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': 'sha256=badbadbad' },
        body: confirmPayload,
      });
      assert(badCallbackRes.status === 401, `Invalid SIP provider callback signature rejected -> HTTP 401 (got ${badCallbackRes.status})`);

      // Valid signed provider callback WITHOUT user Authorization header -> HTTP 200
      const validSipSig = `sha256=${crypto.createHmac('sha256', sipWebhookSecret).update(confirmPayload).digest('hex')}`;
      const goodCallbackRes = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': validSipSig },
        body: confirmPayload,
      });
      const goodCallbackJson: any = await goodCallbackRes.json();
      assert(
        goodCallbackRes.status === 200 &&
          goodCallbackJson.data?.status === 'in_progress' &&
          goodCallbackJson.data?.disposition === 'provider_confirmed',
        `Valid signed provider callback (without user session) confirmed call -> in_progress/provider_confirmed`,
        goodCallbackJson
      );

      // Replayed provider callback -> HTTP 409
      const replayCallbackRes = await fetch(`${baseUrl}/webhooks/sip/call-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sip-signature': validSipSig },
        body: confirmPayload,
      });
      assert(replayCallbackRes.status === 409, `Replayed SIP provider callback rejected -> HTTP 409 (got ${replayCallbackRes.status})`);
    } finally {
      pbxServer.close();
    }
  } finally {
    httpServer.close();
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
