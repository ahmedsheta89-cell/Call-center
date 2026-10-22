# Firestore Zero-Trust Security Specification, Multi-Tenant Remediation & Real Emulator Audit (`SECURITY_SPEC_FIRESTORE.md`)

> **حالة القواعد والنشر السحابي (Phase 4.4B.3C):**  
> - **تطابق تام (`100% SHA-256 Parity`):** تم توحيد `firestore.rules` و`DRAFT_firestore.rules` محلياً بحيث يتطابقان بايتاً ببايت (`SHA-256 Parity`).  
> - **عدم النشر السحابي الحي (`Zero Live Deployment`):** التزاماً بحدود الأمان، **لم يتم نشر (`Deploy`) هذه القواعد إلى مشروع Firebase السحابي الحي**؛ يتم التحقق منها حصرياً داخل **Firebase Firestore JVM Emulator الحقيقي** (`cloud-firestore-emulator-v1.22.0.jar`) على مشروع تجريبي معزول (`demo-omniflow-security-gate`) عبر `@firebase/rules-unit-testing`.

---

## 1. معالجة ثغرة `FINDING-4.4B.2.1-01` (Cross-Tenant Admin Pivot in `match /users/{userId}`)

### أ. السبب الجذري السابق
كانت دالة `isAdmin()` تمنح صلاحية لمجرد كون دور المستخدم `Admin` أو `Owner` في وثيقته دون التحقق من انتمائه لنفس المؤسسة (`organizationId`) الخاصة بالوثيقة المستهدفة في `match /users/{userId}`، ولم تكن تمنع المشرف من تعديل حقل `organizationId` في وثيقته الخاصة أو حذف وثيقته وإعادة إنشائها للانتقال إلى مؤسسة ضحية (`Cross-Tenant Admin Self-Pivot`).

### ب. التصميم الأمني المطبّق
1. **دالة `isSameOrgAdmin(orgId)`:** تشترط `isAdmin() && isSameOrg(orgId)`.
2. **ثبات الحقول الهوياتية (`Top-Level Immutability`) في `allow update`:** فرض ثبات `uid` و`organizationId` و`email` و`inviteId` و`createdAt` على جميع الفاعلين بلا استثناء.
3. **منع الحذف الذاتي (`!isOwner(userId)`) في `allow delete`:** منع أي مشرف من حذف ملفه الشخصي لإغلاق مسار الحذف متبوعاً بإعادة التسجيل في مؤسسة أخرى.

---

## 2. معالجة ثغرة `AUDIT-3B-04` (Unverified Tenant Claiming on Registration & Invitation State Machine)

### أ. السبب الجذري السابق
كانت قاعدة `allow create` في `match /users/{userId}` تسمح لأي مستخدم موثّق البريد (`isVerifiedUser()`) باختيار أي معرّف مؤسسة (`incoming().organizationId`) عند إنشاء وثيقته لأول مرة بدور `Agent`، كما كانت تمنح استثناءً عاماً لـ `isBootstrappedAdmin()` دون تقييده بالمؤسسة الأساسية.

### ب. التصميم الأمني المطبّق (Isolated Self-Registration + Atomic Single-Use Invitation Consumption)
1. **سلامة وثيقة المستخدم (`hasIntactUserProfile()`):**
   - تشترط وجود `/users/$(request.auth.uid)` واكتمال الحقول الإلزامية (`uid`, `organizationId`, `email`, `role`) وتطابق `uid == request.auth.uid` وصحة الدور، مما يمنع أي سقوط احتياطي (`Permissive Fallback`) عند غياب الوثيقة أو تلفها.
2. **حصر `allow create` في `match /users/{userId}` في ثلاثة مسارات موثّقة فقط:**
   - **المسار الأول — التسجيل الذاتي المعزول (`Isolated Self-Registration`):** إذا سجل المستخدم دون دعوة (`!('inviteId' in incoming())`)، يُلزم بأن يكون `incoming().organizationId == ('org-isolated-' + request.auth.uid)` وبدور `'Agent'`، وبذلك يبدأ في مساحة معزولة تماماً عن بيانات المؤسسات الحقيقية.
   - **المسار الثاني — القبول الذري لدعوة صالحة لمرة واحدة (`hasValidAtomicInvitationConsumption`):** للانضمام إلى مؤسسة قائمة، يجب أن يمرر المستخدم `incoming().inviteId` لوثيقة دعوة في `/invitations/{inviteId}` تكون في حالة `'pending'` وغير منتهية الصلاحية (`expiresAt > request.time.toMillis()`) ومطابقة لـ `request.auth.uid` و`request.auth.token.email` و`organizationId` و`role`، **وأن يتم تحويل حالتها ذرياً (`writeBatch` / `runTransaction`) في نفس العملية إلى `'accepted'` عبر التحقق بـ `getAfter()`**.
   - **المسار الثالث — تهيئة الحساب الأول المقيّدة (`Restricted First-Owner Bootstrap`):** يقتصر `isBootstrappedAdmin()` عند الإنشاء الأولي على المؤسسة الأساسية المحددة فقط (`isDesignatedBootstrapOrg(incoming().organizationId)` أي `'org-madar-001'`) ويُمنع من إنشاء حسابات في أي مؤسسة أجنبية.
3. **آلة الحالة الصارمة لمجموعة `/invitations/{inviteId}`:**
   - **الإنشاء (`allow create`):** يقتصر حصرياً على مشرف نفس المؤسسة (`isSameOrgAdmin(incoming().organizationId)`)، بحالة `'pending'`، وتاريخ انتهاء مستقبلي (`expiresAt > request.time.toMillis()`)، ومنع دعوة النفس (`invitedUid != request.auth.uid`).
   - **التحديث (`allow update`):** يسمح بانتقالين فقط من الحالة `'pending'`:
     1. `'pending' -> 'accepted'` بواسطة المدعو نفسه بشرط عدم وجود وثيقة مستخدم سابقة له (`!exists(/users/$(uid))`) وإنشائها ذرياً في نفس الدفعة (`existsAfter(/users/$(uid))`).
     2. `'pending' -> 'revoked'` بواسطة مشرف نفس المؤسسة (`isSameOrgAdmin`).
   - **الحذف (`allow delete: if false`):** الدعوات سجلات تدقيق أمني غير قابلة للحذف أو إعادة الفتح.

---

## 3. مصفوفة اختبارات المحاكي الفعلي (`39/39 Real JVM Firestore Emulator Tests`)

تُنفذ جميع الاختبارات الـ **39** (`29` هجوماً تُرفض بـ `PERMISSION_DENIED` + `10` مسارات شرعية تنجح بـ `assertSucceeds`) داخل `server/test/firestore-rules-audit.ts` على محاكي JVM الفعلي (`npm run test:firestore`):

- **الفئة A (`EMU-PIVOT-01` .. `EMU-PIVOT-08`):** 8 اختبارات لإثبات إغلاق `FINDING-4.4B.2.1-01` (منع القفز بين المؤسسات أو قراءة/تعديل/حذف مستخدمي مؤسسة أخرى أو الحذف الذاتي للمشرف).
- **الفئة B (`EMU-JOIN-01` .. `EMU-JOIN-12`):** 12 اختباراً شاملاً لإثبات إغلاق `AUDIT-3B-04`:
  - `EMU-JOIN-01` & `EMU-JOIN-02`: رفض انتحال `organizationId` لمؤسسة ضحية عند التسجيل دون دعوة أو بدعوة وهمية.
  - `EMU-JOIN-03`: رفض إنشاء أو تزوير دعوة من قِبل مستخدم غير مدعو أو موظف `Agent` أو مشرف مؤسسة أجنبية أو دعوة المشرف لنفسه.
  - `EMU-JOIN-04`: نجاح إصدار دعوة شرعية من مشرف المؤسسة وقبولها الذري (`writeBatch`) من المدعو، ورفض القبول غير الذري أو محاولة رفع الدور أثناء القبول.
  - `EMU-JOIN-05`: رفض الدعوات المنتهية (`expiresAt <= request.time.toMillis()`) أو الملغاة (`revoked`) أو المستهلكة.
  - `EMU-JOIN-06`: منع إعادة استخدام الدعوة (`Replay`) أو إرجاع حالتها إلى `'pending'` أو حذفها أو السباق المتزامن (`Concurrent Double-Claim Race`).
  - `EMU-JOIN-07` & `EMU-JOIN-09`: عزل كامل لعمليات القراءة الفردية (`getDoc`) والاستعلامات الجماعية (`getDocs(query)`) والكتابة والحذف عبر المجموعات الـ 7 المحمية.
  - `EMU-JOIN-08`: ثبات الحقول الهوياتية (`organizationId`, `uid`, `email`, `inviteId`, `createdAt`) بعد الإنشاء.
  - `EMU-JOIN-10`: تقييد `Bootstrapped Admin` بالمؤسسة الأساسية فقط والتحقق من هرمية الصلاحيات (`Owner` / `Admin` / `Agent`).
  - `EMU-JOIN-11`: نجاح التسجيل الذاتي المعزول في `org-isolated-<uid>` وعزله التام عن بيانات المؤسسات الأخرى.
  - `EMU-JOIN-12`: رفض الوصول بالكامل عند غياب وثيقة المستخدم أو تلفها (`hasIntactUserProfile`).
- **الفئة C (`EMU-DD-01` .. `EMU-DD-12`):** 12 اختباراً لمصفوفة `Dirty Dozen` داخل المحاكي الفعلي.
- **الفئة D (`EMU-ALLOW-01` .. `EMU-ALLOW-07`):** 7 اختبارات للتدفقات التشغيلية الشرعية داخل المحاكي الفعلي.
