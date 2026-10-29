# OMNIFLOW OS — PHASE P.1.3 AUDIT CHAIN INTEGRITY & TENANT BACKUP VERIFIABILITY REPORT
## Versioned Audit Contract (`v1` Historical + `v2` Dual-Chain), Safe Test Cleanup & Retention Strategy

---

## القسم 0 — إقرار القدرة والنطاق (Mandatory Capability & Scope Disclosure)

1. **تنفيذ أوامر Shell حي فعلي (`bash` / `npm` / `tsx`)**: **نعم** — أملك تنفيذ أوامر Shell حقيقية ومباشرة داخل بيئة التشغيل الحالية (`/app/applet`).
2. **تشغيل سيرفر حي واستدعاء مساراته عبر HTTP**: **نعم** — يمكنني تشغيل خادم Express HTTP فعلي على منفذ محلي (`127.0.0.1`) واستدعاء مسارات REST API الحقيقية (`GET /api/v1/system/backup`، `POST /api/v1/system/restore`، وغيرها) والتحقق من الاستجابات وحالة الذاكرة والقرص.
3. **وجود `.git` محلي ومخرج `git status` الخام**: **لا يوجد `.git` محلي** داخل `/app/applet`. المخرج الخام لتنفيذ `git status 2>&1 ; echo "GIT_STATUS_EXIT=$?"`:
   ```text
   fatal: not a git repository (or any of the parent directories): .git
   GIT_STATUS_EXIT=128
   ```
4. **الوصول المتزامن لـ Commit SHA البعيد مقابل استعلام GitHub API للقراءة فقط**:
   - **لا أملك وصولاً متزامنًا محليًا** يربط مساحة العمل `/app/applet` تلقائيًا بـ GitHub البعيد (`github.com/ahmedsheta89-cell/Call-center`) لأن البيئة لا تحتوي على `.git` محلي ولا تدفع التعديلات تلقائيًا من داخل الـ Shell.
   - **الفرق الجوهري**: استعلام GitHub REST API العام للقراءة فقط يعيد آخر Commit تم دفعه سابقًا على الفرع البعيد (المرجع السابق على `main` قبل مزامنة تعديلات هذه المرحلة هو `9a5eae44e022ac1ac8c6513f31dd804aa79b8619`)، لكنه **لا يعكس الملفات الجديدة أو المعدّلة محليًا في هذه الجلسة** حتى يقوم مالك المستودع بمزامنتها ودفعها (`push`) والحصول على الـ Commit SHA الجديد (`PENDING_OWNER_SYNC_SHA`).

---

## القسم 1 — السياق الإلزامي والقيود الموروثة المفتوحة (Inherited Open Context)

التزامًا بقواعد الصرامة الموروثة من المراحل السابقة، يظل البندان التاليان **مفتوحين رسميًا دون إغلاق زائف**:

1. **بند مفتوح (أ) — تناقض `6h0m0s` مقابل `15m0s` ومسار `.github` في Annotation سجل GitHub Actions السابق**:
   - التناقض التاريخي بين نص الـ Annotation الذي ظهر في واجهة GitHub Actions (`The job has exceeded the maximum execution time of 6h0m0s` في Run `40377162540`) وبين النص المسترجع لاحقًا عبر GitHub Check-Runs API (`The action ... has timed out after 15 minutes.` مع الحقل `path: ".github"`) لم يُحسم سببه الجذري من طرف منصة GitHub، ويُحفظ كبند مفتوح غير محسوم.
   - جميع الأدلة في هذه المرحلة (`P.1.3`) تستند حصريًا إلى مخرجات تنفيذ Shell خام فعلية ومباشرة من البيئة الحالية مع أوامر تحقق مستقلة قابلة لإعادة التشغيل.
2. **بند مفتوح (ب) — تذبذب أرقام Throughput التاريخية (`619` / `575` / `292` / `726 req/s`)**:
   - أرقام الـ Throughput المسجلة عبر الجلسات السابقة (`619 req/s`، `575 req/s`، `292 req/s`، `726 req/s`، وفي تشغيل التدقيق الكامل لهذه الجلسة `309 req/s`) ناتجة عن تشغيل غير معزول داخل بيئة مشتركة الموارد ودون منهجية قياس أداء معيارية موحدة (Warmup / تثبيت موارد / عزل I/O).
   - لذلك **لا يُعتمد أي رقم منها كخط أساس (Baseline) للأداء**، ولم يُجرَ أي قياس أداء جديد ضمن نطاق المرحلة `P.1.3`.

---

## القسم 2 — إثبات المشكلة قبل التعديل (Baseline Forensic Proof)

قبل تنفيذ تعديلات المرحلة `P.1.3`، تم توثيق المواضع الدقيقة في الكود التي كانت تسبب تعارض سلسلة التدقيق عند التداخل بين المستأجرين أو عند تنظيف الاختبارات أو عند تجاوز نافذة الاحتفاظ:

1. **`server/core/audit.ts` (النسخة السابقة قبل `P.1.3`)**:
   - في `AuditLogger.log()`، كان كل حدث يحسب `prevHash = this.inMemoryStore[0]?.integrityHash || '0'.repeat(64)` فقط على مستوى السلسلة العالمية المشتركة (`inMemoryStore`) دون أي مؤشر خاص بالمستأجر (`tenantPrevHash` أو `tenantSeq`) ودون رقم نسخة لعقد الحدث (`schemaVersion`).
   - في `AuditLogger.log()`، عند تجاوز `maxRetentionLimit = 2000` (`if (this.inMemoryStore.length > this.maxRetentionLimit) this.inMemoryStore.pop()`), كان يتم حذف الحدث الأقدم (`#1`) من الذاكرة دون حفظ نقطة إرساء (`AuditRetentionCheckpoint`) توثق `lastEvictedIntegrityHash`، مما يترك الحدث الأقدم المتبقي (`#2`) بـ `prevHash` لا يطابق `AUDIT_GENESIS_HASH`.
   - في `AuditLogger.verifyChainIntegrity()`، كان التحقق يفترض أن كل عنصر في المصفوفة الممررة يتصل مباشرة بالعنصر الذي يسبقه عبر `prevHash` العالمي، وهو ما ينجح على السلسلة العالمية الكاملة لكنه يفشل حتمًا إذا مُررت إليه مصفوفة مفلترة لمستأجر واحد (`exportTenantBackup`) كانت أحداثه متداخلة زمنيًا مع مستأجر آخر.
2. **`server/db/store.ts` (النسخة السابقة قبل `P.1.3`)**:
   - في `exportTenantBackup(organizationId)`، كان يتم تصدير `auditEvents: AuditLogger.exportAllEvents().filter((e) => e.organizationId === organizationId)`، أي مجموعة جزئية تخص المستأجر وحده بينما `prevHash` داخل كل حدث يشير إلى أحداث مستأجرين آخرين في السلسلة العالمية.
   - في `importFullBackupDetailed()`، كان الشرط `if (data.auditEvents.length > 0 && !scopeOrgId)` يتخطى التحقق من `auditEvents` عند الاستعادة المقيدة بمستأجر (`scopeOrgId`).
3. **`server/api/router.ts` (النسخة السابقة قبل `P.1.3`، الأسطر `169–181`)**:
   - في المسار `POST /api/v1/system/restore`، كان الكود يستدعي `AuditLogger.verifyChainIntegrity(payload.auditEvents)` مباشرةً قبل `db.importFullBackupDetailed(payload, { scopeOrgId: currentActor.organizationId, persistToDisk: true })`.
   - هذا الاستدعاء كان يؤدي إلى نتيجتين خاطئتين:
     - رفض النسخة الاحتياطية الشرعية للمستأجر (`400 TAMPERED_AUDIT_CHAIN`) بمجرد وجود حدث واحد لمستأجر آخر تداخل زمنيًا بين حدثين للمستأجر المصدر.
     - تحويل خطأ حقن حدث تدقيق لمستأجر أجنبي داخل `auditEvents` إلى `400 TAMPERED_AUDIT_CHAIN` بدلاً من `403 CROSS_TENANT_RESTORE_FORBIDDEN`.
4. **`server/test/p1-2-channel-secret-encryption-audit.ts` (النسخة السابقة قبل `P.1.3`، الأسطر `96`، `207–211`، `1309–1311`)**:
   - كانت دالة التنظيف `cleanupAndVerifyReadAfterDelete` تحذف أحداث المستأجر المؤقت عبر:
     ```ts
     AuditLogger.importEvents(
       AuditLogger.exportAllEvents().filter(
         (e) => e.organizationId !== P1_2_TEST_ORG_ID && e.organizationId !== P1_2_PEER_ORG_ID
       )
     );
     ```
   - إذا سُجّل أي حدث لمستأجر آخر بعد حدث المستأجر المؤقت، فإن `.filter(...)` يقتطع الحدث المؤقت من السلسلة ويترك الحدث اللاحق بـ `prevHash` مكسور.

---

## القسم 3 — القرار المعماري لعقد سلسلة التدقيق (Versioned Dual-Chain Audit Contract)

تمت المفاضلة الهندسية بين الخيارات الثلاثة واعتماد **الخيار 3 (عقد سلسلة التدقيق المزدوج المُرقّم `schemaVersion: 2` مع نقطة إرساء الاحتفاظ `AuditRetentionCheckpoint` الإصدار `1.3.0-p1-3`)** كما هو موثق بالتفصيل في `/docs/roadmap/OMNIFLOW_AUDIT_CHAIN_ARCHITECTURE_DECISION.md`:

| وجه المقارنة | الخيار 1: سلسلة لكل مستأجر فقط | الخيار 2: سلسلة مزدوجة بدون ترقيم عقد | الخيار 3 (المعتمد): عقد مزدوج مُرقّم (`schemaVersion: 2`) + `AuditRetentionCheckpoint` |
|---|---|---|---|
| **إثبات الترتيب العالمي عبر جميع المستأجرين** | غير متوفر | متوفر عبر `prevHash` و `globalSeq` | **متوفر بالكامل** عبر `prevHash` + `globalSeq` |
| **قابلية التحقق المستقل لنسخة المستأجر الاحتياطية (`exportTenantBackup`)** | متوفرة | تتعارض مع الأحداث التاريخية `v1` | **متوفرة بالكامل** عبر `verifyTenantBackupIntegrity()` التي تفحص `(tenantPrevHash, tenantSeq, integrityHash)` و `TenantAuditCheckpoint` |
| **التوافق العكسي مع أحداث `v1` التاريخية بدون إعادة كتابة صامتة** | مكسور | هش | **متوافق 100% دون أي تعديل صامت** — يتم التحقق من `v1` بصيغتها الأصلية، وترتبط أحداث `v2` الجديدة فوقها بسلاسة |
| **سلامة السلسلة بعد تجاوز حد الاحتفاظ (`> 2000` حدث)** | مكسورة عند حذف الحدث `#1` | مكسورة بدون نقطة إرساء | **محمية بنقطة إرساء مشفرة (`AuditRetentionCheckpoint`)** تحفظ `lastEvictedGlobalSeq` و `lastEvictedIntegrityHash` و `cumulativeArchiveChainHash` |
| **كشف الحذف (أول/وسط/آخر حدث) أو إعادة الترتيب أو حقن مستأجر أجنبي** | جزئي | يغفل حذف أول/آخر حدث بدون Checkpoint | **كشف كامل 100%** (`400 TAMPERED_AUDIT_CHAIN` للتلاعب/الحذف/إعادة الترتيب، و `403 CROSS_TENANT_RESTORE_FORBIDDEN` لحقن مستأجر أجنبي) |

---

## القسم 4 — إصلاح تنظيف الاختبارات (Safe Test Cleanup via Snapshot Restore)

1. تم إلغاء استخدام `.filter(...)` لحذف أحداث التدقيق من `AuditLogger` أثناء تنظيف الاختبارات في `server/test/p1-2-channel-secret-encryption-audit.ts` وفي جميع اختبارات `P.1.3`.
2. تمت إضافة دالتين رسميتين في `AuditLogger` (`server/core/audit.ts` الأسطر `314–341`):
   - `AuditLogger.captureSnapshot(): AuditSnapshotState`: تلتقط نسخة مجمدة (`Object.freeze`) من مصفوفة الأحداث الكاملة ومن `retentionCheckpoint`.
   - `AuditLogger.restoreSnapshot(snapshot: AuditSnapshotState): ChainIntegrityResult`: تستعيد اللقطة الأصلية ذريًا وتنفذ فورًا `this.verifyChainIntegrity()` للتأكد من أن السلسلة العالمية سليمة 100% (`valid: true`).

---

## القسم 5 — التحقق الفعلي عند استعادة نسخة المستأجر (`verifyTenantBackupIntegrity`)

تم تنفيذ `AuditLogger.verifyTenantBackupIntegrity(scopeOrgId, candidateEvents, tenantCheckpoint)` في `server/core/audit.ts` (الأسطر `643–890`) وربطها مباشرة داخل `db.importFullBackupDetailed()` في `server/db/store.ts` (الأسطر `1497–1545`) ومسار `POST /api/v1/system/restore` في `server/api/router.ts` (الأسطر `169–172`):

1. **فحص ملكية المستأجر الصارم (`403 CROSS_TENANT_RESTORE_FORBIDDEN`)**:
   - إذا كان أي حدث داخل `auditEvents` أو `auditTenantCheckpoint` يحمل `organizationId !== scopeOrgId`، تُرفض الاستعادة فورًا بـ `HTTP 403 CROSS_TENANT_RESTORE_FORBIDDEN` قبل المساس بأي جدول في الذاكرة أو القرص.
2. **إعادة حساب البصمة (`integrityHash`) وفحص الحقول (`400 TAMPERED_AUDIT_CHAIN`)**:
   - يُعاد حساب `computeEventHash(ev)` لكل حدث ومطابقته مع `ev.integrityHash`، مع التحقق من سلامة `prevHash` و `createdAt` وعدم وجود تعارض في `timestamp`. أي تعديل في `action` أو `afterState` أو `createdAt` أو `integrityHash` أو `prevHash` أو `tenantPrevHash` يُرفض بـ `HTTP 400 TAMPERED_AUDIT_CHAIN`.
3. **فحص استمرارية سلسلة المستأجر (`tenantPrevHash` + `tenantSeq` + `globalSeq`) و `auditTenantCheckpoint`**:
   - يتحقق المحرك من أن الحدث الأقدم للمستأجر يبدأ من `AUDIT_GENESIS_HASH` (أو من `lastEvictedIntegrityHash` في حال وجود إزاحة احتفاظ موثقة) ومن `tenantSeq = 1` (أو `lastEvictedTenantSeq + 1`).
   - يتحقق من أن كل حدث تالٍ للمستأجر يربط `tenantPrevHash === prevTenantEvent.integrityHash` و `tenantSeq === prevTenantEvent.tenantSeq + 1` و `globalSeq > prevGlobalSeq`.
   - يتحقق من مطابقة عدد أحداث المستأجر (`activeTenantEventCount`) وبصمة آخر حدث (`latestTenantIntegrityHash`) مع `auditTenantCheckpoint`، مما يكشف فورًا حذف أول حدث أو وسط السلسلة أو آخر حدث أو إعادة ترتيب الأحداث (`400 TAMPERED_AUDIT_CHAIN`).

---

## القسم 6 — سياسة الاحتفاظ والأرشفة (`maxRetentionLimit = 2000`)

1. **النافذة التشغيلية الساخنة (`Hot Operational Window = 2000`)**:
   - يحتفظ `AuditLogger` بآخر `2000` حدث في الذاكرة وفي لقطة القرص (`db_state.json`).
2. **نقطة الإرساء المشفرة (`AuditRetentionCheckpoint`)**:
   - عند تجاوز `2000` حدث، لا يتم إسقاط الحدث الأقدم بصمت؛ بل تسجل `recordEvictedEventInCheckpoint()` في `server/core/audit.ts` (الأسطر `226–260`):
     - `totalEvictedCount`: إجمالي الأحداث المؤرشفة/المزاحة.
     - `lastEvictedGlobalSeq`: الرقم التسلسلي العالمي لآخر حدث أزيح.
     - `lastEvictedIntegrityHash`: البصمة المشفرة لآخر حدث أزيح (والتي تصبح نقطة الإرساء الشرعية لـ `prevHash` في أقدم حدث متبقٍ في النافذة الساخنة).
     - `cumulativeArchiveChainHash`: بصمة تراكمية (`SHA-256(prevCumulativeArchiveHash + ":" + evictedIntegrityHash)`) تربط تاريخ جميع الأحداث المزاحة منذ بدء التشغيل.
     - `tenantCheckpoints[organizationId]`: تحفظ لكل مستأجر (`evictedCount`, `evictedTenantEventCount`, `lastEvictedTenantSeq`, `lastEvictedIntegrityHash`, `lastEvictedCreatedAt`) لضمان بقاء نسخ المستأجر الاحتياطية قابلة للتحقق الكامل حتى بعد إزاحة أحداث قديمة.
3. **عقد الترحيل المستقبلي إلى الأرشيف البارد (`PostgreSQL Cold Archive Cutover`)**:
   - عند الانتقال إلى PostgreSQL في المرحلة المخصصة لقاعدة البيانات الدائمة، يتم تفريغ الأحداث المزاحة مع `cumulativeArchiveChainHash` داخل جدول `audit_events` غير القابل للتعديل (`append-only`) قبل إزاحتها من الذاكرة.

---

## القسم 7 و 8 — عزل بيانات الاختبار ومنع التعليق (Tenant Isolation & Anti-Hang Safeguards)

- **معرفات المستأجرين الاصطناعيين المؤقتين الخاصة حصريًا بالمرحلة `P.1.3`**:
  - المستأجر الرئيسي للاختبار: `org-p1-3-audit-chain-temp`
  - المستأجر النظير لاختبارات التداخل والعزل: `org-p1-3-audit-chain-peer-temp`
  - لم يتم لمس `org-madar-001` أو `org-madar-enterprise-001`، ولم يُعد استخدام معرفات `org-p1-1-*` أو `org-p1-2-*`.
- **ضوابط منع التعليق (Anti-Hang)**:
  - جميع طلبات HTTP داخل `server/test/p1-3-audit-chain-integrity-audit.ts` تستخدم `AbortSignal.timeout(10000)` وترويسة `Connection: 'close'`.
  - جميع عمليات `JSON.parse` محاطة بـ `try/catch`.
  - يتم استدعاء `localServer.closeAllConnections?.()` و `localServer.close()` داخل `finally` مع إنهاء صريح `process.exit(0)`.

---

## القسم 9 — الأدلة الخام لاختبارات القبول الإلزامية (`AC-01` إلى `AC-10`) والتدقيق الشامل

### 9.1 المخرج الخام الكامل لتشغيل `timeout 30s npx tsx server/test/p1-3-audit-chain-integrity-audit.ts`

```text
=== [RAW AC-01] Interleaved Dual-Chain Verification ===
 {
  chainCheck: {
    valid: true,
    checkedCount: 5,
    v1Count: 0,
    v2Count: 5,
    code: 'CHAIN_VALID',
    anchorType: 'GENESIS',
    latestIntegrityHash: '7dfee5d250ca480b6630ae119e5a4054ed7aeb882b11b9a9042879a7aee7a9eb'
  },
  tenantAEvents: [
    {
      id: 'b2f5fd11-ed68-4ab6-991e-8e438378fe93',
      globalSeq: 1,
      tenantSeq: 1,
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      tenantPrevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      integrityHash: '7fc2aa98ac627bcb20f056d48188460a73226e354d8a4ac3a9c73cd9331273f7'
    },
    {
      id: '204bc98a-fe9d-41cf-8252-148baf99a183',
      globalSeq: 3,
      tenantSeq: 2,
      prevHash: '6fe2bcb9a75cc94c47237679ccaa43c3bd09c33e85c1ce761822039edaec8f96',
      tenantPrevHash: '7fc2aa98ac627bcb20f056d48188460a73226e354d8a4ac3a9c73cd9331273f7',
      integrityHash: '8f31e5d6b0a15c9a5e81ab86414c07945efdf98abfab7f5fac8fc983e385c928'
    },
    {
      id: 'c353ee29-adf0-4dd7-affa-43ec481da9e5',
      globalSeq: 5,
      tenantSeq: 3,
      prevHash: '7d4f3385b07d70aadecbcaf9692cded17c715d9b3742a79095b25ecd2fe51351',
      tenantPrevHash: '8f31e5d6b0a15c9a5e81ab86414c07945efdf98abfab7f5fac8fc983e385c928',
      integrityHash: '7dfee5d250ca480b6630ae119e5a4054ed7aeb882b11b9a9042879a7aee7a9eb'
    }
  ]
}
=== [RAW AC-02] Interleaved Tenant Backup Restore (200 OK) ===
 {
  restoreStatus: 200,
  restoreBody: { success: true, message: 'Database state restored successfully' },
  globalChainAfterRestore: {
    valid: true,
    checkedCount: 5,
    v1Count: 0,
    v2Count: 5,
    code: 'CHAIN_VALID',
    anchorType: 'GENESIS',
    latestIntegrityHash: '7dfee5d250ca480b6630ae119e5a4054ed7aeb882b11b9a9042879a7aee7a9eb'
  },
  tenantEventCount: 3,
  peerEventCount: 2
}
=== [RAW AC-03] Payload Field Tampering Rejection (400 TAMPERED_AUDIT_CHAIN) ===
 {
  tamperedAction: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 1'
    }
  },
  tamperedAfterState: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 2'
    }
  },
  tamperedTimestamp: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 0'
    }
  },
  memoryProtectedMacroIntact: true,
  diskHashUnchanged: true
}
=== [RAW AC-04] Hash Pointer Tampering Rejection (400 TAMPERED_AUDIT_CHAIN) ===
 {
  tamperedIntegrityHash: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 1'
    }
  },
  tamperedPrevHash: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 1'
    }
  },
  tamperedTenantPrevHash: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Payload or link integrityHash mismatch in tenant auditEvents at index 1'
    }
  }
}
=== [RAW AC-05] Event Deletion (First/Middle/Last) & Reordering Rejection ===
 {
  deletedMiddle: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Broken tenantPrevHash chain link at tenant index 1: expected 7fc2aa98ac627bcb20f056d48188460a73226e354d8a4ac3a9c73cd9331273f7, got 8f31e5d6b0a15c9a5e81ab86414c07945efdf98abfab7f5fac8fc983e385c928'
    }
  },
  deletedFirst: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Tenant audit event count mismatch against tenantCheckpoint: expected 3, got 2'
    }
  },
  deletedLast: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Broken tenantPrevHash chain link at tenant index 0: expected 0000000000000000000000000000000000000000000000000000000000000000, got 7fc2aa98ac627bcb20f056d48188460a73226e354d8a4ac3a9c73cd9331273f7'
    }
  },
  reorderedEvents: {
    status: 400,
    error: {
      code: 'TAMPERED_AUDIT_CHAIN',
      message: 'Audit chain integrity verification failed: Broken tenantPrevHash chain link at tenant index 0: expected 0000000000000000000000000000000000000000000000000000000000000000, got 7fc2aa98ac627bcb20f056d48188460a73226e354d8a4ac3a9c73cd9331273f7'
    }
  }
}
=== [RAW AC-06] Cross-Tenant Audit Event Injection Rejection (403) ===
 {
  status: 403,
  error: {
    code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
    message: 'Cross-tenant restore forbidden in auditEvents.'
  },
  atomicRollbackIntact: true
}
=== [RAW AC-07] Legacy v1 Backwards Compatibility & Mixed Chain Verification ===
 {
  globalCheck: {
    valid: true,
    checkedCount: 3,
    v1Count: 2,
    v2Count: 1,
    code: 'CHAIN_VALID',
    anchorType: 'GENESIS',
    latestIntegrityHash: 'b303e7af35f6ce08b2a81f6d72410394c0979b5c18e167ff5fd20290e58cc02e'
  },
  tenantCheck: { valid: true, status: 200, code: 'VERIFIED', checkedCount: 3 },
  v1UnmodifiedWithoutSilentRewrite: true,
  v2EventLinkedToV1: {
    id: '9b5db26e-4d8d-47d7-bc1f-968b652a1035',
    schemaVersion: 2,
    prevHash: '3c98348480c1432fbf9c5a89ba97bfef93bd15b009dee5b2a3cb3c0ff1b74a85',
    tenantPrevHash: '3c98348480c1432fbf9c5a89ba97bfef93bd15b009dee5b2a3cb3c0ff1b74a85',
    v1LastIntegrityHash: '3c98348480c1432fbf9c5a89ba97bfef93bd15b009dee5b2a3cb3c0ff1b74a85'
  }
}
=== [RAW AC-08] Safe Snapshot Cleanup & verifyChainIntegrity() ===
 {
  postRestoreVerifyChainIntegrity: {
    valid: true,
    checkedCount: 0,
    code: 'CHAIN_VALID_EMPTY',
    anchorType: 'GENESIS',
    latestIntegrityHash: '0000000000000000000000000000000000000000000000000000000000000000'
  },
  syntheticOrgPresentInMemory: false,
  syntheticAuditEventsCount: 0,
  readAfterDeleteVerified: true
}
=== [RAW AC-09] Retention Window (>2000 Events) & Checkpoint Verification ===
 {
  activeHotWindowLength: 2000,
  globalVerify: {
    valid: true,
    checkedCount: 2000,
    v1Count: 0,
    v2Count: 2000,
    code: 'CHAIN_VALID',
    anchorType: 'RETENTION_CHECKPOINT',
    latestIntegrityHash: '8bc60e74ea57ad41aee187febc759df103083df612a09ad7d6f303f8315797cb'
  },
  checkpointSummary: {
    contractVersion: '1.3.0-p1-3',
    maxHotWindowEvents: 2000,
    totalEvictedCount: 50,
    lastEvictedGlobalSeq: 50,
    lastEvictedIntegrityHash: '4769ca3139e15485583d366057bed045dd5c2418c46857f33a6735093a920d63',
    cumulativeArchiveChainHash: 'c5839cba58d8c0d1ec77fcafc6ce1201948a7ca171d9a026dc8b75338c808bb9',
    tenantCheckpoint: {
      evictedCount: 25,
      evictedTenantEventCount: 25,
      lastEvictedTenantSeq: 25,
      lastEvictedIntegrityHash: '9934449aa67cb0df6924c406b3afcd8ab723ecaaf6552822720e09756b0bf561',
      lastEvictedCreatedAt: '2026-10-27T17:48:54.933Z'
    }
  },
  tenantRestoreStatusAfterEviction: 200,
  globalVerifyAfterRestore: {
    valid: true,
    checkedCount: 2000,
    v1Count: 0,
    v2Count: 2000,
    code: 'CHAIN_VALID',
    anchorType: 'RETENTION_CHECKPOINT',
    latestIntegrityHash: '8bc60e74ea57ad41aee187febc759df103083df612a09ad7d6f303f8315797cb'
  }
}
=== [RAW AC-10] Full Disk Save -> Clear -> Load -> Append Cycle ===
 {
  savedToDisk: true,
  loadedFromDisk: true,
  postLoadVerify: {
    valid: true,
    checkedCount: 3,
    v1Count: 0,
    v2Count: 3,
    code: 'CHAIN_VALID',
    anchorType: 'GENESIS',
    latestIntegrityHash: '89d82ec6a3ef095c3ee0b58699a0391166992071526b7423eecdad847d27e999'
  },
  postAppendVerify: {
    valid: true,
    checkedCount: 4,
    v1Count: 0,
    v2Count: 4,
    code: 'CHAIN_VALID',
    anchorType: 'GENESIS',
    latestIntegrityHash: '8cb82613ebdd5f69596d6149d267f4365dc18ac7985809407645661a39bf9738'
  },
  postReloadEventTenantSeq: 3
}
================================================================================
🏛️ PHASE P.1.3 AUDIT CHAIN INTEGRITY & TENANT BACKUP VERIFIABILITY SUMMARY (10/10 PASSED in 982.1ms)
================================================================================
  ✅ [AC-01] تسجيل أحداث تدقيق متداخلة بين المستأجر المؤقت ومستأجر ثانٍ -> verifyChainIntegrity() ينجح 100%
     -> valid=true, checkedCount=5, v2Count=5, e3.prevHash===e2.hash (global), e3.tenantPrevHash===e1.hash (tenant), Read-After-Delete=true
  ✅ [AC-02] تصدير نسخة احتياطية للمستأجر تحتوي على أحداث متداخلة واستعادتها عبر POST /system/restore تنجح (200 OK)
     -> GET /system/backup=200 (3 interleaved tenant events), POST /system/restore=200 OK, verifyChainIntegrity().valid=true, peerEventsPreserved=2, Read-After-Delete=true
  ✅ [AC-03] التلاعب بحقل داخل حدث تدقيق (action / afterState / timestamp) في نسخة المستأجر -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN دون تغيير الذاكرة أو القرص
     -> actionTamper=400 (TAMPERED_AUDIT_CHAIN), afterStateTamper=400 (TAMPERED_AUDIT_CHAIN), timestampTamper=400 (TAMPERED_AUDIT_CHAIN), diskHashUnchanged=true, Read-After-Delete=true
  ✅ [AC-04] التلاعب بـ integrityHash أو prevHash أو tenantPrevHash في نسخة احتياطية للمستأجر -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN
     -> integrityHash=400 (TAMPERED_AUDIT_CHAIN), prevHash=400 (TAMPERED_AUDIT_CHAIN), tenantPrevHash=400 (TAMPERED_AUDIT_CHAIN), Read-After-Delete=true
  ✅ [AC-05] حذف حدث تدقيق من (بداية / وسط / نهاية) مصفوفة auditEvents أو إعادة ترتيب حدثين -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN
     -> deleteMiddle=400, deleteFirst=400, deleteLast=400, reorder=400 (all TAMPERED_AUDIT_CHAIN), Read-After-Delete=true
  ✅ [AC-06] حقن حدث تدقيق يخص مستأجرًا آخر داخل نسخة احتياطية للمستأجر -> يرفض بـ 403 CROSS_TENANT_RESTORE_FORBIDDEN مع استرجاع ذري كامل
     -> status=403, code=CROSS_TENANT_RESTORE_FORBIDDEN, atomicRollbackIntact=true, Read-After-Delete=true
  ✅ [AC-07] التوافق العكسي: استيراد والتحقق من أحداث تاريخية بصيغة v1 قبل P.1.3 مع أحداث v2 جديدة دون فشل كاذب أو إعادة كتابة صامتة
     -> globalValid=true (v1Count=2, v2Count=1), tenantValid=true, v1ByteIdentical=true, Read-After-Delete=true
  ✅ [AC-08] تنظيف اختبارات آمن: استعادة اللقطة الأصلية عبر restoreSnapshot() تحافظ على verifyChainIntegrity().valid === true مع Read-After-Delete كامل
     -> verifyChainIntegrity()={"valid":true,"checkedCount":0,"code":"CHAIN_VALID_EMPTY","anchorType":"GENESIS","latestIntegrityHash":"0000000000000000000000000000000000000000000000000000000000000000"}, remainingSyntheticEvents=0, Read-After-Delete=true
  ✅ [AC-09] تجاوز حد الاحتفاظ (> 2000 حدث تدقيق) يحافظ على verifyChainIntegrity() واستعادة المستأجر عبر AuditRetentionCheckpoint
     -> logged=2050, hotWindow=2000, totalEvicted=50, anchorHash=4769ca3139e15485..., restoreStatus=200, globalValid=true, Read-After-Delete=true
  ✅ [AC-10] إعادة تشغيل كاملة (saveToDisk -> تفريغ الذاكرة -> loadFromDisk) مع بقاء verifyChainIntegrity().valid === true واستمرار المتتابعة
     -> saveToDisk=true, loadFromDisk=true, postLoadValid=true (3 events), postReloadAppendValid=true, Read-After-Delete=true
  🔒 Post-Suite Global Audit Chain Verification: {"valid":true,"checkedCount":0,"code":"CHAIN_VALID_EMPTY","anchorType":"GENESIS","latestIntegrityHash":"0000000000000000000000000000000000000000000000000000000000000000"}
  🧹 Post-Suite Synthetic Tenant Present (org-p1-3-audit-chain-temp): false
P1_3_EXIT_CODE=0
```

### 9.2 المخرج الخام لتشغيل `timeout 90s npm run test:audit` و `npm run lint` و `npm run build`

```text
  [PHASE P.1.3] 🔗 AUDIT CHAIN INTEGRITY & TENANT BACKUP VERIFIABILITY SUITE (AC-01..AC-10):
  ✅ [AC-01] تسجيل أحداث تدقيق متداخلة بين المستأجر المؤقت ومستأجر ثانٍ -> verifyChainIntegrity() ينجح 100% -> PASS (Read-After-Delete=true)
  ✅ [AC-02] تصدير نسخة احتياطية للمستأجر تحتوي على أحداث متداخلة واستعادتها عبر POST /system/restore تنجح (200 OK) -> PASS (Read-After-Delete=true)
  ✅ [AC-03] التلاعب بحقل داخل حدث تدقيق (action / afterState / timestamp) في نسخة المستأجر -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN دون تغيير الذاكرة أو القرص -> PASS (Read-After-Delete=true)
  ✅ [AC-04] التلاعب بـ integrityHash أو prevHash أو tenantPrevHash في نسخة احتياطية للمستأجر -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN -> PASS (Read-After-Delete=true)
  ✅ [AC-05] حذف حدث تدقيق من (بداية / وسط / نهاية) مصفوفة auditEvents أو إعادة ترتيب حدثين -> يرفض بـ 400 TAMPERED_AUDIT_CHAIN -> PASS (Read-After-Delete=true)
  ✅ [AC-06] حقن حدث تدقيق يخص مستأجرًا آخر داخل نسخة احتياطية للمستأجر -> يرفض بـ 403 CROSS_TENANT_RESTORE_FORBIDDEN مع استرجاع ذري كامل -> PASS (Read-After-Delete=true)
  ✅ [AC-07] التوافق العكسي: استيراد والتحقق من أحداث تاريخية بصيغة v1 قبل P.1.3 مع أحداث v2 جديدة دون فشل كاذب أو إعادة كتابة صامتة -> PASS (Read-After-Delete=true)
  ✅ [AC-08] تنظيف اختبارات آمن: استعادة اللقطة الأصلية عبر restoreSnapshot() تحافظ على verifyChainIntegrity().valid === true مع Read-After-Delete كامل -> PASS (Read-After-Delete=true)
  ✅ [AC-09] تجاوز حد الاحتفاظ (> 2000 حدث تدقيق) يحافظ على verifyChainIntegrity() واستعادة المستأجر عبر AuditRetentionCheckpoint -> PASS (Read-After-Delete=true)
  ✅ [AC-10] إعادة تشغيل كاملة (saveToDisk -> تفريغ الذاكرة -> loadFromDisk) مع بقاء verifyChainIntegrity().valid === true واستمرار المتتابعة -> PASS (Read-After-Delete=true)
  ✅ [AC-11] مراجعة أصالة Checkpoint: رفض التعديل غير المتسق (400) وإثبات قابلية إعادة بناء السلسلة + Checkpoint بالكامل في غياب مفتاح HMAC خارجي -> PASS (Read-After-Delete=true)
  ✅ [P1-3-CHAIN-VERIFY] Post-cleanup AuditLogger.verifyChainIntegrity() verified: {"valid":true,"checkedCount":18,"v1Count":0,"v2Count":18,"code":"CHAIN_VALID","anchorType":"GENESIS","latestIntegrityHash":"915a1fd54c99046c9e01994e06052cc83d40564f4304b00cfe100e4e1f3e536f"}
🎉 ALL PHASE 4 IDENTITY TRUST, ATOMIC STORAGE, FIRESTORE & 150-REQ LOAD TESTS PASSED
EXIT_CODE=0

> tsc --noEmit
LINT_EXIT_CODE=0

> vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs
✓ built in 9.25s
dist/server.cjs  456.6kb
⚡ Done in 73ms
BUILD_EXIT_CODE=0
```

---

## القسم 10 و 11 — جدول جرد الملفات (SHA-256 / الأسطر / الحجم) وقوالب روابط GitHub

### 10.1 جدول الجرد الموحد للملفات المعدّلة والجديدة

| المسار الكامل داخل المستودع | الحالة | SHA-256 (`sha256sum`) | عدد الأسطر (`wc -l`) | الحجم بالبايت (`wc -c`) | النطاق الرئيسي للأسطر |
|---|---|---|---:|---:|---|
| `server/core/types.ts` | معدّل | `2b0f8e15c864bb4c8a200015c13f0c812d0c1c99a9d7317298a3cfb082682eab` | `197` | `4710` | `L175–L196` |
| `server/core/audit.ts` | معدّل | `d26c2d93667dfc1cffd796dd2656b4156a27452d3934b901d06809d58183a87f` | `890` | `30832` | `L53–L890` |
| `server/db/store.ts` | معدّل | `9a7961f9c4333ce5d5ad576ff03021d4507cdc115fff26cfbc0c0ebeb9fd9586` | `1700` | `65902` | `L902–L948`, `L1012–L1045`, `L1190–L1200`, `L1497–L1695` |
| `server/api/router.ts` | معدّل | `911cf198966018c28cf4cbe449005b85a38b3a2e5d02bc2368c9ec9cdc1966ee` | `5040` | `197645` | `L161–L175` |
| `server/test/p1-2-channel-secret-encryption-audit.ts` | معدّل | `29ad971a77afcf4d10e1bb60e84a61e995dfbdda62366c90614beb9d7cc07819` | `1411` | `61174` | `L96`, `L206`, `L1307`, `L1373` |
| `server/test/p1-3-audit-chain-integrity-audit.ts` | جديد | `844a7b51e89ece9d2b5975de11d8634576cf794448eaef5505aa2f8424a6ad60` | `1383` | `57767` | `L1–L1383` |
| `server/test/run-enterprise-audit.ts` | معدّل | `9a6a8e425b151240f10019230c60114beb891c4e9b4defeb553d50a06e9892d7` | `2295` | `109643` | `L37`, `L1645–L1677` |
| `docs/roadmap/OMNIFLOW_AUDIT_CHAIN_ARCHITECTURE_DECISION.md` | جديد | `700e5303f0efe3016f7257782c443ed7c37aa801eb449ef4036ea3628ea3616d` | `82` | `9039` | `L1–L82` |

### 10.2 قوالب الروابط (بانتظار مزامنة المالك `PENDING_OWNER_SYNC_SHA`)

- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/core/types.ts#L175-L196`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/core/audit.ts#L53-L890`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/db/store.ts#L1497-L1695`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/api/router.ts#L161-L175`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/test/p1-2-channel-secret-encryption-audit.ts#L93-L209`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/test/p1-3-audit-chain-integrity-audit.ts#L1-L1130`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/server/test/run-enterprise-audit.ts#L1645-L1677`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/docs/roadmap/OMNIFLOW_AUDIT_CHAIN_ARCHITECTURE_DECISION.md#L1-L82`
- `https://github.com/ahmedsheta89-cell/Call-center/blob/PENDING_OWNER_SYNC_SHA/docs/roadmap/OMNIFLOW_PHASE_P1_3_AUDIT_INTEGRITY_REPORT.md#L1-L345`

### 10.3 أمر التحقق الموحد (بعد المزامنة على GitHub أو محليًا)

```bash
COMMIT_SHA="<ضع_هنا_الـ_SHA_الكامل_بعد_المزامنة>"
git rev-parse --verify "${COMMIT_SHA}^{commit}"
for f in \
  server/core/types.ts \
  server/core/audit.ts \
  server/db/store.ts \
  server/api/router.ts \
  server/test/p1-2-channel-secret-encryption-audit.ts \
  server/test/p1-3-audit-chain-integrity-audit.ts \
  server/test/run-enterprise-audit.ts \
  docs/roadmap/OMNIFLOW_AUDIT_CHAIN_ARCHITECTURE_DECISION.md \
  docs/roadmap/OMNIFLOW_PHASE_P1_3_AUDIT_INTEGRITY_REPORT.md; do
  printf "%s | sha256=%s | lines=%s | bytes=%s\n" \
    "$f" "$(sha256sum "$f" | awk '{print $1}')" "$(wc -l < "$f")" "$(wc -c < "$f")"
done
```
