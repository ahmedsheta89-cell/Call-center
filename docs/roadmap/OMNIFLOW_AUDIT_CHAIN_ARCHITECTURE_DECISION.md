# OmniFlow OS — Audit Chain Architecture Decision Record (ADR-P1-3)
## Versioned Dual-Chain Audit Contract (`v1` Historical + `v2` Global/Tenant Chain) & Retention Checkpoint

---

## 0. Mandatory Capability & Scope Disclosure

1. **Live Shell Execution (`bash` / `npm` / `tsx`)**: **Yes** — Full live shell execution is available inside `/app/applet`.
2. **Live HTTP Server & Route Invocation**: **Yes** — Express HTTP instances can be started and queried over loopback (`127.0.0.1`) during execution.
3. **Local `.git` Repository**: **No** — No `.git` directory exists in `/app/applet`. Raw output of `git status`:
   ```text
   fatal: not a git repository (or any of the parent directories): .git
   GIT_STATUS_EXIT=128
   ```
4. **Synchronous Remote GitHub Commit SHA vs. Read-Only GitHub API**:
   - **No** synchronous local Git linkage exists between `/app/applet` and `github.com/ahmedsheta89-cell/Call-center`.
   - Querying the public GitHub REST API only returns the latest commit already pushed to the remote branch (reference `HEAD` prior to syncing Phase P.1.3 changes: `9a5eae44e022ac1ac8c6513f31dd804aa79b8619`). Any files created or modified in this workspace require an explicit sync/push by the repository owner before a remote commit SHA exists for them (`PENDING_OWNER_SYNC_SHA`).

---

## 1. Problem Statement & Baseline Forensic Evidence

Prior to Phase P.1.3, the audit trail in `server/core/audit.ts` maintained a single global in-memory array (`inMemoryStore`) where each event linked only to `this.inMemoryStore[0]?.integrityHash || '0'.repeat(64)` (`prevHash`). This created four structural integrity gaps:

1. **Interleaved Multi-Tenant Chain Conflict on Tenant Export/Restore**:
   - In `server/core/audit.ts` (`log()` and `verifyChainIntegrity()`), `prevHash` pointed to the immediately preceding event in the **global** store regardless of `organizationId`.
   - In `server/db/store.ts` (`exportTenantBackup(orgId)`), `AuditLogger.exportAllEvents().filter((e) => e.organizationId === orgId)` exported only that tenant's subset of events.
   - When two tenants (`Tenant A` and `Tenant B`) logged events interleaved (`A1 -> B1 -> A2`), `A2.prevHash` equaled `B1.integrityHash`. Exporting `Tenant A`'s backup produced `[A2, A1]`, where `A2.prevHash !== A1.integrityHash`.
   - Previously, `server/api/router.ts` (`POST /api/v1/system/restore`) called `AuditLogger.verifyChainIntegrity(payload.auditEvents)` directly on the tenant subset, which failed with `400 TAMPERED_AUDIT_CHAIN` on legitimate interleaved tenant backups, while `server/db/store.ts` (`importFullBackupDetailed`) skipped audit verification altogether when `scopeOrgId` was set (`if (!scopeOrgId && data.auditEvents.length > 0)`).
2. **Destructive Test Cleanup via `.filter(...)`**:
   - In `server/test/p1-2-channel-secret-encryption-audit.ts`, test cleanup called `AuditLogger.importEvents(AuditLogger.exportAllEvents().filter((e) => e.organizationId !== P1_2_TEST_ORG_ID ...))`. Removing synthetic tenant events from the middle or head of the global chain left subsequent events with dangling `prevHash` pointers.
3. **Unanchored 2000-Event Eviction Window (`maxRetentionLimit = 2000`)**:
   - When `this.inMemoryStore.length > 2000`, `this.inMemoryStore.pop()` evicted the oldest event (#1), leaving event #2 at the tail with `prevHash = hash(#1)` instead of `AUDIT_GENESIS_HASH`, without recording a cryptographic eviction checkpoint anchor.
4. **Silent Re-Hashing Prohibition**:
   - Silently re-computing hashes or rewriting `prevHash` on historical events during export, restore, or test cleanup would destroy cryptographic non-repudiation and mask genuine tampering.

---

## 2. Architectural Options Comparison

| Criterion | Option 1: Per-Tenant Chain Only (`tenantPrevHash` replaces `prevHash`) | Option 2: Dual-Chain (`prevHash` + `tenantPrevHash`) without Schema Versioning | Option 3 (Selected): Versioned Dual-Chain Contract (`schemaVersion: 2`) + `AuditRetentionCheckpoint` (`1.3.0-p1-3`) |
|---|---|---|---|
| **Global Cross-Tenant Ordering Proof** | **Lost** — Cannot detect cross-tenant event reordering or global log truncation across the server instance. | **Preserved** — Global `prevHash` and `globalSeq` bind total instance ordering. | **Preserved** — Global `prevHash` + monotonic `globalSeq` bind total instance ordering. |
| **Tenant-Scoped Backup Verifiability (`GET /system/backup` -> `POST /system/restore`)** | **Supported** — Tenant subset is contiguous per tenant. | **Supported for new events**, but breaks on historical `v1` events that lack `tenantPrevHash`. | **Fully Supported** — `verifyTenantBackupIntegrity()` verifies `(tenantPrevHash, tenantSeq, integrityHash)` and `TenantAuditCheckpoint` across interleaved events. |
| **Backwards Compatibility with Historical `v1` Events** | **Broken** — Requires rewriting historical `prevHash` or rejecting existing `v1` logs. | **Fragile** — Ambiguous hash canonicalization when `schemaVersion` is absent. | **100% Non-Destructive** — `computeEventHash()` and `verifyChainIntegrity()` preserve exact `v1` canonical hashing when `schemaVersion !== 2` without rewriting historical events. |
| **Retention Window (`> 2000` Events) Verifiability** | **Broken** — Evicting event #1 breaks the oldest remaining event's link unless anchored. | **Broken** — No formal anchor for evicted global or tenant events. | **Cryptographically Anchored** — `AuditRetentionCheckpoint` records `lastEvictedGlobalSeq`, `lastEvictedIntegrityHash`, `cumulativeArchiveChainHash`, and per-tenant `tenantCheckpoints`. |
| **Tamper Detection (Payload, Hash Pointers, Deletion of First/Middle/Last, Reordering, Foreign Tenant Injection)** | Detects per-tenant links only; misses tail truncation without a checkpoint. | Misses first/last deletion in tenant backup unless anchored by a tenant checkpoint. | **Complete Detection** — Rejects payload/hash/link/sequence tampering (`400 TAMPERED_AUDIT_CHAIN`), first/middle/last deletion (`400`), and foreign tenant injection (`403 CROSS_TENANT_RESTORE_FORBIDDEN`). |

---

## 3. Selected Architecture: Versioned Dual-Chain Audit Contract (`v2`) + Retention Checkpoint (`1.3.0-p1-3`)

### 3.1 Event Schema (`AuditEvent` in `server/core/types.ts`)
- **Legacy `v1` (`schemaVersion` omitted or `1`)**:
  - Verified using the exact historical canonical payload (`id`, `organizationId`, `actorId`, `actorType`, `action`, `entityType`, `entityId`, `beforeState`, `afterState`, `prevHash`, `createdAt`).
  - Never silently mutated or re-hashed.
- **Version `v2` (`schemaVersion: 2`)**:
  - Adds:
    - `schemaVersion: 2`
    - `globalSeq: number` (monotonic 1-based global sequence across the instance)
    - `prevHash: string` (64-hex SHA-256 of the immediately preceding global event, or `AUDIT_GENESIS_HASH` / `lastEvictedIntegrityHash`)
    - `tenantSeq: number` (monotonic 1-based sequence within `organizationId`)
    - `tenantPrevHash: string` (64-hex SHA-256 of the immediately preceding event for the same `organizationId`, or `AUDIT_GENESIS_HASH` / tenant `lastEvictedIntegrityHash`)
  - Canonical `v2` SHA-256 `integrityHash` covers all payload fields plus `(schemaVersion, globalSeq, prevHash, tenantSeq, tenantPrevHash, createdAt)`.

### 3.2 Safe Test Cleanup via Snapshot Capture/Restore (`AuditLogger.captureSnapshot` / `restoreSnapshot`)
- Filtering `AuditLogger` events by `organizationId` during test cleanup is strictly prohibited.
- Test suites capture an immutable `AuditSnapshotState` (`events` + `checkpoint`) via `AuditLogger.captureSnapshot()` prior to running synthetic tenant tests and restore it atomically via `AuditLogger.restoreSnapshot(snapshot)` inside `finally`, which immediately runs `AuditLogger.verifyChainIntegrity()` and returns its verification result.

### 3.3 Retention & Archival Policy (`maxRetentionLimit = 2000`)
- **Hot Operational Window**: Up to `2000` newest events are retained in memory and persisted in `db_state.json`.
- **Cryptographic Eviction Anchor (`AuditRetentionCheckpoint`)**:
  - Whenever an event is evicted from the tail of the 2000-event window, `recordEvictedEventInCheckpoint()` updates:
    - `totalEvictedCount`
    - `lastEvictedGlobalSeq`
    - `lastEvictedIntegrityHash`
    - `lastEvictedCreatedAt`
    - `cumulativeArchiveChainHash = SHA256(prevCumulativeHash + ":" + evicted.integrityHash)`
    - `tenantCheckpoints[organizationId]` (`evictedCount`, `lastEvictedTenantSeq`, `lastEvictedIntegrityHash`, `lastEvictedCreatedAt`)
  - Both `verifyChainIntegrity()` and `verifyTenantBackupIntegrity()` anchor the oldest retained event against the checkpoint when `evictedCount > 0`.
- **Future Cold Storage Archival Cutover Contract (PostgreSQL `audit_events` + Cold Object Archive)**:
  - In the upcoming PostgreSQL persistence cutover phase, evicted batches from the hot window will be flushed transactionally to the append-only PostgreSQL `audit_events` table alongside the `cumulativeArchiveChainHash` checkpoint prior to eviction from memory.
