# Architecture Specification (المعمارية التقنية)

## 1. Architectural Style: Modular Monolith

AI Contact Center OS is structured as an **In-Process Modular Monolith**. Each business domain is encapsulated inside an autonomous module with:
- **Domain Layer**: Pure entities, value objects, domain rules, and domain events. Zero external framework dependencies.
- **Application Layer**: Use cases, command/query handlers, DTOs, and interfaces for repository/external ports.
- **Infrastructure Layer**: Concrete implementations of repositories (PostgreSQL / In-Memory adapter), external integrations (WhatsApp Cloud API, FreeSWITCH/Asterisk WebRTC, SMTP), and persistence mappers.
- **UI/API Layer**: Versioned REST API endpoints (`/api/v1/*`), WebSocket realtime push, and React 19 Frontend.

### Layer Separation Diagram

```
┌────────────────────────────────────────────────────────┐
│                      UI & API                          │
│     React 19 Frontend  /  REST /api/v1  /  WebSockets  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  APPLICATION LAYER                     │
│    Use Cases (Command & Query Handlers, Orchestrators) │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼─────────────┐   ┌─────────▼──────────────┐
│       DOMAIN LAYER        │   │  INFRASTRUCTURE LAYER  │
│  Entities, Aggregates,    │   │  Postgres / PGlite,    │
│  Domain Rules, Events     │   │  Meta API, SIP WebRTC, │
│                           │   │  Gemini SDK, Ollama    │
└───────────────────────────┘   └────────────────────────┘
```

---

## 2. Multi-Tenancy & Tenant Isolation

Every enterprise client belongs to an `Organization`.
- All database records contain an `organization_id` foreign key.
- The `TenantContext` middleware extracts the tenant from the authenticated session / JWT claims or API key.
- Multi-tenancy is enforced at the repository and query-filter layer:
  ```ts
  // Every database query is bound to the current Tenant Context
  const context = getTenantContext();
  const query = db.select().from(conversations).where(eq(conversations.orgId, context.orgId));
  ```
- Cross-tenant data leakage is strictly prohibited and verified by automated tenant boundary tests.

---

## 3. Communication Core & Unified Message Model

External channels (WhatsApp, Facebook Messenger, Instagram DM, Web Chat, Email, Voice) are normalized into the **Unified Message Model**:

```ts
interface UnifiedMessage {
  id: string;                         // UUID v4
  organizationId: string;             // Multi-tenant Org ID
  conversationId: string;             // Thread Aggregate ID
  customerId: string;                 // Unified Customer Profile
  channel: 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'webchat' | 'voice';
  direction: 'inbound' | 'outbound' | 'internal_note';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'system_event';
  body: string;
  sender: {
    id: string;
    type: 'customer' | 'agent' | 'bot' | 'system';
    name?: string;
  };
  attachments?: Array<{
    id: string;
    type: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    hashSha256: string;
  }>;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

---

## 4. Operational Telephony & Voice Architecture

Calls do not bypass the domain core. The system follows a decoupled telephony pipeline:
1. **Signaling & Media**: WebRTC client connects through the `TelephonyAdapter` port.
2. **PBX/SIP Bridge**: FreeSWITCH / Asterisk or Cloud SIP trunk proxy handles PSTN interconnect.
3. **Session Lifecycle**: Inbound/Outbound ring -> Answer -> In-Call (Hold, Mute, Warm Transfer, Blind Transfer, Conference) -> Wrap-up & Disposition.
4. **Post-Call Processing Pipeline**:
   - Audio Recording Storage (AES-256 encrypted at rest).
   - Speech-to-Text (STT) Transcription with speaker diarization (`agent` vs `customer`).
   - Automated AI Call Summarization, Sentiment extraction, and QA Rubric evaluation.

---

## 5. Event Bus & Decoupled Asynchronous Processing

Modules interact via an internal asynchronous **Event Bus**:
- `ConversationStartedEvent` -> triggers Routing Engine to match best available agent.
- `MessageReceivedEvent` -> triggers AI Copilot to generate suggestions & intent detection.
- `SlaThresholdWarningEvent` -> notifies Supervisor & escalates priority.
- `CallEndedEvent` -> queues transcription and AI QA evaluation.
