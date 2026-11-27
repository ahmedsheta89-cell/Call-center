import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

const CLEAN_DIR = process.env.OMNIFLOW_CLEAN_TEST_DIR || (process.platform === 'win32'
  ? path.resolve('F:\\Dev_Workspace\\Temp\\OMNIFLOW_OS\\test_clean_release_run')
  : path.resolve(os.tmpdir(), 'omniflow_clean_release_test'));
const PORT = 3198;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function waitForServerHealthy(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        const body: any = await res.json();
        if (body.status === 'healthy') return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  console.log('================================================================================');
  console.log('🧪 CLEAN ISOLATED RELEASE INSTALLATION & PERSISTENCE TEST');
  console.log('================================================================================\n');

  if (fs.existsSync(CLEAN_DIR)) {
    fs.rmSync(CLEAN_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(CLEAN_DIR, { recursive: true });

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

  let serverProc: any = null;

  try {
    // --------------------------------------------------------------------------
    // 1. Setup Isolated Clean Directory (NO node_modules)
    // --------------------------------------------------------------------------
    console.log('[Step 1] Setting up clean release directory with zero node_modules...');
    const releaseDistServer = path.resolve('dist-server', 'server.cjs');
    const releaseDist = path.resolve('dist');

    if (!fs.existsSync(releaseDistServer) || !fs.existsSync(releaseDist)) {
      throw new Error('Build artifacts missing. Run npm run build first.');
    }

    fs.mkdirSync(path.join(CLEAN_DIR, 'dist-server'), { recursive: true });
    fs.copyFileSync(releaseDistServer, path.join(CLEAN_DIR, 'dist-server', 'server.cjs'));
    copyRecursive(releaseDist, path.join(CLEAN_DIR, 'dist'));

    // Assert that no node_modules exist in clean directory
    assert(
      !fs.existsSync(path.join(CLEAN_DIR, 'node_modules')),
      'Clean directory contains ZERO node_modules (independent runtime verification)'
    );

    // --------------------------------------------------------------------------
    // 2. Generate First-Run Production Security Keys in .env
    // --------------------------------------------------------------------------
    console.log('[Step 2] Executing first-run security key provisioning...');
    const crypto = await import('crypto');
    const sessionSecret = crypto.randomBytes(32).toString('hex');
    const channelKey = crypto.randomBytes(32).toString('hex');
    const auditKey = crypto.randomBytes(32).toString('hex');
    const cleanDataDir = path.join(CLEAN_DIR, 'data');

    const envContent = [
      'NODE_ENV=production',
      `PORT=${PORT}`,
      'HOST=127.0.0.1',
      `DATA_DIR=${cleanDataDir}`,
      `SESSION_SECRET=${sessionSecret}`,
      `CHANNEL_SECRET_ENCRYPTION_KEY=${channelKey}`,
      `AUDIT_CHECKPOINT_HMAC_KEY=${auditKey}`,
      'AUDIT_CHECKPOINT_HMAC_KEY_ID=audit-hmac-v1',
      '',
    ].join('\r\n');

    fs.writeFileSync(path.join(CLEAN_DIR, '.env'), envContent, { encoding: 'utf8', mode: 0o600 });
    assert(fs.existsSync(path.join(CLEAN_DIR, '.env')), 'Generated production .env with CSPRNG keys');

    // --------------------------------------------------------------------------
    // 3. First Boot (Zero Preexisting Application Data)
    // --------------------------------------------------------------------------
    console.log('[Step 3] Launching standalone server for First Boot...');
    assert(!fs.existsSync(cleanDataDir), 'Data directory does not exist prior to first boot');

    serverProc = spawn(process.execPath, [path.join(CLEAN_DIR, 'dist-server', 'server.cjs')], {
      cwd: CLEAN_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProc.stdout.on('data', (d: any) => process.stdout.write(`  [Server stdout] ${d.toString()}`));
    serverProc.stderr.on('data', (d: any) => process.stderr.write(`  [Server stderr] ${d.toString()}`));

    const healthy1 = await waitForServerHealthy(15000);
    assert(healthy1, 'Standalone server booted and responded healthy on first boot');
    assert(fs.existsSync(cleanDataDir), 'Data directory was initialized autonomously on first boot');

    // --------------------------------------------------------------------------
    // 4. Owner Bootstrap Provisioning
    // --------------------------------------------------------------------------
    console.log('\n[Step 4] Performing Owner Bootstrap Provisioning...');
    const bootstrapTokenFile = path.join(cleanDataDir, '.owner_bootstrap_token');
    assert(fs.existsSync(bootstrapTokenFile), 'Owner bootstrap token file generated securely on first boot');

    const tokenData = JSON.parse(fs.readFileSync(bootstrapTokenFile, 'utf8'));
    const bootstrapRes = await fetch(`${BASE_URL}/api/v1/auth/local-owner/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: tokenData.token,
        username: 'cleanadmin',
        password: 'CleanAdminPassword123!@#',
        fullName: 'مدير النظام النظيف',
      }),
    });

    const bootstrapJson: any = await bootstrapRes.json();
    assert(
      (bootstrapRes.status === 200 || bootstrapRes.status === 201) && bootstrapJson.success,
      'Owner bootstrap succeeded (200/201 OK)',
      bootstrapJson
    );
    assert(!fs.existsSync(bootstrapTokenFile), 'Bootstrap token destroyed after single-use provisioning');

    // --------------------------------------------------------------------------
    // 5. Owner Login & Data Creation
    // --------------------------------------------------------------------------
    console.log('\n[Step 5] Logging in as Local Owner and Creating Test Customer...');
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/local-owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cleanadmin',
        password: 'CleanAdminPassword123!@#',
      }),
    });
    const loginJson: any = await loginRes.json();
    const token = loginJson.data?.token;
    assert(loginRes.status === 200 && Boolean(token), 'Owner login succeeded with Bearer token received');

    // Create a customer
    const createCustRes = await fetch(`${BASE_URL}/api/v1/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'عميل البيئة النظيفة المستقلة',
        phone: '01099887766',
        email: 'clean_customer@madar.eg',
        nationalId: '29001011234567',
        city: 'القاهرة',
        tier: 'VIP',
        tags: ['CleanTest', 'VerifiedRelease'],
      }),
    });
    const createCustJson: any = await createCustRes.json();
    assert(createCustRes.status === 201, 'Test customer created via API (201 Created)', createCustJson);

    // Wait for debounced persistence flush
    await new Promise((r) => setTimeout(r, 2000));

    // --------------------------------------------------------------------------
    // 6. Graceful Termination of Process 1
    // --------------------------------------------------------------------------
    console.log('\n[Step 6] Terminating Process 1 gracefully...');
    serverProc.kill('SIGINT');
    await new Promise((resolve) => {
      serverProc.on('exit', () => resolve(true));
      setTimeout(resolve, 3000);
    });
    serverProc = null;
    console.log('  Process 1 terminated.');

    // --------------------------------------------------------------------------
    // 7. Cold Restart (Second Boot) & Persistence Verification
    // --------------------------------------------------------------------------
    console.log('\n[Step 7] Restarting Standalone Server (Cold Reboot)...');
    serverProc = spawn(process.execPath, [path.join(CLEAN_DIR, 'dist-server', 'server.cjs')], {
      cwd: CLEAN_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const healthy2 = await waitForServerHealthy(15000);
    assert(healthy2, 'Standalone server restarted and responded healthy on cold reboot');

    // Log in again
    const loginRes2 = await fetch(`${BASE_URL}/api/v1/auth/local-owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cleanadmin',
        password: 'CleanAdminPassword123!@#',
      }),
    });
    const loginJson2: any = await loginRes2.json();
    const token2 = loginJson2.data?.token;
    assert(loginRes2.status === 200 && Boolean(token2), 'Owner authenticated successfully after server reboot');

    // Fetch customers list and verify the customer survived reboot bit-for-bit
    const custRes = await fetch(`${BASE_URL}/api/v1/customers`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    const custJson: any = await custRes.json();
    const customers = custJson.data || [];
    const persistedCustomer = customers.find((c: any) => c.phone === '01099887766');

    assert(
      Boolean(persistedCustomer) && persistedCustomer.name === 'عميل البيئة النظيفة المستقلة',
      'Customer record persisted across cold restart without data corruption',
      persistedCustomer
    );
  } finally {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGINT');
    }
    if (fs.existsSync(CLEAN_DIR)) {
      try {
        fs.rmSync(CLEAN_DIR, { recursive: true, force: true });
      } catch {}
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 CLEAN RELEASE EXECUTION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL CLEAN TEST ERROR]', err);
  process.exit(1);
});
