@echo off
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
