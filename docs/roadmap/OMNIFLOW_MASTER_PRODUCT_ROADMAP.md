# OMNIFLOW OS — MASTER PRODUCT & ENGINEERING ROADMAP
**Phase:** `OMNIFLOW-01` (Master Product Discovery, Forensic Baseline & Strategic Engineering Roadmap)  
**Product Identity:** AI Contact Center + Omnichannel Social Media Management + Provider-Neutral Telephony OS  
**Target Market Focus:** Egypt & MENA Enterprise / SMB Contact Centers (with Global Multi-Tenant SaaS Readiness)  
**Baseline Commit:** `c19bcdc57280863a05c14e97e9454307e651bdae`

---

## 1. Product Vision, Positioning & Core Value Proposition

### 1.1 Strategic Product Definition
**OmniFlow OS** is an integrated, AI-native **Customer Operations & Social Experience Operating System** built for organizations that manage high-volume customer conversations across **Voice (PSTN/SIP/WebRTC)**, **Messaging (WhatsApp, Messenger, Instagram, Telegram, WebChat, Email)**, and **Public Social Channels (Facebook Pages, Instagram, TikTok, YouTube, X)** from a single unified workspace.

Unlike fragmented stacks that force companies to buy a legacy call center PBX (e.g., Avaya/Cisco/Genesys), a separate helpdesk ticketing system (e.g., Zendesk/Freshdesk), and a separate social media publishing suite (e.g., Hootsuite/Sprout Social), OmniFlow OS unifies:
1. **Provider-Neutral Cloud & On-Premise Telephony:** Works seamlessly with zero-cost open-source PBXs (**Asterisk / FreePBX / FreeSWITCH**) connected to legal local Egyptian SIP trunks/gateways (**WE, Vodafone, Orange, e&**) as well as global CPaaS APIs (**Twilio, Vonage, Telnyx**).
2. **Omnichannel Messaging & Public Social Care:** Unifies private DMs, WhatsApp templates, and public post comments/mentions with automated SLA tracking and Maker-Checker approval workflows.
3. **Unified Customer 360 & Identity Graph:** Resolves a customer's Egyptian mobile number (`010...` / `+2010...`), WhatsApp ID, Instagram handle, Facebook PSID, and email into one timeline.
4. **Governed Agentic AI & Zero-Cost Fallback:** Combines PII-redacted cloud LLMs (`Gemini 2.5 Flash`) with a deterministic zero-cost local NLP/rules engine so operations never halt when AI budgets or external APIs are constrained.

### 1.2 Competitive Positioning Matrix
| Capability Dimension | Traditional Call Center (Genesys / Avaya / Five9) | Customer Messaging Suite (Zendesk / Intercom / Respond.io) | Social Media Suite (Hootsuite / Sprout Social / Buffer) | **OmniFlow OS (Target Architecture)** |
| :--- | :--- | :--- | :--- | :--- |
| **Voice PBX, SIP Trunking & WebRTC Softphone** | Strong (High per-seat cost `$75–$150+/mo`) | Weak or expensive add-on | None | **Native Provider-Neutral (`SIP.js` + Asterisk/FreePBX + CPaaS)** |
| **Egypt Local PSTN / NTRA Compliance (BYOC)** | Requires heavy on-prem hardware integrators | Cloud-only (fails local `+20` PSTN termination) | N/A | **Native Hybrid Bridge (Cloud UI + Local Asterisk/SIP Gateway)** |
| **WhatsApp, Messenger, IG, Telegram Unified Inbox** | Bolt-on connectors | Strong | Weak (lacks SLA ticketing) | **Native Omnichannel Inbox + SLA Ticketing** |
| **Social Publishing, Content Calendar & Campaigns** | None | None | Strong (`$99–$399+/seat/mo`) | **Native Editorial Calendar, Approvals & Campaign-to-Ticket Attribution** |
| **PII-Safe AI Copilot, Auto-QA & WFM** | Expensive enterprise add-ons | Paid per-resolution AI (`$0.99/resolution`) | Basic caption generation | **Built-in AI Gateway (PII Redaction + Local Zero-Cost Mode + BYO Key)** |

---

## 2. Economic Principles & 4-Tier Cost Matrix (Free & Open-Source First)

To guarantee the lowest total cost of ownership (TCO) for Egyptian and regional deployments while maintaining enterprise compliance, every component in OmniFlow OS is governed by a strict **4-Tier Economic Architecture**:

| Cost Tier | Scope & Components | Technology Choices in OmniFlow OS | Cost Classification | Exact Cost & Operational Reality |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Core Application & PBX Software** | Web application, API server, RBAC, Audit Chain, Ticketing, CRM, WFM, QA, Social Calendar, WebRTC Softphone, PBX Engine | Node.js, TypeScript, React, Tailwind, Drizzle ORM, PostgreSQL, **Asterisk 20/22 LTS / FreePBX**, **SIP.js**, **coturn** (STUN/TURN) | **`100% FREE & OPEN-SOURCE`** | **`$0.00` license fees** forever. Zero per-agent or per-seat software royalties. |
| **Tier 2: Hosting, Database & Media Infrastructure** | Compute VM/containers, PostgreSQL storage, Redis queue/cache, Object storage for call recordings, TURN relay bandwidth | Self-hosted Linux VPS / On-Premise Server (Docker Compose) OR Cloud SQL + Cloud Run / Firebase | **`FREEMIUM / INFRASTRUCTURE COST`** | **Dev/Pilot:** `$0` on local server or free cloud tiers.<br>**Production (10–25 agents):** `$20–$60/mo` VPS (4 vCPU / 8GB RAM in Europe/Egypt) or existing on-prem server. |
| **Tier 3: External Telecom & Social API Fees** | PSTN calls (`+20` landline/mobile), WhatsApp Business conversations, SMS, X API | **Voice:** Local Egyptian SIP Trunk / E1 / VoIP Gateway (WE/Vodafone/Orange/e&) or Twilio/Telnyx<br>**Social:** Meta Graph API (WhatsApp/FB/IG), Telegram Bot API, TikTok API, YouTube API | **`PROVIDER-DEPENDENT (PAID / FREE)`** | - **Telegram Bot API, WebChat, Email (IMAP/SMTP):** **`FREE ($0)`**<br>- **Meta Messenger & IG DMs/Comments API:** **`FREE ($0)`** (within 24h customer care window)<br>- **WhatsApp Cloud API:** Service conversations initiated by user = **`FREE ($0)`**; Outbound Marketing/Utility/Auth templates = **Meta per-message country rate (`~$0.03–$0.06` in Egypt)**<br>- **PSTN Voice (`+20`):** Billed in **EGP** at standard local NTRA tariff via company's telecom contract (or `~$0.08–$0.22/min` if using international CPaaS). |
| **Tier 4: AI & Speech Processing (STT / LLM / TTS)** | Agent Copilot, Auto-QA, RAG, Call Transcription, Voicebot | **Mode A:** Local Rules/Heuristics + Local Whisper.cpp / Vosk STT + Piper TTS<br>**Mode B:** Google Gemini (`gemini-2.5-flash`) via `@google/genai` | **`OPTIONAL / HYBRID (ZERO-COST OR PAY-AS-YOU-GO)`** | - **Mode A (`zeroCostMode = true`):** **`$0.00/mo`** (runs deterministically on CPU).<br>- **Mode B (`gemini-2.5-flash`):** Free tier available in AI Studio; paid pay-as-you-go is pennies per 1,000 tickets, controlled by per-tenant token caps. |

---

## 3. Target Engineering Architecture

### 3.1 Single Source of Truth (SSOT) Persistence Architecture
To eliminate the **4-Way Storage Split-Brain** identified in `OMNIFLOW_CURRENT_STATE_AND_GAP_MATRIX.md` (Section 4.1), OmniFlow OS will standardize on a **Unified Repository Pattern (`OmniFlowRepository`)**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        Express API Router (/api/v1)                       │
│   (Zero raw Map objects in router.ts; 100% routed via Domain Services)    │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 Unified Storage Repository Contract (IDataStore)          │
│  • Tenant-Scoped Queries (mandatory organizationId parameter)             │
│  • Transactional Mutations + Automatic Hash-Chained Audit Log Emission    │
└─────────────────┬───────────────────────────────────────┬─────────────────┘
                  │                                       │
     [Primary Production Adapter]            [Zero-Config Dev / CI Adapter]
                  ▼                                       ▼
┌───────────────────────────────────────┐ ┌─────────────────────────────────┐
│   PostgresDrizzleStore (Cloud SQL)    │ │   AtomicJsonFileStore (/tmp)    │
│  • Drizzle ORM over PostgreSQL 16     │ │  • 100% schema parity with PG   │
│  • Full ACID transactions & indexes   │ │  • Used for offline CI & fast   │
│  • pgvector ready for semantic RAG    │ │    hermetic tests (run-audit)   │
└───────────────────────────────────────┘ └─────────────────────────────────┘
```
- **Role of Firestore:** Retained strictly as an **optional Real-Time Client Edge Projection** (protected by the verified `firestore.rules` ruleset) or disabled when SSE (`/api/v1/stream`) + PostgreSQL is selected as the sole state engine (see `DEC-01` in Decision Register).

### 3.2 Provider-Neutral Telephony Architecture (`TelephonyGateway`)
To support both **zero-license-cost Asterisk/FreePBX with Egyptian SIP trunks** and **global cloud CPaaS (Twilio/Vonage/Telnyx)** without changing a single line of React UI or ticketing business logic, Voice is decoupled into two planes:
1. **Browser Audio/Media Plane (`VoiceSoftphone.tsx`):**
   - Uses standard **WebRTC (`SIP.js`)** over `WSS` (WebSocket Secure on TLS port 443) + `coturn` (`TURN/TLS` on port 443 to bypass ISP UDP/SIP throttling in Egypt) when connected to Asterisk/FreePBX, OR provider WebRTC SDK when connected to Twilio/Telnyx, OR local Web Audio Simulator in `simulator` mode.
2. **Server Signaling & Call Control Plane (`server/modules/telephony/gateway.ts`):**
   - Implements the unified `ITelephonyProvider` contract across 3 concrete adapters:
     - **`AsteriskAriProvider` (Primary Recommended for Egypt):** Connects to Asterisk 20/22 REST Interface (ARI) / AMI for call origination, queue/ring-group routing, hold, blind/attended transfer, dual-channel WAV recording, and CDR ingestion.
     - **`TwilioVoiceProvider` (Global Cloud CPaaS Option):** Uses Twilio Programmable Voice REST API + TwiML webhooks (`X-Twilio-Signature` verified).
     - **`SimulatorTelephonyProvider` (Default for CI & Demo):** Preserves deterministic synthetic call sessions and transcripts for automated testing without spending telecom credits.

#### Unified Call State Machine
```
[IDLE] ──(dial / inbound_ring)──► [RINGING] ──(answer)──► [CONNECTED]
  │                                  │                        │
  │                                  ├──(no_answer/busy)──► [MISSED] ──► (Auto-Callback Queue / Ticket)
  │                                  │                        │
  │                                  └──(ivr_self_serve)──► [IVR_ACTIVE]
  │                                                           │
  ◄────────────────────(hangup / completed)───────────────────┼──► [ON_HOLD]
                                                              └──► [TRANSFERRING]
```

### 3.3 Unified Omnichannel & Social Platform Architecture (`OmnichannelGateway`)
Public webhooks are separated from authenticated agent routes:
- **Public Webhook Ingress Router (`/api/v1/webhooks/:provider/:tenantSlug`):** Mounted **before** `authenticateApiRequest`. Enforces:
  1. Raw body buffer capture (`req.rawBody`) for cryptographic HMAC verification (`X-Hub-Signature-256` for Meta, `X-Telegram-Bot-Api-Secret-Token` for Telegram, `X-Twilio-Signature` for Twilio).
  2. Challenge-response handshake (`GET /api/v1/webhooks/meta/:tenantSlug` verifying `hub.mode === 'subscribe'` and `hub.verify_token`).
  3. Idempotency deduplication ledger (`webhook_events` table keyed by `(provider, externalEventId)`) preventing duplicate messages on webhook retries.
  4. Normalization into a canonical `InboundChannelEvent` (`message`, `delivery_receipt`, `post_comment`, `mention`, `lead_form`).

#### Channel Capability Matrix (Design Contract)
Each channel adapter declares its exact runtime capabilities so the UI dynamically enables/disables controls:
- `supportsInboundDM: boolean`
- `supportsOutboundFreeformDM: boolean`
- `messagingWindowHours: number | null` (e.g., `24` for Meta WhatsApp/Messenger/IG; `null` for Telegram/Email/WebChat)
- `supportsApprovedTemplates: boolean` (WhatsApp Cloud API)
- `supportsPublicComments: boolean` (Facebook Pages, Instagram, TikTok, YouTube)
- `supportsCommentToPrivateReply: boolean` (Facebook/Instagram Private Reply API)
- `supportsScheduledPublishing: boolean` (Facebook Pages, Instagram Graph API, TikTok, YouTube)

### 3.4 Customer 360 & Identity Resolution Engine
1. **E.164 Phone Canonicalization (`normalizePhoneNumber`):** Automatically normalizes Egyptian mobile numbers (`01018108979`, `201018108979`, `00201018108979`, `+20 10 1810 8979`, `whatsapp:+201018108979`) to canonical E.164 (`+201018108979`).
2. **Multi-Identity Graph (`customer_identities`):** Links multiple verified and unverified identifiers (`phone_e164`, `whatsapp_wa_id`, `facebook_psid`, `instagram_scoped_id`, `telegram_chat_id`, `email`, `webchat_visitor_id`) to a single `customerId` with confidence scores (`1.0` deterministic verified match; `0.6–0.85` fuzzy/suggested merge requiring agent 1-click confirmation) and full merge/unmerge audit logs.

### 3.5 Governed AI Engine & 4-Tier Execution Policy
Every AI capability in `server/modules/ai/gateway.ts` operates under a tenant-configurable **4-Tier Autonomy Policy**:
- **`LEVEL 0 — OBSERVE ONLY`:** AI computes sentiment, language, intent tags, churn risk, and QA scores silently in the background (`db.conversations`, `db.qaEvaluations`). Zero customer-facing output.
- **`LEVEL 1 — SUGGEST TO AGENT (Human Copilot)`:** AI drafts reply suggestions, summarizes threads, retrieves cited KB chunks, and suggests ticket priority/tags inside the Agent Workspace. Agent must review and click "Send" or "Apply".
- **`LEVEL 2 — APPROVE-TO-EXECUTE (Maker-Checker)`:** AI prepares a structured action payload (e.g., sending a WhatsApp template, publishing a social post campaign, issuing a billing credit, escalating a ticket) and queues it in `pending_approvals` for Supervisor 1-click approval.
- **`LEVEL 3 — CONTROLLED AUTONOMY (Guardrailed Self-Service)`:** AI automatically responds to routine Tier-1 FAQ queries or post comments **only** when: (a) RAG citation confidence `>= 0.85`, (b) customer sentiment is not `negative`/`angry`, (c) zero PII or compliance flags are triggered, and (d) instant human handoff occurs on any fallback condition.

---

## 4. Phased Engineering Execution Plan (`Phases P -> Z`)

Each phase below is strictly scoped, incremental, and gated by deterministic verification checks.

---

### PHASE P — Unified Storage Consolidation, Tenant Alignment & Webhook Security Foundation
- **Objective:** Eliminate the 4-way storage split-brain, move all 6 module-scoped Maps out of `router.ts` into the unified `DataStore`, fix the `org-madar-001` vs `org-madar-enterprise-001` mismatch, and extract public HMAC-verified webhook endpoints before `authenticateApiRequest`.
- **Reused Assets:** `server/db/store.ts`, `server/core/identity.ts`, `server/core/audit.ts`, `src/db/schema.ts`, `src/lib/firestoreService.ts`.
- **New / Refactored Components:**
  1. Expand `server/db/store.ts` and `src/db/schema.ts` to include tenant-scoped `channelConfigs`, `recommendations`, `coachingPlans`, `macros`, `qaFeedbackLedger`, `connectedDevices`, `webhookIdempotencyLedger`, and `customerIdentities`.
  2. Add `organizationId` to all tables in `src/db/schema.ts` (`users`, `conversations`, `messages`, `tickets`, `call_sessions`) and implement `PostgresDrizzleStore` alongside `AtomicJsonFileStore`.
  3. Align `DEFAULT_ORG_ID` in `src/lib/firestoreService.ts` to `'org-madar-001'`.
  4. Create `/api/v1/webhooks/:provider/:tenantId` (`GET` challenge verification + `POST` raw-body HMAC verification + idempotency deduplication) mounted prior to `authenticateApiRequest`, while keeping `/api/v1/integrations/:channel/webhook` as an authenticated internal simulator endpoint.
- **Dependencies:** None (Foundational Phase).
- **Risks & Mitigations:** Changing `store.ts` backup schema could break `run-audit.ts` `STORAGE-01`. *Mitigation:* Maintain backward-compatible defaults in `importFullBackup()` for any new collections.
- **Acceptance Criteria & Tests:**
  - `memoryChannelConfigs` and `memoryMacros` are isolated per `organizationId` (`TENANT-04` test).
  - Unauthenticated `POST /api/v1/webhooks/whatsapp/org-madar-001` with valid `X-Hub-Signature-256` succeeds (`200 OK`), tampered signature fails (`401 INVALID_WEBHOOK_SIGNATURE`), and duplicate `message.id` is ignored (`200 DUPLICATE_IGNORED`).
  - All existing `run-audit.ts` tests + `firestore-rules-audit.ts` pass 100%.
- **Rollback Plan:** Revert repository adapter switch flag (`STORAGE_DRIVER=json`) to fallback immediately to atomic JSON store.
- **Exit Gate:** `npm run lint && npm run test:audit && npm run build` pass with 0 errors.

---

### PHASE Q — Customer 360 Identity Graph, Phone Canonicalization & SLA Automation Engine
- **Objective:** Implement E.164 Egyptian/international phone normalization, multi-identity customer resolution (`customer_identities`), and real-time event-driven execution of `AutomationRule` workflows on ticket/message creation.
- **Reused Assets:** `Customer360View.tsx`, `WorkflowAutomationView.tsx`, `server/db/store.ts`.
- **New / Refactored Components:**
  1. `server/modules/crm/identityResolver.ts`: E.164 phone normalizer (`010...` -> `+2010...`), deterministic identity lookup across `customer_identities`, fuzzy match candidate detector, and audited customer merge/unmerge API (`POST /api/v1/customers/:id/merge`).
  2. `server/modules/automation/engine.ts`: Hook `eventBus` events (`ticket.created`, `message.received`, `sla.breach_risk`) to evaluate active tenant `automationRules` automatically, logging rule executions to `auditEvents`.
- **Dependencies:** Phase P.
- **Acceptance Criteria & Tests:**
  - Sending a WhatsApp message from `201018108979` and a call from `01018108979` resolves to the exact same `Customer` record (`cust-eg-01`) without creating duplicates.
  - Creating an urgent ticket with `"انقطاع الخدمة"` automatically triggers matching active automation rules and emits an audit event.
- **Rollback Plan:** Feature flag `ENABLE_AUTO_IDENTITY_MERGE=false` falls back to exact match.
- **Exit Gate:** Automated unit & integration tests for E.164 normalization, customer merge/unmerge, and ECA rule execution pass 100%.

---

### PHASE R — Provider-Neutral Telephony OS, WebRTC Softphone, IVR Runtime & ACD Queues
- **Objective:** Replace the simulated voice dialer with a modular `TelephonyGateway` supporting **Asterisk/FreePBX (ARI/AMI + WebRTC `SIP.js`)**, **Twilio Programmable Voice**, and the **Deterministic Simulator**, plus persistent IVR flow execution, ACD queues, wrap-up timers, and call recording management.
- **Reused Assets:** `src/components/VoiceSoftphone.tsx`, `src/components/VoiceCallCenterView.tsx`, `src/components/VisualIVRFlowBuilder.tsx`, `server/modules/integrations/contracts.ts`.
- **New / Refactored Components:**
  1. `server/modules/telephony/gateway.ts`: Concrete implementations of `ITelephonyProvider` (`SimulatorTelephonyProvider`, `AsteriskAriProvider`, `TwilioVoiceProvider`).
  2. `server/modules/telephony/acdQueueEngine.ts`: Queue management (`billing_support`, `technical_tier2`, `vip_concierge`), agent availability & wrap-up state machine (`available`, `on_call`, `wrap_up`, `break`), ring strategies (`ringall`, `least_recent`, `skills_match`), and missed-call auto-callback ticket generation.
  3. `server/modules/telephony/ivrRuntime.ts`: Persists Visual IVR graphs from `VisualIVRFlowBuilder.tsx` into `db.ivrFlows` and compiles/executes node transitions (`Menu DTMF`, `Business Hours Check`, `Queue Route`, `Voicemail`).
  4. `src/components/VoiceSoftphone.tsx`: Dual-mode WebRTC softphone supporting real SIP-over-WSS (`SIP.js` when SIP credentials are configured) and deterministic simulator fallback.
  5. `deploy/asterisk/`: Ready-to-run Docker Compose & config templates (`pjsip.conf`, `http.conf`, `ari.conf`, `extensions.conf`, `turnserver.conf`) for zero-cost Asterisk 22 + `coturn` deployment in Egypt.
- **Dependencies:** Phase P & Phase Q.
- **Acceptance Criteria & Tests:**
  - Full call lifecycle (`inbound_ring` -> `ivr_dtmf` -> `queue_routed` -> `agent_answer` -> `hold`/`resume` -> `attended_transfer` -> `hangup` -> `wrap_up` -> `cdr_persisted`) verified against `SimulatorTelephonyProvider` and mock ARI/Twilio webhook harnesses.
  - Missed calls automatically generate a callback task/ticket linked to the resolved Customer 360 profile.
- **Rollback Plan:** Per-tenant telephony provider setting (`provider: 'simulator' | 'asterisk_ari' | 'twilio'`) allows instant fallback to `'simulator'`.
- **Exit Gate:** Telephony state machine, ACD queue routing, IVR graph persistence, and CDR audit tests pass 100%.

---

### PHASE S — Real Omnichannel Messaging Connectors (WhatsApp, Messenger, Instagram, Telegram, Email, WebChat)
- **Objective:** Implement concrete `ChannelAdapter` classes for two-way real messaging, 24-hour customer care window enforcement, delivery/read receipts, media attachments, and an embeddable customer WebChat widget.
- **Reused Assets:** `src/components/OmnichannelInbox.tsx`, `src/components/ChannelIntegrationsView.tsx`, `src/components/GmailInboxView.tsx`.
- **New / Refactored Components:**
  1. `server/modules/integrations/adapters/`:
     - `WhatsAppCloudAdapter.ts`: Inbound text/media/button webhook parsing, status receipts (`sent`, `delivered`, `read`, `failed`), 24-hour window timer check, outbound free-form reply + template message sender, and real `/test-connection` probe (`GET https://graph.facebook.com/v21.0/${phoneNumberId}`).
     - `MetaMessengerInstagramAdapter.ts`: Inbound Facebook Page & Instagram DM parsing, outbound Send API, and 24-hour window enforcement.
     - `TelegramBotAdapter.ts`: Zero-cost Telegram Bot API webhook receiver (`X-Telegram-Bot-Api-Secret-Token`) and outbound `sendMessage` / `sendDocument`.
     - `WebChatWidgetAdapter.ts`: Public visitor session token endpoint (`/api/v1/webchat/session`) + embeddable widget preview so external customers can chat live with agents in `OmnichannelInbox`.
     - `EmailBridgeAdapter.ts`: Server-side ingestion of Gmail/IMAP threads into `db.conversations` with `messageId` / `threadId` continuity.
  2. Wire `POST /api/v1/conversations/:id/reply` (`router.ts:682`) to dispatch outbound replies through the conversation's active `ChannelAdapter` and record external delivery status (`sending` -> `sent` -> `delivered` / `failed` with retry queue).
- **Dependencies:** Phase P & Phase Q.
- **Acceptance Criteria & Tests:**
  - Agent reply on a WhatsApp conversation inside the 24-hour window invokes the adapter's `sendTextMessage`; outside the 24-hour window, the API blocks free-form text (`409 WINDOW_EXPIRED_TEMPLATE_REQUIRED`) and prompts the agent to select an approved WhatsApp template.
  - Real connection health check (`POST /integrations/channels/:id/test-connection`) performs actual credential validation (or explicit `sandbox_mode` check) instead of a fake `setTimeout`.
- **Rollback Plan:** Adapter circuit-breaker falls back to queuing outbound messages locally (`status: 'queued_offline'`) if an external social API returns 5xx.
- **Exit Gate:** Contract tests for all 6 channel adapters (inbound HMAC verification, outbound payload formatting, 24h window enforcement, and retry handling) pass 100%.

---

### PHASE T — Social Media Content Publishing, Editorial Calendar, Comment Moderation & Campaign Attribution
- **Objective:** Build the missing **Social Media Management Suite** (`[CAT-6]` gap) directly inside OmniFlow OS: multi-channel post composer, editorial calendar, Maker-Checker approval workflow, public comment/mention inbox ("Social Radar"), and campaign-to-ticket/lead attribution.
- **Reused Assets:** RBAC roles (`agent`, `supervisor`, `operations_manager`), `AuditLogger`, `OmnichannelInbox.tsx`.
- **New Components:**
  1. **Backend (`server/modules/social/`):**
     - Entities: `social_campaigns`, `social_posts` (`draft`, `pending_approval`, `approved`, `scheduled`, `published`, `failed`), `social_post_targets` (per-channel status for Facebook Page, Instagram, TikTok, YouTube, X), and `social_comments` (public comments synced from published posts).
     - Maker-Checker Workflow: `agent` drafts post -> `supervisor` / `operations_manager` approves or requests changes -> scheduled publisher dispatches via platform adapter -> immutable audit event logged.
     - **Comment-to-Ticket & Private Reply Bridge:** Ingests public comments on Facebook/Instagram/YouTube/TikTok posts, scores sentiment/toxicity via AI Gateway, allows agents to reply publicly, send a Private Reply DM, hide spam/abusive comments, or escalate a complaint comment into a tracked SLA Ticket linked to the source `campaignId`.
  2. **Frontend (`src/components/SocialPublishingCalendarView.tsx`):**
     - Multi-channel Composer with platform preview (character limits, media aspect ratios, hashtag sets, UTM link builder), Monthly/Weekly Editorial Calendar, Approval Queue, and Campaign ROI Analytics (views, engagement, inbound DMs generated, support tickets triggered per campaign).
- **Dependencies:** Phase P & Phase S.
- **Acceptance Criteria & Tests:**
  - `agent` role attempting to publish directly without approval is blocked (`403 APPROVAL_REQUIRED`); `supervisor` approval transitions post to `scheduled`/`published`.
  - Inbound negative comment on a campaign post automatically links `campaignId` to the resulting conversation and ticket, appearing in Campaign Analytics.
- **Rollback Plan:** Publishing scheduler can be paused globally per tenant via `socialPublishingEnabled: false` kill-switch.
- **Exit Gate:** End-to-end Maker-Checker publishing state machine, comment-to-ticket escalation, and campaign attribution tests pass 100%.

---

### PHASE U — Hybrid Semantic RAG, 4-Tier AI Governance & Real-Time Voice/Text Copilot
- **Objective:** Upgrade the AI Gateway from keyword-only RAG and regex BI parsing to hybrid semantic retrieval, enforce the 4-Tier AI Execution Policy (`Observe`, `Suggest`, `Approve`, `Controlled Autonomy`), and wire live call transcription into the Agent Copilot.
- **Reused Assets:** `server/modules/ai/gateway.ts`, `KnowledgeBaseView.tsx`, `AgenticAICopilotView.tsx`, `ConversationalBIAnalystView.tsx`.
- **New / Refactored Components:**
  1. **Hybrid RAG Engine:** Combine BM25/TF-IDF lexical scoring with optional vector embeddings (`@google/genai` `text-embedding-004` when `GEMINI_API_KEY` is present, falling back cleanly to enhanced Arabic/English stemmer + BM25 in `zeroCostMode`).
  2. **Prompt Registry & Versioning (`db.promptTemplates`):** Version-controlled system prompts with A/B benchmark tracking against the Golden Dataset (`runAIBenchmarkSuite`).
  3. **4-Tier Autonomy Policy Engine:** Enforce per-tenant autonomy levels (`0..3`) with token/cost budget circuit breakers (`maxDailyCostUsd`).
  4. **Conversational BI Analyst Upgrade:** Connect `/api/v1/ai/analyst` to real aggregated multidimensional queries across calls, tickets, SLA breaches, social campaigns, and agent QA scores.
- **Dependencies:** Phase P, Phase R, Phase T.
- **Acceptance Criteria & Tests:**
  - AI Gateway blocks autonomous Level-3 replies whenever RAG citation confidence `< 0.85` or PII/safety flags trigger, routing immediately to a human agent.
  - Golden Benchmark Suite (`GET /api/v1/ai/benchmark`) achieves `100%` PII redaction accuracy and `>= 90%` grounded citation relevance.
- **Rollback Plan:** Instant 1-click toggle to `zeroCostMode: true` and `autonomyLevel: 1` (Suggest Only).
- **Exit Gate:** AI safety, PII redaction, RAG grounding, and budget cap enforcement tests pass 100%.

---

### PHASE V — Workforce Management (WFM), Automated QA Calibration & Executive BI
- **Objective:** Connect real call/chat volume telemetry into WFM Erlang-C staffing forecasts, automate post-call/post-chat QA rubric scoring on 100% of closed interactions, and link QA deficits automatically to Agent Training Arena scenarios.
- **Reused Assets:** `WorkforceManagementView.tsx`, `QualityAssuranceView.tsx`, `AgentTrainingArenaView.tsx`.
- **Acceptance Criteria & Tests:**
  - Closing a call or conversation triggers background `auto-evaluate` scoring; if `complianceScore < 70`, a supervisor review alert and targeted `CoachingPlan` are automatically created.
- **Exit Gate:** WFM adherence calculation, automated QA trigger, and coaching loop tests pass 100%.

---

### PHASE Z — Production Hardening, Load Certification, Disaster Recovery & Pilot Go-Live
- **Objective:** Certify the entire integrated platform under high-concurrency multi-tenant load, verify container deployment (`Dockerfile` + `docker-compose.yml` with PostgreSQL + Asterisk + coturn), validate backup/restore disaster recovery, and complete pilot onboarding for the first Egyptian contact center tenant.
- **Reused Assets:** `.github/workflows/ci.yml`, `server/test/run-audit.ts`, `server/test/firestore-rules-audit.ts`.
- **Acceptance Criteria & Tests:**
  - Zero cross-tenant bleed across 500+ concurrent requests spanning Voice, WhatsApp, Social Publishing, Ticketing, and AI Copilot.
  - Full cryptographic backup and point-in-time restore verified with zero data loss across all collections.
  - Production deployment runbook and Egyptian NTRA SIP trunk integration checklist signed off.
- **Exit Gate:** All 10 verification matrices in `OMNIFLOW_ACCEPTANCE_AND_VERIFICATION_MATRIX.md` green (`100% PASS`).
