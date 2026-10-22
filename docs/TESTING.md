# دليل الاختبارات والتحقق المستقل (`docs/TESTING.md`)

## 1. أوامر التحقق القياسية والقابلة لإعادة الإنتاج

يمكن تشغيل جميع بوابات التحقق والجودة مباشرة عبر الأوامر التالية في جذر المشروع (`/app/applet`):

```bash
# 1. فحص الأنواع الصارم (TypeScript Compiler Check)
npm run lint

# 2. بناء حزمة الإنتاج للواجهة والخادم (Vite + esbuild Production Bundle)
npm run build

# 3. تشغيل جناح التدقيق المستقل الشامل (Schema + RBAC + Tenant Isolation + PII + Audit Chain + Firestore Dirty Dozen + 22 Modules + 50-Req Load Test)
npm run test:audit

# 4. تشغيل جناح اختبارات العمليات التكاملية الحية (33 HTTP E2E Operational Tests)
npm run test:e2e
```

---

## 2. هيكل أجنحة الاختبار المستقلة

| ملف الاختبار | النطاق | ما يتم التحقق منه فعلياً |
|---|---|---|
| `server/test/run-enterprise-audit.ts` | جناح التدقيق الأمني والهندسي المستقل | 1) مطابقة أعمدة `src/db/schema.ts` (80 عموداً)، 2) فحص RBAC (`Read Only` و`QA` مرفوضان بـ `403`)، 3) فحص عزل المؤسسات (`org-foreign-999` مرفوض بـ `404` على العملاء والرسائل والماكرو)، 4) فحص التحقق من المدخلات (`400` للبيانات الفارغة أو القيم غير الصالحة)، 5) فحص تنقيح PII والأسرار وسلسلة `SHA-256` واستعادة النسخ الاحتياطي، 6) فحص قواعد `DRAFT_firestore.rules` ضد 12 هجوماً (`Dirty Dozen`), 7) تنفيذ الـ 22 وحدة بدون fallback، 8) اختبار ضغط متزامن حقيقي (50 طلباً متوازياً). |
| `server/test/firestore-rules-audit.ts` | بوابة أمان Firestore (Red Team Suite) | التحقق الهيكلي والسلوكي من `DRAFT_firestore.rules` و`firebase-blueprint.json` وإحباط 12 حمولة هجومية (`DD-01` إلى `DD-12`) والسماح بـ 3 تدفقات شرعية. |
| `scripts/test_all_operations.ts` | اختبارات رحلة العميل والعمليات الحية (`E2E`) | 33 اختبار HTTP فعلي ضد الخادم تشمل التذاكر، المحادثات، المكالمات، الذكاء الاصطناعي، قاعدة المعرفة، تقييمات الجودة، المناوبات، والأتمتة. |
