@echo off
TITLE OmniFlow OS v1.0.2 Local Server
echo ========================================================
echo Starting OmniFlow OS v1.0.2 (Windows Local-First Production)
echo ========================================================
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH. Please install Node.js 22+ LTS.
  pause
  exit /b 1
)

for /f "tokens=1,2 delims=." %%a in ('node -v') do (
  set NODE_VER=%%a
)
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% lss 22 (
  echo [WARNING] Detected Node.js %NODE_VER%. Recommended Node version is 22+ LTS.
)

if not exist "%~dp0.env" (
  echo [SETUP] First run detected: initializing production security keys...
  call "%~dp0setup-keys.bat"
)

set NODE_ENV=production
set PORT=3000
set HOST=127.0.0.1
set DATA_DIR=%~dp0data

node dist-server/server.cjs
pause
