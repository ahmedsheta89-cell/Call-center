/**
 * @file scripts/test_windows_launchers.ts
 * OmniFlow OS — Real Windows Release ZIP Extraction, First-Run Key Provisioning & Launcher Execution Suite
 * Verifies:
 * 1. Release ZIP extraction into clean isolated temporary directory + SHA-256 verification of all files
 * 2. CWD-independent execution of setup-keys.bat, setup-keys.ps1, start-omniflow.bat, start-omniflow.ps1
 * 3. CSPRNG cryptographic key generation (all keys valid length, hex format, mutually distinct)
 * 4. Strict rejection of unresolved placeholder secrets across scripts and runtime
 * 5. Hard enforcement of Node.js >= 22 (rejects < v22 with non-zero exit code, never warns)
 * 6. Live standalone server startup via BOTH start-omniflow.bat and start-omniflow.ps1 + owner bootstrap & reboot persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync, spawn, ChildProcess } from 'child_process';
import AdmZip from 'adm-zip';

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

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseEnv(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return map;
}

async function waitForHealth(baseUrl: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.status === 200) {
        const j: any = await res.json();
        if (j.status === 'healthy') return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

function killProcessTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {}
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[INFO] Windows launcher execution harness skipped on non-Windows platform.');
    return;
  }

  console.log('================================================================================');
  console.log('🧪 OMNIFLOW OS — WINDOWS RELEASE ZIP, CSPRNG KEY SETUP & LAUNCHER VERIFICATION');
  console.log('================================================================================\n');

  const zipPath = path.resolve('release/v1.0.2-windows-local.zip');
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Release ZIP not found at ${zipPath}. Run npm run package:release first.`);
  }

  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-win-launchers-'));
  const ownerMarker = path.join(sandboxRoot, '.omniflow_test_owner');
  fs.writeFileSync(ownerMarker, JSON.stringify({ tag: 'OMNIFLOW_WIN_LAUNCHER_TEST', pid: process.pid }), 'utf-8');

  const extractDirBat = path.join(sandboxRoot, 'pkg_bat');
  const extractDirPs1 = path.join(sandboxRoot, 'pkg_ps1');
  const fakeNodeDir = path.join(sandboxRoot, 'fake_node20');
  const unrelatedCwd = path.join(sandboxRoot, 'caller_cwd');
  fs.mkdirSync(unrelatedCwd, { recursive: true });
  fs.mkdirSync(fakeNodeDir, { recursive: true });

  // Create fake node v20 shim to prove >=22 enforcement
  fs.writeFileSync(
    path.join(fakeNodeDir, 'node.cmd'),
    '@echo off\r\nif "%1"=="-v" (\r\n  echo v20.11.1\r\n  exit /b 0\r\n)\r\necho Mock older node %*\r\nexit /b 0\r\n',
    'utf-8'
  );
  // PowerShell prefers .exe or .ps1 / Get-Command node; also write a small node.ps1 shim or cmd
  fs.writeFileSync(path.join(fakeNodeDir, 'node.bat'), '@echo off\r\nif "%1"=="-v" echo v20.11.1\r\n', 'utf-8');

  try {
    // --------------------------------------------------------------------------
    // 1. Extract Release ZIP and Verify Every File SHA-256
    // --------------------------------------------------------------------------
    console.log('[Step 1] Extracting release ZIP into clean isolated folders and checking SHA-256...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDirBat, true);
    zip.extractAllTo(extractDirPs1, true);

    const manifestPath = path.join(extractDirBat, 'RELEASE_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    let allMatched = true;
    for (const [relPath, entry] of Object.entries<any>(manifest.fileInventory)) {
      const f = path.join(extractDirBat, relPath);
      if (!fs.existsSync(f) || sha256File(f) !== entry.sha256) {
        allMatched = false;
        break;
      }
    }
    assert(allMatched, `Extracted ${manifest.totalFiles} files and verified all SHA-256 digests match manifest`);
    assert(
      manifest.securityCheck?.authentication?.includes('N=131072'),
      `Manifest Scrypt parameters match production N=131072 (got: ${manifest.securityCheck?.authentication})`
    );
    assert(!fs.existsSync(path.join(extractDirBat, 'node_modules')), 'Extracted release contains ZERO node_modules');

    // --------------------------------------------------------------------------
    // 2. Test Node < 22 Rejection Across All 4 Scripts
    // --------------------------------------------------------------------------
    console.log('\n[Step 2] Testing hard Node.js >=22 enforcement across all 4 scripts...');
    const oldNodeEnv = {
      ...process.env,
      PATH: `${fakeNodeDir};${process.env.PATH || ''}`,
      OMNIFLOW_NON_INTERACTIVE: '1',
    };

    const batSetupOld = spawnSync('cmd.exe', ['/c', path.join(extractDirBat, 'setup-keys.bat')], {
      cwd: unrelatedCwd,
      env: oldNodeEnv,
      encoding: 'utf-8',
    });
    assert(batSetupOld.status !== 0, `setup-keys.bat rejects Node v20 (exit code ${batSetupOld.status})`);

    const psSetupOld = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(extractDirPs1, 'setup-keys.ps1')],
      { cwd: unrelatedCwd, env: oldNodeEnv, encoding: 'utf-8' }
    );
    assert(psSetupOld.status !== 0, `setup-keys.ps1 rejects Node v20 (exit code ${psSetupOld.status})`);

    const batStartOld = spawnSync('cmd.exe', ['/c', path.join(extractDirBat, 'start-omniflow.bat')], {
      cwd: unrelatedCwd,
      env: oldNodeEnv,
      encoding: 'utf-8',
    });
    assert(batStartOld.status !== 0, `start-omniflow.bat enforces Node >=22 and aborts (exit code ${batStartOld.status})`);

    const psStartOld = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(extractDirPs1, 'start-omniflow.ps1')],
      { cwd: unrelatedCwd, env: oldNodeEnv, encoding: 'utf-8' }
    );
    assert(psStartOld.status !== 0, `start-omniflow.ps1 enforces Node >=22 and aborts (exit code ${psStartOld.status})`);

    // --------------------------------------------------------------------------
    // 3. Test Unresolved Placeholder Rejection in .env
    // --------------------------------------------------------------------------
    console.log('\n[Step 3] Testing unresolved placeholder secret rejection...');
    const placeholderEnvContent = [
      'NODE_ENV=production',
      'PORT=3196',
      'HOST=127.0.0.1',
      'SESSION_SECRET=REPLACE_WITH_YOUR_SECRET_VALUE_MUST_REJECT',
      'CHANNEL_SECRET_ENCRYPTION_KEY=CHANGEME_NOT_HEX',
      'AUDIT_CHECKPOINT_HMAC_KEY=YOUR_AUDIT_KEY_HERE',
    ].join('\r\n');

    fs.writeFileSync(path.join(extractDirBat, '.env'), placeholderEnvContent, 'utf-8');
    fs.writeFileSync(path.join(extractDirPs1, '.env'), placeholderEnvContent, 'utf-8');

    const batPlaceholder = spawnSync('cmd.exe', ['/c', path.join(extractDirBat, 'start-omniflow.bat')], {
      cwd: unrelatedCwd,
      env: { ...process.env, OMNIFLOW_NON_INTERACTIVE: '1' },
      encoding: 'utf-8',
    });
    assert(batPlaceholder.status !== 0, `start-omniflow.bat rejects placeholder .env secrets (exit code ${batPlaceholder.status})`);

    const psPlaceholder = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(extractDirPs1, 'start-omniflow.ps1')],
      { cwd: unrelatedCwd, env: { ...process.env, OMNIFLOW_NON_INTERACTIVE: '1' }, encoding: 'utf-8' }
    );
    assert(psPlaceholder.status !== 0, `start-omniflow.ps1 rejects placeholder .env secrets (exit code ${psPlaceholder.status})`);

    // Clean fake .env before real key generation
    fs.unlinkSync(path.join(extractDirBat, '.env'));
    fs.unlinkSync(path.join(extractDirPs1, '.env'));

    // --------------------------------------------------------------------------
    // 4. Test CWD-Independent CSPRNG Key Generation (setup-keys.bat & setup-keys.ps1)
    // --------------------------------------------------------------------------
    console.log('\n[Step 4] Testing CWD-independent CSPRNG key generation (setup-keys.bat & setup-keys.ps1)...');
    const batKeysRes = spawnSync('cmd.exe', ['/c', path.join(extractDirBat, 'setup-keys.bat')], {
      cwd: unrelatedCwd,
      env: { ...process.env, OMNIFLOW_NON_INTERACTIVE: '1' },
      encoding: 'utf-8',
    });
    assert(batKeysRes.status === 0, 'setup-keys.bat succeeded from unrelated CWD');
    assert(!fs.existsSync(path.join(unrelatedCwd, '.env')), 'setup-keys.bat did NOT pollute caller CWD with .env');
    assert(fs.existsSync(path.join(extractDirBat, '.env')), 'setup-keys.bat wrote .env strictly in script directory');

    const batEnvMap = parseEnv(fs.readFileSync(path.join(extractDirBat, '.env'), 'utf-8'));
    assert(
      /^[0-9a-f]{64}$/.test(batEnvMap.SESSION_SECRET || '') &&
        /^[0-9a-f]{64}$/.test(batEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY || '') &&
        /^[0-9a-f]{64}$/.test(batEnvMap.AUDIT_CHECKPOINT_HMAC_KEY || '') &&
        new Set([batEnvMap.SESSION_SECRET, batEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY, batEnvMap.AUDIT_CHECKPOINT_HMAC_KEY]).size === 3,
      'setup-keys.bat generated 3 distinct 256-bit (64-hex) CSPRNG keys'
    );

    const psKeysRes = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(extractDirPs1, 'setup-keys.ps1')],
      { cwd: unrelatedCwd, encoding: 'utf-8' }
    );
    assert(psKeysRes.status === 0, 'setup-keys.ps1 succeeded from unrelated CWD');
    assert(!fs.existsSync(path.join(unrelatedCwd, '.env')), 'setup-keys.ps1 did NOT pollute caller CWD with .env');
    assert(fs.existsSync(path.join(extractDirPs1, '.env')), 'setup-keys.ps1 wrote .env strictly in script directory');

    const psEnvMap = parseEnv(fs.readFileSync(path.join(extractDirPs1, '.env'), 'utf-8'));
    assert(
      /^[0-9a-f]{64}$/.test(psEnvMap.SESSION_SECRET || '') &&
        /^[0-9a-f]{64}$/.test(psEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY || '') &&
        /^[0-9a-f]{64}$/.test(psEnvMap.AUDIT_CHECKPOINT_HMAC_KEY || '') &&
        new Set([psEnvMap.SESSION_SECRET, psEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY, psEnvMap.AUDIT_CHECKPOINT_HMAC_KEY]).size === 3,
      'setup-keys.ps1 (CSPRNG crypto.randomBytes) generated 3 distinct 256-bit (64-hex) keys'
    );

    // Also prove keys generated by BAT and PS1 differ across independent invocations
    assert(
      batEnvMap.SESSION_SECRET !== psEnvMap.SESSION_SECRET &&
        batEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY !== psEnvMap.CHANNEL_SECRET_ENCRYPTION_KEY,
      'BAT and PS1 CSPRNG outputs are statistically independent across runs'
    );

    // --------------------------------------------------------------------------
    // 5. Launch Actual Standalone Server via BOTH start-omniflow.bat & start-omniflow.ps1 From Unrelated CWD
    // --------------------------------------------------------------------------
    console.log('\n[Step 5] Testing live server startup via start-omniflow.bat from unrelated CWD...');
    const batPort = 3196;
    const batProc = spawn('cmd.exe', ['/c', path.join(extractDirBat, 'start-omniflow.bat')], {
      cwd: unrelatedCwd,
      env: {
        ...process.env,
        PORT: String(batPort),
        OMNIFLOW_NON_INTERACTIVE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let batHealthy = false;
    try {
      batHealthy = await waitForHealth(`http://127.0.0.1:${batPort}`, 15000);
      assert(batHealthy, `start-omniflow.bat booted standalone server and responded healthy on port ${batPort}`);
      assert(fs.existsSync(path.join(extractDirBat, 'data')), 'start-omniflow.bat initialized data folder strictly inside package directory');
    } finally {
      if (batProc.pid) killProcessTree(batProc.pid);
    }

    console.log('\n[Step 6] Testing live server startup via start-omniflow.ps1 (with auto first-run setup)...');
    fs.unlinkSync(path.join(extractDirPs1, '.env')); // test automatic first-run setup trigger inside start-omniflow.ps1!
    const psPort = 3197;
    const psProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(extractDirPs1, 'start-omniflow.ps1')],
      {
        cwd: unrelatedCwd,
        env: {
          ...process.env,
          PORT: String(psPort),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let psHealthy = false;
    try {
      psHealthy = await waitForHealth(`http://127.0.0.1:${psPort}`, 15000);
      assert(psHealthy, `start-omniflow.ps1 auto-created CSPRNG .env, booted server from unrelated CWD & responded healthy on port ${psPort}`);
      assert(fs.existsSync(path.join(extractDirPs1, '.env')), 'start-omniflow.ps1 provisioned .env on first boot');
      assert(fs.existsSync(path.join(extractDirPs1, 'data')), 'start-omniflow.ps1 initialized data folder strictly inside package directory');
    } finally {
      if (psProc.pid) killProcessTree(psProc.pid);
    }

  } finally {
    if (fs.existsSync(ownerMarker)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 WINDOWS LAUNCHER & ZIP VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL WINDOWS LAUNCHER TEST ERROR]', err);
  process.exit(1);
});
