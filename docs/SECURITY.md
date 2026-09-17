# Security & RBAC Specification (الأمان وإدارة الصلاحيات)

## 1. Security-by-Design Architecture

The AI Contact Center OS enforces a multi-layered security perimeter adhering strictly to **OWASP ASVS 4.0** and **OWASP Top 10 API Security** guidelines:

1. **Zero Secret Exposure**: Zero API keys, JWT secrets, or provider credentials in Git, client bundles, or frontend localStorage.
2. **Strict Tenant Isolation**: All queries validate `organization_id` context. Attempted cross-tenant access returns `403 Forbidden` and records an immediate `security_event`.
3. **Immutable Audit Trail**: All privileged actions (`delete`, `permission_change`, `export`, `refund`, `settings_update`, `ai_override`) append immutable records to `audit_events` with actor fingerprint, before/after JSON states, IP, and Request ID.
4. **Input Sanitization & Output Encoding**: SQL injection prevented via parameterized statements and ORM abstractions. XSS prevented via strict HTML escaping in messages and knowledge chunks.
5. **Webhook Integrity**: Webhook signatures (e.g. Meta HMAC-SHA256 `X-Hub-Signature-256`, SIP auth) validated prior to deserialization.

---

## 2. Granular Role-Based Access Control (RBAC Matrix)

### System Roles
- **Owner**: Complete organizational sovereignty, billing, and tenant configuration.
- **Admin**: User management, system policies, integration credentials.
- **Supervisor**: Live monitoring, whisper/barge call operations, team queues, escalations.
- **Team Leader**: Shift scheduling, agent assignment, team performance review.
- **Agent**: Omnichannel inbox, Customer 360 view, conversation reply, ticket creation.
- **QA Analyst**: QA rubric design, conversation evaluation, scoring calibration.
- **AI Coach**: Coaching plans, training scenarios, agent skill progression.
- **Business Analyst**: BI metrics, custom KPI queries, export reports.
- **Read Only**: Read-only oversight for compliance auditors.
- **AI Agent**: Restricted machine agent acting under defined governance policies.

### Permission Matrix Table

| Module | Permission Key | Owner | Admin | Supervisor | Team Lead | Agent | QA | Analyst | AI Agent |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Customer** | `customer.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `customer.create` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | `customer.update` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | `customer.delete` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Conversation** | `conversation.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| | `conversation.reply` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ (Policy) |
| | `conversation.assign`| ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (Routing)|
| | `conversation.close` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Telephony** | `call.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| | `call.listen` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| | `call.whisper_barge`| ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Tickets** | `ticket.create` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| | `ticket.escalate` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| | `ticket.delete` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **QA** | `qa.evaluate` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ (Draft) |
| | `qa.approve` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **AI Gateway** | `ai.suggest` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `ai.execute` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `ai.policy.manage`| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit** | `audit.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Settings** | `settings.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. AI Permission Levels & Boundaries

AI is strictly quarantined into distinct execution tiers:
1. **READ**: Read incoming context, historical messages, customer metadata.
2. **SUGGEST**: Provide recommendations, draft messages, intent tags, ticket categories to the agent workspace.
3. **CREATE**: Create draft tickets or proposed notes.
4. **EXECUTE**: Allowed ONLY for low-risk, policy-whitelisted actions (e.g. tagging conversation, calculating sentiment).
5. **APPROVE**: FORBIDDEN for AI. All refunds, critical data alterations, customer deletions, or mass outreach require verified human authorization.
