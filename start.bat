@echo off
chcp 65001 > nul
rem Стартиране на платформата на Windows. Двойно щракване върху този файл.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Липсва Node.js.
  echo   Изтеглете го от https://nodejs.org, инсталирайте го и стартирайте отново.
  echo.
  pause
  exit /b 1
)

node server.js
pause
