@echo off
title Tuye Bites - add the menu (test copy)
cd /d "%~dp0"
set "NODE="
where node >nul 2>&1 && set "NODE=node"
for /d %%d in ("%~dp0node-v*-win-x64") do if exist "%%d\node.exe" set "NODE=%%d\node.exe"
if not defined NODE ( echo Node.js not found. & pause & exit /b 1 )
echo Adding the foods from the menu photos to the TEST copy...
"%NODE%" handover-tools\import-menu.mjs > "%~dp0import.log" 2>&1
type "%~dp0import.log"
echo.
echo Refresh the shop page (F5) to see the foods.
pause
