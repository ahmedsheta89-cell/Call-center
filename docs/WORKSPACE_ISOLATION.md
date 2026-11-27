# OMNIFLOW OS — مساق حوكمة عزل مساحات العمل والمشاريع (Workspace & Project Isolation Specification)

**Project ID:** `OMNIFLOW_OS`  
**Repository Identity:** `ahmedsheta89-cell/Call-center`  
**Canonical Local Root:** `F:\Dev_Workspace\Call-center`  
**Registry Location:** `F:\Dev_Workspace\Registry\projects.json`  
**Managed Drive:** `F:` (NTFS Partition 2 on Seagate 1TB HDD)  
**Strict Policy:** Zero Data Leakage • Zero Cross-Project Contamination • Local Isolation First

---

## 1. الهوية الرسمية للمشروع (Canonical Project Identity)

تم تعيين وتثبيت معرّف المشروع حصريًا على النحو التالي:
* **Project ID:** `OMNIFLOW_OS`
* **Canonical Path:** `F:\Dev_Workspace\Call-center`
* **Data Root:** `F:\Dev_Workspace\Data\OMNIFLOW_OS`
* **Backups Root:** `F:\Dev_Workspace\Backups\OMNIFLOW_OS`
* **Cache Root:** `F:\Dev_Workspace\Cache\OMNIFLOW_OS`
* **Temp Root:** `F:\Dev_Workspace\Temp\OMNIFLOW_OS`
* **Logs Root:** `F:\Dev_Workspace\Logs\OMNIFLOW_OS`
* **Default Port:** `3000` (Loopback `127.0.0.1` فقط)

---

## 2. خريطة استكشاف المشاريع المحلية على القرص F (Discovered Projects Map)

أظهر الفحص الاستكشافي الشامل للقرص `F:` وجود عدة مشاريع ومجلدات عمل مستقلة ومحمية:

| المسار المطلق (Absolute Path) | المعرّف / المشروع | الحالة والنوع | نطاق الصلاحية (Access Scope) |
| :--- | :--- | :--- | :--- |
| `F:\Dev_Workspace\Call-center` | `OMNIFLOW_OS` | **المستودع النشط المعتمد** | **READ / WRITE (ضمن مسار العمل)** |
| `F:\callcenter` | `OMNIFLOW_HISTORICAL_REPORTS` | مجلد تقارير تاريخية | **READ-ONLY LOCKED (محظور التعديل)** |
| `F:\pharmacy_os` | `PHARMACY_OS` | مشروع صيدلية منفصل | **PROTECTED FOREIGN (محظور المساس به)** |
| `F:\quran` | `QURAN_TEACHER_AI` | مشروع تطبيق القرآن | **PROTECTED FOREIGN (محظور المساس به)** |
| `F:\flutter` | `FLUTTER_SDK` | حزمة أدوات التطوير | **PROTECTED SYSTEM (محظور المساس به)** |

> **قاعدة أمان قطعية:** لا يُسمح بأي شكل من الأشكال بقراءة أو كتابة أو تعديل أو نقل أي ملف يخص `pharmacy_os` أو `quran` أو أي مسار خارج القائمة البيضاء (`Allowlist`) المعتمدة لمشروع `OMNIFLOW_OS`.

---

## 3. معمارية العزل التام (Workspace Isolation Architecture)

لضمان عدم تداخل الملفات أو المفاتيح أو قواعد البيانات بين المشاريع:
1. **عزل قواعد البيانات والتخزين:**
   * يتم تخزين ملف الحالة التشغيلي `db_state.json` وقفل العمليات `db_state.lock` وملفات المفاتيح المشفرة `.omniflow-dev-keys.json` وملف المصادقة `.local_owner_auth.json` حصريًا داخل:
     `F:\Dev_Workspace\Data\OMNIFLOW_OS\`
   * يُمنع منعًا باتًا استخدام مجلد النظام المؤقت `C:\Users\...\AppData\Local\Temp` لتخزين البيانات الدائمة.
2. **عزل الكاش والتنزيلات:**
   * تم توجيه npm cache حصريًا إلى:
     `F:\Dev_Workspace\Cache\npm\`
   * شهادة وسيط TLS المعتمدة محفوظة في:
     `F:\Dev_Workspace\Cache\avast_root.pem`
3. **عزل النسخ الاحتياطية والسجلات:**
   * النسخ الاحتياطية الآلية تُحفظ في:
     `F:\Dev_Workspace\Backups\OMNIFLOW_OS\`
   * السجلات التشغيلية تُحفظ في:
     `F:\Dev_Workspace\Logs\OMNIFLOW_OS\`

---

## 4. سجل المشاريع المركزي (Project Registry)

تم إنشاء وتفعيل سجل المشاريع المركزي في:
`F:\Dev_Workspace\Registry\projects.json`

يحتوي هذا الملف بصيغة JSON على التوصيف الكامل للمشروع النشط، والمنافذ المخصصة له، والمسارات المصرح بالكتابة عليها، وقائمة المشاريع المحمية الخارجية لمنع أي تصادم أو تعد تعديلي.

---

## 5. ضوابط التحقق من العزل (Isolation Verification & Canary Tests)
* تم بناء اختبارات تحقق مستمرة (`scripts/test_workspace_isolation.ts`) تؤكد:
  1. رفض الكتابة خارج مسار `F:\Dev_Workspace`.
  2. عدم محاولة فتح أو قراءة ملفات المشاريع المجاورة (`pharmacy_os` / `quran`).
  3. حظر استخدام أو استهلاك مساحة القرص `C:`.
  4. التحقق من مطابقة `Project ID === OMNIFLOW_OS` قبل أي عملية تصدير أو أرشفة.

---

## 6. التحليل الفني: عزل التطبيق مقابل عزل نظام التشغيل (Application vs OS-Level Isolation)

### 6.1 حظر المسارات على مستوى التطبيق (Application-Level Path Allowlisting)
* **ما تم تنفيذه وإثباته:**
  - يتحقق محرك التطبيق (`localPersistenceEngine.ts` و `router.ts`) برمجيًا من كل مسار مدخل.
  - حظر محاولات تجاوز المسارات (`Path Traversal` مثل `..` أو الرموز الصفرية `\0`).
  - حظر مسارات نظام التشغيل المحمية مثل `C:\Windows` أو `/etc/`.
  - التحقق الصارم من عدم توجيه الكتابة لأي مجلد غير مدرج في القائمة البيضاء المعتمدة.

### 6.2 حدود عزل نظام التشغيل (Operating-System-Level Access Control)
* **الإفصاح الهندسي الصريح:**
  - تطبيق Node.js يعمل حاليًا بنفس صلاحيات حساب المستخدم الحالي على Windows (`DESKTOP-TPRQE15\FAWZY SHETA`).
  - لذلك، فإن سجل `projects.json` أو دوال فحص المسارات داخل Node.js تمثل ضوابط برمجية داخل التطبيق (Application Controls)، ولا تمنع أي عملية خارجية أخرى تعمل على Windows تحت نفس حساب المستخدم من الوصول إلى الملفات.
  - صلاحيات NTFS الموروثة على مجلدات القرص `F:` تمنح حسابات المستخدمين الآخرين في مجموعة `BUILTIN\Users` صلاحيات قراءة وتنفيذ.

### 6.3 توصيات ترقية العزل إلى مستوى نظام التشغيل (OS Hardening Recommendations)
إذا تطلب الأمر مستقبلاً عزل البيانات عن باقي مستخدمي الجهاز على مستوى الـ Kernel:
1. **تخصيص حساب خدمة Windows (Service Account):**
   تشغيل خادم OmniFlow تحت حساب خدمة محلي مخصص (Virtual Account أو Local Service) بدلاً من الحساب التفاعلي للمستخدم.
2. **قفل صلاحيات NTFS عبر `icacls`:**
   تعطيل وراثة الصلاحيات على `F:\Dev_Workspace\Data\OMNIFLOW_OS` وحصرها في حساب التشغيل و`SYSTEM`:
   ```powershell
   icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)"
   ```
3. **تشفير البيانات عبر DPAPI:**
   استخدام واجهة حماية البيانات في Windows (DPAPI) لتشفير ملف المفاتيح `.omniflow-dev-keys.json` بحيث لا يمكن فك تشفيره إلا بواسطة المعالج المرتبط بنفس حساب التشغيل.
