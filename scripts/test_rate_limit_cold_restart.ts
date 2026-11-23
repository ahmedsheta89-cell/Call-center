import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const TEST_DIR = path.resolve(process.cwd(), 'data-test-ratelimit-cold-start');

function runChildWorker(mode: string, extraArgs: Record<string, any> = {}): { code: number; stdout: string; stderr: string; data?: any } {
  const workerScript = `
    const path = require('path');
    const fs = require('fs');
    process.env.NODE_ENV = 'test';
    process.env.OMNIFLOW_TEST_MODE = '1';

    // Register tsx / typescript loader if needed, or require compiled / tsx loader
    const {
      recordFailedAttempt,
      checkRateLimit,
      saveRateLimitStateToDisk,
      loadRateLimitStateFromDisk,
      getRateLimitStorageHealth,
      getRateLimitFilePath,
      getRateLimitBackupFilePath,
      getRateLimitCheckpointFilePath,
      getLatestKnownGeneration,
      resetRateLimitStorageHealth,
    } = require('./server/core/localAuth');

    const dataDir = process.env.DATA_DIR;
    const mode = process.env.WORKER_MODE;
    const payload = process.env.WORKER_PAYLOAD ? JSON.parse(process.env.WORKER_PAYLOAD) : {};

    try {
      if (mode === 'CREATE_ACTIVE_LOCKOUT') {
        const key = payload.key || 'login:attacker:127.0.0.1';
        for (let i = 0; i < 5; i++) {
          recordFailedAttempt(key, dataDir);
        }
        saveRateLimitStateToDisk(dataDir);
        // Advance generation once more to establish genuine multi-generation backup
        recordFailedAttempt('login:other_user:127.0.0.1', dataDir);
        saveRateLimitStateToDisk(dataDir);

        const check = checkRateLimit(key, dataDir);
        const health = getRateLimitStorageHealth(dataDir);
        const gen = getLatestKnownGeneration();

        process.stdout.write(JSON.stringify({
          success: true,
          allowed: check.allowed,
          remainingAttempts: check.remainingAttempts,
          storageHealth: health.health,
          generation: gen,
        }));
        process.exit(0);
      }

      if (mode === 'COLD_CHECK_RATE_LIMIT') {
        const key = payload.key || 'login:attacker:127.0.0.1';
        // Cold start: do not call load explicitly, checkRateLimit loads on demand
        const check = checkRateLimit(key, dataDir);
        const health = getRateLimitStorageHealth(dataDir);
        const gen = getLatestKnownGeneration();

        process.stdout.write(JSON.stringify({
          success: true,
          allowed: check.allowed,
          remainingAttempts: check.remainingAttempts,
          storageHealth: health.health,
          generation: gen,
        }));
        process.exit(0);
      }

      throw new Error('Unknown mode: ' + mode);
    } catch (err) {
      process.stderr.write(err.stack || err.message);
      process.exit(1);
    }
  `;

  const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
  const res = spawnSync(process.execPath, [tsxCli, '-e', workerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: TEST_DIR,
      WORKER_MODE: mode,
      WORKER_PAYLOAD: JSON.stringify(extraArgs),
      NODE_ENV: 'test',
      OMNIFLOW_TEST_MODE: '1',
    },
    encoding: 'utf8',
  });

  let data: any = null;
  if (res.stdout) {
    try {
      data = JSON.parse(res.stdout);
    } catch {}
  }

  return {
    code: res.status ?? -1,
    stdout: res.stdout,
    stderr: res.stderr,
    data,
  };
}

async function main() {
  console.log('================================================================================');
  console.log('🧪 RATE-LIMIT COLD-RESTART & DURABLE FRESHNESS TEST');
  console.log('================================================================================\n');

  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const primaryFile = path.join(TEST_DIR, '.rate_limit_state.json');
  const backupFile = path.join(TEST_DIR, '.rate_limit_state.json.bak');
  const checkpointFile = path.join(TEST_DIR, '.rate_limit_checkpoint.json');
  const attackerKey = 'login:attacker:127.0.0.1';

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string, details?: any) {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      if (details) console.error('     Details:', details);
      failed++;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // STEP 1: Process 1 Creates Active Lockout and Saves Multi-Gen State
    // --------------------------------------------------------------------------
    console.log('[Step 1] Launching separate Process 1 to establish active lockout...');
    const p1 = runChildWorker('CREATE_ACTIVE_LOCKOUT', { key: attackerKey });
    assert(p1.code === 0, 'Process 1 exited cleanly with code 0', p1);
    assert(p1.data?.allowed === false, 'Process 1 locked out attacker (allowed: false)', p1.data);
    assert(p1.data?.generation >= 2, `Process 1 advanced generation to ${p1.data?.generation}`, p1.data);
    assert(fs.existsSync(primaryFile), 'Primary state file exists on disk');
    assert(fs.existsSync(backupFile), 'Backup state file exists on disk');
    assert(fs.existsSync(checkpointFile), 'Durable checkpoint file exists on disk');

    const checkpointContent = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
    assert(
      checkpointContent.lockedKeys.includes(attackerKey),
      `Checkpoint recorded active lockout for '${attackerKey}'`,
      checkpointContent
    );

    // --------------------------------------------------------------------------
    // STEP 2: Cold Process 2 - Corrupted Primary with Stale Backup Rejection
    // --------------------------------------------------------------------------
    console.log('\n[Step 2] Corrupting primary while planting an artificially stale backup...');
    // Plant an ancient backup from generation 1 when attacker had 0 attempts
    const ancientStaleBackup = {
      version: 1,
      generation: 1,
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      entries: {},
    };
    fs.writeFileSync(backupFile, JSON.stringify(ancientStaleBackup));
    // Corrupt primary state file
    fs.writeFileSync(primaryFile, '{ corrupt_primary_invalid_json:');

    console.log('Launching separate Process 2 (cold start, zero in-memory state)...');
    const p2 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(p2.code === 0, 'Process 2 executed cleanly', p2);
    assert(p2.data?.allowed === false, 'Process 2 REFUSED attacker access fail-closed (allowed: false)', p2.data);
    assert(
      p2.data?.storageHealth === 'CORRUPTED_UNRECOVERABLE',
      `Process 2 detected stale backup across cold restart and failed closed (health: ${p2.data?.storageHealth})`,
      p2.data
    );

    // --------------------------------------------------------------------------
    // STEP 3: Cold Process 3 - Recovery from Genuinely Valid Recent Backup
    // --------------------------------------------------------------------------
    console.log('\n[Step 3] Restoring genuinely valid recent backup (gen = durableGeneration - 1)...');
    // Ensure primary is corrupted, but backup is the legitimate generation (checkpoint.durableGeneration - 1)
    const validRecentGen = checkpointContent.durableGeneration - 1;
    const validRecentBackup = {
      version: 1,
      generation: validRecentGen,
      updatedAt: new Date().toISOString(),
      entries: {
        [attackerKey]: { attempts: 5, firstAttemptAt: Date.now() - 1000, blockedUntil: Date.now() + 900000 },
      },
    };
    fs.writeFileSync(backupFile, JSON.stringify(validRecentBackup));
    fs.writeFileSync(primaryFile, '{ invalid_truncated_json:');

    console.log('Launching separate Process 3 (cold start, zero in-memory state)...');
    const p3 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(p3.code === 0, 'Process 3 executed cleanly', p3);
    assert(
      p3.data?.storageHealth === 'CORRUPTED_RECOVERED',
      `Process 3 recovered restrictive state from verified fresh backup (health: ${p3.data?.storageHealth})`,
      p3.data
    );
    assert(
      p3.data?.allowed === false,
      'Attacker remains STRICTLY LOCKED OUT post-recovery (anti-relaxation preserved)',
      p3.data
    );

    // --------------------------------------------------------------------------
    // STEP 4: Cold Process 4 - Unproven Freshness (Primary & Checkpoint Deleted)
    // --------------------------------------------------------------------------
    console.log('\n[Step 4] Deleting both primary and checkpoint; retaining orphaned backup...');
    if (fs.existsSync(primaryFile)) fs.unlinkSync(primaryFile);
    if (fs.existsSync(checkpointFile)) fs.unlinkSync(checkpointFile);
    // Retain only backup
    fs.writeFileSync(backupFile, JSON.stringify(validRecentBackup));

    console.log('Launching separate Process 4 (cold start, zero in-memory state)...');
    const p4 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(p4.code === 0, 'Process 4 executed cleanly', p4);
    assert(
      p4.data?.storageHealth === 'CORRUPTED_UNRECOVERABLE',
      `Process 4 failed closed when freshness could not be proven across cold restart (health: ${p4.data?.storageHealth})`,
      p4.data
    );
    assert(p4.data?.allowed === false, 'Attacker request rejected fail-closed (allowed: false)', p4.data);

  } finally {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 RATE-LIMIT COLD RESTART RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
