# Integration & Channel Provider Specifications (تكاملات القنوات والاتصالات)

## 1. Provider Abstraction Architecture

All communication channels and external systems implement decoupled interfaces. The core application logic remains completely agnostic of the physical provider.

```
                    ┌─────────────────────────┐
                    │ Unified Message Engine  │
                    └───────────┬─────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
[WhatsAppAdapter]        [MessengerAdapter]        [TelephonyAdapter]
(Meta Cloud API)         (Graph API v21)          (SIP / WebRTC Asterisk)
```

---

## 2. WhatsApp Official Cloud API & Compliance Layer

We use exclusively the **Official WhatsApp Business Platform (Cloud API)** via Meta Graph API. Web-scraping, unofficial headless browser automations, or QR-based unauthorized reverse-engineered libraries are strictly prohibited.

### Compliance & Risk Mitigation Layer
1. **Opt-In & Consent Tracking**: Prior to initiating business-initiated outbound conversations, verified opt-in timestamps must exist.
2. **Opt-Out (STOP / UNSUBSCRIBE) Handling**: Automatic recognition of keyword opt-outs (`STOP`, `إلغاء`, `خروج`), immediately flagging `customer_channels.opt_out = true`.
3. **Template Policy Enforcement**: Outbound messages outside the 24-hour service window **must** utilize pre-approved Meta message templates with localized placeholders.
4. **Rate Limiting & Queue Throttling**: Outbound dispatch rates throttled according to Meta tier limits (Tier 1: 1k users/24h, Tier 2: 10k, Tier 3: 100k) with exponential backoff on HTTP 429.
5. **Webhook Signature Verification**:
   ```ts
   const expectedSignature = crypto
     .createHmac('sha256', process.env.META_APP_SECRET!)
     .update(rawBody)
     .digest('hex');
   if (`sha256=${expectedSignature}` !== req.headers['x-hub-signature-256']) {
     throw new SecurityError('Invalid Meta Webhook signature');
   }
   ```
6. **Idempotency & Deduplication**: Every incoming Meta `message_id` is cached in an LRU/Redis table. Duplicate deliveries are silently acknowledged with HTTP 200 without double processing.

---

## 3. Telephony & Voice (WebRTC / SIP) Specification

### State Machine Lifecycle
```
[IDLE] ──(Incoming/Outgoing)──> [RINGING]
                                    │
                                    ├──(Reject/Timeout)──> [MISSED / ABANDONED]
                                    │
                                    └──(Answer)──> [IN_CALL]
                                                      │
                                                      ├──> [HOLD] ──(Resume)──> [IN_CALL]
                                                      ├──> [MUTE] ──(Unmute)─> [IN_CALL]
                                                      ├──> [TRANSFER_INIT] ──> [TRANSFER_CONFIRM]
                                                      └──> [HANGUP] ──> [DISPOSITION & QA]
```

### Telephony Adapter Interface
```ts
export interface TelephonyAdapter {
  initiateCall(params: { from: string; to: string; agentId: string }): Promise<CallSession>;
  answerCall(callId: string, agentSessionId: string): Promise<void>;
  holdCall(callId: string, holdState: boolean): Promise<void>;
  muteCall(callId: string, muteState: boolean): Promise<void>;
  transferCall(callId: string, targetAgentId: string, isWarm: boolean): Promise<void>;
  terminateCall(callId: string, dispositionCode: string): Promise<CallSummary>;
  startRecording(callId: string): Promise<string>;
  stopRecording(callId: string): Promise<RecordingMetadata>;
}
```
In **Zero-Cost / Local Mode**, the system provides a robust **Simulation Telephony Adapter** (`SIMULATED`) that emits local call state events and recording timestamps for free CI and pilot testing without SIP trunk billing.

---

## 4. Capability & Verification Truthfulness (تصنيف الجاهزية الحقيقي)

- **WebChat:** `IMPLEMENTED` (local zero-cost runtime).
- **WhatsApp / CEQUENS / Telegram Webhooks:** `IMPLEMENTED` + `LOCAL_PROTOCOL_FIXTURE_TESTED` (raw-body signature verification, server-controlled tenant mapping, durable idempotency/replay). Default `DISABLED` without real credentials; **not** `PROVIDER_SANDBOX_VERIFIED` or `LIVE_PROVIDER_VERIFIED`.
- **Email (SMTP):** `IMPLEMENTED` + `LOCAL_PROTOCOL_FIXTURE_TESTED` via Nodemailer with mandatory TLS/STARTTLS, explicit auth, durable idempotency, and relay acceptance (`250 OK`) distinguished from inbox delivery.
- **SIP REGISTER:** `IMPLEMENTED` + `LOCAL_PROTOCOL_FIXTURE_TESTED` (`CONFIGURED` -> `TCP_REACHABLE` -> `REGISTERED` via RFC 3261 Digest auth). Does **not** imply outbound call or media support.
- **Live SIP Outbound INVITE / SDP / RTP Media:** `NOT_IMPLEMENTED` (fails closed with HTTP `501 LIVE_SIP_INVITE_NOT_IMPLEMENTED`; local testing uses `SIMULATED`).
