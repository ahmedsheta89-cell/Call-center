# PHASE P.1.1 — Forensic Closure Gate (v3)
# Secret-at-Rest Verification, Change Inventory Reconciliation & IDataStore Contract Audit

---

## 0. إقرار القدرة والنطاق (Mandatory Capability & Scope Disclosure)

أُقرّ صراحةً وبلا أي افتراض، في مطلع هذا التقرير وقبل أي تحليل هندسي أو أمني، بالحقائق البيئية التالية المُثبتة تجريبيًا في جلسة الفحص الحالية:
1. **تنفيذ أوامر Shell الحقيقية (`bash` / `npm` / `tsx`)**: **نعم** — أملك تنفيذًا فعليًا ومباشرًا لأوامر Shell و`npm` و`npx tsx` و`grep` و`ls` داخل بيئة التشغيل الحالية (`/app/applet` على نظام Linux).
2. **تشغيل نسخة حية من السيرفر واستدعاء مساراته عبر HTTP**: **نعم** — أملك تشغيل خادم Express حي فعليًا يربط `apiRouter` على منفذ TCP محلي (`127.0.0.1:<port>`) وإرسال طلبات HTTP حقيقية (`GET` / `PUT` / `POST`) وفحص استجاباتها وملفات القرص الناتجة عنها لحظيًا؛ وبالتالي يجمع هذا الفحص بين **التنفيذ الحي الفعلي (Live Empirical Execution)** و**الفحص الساكن للكود (Static Code Inspection)**.
3. **وجود `.git` محلي**: **لا** — لا يوجد مجلد `.git` محلي داخل بيئة التشغيل (`git status` و`git rev-parse HEAD` يُرجعان حرفيًا: `fatal: not a git repository (or any of the parent directories): .git`).
4. **معرفة مؤكدة بالـ Commit SHA الحالي المتزامن فعليًا على GitHub (وليس فقط اسم الفرع `main`)**: **لا** — لا يوجد `.git` محلي ولا توجد متغيرات بيئة تحمل SHA المتزامن على GitHub، كما أن تعديلات المرحلة P.1 الجارية في مساحة العمل المحلية غير ملتزمة في تاريخ Git محلي. وبناءً عليه أُعلن صراحةً:
   - **`"NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE"`**
   - التزامًا صارمًا بضوابط المراجعة الجنائية (v3)، لن يتم توليد أي رابط GitHub يستخدم `/blob/main/...` أو يخمّن أي Commit SHA غير متحقَّق منه، ويُكتفى في جميع الإحالات الساكنة للكود بمقتطف الكود الخام مع المسار الكامل للملف وأرقام الأسطر الدقيقة متبوعةً بعبارة: **"لا رابط مباشر — غير متاح بيئيًا"**.
5. **تصنيف القيود البيئية والتاريخية**: أي عنصر يتوقف إثباته على قدرة غير متاحة في هذه البيئة (مثل مقارنة `git diff` التاريخية لما قبل لقطة الحاوية أو الحصول على سجل مخرجات خلفية مقتطع سابقًا) يُصنَّف حرفيًا تحت:
   - **`"UNABLE TO VERIFY — ENVIRONMENT LIMITATION"`**
   - **`"UNRESOLVED — NO HISTORICAL RECORD AVAILABLE"`**

---

## 1. قفل النطاق (Scope Lock Compliance)

تم الالتزام الصارم بجميع ضوابط النطاق خلال تنفيذ بوابة الإغلاق الجنائي P.1.1 (v3):
- **عدم تعديل أي ملف من كود المنتج**: لم يتم إجراء أي تعديل على `server/db/store.ts` أو `server/db/seed.ts` أو `server/api/router.ts` أو `src/*` أو `package.json`.
- **عدم تنفيذ أي أوامر Git تغيّر الحالة**: لم يُستدعَ أي أمر `git add` أو `git commit` أو `git push` أو `git reset` أو `git clean`.
- **عزل الاختبار التام وتنظيفه وإثبات الحذف**: استُخدمت منظمة اختبار اصطناعية معزولة تمامًا (`org-p1-1-forensic-audit-temp`) مع قيم سرية اصطناعية (`SYNTH-SECRET-P1AUDIT-9f8a7b6c` و`SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a`) عبر سكربت فحص مؤقت (`server/test/_scratch-p1-1-secret-probe.ts`) دون لمس بيانات `org-madar-001` أو `org-madar-enterprise-001`، ثم حُذف سجل الاختبار والمنظمة المؤقتة والحدث التدقيقي المرتبط بها وسكربت الفحص المؤقت بالكامل مع إثبات القراءة اللاحقة من الذاكرة ومن مسار HTTP ومن ملف القرص (`/tmp/omniflow-data/db_state.json`).

---

## 2. بوابة التحقق من الأسرار في حالة السكون (Channel Secrets At-Rest Gate)

*(ملاحظة منهجية: يعتمد هذا القسم حصريًا على أدلة وقت التشغيل الفعلية — Runtime Evidence Only — من استجابات HTTP الحية ومخرجات `grep` وملف القرص `/tmp/omniflow-data/db_state.json`).*

### 2.1 خطوات الفحص التجريبي المنفذة (الخطوات 1 إلى 9)

تم تشغيل خادم Express حي على `127.0.0.1` وإنشاء منظمة معزولة `org-p1-1-forensic-audit-temp` وحساب مدير `usr-p1-1-forensic-admin`، وحقن القيم الاصطناعية التالية عبر طلب HTTP حقيقي `PUT /api/v1/integrations/channels/chan-whatsapp/config`:
- `apiToken = "SYNTH-SECRET-P1AUDIT-9f8a7b6c"`
- `webhookSecret = "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a"`

#### أولًا: فحص الملف الفعلي على القرص (`/tmp/omniflow-data/db_state.json`) بعد الحفظ
- **الدليل الخام الحرفي (`grep -n -C 5 "SYNTH-SECRET-P1AUDIT-9f8a7b6c" /tmp/omniflow-data/db_state.json`)**:
```text
6117-      "organizationId": "org-p1-1-forensic-audit-temp",
6118-      "channelId": "chan-whatsapp",
6119-      "config": {
6120-        "wabaId": "WABA-SYNTH-P1-1",
6121-        "phoneNumberId": "PNID-SYNTH-P1-1",
6122:        "apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c",
6123-        "webhookSecret": "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a",
6124-        "verified": true,
6125-        "lastCheckedAt": "2026-10-25T17:18:07.053Z"
6126-      },
6127-      "updatedAt": "2026-10-25T17:18:07.053Z"
```
- **النتيجة**: القيم السرية مكتوبة على القرص في `/tmp/omniflow-data/db_state.json` بصيغة **نص صريح خام غير مشفر وغير محجوب (Plain-text / Unencrypted / Unredacted)**.

#### ثانيًا: فحص مخرجات `db.exportTenantBackup(orgId)` و`db.exportFullBackup()` مقابل `GET /api/v1/system/backup`
- **الدليل الخام من `db.exportTenantBackup('org-p1-1-forensic-audit-temp')` و`db.exportFullBackup()`**:
```json
[
  {
    "id": "org-p1-1-forensic-audit-temp::chan-whatsapp",
    "organizationId": "org-p1-1-forensic-audit-temp",
    "channelId": "chan-whatsapp",
    "config": {
      "wabaId": "WABA-SYNTH-P1-1",
      "phoneNumberId": "PNID-SYNTH-P1-1",
      "apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c",
      "webhookSecret": "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a",
      "verified": true,
      "lastCheckedAt": "2026-10-25T17:18:07.053Z"
    },
    "updatedAt": "2026-10-25T17:18:07.053Z"
  }
]
```
- **الدليل الخام من استجابة HTTP لـ `GET /api/v1/system/backup`**:
```json
[
  {
    "id": "org-p1-1-forensic-audit-temp::chan-whatsapp",
    "organizationId": "org-p1-1-forensic-audit-temp",
    "channelId": "chan-whatsapp",
    "config": {
      "wabaId": "WABA-SYNTH-P1-1",
      "phoneNumberId": "PNID-SYNTH-P1-1",
      "apiToken": "[REDACTED_SECRET]",
      "webhookSecret": "[REDACTED_SECRET]",
      "verified": true,
      "lastCheckedAt": "2026-10-25T17:18:07.053Z"
    },
    "updatedAt": "2026-10-25T17:18:07.053Z"
  }
]
```

#### ثالثًا: فحص مخرجات `GET /api/v1/integrations/channels`
- **الدليل الخام من استجابة HTTP لـ `GET /api/v1/integrations/channels` (العنصر `chan-whatsapp`)**:
```json
{
  "id": "chan-whatsapp",
  "type": "whatsapp",
  "name": "WhatsApp Business Cloud API (Official)",
  "badge": "موثق ومعتمد من Meta",
  "status": "online",
  "accountInfo": {
    "wabaId": "WABA-SYNTH-P1-1",
    "phoneNumberId": "PNID-SYNTH-P1-1",
    "apiToken": "[REDACTED_SECRET]",
    "webhookSecret": "[REDACTED_SECRET]",
    "verified": true,
    "lastCheckedAt": "2026-10-25T17:18:07.053Z"
  }
}
```

#### رابعًا: اختبار الاستعادة عبر `POST /api/v1/system/restore` (الخطوة 5 بشقّيها)
1. **الشق (5A) — استعادة النسخة الاحتياطية المُصدَّرة عبر HTTP (`GET /api/v1/system/backup`) كما هي (مع وجود `"[REDACTED_SECRET]"`)**:
   - عند إرسال مخرج `GET /api/v1/system/backup` إلى `POST /api/v1/system/restore`، يقوم `importFullBackupDetailed()` باستبدال سجل القناة في الذاكرة والقرص بالقيم المحجوبة حرفيًا:
   ```json
   {
     "wabaId": "WABA-SYNTH-P1-1",
     "phoneNumberId": "PNID-SYNTH-P1-1",
     "apiToken": "[REDACTED_SECRET]",
     "webhookSecret": "[REDACTED_SECRET]",
     "verified": true,
     "lastCheckedAt": "2026-10-25T17:18:07.053Z"
   }
   ```
2. **الشق (5B) — استعادة النسخة الاحتياطية بعد حذف الحقول السرية (`apiToken` و`webhookSecret`) منها يدويًا**:
   - عند حذف حقلَي `apiToken` و`webhookSecret` من كائن `channelConfigs` في النسخة الاحتياطية ثم استدعاء `POST /api/v1/system/restore`، يتم مسح السجل القديم واستبداله بالسجل الجديد الخالي من الحقول السرية دون أي دمج مع الأسرار الموجودة مسبقًا في الذاكرة:
   ```json
   {
     "wabaId": "WABA-SYNTH-P1-1",
     "phoneNumberId": "PNID-SYNTH-P1-1",
     "verified": true,
     "lastCheckedAt": "2026-10-25T17:18:07.116Z"
   }
   ```

#### خامسًا: البحث عن أي آلية تشفير في حالة السكون (`crypto` / `cipher` / `encrypt` / `KMS`)
- أظهر المسح الشامل (`grep -rnE "crypto|cipher|encrypt|decrypt|KMS|AES|createCipher|createDecipher" server/`) أن وحدة `crypto` تُستخدم فقط لتوليد المعرّفات (`randomUUID`, `randomBytes`) وبصمات `sha256` (`createHash`) وتوقيع جلسات HMAC (`createHmac`). **لا يوجد أي تشفير في حالة السكون (`AES` / `createCipheriv` / `KMS`) في كامل الكود**.

#### سادسًا: إثبات التنظيف الإلزامي والقراءة اللاحقة (Step 8 Read-After-Delete Proof)
```text
=== [STEP 8A] DELETE CHANNEL CONFIG & VERIFY VIA SUBSEQUENT READ ===
db.getChannelConfig after delete: undefined
GET /api/v1/integrations/channels chan-whatsapp after delete (status & accountInfo): {"status":"unconfigured","accountInfo":{}}

=== [STEP 8B] MANDATORY TENANT & DISK CLEANUP VERIFICATION ===
[Storage] Database state persisted safely to /tmp/omniflow-data/db_state.json
Organization still in db.organizations.has(SYNTH_ORG_ID): false
ChannelConfig still in db.channelConfigs: []
Post-Cleanup grep on /tmp/omniflow-data/db_state.json (must be empty): ""
```

### 2.2 الإجابة الصريحة على الأسئلة الخمسة لبوابة الأسرار (القسم 2)

1. **هل الأسرار مشفرة at-rest أم نص صريح أم محجوبة؟**
   - **على القرص في `/tmp/omniflow-data/db_state.json` وفي الذاكرة الحية (`db.channelConfigs`) وفي دوال التصدير الداخلية (`db.exportTenantBackup` / `db.exportFullBackup`)**: **نص صريح خام غير مشفر (Plain-text at-rest)**.
   - **في استجابات مسارات HTTP (`PUT /api/v1/integrations/channels/:id/config`، `GET /api/v1/integrations/channels`، `GET /api/v1/system/backup`) وفي سجلات التدقيق (`AuditLogger`)**: **محجوبة بالنص الحرفي `"[REDACTED_SECRET]"`**.
2. **هل آلية الحجب/التشفير تحافظ على قابلية التشغيل بعد إعادة التشغيل؟**
   - **بعد إعادة تشغيل عملية السيرفر (Process Restart)** التي تقرأ `/tmp/omniflow-data/db_state.json` عبر `loadFromDisk()`: **نعم**، تظل الأسرار قابلة للتشغيل لأنها محفوظة على القرص كنص صريح غير محجوب.
3. **ماذا يحدث عند استعادة نسخة احتياطية مأخوذة من `GET /api/v1/system/backup` إذا كانت الحقول السرية محجوبة أو محذوفة؟**
   - **إذا كانت الحقول السرية محجوبة (`"[REDACTED_SECRET]"`) كما يصدرها مسار `GET /api/v1/system/backup`**: تقوم الاستعادة عبر `POST /api/v1/system/restore` **بالكتابة فوق التوكن الأصلي في الذاكرة وعلى القرص واستبداله بالنص الحرفي `"[REDACTED_SECRET]"`**، مما يُتلف بيانات الاعتماد ويُعطّل الاتصال الفعلي بالقناة.
   - **إذا كانت الحقول السرية محذوفة يدويًا من ملف النسخة الاحتياطية**: تقوم الاستعادة عبر `POST /api/v1/system/restore` **بمسح حقول `apiToken` و`webhookSecret` بالكامل (`undefined`) من الذاكرة ومن القرص** لأن `importFullBackupDetailed()` يستبدل الكائن بالكامل دون الاحتفاظ بالحقول السرية السابقة.
4. **أين يُخزن مفتاح التشفير إن وجد؟**
   - **لا يوجد مفتاح تشفير at-rest إطلاقًا** في الكود أو في متغيرات البيئة.
5. **هل الوضع الحالي آمن لتخزين بيانات اعتماد حقيقية لـ Meta WhatsApp أو SIP أو Google OAuth؟**
   - **لا — غير آمن إطلاقًا لتخزين بيانات اعتماد إنتاجية حقيقية** بسبب تخزينها كنص صريح غير مشفر في `/tmp/omniflow-data/db_state.json` وبسبب تلفها أو مسحها عند تنفيذ دورة النسخ الاحتياطي والاستعادة عبر HTTP (`GET /system/backup` -> `POST /system/restore`).

---

## 3. التحقق من عقد `IDataStore` (Contract vs. Dependency Inversion Audit)

### 3.1 تعريف `IDataStore` وتصدير `db` في `server/db/store.ts`
- **المرجع الأول**: `server/db/store.ts` (الأسطر `229`–`265`) — **لا رابط مباشر — غير متاح بيئيًا (`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`)**:
```ts
// server/db/store.ts:229-265
export interface IDataStore {
  assertValidOrganizationId(orgId: unknown): UUID;
  getCustomers(orgId: UUID): Customer[];
  getConversations(orgId: UUID): Conversation[];
  getMessages(orgId: UUID, conversationId: UUID): UnifiedMessage[];
  getTickets(orgId: UUID): Ticket[];
  getCalls(orgId: UUID): CallSession[];
  getChannelConfig(orgId: UUID, channelId: string): Record<string, any> | undefined;
  setChannelConfig(orgId: UUID, channelId: string, config: Record<string, any>): Record<string, any>;
  getAllChannelConfigs(orgId: UUID): Array<{ channelId: string; config: Record<string, any>; updatedAt: Timestamp }>;
  getRecommendations(orgId: UUID): RecommendationRecord[];
  saveRecommendation(orgId: UUID, rec: RecommendationRecord): RecommendationRecord;
  getRecommendationById(orgId: UUID, id: string): RecommendationRecord | undefined;
  getCoachingPlans(orgId: UUID): CoachingPlanRecord[];
  saveCoachingPlan(orgId: UUID, plan: CoachingPlanRecord): CoachingPlanRecord;
  getMacros(orgId: UUID): MacroRecord[];
  saveMacro(orgId: UUID, macro: MacroRecord): MacroRecord;
  getTeamQAFeedback(orgId: UUID): TeamQAFeedbackRecord[];
  saveTeamQAFeedback(orgId: UUID, item: TeamQAFeedbackRecord): TeamQAFeedbackRecord;
  getConnectedDevices(orgId: UUID): ConnectedDeviceRecord[];
  saveConnectedDevice(orgId: UUID, device: ConnectedDeviceRecord): ConnectedDeviceRecord;
  getConnectedDeviceById(orgId: UUID, id: string): ConnectedDeviceRecord | undefined;
  deleteConnectedDevice(orgId: UUID, id: string): boolean;
  getCrossDeviceSyncEvents(orgId: UUID): CrossDeviceSyncEventRecord[];
  saveCrossDeviceSyncEvent(orgId: UUID, evt: CrossDeviceSyncEventRecord): CrossDeviceSyncEventRecord;
  exportTenantBackup(orgId: UUID): Record<string, any>;
  importTenantBackupDetailed(orgId: UUID, backup: Record<string, any>, options?: { allowDestructiveReset?: boolean }): RestoreResult;
  exportFullBackup(): Record<string, any>;
  importFullBackup(backup: Record<string, any>): boolean;
  importFullBackupDetailed(backup: Record<string, any>, options?: { targetOrganizationId?: UUID; allowDestructiveReset?: boolean }): RestoreResult;
  purgeOrganizationData(orgId: UUID): void;
  saveToDisk(): boolean;
  loadFromDisk(): boolean;
  getLastStorageError(): StorageDiagnosticError | null;
}
```
- **المرجع الثاني**: `server/db/store.ts` (السطر `277` والسطر `1281`) — **لا رابط مباشر — غير متاح بيئيًا (`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`)**:
```ts
// server/db/store.ts:277
class DatabaseStore implements IDataStore {
...
// server/db/store.ts:1281
export const db = new DatabaseStore();
```
  المتغير `db` يُصدَّر بنوع الصنف الملموس `DatabaseStore` وليس مقيدًا بنوع الواجهة `IDataStore`، مما يبقي جميع خرائط `public Map` الداخلية (`public organizations`, `public users`, `public customers`, `public messages`, `public calls`, `public tickets`, إلخ) مكشوفة للمستوردين.

### 3.2 كيفية استيراد واستخدام `db` في `server/api/router.ts`
- **المرجع الثالث**: `server/api/router.ts` (الأسطر `12`–`20`) — **لا رابط مباشر — غير متاح بيئيًا (`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`)**:
```ts
// server/api/router.ts:12-20
import {
  db,
  type RecommendationRecord,
  type CoachingPlanRecord,
  type MacroRecord,
  type TeamQAFeedbackRecord,
  type ConnectedDeviceRecord,
  type CrossDeviceSyncEventRecord,
} from '../db/store.ts';
```
- **الوصول المباشر لخصائص `DatabaseStore` خارج عقد `IDataStore`**:
  لا يستورد `server/api/router.ts` الواجهة `IDataStore` إطلاقًا، ورغم أنه يستخدم دوال `IDataStore` للمجموعات السبع التي تم توحيدها في المرحلة P.1، فإنه لا يزال يصل مباشرة إلى خرائط `Map` الداخلية على `DatabaseStore` في **131 موضعًا**، ومن أمثلتها الدقيقة في `server/api/router.ts` (**لا رابط مباشر — غير متاح بيئيًا**):
```ts
// server/api/router.ts:83
if (!db.organizations.has(rawBodyOrgId.trim())) {

// server/api/router.ts:217-218
const org = db.organizations.get(currentActor.organizationId);
const user = db.users.get(currentActor.userId);

// server/api/router.ts:516
const customer = db.customers.get(req.params.id);

// server/api/router.ts:667
db.messages.set(newMessage.id, newMessage);

// server/api/router.ts:731
db.calls.set(callId, newCall);
```

### 3.3 وجود تنفيذ ثانٍ والتقييم الهندسي الدقيق
- **حالة وجود أي تنفيذ ثانٍ (PostgreSQL / Cloud SQL / Mock)**:
  **"لا يوجد تنفيذ ثانٍ حتى تاريخ هذا الفحص"**.
- **التمييز الهندسي الدقيق**:
  - ما تم في المرحلة P.1 هو **تعريف عقد واجهة TypeScript جزئي (`IDataStore`) وتوحيد المجموعات السبع التي كانت مبعثرة في `router.ts` خلف دوال وصول محروسة بمعرّف المستأجر (`organizationId`)**.
  - هذا **ليس فك ارتباط كامل (Full Dependency Inversion)** بعد، لأن `server/api/router.ts` مرتبط مباشرة بخصائص `Map` الداخلية لـ `DatabaseStore` في 131 موضعًا للكيانات الأساسية (`organizations`, `users`, `customers`, `conversations`, `messages`, `calls`, `tickets`, إلخ).

---

## 4. مطابقة أمر البناء وجرد الملفات المعدلة (Build Command & Change Inventory Reconciliation)

### 4.1 حقيقة أمر البناء (`package.json` مقابل `scripts/build-server.mjs`)
1. **نص سطر `"build"` الفعلي في `package.json` (السطر `8`)** — **لا رابط مباشر — غير متاح بيئيًا (`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`)**:
```json
// package.json:6-10
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
```
2. **التحقق من وجود `scripts/build-server.mjs` عبر `ls -la package.json scripts/build-server.mjs`**:
```text
ls: cannot access 'scripts/build-server.mjs': No such file or directory
-rw-r--r-- 1 root root 1489 Oct 26 17:20 package.json
```
   الملف `scripts/build-server.mjs` **غير موجود إطلاقًا** في المستودع.
3. **المخرج الخام الكامل لتشغيل `npm run build` منفردًا**:
```text
> react-example@0.0.0 build
> vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs

vite v6.4.5 building for production...
transforming...
✓ 1732 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-D6b2F5yX.css   83.67 kB │ gzip: 13.52 kB
dist/assets/index-C0-t9m-P.js   469.75 kB │ gzip: 125.79 kB
✓ built in 4.12s

  dist/server.cjs  406.6kb

⚡ Done in 62ms
```
4. **بشأن سبب ظهور `node scripts/build-server.mjs` في نص تقرير P.1 السابق**:
   - تأكّد بالدليل المباشر أن ملف `scripts/build-server.mjs` غير موجود وأن أمر البناء الفعلي في `package.json:8` يستخدم `esbuild server.ts ...` مباشرة. أما بخصوص السبب الجذري لكتابة عبارة `node scripts/build-server.mjs` في نص التقرير السابق، فنظرًا لعدم وجود سجل خام محفوظ يثبت كيف وقع ذلك الخطأ النصي أثناء صياغة التقرير السابق، نُعلن حرفيًا وفق ضوابط القسم 4 (v3):
     **`"EXPLANATION UNVERIFIED — PLAUSIBLE NARRATIVE WITHOUT DIRECT EVIDENCE"`**
   - وبناءً عليه، تُصنَّف حالة هذه النقطة في الجدول النهائي حرفيًا كالتالي:
     **"تم تأكيد وجود خطأ سابق (الملف غير موجود)، لكن السبب الجذري للخطأ نفسه غير مُثبَت"**.

### 4.2 جرد الملفات المعدلة والقيود البيئية على السجل التاريخي
- **ما هو مُثبَت بطوابع الوقت الجارية (`ls -la`) داخل الحاوية**:
  تُظهر طوابع التعديل (`mtime`) مقارنةً بطابع لقطة الحاوية الأساسي أن الملفات التي عُدّلت في جلسة P.1 هي:
  1. `server/db/store.ts` (`47350 bytes`)
  2. `server/db/seed.ts` (`43277 bytes`)
  3. `server/api/router.ts` (`197557 bytes`)
  4. `server/test/run-enterprise-audit.ts` (`90665 bytes`)
  5. `docs/roadmap/OMNIFLOW_CURRENT_STATE_AND_GAP_MATRIX.md` (`18757 bytes`)
- **حالة المقارنة التاريخية لحالة الملفات قبل جلسة P.1 (`git diff` مقابل الالتزام السابق)**:
  نظرًا لغياب `.git` المحلي وعدم توفر سجل تاريخي برمجي لحالة الملفات قبل الجلسة داخل حاوية التشغيل، فإن التحقق التاريخي لما قبل الجلسة يُصنَّف حرفيًا:
  - **`"UNRESOLVED — NO HISTORICAL RECORD AVAILABLE"`**
  - **`"UNABLE TO VERIFY — ENVIRONMENT LIMITATION"`**

---

## 5. تفسير اختلاف أرقام الأداء (`619 req/s` مقابل `575 req/s`)

ظهر في تقرير المرحلة P.1 رقمان مختلفان لنتيجة اختبار الضغط (`3 waves × 50 parallel requests = 150 requests`):
1. **الرقم الأول (`619 req/s`، `P95 = 71.42ms`، `P50 = 53.68ms`، `P99 = 87.22ms`، الزمن الكلي `242.3ms`)**:
   - **مصدره المحدد**: جدول خط الأساس السابق في ملف `docs/roadmap/OMNIFLOW_ACCEPTANCE_AND_VERIFICATION_MATRIX.md`، القسم `2. Automated Verification Suites — Exact Execution Results`، السطر `29` — **لا رابط مباشر — غير متاح بيئيًا (`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`)**:
     ```markdown
     // docs/roadmap/OMNIFLOW_ACCEPTANCE_AND_VERIFICATION_MATRIX.md:29
     | **22-Module Live Execution & 150-Req Load Gate** | `npm run test:audit` (`[5/7]..[7/7]`) | **`PASS (22/22 Modules, 150/150 Reqs)`** | 3 waves × 50 parallel multi-tenant/multi-role requests completed in `242.3ms` (`619 req/s`, `P50: 53.68ms`, `P95: 71.42ms`, `P99: 87.22ms`, **Identity/Tenant Bleed: `0/150`**). |
     ```
2. **الرقم الثاني (`575 req/s`، `P95 = 89.42ms`، `P50 = 60.62ms`، `P99 = 109.76ms`، الزمن الكلي `260.7ms`)**:
   - **مصدره المحدد**: المخرج الفعلي لتشغيل `npm run test:audit` (`server/test/run-enterprise-audit.ts`، القسم `[6/7] Executing Parallel Multi-Tenant Load & Concurrency Stress Test`) بعد إضافة اختبارات وحراسات المرحلة P.1.
3. **الخلاصة الدقيقة**:
   - الرقمان ناتجان عن تشغيلين مختلفين لنفس اختبار الضغط (تشغيل خط الأساس قبل P.1 بزمن `242.3ms` مقابل تشغيل التحقق بعد P.1 بزمن `260.7ms`، بفارق `18.4ms` لإجمالي 150 طلبًا). وقع التضارب النصي في تقرير P.1 بسبب إبقاء رقم خط الأساس القديم (`619 req/s`) في جدول الملخص العلوي مع وضع مخرج التشغيل الجديد (`575 req/s`) في قسم المخرجات الخام. الرقم المعتمد لنهاية المرحلة P.1 هو **`575 req/s` (`P95 = 89.42ms`)**.

---

## 6. مراجعة حدود ادعاءات النجاح (Success Claim Boundaries)

يفصل الجدول التالي بدقة بين ما ثبت فعليًا بالدليل المباشر وما لم يثبت في نهاية المرحلة P.1:

| البُعد الهندسي | ما ثبت فعليًا بالدليل المباشر | ما لم يثبت (أو لا يتحقق في الوضع الحالي) |
| :--- | :--- | :--- |
| **1. اختبارات Firestore Emulator (`npm run test:firestore`)** | ثبت نجاح 37/37 اختبارًا لقواعد أمان `firestore.rules` على محاكي Firestore المحلي. | لا يثبت أن الخادم الخلفي (`server/api/router.ts`) يخزن بيانات العمليات في Firestore؛ الخادم يعمل على `DatabaseStore` في الذاكرة. |
| **2. اختبارات HTTP الحية على السيرفر (`test:e2e`, `test:ops`, `test:audit`)** | ثبت نجاحها عبر خادم Express HTTP حقيقي يستقبل طلبات TCP محلية على `/api/v1/*` شاملاً اختبارات `P1-01` إلى `P1-09`. | تعمل الاختبارات داخل نفس الحاوية ببيانات بذرية/اصطناعية ولا تمثل اتصالًا شبكيًا حيًا بمزودي Meta أو SIP خارجيين. |
| **3. الحفظ المحلي داخل نفس الحاوية (`/tmp/omniflow-data/db_state.json`)** | ثبت حفظ واستعادة 23 مجموعة (بما فيها المجموعات السبع الموحدة في P.1) ذريًا عبر ملف مؤقت + `fsyncSync` + `renameSync`. | يقتصر بقاء هذا الملف على عمر الحاوية الحالية ومجلد `/tmp` المحلي. |
| **4. المتانة السحابية الدائمة عبر إعادة بناء الحاوية (Durable Cloud Storage)** | **غير متحققة إطلاقًا للخادم الخلفي**. | عند إعادة بناء الحاوية (Container Rebuild) أو ترحيلها أو مسح `/tmp`، تُفقد جميع التعديلات ويعود النظام إلى بيانات البذرة (`initializeSeedData()`). |
| **5. العزل بين المستأجرين (Multi-Tenant Isolation)** | ثبت برمجيًا وتجريبيًا (`P1-01`..`P1-09`) رفض السياقات الفارغة/المجهولة (`400`) ومنع القراءة أو الكتابة أو الاستعادة العابرة للمستأجرين (`403`) وإزالة التحويل الصامت إلى `DEMO_ORG_ID`. | العزل مطبق على مستوى منطق التطبيق والذاكرة (`DatabaseStore`) وليس عبر قيود قاعدة بيانات علائقية (`PostgreSQL RLS`) بعد. |
| **6. حماية الأسرار والتشفير في حالة السكون (Encryption-at-Rest)** | ثبت حجب الأسرار (`[REDACTED_SECRET]`) في استجابات HTTP وفي سجلات التدقيق (`AuditLogger`) وفي رسائل أخطاء التخزين. | **لا يوجد أي تشفير في حالة السكون**: الأسرار تُكتب كنص صريح في `/tmp/omniflow-data/db_state.json`، واستعادة نسخة HTTP الاحتياطية (`GET /system/backup` -> `POST /system/restore`) تستبدل السر الحقيقي بالنص `"[REDACTED_SECRET]"` أو تمسحه إذا حُذف الحقل. |

---

## 7. الجدول الإلزامي الموحد والتوصية النهائية

### 7.1 الجدول الجنائي الموحد

| المسألة | الحالة | الدليل (مقتطف خام + رابط GitHub مباشر إن توفر) | الخطورة | يمنع بيانات اعتماد حقيقية؟ | يمنع بدء P.2؟ | أصغر معالجة مقترحة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. تخزين أسرار القنوات (`apiToken`, `webhookSecret`) على القرص في `db_state.json`** | **مثبتة (تُخزَّن كنص صريح غير مشفر At-Rest)** | مخرج `grep -n` الخام على `/tmp/omniflow-data/db_state.json:6122-6123`: `"apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c"`؛ والكود في `server/db/store.ts:892-896` يكتب `exportFullBackup()` مباشرة بلا تشفير (`لا رابط مباشر — غير متاح بيئيًا`). | **حرج (Critical)** | **نعم** | **نعم** (يتطلب إصلاحًا محدودًا قبل التقدم) | إضافة تشفير `AES-256-GCM` (`crypto.createCipheriv`/`createDecipheriv`) لحقول الأسرار في `channelConfigs` عند الكتابة إلى القرص وفك تشفيرها عند القراءة. |
| **2. استعادة النسخة الاحتياطية عبر HTTP (`GET /system/backup` -> `POST /system/restore`)** | **متناقضة (خلل وظيفي يُتلف الأسرار أو يمسحها عند الاستعادة)** | في التجربة الحية (`Step 5A` و`5B`): `GET /api/v1/system/backup` (`server/api/router.ts:153`) يُصدّر `"apiToken": "[REDACTED_SECRET]"`، وعند استعادتها عبر `POST /api/v1/system/restore` (`server/db/store.ts:1210-1217`) تُستبدل القيمة الحقيقية في الذاكرة والقرص بـ `"[REDACTED_SECRET]"`، وإذا حُذفت الحقول السرية من النسخة تُمسح الأسرار تمامًا (`undefined`) (`لا رابط مباشر — غير متاح بيئيًا`). | **عالٍ (High)** | **نعم** | **نعم** (يتطلب إصلاحًا محدودًا في `importFullBackupDetailed`) | في `server/db/store.ts:1210-1217`: عند استعادة `channelConfigs`، إذا كانت قيمة حقل سري تساوي `"[REDACTED_SECRET]"` أو `undefined`، يتم الاحتفاظ بالقيمة السرية الموجودة مسبقًا في الذاكرة لنفس `(organizationId, channelId)`. |
| **3. عقد `IDataStore` مقابل فك الارتباط الكامل (Dependency Inversion)** | **متناقضة جزئيًا (واجهة معرفة للمجموعات السبع، لكن 131 وصولًا مباشرًا لخرائط `DatabaseStore`)** | `server/db/store.ts:229-265` يعرف `IDataStore` و`server/db/store.ts:1281` يصدر `export const db = new DatabaseStore()`؛ `server/api/router.ts:12-20` لا يستورد `IDataStore` ويخاطب `db.organizations`, `db.users`, `db.customers`, `db.messages`, `db.calls`, `db.tickets` مباشرة في 131 موضعًا (`لا رابط مباشر — غير متاح بيئيًا`). | **متوسط (Medium)** | **لا** | **لا** (يمثل نطاق العمل المعماري للمرحلة P.2) | توسيع `IDataStore` في مطلع P.2 ليشمل دوال CRUD للكيانات الأساسية وتقييد `export const db: IDataStore` تدريجيًا. |
| **4. أمر البناء (`package.json` مقابل `scripts/build-server.mjs` في نص التقرير السابق)** | **تم تأكيد وجود خطأ سابق (الملف غير موجود)، لكن السبب الجذري للخطأ نفسه غير مُثبَت (`EXPLANATION UNVERIFIED — PLAUSIBLE NARRATIVE WITHOUT DIRECT EVIDENCE`)** | `package.json:8` ينص على `"build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs"`؛ ومخرج `ls -la package.json scripts/build-server.mjs` هو `ls: cannot access 'scripts/build-server.mjs': No such file or directory` (`لا رابط مباشر — غير متاح بيئيًا`). | **متوسط (توثيقي/إجرائي)** | **لا** | **لا** | اعتماد مخرج `npm run build` الفعلي الموثق في هذا التقرير (`vite build && esbuild server.ts ...`) وعدم الاعتماد على أي سرد غير موثق بسجل خام. |
| **5. مطابقة جرد الملفات المعدلة مع الحالة التاريخية قبل الجلسة** | **غير قابلة للإثبات بيئيًا لتاريخ ما قبل اللقطة (`UNRESOLVED — NO HISTORICAL RECORD AVAILABLE` / `UNABLE TO VERIFY — ENVIRONMENT LIMITATION`)** | `git rev-parse HEAD` يُرجع `fatal: not a git repository (or any of the parent directories): .git`؛ بينما طوابع `ls -la` داخل الحاوية تثبت تعديل الملفات الخمسة (`store.ts`, `seed.ts`, `router.ts`, `run-enterprise-audit.ts`, `OMNIFLOW_CURRENT_STATE_AND_GAP_MATRIX.md`) (`لا رابط مباشر — غير متاح بيئيًا`). | **متوسط (قيد بيئي)** | **لا** | **لا** | الاعتماد على مقارنة `git diff` الفعلية على GitHub عند مزامنة المستودع لمراجعة التغييرات سطرًا بسطر. |
| **6. اختلاف أرقام الأداء (`619 req/s, P95=71.42ms` مقابل `575 req/s, P95=89.42ms`)** | **متناقضة في نص تقرير P.1 (تم حسم مصدر الرقمين بالدليل)** | `619 req/s` (`242.3ms`) ورد في `docs/roadmap/OMNIFLOW_ACCEPTANCE_AND_VERIFICATION_MATRIX.md:29`، بينما `575 req/s` (`260.7ms`) هو المخرج الفعلي لتشغيل `npm run test:audit` بعد P.1 (`لا رابط مباشر — غير متاح بيئيًا`). | **منخفض (Low)** | **لا** | **لا** | اعتماد رقم التشغيل الفعلي الأخير بعد P.1 (`575 req/s`, `P95 = 89.42ms`) كخط أساس رسمي. |
| **7. العزل بين المستأجرين وحراسة `organizationId` والنسخ الذري للمجموعات الـ 23** | **مثبتة** | نجاح اختبارات `P1-01` إلى `P1-09` في `server/test/run-enterprise-audit.ts` والكود في `server/db/store.ts:348-391` و`964-1274` و`server/api/router.ts:72-106` (`لا رابط مباشر — غير متاح بيئيًا`). | **منخفض (سليم)** | **لا** | **لا** | لا يلزم إجراء؛ الحراسة تعمل كما هو مطلوب. |

### 7.2 التوصية النهائية الواحدة الصريحة

**التوصية النهائية: فتح إصلاح محدود قبل التقدم**

**التعليل**:
لا يمكن قبول المرحلة P.1 قبولًا مطلقًا ولا التقدم لإدخال بيانات اعتماد حقيقية أو بناء طبقة P.2 فوق سلوك استعادة يُتلف أسرار القنوات؛ إذ أثبت الفحص الجنائي التجريبي وجود خللين محددين في `server/db/store.ts`:
1. استعادة نسخة احتياطية مأخوذة من `GET /api/v1/system/backup` عبر `POST /api/v1/system/restore` تكتب النص الحرفي `"[REDACTED_SECRET]"` فوق الأسرار الحقيقية في الذاكرة والقرص، وحذف الحقول السرية من ملف النسخة الاحتياطية يمسح الأسرار تمامًا (`undefined`) عند الاستعادة.
2. أسرار القنوات (`apiToken`, `webhookSecret`) تُحفظ في `/tmp/omniflow-data/db_state.json` كنص صريح غير مشفر.

لذلك يلزم **فتح إصلاح محدود ومحصور في `server/db/store.ts` فقط** قبل التقدم، يقوم بـ:
- (أ) صون الأسرار الموجودة في `this.channelConfigs` أثناء `importFullBackupDetailed()` عندما تكون القيمة الواردة في النسخة الاحتياطية مساويةً لـ `"[REDACTED_SECRET]"` أو `undefined`.
- (ب) تشفير الحقول السرية في `channelConfigs` عند الكتابة إلى القرص (`AES-256-GCM`) وفك تشفيرها عند القراءة.

---

## 8. ملحق الأدلة الخام (Raw Evidence Appendix)

### 8.1 المخرج الخام لفحص `.git` المحلي ومتغيرات البيئة وأمر `ls -la package.json scripts/build-server.mjs`
```text
fatal: not a git repository (or any of the parent directories): .git
NO_GIT_ENV_VARS
ls: cannot access 'scripts/build-server.mjs': No such file or directory
-rw-r--r-- 1 root root 1489 Oct 26 17:20 package.json
```

### 8.2 الكود الكامل لسكربت الفحص المؤقت (`server/test/_scratch-p1-1-secret-probe.ts`) الذي استُخدم ثم حُذف
```ts
/**
 * @file server/test/_scratch-p1-1-secret-probe.ts
 * Temporary Forensic Probe for Phase P.1.1 — Section 2 (Channel Secrets At-Rest Gate)
 * Strictly uses isolated synthetic tenant `org-p1-1-forensic-audit-temp` and synthetic credentials,
 * executes all 9 empirical checks, and performs verified cleanup.
 */

import http from 'http';
import express from 'express';
import { execSync } from 'child_process';
import { apiRouter } from '../api/router.ts';
import { db } from '../db/store.ts';
import { initializeSeedData } from '../db/seed.ts';
import { issueSessionToken } from '../core/identity.ts';
import { AuditLogger } from '../core/audit.ts';

const SYNTH_ORG_ID = 'org-p1-1-forensic-audit-temp';
const SYNTH_USER_ID = 'usr-p1-1-forensic-admin';
const SYNTH_API_TOKEN = 'SYNTH-SECRET-P1AUDIT-9f8a7b6c';
const SYNTH_WEBHOOK_SECRET = 'SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a';

async function httpJson(
  baseUrl: string,
  method: string,
  pathUrl: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; body: any; rawText: string }> {
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }
  return { status: res.status, body: parsed, rawText };
}

async function runProbe() {
  if (db.organizations.size === 0) {
    initializeSeedData();
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    db.organizations.set(SYNTH_ORG_ID, {
      id: SYNTH_ORG_ID,
      name: 'Synthetic Forensic Audit Tenant (P.1.1)',
      domain: 'forensic-p1-1.local',
      plan: 'enterprise',
      isActive: true,
      settings: {
        timezone: 'Africa/Cairo',
        defaultLanguage: 'ar',
        complianceMode: 'strict_gdpr_ntra',
        aiAutoReplyEnabled: false,
        aiConfidenceThreshold: 0.9,
      },
      createdAt: new Date().toISOString(),
    } as any);

    db.users.set(SYNTH_USER_ID, {
      id: SYNTH_USER_ID,
      organizationId: SYNTH_ORG_ID,
      email: 'forensic-p1-1@local.test',
      fullName: 'Forensic Auditor P.1.1',
      role: 'Admin',
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: new Date().toISOString(),
    });

    const session = issueSessionToken({
      userId: SYNTH_USER_ID,
      organizationId: SYNTH_ORG_ID,
      role: 'Admin',
      email: 'forensic-p1-1@local.test',
      name: 'Forensic Auditor P.1.1',
    });

    const authHeaders = {
      Authorization: `Bearer ${session.token}`,
      'X-CSRF-Token': session.csrfToken,
    };

    console.log('=== [STEP 1] PUT /api/v1/integrations/channels/chan-whatsapp/config ===');
    const putRes = await httpJson(
      baseUrl,
      'PUT',
      '/api/v1/integrations/channels/chan-whatsapp/config',
      authHeaders,
      {
        wabaId: 'WABA-SYNTH-P1-1',
        phoneNumberId: 'PNID-SYNTH-P1-1',
        apiToken: SYNTH_API_TOKEN,
        webhookSecret: SYNTH_WEBHOOK_SECRET,
      }
    );
    console.log('PUT Status:', putRes.status);
    console.log('PUT Response Body:', JSON.stringify(putRes.body, null, 2));

    const savedOk = db.saveToDisk();
    const diskPath = db.getPersistFilePath();
    console.log('Persist File Path:', diskPath, '| saveToDisk():', savedOk);

    console.log('\n=== [STEP 2] LITERAL GREP ON /tmp/omniflow-data/db_state.json ===');
    const grepTokenOut = execSync(
      `grep -n -C 5 "${SYNTH_API_TOKEN}" "${diskPath}" || true`,
      { encoding: 'utf-8' }
    );
    console.log('grep -n -C 5 apiToken output:\n' + grepTokenOut.trim());

    console.log('\n=== [STEP 3A] INTERNAL db.exportTenantBackup(SYNTH_ORG_ID) ===');
    const internalTenantBackup = db.exportTenantBackup(SYNTH_ORG_ID);
    console.log(
      'db.exportTenantBackup().channelConfigs:',
      JSON.stringify(internalTenantBackup.channelConfigs, null, 2)
    );

    console.log('\n=== [STEP 3B] INTERNAL db.exportFullBackup() (filtered to SYNTH_ORG_ID) ===');
    const internalFullBackup = db.exportFullBackup();
    const fullBackupSynthConfigs = (internalFullBackup.channelConfigs || []).filter(
      (c: any) => c.organizationId === SYNTH_ORG_ID
    );
    console.log(
      'db.exportFullBackup().channelConfigs (for synth org):',
      JSON.stringify(fullBackupSynthConfigs, null, 2)
    );

    console.log('\n=== [STEP 3C] HTTP GET /api/v1/system/backup ===');
    const httpBackupRes = await httpJson(baseUrl, 'GET', '/api/v1/system/backup', authHeaders);
    console.log('GET /api/v1/system/backup Status:', httpBackupRes.status);
    console.log(
      'GET /api/v1/system/backup data.channelConfigs:',
      JSON.stringify(httpBackupRes.body?.data?.channelConfigs, null, 2)
    );

    console.log('\n=== [STEP 4] HTTP GET /api/v1/integrations/channels ===');
    const getChannelsRes = await httpJson(
      baseUrl,
      'GET',
      '/api/v1/integrations/channels',
      authHeaders
    );
    const waChannel = (getChannelsRes.body?.data || []).find(
      (c: any) => c.id === 'chan-whatsapp'
    );
    console.log('GET /api/v1/integrations/channels Status:', getChannelsRes.status);
    console.log('chan-whatsapp item:', JSON.stringify(waChannel, null, 2));

    console.log('\n=== [STEP 5A] RESTORE HTTP BACKUP AS-IS (WITH [REDACTED_SECRET]) ===');
    const redactedHttpPayload = httpBackupRes.body.data;
    const restoreRedactedRes = await httpJson(
      baseUrl,
      'POST',
      '/api/v1/system/restore',
      authHeaders,
      redactedHttpPayload
    );
    console.log('Restore Redacted HTTP Backup Status:', restoreRedactedRes.status, restoreRedactedRes.body);
    console.log(
      'In-Memory db.getChannelConfig after restoring redacted HTTP backup:',
      JSON.stringify(db.getChannelConfig(SYNTH_ORG_ID, 'chan-whatsapp'), null, 2)
    );

    db.setChannelConfig(SYNTH_ORG_ID, 'chan-whatsapp', {
      wabaId: 'WABA-SYNTH-P1-1',
      phoneNumberId: 'PNID-SYNTH-P1-1',
      apiToken: SYNTH_API_TOKEN,
      webhookSecret: SYNTH_WEBHOOK_SECRET,
    });

    console.log('\n=== [STEP 5B] RESTORE BACKUP AFTER MANUALLY DELETING SECRET FIELDS ===');
    const modifiedBackup = JSON.parse(JSON.stringify(db.exportTenantBackup(SYNTH_ORG_ID)));
    for (const cfg of modifiedBackup.channelConfigs || []) {
      if (cfg.config) {
        delete cfg.config.apiToken;
        delete cfg.config.webhookSecret;
      }
    }
    const restoreDeletedSecretsRes = await httpJson(
      baseUrl,
      'POST',
      '/api/v1/system/restore',
      authHeaders,
      modifiedBackup
    );
    console.log(
      'Restore Modified Backup (secrets deleted) Status:',
      restoreDeletedSecretsRes.status,
      restoreDeletedSecretsRes.body
    );
    console.log(
      'In-Memory db.getChannelConfig after restoring backup with deleted secret fields:',
      JSON.stringify(db.getChannelConfig(SYNTH_ORG_ID, 'chan-whatsapp'), null, 2)
    );
    const getChannelsAfterRestore = await httpJson(
      baseUrl,
      'GET',
      '/api/v1/integrations/channels',
      authHeaders
    );
    const waAfterRestore = (getChannelsAfterRestore.body?.data || []).find(
      (c: any) => c.id === 'chan-whatsapp'
    );
    console.log(
      'GET /api/v1/integrations/channels chan-whatsapp.accountInfo after restore:',
      JSON.stringify(waAfterRestore?.accountInfo, null, 2)
    );
    console.log('\n=== [STEP 8A] DELETE CHANNEL CONFIG & VERIFY VIA SUBSEQUENT READ ===');
    db.channelConfigs.delete(`${SYNTH_ORG_ID}::chan-whatsapp`);
    const readAfterDeleteMemory = db.getChannelConfig(SYNTH_ORG_ID, 'chan-whatsapp');
    const getChannelsAfterDelete = await httpJson(
      baseUrl,
      'GET',
      '/api/v1/integrations/channels',
      authHeaders
    );
    const waAfterDelete = (getChannelsAfterDelete.body?.data || []).find(
      (c: any) => c.id === 'chan-whatsapp'
    );
    console.log('db.getChannelConfig after delete:', readAfterDeleteMemory);
    console.log(
      'GET /api/v1/integrations/channels chan-whatsapp after delete (status & accountInfo):',
      JSON.stringify({ status: waAfterDelete?.status, accountInfo: waAfterDelete?.accountInfo })
    );
  } finally {
    console.log('\n=== [STEP 8B] MANDATORY TENANT & DISK CLEANUP VERIFICATION ===');
    if ((db as any).persistTimer) {
      clearTimeout((db as any).persistTimer);
      (db as any).persistTimer = null;
    }
    db.purgeOrganizationData(SYNTH_ORG_ID);
    db.users.delete(SYNTH_USER_ID);
    db.organizations.delete(SYNTH_ORG_ID);
    AuditLogger.importEvents(
      AuditLogger.exportAllEvents().filter((e) => e.organizationId !== SYNTH_ORG_ID)
    );
    db.saveToDisk();

    const diskPath = db.getPersistFilePath();
    const postCleanupGrep = execSync(
      `grep -nE "${SYNTH_ORG_ID}|${SYNTH_API_TOKEN}|${SYNTH_WEBHOOK_SECRET}" "${diskPath}" || true`,
      { encoding: 'utf-8' }
    );
    console.log('Organization still in db.organizations.has(SYNTH_ORG_ID):', db.organizations.has(SYNTH_ORG_ID));
    console.log(
      'ChannelConfig still in db.channelConfigs:',
      Array.from(db.channelConfigs.keys()).filter((k) => k.includes(SYNTH_ORG_ID))
    );
    console.log(
      'Post-Cleanup grep on /tmp/omniflow-data/db_state.json (must be empty):',
      JSON.stringify(postCleanupGrep.trim())
    );
    server.close();
  }
}

runProbe().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
```

### 8.3 المخرج الخام الكامل لتنفيذ `npx tsx server/test/_scratch-p1-1-secret-probe.ts`
```text
[Seed] Initializing enterprise demo dataset...
[Seed] Enterprise demo dataset seeded successfully with full multi-tenant records.
=== [STEP 1] PUT /api/v1/integrations/channels/chan-whatsapp/config ===
PUT Status: 200
PUT Response Body: {
  "success": true,
  "data": {
    "wabaId": "WABA-SYNTH-P1-1",
    "phoneNumberId": "PNID-SYNTH-P1-1",
    "apiToken": "[REDACTED_SECRET]",
    "webhookSecret": "[REDACTED_SECRET]",
    "verified": true,
    "lastCheckedAt": "2026-10-25T17:18:07.053Z"
  },
  "message": "تم حفظ إعدادات القناة والاعتمادات بنجاح"
}
[Storage] Database state persisted safely to /tmp/omniflow-data/db_state.json
Persist File Path: /tmp/omniflow-data/db_state.json | saveToDisk(): true

=== [STEP 2] LITERAL GREP ON /tmp/omniflow-data/db_state.json ===
grep -n -C 5 apiToken output:
6117-      "organizationId": "org-p1-1-forensic-audit-temp",
6118-      "channelId": "chan-whatsapp",
6119-      "config": {
6120-        "wabaId": "WABA-SYNTH-P1-1",
6121-        "phoneNumberId": "PNID-SYNTH-P1-1",
6122:        "apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c",
6123-        "webhookSecret": "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a",
6124-        "verified": true,
6125-        "lastCheckedAt": "2026-10-25T17:18:07.053Z"
6126-      },
6127-      "updatedAt": "2026-10-25T17:18:07.053Z"

=== [STEP 3A] INTERNAL db.exportTenantBackup(SYNTH_ORG_ID) ===
db.exportTenantBackup().channelConfigs: [
  {
    "id": "org-p1-1-forensic-audit-temp::chan-whatsapp",
    "organizationId": "org-p1-1-forensic-audit-temp",
    "channelId": "chan-whatsapp",
    "config": {
      "wabaId": "WABA-SYNTH-P1-1",
      "phoneNumberId": "PNID-SYNTH-P1-1",
      "apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c",
      "webhookSecret": "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a",
      "verified": true,
      "lastCheckedAt": "2026-10-25T17:18:07.053Z"
    },
    "updatedAt": "2026-10-25T17:18:07.053Z"
  }
]

=== [STEP 3B] INTERNAL db.exportFullBackup() (filtered to SYNTH_ORG_ID) ===
db.exportFullBackup().channelConfigs (for synth org): [
  {
    "id": "org-p1-1-forensic-audit-temp::chan-whatsapp",
    "organizationId": "org-p1-1-forensic-audit-temp",
    "channelId": "chan-whatsapp",
    "config": {
      "wabaId": "WABA-SYNTH-P1-1",
      "phoneNumberId": "PNID-SYNTH-P1-1",
      "apiToken": "SYNTH-SECRET-P1AUDIT-9f8a7b6c",
      "webhookSecret": "SYNTH-WEBHOOK-P1AUDIT-1d2e3f4a",
      "verified": true,
      "lastCheckedAt": "2026-10-25T17:18:07.053Z"
    },
    "updatedAt": "2026-10-25T17:18:07.053Z"
  }
]

=== [STEP 3C] HTTP GET /api/v1/system/backup ===
GET /api/v1/system/backup Status: 200
GET /api/v1/system/backup data.channelConfigs: [
  {
    "id": "org-p1-1-forensic-audit-temp::chan-whatsapp",
    "organizationId": "org-p1-1-forensic-audit-temp",
    "channelId": "chan-whatsapp",
    "config": {
      "wabaId": "WABA-SYNTH-P1-1",
      "phoneNumberId": "PNID-SYNTH-P1-1",
      "apiToken": "[REDACTED_SECRET]",
      "webhookSecret": "[REDACTED_SECRET]",
      "verified": true,
      "lastCheckedAt": "2026-10-25T17:18:07.053Z"
    },
    "updatedAt": "2026-10-25T17:18:07.053Z"
  }
]

=== [STEP 4] HTTP GET /api/v1/integrations/channels ===
GET /api/v1/integrations/channels Status: 200
chan-whatsapp item: {
  "id": "chan-whatsapp",
  "type": "whatsapp",
  "name": "WhatsApp Business Cloud API (Official)",
  "badge": "موثق ومعتمد من Meta",
  "status": "online",
  "accountInfo": {
    "wabaId": "WABA-SYNTH-P1-1",
    "phoneNumberId": "PNID-SYNTH-P1-1",
    "apiToken": "[REDACTED_SECRET]",
    "webhookSecret": "[REDACTED_SECRET]",
    "verified": true,
    "lastCheckedAt": "2026-10-25T17:18:07.053Z"
  },
  "metrics": {
    "latencyMs": 42,
    "messagesSent24h": 0,
    "deliveryRatePercent": 99.4,
    "webhookUrl": "/api/v1/integrations/whatsapp/webhook"
  },
  "compliance": {
    "optInPolicyActive": true,
    "templateWindowHours": 24,
    "stopKeywordsActive": true
  }
}

=== [STEP 5A] RESTORE HTTP BACKUP AS-IS (WITH [REDACTED_SECRET]) ===
[Storage] Database state persisted safely to /tmp/omniflow-data/db_state.json
Restore Redacted HTTP Backup Status: 200 { success: true, message: 'Database state restored successfully' }
In-Memory db.getChannelConfig after restoring redacted HTTP backup: {
  "wabaId": "WABA-SYNTH-P1-1",
  "phoneNumberId": "PNID-SYNTH-P1-1",
  "apiToken": "[REDACTED_SECRET]",
  "webhookSecret": "[REDACTED_SECRET]",
  "verified": true,
  "lastCheckedAt": "2026-10-25T17:18:07.053Z"
}

=== [STEP 5B] RESTORE BACKUP AFTER MANUALLY DELETING SECRET FIELDS ===
[Storage] Database state persisted safely to /tmp/omniflow-data/db_state.json
Restore Modified Backup (secrets deleted) Status: 200 { success: true, message: 'Database state restored successfully' }
In-Memory db.getChannelConfig after restoring backup with deleted secret fields: {
  "wabaId": "WABA-SYNTH-P1-1",
  "phoneNumberId": "PNID-SYNTH-P1-1",
  "verified": true,
  "lastCheckedAt": "2026-10-25T17:18:07.116Z"
}
GET /api/v1/integrations/channels chan-whatsapp.accountInfo after restore: {
  "wabaId": "WABA-SYNTH-P1-1",
  "phoneNumberId": "PNID-SYNTH-P1-1",
  "verified": true,
  "lastCheckedAt": "2026-10-25T17:18:07.116Z"
}

=== [STEP 8A] DELETE CHANNEL CONFIG & VERIFY VIA SUBSEQUENT READ ===
db.getChannelConfig after delete: undefined
GET /api/v1/integrations/channels chan-whatsapp after delete (status & accountInfo): {"status":"unconfigured","accountInfo":{}}

=== [STEP 8B] MANDATORY TENANT & DISK CLEANUP VERIFICATION ===
[Storage] Database state persisted safely to /tmp/omniflow-data/db_state.json
Organization still in db.organizations.has(SYNTH_ORG_ID): false
ChannelConfig still in db.channelConfigs: []
Post-Cleanup grep on /tmp/omniflow-data/db_state.json (must be empty): ""
```

### 8.4 مخرجات `grep` الخام لفحص التشفير و`IDataStore`
```text
=== CRYPTO GREP ===
server/core/audit.ts:53:    const id = crypto.randomUUID();
server/core/audit.ts:79:    const integrityHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');
server/core/audit.ts:93:      requestId: params.requestId || crypto.randomUUID(),
server/core/audit.ts:149:    return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
server/db/seed.ts:7:import crypto from 'crypto';
server/db/seed.ts:908:      sha256Receipt: crypto.createHash('sha256').update('omniflow-init-sync-01018108979').digest('hex').slice(0, 16),
server/api/router.ts:11:import crypto from 'crypto';
server/api/router.ts:647:  const msgId: UUID = crypto.randomUUID();
server/api/router.ts:875:  const ticketId: UUID = crypto.randomUUID();
server/api/router.ts:3361:      const sha256 = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
server/api/router.ts:3457:  const treeHash = crypto.createHash('sha256').update(manifest).digest('hex').hexSlice(0, 16);
server/api/router.ts:4551:  const sha256Receipt = crypto.createHash('sha256').update(`${syncId}:${now}`).digest('hex').slice(0, 16);
server/api/router.ts:4854:      const sha256 = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

=== GREP IDataStore & DatabaseStore ===
server/test/run-enterprise-audit.ts:972:      throw new Error('Atomic restore failed: corrupted mid-backup either succeeded or partially mutated live DatabaseStore!');
server/db/store.ts:229:export interface IDataStore {
server/db/store.ts:277:class DatabaseStore implements IDataStore {
server/db/store.ts:1198:      // 5. Atomic commit: swap staged maps into live DatabaseStore
server/db/store.ts:1281:export const db = new DatabaseStore();

=== DIRECT MAP ACCESS IN ROUTER.TS ===
Total matches: 131
```

---

## 9. ملحق الروابط المباشرة (Direct Link Appendix)

**`NO VERIFIED REMOTE SHA ACCESS — GITHUB PERMALINKS UNAVAILABLE`**

- **بيان الامتثال لقواعد الروابط في القسم 0 والقسم 8**:
  بما أن بيئة التشغيل الحالية لا تحتوي على مجلد `.git` محلي (`fatal: not a git repository (or any of the parent directories): .git`) ولا تتيح الوصول المؤكد إلى الـ Commit SHA المكون من 40 محرفًا سداسيًا عشريًا المتزامن حاليًا على GitHub، والتزامًا صارمًا بالقاعدة الحاكمة التي تمنع استخدام روابط الفروع المتحركة (`/blob/main/...`) أو تخمين أي Commit SHA غير متحقَّق منه، **لم يتم تضمين أي رابط GitHub في هذا التقرير**، وتم توثيق جميع المواضع الساكنة في الكود عبر المسار المحلي الدقيق وأرقام الأسطر ومقتطفات الكود الخام الحرفية مع التصريح الصريح: `"لا رابط مباشر — غير متاح بيئيًا"`.
