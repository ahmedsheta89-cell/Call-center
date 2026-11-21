import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

async function main() {
  console.log('[RELEASE] Packaging OmniFlow OS v1.0.2 Windows Local-First Release...');

  const rootDir = process.cwd();
  const releaseDir = path.join(rootDir, 'release', 'v1.0.2-windows-local');
  const auditDir = path.resolve('F:\\Dev_Workspace\\Audit\\OMNIFLOW_OS\\MASTER_COMPLETION_MISSION');

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
    console.log('[RELEASE] Copied dist-server/ (Backend CJS bundle)');
  } else {
    throw new Error('dist-server/ directory missing. Run npm run build first.');
  }

  // 3. Copy Package metadata & scripts
  const filesToCopy = [
    'package.json',
    '.env.example',
    'prepare_ntfs_acl_hardening.ps1',
  ];

  for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(releaseDir, file));
      console.log(`[RELEASE] Copied ${file}`);
    }
  }

  // 4. Create Windows Local Runner Scripts
  const batLauncher = `@echo off
TITLE OmniFlow OS v1.0.2 Local Server
echo ========================================================
echo Starting OmniFlow OS v1.0.2 (Windows Local-First Production)
echo ========================================================
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH. Please install Node.js 18+ LTS.
  pause
  exit /b 1
)

set NODE_ENV=production
set PORT=3000
set HOST=127.0.0.1
set DATA_DIR=%~dp0data

node dist-server/server.cjs
pause
`;
  fs.writeFileSync(path.join(releaseDir, 'start-omniflow.bat'), batLauncher, 'utf-8');

  const psLauncher = `# OmniFlow OS v1.0.2 Windows Local Runner
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting OmniFlow OS v1.0.2 (Windows Local-First Production)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[FATAL] Node.js is not installed or not in PATH."
    exit 1
}

$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:HOST = "127.0.0.1"
$env:DATA_DIR = Join-Path $PSScriptRoot "data"

node "$PSScriptRoot/dist-server/server.cjs"
`;
  fs.writeFileSync(path.join(releaseDir, 'start-omniflow.ps1'), psLauncher, 'utf-8');

  // 5. Gather file inventory and compute SHA-256 hashes
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
      node: '>=18.0.0',
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
      egyptianLegalCompliance: ['Law 151/2020 (Data Privacy)', 'Law 10/2003 (Telecom Regulation)'],
      authentication: 'Local Owner Scrypt-KDF (N=32768, r=8, p=1) + Permanent Lockout Protection',
      dataEncryption: 'AES-256-GCM at-rest credential vault + HMAC-SHA256 audit checkpoints',
    },
  };

  const manifestPath = path.join(releaseDir, 'RELEASE_MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[RELEASE] Manifest created at ${manifestPath}`);

  // Also write to Audit workspace
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
  const auditManifestPath = path.join(auditDir, 'RELEASE_MANIFEST.json');
  fs.writeFileSync(auditManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[RELEASE] Copied release manifest to Audit workspace: ${auditManifestPath}`);

  console.log('[RELEASE] Packaging complete! Total files:', manifest.totalFiles, 'Total size:', manifest.totalSizeMB, 'MB');
}

main().catch(err => {
  console.error('[RELEASE ERROR]', err);
  process.exit(1);
});
