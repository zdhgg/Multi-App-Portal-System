@echo off
setlocal
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\management\restore-portal.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [WARN] Restore assistant ended with exit code %EXIT_CODE%.
) else (
  echo [INFO] Restore assistant closed. Check the messages above for the actual restore result.
)

pause
exit /b %EXIT_CODE%
