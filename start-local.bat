@echo off
REM ============================================================
REM  Run WhatsApp Control locally (backend + dashboard).
REM  Double-click this file to start everything.
REM  Your PC runs the WhatsApp browser, so linking actually works
REM  (unlike free cloud tiers, which lack the memory for Chromium).
REM ============================================================
echo Starting WhatsApp Control locally...
echo.

start "WhatsApp Backend"   cmd /k "cd /d %~dp0backend && npm start"
timeout /t 4 >nul
start "WhatsApp Dashboard" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 6 >nul
start "" http://localhost:3000

echo.
echo   Backend   : http://localhost:4000
echo   Dashboard : http://localhost:3000  (opening in your browser)
echo.
echo   Two terminal windows opened - keep them open while using the app.
echo   Close both windows to stop.
echo.
pause
