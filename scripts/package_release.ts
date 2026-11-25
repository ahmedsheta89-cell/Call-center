import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';

function sha256File(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function getFilesRecursive(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const SHARED_KEY_PROVISION_JS = `
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(process.argv[1] || process.cwd());
const envPath = path.join(targetDir, '.env');
const PLACEHOLDER_RE = /(REPLACE_WITH|YOUR_|CHANGEME|MY_|DEFAULT|EXAMPLE|TEMPLATE|PLACEHOLDER)/i;
const HEX_64_RE = /^[0-9a-f]{64}$/;

function parseEnvMap(raw) {
  const map = {};
  for (const line of raw.split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return map;
}

function hasValidNonPlaceholderKeys(envMap) {
  const s = envMap.SESSION_SECRET || '';
  const c = envMap.CHANNEL_SECRET_ENCRYPTION_KEY || '';
  const a = envMap.AUDIT_CHECKPOINT_HMAC_KEY || '';
  if (!s || s.length < 32 || PLACEHOLDER_RE.test(s)) return false;
  if (!HEX_64_RE.test(c) || PLACEHOLDER_RE.test(c)) return false;
  if (!HEX_64_RE.test(a) || PLACEHOLDER_RE.test(a)) return false;
  if (c === a || s === c || s === a) return false;
  return true;
}

if (fs.existsSync(envPath)) {
  const current = fs.readFileSync(envPath, 'utf8');
  const parsed = parseEnvMap(current);
  if (hasValidNonPlaceholderKeys(parsed)) {
    console.log('[INFO] .env already exists with valid cryptographic non-placeholder configuration.');
    process.exit(0);
  }
  if (PLACEHOLDER_RE.test(current)) {
    console.error('[ERROR] Existing .env contains unresolved placeholder secrets. Refusing unsafe reuse; replace placeholders or remove .env first.');
    process.exit(2);
  }
  console.error('[ERROR] Existing .env has invalid or weak secret lengths/uniqueness. Refusing launch until corrected.');
  process.exit(2);
}

const sessionSecret = crypto.randomBytes(32).toString('hex');
let channelKey = crypto.randomBytes(32).toString('hex');
while (channelKey === sessionSecret) {
  channelKey = crypto.randomBytes(32).toString('hex');
}
let auditKey = crypto.randomBytes(32).toString('hex');
while (auditKey === channelKey || auditKey === sessionSecret) {
  auditKey = crypto.randomBytes(32).toString('hex');
}

const envContent = [
  'NODE_ENV=production',
  'PORT=3000',
  'HOST=127.0.0.1',
  'DATA_DIR=' + path.join(targetDir, 'data'),
  'SESSION_SECRET=' + sessionSecret,
  'CHANNEL_SECRET_ENCRYPTION_KEY=' + channelKey,
  'AUDIT_CHECKPOINT_HMAC_KEY=' + auditKey,
  'AUDIT_CHECKPOINT_HMAC_KEY_ID=audit-hmac-v1',
  ''
].join('\\r\\n');

fs.writeFileSync(envPath, envContent, { encoding: 'utf8', mode: 0o600 });
console.log('[SUCCESS] Generated distinct 256-bit CSPRNG production secrets in ' + envPath);
`.trim();

const SHARED_ENV_VALIDATE_JS = `
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(process.argv[1] || process.cwd());
const envPath = path.join(targetDir, '.env');
const PLACEHOLDER_RE = /(REPLACE_WITH|YOUR_|CHANGEME|MY_|DEFAULT|EXAMPLE|TEMPLATE|PLACEHOLDER)/i;
const HEX_64_RE = /^[0-9a-f]{64}$/;

if (!fs.existsSync(envPath)) {
  console.error('[ERROR] Missing .env at ' + envPath);
  process.exit(1);
}
const raw = fs.readFileSync(envPath, 'utf8');
const envMap = {};
for (const line of raw.split(/\\r?\\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) {
    envMap[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

const s = envMap.SESSION_SECRET || '';
const c = envMap.CHANNEL_SECRET_ENCRYPTION_KEY || '';
const a = envMap.AUDIT_CHECKPOINT_HMAC_KEY || '';

if (!s || s.length < 32 || PLACEHOLDER_RE.test(s)) {
  console.error('[SECURITY ABORT] SESSION_SECRET is missing, < 32 chars, or contains an unresolved placeholder.');
  process.exit(1);
}
if (!HEX_64_RE.test(c) || PLACEHOLDER_RE.test(c)) {
  console.error('[SECURITY ABORT] CHANNEL_SECRET_ENCRYPTION_KEY is missing, not 64-hex, or contains an unresolved placeholder.');
  process.exit(1);
}
if (!HEX_64_RE.test(a) || PLACEHOLDER_RE.test(a)) {
  console.error('[SECURITY ABORT] AUDIT_CHECKPOINT_HMAC_KEY is missing, not 64-hex, or contains an unresolved placeholder.');
  process.exit(1);
}
if (c === a || s === c || s === a) {
  console.error('[SECURITY ABORT] Generated keys must all be cryptographically distinct.');
  process.exit(1);
}
`.trim();

async function main() {
  console.log('[RELEASE] Starting OmniFlow OS v1.0.2 Production Release Packaging...\n');

  const rootDir = process.cwd();
  const releaseDir = path.join(rootDir, 'release', 'v1.0.2-windows-local');
  const zipFile = path.join(rootDir, 'release', 'v1.0.2-windows-local.zip');
  const auditDir =
    process.env.OMNIFLOW_AUDIT_DIR ||
    (process.platform === 'win32' && fs.existsSync('F:\\Dev_Workspace')
      ? path.resolve('F:\\Dev_Workspace\\Audit\\OMNIFLOW_OS\\MASTER_COMPLETION_MISSION')
      : path.join(rootDir, 'audit-artifacts'));

  // Step 1: Execute production build
  console.log('[BUILD] Building production Frontend SPA and Standalone Server Bundle...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  // Clean destination release directory
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(releaseDir, { recursive: true });

  // 1. Copy Frontend Build
  const distDir = path.join(rootDir, 'dist');
  if (fs.existsSync(distDir)) {
    copyRecursive(distDir, path.join(releaseDir, 'dist'));
    console.log('[RELEASE] Copied dist/ (Frontend SPA bundle)');
  } else {
    throw new Error('dist/ directory missing. Run npm run build first.');
  }

  // 2. Copy Server Production Bundle
  const distServerDir = path.join(rootDir, 'dist-server');
  if (fs.existsSync(distServerDir)) {
    copyRecursive(distServerDir, path.join(releaseDir, 'dist-server'));
    console.log('[RELEASE] Copied dist-server/ (Standalone Backend CJS bundle)');
  } else {
    throw new Error('dist-server/ directory missing. Run npm run build first.');
  }

  // 3. Copy Package metadata & scripts
  const ntfsScriptSource = path.join(rootDir, 'scripts', 'windows', 'prepare_ntfs_acl_hardening.ps1');
  if (fs.existsSync(ntfsScriptSource)) {
    fs.copyFileSync(ntfsScriptSource, path.join(releaseDir, 'prepare_ntfs_acl_hardening.ps1'));
    console.log('[RELEASE] Copied prepare_ntfs_acl_hardening.ps1 from scripts/windows/');
  } else {
    throw new Error(`NTFS hardening script not found at ${ntfsScriptSource}`);
  }

  const filesToCopy = ['package.json', '.env.example'];
  for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(releaseDir, file));
      console.log(`[RELEASE] Copied ${file}`);
    }
  }

  // 4. Write shared CSPRNG provisioner helper inside scripts/ (not needed externally if inlined, or inline cleanly)
  const provisionB64 = Buffer.from(SHARED_KEY_PROVISION_JS, 'utf8').toString('base64');
  const validateB64 = Buffer.from(SHARED_ENV_VALIDATE_JS, 'utf8').toString('base64');

  const setupKeysBat = `@echo off
setlocal EnableDelayedExpansion
TITLE OmniFlow OS - Production Security Key Setup
echo ========================================================
echo OmniFlow OS - Generating Cryptographic Production Secrets
echo ========================================================
pushd "%~dp0" >nul
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH. Node.js 22+ LTS is required.
  popd >nul
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Unsupported Node.js %NODE_VER%. Node.js >=22.0.0 is strictly required.
  popd >nul
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b 1
)

node -e "eval(Buffer.from('${provisionB64}','base64').toString('utf8'))" "%~dp0."
set EXIT_CODE=%ERRORLEVEL%
popd >nul
if %EXIT_CODE% neq 0 (
  echo [ERROR] Failed to configure security keys ^(exit code %EXIT_CODE%^).
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b %EXIT_CODE%
)
echo Security configuration completed successfully.
exit /b 0
`;
  fs.writeFileSync(path.join(releaseDir, 'setup-keys.bat'), setupKeysBat, 'utf-8');

  const setupKeysPs1 = `# OmniFlow OS - Production Security Key Setup (CSPRNG via Node.js crypto.randomBytes)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "OmniFlow OS - Generating Cryptographic Production Secrets" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[FATAL] Node.js is not installed or not in PATH. Node.js 22+ is strictly required."
    exit 1
}

$nodeVer = (node -v).TrimStart('v')
$majorVer = [int]($nodeVer.Split('.')[0])
if ($majorVer -lt 22) {
    Write-Error "[FATAL] Unsupported Node.js v$nodeVer. Node.js >=22.0.0 is strictly required."
    exit 1
}

Push-Location $PSScriptRoot
try {
    $jsCode = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${provisionB64}'))
    & node -e $jsCode $PSScriptRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[FATAL] Key setup exited with error code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
`;
  fs.writeFileSync(path.join(releaseDir, 'setup-keys.ps1'), setupKeysPs1, 'utf-8');

  // 5. Create Windows Local Runner Scripts (Strict Node >=22 Enforcement, CWD-independent, Placeholder Rejecting)
  const batLauncher = `@echo off
setlocal EnableDelayedExpansion
TITLE OmniFlow OS v1.0.2 Local Server
echo ========================================================
echo Starting OmniFlow OS v1.0.2 (Windows Local-First Production)
echo ========================================================
pushd "%~dp0" >nul
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH. Node.js 22+ LTS is strictly required.
  popd >nul
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Unsupported Node.js %NODE_VER%. Node.js >=22.0.0 is strictly required.
  popd >nul
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b 1
)

if not exist "%~dp0.env" (
  echo [SETUP] First run detected: initializing production security keys...
  call "%~dp0setup-keys.bat"
  if %ERRORLEVEL% neq 0 (
    popd >nul
    exit /b %ERRORLEVEL%
  )
)

node -e "eval(Buffer.from('${validateB64}','base64').toString('utf8'))" "%~dp0."
if %ERRORLEVEL% neq 0 (
  popd >nul
  if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
  exit /b 1
)

if "%NODE_ENV%"=="" set "NODE_ENV=production"
if "%PORT%"=="" set "PORT=3000"
if "%HOST%"=="" set "HOST=127.0.0.1"
if "%DATA_DIR%"=="" set "DATA_DIR=%~dp0data"
if "%OMNIFLOW_DATA_DIR%"=="" set "OMNIFLOW_DATA_DIR=%DATA_DIR%"

node "%~dp0dist-server\\server.cjs"
set SERVER_EXIT=%ERRORLEVEL%
popd >nul
if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
exit /b %SERVER_EXIT%
`;
  fs.writeFileSync(path.join(releaseDir, 'start-omniflow.bat'), batLauncher, 'utf-8');

  const psLauncher = `# OmniFlow OS v1.0.2 Windows Local Runner
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting OmniFlow OS v1.0.2 (Windows Local-First Production)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[FATAL] Node.js is not installed or not in PATH. Node.js >=22.0.0 is strictly required."
    exit 1
}

$nodeVer = (node -v).TrimStart('v')
$majorVer = [int]($nodeVer.Split('.')[0])
if ($majorVer -lt 22) {
    Write-Error "[FATAL] Unsupported Node.js v$nodeVer. Node.js >=22.0.0 is strictly required."
    exit 1
}

Push-Location $PSScriptRoot
try {
    $envFile = Join-Path $PSScriptRoot ".env"
    if (-not (Test-Path $envFile)) {
        Write-Host "[SETUP] First run detected: initializing production security keys..." -ForegroundColor Yellow
        & (Join-Path $PSScriptRoot "setup-keys.ps1")
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    $validateJs = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${validateB64}'))
    & node -e $validateJs $PSScriptRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[SECURITY ABORT] .env validation failed."
        exit 1
    }

    if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }
    if (-not $env:PORT) { $env:PORT = "3000" }
    if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
    if (-not $env:DATA_DIR) { $env:DATA_DIR = Join-Path $PSScriptRoot "data" }
    if (-not $env:OMNIFLOW_DATA_DIR) { $env:OMNIFLOW_DATA_DIR = $env:DATA_DIR }

    $serverEntry = Join-Path $PSScriptRoot "dist-server\\server.cjs"
    & node $serverEntry
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
`;
  fs.writeFileSync(path.join(releaseDir, 'start-omniflow.ps1'), psLauncher, 'utf-8');

  // 6. Gather file inventory and compute SHA-256 hashes
  const allFiles = getFilesRecursive(releaseDir);
  const fileManifest: Record<string, { sizeBytes: number; sha256: string }> = {};

  let totalBytes = 0;
  for (const filePath of allFiles) {
    const relPath = path.relative(releaseDir, filePath).replace(/\\/g, '/');
    const stat = fs.statSync(filePath);
    const hash = sha256File(filePath);
    fileManifest[relPath] = {
      sizeBytes: stat.size,
      sha256: hash,
    };
    totalBytes += stat.size;
  }

  const manifest = {
    releaseVersion: '1.0.2',
    releaseTag: 'v1.0.2-windows-local',
    buildTimestamp: new Date().toISOString(),
    targetPlatform: 'Windows 10 / Windows 11 / Windows Server 2019/2022',
    runtimeRequirements: {
      node: '>=22.0.0',
      architecture: 'x64',
      storageEngine: 'Local Atomic JSON + NTFS ACL Hardening',
      networkBinding: '127.0.0.1 (Strict Loopback / Zero Cloud Exposure)',
    },
    totalFiles: Object.keys(fileManifest).length,
    totalSizeBytes: totalBytes,
    totalSizeMB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    fileInventory: fileManifest,
    securityCheck: {
      zeroExternalCost: true,
      standaloneBundle: true,
      egyptianLegalCompliance: ['Law 151/2020 (Data Privacy)', 'Law 10/2003 (Telecom Regulation)'],
      authentication: 'Local Owner Scrypt-KDF (N=131072, r=8, p=1, keyLen=64) + Permanent Lockout Protection',
      dataEncryption: 'AES-256-GCM at-rest credential vault + HMAC-SHA256 audit checkpoints',
    },
  };

  const manifestPath = path.join(releaseDir, 'RELEASE_MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[RELEASE] Manifest created at ${manifestPath}`);

  // Step 7: Verify every manifest entry against actual file bytes on disk
  console.log('[VERIFY] Verifying all manifest entries against actual file bytes...');
  for (const [relPath, entry] of Object.entries(manifest.fileInventory)) {
    const fullPath = path.join(releaseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Manifest verification failed: missing file ${relPath}`);
    }
    const actualHash = sha256File(fullPath);
    if (actualHash !== entry.sha256) {
      throw new Error(`Manifest hash mismatch on ${relPath}: expected ${entry.sha256}, got ${actualHash}`);
    }
  }
  console.log(`[VERIFY] All ${manifest.totalFiles} files verified bit-for-bit against manifest SHA-256.`);

  // Step 8: Create cross-platform ZIP distribution archive (Zero powershell.exe dependency)
  console.log(`[ARCHIVE] Creating cross-platform release archive: ${zipFile}`);
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }
  const zip = new AdmZip();
  const filesForZip = getFilesRecursive(releaseDir);
  for (const absFile of filesForZip) {
    const relPosix = path.relative(releaseDir, absFile).replace(/\\/g, '/');
    const relDir = path.posix.dirname(relPosix);
    zip.addLocalFile(absFile, relDir === '.' ? '' : relDir);
  }
  zip.writeZip(zipFile);

  const zipStat = fs.statSync(zipFile);
  const zipHash = sha256File(zipFile);
  console.log(`[ARCHIVE] Release ZIP created: ${(zipStat.size / (1024 * 1024)).toFixed(2)} MB | SHA256: ${zipHash}`);

  // Step 9: Post-Packaging ZIP Extraction & Bit-for-Bit Re-Verification in Isolated Temp Directory
  console.log('[VERIFY-ZIP] Extracting ZIP into new isolated directory and recomputing every SHA-256...');
  const verifyExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-zip-verify-'));
  try {
    fs.writeFileSync(
      path.join(verifyExtractDir, '.omniflow_test_owner'),
      JSON.stringify({ tag: 'OMNIFLOW_ZIP_VERIFY', pid: process.pid }),
      'utf-8'
    );
    const extractedTarget = path.join(verifyExtractDir, 'extracted');
    const readerZip = new AdmZip(zipFile);
    readerZip.extractAllTo(extractedTarget, true);

    const extractedManifestPath = path.join(extractedTarget, 'RELEASE_MANIFEST.json');
    if (!fs.existsSync(extractedManifestPath)) {
      throw new Error('ZIP verification failed: RELEASE_MANIFEST.json missing after extraction');
    }
    const extractedManifest = JSON.parse(fs.readFileSync(extractedManifestPath, 'utf8'));
    const expectedEntries = Object.entries(extractedManifest.fileInventory) as Array<
      [string, { sizeBytes: number; sha256: string }]
    >;

    for (const [relPath, entry] of expectedEntries) {
      const extractedFilePath = path.join(extractedTarget, relPath);
      if (!fs.existsSync(extractedFilePath)) {
        throw new Error(`ZIP verification failed: missing extracted file ${relPath}`);
      }
      const stat = fs.statSync(extractedFilePath);
      if (stat.size !== entry.sizeBytes) {
        throw new Error(`ZIP verification failed: size mismatch on ${relPath}`);
      }
      const recomputed = sha256File(extractedFilePath);
      if (recomputed !== entry.sha256) {
        throw new Error(`ZIP verification failed: SHA-256 mismatch on ${relPath}`);
      }
    }

    const extractedFilesList = getFilesRecursive(extractedTarget);
    // Expected = all inventoried files + RELEASE_MANIFEST.json
    if (extractedFilesList.length !== expectedEntries.length + 1) {
      throw new Error(
        `ZIP verification failed: unexpected file count ${extractedFilesList.length} vs expected ${expectedEntries.length + 1}`
      );
    }

    console.log(
      `[VERIFY-ZIP] Extracted and recomputed SHA-256 for all ${expectedEntries.length} files + manifest bit-for-bit: 100% MATCH.`
    );
  } finally {
    const ownerFile = path.join(verifyExtractDir, '.omniflow_test_owner');
    if (fs.existsSync(ownerFile)) {
      fs.rmSync(verifyExtractDir, { recursive: true, force: true });
    }
  }

  // Also write manifest to Audit workspace
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
  const auditManifestPath = path.join(auditDir, 'RELEASE_MANIFEST.json');
  fs.writeFileSync(auditManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[RELEASE] Copied release manifest to Audit workspace: ${auditManifestPath}`);

  console.log('\n[RELEASE] Packaging & ZIP verification complete! Total files:', manifest.totalFiles, 'Total size:', manifest.totalSizeMB, 'MB');
}

main().catch((err) => {
  console.error('[RELEASE ERROR]', err);
  process.exit(1);
});
