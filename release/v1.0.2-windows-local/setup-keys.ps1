# OmniFlow OS - Production Security Key Setup
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "OmniFlow OS - Generating Cryptographic Production Secrets" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[FATAL] Node.js is not installed or not in PATH. Node.js 22+ is required."
    exit 1
}

$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    $existing = Get-Content $envPath -Raw
    if ($existing -notmatch "REPLACE_WITH") {
        Write-Host "[INFO] .env already exists with non-placeholder configuration." -ForegroundColor Yellow
        exit 0
    }
}

$sessionSec = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
$channelKey = -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
$auditKey = -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
$dataDir = Join-Path $PSScriptRoot "data"

$content = @"
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DATA_DIR=$dataDir
SESSION_SECRET=$sessionSec
CHANNEL_SECRET_ENCRYPTION_KEY=$channelKey
AUDIT_CHECKPOINT_HMAC_KEY=$auditKey
AUDIT_CHECKPOINT_HMAC_KEY_ID=audit-hmac-v1
"@

Set-Content -Path $envPath -Value $content -Encoding UTF8
Write-Host "[SUCCESS] Generated secure CSPRNG production secrets in .env" -ForegroundColor Green
