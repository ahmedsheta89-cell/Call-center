# OMNIFLOW OS — مصفوفة قدرات وحقيقة وظائف المنصة (Feature Capability & Truth Matrix)

**Classification:** Architectural, Operational & Forensic Truth Register  
**Environment:** Local Windows 10 Workstation (Local-First Mode)  
**Standard:** Zero False Claims • Explicit Simulation Transparency • Strict Capability Verification  

---

## 1. تصنيف الوظائف والقدرات الحالية (Feature Classification Summary)

تم تدقيق ومراجعة كافة مكونات ووحدات **OmniFlow OS** في بيئة العمل الحقيقية وفصل الواقع البرمجي الفعلي عن المحاكاة والتوثيق النظري:

| الوحدة / الخاصية | الحالة الحقيقية (Status) | الآلية التشغيلية المعتمدة محلياً | دليل التدقيق / موقع الكود |
| :--- | :---: | :--- | :--- |
| **إدارة العملاء والملف الشامل (CRM 360°)** | **IMPLEMENTED AND VERIFIED** | مكتمل ويعمل محلياً عبر `db.customers` و`db.customerChannels` مع عزل المستأجر `orgId`. | `server/api/router.ts:440-690` |
| **التذاكر ومؤقتات الخدمة (Tickets & SLA)** | **IMPLEMENTED AND VERIFIED** | مكتمل ويعمل محلياً، حساب فترات الاستجابة وحالات التصعيد بدقة. | `server/api/router.ts:980-1100` |
| **صندوق الوارد الموحد (Unified Inbox)** | **IMPLEMENTED AND VERIFIED** | مكتمل، يدعم المحادثات والرسائل والملاحظات الداخلية `internal_notes`. | `server/api/router.ts:690-790` |
| **سجل التدقيق الأمني (Audit Chain)** | **IMPLEMENTED AND VERIFIED** | تجزئة متسلسلة غير قابلة للتلاعب `SHA-256 (prevHash -> integrityHash)` وموقعة بـ HMAC. | `server/core/audit.ts` |
| **حوكمة الصلاحيات (9-Role RBAC)** | **IMPLEMENTED AND VERIFIED** | مصفوفة صلاحيات تفصيلية ومحكمة ومفحوصة بالكامل (Owner, Admin, Supervisor, Agent...). | `server/core/rbac.ts` |
| **بث الأحداث المباشر (Real-Time Push)** | **IMPLEMENTED AND VERIFIED** | يعمل عبر تقنية `Server-Sent Events (SSE)` على المسار `/api/v1/stream`. | `server/api/router.ts:163-197` |
| **محرك حفظ البيانات المحلي (Persistence Engine)** | **IMPLEMENTED AND VERIFIED** | كتابة ذرية مع `fsyncSync` وقفل `db_state.lock` وتعافي من النسخ الاحتياطية `.bak`. | `server/db/localPersistenceEngine.ts` |
| **الاتصالات الصوتية (Telephony & Voice)** | **SIMULATED (Sandbox)** | محاكاة داخلية لدورة حياة المكالمة (Ringing, Answer, Transcript, Summary) دون خطوط SIP/WebRTC حقيقية. | `server/api/router.ts:805-870` |
| **تكامل واتساب (WhatsApp Cloud API)** | **SIMULATED (Sandbox)** | محاكاة محلية للمقاييس وحساب الديمو، استقبال Webhook محلي دون اتصال خارجي بـ Meta Graph API. | `server/api/router.ts:1564-1610` |
| **تنفيذ إجراءات الأتمتة (Automation Execution)** | **PARTIALLY IMPLEMENTED (Simulated Dispatch)** | مطابقة شروط القواعد مفعلة، لكن تنفيذ الإجراءات الخارجية محاكى في الاستجابة فقط. | `server/api/router.ts:2400-2445` |
| **الذكاء الاصطناعي المحلي (Local AI)** | **IMPLEMENTED (Rule-Based Heuristic)** | يعمل عبر تعبيرات نمطية وقواعد لغوية فائقة السرعة لتحليل المشاعر والتلخيص واقتراحات المساعد. | `server/modules/ai/gateway.ts:205-260` |
| **محول Ollama للذكاء الاصطناعي** | **NOT IMPLEMENTED** | مذكور في التوثيق والعقود، لكن لا يوجد كود اتصال فعلي بخادم Ollama HTTP. | `docs/AI.md` (مستقبلي) |
| **قاعدة بيانات PostgreSQL الحية** | **NOT CONNECTED AT RUNTIME** | مخطط Drizzle موجود في `src/db/schema.ts` لكن الخادم يعتمد كلياً على `DatabaseStore`. | `src/db/schema.ts` |
| **مزامنة Firestore السحابية** | **DISABLED / OPTIONAL IN LOCAL** | وضع المزامنة السحابية معطل افتراضياً في الوضع المحلي المستقل لضمان العمل دون إنترنت. | `src/lib/firestoreService.ts` |

---

## 2. تفصيل حالة كل وحدة تشغيلية

### A. إدارة العملاء والتذاكر (CRM & Tickets)
* **الحالة:** `IMPLEMENTED AND VERIFIED`
* تدعم العمليات الكاملة (CRUD)، البحث بالاسم والهاتف، إضافة وسوم وملاحظات، وحساب أوقات انتهاء اتفاقيات مستوى الخدمة (SLA).
* البيانات مخزنة محلياً ويتم حفظها واسترجاعها تلقائياً مع كل إعادة تشغيل.

### B. الاتصالات الهاتفية والسنترال السحابي (Telephony Sandbox)
* **الحالة:** `SIMULATED`
* لا توجد خطوط هاتف أرضية أو خادم PBX/Asterisk متصل.
* الغرض: تمكين وكيل مركز الاتصال من اختبار سيناريو المكالمات، وتدوين الملاحظات، وتجربة توليد الملخص التلقائي دون تكبد تكاليف المكالمات الحقيقية.
* إقرار الشفافية: تم تعديل واجهة الاستجابة لتتضمن حقل `"mode": "SIMULATION_SANDBOX"`.

### C. قنوات التواصل وواتساب (WhatsApp Integration)
* **الحالة:** `SIMULATED`
* لا يتم إرسال رسائل فعلية عبر خوادم Meta Graph API.
* معرّف WABA المعروض ومعدل التسليم 99.4% هي بيانات استرشادية لبيئة الديمو.
* يتم التعامل مع رسائل الواتساب الواردة عبر محاكي محلي آمن لا يطلب أي مفاتيح سرية حقيقية.

### D. الذكاء الاصطناعي (AI Gateway)
* **الحالة الحالية:** `RULE-BASED HEURISTIC NLP` (قائم على القواعد والتعبيرات اللغوية)
* في غياب مفتاح `GEMINI_API_KEY`، يعمل النظام تلقائياً على محرك الذكاء الاصطناعي المحلي القائم على الكلمات المفتاحية باللغة العربية والإنجليزية.
* ميزة هذا المحرك:
  1. سرعة فائقة (زمن استجابة أقل من 5 مللي ثانية).
  2. تكلفة صفرية مضمونة (0.00 USD).
  3. حماية تامة للبيانات والخصوصية وعدم خروج أي بايت خارج الجهاز.
* الترقية إلى Local LLM عبر Ollama (مثل نموذج Qwen 2.5 Coder 1.5B/3B الملائم لمعالج i7-4790) موثقة كخطوة تالية اختيارية تتطلب تثبيت Ollama مسبقاً.
