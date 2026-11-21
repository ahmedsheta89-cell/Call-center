# OmniFlow OS v1.0.2 Windows Local Runner
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
