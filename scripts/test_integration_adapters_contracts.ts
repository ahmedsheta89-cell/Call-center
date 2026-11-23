/**
 * @file scripts/test_integration_adapters_contracts.ts
 * OmniFlow OS — Omnichannel & Telephony Adapters Contract Verification Suite
 * Tests Strict State Separation (DISABLED, CONFIGURED, CONNECTED, SIMULATED, FAILED),
 * Webhook Cryptographic Verification, Inbound/Outbound Normalization, and Egyptian Telephony Compliance
 */

import crypto from 'crypto';
import { CequensChannelAdapter } from '../server/modules/integrations/adapters/cequens.ts';
import { WhatsAppCloudChannelAdapter } from '../server/modules/integrations/adapters/whatsappCloud.ts';
import { TelegramChannelAdapter } from '../server/modules/integrations/adapters/telegram.ts';
import { WebChatChannelAdapter } from '../server/modules/integrations/adapters/webchat.ts';
import { EmailChannelAdapter } from '../server/modules/integrations/adapters/emailBridge.ts';
import { SipTelephonyAdapter } from '../server/modules/integrations/adapters/sipTelephony.ts';
import { UnifiedMessage, UUID } from '../server/core/types.ts';

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

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 INTEGRATION ADAPTERS CONTRACT & STATE SEPARATION SUITE');
  console.log('================================================================================\n');

  const testOrgId: UUID = 'org-test-enterprise-1234';

  // ----------------------------------------------------------------------------
  // SUITE 1: DISABLED State Enforcement (Default Zero-Leakage Guard)
  // ----------------------------------------------------------------------------
  console.log('[Suite 1] Verifying DISABLED State Enforcement (Default unconfigured state)...');

  const disabledCequens = new CequensChannelAdapter({ allowSimulation: false });
  assert(disabledCequens.getState() === 'DISABLED', 'Cequens defaults to DISABLED when unconfigured');

  const ceqWebhook = await disabledCequens.verifyWebhook({}, JSON.stringify({ text: 'test' }));
  assert(!ceqWebhook.isValid && ceqWebhook.error?.includes('DISABLED'), 'Disabled Cequens rejects webhook inbound');

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

  const ceqOutbound = await disabledCequens.dispatchOutboundMessage(mockMsg);
  assert(ceqOutbound.status === 'disabled', 'Disabled Cequens returns status="disabled" (no transmission)');

  const ceqHealth = await disabledCequens.fetchHealthStatus();
  assert(ceqHealth.state === 'DISABLED' && !ceqHealth.isHealthy, 'Disabled Cequens reports isHealthy=false');

  const disabledWA = new WhatsAppCloudChannelAdapter({ allowSimulation: false });
  assert(disabledWA.getState() === 'DISABLED', 'WhatsApp Cloud defaults to DISABLED when unconfigured');
  const waOutbound = await disabledWA.dispatchOutboundMessage(mockMsg);
  assert(waOutbound.status === 'disabled', 'Disabled WhatsApp returns status="disabled"');

  const disabledTG = new TelegramChannelAdapter({ allowSimulation: false });
  assert(disabledTG.getState() === 'DISABLED', 'Telegram defaults to DISABLED when unconfigured');
  const tgOutbound = await disabledTG.dispatchOutboundMessage(mockMsg);
  assert(tgOutbound.status === 'disabled', 'Disabled Telegram returns status="disabled"');

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
  assert(simCequens.getState() === 'SIMULATED', 'Cequens enters SIMULATED mode when explicitly allowed');
  const simCeqOut = await simCequens.dispatchOutboundMessage(mockMsg);
  assert(
    simCeqOut.status === 'simulated' && (simCeqOut.status as string) !== 'delivered' && (simCeqOut.status as string) !== 'sent',
    'Simulated Cequens returns status="simulated" (NEVER "delivered" or "sent")',
    simCeqOut
  );

  const simWA = new WhatsAppCloudChannelAdapter({ allowSimulation: true });
  assert(simWA.getState() === 'SIMULATED', 'WhatsApp Cloud enters SIMULATED mode');
  const simWAOut = await simWA.dispatchOutboundMessage(mockMsg);
  assert(
    simWAOut.status === 'simulated' && (simWAOut.status as string) !== 'delivered',
    'Simulated WhatsApp returns status="simulated" (NEVER "delivered")',
    simWAOut
  );

  const simTG = new TelegramChannelAdapter({ allowSimulation: true });
  assert(simTG.getState() === 'SIMULATED', 'Telegram enters SIMULATED mode');
  const simTGOut = await simTG.dispatchOutboundMessage(mockMsg);
  assert(simTGOut.status === 'simulated', 'Simulated Telegram returns status="simulated"');

  // ----------------------------------------------------------------------------
  // SUITE 3: Webhook Cryptographic Signature Verification
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 3] Verifying Webhook Cryptographic Signatures (HMAC-SHA256 & Timing-Safe)...');

  // WhatsApp Cloud HMAC-SHA256 signature verification
  const waSecret = 'meta_test_webhook_secret_key_1234567890';
  const waPayload = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '201012345678', profile: { name: 'أحمد محمود' } }],
              messages: [{ id: 'wamid.123', from: '201012345678', text: { body: 'استفسار عن الخدمة' } }],
            },
          },
        ],
      },
    ],
  });

  const validHmac = `sha256=${crypto.createHmac('sha256', waSecret).update(waPayload).digest('hex')}`;
  const liveWA = new WhatsAppCloudChannelAdapter({
    accessToken: 'test_token',
    phoneNumberId: 'test_phone_id',
    appSecret: waSecret,
    allowSimulation: false,
  });

  assert(liveWA.getState() === 'CONFIGURED', 'WhatsApp adapter with credentials enters CONFIGURED state');

  const validWaRes = await liveWA.verifyWebhook({ 'x-hub-signature-256': validHmac }, waPayload);
  assert(validWaRes.isValid && validWaRes.senderIdentifier === '201012345678', 'WhatsApp accepts valid HMAC-SHA256 signature');

  const invalidWaRes = await liveWA.verifyWebhook({ 'x-hub-signature-256': 'sha256=badbadbadbadbadbadbadbadbad' }, waPayload);
  assert(!invalidWaRes.isValid && invalidWaRes.error?.includes('Invalid HMAC'), 'WhatsApp strictly rejects tampered signature');

  // Telegram Secret Token constant-time verification
  const tgSecret = 'secret_token_telegram_random_32_bytes_long';
  const tgPayload = JSON.stringify({
    message: {
      message_id: 101,
      from: { id: 98765432, first_name: 'طارق', username: 'tarek_eg' },
      text: 'طلب تواصل مع الدعم الفني',
    },
  });

  const liveTG = new TelegramChannelAdapter({
    botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    webhookSecretToken: tgSecret,
    allowSimulation: false,
  });

  const validTgRes = await liveTG.verifyWebhook({ 'x-telegram-bot-api-secret-token': tgSecret }, tgPayload);
  assert(validTgRes.isValid && validTgRes.senderIdentifier === 'tarek_eg', 'Telegram accepts valid secret token');

  const invalidTgRes = await liveTG.verifyWebhook({ 'x-telegram-bot-api-secret-token': 'wrong_token' }, tgPayload);
  assert(!invalidTgRes.isValid, 'Telegram strictly rejects invalid secret token');

  // CEQUENS Bearer token timing-safe verification
  const ceqSecret = 'cequens_bearer_token_xyz987';
  const ceqPayload = JSON.stringify({
    mobileNumber: '201200001111',
    messageText: 'كود التحقق الخاص بك هو 9482',
    timestamp: new Date().toISOString(),
  });

  const liveCeq = new CequensChannelAdapter({
    apiKey: 'ceq_api_key_123',
    webhookSecret: ceqSecret,
    allowSimulation: false,
  });

  const validCeqRes = await liveCeq.verifyWebhook({ authorization: `Bearer ${ceqSecret}` }, ceqPayload);
  assert(validCeqRes.isValid && validCeqRes.senderIdentifier === '201200001111', 'Cequens accepts valid Bearer webhook');

  const invalidCeqRes = await liveCeq.verifyWebhook({ authorization: 'Bearer wrong_secret' }, ceqPayload);
  assert(!invalidCeqRes.isValid, 'Cequens strictly rejects invalid Bearer authorization');

  // ----------------------------------------------------------------------------
  // SUITE 4: Inbound Normalization to UnifiedMessage
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 4] Verifying Inbound Normalization Contract...');

  const normWA = await liveWA.normalizeInboundMessage(JSON.parse(waPayload), testOrgId);
  assert(
    normWA.channel === 'whatsapp' &&
    normWA.direction === 'inbound' &&
    normWA.body === 'استفسار عن الخدمة' &&
    normWA.sender.name === 'أحمد محمود',
    'WhatsApp message normalized to UnifiedMessage contract'
  );

  const normTG = await liveTG.normalizeInboundMessage(JSON.parse(tgPayload), testOrgId);
  assert(
    normTG.channel === 'telegram' &&
    normTG.direction === 'inbound' &&
    normTG.body === 'طلب تواصل مع الدعم الفني' &&
    normTG.sender.name === 'طارق',
    'Telegram message normalized to UnifiedMessage contract'
  );

  const normCeq = await liveCeq.normalizeInboundMessage(JSON.parse(ceqPayload), testOrgId);
  assert(
    normCeq.channel === 'sms' &&
    normCeq.metadata?.countryCode === 'EG' &&
    normCeq.body.includes('9482'),
    'Cequens SMS normalized to Egyptian mobile UnifiedMessage contract'
  );

  // WebChat Native Channel
  const webChatAdapter = new WebChatChannelAdapter();
  assert(webChatAdapter.getState() === 'CONNECTED', 'WebChat native channel is CONNECTED by default');
  const webMsg = await webChatAdapter.normalizeInboundMessage({ visitorId: 'vis-1234', message: 'مرحبا' }, testOrgId);
  assert(webMsg.channel === 'webchat' && webMsg.body === 'مرحبا', 'WebChat normalized contract verified');

  // ----------------------------------------------------------------------------
  // SUITE 5: SIP Egypt Telephony & Law 151/2020 Compliance
  // ----------------------------------------------------------------------------
  console.log('\n[Suite 5] Verifying SIP Egypt Telephony & Regulatory Disclosures...');

  const simSip = new SipTelephonyAdapter({ allowSimulation: true });
  assert(simSip.getState() === 'SIMULATED', 'SIP Egypt enters SIMULATED mode');

  const call = await simSip.initiateOutboundCall({
    organizationId: testOrgId,
    from: '+20220000000',
    to: '01019876543',
    agentId: 'ag-test-1',
  });

  assert(
    call.direction === 'outbound' &&
    call.calleeNumber === '01019876543' &&
    call.transcript.includes('قانون حماية البيانات الشخصية رقم 151 لسنة 2020'),
    'SIP Call transcript enforces Law 151/2020 mandatory data protection disclosure'
  );

  await simSip.toggleHold(call.id, true);
  assert(call.status === 'hold', 'Call hold toggled successfully');

  await simSip.toggleHold(call.id, false);
  assert(call.status === 'in_progress', 'Call resumed successfully');

  await simSip.toggleMute(call.id, true);
  assert(call.transcript.includes('كتم الميكروفون'), 'Call mute recorded in transcript');

  await simSip.terminateCall(call.id, 'resolved_inquiry');
  assert(call.status === 'completed' && call.disposition === 'resolved_inquiry', 'Call terminated cleanly with disposition');

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`🏆 ADAPTER CONTRACT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ADAPTER TEST ERROR]', err);
  process.exit(1);
});
