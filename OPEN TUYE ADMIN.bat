@echo off
title Tuye Bites Admin (keep this window open)
cd /d "%~dp0"
rem Close an older copy that may still be running, so the newest version always starts
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5700 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
echo Starting Tuye Bites on this computer... keep this window open.
echo This is the TEST copy. Nothing here is online yet.
rem Use Node.js installed on this computer, or the Node.js folder unzipped inside this project (node-v...-win-x64)
set "NODE="
where node >nul 2>&1 && set "NODE=node"
for /d %%d in ("%~dp0node-v*-win-x64") do if exist "%%d\node.exe" set "NODE=%%d\node.exe"
for /d %%d in ("%~dp0node-v*-win-x64\node-v*-win-x64") do if exist "%%d\node.exe" set "NODE=%%d\node.exe"
if not defined NODE (
  > "%~dp0start.log" echo %DATE% %TIME% Node.js not found
  echo.
  echo Node.js is not on this computer, so the test copy cannot start.
  echo Install it from https://nodejs.org ^(the LTS button^), or download the Windows .zip
  echo from https://nodejs.org/en/download and unzip it inside this folder. Then try again.
  echo.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5700/admin.html"
rem What happens is written to start.log, so Claude can read it if something goes wrong
> "%~dp0start.log" echo %DATE% %TIME% using: %NODE%
"%NODE%" -v >> "%~dp0start.log" 2>&1
"%NODE%" dev-server.mjs 2>> "%~dp0start.log"
echo Exit code %ERRORLEVEL% >> "%~dp0start.log"
type "%~dp0start.log"
echo.
echo Tuye Bites stopped. If there is an error above, send a screenshot of this window to Claude.
pause
