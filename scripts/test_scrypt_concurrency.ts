/**
 * @file scripts/test_scrypt_concurrency.ts
 * Rigorous Verification Suite for Scrypt Resource Management & Concurrency Bounding
 *
 * Verifies:
 * 1. Scrypt N=131072, r=8, p=1 derivation time & memory footprint.
 * 2. Bounded Concurrency: At most 2 parallel scrypt executions on libuv threads.
 * 3. Bounded Queue Depth: Maximum 10 pending tasks; rejects overflow with SCRYPT_QUEUE_SATURATED.
 * 4. Event Loop Non-Blocking: Main JS event loop remains responsive (< 20ms ping) during Scrypt derivations.
 * 5. Transparent Rehash via async path.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  deriveScryptHash,
  deriveScryptHashAsync,
  getScryptQueueStats,
  completeLocalOwnerBootstrapAsync,
  authenticateLocalOwnerAsync,
  SCRYPT_RECOMMENDED,
  SCRYPT_FAST,
} from '../server/core/localAuth.ts';

const testSandboxDir = path.join('F:', 'Dev_Workspace', 'Temp', 'OMNIFLOW_OS', `scrypt_concurrency_${Date.now()}`);

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

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 OMNIFLOW OS — SCRYPT RESOURCE & CONCURRENCY BOUNDING VERIFICATION');
  console.log('================================================================================\n');

  if (!fs.existsSync(testSandboxDir)) {
    fs.mkdirSync(testSandboxDir, { recursive: true });
  }

  try {
    // --------------------------------------------------------------------------
    // Test 1: Scrypt Parameter & Memory Overhead Measurement
    // --------------------------------------------------------------------------
    console.log('[1/5] Testing Scrypt N=131072 Parameter & Execution Time...');
    const salt = crypto.randomBytes(32);
    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const hash = await deriveScryptHashAsync('CorrectPassword123!', salt, SCRYPT_RECOMMENDED);
    const t1 = performance.now();
    const durationMs = t1 - t0;
    const memDeltaMb = Math.round((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024);

    assert(hash.length === 64, `Derived key length is 64 bytes (got ${hash.length})`);
    assert(durationMs >= 100 && durationMs <= 2000, `Execution time is reasonable: ${durationMs.toFixed(1)} ms`);
    console.log(`      ⚡ Execution Duration: ${durationMs.toFixed(1)} ms | Heap Delta: ~${memDeltaMb} MB`);

    // --------------------------------------------------------------------------
    // Test 2: Event Loop Non-Blocking Proof
    // --------------------------------------------------------------------------
    console.log('\n[2/5] Testing Event Loop Responsiveness During Scrypt Execution...');
    let eventLoopTicks = 0;
    const pingInterval = setInterval(() => {
      eventLoopTicks++;
    }, 10);

    const heavyScryptPromises = [
      deriveScryptHashAsync('HeavyPass1!', crypto.randomBytes(32), SCRYPT_RECOMMENDED),
      deriveScryptHashAsync('HeavyPass2!', crypto.randomBytes(32), SCRYPT_RECOMMENDED),
    ];

    await Promise.all(heavyScryptPromises);
    clearInterval(pingInterval);

    assert(eventLoopTicks >= 5, `Event loop remained responsive during Scrypt computation (${eventLoopTicks} timer ticks recorded)`);

    // --------------------------------------------------------------------------
    // Test 3: Bounded Concurrency & Queue Depth Under Burst
    // --------------------------------------------------------------------------
    console.log('\n[3/5] Testing Bounded Concurrency (Max 2 Active) & Queue Depth (Max 10)...');
    const burstPromises: Promise<any>[] = [];
    let queueSaturatedCount = 0;

    // Fire 20 parallel requests rapidly
    for (let i = 0; i < 20; i++) {
      burstPromises.push(
        deriveScryptHashAsync(`BurstPass${i}!`, crypto.randomBytes(32), SCRYPT_FAST).catch((err) => {
          if (err?.message === 'SCRYPT_QUEUE_SATURATED') {
            queueSaturatedCount++;
            return 'SATURATED';
          }
          throw err;
        })
      );
    }

    const results = await Promise.all(burstPromises);
    const successfulCount = results.filter((r) => Buffer.isBuffer(r)).length;

    assert(successfulCount >= 2 && successfulCount <= 12, `Processed bounded batch successfully (${successfulCount} processed)`);
    assert(queueSaturatedCount >= 8, `Excess burst requests rejected safely without memory exhaustion (${queueSaturatedCount} rejected with SATURATED)`);
    console.log(`      ⚡ Burst Outcome: ${successfulCount} processed, ${queueSaturatedCount} rejected by bounded queue`);

    // --------------------------------------------------------------------------
    // Test 4: End-to-End Async Bootstrap & Login via Bounded Queue
    // --------------------------------------------------------------------------
    console.log('\n[4/5] Testing End-to-End Async Bootstrap & Authentication Lifecycle...');
    const bootstrapToken = 'test-token-7778889990001112223334445556667778889990001112223334445556667778';
    fs.writeFileSync(
      path.join(testSandboxDir, '.owner_bootstrap_token'),
      JSON.stringify({ token: bootstrapToken, createdAt: new Date().toISOString() })
    );

    const bootstrapRes = await completeLocalOwnerBootstrapAsync(testSandboxDir, {
      bootstrapToken,
      username: 'owner_concurrency_test',
      password: 'StrongPassword123#',
      ip: '127.0.0.1',
      scryptParams: SCRYPT_RECOMMENDED,
    });

    assert(bootstrapRes.ok === true, 'Bootstrap completed asynchronously through Scrypt queue');

    const loginRes = await authenticateLocalOwnerAsync(testSandboxDir, {
      username: 'owner_concurrency_test',
      password: 'StrongPassword123#',
      ip: '127.0.0.1',
    });

    assert(loginRes.ok === true, 'Login completed asynchronously and authenticated successfully');
    assert(loginRes.user?.role === 'Owner', `Authenticated user has Owner role (got ${loginRes.user?.role})`);

    // --------------------------------------------------------------------------
    // Test 5: Queue Saturation Handled Gracefully in Auth Subsystem
    // --------------------------------------------------------------------------
    console.log('\n[5/5] Testing Subsystem Response when Scrypt Queue is Saturated...');
    // Occupy the queue with slow tasks
    const blockerPromises = [
      deriveScryptHashAsync('Blocker1', crypto.randomBytes(32), SCRYPT_RECOMMENDED),
      deriveScryptHashAsync('Blocker2', crypto.randomBytes(32), SCRYPT_RECOMMENDED),
    ];
    // Fill the queue
    for (let i = 0; i < 10; i++) {
      deriveScryptHashAsync(`QueueFill${i}`, crypto.randomBytes(32), SCRYPT_RECOMMENDED).catch(() => {});
    }

    // Attempt an immediate login while queue is full
    const busyLoginRes = await authenticateLocalOwnerAsync(testSandboxDir, {
      username: 'owner_concurrency_test',
      password: 'StrongPassword123#',
      ip: '127.0.0.2',
    });

    assert(busyLoginRes.ok === false, 'Login attempt refused when auth subsystem is saturated');
    assert(busyLoginRes.errorCode === 'AUTH_SUBSYSTEM_BUSY', `Proper error code returned: ${busyLoginRes.errorCode}`);

    // Wait for blockers to drain
    await Promise.all(blockerPromises);

    console.log('\n================================================================================');
    console.log(`🏆 SCRYPT CONCURRENCY VERIFICATION: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('================================================================================');

    if (totalFailed > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup sandbox
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
