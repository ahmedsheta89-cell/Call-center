# OMNIFLOW OS — ACCEPTANCE, TESTING & VERIFICATION MATRIX
**Phase:** `OMNIFLOW-01` (Master Product Discovery, Forensic Baseline & Strategic Engineering Roadmap)  
**Baseline Commit:** `c19bcdc57280863a05c14e97e9454307e651bdae`  
**Audit Date:** 2026-10-23

---

## 1. Current Verified Baseline (Executed & Proven in CI and Local Runtime)

### 1.1 GitHub Actions CI Verification History
| CI Run | Commit SHA | Workflow Name | Status | Verified Suites & Counts | Evidence URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Run #3** | `6b52de524ade7afabbbc885553524ca940017d94` | Enterprise CI, Security Gate & Firestore Rules Verification Pipeline | **`SUCCESS` (Green)** | Build + TypeScript Typecheck (`tsc --noEmit`) + Firestore Rules JVM Emulator (`37/37` Passed) + Full Audit Suite | `https://github.com/ahmedsheta89-cell/Call-center/actions/runs/39869207425` |
| **Run #4** | `c19bcdc57280863a05c14e97e9454307e651bdae` | Enterprise CI, Security Gate & Firestore Rules Verification Pipeline | **`SUCCESS` (Green)** | Upgraded `actions/checkout@v5`, `actions/setup-node@v5`, `actions/setup-java@v5`, `actions/cache@v5` + Full Build, Firestore Emulator & Security Gate | `https://github.com/ahmedsheta89-cell/Call-center/actions/runs/40014186731` |

### 1.2 Local Forensic Execution Results (Verified on 2026-10-23)
Executed via `npm run lint && npm run test:audit` inside `/app/applet`:

| Verification Suite | Command | Result | Exact Metrics & Invariants Verified |
| :--- | :--- | :--- | :--- |
| **TypeScript Static Typecheck** | `npm run lint` (`tsc --noEmit`) | **`PASS (0 Errors)`** | 100% strict type checking across frontend (`src/*`) and backend (`server/*`). |
| **Authentication & Session Cryptographic Gate** | `npm run test:audit` (`[AUTH-01..09]`) | **`PASS (9/9)`** | Forged `omf1` signatures rejected (`401`), spoofed headers (`x-user-id`, `x-user-role`, `x-org-id`) rejected (`403`), cross-origin CSRF mutations rejected (`403`), revoked tokens rejected (`401`), Firebase ID token verification (`RS256` JWT validation + revocation check) verified. |
| **RBAC Enforcement Gate** | `npm run test:audit` (`[RBAC-01..06]`) | **`PASS (6/6)`** | `read_only` blocked from call control (`403`), WFM shift updates (`403`), macro execution (`403`), device registration (`403`), QA suite trigger (`403`); `qa_analyst` blocked from system restore (`403`); `/workspace/relay` SSRF & non-Google host calls blocked (`403`). |
| **Multi-Tenant Isolation Gate** | `npm run test:audit` (`[TENANT-01..03]`) | **`PASS (3/3)`** | Foreign tenant (`org-external-999`) blocked from reading `org-madar-001` customer timelines (`404`), conversation messages (`404`), and macros (`404`). |
| **Input Validation & PII Redaction Gate** | `npm run test:audit` (`[VALID-01..04]`, `[PII-01..02]`) | **`PASS (6/6)`** | Empty payloads and invalid status enums rejected (`400`); credit cards and 14-digit Egyptian national IDs scrubbed before LLM processing; `apiToken` & `webhookSecret` redacted to `[REDACTED_SECRET]`. |
| **Immutable Audit Chain & Atomic Storage Gate** | `npm run test:audit` (`[AUDIT-01..03]`, `[STORAGE-01]`) | **`PASS (4/4)`** | SHA-256 hash chain verified across 18 events; payload tampering detected (`integrityHash` mismatch); tampered restore rejected (`400 TAMPERED_AUDIT_CHAIN`); mid-payload corrupted restore rolled back with zero partial state mutation. |
| **GitHub Sync & Secret Redaction Gate** | `npm run test:audit` (`[GITHUB-SYNC-01..06]`) | **`PASS (6/6)`** | 26 branch/ref traversal vectors blocked; `.env*`, `*.pem`, `*.key` excluded and redacted for non-admins; fail-closed `409` live-sync guard verified when `.git` is absent. |
| **Firestore Rules AST & Real JVM Emulator Gate** | `npm run test:firestore` | **`PASS (71/71 Total Checks)`** | OpenJDK 21 (`21.0.13`) + `cloud-firestore-emulator-v1.19.8.jar`: `12/12` structural invariants (`firestore.rules` == `DRAFT_firestore.rules` SHA-256 parity), `20/20` deterministic adversarial payloads (`PERMISSION_DENIED`), `39/39` real JVM emulator rules tests (`29/29` attacks denied, `10/10` valid flows allowed). |
| **22-Module Live Execution & 150-Req Load Gate** | `npm run test:audit` (`[5/7]..[7/7]`) | **`PASS (22/22 Modules, 150/150 Reqs)`** | 3 waves × 50 parallel multi-tenant/multi-role requests completed in `242.3ms` (`619 req/s`, `P50: 53.68ms`, `P95: 71.42ms`, `P99: 87.22ms`, **Identity/Tenant Bleed: `0/150`**). |

---

## 2. Currently Unverified or Unavailable Tests (Honest Forensic Disclosure)

The following areas are **NOT** currently covered by automated tests because their underlying integrations are either simulated (`[CAT-4]`), partially wired (`[CAT-2]`), or non-existent (`[CAT-6]`):
1. **Unauthenticated External Webhook Ingress Tests:** Currently no test sends an unauthenticated Meta `X-Hub-Signature-256` or Twilio `X-Twilio-Signature` webhook to `/api/v1/integrations/:channel/webhook` (doing so currently fails with `401 AUTH_TOKEN_REQUIRED`).
2. **Real SIP/WebRTC Media & Signaling Tests:** No automated test currently verifies SIP `INVITE` / `200 OK` / `ACK` / `BYE` or Asterisk ARI event handling.
3. **24-Hour Customer Care Messaging Window Enforcement:** No test verifies blocking free-form WhatsApp/Messenger/Instagram replies when `lastCustomerMessageAt > 24 hours`.
4. **Social Publishing & Maker-Checker Approval Workflow Tests:** Not yet implemented (`Phase T`).
5. **Cross-Channel Phone Normalization & Customer Merge Tests:** Not yet implemented (`Phase Q`).
6. **PostgreSQL (`PostgresDrizzleStore`) Integration Tests:** Current audit tests run against the in-memory/JSON store (`server/db/store.ts`), not against the live Cloud SQL PostgreSQL instance.

---

## 3. Master Acceptance & Verification Matrix for Future Phases (`Phases P -> Z`)

No phase in `OMNIFLOW_MASTER_PRODUCT_ROADMAP.md` may be marked complete unless every test in its corresponding verification dimension passes:

### Dimension 1: Unit & Domain Logic Tests
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `UNIT-CRM-01` | Phase Q | Egyptian & International E.164 phone normalization (`010...`, `002010...`, `+2010...`, `whatsapp:+2010...`) | 100% deterministic normalization to `+2010XXXXXXXX`; invalid strings flagged without throwing unhandled exceptions. |
| `UNIT-CRM-02` | Phase Q | Customer identity resolution & confidence scoring | Exact verified phone/handle returns confidence `1.0`; secondary email/name match returns candidate `0.70–0.85` for agent review; merge operation preserves all tickets, calls, and messages and writes reversible audit record. |
| `UNIT-TEL-01` | Phase R | Unified Call State Machine & ACD Queue Selector | Valid transitions (`ringing` -> `connected` -> `on_hold` -> `completed`) succeed; illegal transitions (`completed` -> `on_hold`) throw `409 INVALID_CALL_STATE`; ACD skills/priority selector assigns longest-idle qualified agent. |
| `UNIT-SOC-01` | Phase S/T | Channel Capability & 24-Hour Window Validator | Free-form reply at `T + 23h59m` allowed; free-form reply at `T + 24h01m` on WhatsApp/Messenger/IG rejected with `409 WINDOW_EXPIRED_TEMPLATE_REQUIRED`. |

### Dimension 2: Provider Contract & Webhook Security Tests
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `WEBHOOK-SEC-01` | Phase P/S | Meta (`X-Hub-Signature-256`), Telegram (`X-Telegram-Bot-Api-Secret-Token`), and Twilio (`X-Twilio-Signature`) cryptographic validation | Valid HMAC signature over raw request body returns `200 OK`; missing signature, wrong tenant secret, or 1-byte modified body returns `401 INVALID_WEBHOOK_SIGNATURE` and logs security audit event. |
| `WEBHOOK-IDEM-01` | Phase P/S | Webhook Idempotency & Replay Protection | Sending the same Meta `wamid.*` or Twilio `CallSid`/`MessageSid` 5 times concurrently creates exactly **1** message/call record in the store. |
| `WEBHOOK-CHAL-01` | Phase P/S | Meta Webhook Verification Handshake (`GET /api/v1/webhooks/meta/:tenantId`) | Correct `hub.verify_token` echoes `hub.challenge` (`200 OK`); wrong token returns `403 FORBIDDEN`. |

### Dimension 3: Telephony, IVR & Softphone End-to-End Tests
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `TEL-E2E-01` | Phase R | Inbound Call -> IVR DTMF -> Queue Routing -> Agent Answer -> Wrap-Up -> CDR | Simulated & Asterisk ARI mock inbound call traverses IVR graph (`Press 1 for Arabic -> Press 2 for Technical Support`), queues in `technical_tier2`, rings available agent via SSE/WebRTC, enforces wrap-up timer on hangup, and writes complete CDR. |
| `TEL-E2E-02` | Phase R | Missed Call & Abandoned Queue Auto-Callback | Caller hanging up while in queue (`status: 'missed'`) automatically creates a high-priority callback ticket assigned to the queue and linked to the caller's Customer 360 timeline. |

### Dimension 4: Omnichannel Inbox & Social Publishing End-to-End Tests
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `OMNI-E2E-01` | Phase S | Inbound WhatsApp/Telegram/WebChat -> Agent Copilot -> Outbound Dispatch -> Delivery Receipt | Inbound webhook creates/updates conversation and triggers SSE notification; agent reply calls concrete `ChannelAdapter.sendTextMessage()`; subsequent `delivered`/`read` webhook updates message status indicator in UI. |
| `SOCIAL-E2E-01` | Phase T | Maker-Checker Social Post Publishing & Campaign Attribution | `agent` creates campaign post (`status: 'pending_approval'`); direct publish attempt by `agent` fails (`403`); `supervisor` approves (`status: 'scheduled'`); publisher executes adapter and records external `postId`; inbound comment on `postId` links to `campaignId` and can be escalated to a ticket in 1 click. |

### Dimension 5: AI Safety, Grounding, Privacy & Budget Governance Tests
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `AI-GOV-01` | Phase U | 4-Tier Autonomy Policy Enforcement | When tenant policy is `Level 1 (Suggest)`, AI never sends automatic outbound messages; when `Level 3 (Controlled Autonomy)`, AI auto-replies only if RAG confidence `>= 0.85` and sentiment is non-negative, otherwise escalates to human queue. |
| `AI-GOV-02` | Phase U | Per-Tenant AI Token/Cost Budget Circuit Breaker | When tenant daily AI spend reaches `maxDailyCostUsd`, AI Gateway automatically switches to `zeroCostMode` (local deterministic engine) without failing agent requests (`200 OK`, `provider: 'local_fallback'`). |

### Dimension 6: Multi-Tenant Security, RBAC & Data Persistence Integrity
| Test ID | Target Phase | Verification Scope | Pass Criteria |
| :--- | :--- | :--- | :--- |
| `SEC-TENANT-ALL` | Phase P–Z | Cross-Tenant Isolation across all 25+ collections (including `channelConfigs`, `macros`, `socialPosts`, `campaigns`, `ivrFlows`, `customerIdentities`) | `0` cross-tenant read/write leaks across 500 concurrent mixed-tenant requests; `PostgresDrizzleStore` and `AtomicJsonFileStore` pass identical repository contract test suites. |

---

## 4. External Sandbox & Provider Requirements vs. Local Hermetic Testing

To ensure CI (`GitHub Actions`) remains **100% free, fast, and deterministic** while still supporting live provider certification:
1. **Tier A — Hermetic CI Tests (Run on Every Push/PR in GitHub Actions, `$0 Cost`):**
   - Uses `SimulatorTelephonyProvider`, mock Asterisk ARI HTTP/WebSocket fixture server, signed Meta/Telegram/Twilio webhook payload generators, and `zeroCostMode` AI Gateway + OpenJDK 21 Firestore Emulator.
2. **Tier B — Live Provider Sandbox Certification (Run On-Demand Before Production Release):**
   - **Meta Developer Test App:** Free Meta test WhatsApp phone number + Facebook test Page + Instagram professional test account (`META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`).
   - **Telegram Test Bot:** Free bot token created via `@BotFather` (`TELEGRAM_BOT_TOKEN`).
   - **Asterisk / FreePBX Local Lab Container:** Docker container (`andrius/asterisk` or official Debian Asterisk 22 build) with two SIP extensions (`1001`, `1002`) verifying real WebRTC `SIP.js` audio and ARI call control on `localhost`.

---

## 5. Stage Readiness Gates (Definition of Readiness)

| Readiness Stage | Mandatory Passing Gates |
| :--- | :--- |
| **1. Internal Alpha Ready (End of Phase Q)** | Phase P + Q complete; Single Source of Truth repository active; all 6 rogue maps migrated; webhook HMAC & idempotency verified; E.164 Customer 360 identity graph verified. |
| **2. Live Messaging & Social Pilot Ready (End of Phase T)** | Phase S + T complete; real Telegram Bot + Meta WhatsApp/Messenger/Instagram adapters verified; 24-hour window enforced; Social Publishing Calendar + Maker-Checker approval workflow + Comment-to-Ticket escalation verified. |
| **3. Live Telephony Pilot Ready (End of Phase R)** | `AsteriskAriProvider` + `SIP.js` WebRTC Softphone + Visual IVR runtime + ACD Queue engine verified with real SIP audio calls over local Asterisk container and/or Egyptian SIP trunk gateway. |
| **4. Enterprise Production Ready (End of Phase Z)** | All Phases P–Z complete; 500-request multi-tenant stress test (`0` bleed, `P95 < 150ms`); PostgreSQL ACID migrations & automated point-in-time recovery verified; AI budget circuit breakers active. |
