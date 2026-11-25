import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-ratelimit-cold-'));
const OWNER_MARKER = path.join(TEST_DIR, '.omniflow_test_owner');

function initOwnershipMarker() {
  fs.writeFileSync(
    OWNER_MARKER,
    JSON.stringify({
      tag: 'OMNIFLOW_RATE_LIMIT_TEST_ISOLATION',
      createdBy: 'test_rate_limit_cold_restart.ts',
      pid: process.pid,
      createdAt: new Date().toISOString(),
    }),
    'utf-8'
  );
}

function safeCleanTestDir() {
  if (!fs.existsSync(TEST_DIR)) return;
  if (!fs.existsSync(OWNER_MARKER)) {
    throw new Error(`SECURITY SAFETY ABORT: Missing ownership marker in ${TEST_DIR}`);
  }
  const marker = JSON.parse(fs.readFileSync(OWNER_MARKER, 'utf-8'));
  if (marker.tag !== 'OMNIFLOW_RATE_LIMIT_TEST_ISOLATION') {
    throw new Error(`SECURITY SAFETY ABORT: Invalid ownership marker in ${TEST_DIR}`);
  }
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function sha256Str(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function runChildWorker(mode: string, extraArgs: Record<string, any> = {}): { code: number; stdout: string; stderr: string; data?: any } {
  const workerScript = `
    const {
      recordFailedAttempt,
      checkRateLimit,
      saveRateLimitStateToDisk,
      getRateLimitStorageHealth,
      getLatestKnownGeneration,
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

      if (mode === 'RECORD_N_ATTEMPTS') {
        const key = payload.key;
        const count = payload.count || 4;
        for (let i = 0; i < count; i++) {
          recordFailedAttempt(key, dataDir);
        }
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

      if (mode === 'TRIGGER_CHECKPOINT_WRITE_FAIL') {
        const key = payload.key || 'login:failtest:127.0.0.1';
        recordFailedAttempt(key); // record in memory without triggering pre-load fail on blocked dir
        saveRateLimitStateToDisk(dataDir); // primary writes, then checkpoint fails -> MUST transition to STORAGE_UNWRITABLE
        const health = getRateLimitStorageHealth(dataDir);
        const check = checkRateLimit(key);
        process.stdout.write(JSON.stringify({
          success: true,
          allowed: check.allowed,
          storageDegraded: check.storageDegraded,
          storageHealth: health.health,
        }));
        process.exit(0);
      }

      if (mode === 'COLD_CHECK_RATE_LIMIT') {
        const key = payload.key || 'login:attacker:127.0.0.1';
        const check = checkRateLimit(key, dataDir);
        const health = getRateLimitStorageHealth(dataDir);
        const gen = getLatestKnownGeneration();

        process.stdout.write(JSON.stringify({
          success: true,
          allowed: check.allowed,
          remainingAttempts: check.remainingAttempts,
          storageDegraded: check.storageDegraded,
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

function resetSandboxFiles() {
  for (const f of fs.readdirSync(TEST_DIR)) {
    if (f === '.omniflow_test_owner') continue;
    fs.rmSync(path.join(TEST_DIR, f), { recursive: true, force: true });
  }
}

async function main() {
  console.log('================================================================================');
  console.log('🧪 RATE-LIMIT COLD-RESTART & CHECKPOINT CRYPTO INTEGRITY TEST');
  console.log('================================================================================\n');

  initOwnershipMarker();

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
    // STEP 1: Process 1 Creates Active Lockout and Saves Multi-Gen State + SHA-256 Digests
    // --------------------------------------------------------------------------
    console.log('[Step 1] Launching Process 1 to establish active lockout & SHA-256 checkpoint...');
    const p1 = runChildWorker('CREATE_ACTIVE_LOCKOUT', { key: attackerKey });
    assert(p1.code === 0, 'Process 1 exited cleanly with code 0', p1);
    assert(p1.data?.allowed === false, 'Process 1 locked out attacker (allowed: false)', p1.data);
    assert(p1.data?.generation >= 2, `Process 1 advanced generation to ${p1.data?.generation}`, p1.data);
    assert(fs.existsSync(primaryFile) && fs.existsSync(backupFile) && fs.existsSync(checkpointFile), 'Primary, backup, and checkpoint exist');

    const checkpointContent = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
    const actualPrimaryDigest = sha256Str(fs.readFileSync(primaryFile, 'utf8'));
    const actualBackupDigest = sha256Str(fs.readFileSync(backupFile, 'utf8'));
    assert(checkpointContent.primarySha256 === actualPrimaryDigest, 'Checkpoint primarySha256 matches primary state SHA-256');
    assert(checkpointContent.backupSha256 === actualBackupDigest, 'Checkpoint backupSha256 matches backup state SHA-256');
    assert(checkpointContent.lockedKeys.includes(attackerKey), `Checkpoint recorded active lockout for '${attackerKey}'`);

    // --------------------------------------------------------------------------
    // STEP 2: Forged Primary With Unchanged Generation But Modified Contents
    // --------------------------------------------------------------------------
    console.log('\n[Step 2] Forging primary with UNCHANGED generation but modified contents (resetting attacker lockout)...');
    const savedPrimary = JSON.parse(fs.readFileSync(primaryFile, 'utf8'));
    const savedBackupRaw = fs.readFileSync(backupFile, 'utf8');
    const forgedPrimary = {
      ...savedPrimary,
      generation: checkpointContent.durableGeneration, // valid-looking unchanged generation!
      entries: {}, // forged empty attempts
    };
    fs.writeFileSync(primaryFile, JSON.stringify(forgedPrimary, null, 2));

    const p2 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(p2.code === 0, 'Process 2 executed cleanly', p2);
    assert(p2.data?.allowed === false, 'Forged primary rejected; attacker remains LOCKED OUT', p2.data);
    assert(
      p2.data?.storageHealth === 'CORRUPTED_RECOVERED',
      `Detected primarySha256 mismatch despite unchanged generation and recovered verified backup (health: ${p2.data?.storageHealth})`,
      p2.data
    );

    // --------------------------------------------------------------------------
    // STEP 3: Forged Backup With Permitted Generation But Mismatched Digest
    // --------------------------------------------------------------------------
    console.log('\n[Step 3] Corrupting primary + planting FORGED backup with permitted generation (durableGen - 1) but mismatched digest...');
    const cpAfterStep2 = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
    const forgedPermittedBackup = {
      version: 1,
      generation: cpAfterStep2.durableGeneration - 1, // permitted generation!
      updatedAt: new Date().toISOString(),
      entries: {}, // forged relaxed entries
    };
    fs.writeFileSync(backupFile, JSON.stringify(forgedPermittedBackup, null, 2));
    fs.writeFileSync(primaryFile, '{ corrupt_primary_json:');

    const p3 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(p3.code === 0, 'Process 3 executed cleanly', p3);
    assert(p3.data?.allowed === false, 'Forged backup rejected fail-closed (allowed: false)', p3.data);
    assert(
      p3.data?.storageHealth === 'CORRUPTED_UNRECOVERABLE',
      `Process 3 detected backupSha256 mismatch despite permitted generation (health: ${p3.data?.storageHealth})`,
      p3.data
    );

    // --------------------------------------------------------------------------
    // STEP 4: Prove 4 Failed Attempts Cannot Be Reset To Zero Through Restoration
    // --------------------------------------------------------------------------
    console.log('\n[Step 4] Proving 4 failed attempts cannot be reset to 0 through state restoration...');
    resetSandboxFiles();
    const fourKey = 'login:four_failures:127.0.0.1';
    const p4Setup = runChildWorker('RECORD_N_ATTEMPTS', { key: fourKey, count: 4 });
    assert(p4Setup.code === 0 && p4Setup.data?.remainingAttempts === 1, `Recorded 4 attempts (remaining: ${p4Setup.data?.remainingAttempts})`, p4Setup.data);

    // Trigger one more unrelated write so valid backup has the 4 failed attempts
    runChildWorker('RECORD_N_ATTEMPTS', { key: 'login:unrelated:127.0.0.1', count: 1 });
    const cpFour = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
    const validFourBackupRaw = fs.readFileSync(backupFile, 'utf8');

    // Attempt to restore 4 attempts back to 0 by replacing primary with 0 attempts at same gen
    const forgedFourPrimary = {
      version: 1,
      generation: cpFour.durableGeneration,
      updatedAt: new Date().toISOString(),
      entries: {},
    };
    fs.writeFileSync(primaryFile, JSON.stringify(forgedFourPrimary, null, 2));
    fs.writeFileSync(backupFile, validFourBackupRaw);

    const p4Check = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: fourKey });
    assert(
      p4Check.code === 0 && p4Check.data?.remainingAttempts === 1 && p4Check.data?.allowed === true,
      `After forged restore attempt + cold restart, remainingAttempts stays strictly 1 (never reset to 5) [got remaining=${p4Check.data?.remainingAttempts}]`,
      p4Check.data
    );

    // Also try planting older/tampered backup after wiping primary when 4 attempts recorded -> fails closed (never resets to 5!)
    fs.writeFileSync(primaryFile, '{ truncated');
    fs.writeFileSync(backupFile, JSON.stringify({ version: 1, generation: 1, updatedAt: new Date().toISOString(), entries: {} }));
    const p4TamperCheck = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: fourKey });
    assert(
      p4TamperCheck.data?.allowed === false && p4TamperCheck.data?.remainingAttempts === 0,
      'When backup is tampered after 4 failures, system fails closed with remainingAttempts=0 (never grants 5 fresh attempts)',
      p4TamperCheck.data
    );

    // --------------------------------------------------------------------------
    // STEP 5: Partial / Truncated Checkpoint Write Fail-Closed Survival
    // --------------------------------------------------------------------------
    console.log('\n[Step 5] Testing partial/truncated checkpoint write across cold restart...');
    resetSandboxFiles();
    runChildWorker('CREATE_ACTIVE_LOCKOUT', { key: attackerKey });
    // Simulate partial / truncated checkpoint file write
    fs.writeFileSync(checkpointFile, '{"schemaVersion":1,"durableGeneration":8,"lockedKeys":[');

    const p5 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(
      p5.code === 0 && p5.data?.allowed === false && p5.data?.storageHealth === 'CORRUPTED_UNRECOVERABLE',
      `Partial checkpoint triggers fail-closed CORRUPTED_UNRECOVERABLE keeping attacker locked out (health: ${p5.data?.storageHealth})`,
      p5.data
    );

    // --------------------------------------------------------------------------
    // STEP 6: Checkpoint Persistence Failure Fails Closed (Never Warns-And-Continues)
    // --------------------------------------------------------------------------
    console.log('\n[Step 6] Testing fail-closed handling when checkpoint persistence fails...');
    resetSandboxFiles();
    // Pre-create a directory at checkpointFile path so atomic renameSync over checkpoint fails!
    fs.mkdirSync(checkpointFile);
    const p6 = runChildWorker('TRIGGER_CHECKPOINT_WRITE_FAIL', { key: attackerKey });
    assert(
      p6.code === 0 && p6.data?.storageHealth === 'STORAGE_UNWRITABLE' && p6.data?.allowed === false && p6.data?.storageDegraded === true,
      `Checkpoint write failure immediately fails closed with STORAGE_UNWRITABLE (health: ${p6.data?.storageHealth})`,
      p6.data
    );

    // --------------------------------------------------------------------------
    // STEP 7: Unproven Freshness (Primary & Checkpoint Deleted; Orphaned Backup)
    // --------------------------------------------------------------------------
    console.log('\n[Step 7] Deleting primary and checkpoint; retaining orphaned backup...');
    resetSandboxFiles();
    runChildWorker('CREATE_ACTIVE_LOCKOUT', { key: attackerKey });
    const orphanBak = fs.readFileSync(backupFile, 'utf8');
    fs.unlinkSync(primaryFile);
    fs.unlinkSync(checkpointFile);
    fs.writeFileSync(backupFile, orphanBak);

    const p7 = runChildWorker('COLD_CHECK_RATE_LIMIT', { key: attackerKey });
    assert(
      p7.code === 0 && p7.data?.storageHealth === 'CORRUPTED_UNRECOVERABLE' && p7.data?.allowed === false,
      `Orphaned backup without checkpoint rejected fail-closed (health: ${p7.data?.storageHealth})`,
      p7.data
    );

  } finally {
    safeCleanTestDir();
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
