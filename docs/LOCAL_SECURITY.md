# OMNIFLOW OS — وثيقة الأمان والحماية المحلية (Local Security & Owner Authentication Specification)

**Classification:** Enterprise Security & Cryptographic Trust Architecture  
**Operating Mode:** Local-First Windows Workstation  
**Network Scope:** Loopback (`127.0.0.1`) Only  

---

## 1. نموذج التهديد المحلي وإحكام النطاق (Local Threat Model & Network Boundary)

يعمل نظام **OmniFlow OS** في بيئة العمل المحلية على افتراض انعدام الثقة (Zero Trust Architecture):
1. **قفل الشبكة على واجهة Loopback:**
   * الخادم مبرمج حصرياً ليربط نفسه على `127.0.0.1` عبر منفذ `3000`.
   * الربط على `0.0.0.0` محظور افتراضياً لمنع تعرض التطبيق لأي جهاز على شبكة الـ Wi-Fi المنزلية أو شبكة العمل دون تصريح مسبق.
2. **عزل مفاتيح التشفير عن مستودع Git:**
   * يتم توليد مفاتيح التشفير محلياً بنظام CSPRNG عالي العشوائية وتخزينها في:
     `F:\Dev_Workspace\Data\OMNIFLOW_OS\.omniflow-dev-keys.json`
   * هذا المسار يقع خارج مستودع الكود كلياً ومدرج ضمن ملف `.gitignore` كإجراء وقائي إضافي.

---

## 2. آلية مصادقة المالك المحلي الآمنة (Local Owner Bootstrap & Authentication)

لمنع استخدام كلمات مرور ثابتة أو ترك النظام مفتوحاً محلياً:
1. **التهيئة الآمنة للمالك في التشغيل الأول (First-Run Bootstrap):**
   * عند إقلاع الخادم لأول مرة دون وجود إعدادات للمالك، يُولد النظام رمز تهيئة سري مشفر عالي الإنتروبيا (32 بايت = 64 حرف هكس) ويحفظه في:
     `F:\Dev_Workspace\Data\OMNIFLOW_OS\.local_owner_auth.json` (مع تعيين صلاحية 0600 لنظام الملفات).
   * يُمنع منعاً باتاً طباعة كلمات المرور أو الرموز الصريحة في سجلات الكونسول أو ملفات السجلات النصية.
2. **تسجيل دخول المالك المحلي (`/api/v1/auth/local-owner-login`):**
   * مسار مصادقة محلي مخصص يتحقق من بيانات المالك عبر خوارزمية تشفير `scrypt` مع ملح فريد (Salt).
   * محمي بقيد صارم: `isLoopbackRequest`، حيث يُرفض أي طلب مصادقة قادم من عنوان شبكي خارجي (Cross-Network Rejection).
3. **الجلسات المشفرة ومكافحة التزوير:**
   * عند نجاح المصادقة، يتم إصدار رمز جلسة `sessionToken` مشفر بنظام HMAC-SHA-256، مرتبط بدور `owner` ومحدد بوقت انتهاء صلاحية (TTL).
   * يتم تعيين كوكيز الجلسة بخصائص: `HttpOnly`, `SameSite=Strict`, `Path=/`.

---

## 3. حماية أسرار القنوات وسجل التدقيق (Cryptographic Key Policy)

1. **تشفير أسرار القنوات (Channel Secret Encryption):**
   * تشفير `AES-256-GCM` للرموز الحساسة ومفاتيح القنوات قبل حفظها في ملف الحالة `db_state.json`.
   * المفتاح: `CHANNEL_SECRET_ENCRYPTION_KEY` بطول 64 حرف hex.
2. **سجل التدقيق غير القابل للتلاعب (Tamper-Evident Audit Trail):**
   * كل عملية حساسة تُسجل في `AuditLogger` وتُجمد (`Object.freeze`).
   * ترتبط السجلات بسلسلة تجزئة متصلة:
     $$\text{integrityHash} = \text{SHA256}(\text{prevHash} + \text{action} + \text{actorId} + \text{timestamp} + \text{payload})$$
   * توقيع نقاط التفتيش الدورية بنظام HMAC-SHA-256 عبر `AUDIT_CHECKPOINT_HMAC_KEY`.
3. **تنقية البيانات الحساسة (PII Redaction):**
   * تنقية أرقام البطاقات الائتمانية `[REDACTED_CARD]`، وأرقام الهوية `[REDACTED_NATIONAL_ID]`، ورموز التحقق `[REDACTED_OTP]` قبل حفظها أو معالجتها.
