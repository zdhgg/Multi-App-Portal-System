@echo off
setlocal
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"

if not exist "%~dp0scripts\management\start-portal-wizard.ps1" (
  echo [ERROR] start-portal-wizard.ps1 not found.
  pause
  exit /b 1
)

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\management\start-portal-wizard.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
exit /b %EXIT_CODE%
