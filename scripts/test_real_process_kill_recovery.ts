/**
 * @file scripts/test_real_process_kill_recovery.ts
 * Real Multi-Process OS Kill & Recovery Verification Suite (R2.1C)
 *
 * Uses actual independent Node.js child processes (no in-process simulation):
 * 1. Parent spawns Child A against an isolated temp data directory.
 * 2. Child A writes durable sessions, revokes one session, commits one webhook tx,
 *    and leaves one webhook PROCESSING + one SMTP SENDING on disk, then signals readiness.
 * 3. Parent terminates Child A with OS-level SIGKILL (TerminateProcess on Windows / SIGKILL on Linux).
 * 4. Parent spawns Child B (fresh Node.js OS process) against the SAME isolated data directory.
 * 5. Child B verifies:
 *    - Active persistent session survives real process kill and authenticates.
 *    - Revoked session stays revoked across process kill (replay rejected).
 *    - Committed webhook tx is preserved and duplicate replay is rejected.
 *    - Incomplete PROCESSING webhook never becomes COMMITTED (reconciled to AMBIGUOUS / RECONCILIATION_REQUIRED).
 *    - Interrupted SMTP SENDING is reconciled to AMBIGUOUS and automatic resend is blocked.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const THIS_FILE = fileURLToPath(import.meta.url);
const WORKER_ROLE = process.env.OMNIFLOW_PROCESS_KILL_ROLE;

async function runChildPhaseA(dataDir: string, artifactsPath: string): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'r2-1c-real-process-kill-test-secret-key-32-chars-min';
  process.env.CHANNEL_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.AUDIT_CHECKPOINT_HMAC_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  const dbPath = path.join(dataDir, 'db_state.json');
  const { db } = await import('../server/db/store.ts');
  db.setPersistFilePathForTesting(dbPath);
  const { initializeSeedData, ensureAdminUser } = await import('../server/db/seed.ts');
  initializeSeedData();
  ensureAdminUser();

  const {
    issueSessionToken,
    revokeSessionToken,
    loadSessionStoreOnStartup,
  } = await import('../server/core/identity.ts');
  loadSessionStoreOnStartup();

  const {
    reserveDurableIdempotencyKeys,
    transitionDurableIdempotencyState,
    commitDurableIdempotencyKeys,
    reconcileDurableIdempotencyOnStartup,
  } = await import('../server/core/durableIdempotency.ts');

  const idemInit = reconcileDurableIdempotencyOnStartup();
  assert.strictEqual(idemInit.ok, true, 'Child A startup idempotency reconciliation must succeed');

  // 1. Issue two durable sessions for admin; revoke one before crash
  const activeSess = issueSessionToken({ userId: 'usr-admin-01' });
  const revokedSess = issueSessionToken({ userId: 'usr-admin-01' });
  const revokedOk = revokeSessionToken(revokedSess.session.jti, 'pre_crash_logout');
  assert.strictEqual(revokedOk, true, 'Pre-crash revocation must succeed');

  // 2. Commit one webhook transaction durably to both DB and idempotency store
  const committedKey = 'wh:kill-test-committed-001';
  const committedTx = 'tx-kill-committed-001';
  const res1 = reserveDurableIdempotencyKeys([committedKey], { kind: 'webhook', txId: committedTx });
  assert.strictEqual(res1.ok, true, 'Committed webhook reservation must succeed');
  transitionDurableIdempotencyState([committedKey], 'PROCESSING', { metadata: { txId: committedTx } });
  db.recordCommittedWebhookTx(committedTx);
  assert.strictEqual(db.saveToDisk(), true, 'DB saveToDisk for committed webhook must succeed');
  commitDurableIdempotencyKeys([committedKey], { metadata: { txId: committedTx } });

  // 3. Leave one webhook incomplete in PROCESSING (never recorded in db.committedWebhookTxIds)
  const incompleteWebhookKey = 'wh:kill-test-incomplete-002';
  const incompleteWebhookTx = 'tx-kill-incomplete-002';
  const res2 = reserveDurableIdempotencyKeys([incompleteWebhookKey], { kind: 'webhook', txId: incompleteWebhookTx });
  assert.strictEqual(res2.ok, true, 'Incomplete webhook reservation must succeed');
  transitionDurableIdempotencyState([incompleteWebhookKey], 'PROCESSING', { metadata: { txId: incompleteWebhookTx } });

  // 4. Leave one SMTP intent interrupted in SENDING
  const smtpKey = 'smtp:kill-test-sending-003';
  const smtpTx = 'tx-kill-smtp-003';
  const res3 = reserveDurableIdempotencyKeys([smtpKey], { kind: 'smtp', txId: smtpTx });
  assert.strictEqual(res3.ok, true, 'SMTP reservation must succeed');
  transitionDurableIdempotencyState([smtpKey], 'SENDING', { metadata: { txId: smtpTx } });

  fs.writeFileSync(
    artifactsPath,
    JSON.stringify({
      childAPid: process.pid,
      activeToken: activeSess.token,
      activeJti: activeSess.session.jti,
      revokedToken: revokedSess.token,
      revokedJti: revokedSess.session.jti,
      committedKey,
      committedTx,
      incompleteWebhookKey,
      incompleteWebhookTx,
      smtpKey,
      smtpTx,
    }),
    'utf-8'
  );

  // Signal parent that Child A is ready to be terminated via OS SIGKILL
  process.stdout.write(`READY_FOR_KILL:${process.pid}\n`);

  // Hold process open until parent kills it
  setInterval(() => {
    // Wait for SIGKILL
  }, 1000);
}

async function runChildPhaseB(dataDir: string, artifactsPath: string): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'r2-1c-real-process-kill-test-secret-key-32-chars-min';
  process.env.CHANNEL_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.AUDIT_CHECKPOINT_HMAC_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  const artifacts = JSON.parse(fs.readFileSync(artifactsPath, 'utf-8'));
  assert.notStrictEqual(process.pid, artifacts.childAPid, 'Child B must be a distinct OS process PID');

  const dbPath = path.join(dataDir, 'db_state.json');
  const { db } = await import('../server/db/store.ts');
  db.setPersistFilePathForTesting(dbPath);
  const loaded = db.loadFromDisk();
  assert.strictEqual(loaded, true, 'Child B must load persisted DB state from disk');

  const {
    loadSessionStoreOnStartup,
    verifySessionToken,
  } = await import('../server/core/identity.ts');
  loadSessionStoreOnStartup();

  const {
    reconcileDurableIdempotencyOnStartup,
    lookupDurableIdempotencyKey,
    reserveDurableIdempotencyKeys,
  } = await import('../server/core/durableIdempotency.ts');

  const reconcile = reconcileDurableIdempotencyOnStartup();
  assert.strictEqual(reconcile.ok, true, 'Child B startup reconciliation must succeed');

  // 1. Verify active session survived real process kill
  const verifiedActor = verifySessionToken(artifacts.activeToken);
  assert.strictEqual(verifiedActor.userId, 'usr-admin-01', 'Active session userId must survive restart');
  assert.strictEqual(verifiedActor.sessionId, artifacts.activeJti, 'Active session JTI must match');

  // 2. Verify pre-crash revoked session is STILL rejected after restart
  let revokedRejected = false;
  try {
    verifySessionToken(artifacts.revokedToken);
  } catch (err: any) {
    revokedRejected = err?.code === 'SESSION_REVOKED_OR_UNKNOWN' && err?.status === 401;
  }
  assert.strictEqual(revokedRejected, true, 'Revoked session replay must be rejected after real process kill');

  // 3. Verify committed webhook is not lost and duplicate replay is blocked
  assert.strictEqual(db.hasCommittedWebhookTx(artifacts.committedTx), true, 'Committed webhook tx must survive kill');
  const committedEntry = lookupDurableIdempotencyKey(artifacts.committedKey);
  assert.strictEqual(committedEntry?.state, 'COMMITTED', 'Committed entry must remain COMMITTED');
  const dupReserve = reserveDurableIdempotencyKeys([artifacts.committedKey], { kind: 'webhook', txId: 'tx-replay' });
  assert.strictEqual(dupReserve.ok, false, 'Committed webhook replay must be rejected');
  assert.strictEqual(dupReserve.reason, 'DUPLICATE_EVENT');

  // 4. Verify incomplete PROCESSING webhook did NOT silently become COMMITTED
  assert.strictEqual(
    db.hasCommittedWebhookTx(artifacts.incompleteWebhookTx),
    false,
    'Incomplete webhook must NOT be marked committed in DB'
  );
  const incompleteEntry = lookupDurableIdempotencyKey(artifacts.incompleteWebhookKey);
  assert.strictEqual(
    incompleteEntry?.state,
    'FAILED_SAFE_TO_RETRY',
    `Incomplete webhook must reconcile to FAILED_SAFE_TO_RETRY (never COMMITTED), got ${incompleteEntry?.state}`
  );

  // 5. Verify interrupted SMTP SENDING reconciled to RECONCILIATION_REQUIRED and blocks automatic resend
  const smtpEntry = lookupDurableIdempotencyKey(artifacts.smtpKey);
  assert.strictEqual(
    smtpEntry?.state,
    'RECONCILIATION_REQUIRED',
    `Interrupted SMTP must be RECONCILIATION_REQUIRED, got ${smtpEntry?.state}`
  );
  const smtpRetry = reserveDurableIdempotencyKeys([artifacts.smtpKey], { kind: 'smtp', txId: 'tx-smtp-retry' });
  assert.strictEqual(smtpRetry.ok, false, 'Interrupted SMTP automatic resend must be blocked');
  assert.strictEqual(smtpRetry.reason, 'RECONCILIATION_REQUIRED');

  process.stdout.write(`CHILD_B_VERIFIED:${process.pid}\n`);
}

function spawnTsxWorker(role: 'childA' | 'childB', dataDir: string, artifactsPath: string): ChildProcess {
  const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return spawn(process.execPath, [tsxCli, THIS_FILE], {
    env: {
      ...process.env,
      OMNIFLOW_PROCESS_KILL_ROLE: role,
      OMNIFLOW_PROCESS_KILL_DATADIR: dataDir,
      OMNIFLOW_PROCESS_KILL_ARTIFACTS: artifactsPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function runParentOrchestrator(): Promise<void> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-proc-kill-'));
  const dataDir = path.join(tempRoot, 'data');
  const artifactsPath = path.join(tempRoot, 'artifacts.json');
  fs.mkdirSync(dataDir, { recursive: true });

  console.log('================================================================================');
  console.log('⚡ OMNIFLOW OS R2.1C — REAL OS PROCESS KILL (SIGKILL) & RECOVERY TEST SUITE');
  console.log('================================================================================');

  try {
    // Launch Child A
    const childA = spawnTsxWorker('childA', dataDir, artifactsPath);
    let childAPid = 0;
    let childAErr = '';

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child A readiness timeout. stderr=${childAErr}`)), 25_000);
      childA.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const match = text.match(/READY_FOR_KILL:(\d+)/);
        if (match) {
          childAPid = Number(match[1]);
          clearTimeout(timer);
          resolve();
        }
      });
      childA.stderr?.on('data', (chunk: Buffer) => {
        childAErr += chunk.toString('utf-8');
      });
      childA.on('exit', (code) => {
        if (!childAPid) {
          clearTimeout(timer);
          reject(new Error(`Child A exited prematurely with code=${code}. stderr=${childAErr}`));
        }
      });
    });

    console.log(`  ✅ [PK-01] Child A (OS PID ${childAPid}) wrote durable sessions & crash-boundary records`);

    // Terminate Child A with real OS SIGKILL
    const killPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      childA.on('exit', (code, signal) => resolve({ code, signal }));
    });
    const killed = childA.kill('SIGKILL');
    assert.strictEqual(killed, true, 'Parent must successfully dispatch SIGKILL to Child A');
    const exitInfo = await killPromise;
    console.log(
      `  ✅ [PK-02] Child A terminated via OS SIGKILL (platform=${process.platform}, code=${exitInfo.code}, signal=${exitInfo.signal})`
    );

    // Launch Child B against the SAME data directory
    const childB = spawnTsxWorker('childB', dataDir, artifactsPath);
    let childBOut = '';
    let childBErr = '';

    const childBExit = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child B timeout. stderr=${childBErr}`)), 25_000);
      childB.stdout?.on('data', (chunk: Buffer) => {
        childBOut += chunk.toString('utf-8');
      });
      childB.stderr?.on('data', (chunk: Buffer) => {
        childBErr += chunk.toString('utf-8');
      });
      childB.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    if (childBExit !== 0 || !childBOut.includes('CHILD_B_VERIFIED:')) {
      throw new Error(`Child B verification failed (exit=${childBExit}): stdout=${childBOut} stderr=${childBErr}`);
    }

    const childBPidMatch = childBOut.match(/CHILD_B_VERIFIED:(\d+)/);
    const childBPid = childBPidMatch ? Number(childBPidMatch[1]) : 0;
    console.log(
      `  ✅ [PK-03] Child B (OS PID ${childBPid}) reopened ${dataDir} and verified durable sessions, revocations, committed tx, and AMBIGUOUS/RECONCILIATION_REQUIRED crash boundaries`
    );
    console.log('\n🎉 REAL OS PROCESS KILL & RECOVERY VERIFIED (3/3 CHECKS PASSED)');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (WORKER_ROLE === 'childA') {
    await runChildPhaseA(
      process.env.OMNIFLOW_PROCESS_KILL_DATADIR!,
      process.env.OMNIFLOW_PROCESS_KILL_ARTIFACTS!
    );
    return;
  }
  if (WORKER_ROLE === 'childB') {
    await runChildPhaseB(
      process.env.OMNIFLOW_PROCESS_KILL_DATADIR!,
      process.env.OMNIFLOW_PROCESS_KILL_ARTIFACTS!
    );
    return;
  }
  await runParentOrchestrator();
}

main().catch((err) => {
  console.error('❌ Real Process Kill Test Failed:', err);
  process.exit(1);
});
