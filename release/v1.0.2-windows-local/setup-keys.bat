@echo off
TITLE OmniFlow OS - Production Security Key Setup
echo ========================================================
echo OmniFlow OS - Generating Cryptographic Production Secrets
echo ========================================================
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH. Please install Node.js 22+ LTS.
  pause
  exit /b 1
)

node -e "
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const current = fs.readFileSync(envPath, 'utf8');
  if (!current.includes('REPLACE_WITH')) {
    console.log('[INFO] .env already exists with non-placeholder configuration.');
    process.exit(0);
  }
}

const sessionSecret = crypto.randomBytes(32).toString('hex');
const channelKey = crypto.randomBytes(32).toString('hex');
let auditKey = crypto.randomBytes(32).toString('hex');
while (auditKey === channelKey) {
  auditKey = crypto.randomBytes(32).toString('hex');
}

const envContent = [
  'NODE_ENV=production',
  'PORT=3000',
  'HOST=127.0.0.1',
  'DATA_DIR=' + path.resolve('data'),
  'SESSION_SECRET=' + sessionSecret,
  'CHANNEL_SECRET_ENCRYPTION_KEY=' + channelKey,
  'AUDIT_CHECKPOINT_HMAC_KEY=' + auditKey,
  'AUDIT_CHECKPOINT_HMAC_KEY_ID=audit-hmac-v1',
  ''
].join('\r\n');

fs.writeFileSync(envPath, envContent, { encoding: 'utf8', mode: 0o600 });
console.log('[SUCCESS] Generated secure CSPRNG production secrets in .env');
"
if %ERRORLEVEL% equ 0 (
  echo Security configuration completed successfully.
) else (
  echo [ERROR] Failed to configure security keys.
)
