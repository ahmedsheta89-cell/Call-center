# منظومة الأمان، صلاحيات RBAC، وعزل المستأجرين (`docs/SECURITY.md`)

## 1. مصفوفة الأدوار والصلاحيات (9 Roles × 30 Permissions)

يُطبّق محرك `server/core/rbac.ts` التحقق الصارم عبر `assertPermission(role, explicitPermissions, requiredPermission)` ويرمي خطأ `AuthorizationError` (`HTTP 403 FORBIDDEN`) عند عدم توفر الصلاحية:

| الدور (Role) | الصلاحيات الممنوحة | القيود الأمنية المفروضة (Phase 1 & Phase 2) |
|---|---|---|
| `Owner` | جميع الـ 30 صلاحية شاملة `billing.manage` و`settings.manage` | صلاحيات كاملة ضمن المؤسسة |
| `Admin` | 29 صلاحية (جميع الصلاحيات ما عدا `billing.manage`) | إدارة الإعدادات، القنوات، استعادة النسخ الاحتياطية، ومزامنة GitHub |
| `Supervisor` | 28 صلاحية شاملة `call.whisper_barge`, `ticket.escalate`, `wfm.manage`, `settings.manage` | إشراف كامل، تصعيد التذاكر، وإدارة المناوبات |
| `Team Leader` | 18 صلاحية تشغيلية وإشرافية (`conversation.assign`, `ticket.assign`, `wfm.manage`) | ممنوع من `settings.manage` و`call.whisper_barge` |
| `Agent` | 13 صلاحية تشغيلية (`customer.*`, `conversation.reply`, `call.make`, `ticket.create/update/escalate`) | ممنوع من `settings.manage`, `wfm.manage`, `audit.read`, `call.whisper_barge` |
| `QA` | 12 صلاحية تقييم وجودة (`qa.evaluate`, `qa.rubric.manage`, `coaching.plan.manage`, `audit.read`) | **تم منعه في المرحلة 2 من `/system/restore` و`/system/reset-seed` (تتطلب `settings.manage`)** |
| `Analyst` | 6 صلاحيات قراءة وتحليل (`analytics.read`, `analytics.export`, `audit.read`) | **تم منعه في المرحلة 2 من `/system/restore` و`/system/reset-seed`** |
| `Read Only` | 5 صلاحيات قراءة فقط (`customer.read`, `conversation.read`, `call.read`, `ticket.read`, `analytics.read`) | **محظور 100% (`HTTP 403`) من جميع عمليات الإنشاء والتعديل والتحكم بالمكالمات وتنفيذ وحدات الكتابة** |
| `AI Agent` | 6 صلاحيات مقيدة (`ticket.create`, `ai.suggest` + قراءة) | معزول بحواجز `AIGateway` وفلتر `redactPII` |

---

## 2. الإصلاحات الأمنية المثبتة في المرحلة الثانية (Phase 2 Security Gates)

1. **إغلاق ثغرة استعادة/مسح النظام بواسطة أدوار القراءة التدقيقية (`QA` / `Analyst`):**
   - المسارات `POST /api/v1/system/restore` و`POST /api/v1/system/reset-seed` أصبحت تشترط `settings.manage` بدلاً من `audit.read`.
2. **التحقق الصارم من صحة الدور في `POST /api/v1/auth/switch-role`:**
   - أي دور غير معرّف في `ROLE_PERMISSIONS` يُرفض فوراً بـ `HTTP 400 INVALID_INPUT`.
3. **عزل المؤسسات (`Tenant Isolation`) عبر جميع المسارات:**
   - فحص `organizationId === currentActor.organizationId` في `GET /customers/:id`, `GET /customers/:id/timeline`, `GET /conversations/:id/messages`, `POST /conversations/:id/reply`, `POST /macros/:id/execute`, `POST /tickets`, `PUT /tickets/:id`, `POST /wfm/shifts/:id/status`, `POST /integrations/whatsapp/send-template`, و`POST /demo/run-scenario`.
4. **تنقيح الأسرار والبيانات الحساسة (`PII & Secret Redaction`):**
   - `AIGateway.redactPII`: يحجب أرقام البطاقات البنكية (`[REDACTED_CARD]`)، الرقم القومي (`[REDACTED_NATIONAL_ID]`)، ورموز التحقق (`[REDACTED_OTP]`).
   - `AuditLogger` + `GET /integrations/channels`: يحجب أي مفتاح يحتوي على `password|secret|token|apikey|authorization` ويستبدله بـ `[REDACTED_SECRET]`.
5. **سلسلة التجزئة غير القابلة للتعديل (`SHA-256 Hash Chain`):**
   - كل حدث في `AuditLogger` يُجمّد عبر `Object.freeze` ويرتبط بالحدث السابق عبر `prevHash` و`integrityHash`، ويُفحص عبر `AuditLogger.verifyChainIntegrity()`.
6. **بوابة أمان Firestore (`DRAFT_firestore.rules`):**
   - إغلاق ثغرة `organizationId` الاختياري واجتياز جميع اختبارات **Dirty Dozen (12/12 Blocked)** في `server/test/firestore-rules-audit.ts`.

---

## 3. التحصينات الأمنية الإضافية في المرحلة الثالثة (Phase 3 Security & Concurrency Hardening)

1. **عزل سياق الطلب المتزامن (`AsyncLocalStorage Concurrency Isolation`):**
   - استبدال المتغير العام `let currentActor` في `server/api/router.ts` بـ `AsyncLocalStorage<typeof sessionActor>` مع `Proxy` شفاف، مما يمنع تسرب هوية المستأجر (`x-organization-id`) أو الدور (`x-user-role`) بين الطلبات غير المتزامنة المتداخلة (`0/50 Context Bleed` تحت ضغط 50 طلباً متوازياً).
2. **التحقق التشفيري من بصمة المحتوى (`Canonical Payload SHA-256 Re-computation`):**
   - ترقية `AuditLogger.verifyChainIntegrity()` لإعادة حساب تجزئة `SHA-256` للحمولة القياسية (`canonicalPayload`) لكل حدث بالإضافة إلى فحص سلسلة `prevHash`، ورفض استعادة أي نسخة احتياطية متلاعب بأحداثها في `POST /api/v1/system/restore` برمز `HTTP 400 TAMPERED_AUDIT_CHAIN`.
3. **حراسة المسارات الثانوية وتصفية المستأجرين في محرك الـ 22 وحدة:**
   - فرض `settings.manage` على `GET /api/v1/github/export-bundle`، و`ticket.create` على `POST /api/v1/platforms/register-device` و`POST /api/v1/platforms/sync-state`، و`conversation.read` على جميع مسارات القراءة والتشخيص لمنع تمرير أدوار غير صالحة عبر الترويسات (`HTTP 403`).
   - فرض تصفية `organizationId === currentActor.organizationId` في جميع فروع `POST /api/v1/system/execute-function` (`recommendations`, `automation`, `knowledge_base`, `wfm`, `qa`) وفي `GET /api/v1/admin/profile` (`HTTP 404` للمؤسسات الخارجية).
4. **بوابات التحديث المحددة (`Action-Based affectedKeys().hasOnly()`) في `DRAFT_firestore.rules` وعميل Firestore:**
   - إضافة قيود `incoming().diff(existing()).affectedKeys().hasOnly([...])` على جميع المجموعات الأربع القابلة للتحديث (`users`, `customers`, `tickets`, `conversations`)، وتحصين استعلامات `src/lib/firestoreService.ts` بفلتر `where('organizationId', '==', safeOrgId)` وتطهير المعرفات `sanitizeFirestoreId`.

