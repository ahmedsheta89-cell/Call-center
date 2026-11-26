/**
 * @file scripts/test_crash_consistent_idempotency.ts
 * Comprehensive Crash-Consistency, Fault-Injection & Recovery Verification Suite
 * Covers Durable Idempotency State Machine, Webhook Crash Boundaries, and SMTP Pre-Send Intent Recovery.
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
  reserveDurableIdempotencyKeys,
  transitionDurableIdempotencyState,
  lookupDurableIdempotencyKey,
  reconcileDurableIdempotencyOnStartup,
  simulateProcessRestartForTesting,
} from '../server/core/durableIdempotency.ts';
import { EmailChannelAdapter } from '../server/modules/integrations/adapters/emailBridge.ts';

process.env.NODE_ENV = 'test';
process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';
process.env.SESSION_SECRET = 'crash-consistency-test-secret-key-32-chars-minimum';
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
  const keyPath = path.join(tempDir, 'crash-smtp-key.pem');
  const certPath = path.join(tempDir, 'crash-smtp-cert.pem');
  const opensslBin = fs.existsSync('C:\\Program Files\\Git\\usr\\bin\\openssl.exe')
    ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
    : 'openssl';
  execFileSync(
    opensslBin,
    ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1'],
    { stdio: 'ignore' }
  );
  return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8') };
}

function startStartTlsSmtpServer(expectedUser: string, expectedPass: string, tlsCert: { key: string; cert: string }) {
  let receivedMessages = 0;
  const server = net.createServer((rawSocket) => {
    rawSocket.on('error', () => {});
    let activeSocket: net.Socket | tls.TLSSocket = rawSocket;
    let tlsUpgraded = false;
    let inData = false;
    let dataBuffer = '';
    let lineBuffer = '';
    const write = (m: string) => {
      if (!activeSocket.destroyed) activeSocket.write(m);
    };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (inData) {
        dataBuffer += text;
        if (dataBuffer.includes('\r\n.\r\n') || dataBuffer.endsWith('.\r\n')) {
          inData = false;
          dataBuffer = '';
          receivedMessages++;
          write(`250 2.0.0 Ok: queued as <smtp-crash-tx-${receivedMessages}@mock.local>\r\n`);
        }
        return;
      }
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const u = line.toUpperCase();
        if (u.startsWith('EHLO')) {
          write(tlsUpgraded ? '250-mock\r\n250-AUTH PLAIN\r\n250 OK\r\n' : '250-mock\r\n250-STARTTLS\r\n250 OK\r\n');
        } else if (u === 'STARTTLS' && !tlsUpgraded) {
          write('220 2.0.0 Ready\r\n');
          tlsUpgraded = true;
          rawSocket.removeAllListeners('data');
          const ts = new tls.TLSSocket(rawSocket, { isServer: true, key: tlsCert.key, cert: tlsCert.cert });
          ts.on('error', () => {});
          ts.on('data', onData);
          activeSocket = ts;
          break;
        } else if (u.startsWith('AUTH PLAIN')) {
          const parts = Buffer.from(line.slice(10).trim(), 'base64').toString('utf8').split('\0');
          if ((parts[1] || '') === expectedUser && (parts[2] || '') === expectedPass) write('235 2.7.0 OK\r\n');
          else write('535 5.7.8 Auth failed\r\n');
        } else if (u.startsWith('MAIL FROM:') || u.startsWith('RCPT TO:')) {
          write('250 OK\r\n');
        } else if (u === 'DATA') {
          inData = true;
          dataBuffer = '';
          write('354 Start mail input\r\n');
        } else if (u === 'QUIT') {
          write('221 Bye\r\n');
          activeSocket.end();
        } else {
          write('250 OK\r\n');
        }
      }
    };
    rawSocket.on('data', onData);
    write('220 mock-starttls Ready\r\n');
  });
  return { server, getReceivedCount: () => receivedMessages };
}

async function main() {
  console.log('================================================================================');
  console.log('💥 CRASH-CONSISTENT DURABLE IDEMPOTENCY, WEBHOOK & SMTP RECOVERY TEST SUITE');
  console.log('================================================================================\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-crash-test-'));
  const diskFile = path.join(tempDir, 'db_state.json');
  const prevDisk = db.getPersistFilePath();
  db.setPersistFilePathForTesting(diskFile);
  setIdempotencyFilePathForTesting(null);
  initializeSeedData();

  const waSecret = 'crash_test_wa_secret_999';
  const waPhoneNumberId = 'PNID_CRASH_001';
  db.setChannelConfig(DEMO_ORG_ID, 'chan-whatsapp', {
    phoneNumberId: waPhoneNumberId,
    wabaId: 'WABA_CRASH_001',
    apiToken: 'EAAG_CRASH_TOKEN',
    appSecret: waSecret,
    verifyToken: 'crash_verify_token',
  });
  db.saveToDisk();

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

  const makeWaBody = (id: string, text: string) =>
    JSON.stringify({
      entry: [
        {
          id: 'WABA_CRASH_001',
          changes: [{ value: { metadata: { phone_number_id: waPhoneNumberId }, contacts: [{ wa_id: '201099887766', profile: { name: 'Crash Test' } }], messages: [{ id, from: '201099887766', text: { body: text } }] } }],
        },
      ],
    });
  const signWa = (body: string) => `sha256=${crypto.createHmac('sha256', waSecret).update(body).digest('hex')}`;

  try {
    // -------------------------------------------------------------------------
    // PART 1: Durable Idempotency State Machine Unit Invariants
    // -------------------------------------------------------------------------
    console.log('[Part 1] Verifying Durable Reservation Persistence, TTL Non-Expiry & Schema Validation...');

    const unitKey = `unit:${DEMO_ORG_ID}:test:1`;
    const prevTtl = process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS;
    process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS = '30';
    const resUnit = reserveDurableIdempotencyKeys([unitKey], { kind: 'smtp', txId: 'tx-unit-1' });
    assert(resUnit.ok, 'Unit reservation succeeded and persisted RESERVED to disk');

    const rawDisk = JSON.parse(fs.readFileSync(getIdempotencyFilePath(), 'utf8'));
    assert(rawDisk.entries[unitKey]?.state === 'RESERVED', 'RESERVED state is durably on disk before side effects');

    // Wait longer than TTL (30ms) while in SENDING state -> MUST NOT expire!
    transitionDurableIdempotencyState([unitKey], 'SENDING');
    await new Promise((r) => setTimeout(r, 60));
    const afterTtlWhileSending = lookupDurableIdempotencyKey(unitKey);
    assert(
      afterTtlWhileSending !== null && afterTtlWhileSending.state === 'SENDING',
      'Unresolved SENDING reservation NEVER expires merely because TTL elapsed'
    );

    // Simulate process restart with unresolved SENDING -> reconciles to RECONCILIATION_REQUIRED
    simulateProcessRestartForTesting();
    const recRes = reconcileDurableIdempotencyOnStartup();
    const afterRestart = lookupDurableIdempotencyKey(unitKey);
    assert(
      recRes.ok && afterRestart?.state === 'RECONCILIATION_REQUIRED',
      `Restart with unresolved SMTP SENDING transitions to RECONCILIATION_REQUIRED (got ${afterRestart?.state})`
    );

    if (prevTtl === undefined) delete process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS;
    else process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS = prevTtl;

    // SIGKILL-style webhook reservation with NO committed txId in DB -> reconciles to FAILED_SAFE_TO_RETRY
    const sigkillWhKey = `wh:${DEMO_ORG_ID}:whatsapp:${waPhoneNumberId}:evt:wamid.sigkill.1`;
    reserveDurableIdempotencyKeys([sigkillWhKey], { kind: 'webhook', txId: 'tx-sigkill-never-saved' });
    transitionDurableIdempotencyState([sigkillWhKey], 'PROCESSING');
    simulateProcessRestartForTesting();
    reconcileDurableIdempotencyOnStartup();
    const sigkillAfterRestart = lookupDurableIdempotencyKey(sigkillWhKey);
    assert(
      sigkillAfterRestart?.state === 'FAILED_SAFE_TO_RETRY',
      `SIGKILL-style unresolved webhook PROCESSING without DB txId reconciles to FAILED_SAFE_TO_RETRY (got ${sigkillAfterRestart?.state})`
    );

    // -------------------------------------------------------------------------
    // PART 2: Webhook Crash Boundaries (No Lost Messages, No Duplicate Messages)
    // -------------------------------------------------------------------------
    console.log('\n[Part 2] Testing Webhook Crash Recovery Across Every Persistence Boundary...');

    const countMsgsWithBody = (needle: string) =>
      Array.from(db.messages.values()).filter((m) => m.body.includes(needle)).length;

    const crashBoundaries: Array<{ fault: string; id: string; expectPersistedBeforeCrash: boolean }> = [
      { fault: 'CRASH_AFTER_RESERVE', id: 'wamid.crash.1', expectPersistedBeforeCrash: false },
      { fault: 'CRASH_AFTER_MEMORY_MUTATE', id: 'wamid.crash.2', expectPersistedBeforeCrash: false },
      { fault: 'CRASH_BEFORE_DB_SAVE', id: 'wamid.crash.3', expectPersistedBeforeCrash: false },
      { fault: 'CRASH_AFTER_DB_SAVE', id: 'wamid.crash.4', expectPersistedBeforeCrash: true },
      { fault: 'FAIL_IDEMPOTENCY_COMMIT', id: 'wamid.crash.5', expectPersistedBeforeCrash: true },
    ];

    for (const c of crashBoundaries) {
      const marker = `marker-${c.id}`;
      const body = makeWaBody(c.id, marker);
      const sig = signWa(body);

      process.env.OMNIFLOW_TEST_FAULT_INJECT = c.fault;
      const crashRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
        body,
      });
      delete process.env.OMNIFLOW_TEST_FAULT_INJECT;

      assert(crashRes.status === 503, `${c.fault}: returned HTTP 503 (never 200 on interrupted persistence)`);

      // Simulate cold restart: reload DB from disk + reconcile durable idempotency
      db.loadFromDisk();
      simulateProcessRestartForTesting();
      const rec = reconcileDurableIdempotencyOnStartup();
      assert(rec.ok, `${c.fault}: startup reconciliation succeeded`);

      // Retry after restart
      const retryRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
        body,
      });

      const finalCount = countMsgsWithBody(marker);
      if (c.expectPersistedBeforeCrash) {
        assert(
          retryRes.status === 409 && finalCount === 1,
          `${c.fault}: DB already committed -> retry rejected (409) and total messages=${finalCount} (ZERO duplicates)`
        );
      } else {
        assert(
          retryRes.status === 200 && finalCount === 1,
          `${c.fault}: DB not yet committed -> retry succeeded (200) and total messages=${finalCount} (ZERO lost messages)`
        );
      }
    }

    // -------------------------------------------------------------------------
    // PART 3: SMTP Pre-Send Intent & Crash Recovery
    // -------------------------------------------------------------------------
    console.log('\n[Part 3] Testing SMTP Pre-Send Intent Persistence & Fault-Injection Recovery...');

    const tlsCert = generateTestTlsCert(tempDir);
    const smtpMock = startStartTlsSmtpServer('support@omniflow.local', 'SmtpPass!2026', tlsCert);
    await new Promise<void>((r) => smtpMock.server.listen(0, '127.0.0.1', r));
    const smtpPort = (smtpMock.server.address() as net.AddressInfo).port;

    try {
      const makeEmailAdapter = () =>
        new EmailChannelAdapter({
          smtpHost: '127.0.0.1',
          smtpPort,
          smtpUser: 'support@omniflow.local',
          smtpPass: 'SmtpPass!2026',
          fromAddress: 'support@omniflow.local',
          tlsRejectUnauthorized: false,
          allowSimulation: false,
        });

      // 3a. Crash right after RESERVED (before SENDING/sendMail) -> safe to retry on restart -> delivers 1
      const msg1: any = {
        id: crypto.randomUUID(),
        organizationId: DEMO_ORG_ID,
        customerId: 'cust-1',
        conversationId: 'conv-1',
        channel: 'email',
        direction: 'outbound',
        type: 'text',
        body: 'SMTP crash after reserve',
        sender: { id: 'usr-1', type: 'agent', name: 'Agent' },
        status: 'pending',
        metadata: { to: 'c1@example.com', subject: 'Crash Reserve' },
        createdAt: new Date().toISOString(),
      };
      process.env.OMNIFLOW_TEST_FAULT_INJECT = 'SMTP_CRASH_AFTER_RESERVE';
      let threwReserve = false;
      try {
        await makeEmailAdapter().dispatchOutboundMessage(msg1);
      } catch {
        threwReserve = true;
      }
      delete process.env.OMNIFLOW_TEST_FAULT_INJECT;
      assert(threwReserve && smtpMock.getReceivedCount() === 0, 'SMTP_CRASH_AFTER_RESERVE aborted before SMTP connection');

      simulateProcessRestartForTesting();
      reconcileDurableIdempotencyOnStartup();
      const sendAfterReserveCrash = await makeEmailAdapter().dispatchOutboundMessage(msg1);
      assert(
        sendAfterReserveCrash.status === 'sent' && smtpMock.getReceivedCount() === 1,
        `After restart, safe RESERVED intent retried cleanly -> 1 email delivered (count=${smtpMock.getReceivedCount()})`
      );

      // 3b. Crash after DATA -> AMBIGUOUS -> retry blocked
      const msg2: any = { ...msg1, id: crypto.randomUUID(), metadata: { to: 'c2@example.com', subject: 'Crash After DATA' } };
      process.env.OMNIFLOW_TEST_FAULT_INJECT = 'SMTP_CRASH_AFTER_DATA';
      const afterDataRes = await makeEmailAdapter().dispatchOutboundMessage(msg2);
      delete process.env.OMNIFLOW_TEST_FAULT_INJECT;
      simulateProcessRestartForTesting();
      reconcileDurableIdempotencyOnStartup();
      const retryAfterDataCrash = await makeEmailAdapter().dispatchOutboundMessage(msg2);
      assert(
        afterDataRes.status === 'failed' &&
          retryAfterDataCrash.status === 'failed' &&
          smtpMock.getReceivedCount() === 2,
        `SMTP_CRASH_AFTER_DATA blocked automatic duplicate resend after restart (count=${smtpMock.getReceivedCount()})`
      );

      // 3c. Relay accepted, commit write fails -> RECONCILIATION_REQUIRED -> automatic resend blocked
      const msg3: any = { ...msg1, id: crypto.randomUUID(), metadata: { to: 'c3@example.com', subject: 'Fail Commit' } };
      process.env.OMNIFLOW_TEST_FAULT_INJECT = 'SMTP_FAIL_COMMIT_AFTER_RELAY';
      const failCommitRes = await makeEmailAdapter().dispatchOutboundMessage(msg3);
      delete process.env.OMNIFLOW_TEST_FAULT_INJECT;
      simulateProcessRestartForTesting();
      reconcileDurableIdempotencyOnStartup();
      const retryFailCommit = await makeEmailAdapter().dispatchOutboundMessage(msg3);
      assert(
        failCommitRes.status === 'failed' &&
          failCommitRes.relayAccepted === true &&
          retryFailCommit.status === 'failed' &&
          smtpMock.getReceivedCount() === 3,
        `SMTP_FAIL_COMMIT_AFTER_RELAY retained RECONCILIATION_REQUIRED and blocked resend (count=${smtpMock.getReceivedCount()})`
      );
    } finally {
      smtpMock.server.close();
    }
  } finally {
    delete process.env.OMNIFLOW_TEST_FAULT_INJECT;
    httpServer.close();
    setIdempotencyFilePathForTesting(null);
    db.setPersistFilePathForTesting(prevDisk);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 CRASH-CONSISTENCY & RECOVERY RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[FATAL CRASH TEST ERROR]', err);
  process.exit(1);
});
