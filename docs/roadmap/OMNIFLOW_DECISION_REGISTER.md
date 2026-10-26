# OMNIFLOW OS — STRATEGIC OWNER DECISION REGISTER
**Phase:** `OMNIFLOW-01` (Master Product Discovery, Forensic Baseline & Strategic Engineering Roadmap)  
**Baseline Commit:** `c19bcdc57280863a05c14e97e9454307e651bdae`  
**Audit Date:** 2026-10-23

---

## Purpose of This Register
During the forensic audit of OmniFlow OS, six strategic architectural and product decisions were identified that directly affect infrastructure cost, regulatory compliance in Egypt, and engineering sequencing. Each decision below presents the verified options, trade-offs, cost impact, and the **Architect's Recommended Default** so execution can proceed smoothly upon owner sign-off.

---

## `DEC-01` — Primary Operational Database & Single Source of Truth (Resolving the 4-Way Split-Brain)

- **Context & Problem:** Currently, the codebase has 4 disconnected persistence layers: (1) `server/db/store.ts` writing JSON to `/tmp/omniflow-data/db_state.json`, (2) 6 unpersisted `Map` objects in `server/api/router.ts`, (3) Drizzle PostgreSQL in `src/db/schema.ts` connected to Cloud SQL (unused by `/api/v1`), and (4) client-side Firestore in `src/lib/firestoreService.ts`.
- **Options:**
  - **Option A (Recommended): PostgreSQL (Cloud SQL / Self-Hosted Postgres) via Drizzle ORM as Primary SSOT + Deterministic JSON Fallback for Hermetic CI.** All `/api/v1` domain services read/write through a unified `IDataStore` repository backed by PostgreSQL in production and `/tmp/omniflow-data/db_state.json` during zero-dependency CI/offline tests. Client-side direct Firestore writes are deprecated in favor of backend REST + SSE (`/api/v1/stream`), while keeping `firestore.rules` intact for optional Firebase Auth/Edge sync.
  - **Option B: Firebase Firestore as Primary SSOT (via `firebase-admin` on Backend).** Migrate all 17+ backend collections to Firestore documents.
  - **Option C: Keep `/tmp/omniflow-data/db_state.json` as Primary Store.**
- **Trade-offs & Cost Impact:**
  - **Option A** provides full relational ACID transactions, complex BI/reporting joins, `pgvector` for semantic RAG, and zero vendor lock-in (`$0` software cost on any Linux VPS or provisioned Cloud SQL).
  - **Option B** incurs per-document read/write costs at high call/message volume and lacks relational SQL joins for WFM/BI analytics.
  - **Option C** loses data whenever a stateless container restarts or scales horizontally.
- **Architect's Recommendation:** **Approve Option A** (Implement unified `IDataStore` repository in **Phase P** with PostgreSQL primary + JSON fallback for CI).
- **Consequence of Deferral:** Any new features built on `router.ts` Maps or `/tmp` JSON will suffer data loss on container redeployment and remain disconnected from relational reporting.

---

## `DEC-02` — Egypt Telephony & PSTN Connectivity Architecture (NTRA Compliance & Lowest TCO)

- **Context & Problem:** Voice calls in `VoiceSoftphone.tsx` and `/api/v1/calls/*` are currently simulated (`[CAT-4]`). International CPaaS providers (Twilio, Vonage) do not offer self-serve two-way local Egyptian (`+20`) voice DIDs due to NTRA regulations, and public ISP links in Egypt frequently throttle unencrypted UDP SIP traffic on port 5060.
- **Options:**
  - **Option A (Recommended): Hybrid Provider-Neutral Architecture (`Asterisk/FreePBX` + `SIP.js` WebRTC over `WSS/TURN-TLS:443` + Optional `TwilioVoiceProvider`).** Build the `TelephonyGateway` in **Phase R** with first-class support for open-source **Asterisk 22 / FreePBX** (connecting to legal local Egyptian SIP trunks or FXO/GSM/E1 gateways from **WE / Vodafone / Orange / e&**) alongside a `TwilioVoiceProvider` adapter for international numbers and a `SimulatorTelephonyProvider` for free CI testing.
  - **Option B: Cloud CPaaS Only (Twilio / Telnyx / Vonage).** Build only REST/WebRTC adapters for global cloud providers.
  - **Option C: WebRTC Browser-to-Browser Only (No PSTN Phone Numbers).** Customers can only call via an in-app web link, not via standard `+20` mobile/landline dialing.
- **Trade-offs & Cost Impact:**
  - **Option A** has **`$0.00` software license cost**, works legally with Egyptian telecom lines billed in local EGP tariffs, bypasses ISP SIP blocking via WebRTC `WSS` + `TURN/TLS` on port 443, and still supports cloud CPaaS when needed.
  - **Option B** cannot provide local Egyptian `+20` PSTN termination for general businesses and costs `$0.08–$0.22/min` in USD for international routing.
- **Architect's Recommendation:** **Approve Option A** (`AsteriskAriProvider` + `TwilioVoiceProvider` + `SimulatorTelephonyProvider` behind `ITelephonyProvider` in **Phase R**).
- **Consequence of Deferral:** Voice softphone remains a visual simulation unable to place or receive real telephone calls.

---

## `DEC-03` — Priority Order for Real Omnichannel Messaging Connectors (`Phase S`)

- **Context & Problem:** Nine channels are listed in `ChannelIntegrationsView.tsx`, but external webhooks are currently blocked by auth middleware and outbound agent replies only save to memory. Building all 9 external adapters simultaneously would delay pilot launch.
- **Options:**
  - **Option A (Recommended — Tiered Wave Rollout):**
    - **Wave 1 (Immediate Pilot Core — 100% Free APIs + #1 Channel in Egypt):** (1) **WhatsApp Business Cloud API** (Official Meta Graph API), (2) **Facebook Pages Messenger & Instagram Professional DMs**, (3) **Telegram Bot API** (`100% Free`), (4) **Live WebChat Widget** (`100% Free`), and (5) **Email (Gmail/IMAP/SMTP Bridge)**.
    - **Wave 2 (Secondary Social Channels):** (6) **TikTok Business**, (7) **YouTube Data API v3 Comments**, and (8) **X (Twitter) BYO-Key Adapter** (kept optional because X API v2 Basic/Pro tiers cost `$200–$5,000/mo`).
  - **Option B:** Implement all 9 channels in a single monolithic phase before releasing any channel to pilot users.
- **Architect's Recommendation:** **Approve Option A** (Deliver Wave 1 in **Phase S** and Wave 2/Public Comments in **Phase T**).
- **Consequence of Deferral:** Attempting to integrate paid/restricted APIs like X (Twitter) alongside core WhatsApp/Meta channels will bottleneck Phase S delivery.

---

## `DEC-04` — Scope of Social Media Publishing, Scheduling & Campaign Management (`Phase T`)

- **Context & Problem:** OmniFlow OS currently has zero functionality for social content publishing, scheduling, or campaign management (`[CAT-6]`), which is a core requirement of the target product vision.
- **Options:**
  - **Option A (Recommended — Customer-Care Integrated Publishing & Campaign Hub):** Build a focused, high-impact Social Publishing & Campaign module supporting:
    1. Multi-channel Post Composer (text, images, video links, platform caption adaptation, UTM tracking).
    2. Editorial Calendar (Month/Week/List views) & Scheduled Background Publisher.
    3. Maker-Checker Approval Workflow (`agent` drafts -> `supervisor` approves).
    4. **Social Radar (Public Comment Moderation & Comment-to-Ticket Escalation):** Syncs comments on published posts, auto-flags negative/urgent comments via AI, and lets agents reply publicly, send a Private Reply DM, or convert the comment into a tracked support Ticket attributed to the campaign.
  - **Option B (Heavy Ad-Tech & Video Studio Suite):** Also build a full Meta Ads Manager media buying bidding engine and browser video editing timeline.
- **Trade-offs & Cost Impact:**
  - **Option A** delivers 100% of the operational synergy between Social Marketing and Customer Support (connecting campaigns to inbound comments, DMs, and support tickets) with zero extra infrastructure cost.
  - **Option B** duplicates Meta Ads Manager and CapCut/Canva at massive engineering complexity.
- **Architect's Recommendation:** **Approve Option A** for **Phase T**.

---

## `DEC-05` — AI Execution Mode, Privacy & Budget Governance (`Phase U`)

- **Context & Problem:** `server/modules/ai/gateway.ts` supports both `zeroCostMode` (local deterministic heuristics) and cloud `@google/genai` (`gemini-2.5-flash`). Enterprise tenants need strict guarantees that AI will neither overspend their monthly budget nor send unapproved autonomous messages to customers.
- **Options:**
  - **Option A (Recommended — Hybrid Governed AI with Automatic Zero-Cost Circuit Breaker):**
    - Default new tenants to **`Level 1 (Suggest to Agent)`** with PII redaction (`redactPII`) and prompt-injection guardrails strictly mandatory (`cannot be disabled`).
    - Allow tenants to enable **`Level 2 (Approve-to-Execute)`** and **`Level 3 (Controlled Autonomy for high-confidence FAQs >= 0.85)`** per channel.
    - Enforce a configurable per-tenant daily/monthly USD budget cap (`maxDailyCostUsd`); if reached or if no `GEMINI_API_KEY` is configured, seamlessly fall back to the deterministic local NLP engine (`zeroCostMode`) with zero downtime.
  - **Option B (Cloud LLM Only):** Require a paid cloud LLM API key for all operations and fail requests when quota is exceeded.
- **Architect's Recommendation:** **Approve Option A**.

---

## `DEC-06` — Multi-Tenant SaaS vs. Hybrid BYOC (Bring Your Own Carrier / Credentials) Model

- **Context & Problem:** In Egypt and MENA, enterprise clients often own their own NTRA-licensed SIP trunks, WhatsApp Business Phone Number IDs, and Facebook Pages, while smaller SMBs want quick self-serve onboarding.
- **Options:**
  - **Option A (Recommended — Multi-Tenant SaaS with Per-Tenant BYOC / BYO-Credentials Vault):**
    - Single multi-tenant OmniFlow OS codebase where each `Organization` (`organizationId`) stores its own encrypted channel tokens (`WhatsApp Phone Number ID`, `Meta Page Access Token`, `Telegram Bot Token`, `Asterisk ARI URL / SIP Trunk Credentials`, and optional `Gemini API Key`).
    - Also supports single-tenant on-premise/private-VPS deployment via Docker Compose for strict banking/government data residency.
  - **Option B (Single-Tenant Only):** Deploy a separate copy of the codebase and database for every customer.
- **Architect's Recommendation:** **Approve Option A** (Multi-tenant isolation is already proven across `identity.ts` and `firestore.rules`; completing per-tenant `channelConfigs` encryption in **Phase P** unlocks full BYOC multi-tenancy).

---

## Summary Sign-Off Table for Project Owner

| Decision ID | Decision Title | Recommended Choice | Target Phase |
| :--- | :--- | :--- | :--- |
| **`DEC-01`** | Primary Database & SSOT Architecture | **Option A:** Unified `IDataStore` with PostgreSQL (Drizzle) Primary + Atomic JSON CI Fallback | **Phase P** |
| **`DEC-02`** | Egypt Telephony & PSTN Architecture | **Option A:** Provider-Neutral `TelephonyGateway` (`Asterisk/FreePBX` + `SIP.js` WSS/TURN:443 + `Twilio` + `Simulator`) | **Phase R** |
| **`DEC-03`** | Omnichannel Messaging Rollout Order | **Option A:** Wave 1 (WhatsApp Cloud API, Messenger, Instagram, Telegram, WebChat, Email) -> Wave 2 (TikTok, YouTube, X BYO-Key) | **Phase S & T** |
| **`DEC-04`** | Social Publishing & Campaign Scope | **Option A:** Composer + Editorial Calendar + Maker-Checker Approvals + Comment-to-Ticket Attribution | **Phase T** |
| **`DEC-05`** | AI Autonomy & Budget Governance | **Option A:** 4-Level Autonomy Policy (Default Level 1 Suggest) + Mandatory PII Redaction + Auto Zero-Cost Fallback | **Phase U** |
| **`DEC-06`** | Tenancy & Carrier Credential Model | **Option A:** Multi-Tenant SaaS with Per-Tenant Encrypted BYOC Credentials + Docker On-Premise Support | **Phase P & Z** |
