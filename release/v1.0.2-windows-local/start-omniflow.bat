@echo off
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

node -e "eval(Buffer.from('Y29uc3QgZnMgPSByZXF1aXJlKCdmcycpOwpjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpOwoKY29uc3QgdGFyZ2V0RGlyID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuYXJndlsxXSB8fCBwcm9jZXNzLmN3ZCgpKTsKY29uc3QgZW52UGF0aCA9IHBhdGguam9pbih0YXJnZXREaXIsICcuZW52Jyk7CmNvbnN0IFBMQUNFSE9MREVSX1JFID0gLyhSRVBMQUNFX1dJVEh8WU9VUl98Q0hBTkdFTUV8TVlffERFRkFVTFR8RVhBTVBMRXxURU1QTEFURXxQTEFDRUhPTERFUikvaTsKY29uc3QgSEVYXzY0X1JFID0gL15bMC05YS1mXXs2NH0kLzsKCmlmICghZnMuZXhpc3RzU3luYyhlbnZQYXRoKSkgewogIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gTWlzc2luZyAuZW52IGF0ICcgKyBlbnZQYXRoKTsKICBwcm9jZXNzLmV4aXQoMSk7Cn0KY29uc3QgcmF3ID0gZnMucmVhZEZpbGVTeW5jKGVudlBhdGgsICd1dGY4Jyk7CmNvbnN0IGVudk1hcCA9IHt9Owpmb3IgKGNvbnN0IGxpbmUgb2YgcmF3LnNwbGl0KC9ccj9cbi8pKSB7CiAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpOwogIGlmICghdHJpbW1lZCB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJyMnKSkgY29udGludWU7CiAgY29uc3QgZXEgPSB0cmltbWVkLmluZGV4T2YoJz0nKTsKICBpZiAoZXEgPiAwKSB7CiAgICBlbnZNYXBbdHJpbW1lZC5zbGljZSgwLCBlcSkudHJpbSgpXSA9IHRyaW1tZWQuc2xpY2UoZXEgKyAxKS50cmltKCk7CiAgfQp9Cgpjb25zdCBzID0gZW52TWFwLlNFU1NJT05fU0VDUkVUIHx8ICcnOwpjb25zdCBjID0gZW52TWFwLkNIQU5ORUxfU0VDUkVUX0VOQ1JZUFRJT05fS0VZIHx8ICcnOwpjb25zdCBhID0gZW52TWFwLkFVRElUX0NIRUNLUE9JTlRfSE1BQ19LRVkgfHwgJyc7CgppZiAoIXMgfHwgcy5sZW5ndGggPCAzMiB8fCBQTEFDRUhPTERFUl9SRS50ZXN0KHMpKSB7CiAgY29uc29sZS5lcnJvcignW1NFQ1VSSVRZIEFCT1JUXSBTRVNTSU9OX1NFQ1JFVCBpcyBtaXNzaW5nLCA8IDMyIGNoYXJzLCBvciBjb250YWlucyBhbiB1bnJlc29sdmVkIHBsYWNlaG9sZGVyLicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQppZiAoIUhFWF82NF9SRS50ZXN0KGMpIHx8IFBMQUNFSE9MREVSX1JFLnRlc3QoYykpIHsKICBjb25zb2xlLmVycm9yKCdbU0VDVVJJVFkgQUJPUlRdIENIQU5ORUxfU0VDUkVUX0VOQ1JZUFRJT05fS0VZIGlzIG1pc3NpbmcsIG5vdCA2NC1oZXgsIG9yIGNvbnRhaW5zIGFuIHVucmVzb2x2ZWQgcGxhY2Vob2xkZXIuJyk7CiAgcHJvY2Vzcy5leGl0KDEpOwp9CmlmICghSEVYXzY0X1JFLnRlc3QoYSkgfHwgUExBQ0VIT0xERVJfUkUudGVzdChhKSkgewogIGNvbnNvbGUuZXJyb3IoJ1tTRUNVUklUWSBBQk9SVF0gQVVESVRfQ0hFQ0tQT0lOVF9ITUFDX0tFWSBpcyBtaXNzaW5nLCBub3QgNjQtaGV4LCBvciBjb250YWlucyBhbiB1bnJlc29sdmVkIHBsYWNlaG9sZGVyLicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQppZiAoYyA9PT0gYSB8fCBzID09PSBjIHx8IHMgPT09IGEpIHsKICBjb25zb2xlLmVycm9yKCdbU0VDVVJJVFkgQUJPUlRdIEdlbmVyYXRlZCBrZXlzIG11c3QgYWxsIGJlIGNyeXB0b2dyYXBoaWNhbGx5IGRpc3RpbmN0LicpOwogIHByb2Nlc3MuZXhpdCgxKTsKfQ==','base64').toString('utf8'))" "%~dp0."
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

node "%~dp0dist-server\server.cjs"
set SERVER_EXIT=%ERRORLEVEL%
popd >nul
if not "%OMNIFLOW_NON_INTERACTIVE%"=="1" if "%CI%"=="" pause
exit /b %SERVER_EXIT%
