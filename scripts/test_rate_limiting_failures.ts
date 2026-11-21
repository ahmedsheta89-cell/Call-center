/**
 * @file scripts/test_rate_limiting_failures.ts
 * Enterprise Test Suite: Rate Limiting Fail-Secure Storage Integrity & Recovery
 */

process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  clearAllRateLimits,
  loadRateLimitStateFromDisk,
  saveRateLimitStateToDisk,
  getRateLimitFilePath,
  getRateLimitBackupFilePath,
  getRateLimitStorageHealth,
  resetRateLimitStorageHealth,
  isRateLimitStorageHealthy,
  authenticateLocalOwner,
  deriveScryptHashAsync,
  scryptController,
  SCRYPT_FAST,
} from '../server/core/localAuth.ts';

const testDir = path.join('F:', 'Dev_Workspace', 'Temp', 'OMNIFLOW_OS', `rate_limit_fail_${Date.now()}`);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runFailureSuite() {
  console.log('================================================================================');
  console.log('🛡️ OMNIFLOW OS — RATE LIMITING FAIL-SECURE & RECOVERY TEST HARNESS');
  console.log('================================================================================\n');

  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
  }

  const primaryFile = getRateLimitFilePath(testDir);
  const backupFile = getRateLimitBackupFilePath(testDir);

  try {
    // --------------------------------------------------------------------------
    // Test 1: Clean Baseline & Automatic Backup Generation
    // --------------------------------------------------------------------------
    console.log('[Test 1] Clean Baseline & Atomic Backup Synchronization...');
    clearAllRateLimits(testDir);
    resetRateLimitStorageHealth('HEALTHY');

    const testKey1 = 'login:test_admin:127.0.0.1';
    recordFailedAttempt(testKey1, testDir);
    saveRateLimitStateToDisk(testDir);

    assert(fs.existsSync(primaryFile), 'Primary state file exists after save');
    // Save again to trigger backup replication
    recordFailedAttempt(testKey1, testDir);
    saveRateLimitStateToDisk(testDir);

    assert(fs.existsSync(backupFile), 'Backup file (.bak) automatically replicated on update');
    const health1 = getRateLimitStorageHealth(testDir);
    assert(health1.health === 'HEALTHY', `Initial health is HEALTHY (got: ${health1.health})`);
    assert(isRateLimitStorageHealthy(), 'isRateLimitStorageHealthy returns true for HEALTHY');

    // --------------------------------------------------------------------------
    // Test 2: Corrupted Primary File Quarantine & Backup Recovery
    // --------------------------------------------------------------------------
    console.log('\n[Test 2] Corrupt State Quarantine & Automatic .bak Recovery...');
    // Lock the account (5 attempts) so backup contains a locked account
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(testKey1, testDir);
    }
    saveRateLimitStateToDisk(testDir); // Primary and backup now contain locked state

    // Intentionally corrupt the primary state file
    clearAllRateLimits(); // clear memory to simulate cold restart
    fs.writeFileSync(primaryFile, '{"version": 1, "entries": INVALID_JSON_TRUNCATED...');

    loadRateLimitStateFromDisk(testDir);

    const health2 = getRateLimitStorageHealth(testDir);
    assert(health2.health === 'CORRUPTED_RECOVERED', `Health transitioned to CORRUPTED_RECOVERED (got: ${health2.health})`);
    assert(health2.corruptFilesCount >= 1, `Corrupt file quarantined to .corrupt.* (count: ${health2.corruptFilesCount})`);
    assert(isRateLimitStorageHealthy(), 'isRateLimitStorageHealthy returns true for CORRUPTED_RECOVERED');

    // Verify restrictive state was restored from backup and NOT lost
    const checkAfterRecovery = checkRateLimit(testKey1, testDir);
    assert(
      !checkAfterRecovery.allowed,
      'Restored state preserves restrictive lockout from backup (attacker cannot bypass lock via file corruption)'
    );

    // --------------------------------------------------------------------------
    // Test 3: Unrecoverable Corruption (Both Primary and Backup Corrupted)
    // --------------------------------------------------------------------------
    console.log('\n[Test 3] Unrecoverable Corruption & Fail-Secure Authentication Halt...');
    clearAllRateLimits();
    resetRateLimitStorageHealth('HEALTHY');

    // Corrupt primary and backup
    fs.writeFileSync(primaryFile, 'CORRUPT_PRIMARY');
    fs.writeFileSync(backupFile, 'CORRUPT_BACKUP');

    loadRateLimitStateFromDisk(testDir);

    const health3 = getRateLimitStorageHealth(testDir);
    assert(health3.health === 'CORRUPTED_UNRECOVERABLE', `Health transitioned to CORRUPTED_UNRECOVERABLE (got: ${health3.health})`);
    assert(!isRateLimitStorageHealthy(), 'isRateLimitStorageHealthy returns false for CORRUPTED_UNRECOVERABLE');

    // Rate limiter must return allowed: false with storageDegraded: true
    const checkUnrecoverable = checkRateLimit('login:any_user:127.0.0.1', testDir);
    assert(
      !checkUnrecoverable.allowed && checkUnrecoverable.storageDegraded === true,
      'checkRateLimit blocks operations fail-secure when storage is unrecoverably corrupted'
    );

    // Authentication attempt must reject with AUTH_SUBSYSTEM_UNAVAILABLE
    const authOutcome = authenticateLocalOwner(testDir, {
      username: 'owner',
      password: 'AnyPassword123!',
      ip: '127.0.0.1',
    });
    assert(
      !authOutcome.ok && authOutcome.errorCode === 'AUTH_SUBSYSTEM_UNAVAILABLE',
      `authenticateLocalOwner halts with AUTH_SUBSYSTEM_UNAVAILABLE (got: ${authOutcome.errorCode})`
    );

    // --------------------------------------------------------------------------
    // Test 4: Unwritable Storage & Fail-Secure Protection
    // --------------------------------------------------------------------------
    console.log('\n[Test 4] Unwritable Storage & Fail-Secure Protection...');
    clearAllRateLimits();
    resetRateLimitStorageHealth('STORAGE_UNWRITABLE');

    const checkUnwritable = checkRateLimit('login:test:127.0.0.1');
    assert(
      !checkUnwritable.allowed && checkUnwritable.storageDegraded === true,
      'Storage unwritable status prevents unmonitored authentication in memory'
    );

    const authUnwritable = authenticateLocalOwner(testDir, {
      username: 'owner',
      password: 'AnyPassword123!',
      ip: '127.0.0.1',
    });
    assert(
      !authUnwritable.ok && authUnwritable.errorCode === 'AUTH_SUBSYSTEM_UNAVAILABLE',
      'authenticateLocalOwner rejects login during unwritable storage'
    );

    // --------------------------------------------------------------------------
    // Test 5: Scrypt Concurrency & Finally Slot Release Under Errors
    // --------------------------------------------------------------------------
    console.log('\n[Test 5] Scrypt Concurrency & Finally Block Slot Release...');
    const initialStats = scryptController.getStats();
    assert(initialStats.activeCount === 0, `Initial active scrypt count is 0 (got: ${initialStats.activeCount})`);

    // Fire 2 successful fast scrypt jobs
    const salt = crypto.randomBytes(32);
    const p1 = deriveScryptHashAsync('Password123!', salt, SCRYPT_FAST);
    const p2 = deriveScryptHashAsync('Password123!', salt, SCRYPT_FAST);

    await Promise.all([p1, p2]);

    const postSuccessStats = scryptController.getStats();
    assert(postSuccessStats.activeCount === 0, 'Active slots decremented to 0 after concurrent completion');

    // Trigger error in scrypt derivation (invalid parameters) to verify finally block executes
    let slotReleasedOnError = false;
    try {
      // Invalid N (not power of 2) triggers native error
      await deriveScryptHashAsync('TestPassword!', salt, { N: 1234, r: 8, p: 1, keyLen: 64 });
    } catch {
      slotReleasedOnError = scryptController.getStats().activeCount === 0;
    }
    assert(slotReleasedOnError, 'Scrypt activeCount slot released inside finally block upon error');

    // --------------------------------------------------------------------------
    // Test 6: Stale Tmp File Pruning
    // --------------------------------------------------------------------------
    console.log('\n[Test 6] Stale Tmp File Pruning & Atomic Write Cleanup...');
    clearAllRateLimits(testDir);
    resetRateLimitStorageHealth('HEALTHY');

    // Create a fake stale .tmp file with mtime in the past
    const staleTmp = `${primaryFile}.12345.${Date.now() - 120000}.stale.tmp`;
    fs.writeFileSync(staleTmp, 'STALE_TMP_CONTENT');
    const pastTime = new Date(Date.now() - 120000);
    fs.utimesSync(staleTmp, pastTime, pastTime);

    assert(fs.existsSync(staleTmp), 'Stale tmp file created on disk');

    // Saving state triggers cleanupStaleTmpFiles
    recordFailedAttempt('login:test_clean:127.0.0.1', testDir);
    saveRateLimitStateToDisk(testDir);

    assert(!fs.existsSync(staleTmp), 'Stale tmp file (>60s) automatically cleaned up on state save');

    console.log('\n================================================================================');
    console.log(`🏆 RATE LIMITING FAIL-SECURE SUITE: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

runFailureSuite().catch((err) => {
  console.error('Fatal test error in failure suite:', err);
  process.exit(1);
});
