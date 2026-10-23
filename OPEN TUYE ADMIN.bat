@echo off
title Tuye Bites Admin (keep this window open)
cd /d "%~dp0"
rem Close an older copy that may still be running, so the newest version always starts
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5700 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
echo Starting Tuye Bites on this computer... keep this window open.
echo This is the TEST copy. Nothing here is online yet.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5700/admin.html"
node dev-server.mjs
