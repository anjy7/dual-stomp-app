@echo off
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo Build failed. Install Node.js 22+ and run npm ci in this folder first.
  pause
  exit /b 1
)
start "Guitar Lab server - close to stop" cmd /k node dist/server.js
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4317
