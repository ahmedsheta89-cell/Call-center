# AI Contact Center OS (نظام تشغيل مراكز الاتصال وخدمة العملاء الذكي — OmniFlow OS)

> **Enterprise AI-Powered Omnichannel Customer Operations & Contact Center Operating System**  
> Local-First by Design, Cloud-Ready (PostgreSQL Drizzle + Firebase Firestore), Multi-Tenant, RBAC-Governed Modular Monolith.

---

## 1. Vision & Core Architectural Axioms (الرؤية والمرتكزات المعمارية)

1. **Modular Monolith (`server.ts` + `server/api/router.ts`)**: Single deployable unit with strict logical boundaries, Express 4 async error boundary, and request-scoped RBAC & Multi-Tenant isolation.
2. **Dual-Layer Persistence & Schema Governance**:
   - **Runtime Operational Store (`server/db/store.ts`)**: 17 operational collections (16 Maps + `auditEvents` in backup) persisted to `/tmp/omniflow-data/db_state.json` to keep the Git working tree 100% clean.
   - **PostgreSQL Drizzle ORM Schema (`src/db/schema.ts`)**: 6 normalized relational tables (`users`, `customers`, `tickets`, `conversations`, `call_sessions`, `audit_events` — 80 columns in code; 3 tables / 22 columns currently deployed in live Cloud SQL awaiting approved DDL migration).
   - **Firestore Blueprint & Security Rules (`firebase-blueprint.json`, `firestore.rules`, `DRAFT_firestore.rules`)**: 5 entities across 6 collection paths, verified by `server/test/firestore-rules-audit.ts` (12/12 Dirty Dozen payloads blocked).
3. **Governed AI & PII Redaction (`server/modules/ai/gateway.ts`)**: Automatic scrubbing of credit card numbers (`[REDACTED_CARD]`), national IDs (`[REDACTED_NATIONAL_ID]`), and OTPs (`[REDACTED_OTP]`) prior to LLM routing.
4. **Cryptographic Immutable Audit Trail (`server/core/audit.ts`)**: Every sensitive mutation is frozen via `Object.freeze`, scrubbed of secrets/tokens, and linked via a tamper-evident SHA-256 hash chain (`prevHash` -> `integrityHash`).

---

## 2. Exact Project Structure (الهيكل الفعلي للمشروع)

```text
├── .github/workflows/ci.yml     # Automated GitHub Actions CI (Lint, Build, Security & E2E Audit)
├── docs/                        # Formal Architecture, DB, Security & Testing Specs
│   ├── ARCHITECTURE.md          # System Topology & Layering
│   ├── DATABASE.md              # 4-Layer Database Truth Matrix (Runtime Store, Drizzle, Live Cloud SQL, Firestore)
│   ├── SECURITY.md              # 9-Role RBAC Matrix, Tenant Isolation, PII Redaction & Audit Chain
│   ├── SECURITY_SPEC_FIRESTORE.md # Firestore Zero-Trust Spec & Dirty Dozen Red Team Report
│   ├── AI.md                    # AI Gateway, Routing, Prompts, Guardrails & Eval
│   ├── INTEGRATIONS.md          # WhatsApp, Messenger, Voice, Email Adapters
│   └── TESTING.md               # Reproducible Verification Commands & Test Suites
├── scripts/
│   └── test_all_operations.ts   # Live HTTP E2E Operational Verification Runner (33 Assertions)
├── server/                      # Modular Monolith Backend
│   ├── api/router.ts            # Versioned REST API (/api/v1/*), RBAC Guards & 22-Module Engine
│   ├── core/
│   │   ├── audit.ts             # SHA-256 Hash-Chained Immutable Audit Logger & Secret Redactor
│   │   ├── events.ts            # Real-Time Server-Sent Events (SSE) EventBus
│   │   ├── rbac.ts              # 9-Role Granular Permission Matrix & AuthorizationError
│   │   └── types.ts             # Canonical Backend Domain Interfaces
│   ├── db/
│   │   ├── seed.ts              # Realistic Enterprise Seed Dataset (100 Customers, 25 Convs, 12 Tickets)
│   │   └── store.ts             # In-Memory + /tmp JSON Persistence Engine (17 Collections with Audit Backup)
│   ├── modules/ai/gateway.ts    # Multi-Provider AI Router & Pre-Execution PII Redaction Filter
│   └── test/
│       ├── firestore-rules-audit.ts # Firestore Dirty Dozen (12/12) Red Team & Structural Verifier
│       └── run-enterprise-audit.ts  # Independent Schema, Security, RBAC, PII, Firestore & Load Test Runner
├── src/                         # Frontend Application (React 19 + TypeScript + Tailwind CSS 4)
│   ├── components/              # 29 High-Density Enterprise UI Views & Modals
│   ├── db/                      # Drizzle ORM PostgreSQL Schema (schema.ts) & Config
│   ├── lib/                     # Firebase SDK, Firestore Service (handleFirestoreError), PWA Hook & OAuth
│   └── App.tsx                  # Main 22-Module Workspace Layout
├── firestore.rules              # Active Cloud Firestore Security Rules (Unmodified in Production)
├── DRAFT_firestore.rules        # Hardened Zero-Trust ABAC Firestore Ruleset (Verified 12/12 Dirty Dozen)
├── firebase-blueprint.json      # Canonical Firestore Entity & Collection Blueprint (5 Entities, 6 Paths)
├── server.ts                    # Express + Vite / Static Production Entry Point (Port 3000)
└── package.json                 # Dependencies & Verification Scripts
```

---

## 3. Running, Building & Independent Verification (التشغيل والاختبار بالدليل)

```bash
# 1. Start development server (Port 3000)
npm run dev

# 2. Run strict TypeScript check (Zero errors)
npm run lint

# 3. Build production client & server bundle (dist/ + dist/server.cjs)
npm run build

# 4. Run Independent Enterprise Security, RBAC, Tenant Isolation, PII & 22-Module Audit
npm run test:audit

# 5. Run Live HTTP End-to-End Operational Suite against running server
npm run test:e2e
```
