/**
 * @file scripts/test_rate_limiting_deep.ts
 * Deep Independent Verification Suite for Persistent Rate Limiting
 */

process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
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
  getLatestKnownGeneration,
  setLatestKnownGenerationForTesting,
} from '../server/core/localAuth.ts';

const sandboxDir = path.join('F:', 'Dev_Workspace', 'Temp', 'OMNIFLOW_OS', `rate_limit_deep_${Date.now()}`);

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    totalPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    totalFailed++;
  }
}

async function runDeepTests() {
  console.log('================================================================================');
  console.log('🛡️ OMNIFLOW OS — DEEP PERSISTENT RATE LIMITING VERIFICATION SUITE');
  console.log('================================================================================\n');

  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
  }

  try {
    // --------------------------------------------------------------------------
    // Scenario 1: Known vs Unknown Account Isolation
    // --------------------------------------------------------------------------
    console.log('[1/8] Scenario 1: Known vs Unknown Account Lockout Isolation...');
    clearAllRateLimits(sandboxDir);
    const knownKey = 'login:owner:127.0.0.1';
    const unknownKey = 'login:attacker_fake_user:127.0.0.1';

    // 5 failed attempts on unknownKey
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(unknownKey, sandboxDir);
    }

    const unknownCheck = checkRateLimit(unknownKey, sandboxDir);
    const knownCheck = checkRateLimit(knownKey, sandboxDir);

    assert(unknownCheck.allowed === false, 'Unknown account key is locked after 5 failed attempts');
    assert(knownCheck.allowed === true, 'Known account key (owner) remains ALLOWED and is not locked out by unknown user brute force');
    assert(knownCheck.remainingAttempts === 5, `Known account has full 5 attempts remaining (got ${knownCheck.remainingAttempts})`);

    // --------------------------------------------------------------------------
    // Scenario 2: Concurrent Attempt Writes & Race Condition Immunity
    // --------------------------------------------------------------------------
    console.log('\n[2/8] Scenario 2: Concurrent Attempt Writes & Atomic State...');
    clearAllRateLimits(sandboxDir);
    const concurrentKey = 'login:test_concurrency:127.0.0.1';

    // Fire 5 writes concurrently
    const writePromises = Array.from({ length: 5 }, (_, idx) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          recordFailedAttempt(concurrentKey, sandboxDir);
          resolve();
        }, idx * 2);
      });
    });

    await Promise.all(writePromises);

    const concurrentCheck = checkRateLimit(concurrentKey, sandboxDir);
    assert(concurrentCheck.allowed === false, 'Concurrent writes registered and triggered block');

    const stateFile = getRateLimitFilePath(sandboxDir);
    assert(fs.existsSync(stateFile), 'Rate limit state file exists on disk');
    const diskContent = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert(diskContent.entries[concurrentKey].attempts >= 5, `Disk reflects >= 5 attempts (actual: ${diskContent.entries[concurrentKey].attempts})`);

    // --------------------------------------------------------------------------
    // Scenario 3: Repeated Cold Restarts
    // --------------------------------------------------------------------------
    console.log('\n[3/8] Scenario 3: Repeated Cold Restarts & State Persistence...');
    // We already have concurrentKey locked on disk.
    // Simulate Restart 1
    clearAllRateLimits(); // clears RAM only (no disk arg)
    let postRestartCheck = checkRateLimit(concurrentKey, sandboxDir);
    assert(postRestartCheck.allowed === false, 'Cold Restart 1: Lockout preserved from disk state');

    // Simulate Restart 2
    clearAllRateLimits();
    postRestartCheck = checkRateLimit(concurrentKey, sandboxDir);
    assert(postRestartCheck.allowed === false, 'Cold Restart 2: Lockout still preserved after second simulated restart');

    // --------------------------------------------------------------------------
    // Scenario 4: Corrupted State File Detection, Quarantine & Fail-Secure Recovery
    // --------------------------------------------------------------------------
    console.log('\n[4/8] Scenario 4: Corrupted State File Quarantine & Recovery...');
    clearAllRateLimits(sandboxDir);
    resetRateLimitStorageHealth('HEALTHY');

    // First create a valid state with a backup
    const backupFile = getRateLimitBackupFilePath(sandboxDir);
    recordFailedAttempt('login:recovery_test:127.0.0.1', sandboxDir);
    saveRateLimitStateToDisk(sandboxDir);
    // Second save syncs backup
    recordFailedAttempt('login:recovery_test:127.0.0.1', sandboxDir);
    saveRateLimitStateToDisk(sandboxDir);

    // Corrupt primary state file
    clearAllRateLimits(); // Clear RAM
    fs.writeFileSync(stateFile, '{ corrupt_json: [invalid_syntax !!!');

    // Reading should not crash, should quarantine corrupt file, and restore from .bak
    let didCrash = false;
    try {
      loadRateLimitStateFromDisk(sandboxDir);
    } catch {
      didCrash = true;
    }
    assert(!didCrash, 'Corrupted JSON handled safely without throwing unhandled exception');

    const health = getRateLimitStorageHealth(sandboxDir);
    assert(health.health === 'CORRUPTED_RECOVERED', `Corrupted primary restored from backup (status: ${health.health})`);
    assert(health.corruptFilesCount >= 1, 'Corrupt file safely quarantined to .corrupt.<timestamp>');

    const recoveryCheck = checkRateLimit('login:recovery_test:127.0.0.1', sandboxDir);
    assert(
      recoveryCheck.remainingAttempts <= 3,
      `Restored state retains recorded failed attempts (remaining: ${recoveryCheck.remainingAttempts})`
    );

    // --------------------------------------------------------------------------
    // Scenario 5: Unwritable Storage Graceful Fallback (Fail-Secure)
    // --------------------------------------------------------------------------
    console.log('\n[5/8] Scenario 5: Unwritable Storage Fail-Secure Protection...');
    clearAllRateLimits(sandboxDir);
    resetRateLimitStorageHealth('STORAGE_UNWRITABLE');

    let fallbackCrashed = false;
    try {
      const res = checkRateLimit('login:fallback:127.0.0.1');
      assert(res.allowed === false, 'Rate limiter fails secure when storage is marked unwritable');
      assert(res.storageDegraded === true, 'storageDegraded flag set to trigger AUTH_SUBSYSTEM_UNAVAILABLE');
    } catch {
      fallbackCrashed = true;
    }
    assert(!fallbackCrashed, 'Unwritable storage handled without crashing server');
    resetRateLimitStorageHealth('HEALTHY');

    // --------------------------------------------------------------------------
    // Scenario 6: Expiry & Timed Unlock Verification
    // --------------------------------------------------------------------------
    console.log('\n[6/11] Scenario 6: Expiry & Timed Unlock Verification...');
    clearAllRateLimits(sandboxDir);
    setLatestKnownGenerationForTesting(0);
    const expiredKey = 'login:expired_account:127.0.0.1';

    // Inject entry with expired timestamp (blockedUntil in past)
    const now = Date.now();
    const expiredPayload = {
      version: 1,
      generation: 1,
      updatedAt: new Date().toISOString(),
      entries: {
        [expiredKey]: {
          attempts: 5,
          firstAttemptAt: now - 30 * 60 * 1000, // 30 mins ago
          blockedUntil: now - 15 * 60 * 1000,   // expired 15 mins ago
        },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(expiredPayload));

    clearAllRateLimits(); // Clear memory
    const expiredCheck = checkRateLimit(expiredKey, sandboxDir);
    assert(expiredCheck.allowed === true, 'Expired lockout automatically unlocks and allows access');
    assert(expiredCheck.remainingAttempts === 5, 'Allowed attempts reset after expiry window passed');

    // --------------------------------------------------------------------------
    // Scenario 7: Clock Skew Resilience (Forward & Backward)
    // --------------------------------------------------------------------------
    console.log('\n[7/11] Scenario 7: Clock Skew Resilience (Time Jumps)...');
    clearAllRateLimits(sandboxDir);
    setLatestKnownGenerationForTesting(0);
    const skewKey = 'login:clock_skew:127.0.0.1';

    // Time in future (e.g. system clock jumped 1 year into future and then back)
    const futurePayload = {
      version: 1,
      generation: 1,
      updatedAt: new Date().toISOString(),
      entries: {
        [skewKey]: {
          attempts: 5,
          firstAttemptAt: now + 365 * 24 * 3600 * 1000,
          blockedUntil: now + 365 * 24 * 3600 * 1000,
        },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(futurePayload));

    clearAllRateLimits();
    loadRateLimitStateFromDisk(sandboxDir);

    // Verify it normalized rather than locking for 1 year
    const skewCheck = checkRateLimit(skewKey);
    assert(
      skewCheck.allowed === false && skewCheck.retryAfterSec! <= 15 * 60,
      `Future time skew clamped to at most 15 minutes (retryAfterSec: ${skewCheck.retryAfterSec})`
    );

    // --------------------------------------------------------------------------
    // Scenario 8: Permanent Lockout Prevention
    // --------------------------------------------------------------------------
    console.log('\n[8/11] Scenario 8: Permanent Lockout Prevention...');
    clearAllRateLimits(sandboxDir);
    const ownerKey = 'login:owner:127.0.0.1';

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(ownerKey, sandboxDir);
    }
    const lockedRes = checkRateLimit(ownerKey, sandboxDir);
    assert(lockedRes.allowed === false, 'Owner locked on 5 failures');
    assert(lockedRes.retryAfterSec! <= 900, `Lockout strictly duration-bounded (retryAfterSec <= 900, got ${lockedRes.retryAfterSec})`);

    // Resetting rate limit works immediately
    resetRateLimit(ownerKey, sandboxDir);
    const unlockedRes = checkRateLimit(ownerKey, sandboxDir);
    assert(unlockedRes.allowed === true, 'Owner lockout cleared immediately via resetRateLimit');

    // --------------------------------------------------------------------------
    // Scenario 9: Anti-Rollback Protection with Stale Backup
    // --------------------------------------------------------------------------
    console.log('\n[9/11] Scenario 9: Anti-Rollback Gate / Stale Backup Rejection...');
    clearAllRateLimits(sandboxDir);
    resetRateLimitStorageHealth('HEALTHY');

    // Write a stale backup at generation 5
    const staleBackupPayload = {
      version: 1,
      generation: 5,
      updatedAt: new Date().toISOString(),
      entries: {
        'login:attacker:127.0.0.1': { attempts: 1, firstAttemptAt: Date.now(), blockedUntil: 0 },
      },
    };
    fs.writeFileSync(backupFile, JSON.stringify(staleBackupPayload));
    // Corrupt primary
    fs.writeFileSync(stateFile, '{ corrupt_primary_json: true');

    // Simulate in-memory latest known generation having reached 10 (gap > 1)
    setLatestKnownGenerationForTesting(10);

    // Load must reject stale backup and fail closed with CORRUPTED_UNRECOVERABLE
    loadRateLimitStateFromDisk(sandboxDir);

    const staleHealth = getRateLimitStorageHealth(sandboxDir);
    assert(
      staleHealth.health === 'CORRUPTED_UNRECOVERABLE',
      `Stale backup rejected fail-closed to prevent rollback (health: ${staleHealth.health})`
    );

    // --------------------------------------------------------------------------
    // Scenario 10: Attacker Receives Zero Extra Attempts Post-Recovery
    // --------------------------------------------------------------------------
    console.log('\n[10/11] Scenario 10: Zero Extra Attempts Granted Post-Recovery...');
    clearAllRateLimits(sandboxDir);
    resetRateLimitStorageHealth('HEALTHY');
    setLatestKnownGenerationForTesting(0);

    const attackerKey = 'login:brute_force_attacker:127.0.0.1';
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(attackerKey, sandboxDir);
    }
    saveRateLimitStateToDisk(sandboxDir);

    // Corrupt primary but keep fresh backup
    clearAllRateLimits();
    fs.writeFileSync(stateFile, '{ truncated:');
    loadRateLimitStateFromDisk(sandboxDir);

    const postRecoveryCheck = checkRateLimit(attackerKey, sandboxDir);
    assert(
      postRecoveryCheck.allowed === false,
      'Locked attacker remains locked after recovery from backup'
    );
    assert(
      postRecoveryCheck.remainingAttempts === 0,
      `Zero attempts granted post-recovery (remainingAttempts: ${postRecoveryCheck.remainingAttempts})`
    );

    // --------------------------------------------------------------------------
    // Scenario 11: Fail-Secure Behavior Under Backup Replication Failure
    // --------------------------------------------------------------------------
    console.log('\n[11/11] Scenario 11: Fail-Secure on Backup Write/Replication Failure...');
    clearAllRateLimits(sandboxDir);
    resetRateLimitStorageHealth('HEALTHY');
    setLatestKnownGenerationForTesting(0);

    // Create an initial state file on disk so that filePath exists
    recordFailedAttempt('login:unwritable_test:127.0.0.1', sandboxDir);
    saveRateLimitStateToDisk(sandboxDir);

    // Now replace backup file path with a directory to force copyFileSync failure on next write
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    fs.mkdirSync(backupFile); // Directory prevents copyFileSync to backup file path

    let caughtError = false;
    try {
      recordFailedAttempt('login:unwritable_test:127.0.0.1', sandboxDir);
    } catch {
      caughtError = true;
    }
    // Storage health should reflect STORAGE_UNWRITABLE
    const unwritableHealth = getRateLimitStorageHealth(sandboxDir);
    assert(
      unwritableHealth.health === 'STORAGE_UNWRITABLE',
      `Storage transitions to STORAGE_UNWRITABLE when backup replication fails (health: ${unwritableHealth.health})`
    );

    // Clean up directory so subsequent runs are clean
    fs.rmdirSync(backupFile);
    resetRateLimitStorageHealth('HEALTHY');

    console.log('\n================================================================================');
    console.log(`🏆 DEEP RATE LIMITING VERIFICATION: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('================================================================================');

    if (totalFailed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runDeepTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
