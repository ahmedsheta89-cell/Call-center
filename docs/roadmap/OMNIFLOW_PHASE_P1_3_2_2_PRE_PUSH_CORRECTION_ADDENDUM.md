# PHASE P.1.3.2.2 / P.1.3.2.3 — Pre-Push Forensic Correction Addendum
**ملحق تصحيح جنائي مستقل لما قبل الرفع (Independent Pre-Push Correction Addendum — Not a Rewrite of Historical Reports)**

- **معرّف الوثيقة:** `OMNIFLOW_PHASE_P1_3_2_2_PRE_PUSH_CORRECTION_ADDENDUM`
- **تاريخ ووقت الإنشاء (UTC):** `2026-10-29T18:52:30Z`
- **المستودع والفرع المستهدف:** `ahmedsheta89-cell/Call-center` (`main`)
- **التزام الأساس البعيد المرجعي (`main` HEAD):** `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` `[VERIFIED]`
- **حالة النشر والمزامنة:** `LOCAL CHANGE ONLY — NO COMMIT, PUSH OR DEPLOY`

---

## 1. طبيعة هذه الوثيقة وسبب إنشائها

هذه الوثيقة هي **ملحق تصحيح جنائي لاحق ومستقل (Correction Addendum)** أُنشئ ضمن المرحلة `PHASE P.1.3.2.3` لتوثيق وتصحيح أربع نقاط ظهرت في مخرجات المحادثة النصية لتقرير الجرد السابق (`PHASE P.1.3.2.2`) دون تعديل أو إعادة كتابة أيٍّ من التقارير التاريخية المحفوظة على القرص:
- `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` (بقي دون أي تعديل — `SHA-256: 4005327aa0f13fd9a25894f7b61bdcdc514cddc8144bfe8d3cb5d03a8e244cb9`)
- `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_1_FORENSIC_REVIEW.md` (بقي دون أي تعديل — `SHA-256: c9a0d3e4280a9a6ee36c645c28eb863aecd923fb0536d4abfae6aab9de209bdb`)

**إقرار منهجي حول الاستقلالية:**
هذه الوثيقة مكتوبة بواسطة وكيل التطوير في الجلسة الحالية، ولذلك لا تُصنَّف باعتبارها «مراجعة طرف ثالث مستقل» لمجرد كونها ملفًا جديدًا، بل تستند قيمتها الإثباتية حصريًا إلى الفصل الصريح بين:
1. **قيم حُسبت فعليًا على القرص (`[VERIFIED]`)** عبر `sha256sum` وNode.js `crypto` وفحص الملفات المباشر.
2. **ادعاءات أو نصوص وردت في مخرجات محادثة أو تقارير سابقة** وتبيّن عند مقارنتها بالملفات الفعلية على القرص أنها ناتجة عن ملخص ضغط المحادثة الآلي (`Compaction Summary`).
3. **استنتاجات مبنية على مقارنة الكود المصدري بالتقارير (`[INFERRED]`)**.
4. **عناصر لم يمكن إثباتها محليًا (`[UNKNOWN]`)**.

---

## 2. تصحيح التناقض المتعلق بمتغير المفتاح المؤقت (`AUDIT_ALLOW_EPHEMERAL_KEY` مقابل `AUDIT_ALLOW_EPHEMERAL_DEV_KEY`) وعقد `.env.example`

### 2.1. أصل التناقض في مخرجات المحادثة السابقة
1. في تقرير `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_1_FORENSIC_REVIEW.md` (القسم `1.5.ب` و`2.1`)، جرى البحث عن الاسم `AUDIT_ALLOW_EPHEMERAL_KEY` وأثبت الفحص عدم وجوده في الكود (`0 matches`).
2. في رد المحادثة النصي للمرحلة `P.1.3.2.2` (الذي كُتب مباشرة بعد عملية ضغط سياق المحادثة `Compaction`)، ذكر النص أن `.env.example` يحتوي على المتغير `AUDIT_ALLOW_EPHEMERAL_DEV_KEY="false"` وعلى وصف يقبل `Base64` (`replace_with_32_byte_base64_or_64_char_hex_hmac_key`)، كما نسب إلى `server/core/audit.ts` وجود مسار يسمح بمفتاح مؤقت عند تفعيل `AUDIT_ALLOW_EPHEMERAL_DEV_KEY === 'true'` في بيئة التطوير.

### 2.2. الحقيقة الفعلية المثبتة من فحص الكود المصدري و`.env.example` على القرص (`[VERIFIED]`)
تم فحص الملفات الفعلية على القرص في `/app/applet` (`server/core/audit.ts` ذي البصمة `4940365746994391f2bf1327fe742d771594dff80a9e1c5d60c1f0c28835cd66`، و`.env.example` ذي البصمة `2c24a860a2e29d65ffac6a1bfd0f149dc9f12fa1426a070dc3f3481b3893b71d`):

1. **غياب أي متغير أو مسار للمفتاح المؤقت بالكامل (`[VERIFIED]`):**
   - تنفيذ البحث الشامل عن السلسلة الجزئية `EPHEMERAL` عبر كامل شجرة الكود (`grep -rn "EPHEMERAL" server/ src/ .env.example`) أعاد **`0` تطابقات**.
   - لا يوجد في `server/core/audit.ts` ولا في `.env.example` ولا في `server/test/*` أي متغير باسم `AUDIT_ALLOW_EPHEMERAL_KEY` **ولا** باسم `AUDIT_ALLOW_EPHEMERAL_DEV_KEY`.
   - الكود الفعلي في `validateAuditHmacKey()` (`server/core/audit.ts:L152–L230`) **لا ينشئ أي مفتاح مؤقت في الذاكرة في أي بيئة** (سواء كانت `production` أو `development` أو `test`)، ولا يسمح بأي كتابة دائمة أو تصدير أو تحقق بدون مفتاح `AUDIT_CHECKPOINT_HMAC_KEY` صالح.

2. **السلوك الفعلي المطبّق في `server/core/audit.ts` (`[VERIFIED]`):**
   - **اسم المتغير الأساسي:** `AUDIT_CHECKPOINT_HMAC_KEY`.
   - **الصيغة والطول المقبولان:** سلسلة سداسية عشرية بأحرف صغيرة بطول 64 محرفًا بالضبط تطابق التعبير النمطي `HEX_64_REGEX = /^[0-9a-f]{64}$/`، وتُفك عبر `Buffer.from(rawKey, 'hex')` إلى `32` بايت (`256` بت). **ترميز Base64 غير مدعوم إطلاقًا**.
   - **الفصل التشفيري بين المفاتيح:** يُرفض إعادة استخدام `CHANNEL_SECRET_ENCRYPTION_KEY` أو `SESSION_SECRET` (مقارنة غير حساسة لحالة الأحرف) برمز الحالة `503` والكود `AUDIT_KEY_REUSE_FORBIDDEN`.
   - **السلوك عند غياب المفتاح أو فساد صيغته:** يفشل النظام بشكل مغلق (`Fail-Closed`) في جميع البيئات برمز `503 AUDIT_KEY_UNAVAILABLE` (عند الغياب) أو `503 AUDIT_KEY_INVALID` (عند مخالفة الصيغة).
   - **سياسة `keyId` وتدوير المفاتيح:** يُقرأ المعرّف النشط من `AUDIT_CHECKPOINT_HMAC_KEY_ID` (الافتراضي `'audit-hmac-v1'`، ويطابق `/^[a-zA-Z0-9._:-]+$/`). وعند التحقق عبر `resolveAuditHmacVerificationKey()` (`L237–L307`)، إذا اختلف `manifest.keyId` عن المعرّف النشط، يبحث النظام في حلقة المفاتيح التاريخية الاختيارية `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS` (بصيغة `"old-key-id:64hex,prev-id:64hex"`). وإذا لم يُعثر على المعرّف يفشل التحقق برمز `400 AUDIT_KEY_ID_UNKNOWN`.

3. **حالة ملف `.env.example` الفعلي على القرص (`[VERIFIED]`):**
   - خلافًا لما ورد في ملخص محادثة `P.1.3.2.2`، فإن ملف `.env.example` الفعلي على القرص (`32` سطرًا، `1,992` بايت، البصمة `2c24a860a2e29d65ffac6a1bfd0f149dc9f12fa1426a070dc3f3481b3893b71d`) يحتوي بالفعل في الأسطر `23–29` على الوصف المطابق حرفيًا للكود:
     ```dotenv
     # AUDIT_CHECKPOINT_HMAC_KEY: Required for HMAC-SHA-256 cryptographic signing and verification of AuditIntegrityManifests.
     # Must be an exact 64-character lowercase hexadecimal string (32 bytes = 256 bits) matching ^[0-9a-f]{64}$.
     # MUST be cryptographically distinct from CHANNEL_SECRET_ENCRYPTION_KEY and SESSION_SECRET (key reuse is rejected with AUDIT_KEY_REUSE_FORBIDDEN).
     AUDIT_CHECKPOINT_HMAC_KEY="REPLACE_WITH_64_LOWERCASE_HEX_CHARS_32_BYTES_AUDIT_HMAC_KEY"
     AUDIT_CHECKPOINT_HMAC_KEY_ID="audit-hmac-v1"
     # AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS: Optional comma-separated historical verification key ring ("old-key-id:64hex,prev-id:64hex").
     AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS=""
     ```
   - وعليه، فإن الادعاء الوارد في نص محادثة `P.1.3.2.2` بوجود `AUDIT_ALLOW_EPHEMERAL_DEV_KEY` أو قبول `Base64` في `.env.example` كان **خاطئًا** (نابعًا من تلخيص الضغط الآلي لجلسة سابقة من المرحلة `P.1.3` قبل تقوية `P.1.3.2`)، بينما كان تقرير `OMNIFLOW_PHASE_P1_3_2_1_FORENSIC_REVIEW.md` وتقرير `OMNIFLOW_PHASE_P1_3_2_AUDIT_INTEGRITY_HARDENING_REPORT.md` على القرص صحيحين في وصفهما لعدم وجود مفتاح مؤقت.
   - تطبيقًا للبند `5.4` والبند `9` من عقد `P.1.3.2.3`: **لم يتم تعديل `.env.example` ولا `docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256`** لأن الملف الفعلي على القرص مطابق أصلًا للكود المصدري بنسبة 100%.

---

## 3. توثيق خطأ الدليل النصي لبصمة `SHA-256` للملف المحذوف (`WP-01` / `P.1.3.2.3.2 Repair`)

1. **خطأ الدليل النصي في التقارير السابقة (`[VERIFIED]`):**
   - أوردت التقارير النصية السابقة (`P.1.3.2.2` و`P.1.3.2.3`) السلسلة التالية باعتبارها بصمة `SHA-256` للملف المحذوف `public/assets/aistudio/Paste_October_29__2026_-_12_03PM_572057a9`:
     `572057a963d1286ea6d1EME9M9cSy9FvfHvcx2gMPkp1H5Dj4YaKufPRsAyon8Tf`
   - الفحص الآلي المباشر لهذه السلسلة النصية كما عُرضت يثبت الحقائق التالية (`[VERIFIED]`):
     - **الطول الفعلي للسلسلة المعروضة:** **`64` محرفًا** بالضبط (تتكون من 20 محرفًا سداسيًا عشريًا في البداية متبوعة بـ 44 محرفًا تحتوي على أحرف كبيرة وخارج النطاق السداسي العشري). *(تصحيح: ذُكر خطأً في رد المحادثة `P.1.3.2.3.1` أن طولها `65` محرفًا، والصواب المثبت برمجيًا عبر `.length` هو **`64` محرفًا**).*
     - **مطابقة التعبير النمطي `^[0-9a-f]{64}$`:** **`false`**.
     - **الصلاحية كبصمة `SHA-256` سداسية عشرية:** **غير صالحة (`INVALID`)** كما عُرضت في النص، ولا يجوز نسبتها حرفيًا إلى مخرج خام موثوق من `sha256sum` أو Node.js `crypto`.

2. **حالة الملف المحذوف والمخرجات الخام المستقلة (`[VERIFIED]` / `[UNKNOWN]`):**
   - تم حذف الملف الدخيل `public/assets/aistudio/Paste_October_29__2026_-_12_03PM_572057a9` من مساحة العمل في `WP-02`، والتزامًا بقواعد النزاهة الجنائية **لم تتم إعادة إنشائه**.
   - لم يُعثر على سجل مخرجات خام مستقل محفوظ على القرص خارج نصوص التقارير (`[VERIFIED]`).
   - التزامًا بمنع التخمين أو إعادة بناء البصمة الأصلية بعد حذف الملف، تُصنَّف البصمة الأصلية للملف المحذوف رسميًا ونهائيًا:
     **`UNKNOWN — ORIGINAL BYTES OR TRUSTWORTHY RAW OUTPUT UNAVAILABLE`**
   - ويُصنَّف اختبار التحقق `T-01` الخاص ببصمة هذا الملف قبل إزالته رسميًا:
     **`UNVERIFIED — ORIGINAL DIGEST CANNOT BE REVALIDATED`**

3. **التفسير المحتمل لظهور السلسلة المشوهة في النص (`[INFERRED]`):**
   - `[INFERRED]` يُرجَّح أن ظهور المقطع غير السداسي العشري (`EME9M9...`) في النص المعروض ناتج عن تشوه أثناء توليد النص أو معالجته في مخرجات الجلسة، ولا يُعرض هذا التفسير باعتباره حقيقة مثبتة بمخرج خام مستقل.

---

## 4. توثيق إزالة ملفي المزامنة الدخيلين (`WP-02`)

بعد استيفاء فحوص عدم الاعتماد عليهما في الكود أو البناء أو شجرة `main`، تمت إزالة الملفين الدخيلين التاليين فقط من مساحة العمل:

1. **`bun.lock`**
   - **الحجم والبصمة قبل الحذف (`[VERIFIED]`):** `303,375` بايت (`2,511` سطرًا)، `SHA-256: 9fc0dcef0da73b26853a9cfa089261ea71d90277829ee2460cd43ace38d3e1df`.
   - **أدلة عدم الاعتماد عليه (`[VERIFIED]`):**
     - غير موجود في شجرة التزام `main` البعيد (`BUN_LOCK_IN_MAIN: false`).
     - المشروع يستخدم `npm` باستراتيجية خالية من ملفات القفل (`Lockfile-Free Workspace Strategy`) كما هو موثق صراحة في `.github/workflows/ci.yml` (`L38–L39`: `npm install --no-audit --no-fund`) وفي `package.json` (حيث `package-lock.json` غير موجود أصلًا على القرص ولا في `main`).
     - مسار فحص النظافة في `server/api/router.ts` (`L3142` و`L3567`) يستبعد ملفات القفل صراحة ويتحقق من عدم وجود `bun.lock` (`const lockfilesExcluded = !fs.existsSync(path.join(process.cwd(), 'bun.lock'))`).
   - **حالة ما بعد الحذف:** تم حذفه والتحقق من عدم وجوده على القرص (`[VERIFIED]`).

2. **`public/assets/aistudio/Paste_October_29__2026_-_12_03PM_572057a9`**
   - **الحجم قبل الحذف (`[VERIFIED]`):** `66,943` بايت (`1,023` سطرًا).
   - **حالة البصمة الأصلية (`[UNKNOWN]`):** `UNKNOWN — ORIGINAL BYTES OR TRUSTWORTHY RAW OUTPUT UNAVAILABLE` (عُرضت لها قيمة نصية غير صالحة بطول `64` محرفًا لا تطابق `^[0-9a-f]{64}$` في التقرير السابق، وبما أن الملف حُذف ولم يُحفظ له مخرج خام مستقل خارج التقرير، فإن بصمته الأصلية غير قابلة لإعادة التحقق).
   - **أدلة عدم الاعتماد عليه (`[VERIFIED]`):**
     - غير موجود في شجرة التزام `main` البعيد (`PASTE_IN_MAIN: false`).
     - لا يوجد أي مرجع له في الكود المصدري أو إعدادات البناء (`grep` أعاد `0` تطابقات).
     - يمثل نسخة تلقائية من مرفق نصي في المحادثة ولا يجوز نشره ضمن الأصول العامة `public/`.
   - **حالة ما بعد الحذف:** تم حذفه وحده دون استخدام wildcard ودون مساس بأي ملف آخر، ولم يُعد إنشاؤه (`[VERIFIED]`).

---

## 5. تصحيح سجل بيانات الالتزام البعيد والملاحظات المعيارية والبنود غير المحسومة (`UNKNOWN`)

1. **بيانات الالتزام البعيد المرجعي على GitHub (`[VERIFIED]`):**
   - أظهر الاستعلام المباشر للقراءة فقط عن الالتزام `9a5eae44e022ac1ac8c6513f31dd804aa79b8619` عبر GitHub API أن:
     - `sha`: `9a5eae44e022ac1ac8c6513f31dd804aa79b8619`
     - `commit.author.date`: `2026-10-26T20:25:17Z`
     - `commit.message`: `fix(db): resolve persistence hang in CI` (مع 4 نقاط تفصيلية حول `persistTimer`, `saveToDisk`, فحوص المسارات، وترويسات إغلاق الاتصال).
   - وهذا يصحح العنوان الخاطئ لرسالة الالتزام الذي كان قد ورد في نص محادثة `P.1.3.2.2` نتيجة تلخيص الضغط الآلي.

2. **الإطار المعياري:**
   - تتسق ضوابط فصل المفاتيح التشفيرية (`AUDIT_KEY_REUSE_FORBIDDEN`) والتحقق بزمن ثابت (`crypto.timingSafeEqual`) ورفض القيم غير الصالحة (`Fail-Closed`) مع مبادئ **OWASP ASVS v5.0.0** وواجهات **Node.js `v22.23.4` Crypto API** القياسية، دون ادعاء امتثال شامل لكامل معيار ASVS خارج نطاق سلسلة التدقيق.
   - تعتمد دالة `canonicalizeAuditValue` / `canonicalSerialize` في `server/core/audit.ts` على ترتيب المفاتيح المعجمي المتكرر المستند إلى المفهوم المعلوماتي في **RFC 8785 (JSON Canonicalization Scheme — JCS)** لكائنات أحداث التدقيق والـ Manifest، دون ادعاء اجتياز مجموعة اختبارات مطابقة IEEE/RFC 8785 الكاملة للأرقام العشرية المتطرفة.

3. **ما لم يُنفَّذ التزامًا بحدود العقد (`Deferred by Contract`):**
   - لم يُنفَّذ `PROPOSAL-03` (توسيع `OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256` ليشمل `server/api/router.ts` أو تقارير المراحل الأخرى).
   - لم يُنفَّذ `PROPOSAL-04` (تغيير ترتيب استعادة متغير البيئة `origHmacKey` قبل `db.importFullBackup(preSuiteFullBackup)` في كتلة `finally` داخل `server/test/p1-3-audit-chain-integrity-audit.ts`).

4. **ما بقي غير محسوم محليًا (`[UNKNOWN]`):**
   - **البصمة الأصلية (`SHA-256`) للملف المحذوف `public/assets/aistudio/Paste_October_29__2026_-_12_03PM_572057a9`:** `UNKNOWN — ORIGINAL BYTES OR TRUSTWORTHY RAW OUTPUT UNAVAILABLE` (واختبار `T-01`: `UNVERIFIED — ORIGINAL DIGEST CANNOT BE REVALIDATED`).
   - **حالة GitHub Actions CI البعيد:** `UNKNOWN` (`LOCAL CHANGE ONLY — REMOTE CI NOT VERIFIED`) لأن التغييرات المحلية لم تُدفع بعد إلى الفرع البعيد `main` (`9a5eae44e022ac1ac8c6513f31dd804aa79b8619`).

---
**`LOCAL CHANGE ONLY — NO COMMIT, PUSH OR DEPLOY`**
