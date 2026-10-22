# مصفوفة الحقيقة المستقلة لقواعد البيانات (Dual-Layer Database Architecture & Truth Matrix)

## 1. الحقيقة التشغيلية الفعلية (4 طبقات متوازية)

يعمل نظام **OmniFlow AI Contact Center OS** وفق معمارية هجينة (Local-First + Dual Cloud Sync) تتألف من أربع طبقات مفحوصة وموثقة بالدليل:

| الطبقة | المسار / المعرف الفعلي | الحالة التشغيلية الحية | عدد الجداول / المجموعات | إجمالي الأعمدة / الحقول |
|---|---|---|---|---|
| **1. المخزن التشغيلي الحي (Runtime Primary Store)** | `server/db/store.ts` + `/tmp/omniflow-data/db_state.json` | **نشط 100% (المصدر التشغيلي الأساسي لـ Express API)** | **17 مجموعة** (16 Map + `AuditLogger`) | **165+ حقل تشغيلي** |
| **2. مخطط Drizzle ORM في الكود (Code Schema)** | `src/db/schema.ts` + `src/db/drizzle.config.ts` | **معرّف ومترجم برمجياً (غير مفعّل في المسارات الحية)** | **6 جداول علائقية** | **80 عموداً** |
| **3. قاعدة Cloud SQL PostgreSQL الحية (`public`)** | `ExecuteSql` (`information_schema.columns`) | **منشور جزئياً من ترحيل سابق (3 جداول فقط، 0 صفوف)** | **3 جداول حية** (`users`, `tickets`, `conversations`) | **22 عموداً منشوراً** |
| **4. قاعدة Firebase Firestore** | `ai-studio-omniflowaios-c7e77753-7b8a-41c8-a9ca-10f723452807` | **مربوط بالواجهة (`src/lib/firestoreService.ts`)** | **6 مسارات في `firebase-blueprint.json` و`DRAFT_firestore.rules`** | **78 حقل موثق في Blueprint** |

---

## 2. مقارنة مخطط PostgreSQL في الكود (`src/db/schema.ts`) مقابل المنشور فعلياً في Cloud SQL (`public`)

> **ملاحظة حوكمة الإنتاج:** التزاماً بعدم تنفيذ ترحيل حي (`DDL Migration`) على قاعدة الإنتاج دون موافقة المالك، لم يتم تشغيل `cloudsql-update-schema`، وتم توثيق الفارق الفعلي بدقة:

| اسم الجدول | في الكود (`src/db/schema.ts`) | في Cloud SQL الحي (`information_schema`) | عدد الصفوف في Cloud SQL الحي | الفجوة المكتشفة (Schema Drift) |
|---|---|---|---|---|
| `users` | **11 عموداً** (`id, uid, email, displayName, phoneNumber, role, teamName, status, isActive, createdAt, updatedAt`) | **6 أعمدة** (`id, uid, email, display_name, role, created_at`) | `0` | ينقص في السحابة: `phone_number, team_name, status, is_active, updated_at` + ينقص `organization_id` لعزل المؤسسات |
| `customers` | **13 عموداً** (`id, organizationId, name, email, phone, customerTier, lifetimeValue, assignedAgentId, assignedAgentName, accountNumber, city, createdAt, updatedAt`) | **غير منشور بعد** | — | الجدول موجود في `src/db/schema.ts` وبانتظار موافقة الترحيل |
| `tickets` | **16 عموداً** (`id, ticketNumber, customerId, customerName, customerPhone, title, description, category, priority, status, slaStatus, assignedAgent, assignedAgentName, firstResponseDueAt, resolutionDueAt, createdAt, updatedAt`) | **9 أعمدة** (`id, customer_id, title, category, priority, status, assigned_agent, created_at, updated_at`) | `0` | ينقص في السحابة: `ticket_number, customer_name, customer_phone, description, sla_status, assigned_agent_name, first_response_due_at, resolution_due_at` + ينقص `organization_id` |
| `conversations` | **16 عموداً** (`id, customerId, channel, customerName, customerPhone, customerTier, status, priority, assignedAgentId, subject, sentiment, intent, lastMessage, unreadCount, slaDueAt, timestamp`) | **7 أعمدة** (`id, channel, customer_name, customer_phone, status, last_message, timestamp`) | `0` | ينقص في السحابة: `customer_id, customer_tier, priority, assigned_agent_id, subject, sentiment, intent, unread_count, sla_due_at` + ينقص `organization_id` |
| `call_sessions` | **14 عموداً** (`id, customerId, customerName, agentId, direction, status, callerNumber, calleeNumber, durationSeconds, transcript, aiSummary, aiSentiment, disposition, startedAt`) | **غير منشور بعد** | — | الجدول موجود في `src/db/schema.ts` وبانتظار موافقة الترحيل |
| `audit_events` | **10 أعمدة** (`id, organizationId, actorId, actorType, action, entityType, entityId, ipAddress, requestId, createdAt`) | **غير منشور بعد** | — | الجدول موجود في `src/db/schema.ts` وبانتظار موافقة الترحيل |

---

## 3. مصفوفة المجموعات الـ 17 في المخزن التشغيلي الحي (`server/db/store.ts` + النسخ الاحتياطي)

تم تحديث `db.exportFullBackup()` و`db.importFullBackup()` في المرحلة الثانية ليشمل **`auditEvents`** (من `AuditLogger.exportAllEvents()`) إلى جانب الـ 16 Map الأساسية:

1. `organizations` (المؤسسات وإعدادات الذكاء الاصطناعي وميزانية الشهر)
2. `users` (المستخدمون والأدوار التسعة)
3. `teams` (فرق العمل)
4. `agents` (ملفات الوكلاء والمهارات والحالة اللحظية)
5. `customers` (سجلات العملاء 360°، معزولة بـ `organizationId`)
6. `customerChannels` (قنوات العملاء الموثقة)
7. `conversations` (المحادثات متعددة القنوات، معزولة بـ `organizationId`)
8. `messages` (الرسائل الموحدة والـ Internal Notes، معزولة بـ `organizationId`)
9. `calls` (جلسات الاتصال الصوتي WebRTC/SIP، معزولة بـ `organizationId`)
10. `tickets` (التذاكر ومؤقتات الـ SLA، معزولة بـ `organizationId`)
11. `slaPolicies` (سياسات اتفاقيات مستوى الخدمة)
12. `knowledgeDocuments` (وثائق قاعدة المعرفة والـ Chunks لـ RAG)
13. `qaRubrics` (معايير تقييم الجودة)
14. `qaEvaluations` (بطاقات تقييم الجودة)
15. `automationRules` (قواعد الأتمتة والتوجيه الذكي)
16. `shifts` (جدول المناوبات والتنبؤ Erlang C)
17. `auditEvents` (سجل التدقيق الأمني غير القابل للتعديل مع سلسلة تجزئة `SHA-256` متسلسلة `prevHash -> integrityHash`)
