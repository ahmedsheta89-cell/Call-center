# Database Schema & Relational Model (PostgreSQL DDL)

AI Contact Center OS uses a strict, normalized relational model designed for PostgreSQL (version 15+).

## 1. Schema Design Principles
- **Primary Keys**: UUID v4 (`gen_random_uuid()`) for distributed safety.
- **Tenant Isolation**: Mandatory `organization_id` foreign key on all data tables.
- **Auditability**: `created_at`, `updated_at`, `created_by`, `updated_by` on all business entities.
- **Soft Delete**: `deleted_at TIMESTAMP WITH TIME ZONE NULL` for recoverable deletions.
- **Optimistic Locking**: `version INT DEFAULT 1 NOT NULL` on critical mutable tables (Customers, Tickets).
- **Integrity**: Strict Foreign Keys with `ON DELETE RESTRICT` or `ON DELETE CASCADE` where logically sound.

---

## 2. Table Schemas (DDL Overview)

### Identity & Access (RBAC)
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'standard' NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(organization_id, name)
);

CREATE TABLE permissions (
    id VARCHAR(100) PRIMARY KEY, -- e.g. 'conversation.reply', 'ticket.escalate'
    module VARCHAR(50) NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone_number VARCHAR(50),
    is_active BOOLEAN DEFAULT true NOT NULL,
    mfa_enabled BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL,
    UNIQUE(organization_id, email)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, role_id)
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    lead_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'offline' NOT NULL, -- online, busy, break, offline
    skills TEXT[] DEFAULT '{}' NOT NULL,
    languages TEXT[] DEFAULT '{"ar", "en"}' NOT NULL,
    max_concurrency INT DEFAULT 4 NOT NULL,
    current_active_chats INT DEFAULT 0 NOT NULL,
    current_active_calls INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### Customers & 360 Degree Profiles
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    customer_tier VARCHAR(50) DEFAULT 'standard' NOT NULL, -- vip, priority, standard
    lifetime_value NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}' NOT NULL,
    custom_fields JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_customers_org_phone ON customers(organization_id, phone);
CREATE INDEX idx_customers_org_email ON customers(organization_id, email);

CREATE TABLE customer_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- 'whatsapp', 'messenger', 'instagram', 'email', 'voice'
    external_identifier VARCHAR(255) NOT NULL, -- phone, psid, handle, email
    is_verified BOOLEAN DEFAULT false NOT NULL,
    last_interaction_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(customer_id, channel_type, external_identifier)
);

CREATE TABLE customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    note TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### Conversations & Unified Messages
```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'open' NOT NULL, -- 'queued', 'open', 'pending', 'resolved', 'closed'
    priority VARCHAR(50) DEFAULT 'medium' NOT NULL, -- 'low', 'medium', 'high', 'urgent'
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    sentiment VARCHAR(50) DEFAULT 'neutral',
    intent VARCHAR(100),
    sla_due_at TIMESTAMPTZ NULL,
    last_message_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_conversations_org_status ON conversations(organization_id, status);
CREATE INDEX idx_conversations_agent ON conversations(assigned_agent_id);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound', 'internal_note'
    type VARCHAR(50) DEFAULT 'text' NOT NULL, -- 'text', 'image', 'audio', 'document', 'system'
    body TEXT NOT NULL,
    sender_type VARCHAR(50) NOT NULL, -- 'customer', 'agent', 'bot', 'system'
    sender_id UUID NULL,
    delivery_status VARCHAR(50) DEFAULT 'delivered' NOT NULL, -- 'pending', 'sent', 'delivered', 'read', 'failed'
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);
```

### Telephony & Voice Calls
```sql
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
    status VARCHAR(50) NOT NULL, -- 'ringing', 'in_progress', 'completed', 'missed', 'abandoned'
    caller_number VARCHAR(50) NOT NULL,
    callee_number VARCHAR(50) NOT NULL,
    duration_seconds INT DEFAULT 0 NOT NULL,
    recording_url TEXT,
    transcript TEXT,
    disposition VARCHAR(100), -- 'resolved', 'callback_requested', 'escalated', 'wrong_number'
    ai_summary TEXT,
    ai_sentiment VARCHAR(50),
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ended_at TIMESTAMPTZ NULL
);
```

### Tickets & SLA Management
```sql
CREATE TABLE sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    first_response_time_minutes INT NOT NULL,
    resolution_time_minutes INT NOT NULL,
    business_hours_only BOOLEAN DEFAULT true NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ticket_number SERIAL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'new' NOT NULL, -- 'new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'
    priority VARCHAR(50) DEFAULT 'medium' NOT NULL,
    category VARCHAR(100) NOT NULL,
    first_response_due_at TIMESTAMPTZ,
    resolution_due_at TIMESTAMPTZ,
    sla_status VARCHAR(50) DEFAULT 'healthy' NOT NULL, -- 'healthy', 'warning', 'at_risk', 'breached'
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    resolved_at TIMESTAMPTZ NULL
);
```

### AI Gateway, Models & Evaluation
```sql
CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 'local_heuristic', 'local_ollama', 'cloud_gemini', 'cloud_openai'
    provider_type VARCHAR(50) NOT NULL, -- 'local', 'cloud'
    base_url TEXT,
    is_enabled BOOLEAN DEFAULT true NOT NULL,
    cost_per_1k_input_tokens NUMERIC(8, 4) DEFAULT 0.0000 NOT NULL,
    cost_per_1k_output_tokens NUMERIC(8, 4) DEFAULT 0.0000 NOT NULL,
    monthly_budget_limit NUMERIC(10, 2) DEFAULT 100.00 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE ai_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_type VARCHAR(100) NOT NULL, -- 'copilot_suggest', 'supervisor_alert', 'qa_evaluation', 'summarization'
    provider VARCHAR(100) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    input_tokens INT DEFAULT 0 NOT NULL,
    output_tokens INT DEFAULT 0 NOT NULL,
    cost_usd NUMERIC(8, 5) DEFAULT 0.00000 NOT NULL,
    latency_ms INT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'circuit_broken', 'budget_exceeded'
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### QA, Coaching, Workforce, Automation & Audit
```sql
CREATE TABLE qa_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    criteria JSONB NOT NULL, -- Array of { category, weight, questions }
    passing_score NUMERIC(5, 2) DEFAULT 80.00 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE qa_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rubric_id UUID NOT NULL REFERENCES qa_rubrics(id),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    evaluator_type VARCHAR(50) NOT NULL, -- 'ai_evaluator', 'human_supervisor'
    evaluator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    total_score NUMERIC(5, 2) NOT NULL,
    passed BOOLEAN NOT NULL,
    findings JSONB DEFAULT '[]'::jsonb NOT NULL,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID NULL,
    actor_type VARCHAR(50) NOT NULL, -- 'user', 'agent', 'ai', 'system'
    action VARCHAR(100) NOT NULL, -- 'customer.delete', 'refund.execute', 'permission.change'
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_audit_org_created ON audit_events(organization_id, created_at DESC);
```
