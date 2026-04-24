@echo off
setlocal
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"

echo ============================================================
echo Portal System - Quick Backup
echo ============================================================
echo.
echo Creating a full compressed backup...
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\management\backup.ps1" -Action backup -BackupType full -Compress
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Backup failed with exit code %EXIT_CODE%.
) else (
  echo [OK] Backup completed.
)

pause
exit /b %EXIT_CODE%
