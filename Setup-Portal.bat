@echo off
setlocal
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"

echo ============================================================
echo Portal System - First-Time Setup
echo ============================================================
echo.

echo [1/3] Checking environment...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-environment.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo [WARN] Environment check reported issues.
)
echo.

echo [2/3] Configuring firewall rules (admin may be required)...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\utilities\configure-firewall.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo [WARN] Firewall setup did not complete. Run manually as Administrator:
  echo        .\scripts\utilities\configure-firewall.ps1
)
echo.

echo [3/3] Configuring PM2 auto-start...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure-startup.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo [WARN] Auto-start setup did not complete.
)
echo.

set "START_NOW=N"
set /p START_NOW=Start service now? (Y/N):
if /I "%START_NOW%"=="Y" (
  call "%~dp0Start-Portal.bat"
)

echo.
echo Setup finished.
pause
exit /b 0
