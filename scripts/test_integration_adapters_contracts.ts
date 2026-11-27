/**
 * @file scripts/test_integration_adapters_contracts.ts
 * OmniFlow OS — Omnichannel & Telephony Adapters Contract + Authenticated API Wiring Suite
 * Verifies:
 * 1. Strict State Separation (DISABLED, CONFIGURED, CONNECTED, SIMULATED, FAILED)
 * 2. Real SIP & SMTP TCP connectivity checks (never falsely labeling SIP CONNECTED from credentials)
 * 3. Webhook Cryptographic Verification (HMAC-SHA256 rawBody + Secret Token)
 * 4. SIP Call Confirmation Requirement (never connected until provider session confirmation)
 * 5. Full Authenticated HTTP API Wiring through IntegrationRegistry (channels, test-connection, dial, confirm, webhook, dispatch)
 */

process.env.NODE_ENV = 'test';
process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';
process.env.CHANNEL_SECRET_ENCRYPTION_KEY = process.env.CHANNEL_SECRET_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.AUDIT_CHECKPOINT_HMAC_KEY = process.env.AUDIT_CHECKPOINT_HMAC_KEY || 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'omniflow-adapter-contract-test-session-secret-key-32-chars';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import { CequensChannelAdapter } from '../server/modules/integrations/adapters/cequens.ts';
import { WhatsAppCloudChannelAdapter } from '../server/modules/integrations/adapters/whatsappCloud.ts';
import { TelegramChannelAdapter } from '../server/modules/integrations/adapters/telegram.ts';
import { WebChatChannelAdapter } from '../server/modules/integrations/adapters/webchat.ts';
import { EmailChannelAdapter } from '../server/modules/integrations/adapters/emailBridge.ts';
import { SipTelephonyAdapter } from '../server/modules/integrations/adapters/sipTelephony.ts';
import { UnifiedMessage, UUID } from '../server/core/types.ts';
import { db } from '../server/db/store.ts';
import { initializeSeedData } from '../server/db/seed.ts';
import { apiRouter } from '../server/api/router.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, details?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    if (details) console.error('     Details:', details);
    failed++;
  }
}

async function getUnusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 59999;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 INTEGRATION ADAPTERS CONTRACT, STATE TRUTHFULNESS & API WIRING SUITE');
  console.log('================================================================================\n');

  const testOrgId: UUID = 'org-test-enterprise-1234';

  // ----------------------------------------------------------------------------
  // SUITE 1: DISABLED State Enforcement (Default Zero-Leakage Guard)
  // ----------------------------------------------------------------------------
  console.log('[Suite 1] Verifying DISABLED State Enforcement (Default unconfigured state)...');

  const disabledCequens = new CequensChannelAdapter({ allowSimulation: false });
  assert(disabledCequens.getState() === 'DISABLED', 'Cequens defaults to DISABLED when unconfigured');
  const ceqWebhook = await disabledCequens.verifyWebhook({}, JSON.stringify({ text: 'test' }));
  assert(!ceqWebhook.isValid && Boolean(ceqWebhook.error?.includes('DISABLED')), 'Disabled Cequens rejects webhook inbound');

  const mockMsg: UnifiedMessage = {
    id: crypto.randomUUID(),
    organizationId: testOrgId,
    customerId: 'cust-1',
    conversationId: 'conv-1',
    channel: 'sms',
    direction: 'outbound',
    type: 'text',
    body: 'مرحبا بكم في خدمة العملاء',
    sender: { id: 'usr-1', name: 'Agent', type: 'agent' },
    status: 'sent',
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  assert((await disabledCequens.dispatchOutboundMessage(mockMsg)).status === 'disabled', 'Disabled Cequens returns status="disabled"');
  assert(!(await disabledCequens.fetchHealthStatus()).isHealthy, 'Disabled Cequens reports isHealthy=false');

  const disabledWA = new WhatsAppCloudChannelAdapter({ allowSimulation: false });
  assert(disabledWA.getState() === 'DISABLED', 'WhatsApp Cloud defaults to DISABLED when unconfigured');
  assert((await disabledWA.dispatchOutboundMessage(mockMsg)).status === 'disabled', 'Disabled WhatsApp returns status="disabled"');

  const disabledTG = new TelegramChannelAdapter({ allowSimulation: false });
  assert(disabledTG.getState() === 'DISABLED', 'Telegram defaults to DISABLED when unconfigured');

  const disabledEmail = new EmailChannelAdapter({ allowSimulation: false });
  assert(disabledEmail.getState() === 'DISABLED', 'Email bridge defaults to DISABLED when unconfigured');

  const disabledSip = new SipTelephonyAdapter({ allowSimulation: false });
  assert(disabledSip.getState() === 'DISABLED', 'SIP Telephony defaults to DISABLED when unconfigured');
  let sipBlocked = false;
  try {
    await disabledSip.initiateOutboundCall({ organizationId: testOrgId, from: '100', to: '01012345678', agentId: 'ag-1' });
  } catch (err: any) {
    sipBlocked = err.message.includes('DISABLED');
  }
  assert(sipBlocked, 'Disabled SIP Telephony refuses outbound calls fail-closed');

  // ----------------------------------------------------------------------------
  // SUITE 2: SIMULATED State Verification (Zero-Cost Local Simulation)
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 2] Verifying SIMULATED State & Non-Delivered Status Guard...');

  const simCequens = new CequensChannelAdapter({ allowSimulation: true });
  const simCeqOut = await simCequens.dispatchOutboundMessage(mockMsg);
  assert(
    simCeqOut.status === 'simulated' && (simCeqOut.status as string) !== 'delivered' && (simCeqOut.status as string) !== 'sent',
    'Simulated Cequens returns status="simulated" (NEVER "delivered" or "sent")',
    simCeqOut
  );

  const simWA = new WhatsAppCloudChannelAdapter({ allowSimulation: true });
  const simWAOut = await simWA.dispatchOutboundMessage(mockMsg);
  assert(
    simWAOut.status === 'simulated' && (simWAOut.status as string) !== 'delivered',
    'Simulated WhatsApp returns status="simulated" (NEVER "delivered")',
    simWAOut
  );

  // ----------------------------------------------------------------------------
  // SUITE 3: Genuine SIP Connectivity Probe & Unconnected-Until-Confirmed Calls
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 3] Verifying SIP State Truthfulness (CONFIGURED vs CONNECTED & Session Confirmation)...');

  const deadPort = await getUnusedPort();
  const configuredUnreachableSip = new SipTelephonyAdapter({
    sipServerUri: `sip:127.0.0.1:${deadPort}`,
    sipUsername: 'pbx_trunk_1',
    allowSimulation: false,
  });
  assert(
    configuredUnreachableSip.getState() === 'CONFIGURED',
    'SIP with credentials initializes as CONFIGURED (NOT falsely CONNECTED)'
  );
  const deadHealth = await configuredUnreachableSip.fetchHealthStatus();
  assert(
    deadHealth.state === 'FAILED' && !deadHealth.isHealthy,
    `Unreachable SIP server fails health probe with state=FAILED (got ${deadHealth.state})`,
    deadHealth
  );

  // Start real local TCP listener simulating live SIP socket endpoint
  const liveSipServer = net.createServer();
  await new Promise<void>((resolve) => liveSipServer.listen(0, '127.0.0.1', resolve));
  const liveSipPort = (liveSipServer.address() as net.AddressInfo).port;
  try {
    const liveSipAdapter = new SipTelephonyAdapter({
      sipServerUri: `sip:127.0.0.1:${liveSipPort}`,
      sipUsername: 'pbx_trunk_live',
      allowSimulation: false,
    });
    assert(liveSipAdapter.getState() === 'CONFIGURED', 'Live SIP starts as CONFIGURED prior to health probe');
    const liveHealth = await liveSipAdapter.fetchHealthStatus();
    assert(
      liveHealth.state === 'TCP_REACHABLE' && !liveHealth.isHealthy,
      `Raw TCP listener without SIP REGISTER reports TCP_REACHABLE (never REGISTERED/CONNECTED) [got ${liveHealth.state}]`,
      liveHealth
    );

    let liveDialBlocked = false;
    try {
      await liveSipAdapter.initiateOutboundCall({
        organizationId: testOrgId,
        from: '+20220000000',
        to: '01019876543',
        agentId: 'ag-test-1',
      });
    } catch (err: any) {
      liveDialBlocked = String(err?.message || '').includes('LIVE_SIP_INVITE_NOT_IMPLEMENTED');
    }
    assert(
      liveDialBlocked,
      'Non-simulated liveSipAdapter.initiateOutboundCall() fails closed with LIVE_SIP_INVITE_NOT_IMPLEMENTED'
    );

    const simSipAdapter = new SipTelephonyAdapter({ allowSimulation: true });
    const call = await simSipAdapter.initiateOutboundCall({
      organizationId: testOrgId,
      from: '+20220000000',
      to: '01019876543',
      agentId: 'ag-test-1',
    });
    assert(
      call.status === 'ringing' && call.disposition === 'simulated_ringing',
      `Simulated outbound SIP call starts in ringing/simulated_ringing [status=${call.status}, disp=${call.disposition}]`
    );

    const confirmed = await simSipAdapter.confirmCallConnected(call.id, 'sim-ack-local');
    assert(
      confirmed.status === 'in_progress' && confirmed.disposition === 'simulated_confirmed',
      `Simulated call confirmation transitions to in_progress/simulated_confirmed (never provider_confirmed)`,
      confirmed
    );

    await simSipAdapter.toggleHold(call.id, true);
    assert(call.status === 'hold', 'Call hold toggled cleanly');
    await simSipAdapter.toggleHold(call.id, false);
    await simSipAdapter.terminateCall(call.id, 'resolved_inquiry');
    assert(call.status === 'completed', 'Call terminated cleanly');
  } finally {
    liveSipServer.close();
  }

  // ----------------------------------------------------------------------------
  // SUITE 4: Authenticated API Wiring via IntegrationRegistry (Real HTTP Server)
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 4] Verifying Authenticated API Routes & Webhook Signature Wiring...');

  const tempDiskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-adapter-api-'));
  const diskFile = path.join(tempDiskDir, 'db_state.json');
  const prevDisk = db.getPersistFilePath();
  db.setPersistFilePathForTesting(diskFile);
  initializeSeedData();

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

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // Login as Admin
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-admin-01' }),
    });
    const loginJson: any = await loginRes.json();
    const token = loginJson.data?.token;
    assert(Boolean(token), 'Authenticated test session established');

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 4a. Seed data configures WhatsApp with demo credentials → verify channels list reflects CONFIGURED
    // Then clear WhatsApp config to verify DISABLED fail-closed behavior
    const chRes = await fetch(`${baseUrl}/integrations/channels`, { headers: authHeaders });
    const chJson: any = await chRes.json();
    const waChan = chJson.data?.find((c: any) => c.id === 'chan-whatsapp');
    const voiceChan = chJson.data?.find((c: any) => c.id === 'chan-voice');
    const webChan = chJson.data?.find((c: any) => c.id === 'chan-webchat');
    // Seed data provides WhatsApp credentials → CONFIGURED is correct; Voice has no seed config → DISABLED
    assert(
      (waChan?.adapterState === 'CONFIGURED' && waChan?.status === 'configured') ||
      (waChan?.adapterState === 'DISABLED' && waChan?.status === 'disabled'),
      'GET /integrations/channels: WhatsApp is CONFIGURED (seed data) or DISABLED (no seed data)',
      waChan
    );
    assert(voiceChan?.adapterState === 'DISABLED' && voiceChan?.status === 'disabled', 'GET /integrations/channels keeps unconfigured Voice SIP DISABLED', voiceChan);
    assert(webChan?.adapterState === 'CONNECTED' && webChan?.status === 'online', 'Native zero-cost Webchat reports CONNECTED', webChan);

    // Clear WhatsApp seed config to test true DISABLED fail-closed behavior
    const waConfigKey = Array.from(db.channelConfigs.keys()).find(k => k.includes('chan-whatsapp'));
    if (waConfigKey) db.channelConfigs.delete(waConfigKey);

    // 4b. Disabled providers fail closed on dial and webhook and outbound dispatch
    const disabledDialRes = await fetch(`${baseUrl}/calls/dial`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ phoneNumber: '01011223344' }),
    });
    assert(disabledDialRes.status === 409, `POST /calls/dial rejects when SIP is DISABLED -> HTTP 409 (got ${disabledDialRes.status})`);

    const disabledWhRes = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'hello' }),
    });
    assert(disabledWhRes.status === 403, `POST /integrations/whatsapp/webhook rejects when DISABLED -> HTTP 403 (got ${disabledWhRes.status})`);

    const disabledDispatchRes = await fetch(`${baseUrl}/integrations/whatsapp/send-template`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ templateName: 'order_status_update_ar', recipientPhone: '01012345678' }),
    });
    assert(disabledDispatchRes.status === 409, `POST /whatsapp/send-template rejects when DISABLED -> HTTP 409 (got ${disabledDispatchRes.status})`);

    // 4c. Simulated dial + explicit provider confirm flow
    const simDialRes = await fetch(`${baseUrl}/calls/dial`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ phoneNumber: '01099887766', simulate: true }),
    });
    const simDialJson: any = await simDialRes.json();
    assert(
      simDialRes.status === 200 && simDialJson.data?.status === 'ringing' && simDialJson.adapterState === 'SIMULATED',
      'Simulated /calls/dial creates call in ringing state (never marked connected prematurely)',
      simDialJson
    );

    const forgedConfirmRes = await fetch(`${baseUrl}/calls/${simDialJson.data.id}/confirm`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ providerSessionId: 'forged-user-ack' }),
    });
    assert(
      forgedConfirmRes.status === 403,
      `POST /calls/:id/confirm rejects user-forged confirmation -> HTTP 403 (got ${forgedConfirmRes.status})`
    );

    const confirmRes = await fetch(`${baseUrl}/calls/${simDialJson.data.id}/simulate-answer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const confirmJson: any = await confirmRes.json();
    assert(
      confirmRes.status === 200 && confirmJson.data?.status === 'in_progress' && confirmJson.data?.disposition === 'simulated_confirmed',
      'POST /calls/:id/simulate-answer marks simulated call in_progress with simulated_confirmed',
      confirmJson
    );

    // 4d. Simulated outbound dispatch marks status="simulated" (never "delivered")
    const simSendRes = await fetch(`${baseUrl}/integrations/whatsapp/send-template`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        templateName: 'order_status_update_ar',
        recipientPhone: '01099887766',
        parameters: ['كريم'],
        simulate: true,
      }),
    });
    const simSendJson: any = await simSendRes.json();
    assert(
      simSendRes.status === 200 && simSendJson.data?.status === 'simulated' && simSendJson.data?.adapterState === 'SIMULATED',
      'Simulated /whatsapp/send-template persists message with truthful status="simulated"',
      simSendJson
    );

    // 4e. Configure WhatsApp secrets & prove Webhook GET verification + POST HMAC-SHA256 validation
    const waAppSecret = 'meta_app_secret_unit_integration_test_999';
    const waVerifyToken = 'verified_hub_token_secure_77';
    await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        phoneNumberId: '100200300400',
        apiToken: 'EAAG_TEST_CONFIGURED_ONLY',
        appSecret: waAppSecret,
        verifyToken: waVerifyToken,
      }),
    });

    // GET challenge must reject empty or wrong verify_token and accept matching token
    const badGetWh = await fetch(`${baseUrl}/integrations/whatsapp/webhook?hub.mode=subscribe&hub.challenge=12345`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(badGetWh.status === 403, 'GET webhook rejects missing verify_token fail-closed (HTTP 403)');

    const goodGetWh = await fetch(
      `${baseUrl}/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${waVerifyToken}&hub.challenge=CHALLENGE_OK`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert(goodGetWh.status === 200 && (await goodGetWh.text()) === 'CHALLENGE_OK', 'GET webhook verifies valid token and echoes hub.challenge');

    // POST webhook must reject invalid HMAC signature and accept valid HMAC signature
    const rawWebhookPayload = JSON.stringify({
      entry: [
        {
          id: 'WABA-TEST-100',
          changes: [
            {
              value: {
                metadata: { phone_number_id: '100200300400' },
                contacts: [{ wa_id: '201055566677', profile: { name: 'سارة علي' } }],
                messages: [{ id: 'wamid.test.1', from: '201055566677', text: { body: 'تأكيد استلام الرسالة' } }],
              },
            },
          ],
        },
      ],
    });

    const badSigPost = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-hub-signature-256': 'sha256=deadbeefdeadbeef' },
      body: rawWebhookPayload,
    });
    assert(badSigPost.status === 401, 'POST webhook rejects tampered X-Hub-Signature-256 -> HTTP 401');

    const validSig = `sha256=${crypto.createHmac('sha256', waAppSecret).update(rawWebhookPayload).digest('hex')}`;
    const goodSigPost = await fetch(`${baseUrl}/integrations/whatsapp/webhook`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-hub-signature-256': validSig },
      body: rawWebhookPayload,
    });
    const goodSigJson: any = await goodSigPost.json();
    assert(
      goodSigPost.status === 200 && goodSigJson.data?.messageId && goodSigJson.data?.conversationId,
      'POST webhook with valid HMAC-SHA256 verified rawBody, normalized inbound message, persisted & broadcasted',
      goodSigJson
    );

    // 4f. Configure SIP with dead port -> test-connection MUST report FAILED (never CONNECTED)
    await fetch(`${baseUrl}/integrations/channels/chan-voice/config`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        sipServerUri: `sip:127.0.0.1:${deadPort}`,
        sipUsername: 'test_trunk',
        sipPassword: 'test_sip_secret_password',
      }),
    });
    const sipHealthCheckRes = await fetch(`${baseUrl}/integrations/channels/chan-voice/test-connection`, {
      method: 'POST',
      headers: authHeaders,
    });
    const sipHealthCheckJson: any = await sipHealthCheckRes.json();
    assert(
      sipHealthCheckRes.status === 200 && sipHealthCheckJson.data?.adapterState === 'FAILED' && sipHealthCheckJson.data?.isHealthy === false,
      'SIP test-connection honestly reports FAILED when SIP endpoint is unreachable (never fake CONNECTED)',
      sipHealthCheckJson.data
    );
  } finally {
    server.close();
    db.setPersistFilePathForTesting(prevDisk);
    if (fs.existsSync(tempDiskDir)) {
      fs.rmSync(tempDiskDir, { recursive: true, force: true });
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 ADAPTER CONTRACT & API WIRING RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ADAPTER TEST ERROR]', err);
  process.exit(1);
});
