# PHASE P.1.2 — Channel Secret Encryption & Backup/Restore Integrity (v2)
## Focused Security Remediation — No Infrastructure Migration

---

## 0. إقرار القدرة والنطاق (Mandatory Capability & Scope Disclosure)

قبل أي تحليل أو نتيجة، نُقر صراحةً بالحقائق البيئية التالية المُثبتة بأدلة أوامر حقيقية داخل جلسة التنفيذ الحالية:

1. **تنفيذ أوامر Shell الفعلية (`bash` / `npm` / `tsx` / `sha256sum` / `grep`)**: **نعم** — متاح ويعمل بشكل كامل ومباشر في بيئة Linux الحالية (`/app/applet`).
2. **تشغيل نسخة حية من السيرفر واستدعاء مساراته عبر HTTP (`fetch` / `curl`)**: **نعم** — متاح ويعمل فعليًا؛ تم تشغيل خادم Express الحي واستدعاء مسارات `PUT /api/v1/integrations/channels/:id/config` و`GET /api/v1/integrations/channels` و`POST /api/v1/integrations/channels/:id/test-connection` و`GET /api/v1/system/backup` و`POST /api/v1/system/restore` فعليًا خلال اختبارات القبول `AT-01` إلى `AT-16` واختبارات `test:audit` و`test:e2e`.
3. **وجود مستودع `.git` محلي في بيئة العمل**: **لا** (`UNABLE TO VERIFY LOCAL GIT HISTORY — ENVIRONMENT LIMITATION`).
   - دليل التنفيذ المباشر:
     ```text
     $ git status
     fatal: not a git repository (or any of the parent directories): .git
     ```
4. **معرفة مؤكدة بالـ Commit SHA المتزامن حاليًا على GitHub للمستودع البعيد**:
   - **على مستوى GitHub API البعيد**: نعم، الاتصال المباشر بـ `https://api.github.com/repos/ahmedsheta89-cell/Call-center/commits/main` متاح في هذه الجلسة وأعاد أن آخر commit منشور على الفرع `main` البعيد هو:
     `c19bcdc57280863a05c14e97e9454307e651bdae` (بتاريخ `2026-10-23T19:47:29Z`).
   - **على مستوى مزامنة تعديلات الجلسة الحالية (P.1 وP.1.2)**: **لا** (`UNABLE TO VERIFY — ENVIRONMENT LIMITATION`) — بيئة الحاوية لا تملك `.git` محلي ولا سجل مزامنة داخلي (`ls: cannot access '/.aistudio': No such file or directory` و`NO_MATCHING_ENV_VARS`)، والتعديلات المنفذة محليًا في هذه الجلسة لم تُرفع إلى GitHub بعد وتنتظر ضغطة المالك البشرية على زر **Sync / Push to GitHub** في واجهة AI Studio وفق البروتوكول الإلزامي في القسم 10.
5. **الالتزام الصارم بعدم توليد أي رابط GitHub ذاتيًا**: التزامًا بالقسم 10، **لا يحتوي هذا التقرير على أي رابط `https://github.com/...` مولَّد ذاتيًا**، وتُركت خانات روابط الـ Permalinks في جدول القسم 10 فارغة بانتظار المزامنة البشرية وتزويدنا بالـ Commit SHA الجديد.

---

## 1. ملخص تنفيذي وقائمة الملفات المعدلة والجديدة مع بصمات SHA-256 (قبل وبعد)

### 1.1 الملخص التنفيذي
أغلقت المرحلة **P.1.2** نقطتي القصور الأمني اللتين كشفهما تدقيق الإغلاق الجنائي في المرحلة P.1.1:
1. **إغلاق فجوة التخزين النصي الصريح للأسرار على القرص (`channelConfigs` Plain-Text-at-Rest)**:
   - تم بناء وحدة التشفير الموثق المستقلة `server/core/channelCrypto.ts` باستخدام خوارزمية **`AES-256-GCM`** حصريًا عبر مكتبة `node:crypto` القياسية بدون أي تبعيات خارجية.
   - قراءة مفتاح التشفير حصريًا من متغير البيئة `CHANNEL_SECRET_ENCRYPTION_KEY` بصيغة **64 حرفًا سداسيًا عشريًا صغيرًا (`^[0-9a-f]{64}$` = 32 بايت)** مع رفض صارم لأي مفتاح غائب أو بطول مختلف أو بترميز غير hex أو مكرر من خانة واحدة، ومنع أي مفتاح افتراضي أو مشتق عبر تجزئة نصية.
   - توليد متجه ابتدائـي عشوائي **`iv` بطول 12 بايت (96-bit)** لكل عملية تشفير ولكل حقل سر على حدة، مع وسم مصادقة **`authTag` بطول 16 بايت (128-bit)**.
   - ربط تشفيري إلزامي للسياق عبر **`AAD = "${organizationId}:${channelId}"`** بحيث يفشل فك التشفير فورًا (`AUTH_TAG_MISMATCH`) حتى مع امتلاك المفتاح الصحيح إذا نُقل بلوك السر المشفر إلى مؤسسة أخرى أو قناة أخرى.
   - ترحيل آمن وتلقائي للأسرار النصية القديمة عند `loadFromDisk()` مع تحقق فك تشفير تجريبي قبل استبدال ملف القرص، وحماية الملف الأصلي من الكتابة فوقه (`isDiskOverwriteProtected()`) في حال غياب المفتاح أو فشل الترحيل.
2. **إغلاق فجوة فقدان الأسرار أو استبدالها بـ `[REDACTED_SECRET]` عند الاستعادة (`POST /api/v1/system/restore`)**:
   - عند استعادة نسخة احتياطية منقحة تحتوي على `[REDACTED_SECRET]` أو نسخة حُذفت منها حقول الأسرار، يحتفظ النظام بالسر الحقيقي الموجود في الذاكرة **فقط لنفس زوج `(organizationId, channelId)`** دون أي استعارة أو نقل بين المؤسسات أو القنوات.
   - عند الاستعادة إلى بيئة جديدة لا تملك السر مسبقًا، تُستعاد الإعدادات غير السرية (`wabaId`, `phoneNumberId`, إلخ) بينما تبقى حقول الأسرار `undefined` وتُوسم القناة بوضوح بـ `credentialsConfigured: false`, `verified: false`, `status: 'unconfigured'` دون تخزين `[REDACTED_SECRET]` كسر فعلي.

### 1.2 جدول بصمات SHA-256 الكاملة (64 حرفًا) للملفات قبل وبعد التعديل

| المسار الكامل للملف | الحالة | عدد الأسطر النهائي | SHA-256 قبل التعديل (Baseline) | SHA-256 بعد التعديل (Post-P.1.2) |
|---|---|---|---|---|
| `server/core/channelCrypto.ts` | جديد (Created) | 384 | `N/A (New File)` | `7e9def397f3f3028645fbe5bd1a7abb6098ca561fc113af8e0915b538cfea81f` |
| `server/core/audit.ts` | معدّل (Modified) | 181 | `21f0c06f4ca2a5fe4f2574d66675e1f24d6a946713db7da5acc2e69325e206c0` | `65f07b4f8a7951d4c2caf11dfd93b5122b07b417c75fb41bb01632218dc66eb9` |
| `server/db/store.ts` | معدّل (Modified) | 1659 | `67e437d896cba848bbd34ac1d5ade11d6d4a229a8356cbd2b2fd8db4bbdfeb65` | `9b95f6900a14b9dd16fa9e08e5db35de01331db68f54564c535c4ead4dcb4496` |
| `server/api/router.ts` | معدّل (Modified) | 5054 | `0aa735c2727080bcbe0a9370df4acd5a339117d93ee3222dbb8050887884059e` | `9e589c9691ae011526b89616b86f780e77a6e290a82b1c94d8b4f2628d4dd379` |
| `server/db/seed.ts` | معدّل (Modified) | 1066 | `f010e777d70b5c080ef60bf78709bd3b8685c488f5df4fb04d862fb4059c0b10` | `5f9f028eafda27b887e23823b29865e0d4bfb380c749167868f708a0c2c635f4` |
| `server.ts` | معدّل (Modified) | 200 | `4c99e307b44650fb7380876ae60b706d07bf2b0bd60dc0e52f1c05f18cdca074` | `e8ae649078285f7b521cfb7d281a0cfb85f0315845f37c0264b0d457270fafa1` |
| `.env.example` | معدّل (Modified) | 24 | `2113b5a44907ce10585b561e7c655e84cb389ef15db748ad0161413b1cc34b96` | `6686a398088e480792a9955c26c565654a248dd7d40c08004737f2fe6f324371` |
| `server/test/p1-2-channel-secret-encryption-audit.ts` | جديد (Created) | 1245 | `N/A (New File)` | `385d0ba45dfa47c48efc7ed74fd1fabd43a8e83c4985ed290735b7ef333878e6` |
| `server/test/run-enterprise-audit.ts` | معدّل (Modified) | 2233 | `e8274f995055aff615e1867968ea08224e05917c5389d7be6e23d6ce792e9ff6` | `580c08a12a91880d3cc4d069f0191b696275e6d509364d3e133694c197981a03` |

### 1.3 ضمان عزل الاختبارات ونظافة البيانات بعد التنفيذ
- استخدمت جميع اختبارات القبول (`AT-01` إلى `AT-16`) معرف المؤسسة الاصطناعي المعزول حصريًا:
  - `org-p1-2-encryption-audit-temp`
  - و`org-p1-2-encryption-audit-temp-peer` (فقط لاختباري منع النقل العابر للمؤسسات `AT-09` و`AT-15`).
- لم يتم استخدام `org-madar-001` أو `org-madar-enterprise-001` أو `org-p1-1-forensic-audit-temp` في أي اختبار من اختبارات P.1.2.
- ينفذ كل اختبار (`AT-01`..`AT-16`) دالة `cleanupAndVerifyIsolation()` التي تحذف جميع سجلات المؤسسة الاصطناعية ثم تتحقق بقراءة لاحقة (`Read-After-Delete = true`) من أن `db.getAllChannelConfigsForOrg('org-p1-2-encryption-audit-temp').length === 0`.

---

## 2. جدول الجرد الكامل لحقول الأسرار (`Full Secret Field Inventory`) وتوحيد القواعد

### 2.1 التباين السابق الذي تم اكتشافه وإغلاقه بين `audit.ts` و`store.ts`
قبل المرحلة P.1.2 كان هناك تباين بين نمطي التعرف على الحقول الحساسة:
- في `server/core/audit.ts` (السطر 25 سابقًا):
  `/password|secret|token|apiKey|api_key|authorization|creditCard|cvv|privateKey/i`
  *(كان يفتقد `private_key` و`passphrase` و`credential`)*.
- في `server/db/store.ts` (السطر 267 سابقًا):
  `/(apiToken|webhookSecret|authSecret|password|secret|token|apiKey|api_key|privateKey|authorization)\s*[:=]\s*([^\s,;]+)/gi`
  *(كان يفتقد `accessToken`, `refreshToken`, `verifyToken`, `appSecret`, `clientSecret`, `sipPassword`, `smtpPassword`, `imapPassword`, `private_key`, `passphrase`, `credential`, `CHANNEL_SECRET_ENCRYPTION_KEY`)*.

في المرحلة P.1.2 تم توحيد الجرد الكامل في `server/core/channelCrypto.ts` (`EXPLICIT_CHANNEL_SECRET_FIELDS` + `CHANNEL_SECRET_KEY_REGEX` + `isChannelSecretField`) واستيراده مباشرةً في كل من `server/core/audit.ts` و`server/db/store.ts`، مع استثناء صريح للحقل المنطقي غير السري `credentialsConfigured` (`boolean`) حتى لا يُحجب بالخطأ كسلسلة نصية.

### 2.2 جدول الجرد الشامل لـ 21 حقل سر (`EXPLICIT_CHANNEL_SECRET_FIELDS`)

| # | اسم الحقل (`Field Name`) | القناة / السياق التشغيلي | أماكن الظهور في الكود | مشفر على القرص (`AES-256-GCM`)؟ | محجوب في HTTP والنسخ الاحتياطية والسجلات (`[REDACTED_SECRET]`)؟ | دليل التحقق العملي |
|---|---|---|---|---|---|---|
| 1 | `apiToken` | WhatsApp Cloud API / Telegram Bot API / Social Gateways | `server/api/router.ts:3234`, `server/db/seed.ts:660`, `server/core/channelCrypto.ts:29` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-01`, `AT-02`, `AT-07`, `AT-16` |
| 2 | `webhookSecret` | WhatsApp / Meta / Webhook HMAC Verification | `server/api/router.ts:3235`, `server/db/seed.ts:661`, `server/core/channelCrypto.ts:30` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-01`, `AT-02`, `AT-07`, `AT-16` |
| 3 | `authSecret` | Voice / WebRTC / SIP Trunk Gateway | `server/api/router.ts:3258`, `server/db/seed.ts:678`, `server/core/channelCrypto.ts:31` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-09`, `AT-16` |
| 4 | `accessToken` | Meta Graph API / Instagram / Messenger OAuth | `server/core/channelCrypto.ts:32`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 5 | `refreshToken` | OAuth2 Token Rotation (Google / Meta / External) | `server/core/channelCrypto.ts:33`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 6 | `verifyToken` | Meta Webhook Challenge Verification Token | `server/core/channelCrypto.ts:34`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 7 | `appSecret` | Meta / Facebook App Secret Proof | `server/core/channelCrypto.ts:35`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 8 | `clientSecret` | OAuth2 Client Secret | `server/core/channelCrypto.ts:36`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 9 | `sipPassword` | SIP Trunk / PBX Authentication Password | `server/core/channelCrypto.ts:37`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 10 | `smtpPassword` | Outbound Email (SMTP) Relay Password | `server/core/channelCrypto.ts:38`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 11 | `imapPassword` | Inbound Email (IMAP) Polling Password | `server/core/channelCrypto.ts:39`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 12 | `apiKey` | Generic Provider API Key (camelCase) | `server/core/channelCrypto.ts:40`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 13 | `api_key` | Generic Provider API Key (snake_case) | `server/core/channelCrypto.ts:41`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 14 | `privateKey` | TLS / JWT / Service Account Private Key (camelCase) | `server/core/channelCrypto.ts:42`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 15 | `private_key` | TLS / JWT / Service Account Private Key (snake_case) | `server/core/channelCrypto.ts:43`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 16 | `passphrase` | Encrypted Key / Certificate Passphrase | `server/core/channelCrypto.ts:44`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 17 | `credential` | Generic Provider Credential String | `server/core/channelCrypto.ts:45`, `server/db/store.ts:279` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 18 | `authorization` | Custom Webhook / Bearer Authorization Secret | `server/core/channelCrypto.ts:46`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 19 | `password` | Generic Channel Account Password | `server/core/channelCrypto.ts:47`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 20 | `secret` | Generic Shared Secret | `server/core/channelCrypto.ts:48`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |
| 21 | `token` | Generic Bearer / Bot Token | `server/core/channelCrypto.ts:49`, `server/core/audit.ts:26` | نعم (`__encrypted: true`) | نعم (`[REDACTED_SECRET]`) | `AT-16` |

---

## 3. تصميم التشفير وبنية البيانات المشفرة على القرص (`Encryption-at-Rest Design`)

### 3.1 الخوارزمية ومواصفات المفتاح
- **الخوارزمية**: `aes-256-gcm` عبر `crypto.createCipheriv` و`crypto.createDecipheriv` في `server/core/channelCrypto.ts` (الأسطر 152–245).
- **مصدر المفتاح**: متغير البيئة `CHANNEL_SECRET_ENCRYPTION_KEY` فقط.
- **التحقق الصارم من المفتاح (`validateChannelEncryptionKey` — الأسطر 90–137)**:
  - إذا كان غائبًا أو فارغًا -> `CHANNEL_SECRET_KEY_MISSING`.
  - إذا كان طوله لا يساوي 64 حرفًا بالضبط -> `INVALID_KEY_LENGTH`.
  - إذا لم يطابق التعبير النمطي `^[0-9a-f]{64}$` (مثلاً أحرف كبيرة أو رموز غير سداسية عشرية أو مفتاح مكرر من نفس الخانة مثل `0000...`) -> `INVALID_KEY_ENCODING`.
  - يحول المفتاح المتحقق منه عبر `Buffer.from(trimmed, 'hex')` إلى `Buffer` بطول 32 بايت (256-bit) بالضبط، دون استخدام `crypto.createHash` على الإطلاق.

### 3.2 بنية الغلاف المشفر الثابتة (`EncryptedSecretEnvelope`)
عند حفظ أي سجل في `channelConfigs` على القرص عبر `buildEncryptedDiskSnapshot()` في `server/db/store.ts` (الأسطر 981–1028)، يُستبدل كل حقل سر نصي بالغلاف المهيكل التالي:
```json
{
  "__encrypted": true,
  "version": 1,
  "iv": "<base64-encoded 12-byte random nonce>",
  "authTag": "<base64-encoded 16-byte GCM authentication tag>",
  "ciphertext": "<base64-encoded ciphertext>"
}
```

### 3.3 ربط السياق الإضافي الموثق (`AAD = "${organizationId}:${channelId}"`)
- تُبنى سلسلة `AAD` عبر `buildChannelSecretAAD(organizationId, channelId)` (`server/core/channelCrypto.ts:142-150`) بصيغة:
  ```text
  <organizationId>:<channelId>
  ```
- تُمرر هذه السلسلة إلى `cipher.setAAD(aadBuffer)` أثناء التشفير وإلى `decipher.setAuthTag(authTag); decipher.setAAD(aadBuffer)` أثناء فك التشفير.
- **النتيجة الأمنية**: إذا قام مهاجم يملك صلاحية الوصول إلى ملف القرص بنسخ الكائن المشفر (`{ __encrypted: true, ... }`) من مؤسسة `org-A` إلى مؤسسة `org-B` أو من قناة `chan-whatsapp` إلى `chan-voice`، يفشل `decipher.final()` فورًا ويرمي خطأ `ChannelSecretCryptoError('AUTH_TAG_MISMATCH')` حتى مع استخدام نفس مفتاح `CHANNEL_SECRET_ENCRYPTION_KEY` الصالح.

---

## 4. منطق ترحيل الأسرار القديمة (`Legacy Plain-Text Secret Migration`)

عند استدعاء `db.loadFromDisk()` (`server/db/store.ts:1066-1161`):
1. يفحص النظام سجلات `channelConfigs` المحملة من ملف القرص عبر `inspectAndPrepareChannelConfigsFromDisk()` (الأسطر 890–979).
2. **إذا وُجدت أسرار نصية قديمة غير مشفرة (`hasLegacyPlaintextSecrets === true`)**:
   - يتحقق النظام أولاً من صلاحية `CHANNEL_SECRET_ENCRYPTION_KEY`.
   - **في حال غياب المفتاح أو عدم صلاحيته**:
     - يرفض تحميل الأسرار النصية إلى الذاكرة (`loadFromDisk()` يعيد `false`).
     - يفعل علامة الحماية `this.existingFileProtected = true` (`db.isDiskOverwriteProtected() === true`) حتى يُمنع `initializeSeedData()` أو `saveToDisk()` من الكتابة فوق الملف الأصلي أو إتلافه.
     - يسجل خطأ تشخيصيًا واضحًا بدون كشف السر:
       `Legacy plain-text channel secrets detected in persistence file, but migration cannot proceed: ... Recovery: configure a valid 64-character lowercase hex CHANNEL_SECRET_ENCRYPTION_KEY and reload.`
   - **في حال وجود مفتاح صالح**:
     - يشفر جميع الحقول السرية بـ `AES-256-GCM` مع `AAD = "${organizationId}:${channelId}"`.
     - ينفذ فك تشفير تجريبي (`verifyTrialDecryption`) لكل حقل مشفر للتأكد من تطابقه 100% مع القيمة الأصلية قبل لمس ملف القرص.
     - يكتب النسخة المشفرة ذريًا عبر ملف مؤقت (`db_state.json.tmp.<pid>.<ts>`) ثم `fs.renameSync` إلى الملف النهائي.
     - إذا فشل فك التشفير التجريبي أو فشلت الكتابة الذرية على القرص، يتراجع فورًا عن حالة الذاكرة إلى النسخة الاحتياطية السابقة ويبقي الملف الأصلي على القرص دون أي تعديل (`existingFileProtected = true`).

---

## 5. منطق النسخ الاحتياطي والاستعادة الآمنة (`Backup & Restore Integrity`)

1. **تصدير النسخ الاحتياطية (`exportFullBackup` / `exportTenantBackup` / `GET /api/v1/system/backup`)**:
   - يمرر جميع سجلات `channelConfigs` عبر `redactSensitiveValue()`، فتخرج جميع الحقول السرية الـ 21 (سواء كانت نصية في الذاكرة أو مظروفًا مشفرًا) بقيمة `"[REDACTED_SECRET]"`، بينما يبقى الحقل المنطقي `credentialsConfigured` بقيمته الحقيقية (`true` / `false`).
2. **استعادة النسخ الاحتياطية (`importFullBackupDetailed` / `POST /api/v1/system/restore` — `server/db/store.ts:1199-1420`)**:
   - قبل بدء الاستعادة، يأخذ النظام لقطة عميقة (`previousSnapshot`) لكامل خرائط الذاكرة وسلسلة التدقيق، ويحتفظ بخريطة الأسرار الحالية مفهرسة حصريًا بالمفتاح المركب `${organizationId}::${channelId}`.
   - لكل قناة واردة في النسخة الاحتياطية:
     - إذا كانت قيمة حقل السر الواردة تساوي `"[REDACTED_SECRET]"` أو `undefined` أو `""` أو حُذف الحقل من النسخة الاحتياطية:
       - يبحث النظام في خريطة الأسرار السابقة **فقط للمفتاح المطابق تمامًا `${organizationId}::${channelId}`** (ممنوع تمامًا البحث عبر مؤسسة أخرى أو قناة أخرى).
       - **إذا وُجد سر سابق لنفس المؤسسة ونفس القناة**: يحتفظ بالسر الحقيقي في الذاكرة ويحدث الإعدادات غير السرية (`wabaId`, `phoneNumberId`, إلخ) ويعيد تشفير السر بـ `AES-256-GCM` عند الحفظ على القرص.
       - **إذا لم يوجد سر سابق لنفس المؤسسة ونفس القناة (بيئة جديدة)**: لا يخزن `"[REDACTED_SECRET]"` أبدًا، بل يترك حقل السر `undefined` ويضبط `credentialsConfigured: false` و`verified: false` ويضيف القناة إلى قائمة `unconfiguredChannels` التي تعيدها استجابة `POST /api/v1/system/restore` وتظهر حالتها في `GET /api/v1/integrations/channels` كـ `"unconfigured"`.

---

## 6. توثيق إدارة المفتاح والتدوير (`Key Management & Operational Runbook`)

1. **توليد مفتاح جديد صالح (32 بايت = 64 حرفًا سداسيًا عشريًا صغيرًا)**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   أو عبر OpenSSL:
   ```bash
   openssl rand -hex 32
   ```
2. **أين يُخزن المفتاح في كل بيئة؟**
   - **التطوير المحلي (`Local Dev`)**: في ملف `.env` المحلي (غير المتتبع في Git) تحت المتغير `CHANNEL_SECRET_ENCRYPTION_KEY=<64-hex-chars>`.
   - **بيئة CI (`GitHub Actions`)**: في GitHub Actions Encrypted Secrets (`Settings -> Secrets and variables -> Actions -> CHANNEL_SECRET_ENCRYPTION_KEY`).
   - **بيئة الإنتاج (`Production`)**: في مدير أسرار السحابة (Google Cloud Secret Manager أو متغيرات بيئة الخدمة المحمية في Cloud Run / Kubernetes Secret) محقونًا كمتغير بيئة وقت التشغيل `CHANNEL_SECRET_ENCRYPTION_KEY`.
3. **إجراء تدوير المفتاح (`Key Rotation Procedure`)**:
   - نظرًا لأن المرحلة P.1.2 تستخدم `"version": 1` بمفتاح خارجي واحد:
     1. أثناء تشغيل الخدمة بالمفتاح القديم `KEY_OLD` (حيث تكون الأسرار مفكوكة التشفير في الذاكرة بعد `loadFromDisk()`)، يتم تحديث `process.env.CHANNEL_SECRET_ENCRYPTION_KEY = KEY_NEW` (أو عبر مهمة صيانة تستدعي `loadFromDisk()` بـ `KEY_OLD` ثم تحدث متغير البيئة إلى `KEY_NEW` وتستدعي `db.saveToDisk()`).
     2. يقوم `saveToDisk()` بإعادة تشفير جميع حقول الأسرار في الذاكرة باستخدام `KEY_NEW` وNonce عشوائي جديد (`iv` 12 بايت) ويكتب الملف ذريًا.
4. **ماذا يحدث عند ضياع المفتاح؟ (`Lost Key Recovery`)**:
   - نظرًا لاستخدام تشفير قياسي موثق `AES-256-GCM` بدون أي أبواب خلفية أو مفاتيح احتياطية مدمجة، فإن ضياع `CHANNEL_SECRET_ENCRYPTION_KEY` يعني **استحالة فك تشفير** حقول الأسرار المشفرة على القرص (`AUTH_TAG_MISMATCH`).
   - إجراء التعافي التشغيلي: استعادة نسخة احتياطية (`POST /api/v1/system/restore`) مع مفتاح جديد صالح؛ ستُستعاد جميع بيانات التذاكر والعملاء وسجل التدقيق والإعدادات غير السرية للقنوات، بينما تُوسم القنوات بـ `status: "unconfigured"` (`credentialsConfigured: false`) ليقوم مسؤول المؤسسة بإعادة إدخال رموز API من لوحة تحكم المزود (Meta / Telegram / SIP).

---

## 7. جدول نتائج اختبارات القبول (`AT-01` إلى `AT-16`)

تم تنفيذ جميع الاختبارات الـ 16 فعليًا عبر `npx tsx server/test/p1-2-channel-secret-encryption-audit.ts` وعبر `npm run test:audit` باستخدام المؤسسة المعزولة `org-p1-2-encryption-audit-temp`:

| رمز الاختبار | المتطلب المختبر | النتيجة | التحقق من الحذف (`Read-After-Delete`) | خلاصة الدليل الفعلي |
|---|---|---|---|---|
| **AT-01** | حفظ سر اصطناعي وفحص ملف القرص للتأكد من غياب النص الصريح ووجود بنية `AES-256-GCM` | **PASS** | `true` | `grep` للنص الصريح على القرص = `""` (0 تطابق)؛ الغلاف يحتوي `__encrypted: true, version: 1, iv (12B), authTag (16B), ciphertext` |
| **AT-02** | إعادة تحميل الملف المشفر بمفتاح صالح واستعادة السر الصحيح داخل الذاكرة | **PASS** | `true` | `loadFromDisk() === true`؛ تطابق `apiToken` و`webhookSecret` في الذاكرة 100% مع القيمة الاصطناعية |
| **AT-03** | اكتشاف تعديل النص المشفر (`ciphertext`) أو وسم التحقق (`authTag`) ورفض فك التشفير | **PASS** | `true` | قلب بايت في `ciphertext` أو `authTag` -> `loadFromDisk() === false` مع `code: "AUTH_TAG_MISMATCH"` وبقاء الذاكرة دون تلوث |
| **AT-04** | رفض مفتاح غائب أو ذي طول غير صالح أو ذي ترميز غير hex صالح دون الكتابة فوق البيانات القديمة | **PASS** | `true` | غائب -> `503 CHANNEL_SECRET_KEY_MISSING`؛ طول 32 -> `503 INVALID_KEY_LENGTH`؛ غير hex/أحرف كبيرة -> `503 INVALID_KEY_ENCODING`؛ بصمة ملف القرص `SHA-256` لم تتغير |
| **AT-05** | ترحيل بيانات قديمة غير مشفرة إلى بيانات مشفرة تلقائيًا مع التحقق من فك تشفيرها | **PASS** | `true` | `loadFromDisk()` رحّل النص الصريح إلى `AES-256-GCM` على القرص (`grep=""`) مع نجاح فك التشفير التجريبي والاحتفاظ بالقيم في الذاكرة |
| **AT-06** | فشل الترحيل لا يغير الملف الأصلي ولا يسمح بتحميل الأسرار أو استبدال الملف بالبذور | **PASS** | `true` | بدون مفتاح: `loadFromDisk() === false`؛ `isDiskOverwriteProtected() === true`؛ منع `saveToDisk()` (`DISK_OVERWRITE_BLOCKED_UNMIGRATED_FILE`)؛ تطابق `SHA-256` للملف قبل وبعد (`3e9d8354...`) |
| **AT-07** | استعادة نسخة HTTP منقحة لا تستبدل السر الحالي بـ `[REDACTED_SECRET]` | **PASS** | `true` | `GET /system/backup` أعاد `[REDACTED_SECRET]`؛ بعد `POST /system/restore` تم تحديث `wabaId` مع بقاء السر الحقيقي في الذاكرة ومشفرًا على القرص |
| **AT-08** | حذف حقل السر من نسخة اختبارية واستعادتها لا يمسح السر الموجود لنفس المؤسسة والقناة | **PASS** | `true` | حذف `apiToken` و`webhookSecret` من JSON النسخة الاحتياطية ثم استعادتها أبقى السرين الحقيقيين في الذاكرة وعلى القرص |
| **AT-09** | عدم نقل الأسرار بين مؤسستين أو قناتين عند الاستعادة | **PASS** | `true` | استعادة `chan-voice` منقحة لم تستعر سر `chan-whatsapp` أو سر مؤسسة أخرى (`authSecret === undefined`, `credentialsConfigured === false`)؛ استعادة عبر مؤسسة أخرى رُفضت بـ `HTTP 403` |
| **AT-10** | استعادة نسخة منقحة إلى بيئة لا تحتوي السر تترك القناة غير مضبوطة بوضوح دون إنشاء سر وهمي | **PASS** | `true` | استعادة الإعدادات غير السرية مع `apiToken === undefined`, `credentialsConfigured: false`, `verified: false`, `status: "unconfigured"`, `unconfiguredChannels: ["chan-whatsapp"]` |
| **AT-11** | فشل الكتابة أو الاستعادة الذرية يحافظ على حالة الذاكرة والملف السابقين | **PASS** | `true` | مسار غير قابل للكتابة `/proc/...` -> `HTTP 500 DISK_PERSISTENCE_WRITE_FAILED`؛ تراجع الذاكرة إلى القيم الأصلية وبقاء `SHA-256` لملف القرص السابق دون تغيير |
| **AT-12** | النسخ الاحتياطية وواجهات API والسجلات ورسائل أخطاء التشفير لا تكشف الأسرار أو المفتاح | **PASS** | `true` | 0 ظهور للسر أو مفتاح الـ 64-hex أو المفتاح الخاطئ أو النص المشفر في استجابات `PUT/GET/POST` والنسخ الاحتياطية وسجلات التدقيق ورسائل الأخطاء |
| **AT-13** | استعادة نسخة كاملة تحافظ على سلامة سجل التدقيق (`SHA-256 Hash Chain`) والبيانات غير السرية | **PASS** | `true` | `POST /system/restore` -> `HTTP 200`؛ `AuditLogger.verifyChainIntegrity().valid === true`؛ استعادة الماكرو والإعدادات غير السرية مع الحفاظ على السر |
| **AT-14** | تشغيل الاختبارات المرجعية الحالية (`P1-01` إلى `P1-09`) وعدم تراجعها | **PASS** | `true` | نجحت جميع اختبارات `P1-01`..`P1-09` في `npm run test:audit` مع تفعيل تشفير `AES-256-GCM` |
| **AT-15** | تحقق AAD التشفيري: رفض فك تشفير بلوك سر منقول إلى مؤسسة أخرى أو قناة أخرى بنفس المفتاح الصحيح | **PASS** | `true` | نفس المفتاح الصالح مع تغيير القناة إلى `chan-voice` -> `AUTH_TAG_MISMATCH`؛ تغيير المؤسسة -> `AUTH_TAG_MISMATCH`؛ تبديل JSON على القرص -> `loadFromDisk() === false` |
| **AT-16** | تأكيد تشفير وحجب جميع حقول الجرد الكامل للأسرار (21 حقلاً) على القرص وفي استجابات HTTP | **PASS** | `true` | جميع الحقول الـ 21 شُفرت بـ `AES-256-GCM` على القرص (`grep=""`) وفُك تشفيرها 100% عند `loadFromDisk()` وحُجبت بـ `[REDACTED_SECRET]` في HTTP والنسخ الاحتياطية |

---

## 8. نتائج أوامر التحقق الشاملة (`Verification Commands Summary`)

| الأمر المنفذ | كود الخروج (`Exit Code`) | النتيجة التفصيلية |
|---|---|---|
| `npx tsx server/test/p1-2-channel-secret-encryption-audit.ts` | `0` | **16 / 16 PASSED** (`AT-01` إلى `AT-16` جميعها ناجحة مع `Read-After-Delete = true`) |
| `npm run lint` (`tsc --noEmit`) | `0` | **0 TypeScript Errors** |
| `npm run build` (`vite build && esbuild server.ts ...`) | `0` | **Build Succeeded** (`dist/server.cjs` 432.1 kB + PWA bundle) |
| `npm run test:firestore` | `0` | **39 / 39 Real JVM Firestore Emulator Tests Passed** (`29/29 Attacks PERMISSION_DENIED`, `10/10 Authorized Flows ALLOWED`) |
| `npm run test:audit` | `0` | **ALL PASSED** (`P1-01`..`P1-09` + `AT-01`..`AT-16` + `22/22 Live Modules` + `150-Request Multi-Tenant Burst: 0/150 Bleed`) |
| `npm run test:e2e` | `0` | **TOTAL TESTS: 37 \| PASSED: 37 \| FAILED: 0** |

---

## 9. ملخص المخاطر المتبقية والقيود البيئية الصريحة

1. **محدودية المزامنة التلقائية مع GitHub من داخل الحاوية**:
   - كما هو موثق في القسم 0 والقسم 10، لا تملك بيئة الحاوية `.git` محلي، وبالتالي فإن الملفات المعدلة والجديدة موجودة ومُثبتة ببصمات `SHA-256` محليًا في مساحة العمل، وتحتاج إلى ضغطة المالك البشرية على زر **Sync / Push to GitHub** في أعلى واجهة AI Studio لنقلها إلى المستودع البعيد.
2. **تدوير المفاتيح متعدد الإصدارات (`Multi-Version Key Ring`)**:
   - يدعم الغلاف المشفر حاليًا حقل `"version": 1` المرتبط بمتغير `CHANNEL_SECRET_ENCRYPTION_KEY`. في حال الحاجة مستقبلاً إلى تدوير تدريجي بدون إعادة تشفير فورية، يمكن في مراحل البنية التحتية اللاحقة إضافة دعم `CHANNEL_SECRET_ENCRYPTION_KEY_PREVIOUS` لفك تشفير `version: 1` وإعادة تشفيره بـ `version: 2`.

---

## 10. بروتوكول الروابط المباشرة بعد المزامنة البشرية (Post-Sync Direct Link Protocol — Owner-Verified Permalinks)

التزامًا صارمًا بضوابط القسم 10:
- **لم يتم توليد أو تخمين أي رابط `https://github.com/...` داخل هذا التقرير**.
- جميع الملفات المذكورة أدناه جاهزة للمزامنة عبر زر **Sync / Push to GitHub** في واجهة AI Studio.

### جدول الملفات الجاهزة للمزامنة (بانتظار Commit SHA الجديد بعد ضغطة Sync البشرية)

| الملف | الأسطر الرئيسية | SHA-256 المحلي (64 حرفًا) | رابط GitHub الدائم (يُملأ بعد تزويدنا بـ Commit SHA الجديد) |
|---|---|---|---|
| `server/core/channelCrypto.ts` | `L1-L384` | `7e9def397f3f3028645fbe5bd1a7abb6098ca561fc113af8e0915b538cfea81f` | `PENDING_OWNER_SYNC_SHA` |
| `server/core/audit.ts` | `L1-L52` | `65f07b4f8a7951d4c2caf11dfd93b5122b07b417c75fb41bb01632218dc66eb9` | `PENDING_OWNER_SYNC_SHA` |
| `server/db/store.ts` | `L265-L287`, `L890-L1435` | `9b95f6900a14b9dd16fa9e08e5db35de01331db68f54564c535c4ead4dcb4496` | `PENDING_OWNER_SYNC_SHA` |
| `server/api/router.ts` | `L3185-L3420`, `L4955-L5050` | `9e589c9691ae011526b89616b86f780e77a6e290a82b1c94d8b4f2628d4dd379` | `PENDING_OWNER_SYNC_SHA` |
| `server/db/seed.ts` | `L650-L710` | `5f9f028eafda27b887e23823b29865e0d4bfb380c749167868f708a0c2c635f4` | `PENDING_OWNER_SYNC_SHA` |
| `server.ts` | `L40-L60` | `e8ae649078285f7b521cfb7d281a0cfb85f0315845f37c0264b0d457270fafa1` | `PENDING_OWNER_SYNC_SHA` |
| `.env.example` | `L1-L24` | `6686a398088e480792a9955c26c565654a248dd7d40c08004737f2fe6f324371` | `PENDING_OWNER_SYNC_SHA` |
| `server/test/p1-2-channel-secret-encryption-audit.ts` | `L1-L1245` | `385d0ba45dfa47c48efc7ed74fd1fabd43a8e83c4985ed290735b7ef333878e6` | `PENDING_OWNER_SYNC_SHA` |
| `server/test/run-enterprise-audit.ts` | `L33-L55`, `L1585-L1608` | `580c08a12a91880d3cc4d069f0191b696275e6d509364d3e133694c197981a03` | `PENDING_OWNER_SYNC_SHA` |
| `docs/roadmap/OMNIFLOW_PHASE_P1_2_SECRET_STORAGE_REMEDIATION.md` | `L1-L360` | *(يُحسب فور كتابة هذا الملف)* | `PENDING_OWNER_SYNC_SHA` |

---

## ملحق الأدلة الخام (`Raw Evidence Appendix`)

### A.1 المخرج الخام لاختبار `AT-01` و`AT-02` (الحفظ المشفر، فحص `grep` على القرص، وفك التشفير عند التحميل)
```text
=== [RAW AT-01] PUT Response === {
  "success": true,
  "data": {
    "wabaId": "WABA-P12-AT01",
    "phoneNumberId": "PNID-P12-AT01",
    "apiToken": "[REDACTED_SECRET]",
    "webhookSecret": "[REDACTED_SECRET]",
    "credentialsConfigured": true,
    "verified": true,
    "lastCheckedAt": "2026-10-26T17:59:57.529Z"
  },
  "message": "تم حفظ إعدادات القناة والاعتمادات بنجاح"
}
=== [RAW AT-01] grep plaintext on disk (must be empty) === ""
=== [RAW AT-01] Disk channelConfigs record === {
  "id": "org-p1-2-encryption-audit-temp::chan-whatsapp",
  "organizationId": "org-p1-2-encryption-audit-temp",
  "channelId": "chan-whatsapp",
  "config": {
    "wabaId": "WABA-P12-AT01",
    "phoneNumberId": "PNID-P12-AT01",
    "apiToken": {
      "__encrypted": true,
      "version": 1,
      "iv": "Mlq/7IwxKqRRzcer",
      "authTag": "/PudrhpuV/ym276dmfsF7g==",
      "ciphertext": "iz05GHGHomNWM0IXbdH3ahQ1HjXC0z6V5OdqQYg="
    },
    "webhookSecret": {
      "__encrypted": true,
      "version": 1,
      "iv": "xRK/t5wLH6GnxtiD",
      "authTag": "+uS2jwjKqpBlPidHO9Cuhg==",
      "ciphertext": "dLL2He3SZ568Khcn7QkwEdAXWUuCMGlG9PniJujjXA=="
    },
    "credentialsConfigured": true,
    "verified": true,
    "lastCheckedAt": "2026-10-26T17:59:57.529Z"
  },
  "updatedAt": "2026-10-26T17:59:57.529Z"
}
=== [RAW AT-02] Decrypted in-memory config after loadFromDisk() === {
  "wabaId": "WABA-P12-AT01",
  "phoneNumberId": "PNID-P12-AT01",
  "apiToken": "SYNTH-P12-AT01-TOKEN-99887766",
  "webhookSecret": "SYNTH-P12-AT01-WEBHOOK-11223344",
  "credentialsConfigured": true,
  "verified": true,
  "lastCheckedAt": "2026-10-26T17:59:57.529Z"
}
```

### A.2 المخرج الخام لاختبار `AT-05` و`AT-06` (ترحيل النص الصريح القديم وحماية الملف عند غياب المفتاح)
```text
=== [RAW AT-05] Migrated Disk Record === {
  "id": "org-p1-2-encryption-audit-temp::chan-whatsapp",
  "organizationId": "org-p1-2-encryption-audit-temp",
  "channelId": "chan-whatsapp",
  "config": {
    "wabaId": "WABA-LEGACY-AT05",
    "phoneNumberId": "PNID-LEGACY-AT05",
    "apiToken": {
      "__encrypted": true,
      "version": 1,
      "iv": "W1nGJKSJGEm3p/kt",
      "authTag": "a8O0e4PpGBvgcQF1cKtfGw==",
      "ciphertext": "2DrZvTskL7+XGEpVFwgS9Qme5+rXr1w6OPo37+JPNQjm"
    },
    "webhookSecret": {
      "__encrypted": true,
      "version": 1,
      "iv": "rEnv2lwkPzdPy/6l",
      "authTag": "jN00caakQtC64+T34sQwUg==",
      "ciphertext": "oXmg2PZu+CN7Q37zmWF7oqRSPv50Btz5KToubF7WY0A7UkQ="
    },
    "verified": true,
    "credentialsConfigured": true
  },
  "updatedAt": "2026-10-26T17:59:57.616Z"
}
=== [RAW AT-05] grep plaintext after migration === ""
=== [RAW AT-06] Failed Migration Diagnostics === {
  "at06LoadDiag": {
    "operation": "loadFromDisk",
    "code": "CHANNEL_SECRET_KEY_MISSING",
    "message": "Legacy plain-text channel secrets detected in persistence file, but migration cannot proceed: CHANNEL_SECRET_ENCRYPTION_KEY is missing or empty. Configure a 64-character lowercase hex key (32 bytes). Recovery: configure a valid 64-character lowercase hex CHANNEL_SECRET_ENCRYPTION_KEY and reload.",
    "timestamp": "2026-10-26T17:59:57.649Z"
  },
  "at06IsProtected": true,
  "at06SaveProtectedDiag": {
    "operation": "saveToDisk",
    "code": "DISK_OVERWRITE_BLOCKED_UNMIGRATED_FILE",
    "message": "Refusing to overwrite existing persistence file because a previous load or secret migration failed. Fix CHANNEL_SECRET_ENCRYPTION_KEY or file integrity first.",
    "timestamp": "2026-10-26T17:59:57.649Z"
  },
  "hashBefore": "3e9d83540e6c5b91388337f782de9a93ed11778425924b6970cb44526641bf09",
  "hashAfter": "3e9d83540e6c5b91388337f782de9a93ed11778425924b6970cb44526641bf09"
}
```

### A.3 المخرج الخام لاختبار `AT-07` و`AT-08` و`AT-10` (النسخ الاحتياطي والاستعادة الآمنة)
```text
=== [RAW AT-07] Backup channelConfig (redacted) === {
  "id": "org-p1-2-encryption-audit-temp::chan-whatsapp",
  "organizationId": "org-p1-2-encryption-audit-temp",
  "channelId": "chan-whatsapp",
  "config": {
    "wabaId": "WABA-AT07-RESTORED",
    "phoneNumberId": "PNID-AT07-ORIG",
    "apiToken": "[REDACTED_SECRET]",
    "webhookSecret": "[REDACTED_SECRET]",
    "credentialsConfigured": true,
    "verified": true,
    "lastCheckedAt": "2026-10-26T17:59:57.660Z"
  },
  "updatedAt": "2026-10-26T17:59:57.660Z"
}
=== [RAW AT-07] Restore HTTP Response === {
  "success": true,
  "message": "Database state restored successfully"
}
=== [RAW AT-07] In-Memory & Disk-Reloaded Config After Restore === {
  "mem": {
    "wabaId": "WABA-AT07-RESTORED",
    "phoneNumberId": "PNID-AT07-ORIG",
    "apiToken": "SYNTH-P12-AT07-REAL-API-TOKEN",
    "webhookSecret": "SYNTH-P12-AT07-REAL-WEBHOOK-SECRET",
    "credentialsConfigured": true,
    "verified": true,
    "lastCheckedAt": "2026-10-26T17:59:57.660Z"
  },
  "diskReloaded": {
    "wabaId": "WABA-AT07-RESTORED",
    "phoneNumberId": "PNID-AT07-ORIG",
    "apiToken": "SYNTH-P12-AT07-REAL-API-TOKEN",
    "webhookSecret": "SYNTH-P12-AT07-REAL-WEBHOOK-SECRET",
    "credentialsConfigured": true,
    "verified": true,
    "lastCheckedAt": "2026-10-26T17:59:57.660Z"
  }
}
=== [RAW AT-10] Restore into Fresh Environment Response === {
  "success": true,
  "message": "Database state restored successfully (Non-secret settings restored; credentials must be entered independently for: chan-whatsapp)",
  "unconfiguredChannels": [
    "chan-whatsapp"
  ]
}
=== [RAW AT-10] GET /integrations/channels chan-whatsapp in Fresh Env === {
  "id": "chan-whatsapp",
  "type": "whatsapp",
  "name": "WhatsApp Business Cloud API (Official)",
  "badge": "موثق ومعتمد من Meta",
  "status": "unconfigured",
  "accountInfo": {
    "wabaId": "WABA-AT10-NONSECRET",
    "phoneNumberId": "PNID-AT10-NONSECRET",
    "credentialsConfigured": false,
    "verified": false,
    "lastCheckedAt": "2026-10-26T17:59:57.723Z"
  }
}
```

### A.4 المخرج الخام لاختبار `AT-15` (رفض فك التشفير عند اختلاف `AAD` للمؤسسة أو القناة بنفس المفتاح الصالح)
```text
=== [RAW AT-15] Cross-Channel AAD Failure === {
  code: 'AUTH_TAG_MISMATCH',
  message: 'Authenticated decryption failed (AUTH_TAG_MISMATCH) for channel context [org-p1-2-encryption-audit-temp:chan-voice]. Ciphertext, authTag, key, or AAD context does not match.'
}
=== [RAW AT-15] Cross-Tenant AAD Failure === {
  code: 'AUTH_TAG_MISMATCH',
  message: 'Authenticated decryption failed (AUTH_TAG_MISMATCH) for channel context [org-p1-2-encryption-audit-temp-peer:chan-whatsapp]. Ciphertext, authTag, key, or AAD context does not match.'
}
=== [RAW AT-15] Disk Swap loadFromDisk Diagnostic === {
  "operation": "loadFromDisk",
  "code": "AUTH_TAG_MISMATCH",
  "message": "Authenticated decryption failed (AUTH_TAG_MISMATCH) for channel context [org-p1-2-encryption-audit-temp-peer:chan-whatsapp]. Ciphertext, authTag, key, or AAD context does not match.",
  "timestamp": "2026-10-26T17:59:57.752Z"
}
```
