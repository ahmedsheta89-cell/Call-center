# OmniFlow OS v1.0.2 Windows Local Runner
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

    $validateJs = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('Y29uc3QgZnMgPSByZXF1aXJlKCdmcycpOwpjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpOwoKY29uc3QgdGFyZ2V0RGlyID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuYXJndlsxXSB8fCBwcm9jZXNzLmN3ZCgpKTsKY29uc3QgZW52UGF0aCA9IHBhdGguam9pbih0YXJnZXREaXIsICcuZW52Jyk7CmNvbnN0IFBMQUNFSE9MREVSX1JFID0gLyhSRVBMQUNFX1dJVEh8WU9VUl98Q0hBTkdFTUV8TVlffERFRkFVTFR8RVhBTVBMRXxURU1QTEFURXxQTEFDRUhPTERFUikvaTsKY29uc3QgSEVYXzY0X1JFID0gL15bMC05YS1mXXs2NH0kLzsKCmlmICghZnMuZXhpc3RzU3luYyhlbnZQYXRoKSkgewogIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gTWlzc2luZyAuZW52IGF0ICcgKyBlbnZQYXRoKTsKICBwcm9jZXNzLmV4aXQoMSk7Cn0KY29uc3QgcmF3ID0gZnMucmVhZEZpbGVTeW5jKGVudlBhdGgsICd1dGY4Jyk7CmNvbnN0IGVudk1hcCA9IHt9Owpmb3IgKGNvbnN0IGxpbmUgb2YgcmF3LnNwbGl0KC9ccj9cbi8pKSB7CiAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpOwogIGlmICghdHJpbW1lZCB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJyMnKSkgY29udGludWU7CiAgY29uc3QgZXEgPSB0cmltbWVkLmluZGV4T2YoJz0nKTsKICBpZiAoZXEgPiAwKSB7CiAgICBlbnZNYXBbdHJpbW1lZC5zbGljZSgwLCBlcSkudHJpbSgpXSA9IHRyaW1tZWQuc2xpY2UoZXEgKyAxKS50cmltKCk7CiAgfQp9Cgpjb25zdCBzID0gZW52TWFwLlNFU1NJT05fU0VDUkVUIHx8ICcnOwpjb25zdCBjID0gZW52TWFwLkNIQU5ORUxfU0VDUkVUX0VOQ1JZUFRJT05fS0VZIHx8ICcnOwpjb25zdCBhID0gZW52TWFwLkFVRElUX0NIRUNLUE9JTlRfSE1BQ19LRVkgfHwgJyc7CgppZiAoIXMgfHwgcy5sZW5ndGggPCAzMiB8fCBQTEFDRUhPTERFUl9SRS50ZXN0KHMpKSB7CiAgY29uc29sZS5lcnJvcignW1NFQ1VSSVRZIEFCT1JUXSBTRVNTSU9OX1NFQ1JFVCBpcyBtaXNzaW5nLCA8IDMyIGNoYXJzLCBvciBjb250YWlucyBhbiB1bnJlc29sdmVkIHBsYWNlaG9sZGVyLicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQppZiAoIUhFWF82NF9SRS50ZXN0KGMpIHx8IFBMQUNFSE9MREVSX1JFLnRlc3QoYykpIHsKICBjb25zb2xlLmVycm9yKCdbU0VDVVJJVFkgQUJPUlRdIENIQU5ORUxfU0VDUkVUX0VOQ1JZUFRJT05fS0VZIGlzIG1pc3NpbmcsIG5vdCA2NC1oZXgsIG9yIGNvbnRhaW5zIGFuIHVucmVzb2x2ZWQgcGxhY2Vob2xkZXIuJyk7CiAgcHJvY2Vzcy5leGl0KDEpOwp9CmlmICghSEVYXzY0X1JFLnRlc3QoYSkgfHwgUExBQ0VIT0xERVJfUkUudGVzdChhKSkgewogIGNvbnNvbGUuZXJyb3IoJ1tTRUNVUklUWSBBQk9SVF0gQVVESVRfQ0hFQ0tQT0lOVF9ITUFDX0tFWSBpcyBtaXNzaW5nLCBub3QgNjQtaGV4LCBvciBjb250YWlucyBhbiB1bnJlc29sdmVkIHBsYWNlaG9sZGVyLicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQppZiAoYyA9PT0gYSB8fCBzID09PSBjIHx8IHMgPT09IGEpIHsKICBjb25zb2xlLmVycm9yKCdbU0VDVVJJVFkgQUJPUlRdIEdlbmVyYXRlZCBrZXlzIG11c3QgYWxsIGJlIGNyeXB0b2dyYXBoaWNhbGx5IGRpc3RpbmN0LicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQ=='))
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

    $serverEntry = Join-Path $PSScriptRoot "dist-server\server.cjs"
    & node $serverEntry
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
