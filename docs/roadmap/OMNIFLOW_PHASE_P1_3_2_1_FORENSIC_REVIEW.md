# PHASE P.1.3.2.1 — Forensic Evidence Review & Audit State Preservation Gate
**OmniFlow OS — Independent Forensic Audit & Data-Preservation Report (`P.1.3.2.1`)**

---

## 1. الإفصاح الفعلي عن البيئة والقدرات (Mandatory Environment & Capability Disclosure)

تم التحقق الفعلي من كل قدرة في جلسة العمل الحالية (`/app/applet`) بشكل مستقل قبل إجراء أي فحص:

| المورد / القدرة | الحالة الفعلية (`VERIFIED`) | الدليل الخام من التنفيذ الفعلي |
| :--- | :---: | :--- |
| **وجود ملفات المشروع (`Filesystem`)** | **نعم (`VERIFIED`)** | قراءة مباشرة عبر `view_file` و `sha256sum` لجميع ملفات `server/`، `docs/roadmap/`، و `.env.example` في `/app/applet`. |
| **تنفيذ `Shell` (`bash`)** | **نعم (`VERIFIED`)** | `Linux localhost 4.19.0-gvisor #1 SMP Sun Jan 10 15:06:54 PST 2016 x86_64 GNU/Linux` (`Exit Code: 0`). |
| **بيئة `Node.js`** | **نعم (`VERIFIED`)** | `v22.23.4` (`node -v`, `Exit Code: 0`). |
| **مدير الحزم `npm`** | **نعم (`VERIFIED`)** | `10.9.9` (`npm -v`, `Exit Code: 0`). |
| **منفّذ TypeScript (`tsx`)** | **نعم (`VERIFIED`)** | `tsx v4.23.15` (`npx tsx -v`, `Exit Code: 0`). |
| **وجود مستودع `.git` محلي** | **لا (`VERIFIED ABSENT`)** | مخرج `git status`: `fatal: not a git repository (or any of the parent directories): .git` (`Exit Code: 128`). |
| **الوصول إلى GitHub API للقراءة فقط** | **نعم (`VERIFIED READ-ONLY`)** | استعلام HTTP GET إلى `https://api.github.com/repos/ahmedsheta89-cell/Call-center/commits/main` أعاد أن آخر التزام على `main` هو `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` (`2026-10-26T20:25:17Z`). |

### حدود الفحص وما لم يمكن التحقق منه (`Scope Limitations`)
1. **عدم وجود `.git` محلي**: لا يمكن تشغيل `git diff` أو `git log` محليًا داخل `/app/applet`. تم الاستعاضة عن ذلك بمقارنة الملفات المحلية مباشرةً عبر `sha256sum` مع نسخ الملفات المنشورة على GitHub في الالتزام المرجعي `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` (`raw.githubusercontent.com`) ومع البصمات المسجلة قبل وبعد P.1.3.2.
2. **حالة الاختبارات البعيدة (GitHub Actions CI)**: التعديلات المحلية للمراحل P.1.3 / P.1.3.1 / P.1.3.2 لم تُدفع بعد إلى المستودع البعيد (`main` لا يزال عند `9a5eae44e022ac1ac8c6513f31dd804aa79b8619`). لذلك تُصنَّف حالة CI البعيد رسميًا:
   **`LOCAL EVIDENCE REVIEW ONLY — REMOTE CI NOT VERIFIED`**.
3. **التزام عدم التعديل (`Zero Source/Report Mutation`)**: لم يتم تعديل أي ملف مصدر أو ملف اختبار أو تقرير سابق أو ملف manifest خلال هذه المراجعة؛ وتم إثبات ذلك بإعادة تشغيل `sha256sum -c docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` قبل وبعد جميع الفحوص (`Exit Code: 0`).

---

## 1.5. فحص إلزامي لأنماط التزوير/الفساد النصي المعروفة سابقًا (`Known Corruption Signature Scan`)

### أ. فحص الملفات الفعلية على القرص
تم تنفيذ أمر البحث الحرفي التالي على كامل شجرة الملفات (`server/`, `docs/`, `.env.example`):
```bash
grep -rnE "EME9M9cSy9FvfHvcx2gMPkp1H5Dj4YaKufPRsAyon8Tf|PbWWqgKDBDorh525uecKaGZD21FGSoCeR|9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8" server/ docs/ .env.example
```
- **المخرج الفعلي**: فارغ (`0` تطابقات).
- **رمز الخروج (`Exit Code`)**: `1` (أي لم يُعثر على أيٍّ من السلاسل الثلاث في أي ملف على القرص).

### ب. فحص السطر `114` من `server/core/audit.ts` ومقارنة ملفات القرص برسالة المحادثة السابقة
1. **محتوى السطر `108–136` الفعلي على القرص في `server/core/audit.ts`** (ذو البصمة `4940365746994391f2bf1327fe742d771594dff80a9e1c5d60c1f0c28835cd66`):
```typescript
export type AuditErrorCode =
  | 'VERIFIED'
  | 'CHAIN_VALID'
  | 'CHAIN_VALID_EMPTY'
  | 'AUDIT_KEY_UNAVAILABLE'
  | 'AUDIT_KEY_INVALID'
  | 'AUDIT_KEY_REUSE_FORBIDDEN'
  | 'AUDIT_KEY_ID_UNKNOWN'
  | 'AUDIT_MANIFEST_MISSING'
  | 'AUDIT_MANIFEST_INVALID'
  | 'AUDIT_SIGNATURE_INVALID'
  | 'UNSUPPORTED_AUDIT_SCHEMA_VERSION'
  | 'CROSS_TENANT_RESTORE_FORBIDDEN'
  | 'TAMPERED_AUDIT_CHAIN'
  | 'CORRUPTED_BACKUP_PAYLOAD'
  | 'MALFORMED_AUDIT_EVENT'
  | 'DUPLICATE_AUDIT_EVENT_ID'
  | 'BROKEN_ANCHOR_LINK'
  | 'BROKEN_GENESIS_LINK'
  | 'MISSING_RETENTION_CHECKPOINT'
  | 'BROKEN_PREV_HASH_LINK'
  | 'PAYLOAD_HASH_MISMATCH'
  | 'BROKEN_GLOBAL_SEQUENCE'
  | 'MALFORMED_TENANT_CHAIN_FIELDS'
  | 'BROKEN_TENANT_PREV_HASH_LINK'
  | 'BROKEN_TENANT_SEQUENCE'
  | 'INVALID_RETENTION_CHECKPOINT'
  | 'INVALID_SNAPSHOT';
```
والدالة `createEmptyRetentionCheckpoint` في السطر `404` من `server/core/audit.ts` مكتوبة حرفيًا:
```typescript
function createEmptyRetentionCheckpoint(maxLimit = DEFAULT_AUDIT_RETENTION_LIMIT): AuditRetentionCheckpoint {
```
— **لا وجود إطلاقًا** لأي سلسلة مشوهة في ملفات القرص.

2. **كشف جنائي مهم حول التضارب بين رد المحادثة المختصر (بعد Compaction) وبين الملفات الفعلية على القرص**:
   - عند فحص الملفات الفعلية على القرص (`server/core/audit.ts`، `server/test/p1-3-audit-chain-integrity-audit.ts`، والتقرير الفعلي المخزّن على القرص `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md`) تبيّن أنها كُتبت بشكل سليم قبل عملية ضغط المحادثة (`Compaction`).
   - إلا أن ملخص الضغط الآلي (`Compaction Summary`) قام بتلخيص أسماء دوال ومتغيرات وهمية لم تكن موجودة في الكود الفعلي (`AUDIT_ALLOW_EPHEMERAL_KEY`، `compactChain`، `CheckpointRetentionAnchor`، `injectRawEntriesForTesting`، `purgeSyntheticTenantAuditEvents`)، فقام رد المحادثة التالي للضغط بتكرار تلك الأسماء من الملخص بدلاً من قراءة `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` من القرص!
   - تم التحقق عبر `grep` على القرص:
     ```bash
     grep -rnE "AUDIT_ALLOW_EPHEMERAL_KEY|compactChain|CheckpointRetentionAnchor|injectRawEntriesForTesting|purgeSyntheticTenantAuditEvents" server/ docs/ .env.example
     ```
     **المخرج الفعلي**: فارغ (`GREP_EXIT_CODE=1`). هذه الرموز الخمسة **غير موجودة أصلًا في الكود المصدري أو في تقرير `OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` على القرص**.
   - كما تم فحص هذا التقرير (`OMNIFLOW_PHASE_P1_3_2_1_FORENSIC_REVIEW.md`) بالكامل للتأكد من خلو جميع البصمات والمعرفات وأسماء الدوال من أي فساد نصي.

---

## 2. مراجعة المفتاح المؤقت HMAC وإدارة المفاتيح (`VERIFIED`)

### 2.1 فحص التنفيذ الفعلي في الكود (`server/core/audit.ts` و `/.env.example`)
1. **`AUDIT_CHECKPOINT_HMAC_KEY`**:
   - موثق في `/.env.example` (الأسطر `23–29`) مع `AUDIT_CHECKPOINT_HMAC_KEY_ID` و `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS`.
   - يتم التحقق منه عبر `validateAuditHmacKey()` (`server/core/audit.ts:L152–L230`).
   - يشترط سلسلة سداسية عشرية بأحرف صغيرة بطول 64 محرفًا بالضبط (`/^[0-9a-f]{64}$/`، أي 32 بايت = 256 بت).
   - يمنع إعادة استخدام `CHANNEL_SECRET_ENCRYPTION_KEY` أو `SESSION_SECRET` ويرفضهما برمز `503 AUDIT_KEY_REUSE_FORBIDDEN`.
2. **`AUDIT_ALLOW_EPHEMERAL_KEY`**:
   - **غير موجود في الكود المصدري إطلاقًا (`VERIFIED ABSENT`)**.
   - الكود الفعلي في `server/core/audit.ts` **لا يدعم أي مفتاح مؤقت (Ephemeral Key)** لا في بيئة الإنتاج ولا في بيئة التطوير أو الاختبار. إذا غاب `AUDIT_CHECKPOINT_HMAC_KEY`، يفشل النظام بشكل مغلق (`Fail-Closed`) في جميع البيئات برمز `503 AUDIT_KEY_UNAVAILABLE`.

### 2.2 جرد جميع مسارات التوقيع والتحقق والتصدير والحفظ والتحميل والاستعادة
| المسار / الدالة | الملف والأسطر | سلوك التوقيع / التحقق | سلوك غياب المفتاح أو عدم تطابقه |
| :--- | :--- | :--- | :--- |
| `AuditLogger.exportIntegrityManifest()` | `server/core/audit.ts:L1091–L1130` | يوقّع `unsignedManifest` بـ `HMAC-SHA256` باستخدام `validateAuditHmacKey()`. | يرمي خطأ `503 AUDIT_KEY_UNAVAILABLE` أو `AUDIT_KEY_INVALID` أو `AUDIT_KEY_REUSE_FORBIDDEN`. |
| `AuditLogger.verifyIntegrityManifest()` | `server/core/audit.ts:L1136–L1362` | يحل المفتاح عبر `resolveAuditHmacVerificationKey(m.keyId)` ويتحقق عبر `crypto.timingSafeEqual` ويعيد حساب جميع الـ claims. | يعيد `valid: false` مع `503 AUDIT_KEY_UNAVAILABLE` أو `400 AUDIT_KEY_ID_UNKNOWN` أو `400 AUDIT_SIGNATURE_INVALID`. |
| `db.exportFullBackup()` | `server/db/store.ts:L882–L938` | يستدعي `AuditLogger.exportIntegrityManifest({ artifactType: 'FULL_BACKUP', scopeOrgId: null })`. | يرمي خطأ `503` ولا يصدّر نسخة غير موقعة. |
| `db.exportTenantBackup(scopeOrgId)` | `server/db/store.ts:L944–L996` | يستدعي `AuditLogger.exportIntegrityManifest({ artifactType: 'TENANT_BACKUP', scopeOrgId })`. | يرمي خطأ `503` (`GET /api/v1/system/backup` يعيد `503`). |
| `db.saveToDisk()` | `server/db/store.ts:L1032–L1072` | يستدعي `AuditLogger.exportIntegrityManifest({ artifactType: 'DISK_SNAPSHOT', scopeOrgId: null })` قبل الكتابة الذرية. | يسجّل `AUDIT_KEY_UNAVAILABLE` ويعيد `false` دون الكتابة على القرص. |
| `db.loadFromDisk()` | `server/db/store.ts:L1132–L1296` | يستدعي `importFullBackupDetailed(..., { isDiskLoad: true })` الذي يتحقق من `auditIntegrityManifest`. | يعيد `false`، يفعّل `existingFileProtected = true` (`SECRET_KEY_PROTECTED`)، ويمنع تصفير الملف أو استبداله بالبذور. |
| `POST /api/v1/system/restore` | `server/api/router.ts:L161` -> `store.ts:L1586` | يستدعي `AuditLogger.verifyTenantBackupIntegrity(..., { requireManifest: true })` في مرحلة staging قبل أي تعديل. | يعيد HTTP `400` / `403` / `503` دون المساس بالذاكرة أو القرص. |

### 2.3 الإثبات العملي عبر عمليات منفصلة (`Multi-Process Isolated Verification`)
تم تشغيل اختبار عملي يعزل 6 عمليات Node.js مستقلة (`child_process.execFileSync`) لاختبار الحالات الست المطلوبة في القسم 2 (`Exit Code: 0`):
1. **غياب المفتاح في الإنتاج (`NODE_ENV=production`)**: أعاد `validateAuditHmacKey()` القيمة `{"valid":false,"status":503,"code":"AUDIT_KEY_UNAVAILABLE"}`.
2. **تفعيل `AUDIT_ALLOW_EPHEMERAL_KEY=true` في التطوير (`development`) والاختبار (`test`) ومحاولة الحفظ (`PROC0`)**: تجاهل النظام المتغير الوهمي تمامًا ورفض الحفظ على القرص (`{"saved":false,"err":{"operation":"saveToDisk","code":"AUDIT_KEY_UNAVAILABLE"}}`).
3. **هل تُكتب بيانات موقعة بمفتاح مؤقت على القرص أو تُصدّر؟**: **مستحيل (`VERIFIED FALSE`)** لأن النظام لا ينشئ مفاتيح مؤقتة أصلًا ويرفض التصدير والحفظ عند غياب `AUDIT_CHECKPOINT_HMAC_KEY`.
4. **التحقق عبر عملية جديدة بعد انتهاء العملية الأولى (`PROC1` -> `PROC2A`)**: قامت `PROC1` بحفظ الحالة بمفتاح `key-v1` ثم انتهت؛ وبدأت `PROC2A` كعملية جديدة وحمّلت الملف وتحققت منه بنجاح (`{"loaded":true,"chainValid":true,"checkedCount":1,"code":"CHAIN_VALID"}`).
5. **تقديم `keyId` مجهول أو تدوير المفتاح (`PROC2C` و `PROC2D`)**:
   - عند تدوير المفتاح في `PROC2C` إلى `key-v2` دون إدراج `key-v1` في `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS`: رفض التحميل برمز `AUDIT_KEY_ID_UNKNOWN` مع تفعيل حماية الملف `overwriteProtected: true`.
   - عند تدوير المفتاح في `PROC2D` إلى `key-v2` مع إدراج `key-v1` في `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS`: نجح التحميل والتحقق (`{"loaded":true,"chainValid":true,"checkedCount":1,"code":"CHAIN_VALID"}`).
6. **هل يؤدي غياب المفتاح أو تغيره إلى تصفير البيانات أو تجاوز التحقق صامتًا (`PROC2B`)؟**: **لا (`VERIFIED FALSE`)** — يعيد `loadFromDisk()` القيمة `false` ويضبط `overwriteProtected: true` (`SECRET_KEY_PROTECTED`)، مما يمنع `saveToDisk()` من الكتابة فوق الملف الأصلي.

---

## 3. مراجعة تنظيف سجل التدقيق والحفاظ على السجلات الأصلية (`VERIFIED`)

### 3.1 فحص آلية التنظيف في الكود الفعلي
1. **عدم وجود حذف جزئي أو إعادة ربط (`Re-chaining`) في `AuditLogger`**:
   - لا يحتوي `server/core/audit.ts` على أي دالة تحذف أحداث مستأجر معيّن من وسط أو طرف السلسلة ثم تعيد حساب بصمات الأحداث المتبقية.
   - `db.purgeOrganizationData(orgId)` (`server/db/store.ts`) يحذف سجلات الكيانات التشغيلية (`customers`, `tickets`, `macros`, إلخ) للمستأجر الاصطناعي فقط، ولا يمس `AuditLogger.inMemoryStore`.
2. **آلية الحفاظ على حالة التدقيق الأصلية في الاختبارات (`Snapshot Capture & Atomic Restore`)**:
   - في بداية `runPhaseP12AcceptanceSuite` (`server/test/p1-2-channel-secret-encryption-audit.ts:L103`) وفي بداية `runPhaseP13AuditChainSuite` (`server/test/p1-3-audit-chain-integrity-audit.ts:L172`): يتم أخذ نسخة مجمدة عميقًا من حالة التدقيق الأصلية عبر:
     ```typescript
     const preSuiteAuditSnapshot = AuditLogger.captureSnapshot();
     ```
   - وفي كتلة `finally` (`p1-2:L1375` و `p1-3:L1847`): يتم استعادة اللقطة الأصلية حرفيًا عبر:
     ```typescript
     AuditLogger.restoreSnapshot(preSuiteAuditSnapshot);
     ```
   - كما يتم توجيه مسار الحفظ على القرص أثناء الاختبارات إلى مجلد مؤقت معزول في `/tmp/omniflow-data/...` عبر `db.setPersistFilePathForTesting(tempDiskFile)`، ويُعاد المسار الأصلي في `finally` مع حذف المجلد المؤقت.

### 3.2 الدليل العملي: تطابق السجلات الأصلية (`org-madar-001`) قبل وبعد تشغيل الاختبارات
تم تشغيل تجربة معزولة (`Exit Code: 0`) تحتوي على 5 أحداث أعمال أصلية للمؤسسة `org-madar-001` قبل تشغيل حزمتي `runPhaseP12AcceptanceSuite()` و `runPhaseP13AuditChainSuite()` كاملتين، وتسجيل البصمات والمعرفات قبل وبعد:

```json
{
  "countBefore": 5,
  "countAfter": 5,
  "snapshotSha256Before": "417f302431713a0dfbf883061e127bb33af5f222e85d12fdcecf8d5785af344c",
  "snapshotSha256After": "417f302431713a0dfbf883061e127bb33af5f222e85d12fdcecf8d5785af344c",
  "bitForBitIdentical": true,
  "eventsBefore": [
    {
      "id": "60290c62-75bd-429f-9882-7730372650d4",
      "organizationId": "org-madar-001",
      "globalSeq": 1,
      "tenantSeq": 1,
      "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "tenantPrevHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "integrityHash": "914cedaf8aa8b8ef812cadf294b0c2787a5393d32fa45e2a6eff76cd161ce49f",
      "createdAt": "2026-10-29T17:28:36.204Z"
    },
    {
      "id": "f8d70980-d5cf-4ffb-8b70-1c27a32c0868",
      "organizationId": "org-madar-001",
      "globalSeq": 2,
      "tenantSeq": 2,
      "prevHash": "914cedaf8aa8b8ef812cadf294b0c2787a5393d32fa45e2a6eff76cd161ce49f",
      "tenantPrevHash": "914cedaf8aa8b8ef812cadf294b0c2787a5393d32fa45e2a6eff76cd161ce49f",
      "integrityHash": "e3a0c72968beb055da66aa5df85d3116be26e9bc42d2a6cfeb11efe36c151f78",
      "createdAt": "2026-10-29T17:28:36.206Z"
    },
    {
      "id": "710241df-cca7-4731-9d0e-ff30e8a5ff2f",
      "organizationId": "org-madar-001",
      "globalSeq": 3,
      "tenantSeq": 3,
      "prevHash": "e3a0c72968beb055da66aa5df85d3116be26e9bc42d2a6cfeb11efe36c151f78",
      "tenantPrevHash": "e3a0c72968beb055da66aa5df85d3116be26e9bc42d2a6cfeb11efe36c151f78",
      "integrityHash": "4c2de5aafce2e2001e546b2657c4217eba00b3eea49cfae1a3918d12d217151a",
      "createdAt": "2026-10-29T17:28:36.206Z"
    },
    {
      "id": "c703abf2-be2b-492a-808e-84786547173c",
      "organizationId": "org-madar-001",
      "globalSeq": 4,
      "tenantSeq": 4,
      "prevHash": "4c2de5aafce2e2001e546b2657c4217eba00b3eea49cfae1a3918d12d217151a",
      "tenantPrevHash": "4c2de5aafce2e2001e546b2657c4217eba00b3eea49cfae1a3918d12d217151a",
      "integrityHash": "a77d749683b39f577423fff89330328938466730101ab96202fe9d05f0841363",
      "createdAt": "2026-10-29T17:28:36.206Z"
    },
    {
      "id": "4306cf48-a500-4d95-a90b-ce1392d34f66",
      "organizationId": "org-madar-001",
      "globalSeq": 5,
      "tenantSeq": 5,
      "prevHash": "a77d749683b39f577423fff89330328938466730101ab96202fe9d05f0841363",
      "tenantPrevHash": "a77d749683b39f577423fff89330328938466730101ab96202fe9d05f0841363",
      "integrityHash": "79e59a18d2c7c6c5c4ac92ae6135474b6a39184493da6b5c6c24ca6e88621d03",
      "createdAt": "2026-10-29T17:28:36.206Z"
    }
  ]
}
```
- **النتيجة (`VERIFIED`)**: لم يتغير أي معرف (`id`) أو بصمة (`integrityHash`) أو رابط (`prevHash` / `tenantPrevHash`) أو تسلسل (`globalSeq` / `tenantSeq`) أو طابع زمني (`createdAt`) لأي حدث أصلي، وبصمة اللقطة الكاملة `417f302431713a0dfbf883061e127bb33af5f222e85d12fdcecf8d5785af344c` متطابقة 100% قبل وبعد التنظيف.
- **ملاحظة هندسية دقيقة في كتلة `finally` الخاصة بـ `p1-3-audit-chain-integrity-audit.ts` (`L1834–L1846`)**:
  في السطر `173` يتم أخذ `preSuiteFullBackup = db.exportFullBackup()` أثناء وجود مفتاح الاختبار `TEST_HMAC_KEY_64`، ولكن في `finally` (`L1834–L1845`) تتم إعادة `process.env.AUDIT_CHECKPOINT_HMAC_KEY` إلى `origHmacKey` **قبل** استدعاء `db.importFullBackup(preSuiteFullBackup)`. إذا كان `origHmacKey` فارغًا أو مختلفًا عن `TEST_HMAC_KEY_64`، فإن `db.importFullBackup(preSuiteFullBackup)` يُتخطى أو يرفض التوقيع (بينما تنجح `AuditLogger.restoreSnapshot(preSuiteAuditSnapshot)` في السطر `1847` دائمًا لأنها لا تعتمد على مفتاح HMAC). تم توثيق هذا في **PROPOSAL-01** بالأسفل دون لمس الكود.

---

## 4. إعادة اختبار السيناريو العدائي `AC-11B` بالكامل (`VERIFIED`)

تم تنفيذ السيناريو العدائي الكامل بجميع خطواته السبعة عبر المسار الحقيقي `POST /api/v1/system/restore` في بيئة معزولة:
1. تصدير نسخة احتياطية سليمة للمستأجر `org-p1-3-2-audit-hardening-temp` موقعة بمفتاح جهة التحقق (`VERIFIER_HMAC_KEY`).
2. إنشاء مهاجم لا يملك `VERIFIER_HMAC_KEY`.
3. حذف حدثين قديمين وتعديل `afterState` للحدث الأول المتبقي (`{ v: 999999, forgedByAttacker: true }`) وحقن سجل macro مزور (`macro-forged`).
4. إعادة حساب جميع بصمات `SHA-256` (`integrityHash`) وروابط `prevHash` و `tenantPrevHash` والتسلسلات `globalSeq` و `tenantSeq`.
5. إعادة بناء `auditTenantCheckpoint` وجميع حقول `auditIntegrityManifest` (`eventsDigest`, `checkpointDigest`, `latestIntegrityHash`, `eventCount`, `perTenantSummaries`) بحيث أصبحت الحمولة متسقة ذاتيًا 100% على مستوى SHA-256 (`internalSha256SelfConsistentWithoutHmac.valid === true`).
6. تجربة البديلين معًا عبر `POST /api/v1/system/restore`:
   - **البديل A (`variantA_KeepOriginalSignature`)**: الاحتفاظ بالتوقيع الأصلي (`originalSignature`) المأخوذ من النسخة السليمة على الحمولة المعاد بناؤها.
   - **البديل B (`variantB_AttackerKeySignature`)**: توقيع الحمولة المعاد بناؤها بمفتاح المهاجم (`ATTACKER_KEY`).

### المخرج الخام الفعلي لإعادة اختبار `AC-11B` (`Exit Code: 0`):
```json
{
  "internalSha256SelfConsistentWithoutHmac": {
    "valid": true,
    "status": 200,
    "code": "VERIFIED",
    "checkedCount": 4
  },
  "variantA_KeepOriginalSignature": {
    "status": 400,
    "body": {
      "success": false,
      "error": {
        "code": "AUDIT_SIGNATURE_INVALID",
        "message": "Audit chain integrity verification failed (AUDIT_SIGNATURE_INVALID): Audit integrity manifest HMAC-SHA256 signature verification failed (forged or tampered manifest/checkpoint/chain)."
      }
    }
  },
  "variantB_AttackerKeySignature": {
    "status": 400,
    "body": {
      "success": false,
      "error": {
        "code": "AUDIT_SIGNATURE_INVALID",
        "message": "Audit chain integrity verification failed (AUDIT_SIGNATURE_INVALID): Audit integrity manifest HMAC-SHA256 signature verification failed (forged or tampered manifest/checkpoint/chain)."
      }
    }
  },
  "postRejectionStateProofs": {
    "memorySnapshotShaBefore": "762297d28170322fece63b18f5fd235bea3cf16d5caf1d73308dcfc1ff1406d4",
    "memorySnapshotShaAfter": "762297d28170322fece63b18f5fd235bea3cf16d5caf1d73308dcfc1ff1406d4",
    "memoryUntouched": true,
    "diskShaBefore": "dacfe1032cc0f39983fbcc77fca7bd04fd51c0689284d763f25c811f4f370019",
    "diskShaAfter": "dacfe1032cc0f39983fbcc77fca7bd04fd51c0689284d763f25c811f4f370019",
    "diskUntouched": true,
    "peerOrgEventsShaBefore": "1dac93b87eb417a693aa54bda2dedabd9fb527e99efb07dd2528a03a617dcf60",
    "peerOrgEventsShaAfter": "1dac93b87eb417a693aa54bda2dedabd9fb527e99efb07dd2528a03a617dcf60",
    "peerOrgUntouched": true,
    "forgedMacroInjected": false,
    "targetOriginalMacroIntact": true,
    "lastStorageError": {
      "operation": "importFullBackup",
      "code": "AUDIT_SIGNATURE_INVALID",
      "message": "Audit integrity manifest HMAC-SHA256 signature verification failed (forged or tampered manifest/checkpoint/chain).",
      "timestamp": "2026-10-29T17:29:38.041Z"
    },
    "hmacKeyLeakedInLogsOrResponses": false
  }
}
```

---

## 5. مراجعة مصفوفة الاختبارات الفعلية (`AC-01` إلى `AC-32`) في `server/test/p1-3-audit-chain-integrity-audit.ts` (`VERIFIED`)

تم فحص الكود المصدري الفعلي لكل اختبار في `server/test/p1-3-audit-chain-integrity-audit.ts` (الأسطر `230–1825`) ومطابقته مع تقرير `OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` ومع مخرج التشغيل الفعلي (`Exit Code: 0`):

| المعرّف والأسطر | السلوك / الدالة المختبرة | نوع الاختبار (هجوم / طبيعي) | المخرج الفعلي من التشغيل | طريقة التنظيف | تغطية الخاصية |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-01** (`L230–295`) | `AuditLogger.log()` + `verifyChainIntegrity()` لـ 22 حدث `v3` عبر مستأجرين | طبيعي (بناء السلسلة العامة والفرعية) | `checkedCount=22, v3Count=22, RAD=true` | `cleanupSyntheticOrgs()` + `restoreSnapshot` في `finally` | **كاملة (`FULL`)** |
| **AC-02** (`L298–352`) | `verifyChainIntegrity()` ضد 5 تعديلات (`afterState`, `actorId`, `createdAt`, `integrityHash`, حذف حدث وسطي) | هجوم (تلاعب بالحقول وحذف وسطي) | رفض الحالات الـ 5: `PAYLOAD_HASH_MISMATCH` (x4), `BROKEN_PREV_HASH_LINK` (x1) | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-03** (`L355–391`) | `db.saveToDisk()` + `AuditLogger.resetForTesting()` + `db.loadFromDisk()` | طبيعي (استمرارية القرص مع `DISK_SNAPSHOT` manifest) | `persistedEvents=22, manifestKeyId=audit-hmac-p1-3-2-test-v1` | `cleanupSyntheticOrgs()` + `saveToDisk()` | **كاملة (`FULL`)** |
| **AC-04** (`L394–421`) | `db.loadFromDisk()` على ملف قرص تم التلاعب بـ `auditEvents[2].afterState` فيه | هجوم (فساد/تلاعب بملف القرص) | `loadFromDisk=false, diagnosticCode=TAMPERED_AUDIT_CHAIN` | استعادة `tempDiskFile` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-05** (`L424–454`) | `db.exportTenantBackup()` + `AuditLogger.verifyTenantBackupIntegrity(..., { requireManifest: true })` | طبيعي (تصدير والتحقق من نسخة مستأجر موقعة) | `tenantEvents=11, code=VERIFIED` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-06** (`L457–501`) | `GET /api/v1/system/backup` + `POST /api/v1/system/restore` بحمولة معدّلة ثم سليمة | هجوم + طبيعي (استعادة عبر HTTP) | `tamperedStatus=400 (TAMPERED_AUDIT_CHAIN), cleanStatus=200` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-07** (`L504–590`) | `computeEventHash()` + `verifyChainIntegrity()` لسلسلة مختلطة (`v1` + `v2` + `v3`) | طبيعي (توافق الإصدارات دون إعادة كتابة صامتة) | `valid=true, v1Count=1, v2Count=1, v3Count=1` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-08** (`L593–633`) | `setMaxRetentionLimitForTesting(10)` (إخلاء 12 حدثًا إلى `retentionCheckpoint`) ثم حذف حدث دون تحديث النقطة | طبيعي + هجوم (إخلاء النافذة الساخنة + حذف غير مصرح) | `evicted=12, active=10, anchor=RETENTION_CHECKPOINT, unauthorizedDrop=INVALID_RETENTION_CHECKPOINT` | إعادة الحد إلى `2000` + `loadFromDisk()` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-09** (`L636–665`) | `GET /api/v1/audit/logs` بدور `Admin` مقابل `Agent` وفحص عزل المؤسسة | طبيعي + هجوم صلاحيات (`RBAC`) | `adminStatus=200 (tenantEvents=11), agentStatus=403` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-10** (`L668–703`) | `POST /api/v1/system/restore` مع حقن `macro` يحمل `organizationId` لمستأجر آخر | هجوم (تلويث عبر المستأجرين) | `status=403, code=CROSS_TENANT_RESTORE_FORBIDDEN` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-11** (`L706–807`) | `11A`: تلاعب بالـ checkpoint وحدها؛ `11B`: حذف أحداث + إعادة حساب كل بصمات SHA-256 + بناء checkpoint و manifest بتوقيع مفتاح خاطئ عبر `POST /system/restore` | هجوم (`11A` + `11B` تزوير كامل للسلسلة والنقطة) | `11A=BROKEN_ANCHOR_LINK, 11B=400 (AUDIT_SIGNATURE_INVALID)` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** *(وتم تعزيزها في القسم 4 أعلاه باختبار الاحتفاظ بالتوقيع الأصلي أيضًا)* |
| **AC-12** (`L810–864`) | `validateAuditHmacKey()` + `GET /api/v1/system/backup` عند غياب المفتاح، أو فساد صيغته، أو مطابقته لـ `CHANNEL_SECRET_ENCRYPTION_KEY` | هجوم / سوء ضبط (`Fail-Closed 503`) | `missing=503/AUDIT_KEY_UNAVAILABLE, reused=503/AUDIT_KEY_REUSE_FORBIDDEN` | استعادة `TEST_HMAC_KEY_64` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-13** (`L867–936`) | تدوير `AUDIT_CHECKPOINT_HMAC_KEY` والتحقق من القديم عبر `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS` ورفض `keyId` مجهول | طبيعي + هجوم (`Key Rotation` & `Unknown KeyId`) | `oldKeyVerified=true, rotatedKeyVerified=true, unknownKeyCode=AUDIT_KEY_ID_UNKNOWN` | استعادة مفاتيح الاختبار + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-14** (`L939–1001`) | `db.importFullBackupDetailed()` مع إعادة كتابة السلسلة العامة + `auditCheckpoint` دون مفتاح HMAC | هجوم (تزوير النسخة الكاملة) | `ok=false, status=400, code=AUDIT_SIGNATURE_INVALID` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-15** (`L1004–1040`) | `POST /system/restore` و `db.importFullBackupDetailed()` بعد حذف `auditIntegrityManifest` | هجوم (`Manifest Stripping`) | `tenantRestore=400/AUDIT_MANIFEST_MISSING, fullImport=400/AUDIT_MANIFEST_MISSING` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-16** (`L1043–1086`) | `verifyIntegrityManifest()` مع توقيع HMAC محسوب بمفتاح 32 بايت غير مصرح به | هجوم (`Unauthorized Signing Key`) | `valid=false, status=400, code=AUDIT_SIGNATURE_INVALID` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-17** (`L1089–1133`) | `verifyIntegrityManifest()` مع تعديل أي حقل claim (`eventCount`, `latestIntegrityHash`, `checkpointDigest`, `eventsDigest`, `issuedAt`, `scopeOrgId`) | هجوم (التلاعب بحقول الـ Manifest) | رفض جميع التعديلات الـ 6 (`AUDIT_SIGNATURE_INVALID` / `AUDIT_MANIFEST_INVALID`) | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-18** (`L1136–1192`) | استعادة نسخة مستأجر زميل موقعة بشكل صحيح (`403`)، واستبدال manifest النسخة الفرعية بـ manifest نسخة شاملة (`400`) | هجوم (`Cross-Tenant Manifest` & `Scope Swap`) | `crossTenant=403/CROSS_TENANT_RESTORE_FORBIDDEN, scopeSwap=400/AUDIT_MANIFEST_INVALID` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-19** (`L1195–1260`) | `db.loadFromDisk()` على ملف `db_state.json` أعيدت كتابة سلسلته ونقطة تفتيشه بالكامل على القرص | هجوم (تزوير ملف القرص الكامل) | `loadFromDisk=false, errorCode=AUDIT_SIGNATURE_INVALID` | استعادة `tempDiskFile` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-20** (`L1263–1294`) | `AuditLogger.restoreSnapshot()` بحمولة أحداث تالفة والتحقق من عدم تغير الذاكرة الحية | هجوم / ذرية (`Verify-Before-Mutate`) | `restoreValid=false, countBefore=23, countAfter=23, hashUnchanged=true` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-21** (`L1297–1334`) | `AuditLogger.restoreSnapshot()` بنقطة تفتيش غير متسقة (`totalEvictedCount=5, lastEvictedGlobalSeq=0`) | هجوم / ذرية (`Verify-Before-Mutate`) | `code=INVALID_RETENTION_CHECKPOINT, liveEvictedCount=0, hashUnchanged=true` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-22** (`L1337–1370`) | `AuditLogger.importEvents()` بأحداث معدّلة والتحقق من رمي استثناء دون المساس بالذاكرة | هجوم / ذرية (`Verify-Before-Mutate`) | `threwCode=PAYLOAD_HASH_MISMATCH, countBefore=23, countAfter=23` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-23** (`L1373–1424`) | `POST /api/v1/system/restore` بحمولة مرفوضة والتحقق من ثبات الذاكرة وبصمة `sha256` لملف القرص | هجوم / ذرية شاملة (ذاكرة + قرص) | `status=400, ghostMacroCommitted=false, diskShaUnchanged=true` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-24** (`L1427–1462`) | `db.loadFromDisk()` بملف مرفوض يحوي مؤسسة شبحية (`org-ghost-ac24`) والتحقق من عدم دخولها للذاكرة | هجوم / ذرية التحميل من القرص | `loadRes=false, ghostOrgPresent=false, orgsCount=3` | استعادة `tempDiskFile` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-25** (`L1465–1531`) | `computeEventHash()` للإصدار `v3`: ثبات البصمة عند عكس ترتيب المفاتيح المتداخلة، وتغيرها عند تعديل أيٍّ من 14 حقلاً شاملاً `ipAddress`, `userAgent`, `requestId`, `reason` | طبيعي + هجوم (تغطية الحقول والترتيب القانوني) | `reorderedKeysEqual=true, verifiedFields=14` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-26** (`L1534–1577`) | `verifyChainIntegrity()` و `verifyTenantBackupIntegrity()` ضد قيم `schemaVersion` غير مدعومة `[0, 4, 99, -1, "2", "3", null]` | هجوم (`Unsupported Schema Version`) | رفض جميع القيم الـ 7 بـ `UNSUPPORTED_AUDIT_SCHEMA_VERSION` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-27** (`L1580–1630`) | `deepFreezeAuditValue()`: محاولة تعديل الكائن الممرر بعد التسجيل، ومحاولة تعديل الحقول العليا والمتداخلة للحدث المخزن مباشرة | هجوم (تعديل الذاكرة الحية) | `topLevelThrew=true, nestedThrew=true, callerIsolationVerified=true` | `db.loadFromDisk()` + `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-28** (`L1633–1696`) | `verifyChainIntegrity([], ckpt)` و `verifyTenantBackupIntegrity(org, [], ckpt)` مع سلسلة فارغة ونقطة تفتيش سليمة ثم متلاعب بها | طبيعي + هجوم (`Empty Chain Checkpoint Validation`) | `cleanEmpty=CHAIN_VALID_EMPTY, badGlobalEmpty=INVALID_RETENTION_CHECKPOINT, badTenantEmpty=TAMPERED_AUDIT_CHAIN` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-29** (`L1699–1735`) | `verifyIntegrityManifest()` ضد 5 تواقيع غير صالحة الصيغة/الطول (`""`, `"1234"`, `"g"*64`, `"A"*64`, ناقص حرفين) قبل `timingSafeEqual` | هجوم (`Malformed Signature Vectors`) | `malformedVectorsTested=5, allReturned=400 AUDIT_MANIFEST_INVALID` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-30** (`L1738–1765`) | فحص مخرجات `GET /system/backup`, `GET /audit/logs`, `exportFullBackup()`, وملف `db_state.json` للتأكد من عدم تسرب `TEST_HMAC_KEY_64` | فحص تسرب أسرار (`Key Secrecy`) | `artifactsInspected=4, rawKeyOccurrences=0` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |
| **AC-31** (`L1768–1791`) | تصنيف معماري صريح لحدود إعادة تشغيل لقطة قديمة موقعة بمفتاح صحيح (`Rollback Replay`) | توثيق حدود معمارية (`Boundary Classification`) | مصنف صراحة كـ `OPEN — REQUIRES MONOTONIC STATE GENERATION COUNTER OR EXTERNAL ANCHOR IN POSTGRESQL PHASE` | `cleanupSyntheticOrgs()` | **جزئية بطبيعتها المعمارية (`ARCHITECTURAL BOUNDARY DISCLOSED`)** |
| **AC-32** (`L1794–1825`) | `validateAuditHmacKey()` عند مساواة مفتاح HMAC بمفتاح `CHANNEL_SECRET_ENCRYPTION_KEY` أو `SESSION_SECRET` | هجوم / سوء ضبط (`Key Separation`) | `channelKeyReuse=AUDIT_KEY_REUSE_FORBIDDEN, sessionSecretReuse=AUDIT_KEY_REUSE_FORBIDDEN` | `cleanupSyntheticOrgs()` | **كاملة (`FULL`)** |

---

## 6. مراجعة نطاق التغيير (`Scope of Change Review`)

بمقارنة الملفات على GitHub في الالتزام المرجعي `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` (`VERIFIED` عبر `raw.githubusercontent.com`) والملفات المحلية قبل وبعد P.1.3.2:

| العنصر محل الفحص | هل هو موجود في الكود الفعلي؟ | متى أُضيف؟ | الخطر الذي يعالجه | هل يقع ضمن النطاق المصرح به؟ | تأثيره على الاستعادة أو الاحتفاظ أو التوافق التاريخي |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **`CheckpointRetentionAnchor`** | **لا (`VERIFIED ABSENT`)** | لم يُضف في الكود الفعلي (ورد فقط في ملخص الضغط الآلي). الكود الفعلي يستخدم `AuditRetentionCheckpoint` و `TenantAuditCheckpoint` الموقّعين داخل `AuditIntegrityManifest`. | — | — | لا يوجد في الكود. |
| **`compactChain()`** | **لا (`VERIFIED ABSENT`)** | لم يُضف في الكود الفعلي. الاحتفاظ المحدود يتم تلقائيًا في `AuditLogger.log()` عبر النافذة الساخنة (`maxRetentionLimit = 2000`) و `recordEvictedEventInCheckpoint()`. | — | — | لا يوجد في الكود. |
| **`injectRawEntriesForTesting`** | **لا (`VERIFIED ABSENT`)** | لم يُضف في الكود الفعلي. الاختبارات تمرر مصفوفات مرشحة مباشرة إلى `verifyChainIntegrity(candidateEvents)` دون تلويث المخزن الحي. | — | — | لا يوجد في الكود. |
| **`purgeSyntheticTenantAuditEvents`** | **لا (`VERIFIED ABSENT`)** | لم يُضف في الكود الفعلي. تنظيف الاختبارات يعتمد حصريًا على `captureSnapshot()` / `restoreSnapshot()` دون المساس بأي حدث أو إعادة ربطه. | — | — | يحافظ 100% على السجلات الأصلية دون إعادة تجزئة. |
| **`deepFreezeAuditValue`** (`audit.ts:L65–L80`) | **نعم (`VERIFIED PRESENT`)** | أُضيف في **P.1.3.2** (حل محل التجميد السطحي `Object.freeze` الذي كان في P.1.3). | يمنع تعديل الكائنات والمصفوفات المتداخلة (`beforeState`, `afterState`) في الذاكرة بعد تسجيل الحدث (`F-05`). | **نعم (`AUTHORIZED`)** | لا يغير البنية المتسلسلة (JSON) ولا يؤثر على التوافق التاريخي. |
| **`schemaVersion: 3`** (`audit.ts:L778, L1472–L1565`) | **نعم (`VERIFIED PRESENT`)** | `v1` كان في `9a5eae44`؛ `v2` أُضيف في `P.1.3`؛ `v3` أُضيف في **`P.1.3.2`** مع رفض القيم غير المعروفة بـ `UNSUPPORTED_AUDIT_SCHEMA_VERSION`. | يربط الحقول الجنائية الـ 18 كاملة (`ipAddress`, `userAgent`, `requestId`, `reason`) مع ترتيب مفاتيح قانوني متكرر (`F-03`, `F-06`). | **نعم (`AUTHORIZED`)** | متوافق رجعيًا 100% مع أحداث `v1` و `v2` التاريخية دون إعادة كتابة بصماتها (`AC-07`). |
| **`AuditIntegrityManifest` & HMAC Functions** (`audit.ts:L152–L307, L927–L1362`) | **نعم (`VERIFIED PRESENT`)** | أُضيفت في **`P.1.3.2`**. | تمنع تزوير السلسلة ونقطة التفتيش (`AC-11B`, `F-01`, `F-04`). | **نعم (`AUTHORIZED`)** | تشترط وجود `auditIntegrityManifest` عند الاستعادة والتحميل (مع سماح صريح بترحيل ملف القرص القديم `1.1.0-enterprise-p1` غير الموقّع لمرة واحدة في `store.ts:L1230–L1240`). |
| **`restoreSnapshot` & `importEvents` Staging Verification** (`audit.ts:L1380–L1463`) | **نعم (`VERIFIED PRESENT`)** | `captureSnapshot`/`restoreSnapshot` أُضيفت في `P.1.3`، وتمت تقويتها في **`P.1.3.2`** للتحقق في مرحلة staging قبل تعديل الذاكرة. | تمنع تلوث الذاكرة الحية عند استيراد أو استعادة لقطة تالفة (`F-02`). | **نعم (`AUTHORIZED`)** | تضمن الذرية الكاملة (`Verify-Before-Mutate`). |

---

## 7. مراجعة البصمات والأدلة (`SHA-256 & Manifest Verification`)

### 7.1 التحقق من ملف الـ Manifest الفعلي (`docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256`)
تم تشغيل:
```bash
sha256sum -c docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256
```
**المخرج الخام الفعلي (`Exit Code: 0`)**:
```text
.env.example: OK
server/core/types.ts: OK
server/core/audit.ts: OK
server/db/store.ts: OK
server/test/p1-2-channel-secret-encryption-audit.ts: OK
server/test/p1-3-audit-chain-integrity-audit.ts: OK
server/test/run-enterprise-audit.ts: OK
docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md: OK
```

### 7.2 نتائج فحص معايير القسم 7 الستة (`VERIFIED`)
1. **طول كل بصمة 64 محرفًا سداسيًا عشريًا**: **متحقق (`VERIFIED`)** — جميع البصمات الـ 8 في `OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` تطابق `/^[0-9a-f]{64}$/`.
2. **عدم وجود بصمات منسوخة من نسخة سابقة**: **متحقق (`VERIFIED`)** — كل بصمة تطابق الملف الحالي الفعلي على القرص الآن (`OK`).
3. **وجود كل ملف مدرج فعليًا**: **متحقق (`VERIFIED`)** — جميع الملفات الـ 8 موجودة على القرص.
4. **عدم ادعاء الـ manifest التحقق من ملفات غير موجودة**: **متحقق (`VERIFIED`)**.
5. **غياب دورة الاعتماد الدائرية (`No Circular Hash Dependency`)**: **متحقق (`VERIFIED`)** — التقرير `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` لا يضمّن بصمة نفسه ولا يضمّن بصمة ملف `OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256`، بل يتم التحقق من التقرير وملفات الكود بشكل أحادي الاتجاه عبر ملف `OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` المستقل (وبصمة ملف الـ manifest نفسه هي `4d934863b44988963f6a8680d52dfdc28204cf50de1d1b86387f147e01738186`).
6. **فحص المخرجات الخام (`RAW Outputs`)**:
   - المخرجات الخام المسجلة داخل ملف التقرير على القرص (`docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` القسم 10) هي **مخرجات حقيقية مطابقة حرفيًا** لمخرج `npx tsx server/test/p1-3-audit-chain-integrity-audit.ts`.
   - أما الملخص النصي الذي ظهر في رسالة المحادثة السابقة مباشرة بعد عملية `Compaction` فقد اعتمد على ملخص الضغط الآلي بدلاً من الملف الفعلي على القرص، ولذلك تم استبعاده هنا واعتماد مخرجات التنفيذ الحي والملفات الفعلية على القرص فقط.

---

## 8. حالة GitHub والاختبارات البعيدة (`Remote GitHub & CI Status`)

- **آخر التزام على الفرع `main` البعيد (`VERIFIED via GitHub API`)**:
  `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` بتاريخ `2026-10-26T20:25:17Z`.
- **وجود ملفات P.1.3.2 على الفرع البعيد**: غير موجودة بعد على `main` البعيد (موجودة محليًا فقط في `/app/applet`).
- **التصنيف الإلزامي المعتمد**:
  **`LOCAL EVIDENCE REVIEW ONLY — REMOTE CI NOT VERIFIED`**.

---

## 9. تصنيف النتائج (`VERIFIED` / `INFERRED` / `UNKNOWN`) والمخاطر المفتوحة

### 9.1 جدول التصنيف الجنائي
| البند | التصنيف | الدليل |
| :--- | :---: | :--- |
| منع إعادة بناء نسخة احتياطية مزورة بالكامل (`AC-11B` بكلا البديلين: التوقيع الأصلي أو توقيع مفتاح مهاجم) | **`VERIFIED`** | رفض فعلي عبر `POST /api/v1/system/restore` برمز `400 AUDIT_SIGNATURE_INVALID` وبقاء الذاكرة والقرص والمؤسسة النظيرة دون أي تغيير. |
| عدم إمكانية إنشاء بيانات دائمة بمفتاح مؤقت (`Ephemeral Key`) تعجز العملية التالية عن التحقق منها | **`VERIFIED`** | الكود الفعلي لا يحتوي على `AUDIT_ALLOW_EPHEMERAL_KEY` أصلاً ويرفض الحفظ والتصدير (`503 AUDIT_KEY_UNAVAILABLE`) عند غياب `AUDIT_CHECKPOINT_HMAC_KEY` في جميع البيئات. |
| عدم تغيير أو إعادة حساب بصمات سجلات التدقيق الأصلية أثناء تنظيف الاختبارات | **`VERIFIED`** | التنظيف يتم عبر `AuditLogger.captureSnapshot()` و `restoreSnapshot()`؛ أثبت الفحص تطابق بصمة اللقطة `417f302431713a0dfbf883061e127bb33af5f222e85d12fdcecf8d5785af344c` وجميع الـ IDs والهاشات قبل وبعد تشغيل حزمتي P.1.2 و P.1.3.2. |
| ارتباط الاختبارات `AC-01`..`AC-32` في ملف الاختبار الفعلي بالسيناريوهات الأمنية المطلوبة | **`VERIFIED`** | تمت مراجعة الكود المصدري للأقسام الـ 32 وتشغيلها فعليًا (`32/32 PASSED`, `Exit Code: 0`). |
| صحة بصمات `OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` وخلو الكود من السلاسل الفاسدة الثلاث | **`VERIFIED`** | `sha256sum -c` اجتاز بنسبة 8/8 (`Exit Code: 0`)، و `grep` للسلاسل الثلاث أعاد `0` تطابقات (`Exit Code: 1`). |
| تاريخ التعديلات التفصيلي سطرًا بسطر داخل الجلسة المحلية بين P.1.3 و P.1.3.1 قبل P.1.3.2 | **`INFERRED`** | نظرًا لغياب `.git` محلي، تم إثبات الفرق الكلي مقابل التزام GitHub `9a5eae44` (`VERIFIED`) ومقابل بصمات ما قبل P.1.3.2 المسجلة في التقارير المحلية. |
| نتيجة تشغيل GitHub Actions CI البعيد على كود P.1.3.2 الحالي | **`UNKNOWN`** | لم يتم دفع التعديلات المحلية إلى GitHub بعد (`LOCAL EVIDENCE REVIEW ONLY — REMOTE CI NOT VERIFIED`). |

### 9.2 المخاطر المفتوحة والحدود المعمارية + اقتراح التحسين غير المتدخل (`PROPOSAL-01`)
1. **خطر إعادة تشغيل لقطة قديمة موقعة بمفتاح صحيح (`Rollback Replay Attack` — `AC-31`)**:
   - مصنف صراحة كحد معماري مفتوح لمرحلة PostgreSQL: يتطلب عداد جيل رتيب (`Monotonic State Generation Counter`) مخزنًا في قاعدة بيانات خارجية أو KMS لمنع استعادة نسخة قديمة موقعة بشكل شرعي فوق حالة أحدث.
2. **اقتراح تحسين اختياري غير متدخل (`PROPOSAL-01` — لم يُنفَّذ التزامًا بقواعد P.1.3.2.1)**:
   - **الموقع**: `server/test/p1-3-audit-chain-integrity-audit.ts` (الأسطر `1834–1847` في كتلة `finally`).
   - **السبب**: يتم أخذ `preSuiteFullBackup = db.exportFullBackup()` في السطر `173` بعد ضبط مفتاح الاختبار `TEST_HMAC_KEY_64`، بينما في `finally` تتم إعادة `process.env.AUDIT_CHECKPOINT_HMAC_KEY` إلى قيمته الأصلية `origHmacKey` **قبل** استدعاء `db.importFullBackup(preSuiteFullBackup)`.
   - **الخطر**: إذا استُدعيت دالة الاختبار من عملية كان فيها `AUDIT_CHECKPOINT_HMAC_KEY` مضبوطًا على مفتاح مختلف عن `TEST_HMAC_KEY_64` (أو غير مضبوط)، فإن `db.importFullBackup(preSuiteFullBackup)` في `finally` سيرفض الاستعادة أو يُتخطى (رغم أن `cleanupSyntheticOrgs()` و `AuditLogger.restoreSnapshot(preSuiteAuditSnapshot)` يقومان بتنظيف المستأجرين الاصطناعيين واستعادة سجل التدقيق بالكامل).
   - **البديل الأقل تدخلاً (`Least-Intrusive Alternative`)**: نقل السطر `db.importFullBackup(preSuiteFullBackup);` في كتلة `finally` ليُنفَّذ مباشرة **قبل** إعادة `process.env.AUDIT_CHECKPOINT_HMAC_KEY` إلى `origHmacKey`. (بانتظار موافقة المالك إن رغب في تطبيقه).

---

## 10. قرار القبول النهائي والملخص التنفيذي (`Final Gate Decision`)

### القرار النهائي:
**`PASS FOR EVIDENCE REVIEW`**

### الملخص التنفيذي:
1. **ما تم التحقق منه بالفعل (`VERIFIED`)**:
   - الكود المصدري الفعلي على القرص (`server/core/audit.ts`, `server/db/store.ts`, `server/test/p1-3-audit-chain-integrity-audit.ts`, `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md`) خالٍ تمامًا من أنماط الفساد النصي الثلاثة المعروفة (`GREP_EXIT_CODE=1`)، وبصماته الـ 8 مطابقة 100% لملف `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` (`sha256sum -c` -> `Exit Code: 0`).
   - لا يوجد أي مفتاح HMAC مؤقت (`Ephemeral Key`) في الكود الفعلي؛ النظام يعمل بمنطق `Fail-Closed` (`503 AUDIT_KEY_UNAVAILABLE`) في جميع البيئات، ويدعم التحقق عبر العمليات المستقلة وتدوير المفاتيح عبر `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS`.
   - تنظيف الاختبارات يحافظ 100% على سجلات التدقيق الأصلية (`org-madar-001`) حرفيًا وبنفس البصمات والمعرفات والتسلسلات (`bitForBitIdentical: true`) عبر `captureSnapshot()` / `restoreSnapshot()` دون أي إعادة تجزئة أو إعادة ربط.
   - تم إعادة اختبار هجوم التزوير الكامل `AC-11B` (إعادة بناء السلسلة وبصمات SHA-256 ونقطة التفتيش والـ manifest claims مع الاحتفاظ بالتوقيع الأصلي أو التوقيع بمفتاح مهاجم) عبر المسار الحقيقي `POST /api/v1/system/restore` وثبت رفضه الحتمي (`400 AUDIT_SIGNATURE_INVALID`) مع بقاء الذاكرة والقرص والمؤسسة النظيرة دون أي مساس.
2. **ما بقي `UNKNOWN`**:
   - حالة GitHub Actions CI البعيد لهذه التعديلات (`LOCAL EVIDENCE REVIEW ONLY — REMOTE CI NOT VERIFIED`) لأن الفرع البعيد `main` لا يزال عند الالتزام `9a5eae44e022ac1ac8c6513f31dd804aa79b8619`.
3. **هل توجد مخاطر على سلامة السجلات الأصلية؟**:
   - **لا** — ثبت بالتجربة العملية تطابق بصمة لقطة السجلات الأصلية قبل وبعد تشغيل حزم الاختبارات (`417f302431713a0dfbf883061e127bb33af5f222e85d12fdcecf8d5785af344c`).
4. **هل اختُبر التزوير الكامل (`AC-11B`)؟**:
   - **نعم** — اختُبر عبر المسار الحقيقي `POST /api/v1/system/restore` لحمولة ذات بصمات SHA-256 متسقة ذاتيًا بالكامل بكلا البديلين (التوقيع الأصلي وتوقيع المهاجم) ورُفضت الحالتان برمز `400 AUDIT_SIGNATURE_INVALID`.
5. **أقل خطوة تالية ذات قيمة فعلية**:
   - مراجعة المالك لهذا التقرير (`docs/roadmap/OMNIFLOW_PHASE_P1_3_2_1_FORENSIC_REVIEW.md`) والـ `PROPOSAL-01` الاختياري، ثم مزامنة الملفات الثمانية المعتمدة مع GitHub للتحقق من CI البعيد قبل الانتقال إلى المرحلة التالية.
