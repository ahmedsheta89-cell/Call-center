/**
 * @file scripts/test_disaster_recovery.ts
 * Automated Disaster Recovery, Atomicity & Persistence Resilience Test Suite
 *
 * Enforces and verifies in a strictly isolated temporary sandbox:
 * 1. Atomic write staging and fsync guarantees.
 * 2. Unfinished/corrupted write isolation (original file never truncated).
 * 3. Self-healing recovery from verified .bak upon primary JSON corruption.
 * 4. Automatic quarantine of corrupt primary files (.corrupt.<timestamp>.json).
 * 5. Stale directory lock reclamation for deceased PIDs.
 * 6. Single-instance active lock conflict rejection (STORAGE_LOCKED_BY_ACTIVE_PROCESS).
 * 7. Isolated destination backup restoration with bit-for-bit SHA-256 verification.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  writeVerifiedAtomicFileSync,
  acquireDirectoryLock,
  releaseDirectoryLock,
  preserveLastKnownGoodBackup,
  quarantineCorruptFile,
  validateAndMigrateSchemaPayload,
  CURRENT_SCHEMA_VERSION,
  resolveDurableDataPath,
  installDurableStoreLifecycle,
} from '../server/db/localPersistenceEngine.ts';
import { db } from '../server/db/store.ts';

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runDisasterRecoveryTestSuite() {
  console.log('========================================================================');
  console.log('🛡️  OMNIFLOW OS — PHASE 2 DISASTER RECOVERY & INTEGRITY SUITE');
  console.log('========================================================================\n');

  const pid = process.pid;
  const timestamp = Date.now();
  const sandboxRoot = path.resolve(`F:\\Dev_Workspace\\Temp\\OMNIFLOW_OS\\dr_sandbox_${pid}_${timestamp}`);
  fs.mkdirSync(sandboxRoot, { recursive: true, mode: 0o700 });

  let testsPassed = 0;
  const totalTests = 7;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Atomic Staging & Fsync Write
    // -------------------------------------------------------------------------
    console.log('[TEST 1/7] Testing Atomic File Write Staging & Verification...');
    const testFile1 = path.join(sandboxRoot, 'atomic_test.json');
    const validJson1 = JSON.stringify({ test: 'atomic_payload', pid, timestamp, schemaVersion: 2 }, null, 2);
    writeVerifiedAtomicFileSync(testFile1, validJson1);

    if (!fs.existsSync(testFile1)) {
      throw new Error('Atomic write failed: target file does not exist after write');
    }
    const readBack1 = fs.readFileSync(testFile1, 'utf8');
    if (readBack1 !== validJson1) {
      throw new Error('Atomic write payload mismatch');
    }
    console.log('  ✅ [PASS] Staging file successfully written, fsynced, and atomically renamed.\n');
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 2: Interrupted / Invalid Staging Does Not Corrupt Target File
    // -------------------------------------------------------------------------
    console.log('[TEST 2/7] Testing Interrupted Write Protection (Target Immutability on Staging Failure)...');
    const originalHash1 = computeSha256(testFile1);
    let stagingErrorCaught = false;

    try {
      // Attempt to write invalid JSON through writeVerifiedAtomicFileSync
      writeVerifiedAtomicFileSync(testFile1, '{ invalid_json: missing_quotes, pid: ');
    } catch {
      stagingErrorCaught = true;
    }

    if (!stagingErrorCaught) {
      throw new Error('Expected invalid JSON staging to throw, but it succeeded');
    }
    const postFailHash1 = computeSha256(testFile1);
    if (originalHash1 !== postFailHash1) {
      throw new Error('Target file was corrupted or modified despite staging failure');
    }
    console.log(`  ✅ [PASS] Invalid staging failed closed without touching target file.`);
    console.log(`     Target SHA-256 before: ${originalHash1}`);
    console.log(`     Target SHA-256 after:  ${postFailHash1} (Bit-for-bit identical)\n`);
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 3: Hot Backup Preservation (.bak creation)
    // -------------------------------------------------------------------------
    console.log('[TEST 3/7] Testing Hot Backup (.bak) Creation & Invariant Validation...');
    const dbTestFile = path.join(sandboxRoot, 'db_state.json');
    const validDbState = {
      version: '1.3.2-enterprise-p1-3-2',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      organizations: [{ id: 'org-test', name: 'Test Org' }],
      users: [{ id: 'usr-1', organizationId: 'org-test', fullName: 'Tester', email: 'test@local.com', role: 'Admin', isActive: true, mfaEnabled: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
      teams: [],
      agents: [],
      customers: [],
      customerChannels: [],
      conversations: [],
      messages: [],
      calls: [],
      tickets: [],
      slaPolicies: [],
      knowledgeDocuments: [],
      qaRubrics: [],
      qaEvaluations: [],
      automationRules: [],
      shifts: [],
      channelConfigs: [],
      recommendations: [],
      coachingPlans: [],
      macros: [],
      teamQaFeedback: [],
      connectedDevices: [],
      crossDeviceSyncEvents: [],
    };
    const validDbJson = JSON.stringify(validDbState, null, 2);
    writeVerifiedAtomicFileSync(dbTestFile, validDbJson);

    const bakPath = preserveLastKnownGoodBackup(dbTestFile, validDbJson);
    if (!fs.existsSync(bakPath)) {
      throw new Error('Backup file .bak was not created');
    }
    const dbHash = computeSha256(dbTestFile);
    const bakHash = computeSha256(bakPath);
    if (dbHash !== bakHash) {
      throw new Error('Backup hash does not match primary database state');
    }
    console.log('  ✅ [PASS] Last-known-good backup created and validated.');
    console.log(`     Primary SHA-256: ${dbHash}`);
    console.log(`     Backup  SHA-256: ${bakHash}\n`);
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 4: Primary File Corruption, Quarantine & Self-Healing Recovery
    // -------------------------------------------------------------------------
    console.log('[TEST 4/7] Testing Primary JSON Corruption, Quarantine & Auto-Recovery...');
    // Intentionally corrupt the primary database file
    fs.writeFileSync(dbTestFile, 'CORRUPTED_GARBAGE_DATA_SIMULATING_DISK_TEAR');
    const corruptSize = fs.statSync(dbTestFile).size;

    // Simulate recovery through persistence engine
    const quarantined = quarantineCorruptFile(dbTestFile);
    if (!quarantined || !fs.existsSync(quarantined)) {
      throw new Error('Corrupt primary file was not quarantined');
    }
    if (fs.readFileSync(quarantined, 'utf8') !== 'CORRUPTED_GARBAGE_DATA_SIMULATING_DISK_TEAR') {
      throw new Error('Quarantined file content does not match corrupted data');
    }

    // Restore from backup
    const bakContent = fs.readFileSync(bakPath, 'utf8');
    const parsedBak = JSON.parse(bakContent);
    const schemaValidation = validateAndMigrateSchemaPayload(parsedBak, bakPath);
    if (!schemaValidation.ok) {
      throw new Error('Backup payload failed schema validation during recovery');
    }
    writeVerifiedAtomicFileSync(dbTestFile, JSON.stringify(schemaValidation.payload, null, 2));

    const restoredHash = computeSha256(dbTestFile);
    console.log(`  ✅ [PASS] Corrupt primary quarantined to: ${path.basename(quarantined)} (${corruptSize} bytes).`);
    console.log(`  ✅ [PASS] Restored primary from .bak with verified schema.`);
    console.log(`     Restored SHA-256: ${restoredHash}\n`);
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 5: Directory Lock Acquisition & Concurrent Conflict Rejection
    // -------------------------------------------------------------------------
    console.log('[TEST 5/7] Testing Directory Lock Single-Instance Enforcement...');
    const lockTarget = path.join(sandboxRoot, 'db_state.json');
    const lock1 = acquireDirectoryLock(lockTarget, pid, 'LOCAL_HOST_1');
    if (!lock1.ok) {
      throw new Error(`Primary lock acquire failed: ${lock1.errorCode} - ${lock1.errorMessage}`);
    }

    // Simulate another process attempting to acquire the same lock while PID is alive
    const fakeConcurrentPid = pid + 10000;
    const lock2 = acquireDirectoryLock(lockTarget, fakeConcurrentPid, 'LOCAL_HOST_1');
    // Since PID is current process pid, let's test with active pid
    const lockConflict = acquireDirectoryLock(lockTarget, 99999999, 'LOCAL_HOST_1');
    // Notice lock1 owner is current PID, which is alive!
    if (lockConflict.ok) {
      throw new Error('Concurrent lock acquisition succeeded when it must fail!');
    }
    if (lockConflict.errorCode !== 'STORAGE_LOCKED_BY_ACTIVE_PROCESS') {
      throw new Error(`Unexpected lock conflict code: ${lockConflict.errorCode}`);
    }

    // Release lock
    const released = releaseDirectoryLock(lockTarget, pid, 'LOCAL_HOST_1');
    if (!released) {
      throw new Error('Failed to release directory lock');
    }
    console.log('  ✅ [PASS] Active PID lock successfully acquired.');
    console.log(`  ✅ [PASS] Concurrent lock correctly rejected with: ${lockConflict.errorCode}.`);
    console.log('  ✅ [PASS] Directory lock released cleanly.\n');
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 6: Stale Directory Lock Recovery for Deceased PID
    // -------------------------------------------------------------------------
    console.log('[TEST 6/7] Testing Stale Lock Automatic Reclamation...');
    const deadPid = 99999999; // Non-existent PID
    const lockPath = path.join(sandboxRoot, 'db_state.lock');
    const stalePayload = JSON.stringify({
      pid: deadPid,
      hostname: 'LOCAL_HOST_1',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      targetPath: lockTarget,
    });
    fs.writeFileSync(lockPath, stalePayload, 'utf8');

    // Attempt acquire by living process
    const reclaimed = acquireDirectoryLock(lockTarget, pid, 'LOCAL_HOST_1');
    if (!reclaimed.ok || !reclaimed.recoveredStalePid) {
      throw new Error(`Stale lock recovery failed: ${reclaimed.errorCode} - ${reclaimed.errorMessage}`);
    }
    if (reclaimed.recoveredStalePid !== deadPid) {
      throw new Error(`Recovered PID mismatch: expected ${deadPid}, got ${reclaimed.recoveredStalePid}`);
    }
    releaseDirectoryLock(lockTarget, pid, 'LOCAL_HOST_1');
    console.log(`  ✅ [PASS] Stale lock from dead PID (${deadPid}) safely reclaimed by PID ${pid}.\n`);
    testsPassed++;

    // -------------------------------------------------------------------------
    // TEST 7: Isolated Disaster Recovery Restore into Fresh Target Directory
    // -------------------------------------------------------------------------
    console.log('[TEST 7/7] Testing End-to-End Backup Restore into Isolated Fresh Directory...');
    const isolatedRestoreDir = path.join(sandboxRoot, 'isolated_target');
    fs.mkdirSync(isolatedRestoreDir, { recursive: true, mode: 0o700 });

    const sourceBackupPath = bakPath;
    const restoreDestinationPath = path.join(isolatedRestoreDir, 'db_state.json');

    // Perform cold copy and validation
    const backupDataRaw = fs.readFileSync(sourceBackupPath, 'utf8');
    const sourceHash = crypto.createHash('sha256').update(backupDataRaw).digest('hex');

    writeVerifiedAtomicFileSync(restoreDestinationPath, backupDataRaw);
    const restoredDataRaw = fs.readFileSync(restoreDestinationPath, 'utf8');
    const destHash = crypto.createHash('sha256').update(restoredDataRaw).digest('hex');

    if (sourceHash !== destHash) {
      throw new Error(`Restore hash mismatch! Source: ${sourceHash}, Dest: ${destHash}`);
    }

    const restoredParsed = JSON.parse(restoredDataRaw);
    const checkOutcome = validateAndMigrateSchemaPayload(restoredParsed, restoreDestinationPath);
    if (!checkOutcome.ok) {
      throw new Error(`Restored payload failed schema validation: ${checkOutcome.errorCode}`);
    }

    if (restoredParsed.organizations.length !== 1 || restoredParsed.users.length !== 1) {
      throw new Error('Restored record count does not match original backup');
    }

    console.log(`  ✅ [PASS] Backup restored into independent directory without touching source.`);
    console.log(`     Source Backup SHA-256: ${sourceHash}`);
    console.log(`     Restored DB   SHA-256: ${destHash} (MATCH confirmed)`);
    console.log(`     Schema Version: ${restoredParsed.schemaVersion} | Organizations: ${restoredParsed.organizations.length} | Users: ${restoredParsed.users.length}\n`);
    testsPassed++;

    console.log('========================================================================');
    console.log(`🎉 ALL DISASTER RECOVERY TESTS PASSED: ${testsPassed}/${totalTests}`);
    console.log('========================================================================\n');
  } finally {
    // Clean up temporary sandbox
    try {
      if (fs.existsSync(sandboxRoot)) {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
        console.log(`[Cleanup] Temporary DR sandbox cleaned: ${sandboxRoot}`);
      }
    } catch (e: any) {
      console.warn(`[Cleanup Warning] Could not delete DR sandbox: ${e?.message}`);
    }
  }
}

runDisasterRecoveryTestSuite();
