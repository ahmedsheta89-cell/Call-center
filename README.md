# AI Contact Center OS (نظام تشغيل مراكز الاتصال وخدمة العملاء الذكي)

> **Enterprise AI-Powered Omnichannel Customer Operations & Contact Center Operating System**  
> Local-First by Design, Cloud-Ready, Multi-Tenant, Modular Monolith.

---

## 1. Vision & Core Philosophy (الرؤية وفلسفة النظام)

**AI Contact Center OS** is not a traditional call center dashboard or a superficial chatbot prototype. It is a unified **Customer Operations Operating System** engineered for enterprise reliability, high-density workflows, strict data governance, and intelligent human-AI collaboration.

### Core Architectural Axioms
1. **Modular Monolith**: Single deployable unit with strict logical module boundaries (Domain, Application, Infrastructure, UI/API), ready for zero-downtime decomposition into services if horizontal scaling demands.
2. **Local-First & Zero-Cost Mode**: The entire CRM, Ticketing, Knowledge Base, Rules Engine, QA, and Local AI can run fully offline on standard commodity hardware without cloud subscriptions or GPU requirements.
3. **Cloud-Ready Hybrid Scale**: Pluggable adapters enable seamless transition to Cloud SQL, Meta WhatsApp Cloud API, WebRTC/SIP Telephony (Asterisk/FreeSWITCH), and Cloud LLMs (Gemini / Anthropic / OpenAI) without touching business logic.
4. **Governed AI Execution**: AI never possesses untracked or autonomous write permissions for high-impact actions (refunds, customer deletion, permission escalation, campaigns). Every operation is subject to RBAC, Policy Engine, and Immutable Audit Logging.
5. **Human-in-the-Loop AI Copilot**: Real-time assistance, auto-summarization, sentiment tracking, and knowledge citations with explicit agent confirmation (Accept / Edit / Reject).

---

## 2. Omnichannel Topology (هيكلية القنوات الموحدة)

```
[Customer Channels]
WhatsApp Cloud API ──┐
Messenger / IG API ──┤
Voice (SIP/WebRTC) ──┼──> [Channel Adapters] ──> [Unified Message Model] ──> [Event Bus]
Email (SMTP/IMAP)  ──┤                                                          │
Web Chat Widget    ──┘                                                          ▼
                                                                     [Routing Engine]
                                                                                │
                                           ┌────────────────────────────────────┴────────────────────────────────────┐
                                           ▼                                                                         ▼
                                   [AI Copilot & Gate]                                                      [Unified Inbox]
                                 (Local or Cloud LLM)                                                    (Agent / Supervisor)
```

---

## 3. Directory Structure (هيكل المشروع)

```
├── docs/                        # Formal Architecture, DB, Security & Integration Specs
│   ├── ARCHITECTURE.md          # System Topology & Layering
│   ├── DATABASE.md              # PostgreSQL Relational DDL & Schemas
│   ├── SECURITY.md              # OWASP, RBAC Matrix, Tenant Isolation & Audit
│   ├── AI.md                    # AI Gateway, Routing, Prompts, Guardrails & Eval
│   ├── INTEGRATIONS.md          # WhatsApp, Messenger, Voice, Email Adapters
│   └── TESTING.md               # Unit, Integration, Load & AI Evaluation Strategy
├── server/                      # Modular Monolith Backend
│   ├── core/                    # Cross-cutting concerns (Tenant Context, Auth, Events, Logger)
│   ├── db/                      # Database Schema, Migrations, Seed Data & Repositories
│   ├── modules/
│   │   ├── identity/            # Multi-Tenancy, Users, Roles & Permissions (RBAC)
│   │   ├── crm/                 # Customers, Customer 360, Channel Identities, Timeline
│   │   ├── conversations/       # Omnichannel Threads, Messages, Internal Notes
│   │   ├── voice/               # Telephony Adapter, SIP/WebRTC State Machine, Transcripts
│   │   ├── tickets/             # Tickets, SLA Policies, Escalations
│   │   ├── knowledge/           # Knowledge Base, Chunking, Embeddings, Citations
│   │   ├── ai/                  # AI Gateway, Model Router, Prompts, Evaluator, Cost Tracker
│   │   ├── qa/                  # QA Rubrics, Evaluations, Compliance Audits
│   │   ├── coaching/            # Agent Coaching Plans, Roleplay Scenarios
│   │   ├── analytics/           # KPI Definitions, Real-time Aggregations, NL Analyst
│   │   ├── workforce/           # Shifts, Breaks, Attendance, Adherence & Occupancy
│   │   ├── automation/          # Trigger-Condition-Action Workflow Engine
│   │   └── audit/               # Immutable Security & Audit Log Engine
│   ├── api/v1/                  # Versioned REST API & WebSocket Event Handlers
│   └── server.ts                # Application Entry Point & Vite Middleware
├── src/                         # Frontend Application (React 19 + Tailwind CSS)
│   ├── components/              # High-density UI Components (Inbox, Customer 360, Voice Bar, etc.)
│   ├── lib/                     # Client API Client, State Management & Localization
│   └── types/                   # Shared TypeScript Interfaces & Enums
└── package.json                 # Dependency Manifest & Execution Scripts
```
