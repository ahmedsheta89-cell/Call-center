# OMNIFLOW OS — خطة متانة البيانات والتعافي من الأعطال (Data Durability, Backup & Disaster Recovery Runbook)

**Classification:** High-Reliability Local Storage Specification  
**Primary Persistence Engine:** `server/db/localPersistenceEngine.ts`  
**Storage Root:** `F:\Dev_Workspace\Data\OMNIFLOW_OS\`  
**Backup Root:** `F:\Dev_Workspace\Backups\OMNIFLOW_OS\`  

---

## 1. بنية التخزين المحلي المتين (Durable Storage Architecture)

يستخدم **OmniFlow OS** محرك تخزين محلي ذرّي فائق الأمان ومصمم للعمل دون انقطاع:
1. **مسار ملف الحالة الرئيسي:**
   `F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json`
2. **مسار النسخة الاحتياطية المباشرة (Hot Backup):**
   `F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json.bak`
3. **مسار قفل العمليات الحصري (Process Lock):**
   `F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.lock`
4. **ملف المفاتيح المشفرة:**
   `F:\Dev_Workspace\Data\OMNIFLOW_OS\.omniflow-dev-keys.json`

---

## 2. آليات حماية البيانات والذرّية (Zero Silent Data Loss Guarantees)

### A. الكتابة الذرية المؤكدة (Verified Atomic Writes)
* لا يتم الكتابة مباشرة على ملف `db_state.json` لتجنب تلف الملف عند انقطاع الكهرباء المفاجئ.
* **دورة حياة الكتابة:**
  1. كتابة البيانات أولاً إلى ملف مؤقت فريد:
     `db_state.json.<pid>.<timestamp>.tmp`
  2. إجبار نظام التشغيل على حفظ البيانات على القرص الفيزيائي عبر `fs.fsyncSync(fd)`.
  3. إغلاق المقبض `fs.closeSync(fd)`.
  4. التحقق من سلامة قراءة الملف المؤقت وبنية الـ JSON.
  5. نسخ الملف الحالي إلى `db_state.json.bak` كنسخة احتياطية سابقة صالحة.
  6. استبدال ذري للملف عبر `fs.renameSync`.

### B. قفل التشغيل الحصري (Single-Instance Process Lock)
* يمنع تشغيل نسختين من الخادم في نفس الوقت لتفادي تضارب وتلف البيانات:
  * عند الإقلاع، يُنشأ ملف `db_state.lock` مسجل فيه `PID` و`Hostname` ووقت البدء.
  * إذا وُجد قفل قائم، يتحقق النظام هل العملية المالكة للقفل ما زالت حية (`process.kill(pid, 0)`):
    * إذا كانت حية: يفشل الإقلاع بأمان برمز `FATAL_BOOTSTRAP_LOCK_ACQUIRED_BY_OTHER_PROCESS`.
    * إذا كانت ميتة (Stale Lock من إغلاق مفاجئ): يتم تنظيف القفل وإعادة إنشائه تلقائياً.

### C. التعافي الذاتي من التلف (Self-Healing & Corruption Recovery)
* إذا تعرض ملف `db_state.json` للتلف الجزئي أو أصبح فارغاً:
  1. يرصد محرك `tryRecover` التلف ويعزل الملف التالف في مجلد الحجر الصحي:
     `db_state.json.quarantine.<timestamp>`
  2. يتحقق من سلامة ملف النسخة الاحتياطية المباشرة `db_state.json.bak`.
  3. يختبر صحة المخطط (Schema Version 2).
  4. يستعيد البيانات بالكامل ويسجل حدث الاسترجاع في سجل التدقيق:
     `RECOVERED_FROM_VALIDATED_BACKUP`.

---

## 3. إجراءات النسخ الاحتياطي اليدوي والاستعادة (Manual Backup & Restore)

### إنشاء نسخة احتياطية كاملة (Full Backup):
```powershell
# نسخ فوري آمن ومؤرخ
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json" "F:\Dev_Workspace\Backups\OMNIFLOW_OS\db_state_$timestamp.json"
Copy-Item "F:\Dev_Workspace\Data\OMNIFLOW_OS\.omniflow-dev-keys.json" "F:\Dev_Workspace\Backups\OMNIFLOW_OS\keys_$timestamp.json"
Write-Host "Backup created successfully: db_state_$timestamp.json"
```

### الاستعادة من نسخة احتياطية (Disaster Recovery):
1. إيقاف الخادم (Graceful Shutdown).
2. نسخ ملف النسخة الاحتياطية المراد استعادتها إلى `F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json`.
3. التأكد من تطابق ملف المفاتيح المشفرة `.omniflow-dev-keys.json` لضمان القدرة على فك تشفير أسرار القنوات.
4. إعادة تشغيل الخادم. يقوم النظام بالتحقق التلقائي من سلامة البيانات وإكمال الإقلاع بنجاح.
