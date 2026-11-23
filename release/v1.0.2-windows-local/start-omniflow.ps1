# OmniFlow OS v1.0.2 Windows Local Runner
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting OmniFlow OS v1.0.2 (Windows Local-First Production)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[FATAL] Node.js is not installed or not in PATH. Node.js 22+ LTS required."
    exit 1
}

$nodeVer = (node -v).TrimStart('v')
$majorVer = [int]($nodeVer.Split('.')[0])
if ($majorVer -lt 22) {
    Write-Warning "Detected Node.js v$nodeVer. Recommended Node version is 22+ LTS."
}

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "[SETUP] First run detected: initializing production security keys..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "setup-keys.ps1")
}

$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:HOST = "127.0.0.1"
$env:DATA_DIR = Join-Path $PSScriptRoot "data"

node "$PSScriptRoot/dist-server/server.cjs"
