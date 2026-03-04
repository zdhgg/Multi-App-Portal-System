@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"

:menu
cls
call :detect_pm2_state
call :detect_health
call :detect_autostart
echo ============================================================
echo Portal System - One-Click Control
echo ============================================================
echo.
echo Current Status:
echo   PM2 portal-api: %PM2_STATE% ^(PID: %PM2_PID%^)
echo   Health: %HEALTH_STATE%
echo   PM2 Auto-Start: %AUTOSTART_STATE%
echo.
echo [1] Start
echo [2] Restart
echo [3] Stop
echo [4] Status
echo [5] Build Frontend + Restart
echo [6] Open Local Portal
echo [7] Enable PM2 Auto-Start
echo [8] Disable PM2 Auto-Start
echo [Q] Quit
echo.
choice /C 12345678Q /N /M "Select action (1/2/3/4/5/6/7/8/Q): "
if errorlevel 9 goto end
if errorlevel 8 goto do_disable_autostart
if errorlevel 7 goto do_enable_autostart
if errorlevel 6 goto do_open
if errorlevel 5 goto do_build_restart
if errorlevel 4 goto do_status
if errorlevel 3 goto do_stop
if errorlevel 2 goto do_restart
if errorlevel 1 goto do_start
goto menu

:do_start
echo.
echo ============================================================
echo Starting Portal...
echo ============================================================
echo.
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Startup failed with exit code %EXIT_CODE%.
  echo Check logs with: pm2 logs portal-api
) else (
  echo [OK] Startup completed.
)
pause
goto menu

:do_restart
echo.
echo ============================================================
echo Restarting Portal...
echo ============================================================
echo.
pm2 restart portal-api >nul 2>nul
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo [WARN] portal-api is not running. Trying start flow...
  "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
  set "EXIT_CODE=%ERRORLEVEL%"
  if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Restart/start failed with exit code %EXIT_CODE%.
    echo Check logs with: pm2 logs portal-api
    pause
    goto menu
  )
)
echo [OK] Restart completed.
pm2 status
pause
goto menu

:do_stop
echo.
echo ============================================================
echo Stopping Portal...
echo ============================================================
echo.
pm2 stop portal-api >nul 2>nul
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo [WARN] Stop command failed or process is not running.
  echo You can inspect with: pm2 status
) else (
  echo [OK] portal-api stopped.
)
pm2 status
pause
goto menu

:do_status
echo.
echo ============================================================
echo Portal Status
echo ============================================================
echo.
pm2 status
echo.
echo Health check:
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://localhost:8002/health' -UseBasicParsing -TimeoutSec 5; Write-Host ('[OK] /health HTTP ' + $r.StatusCode) } catch { Write-Host '[WARN] /health unavailable' }"
pause
goto menu

:do_build_restart
echo.
echo ============================================================
echo Building Frontend and Restarting Portal...
echo ============================================================
echo.
if not exist "%~dp0main-portal\package.json" (
  echo [ERROR] Frontend project not found: main-portal\package.json
  pause
  goto menu
)

where npm >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  echo [ERROR] npm not found in PATH.
  echo Please install Node.js and ensure npm is available.
  pause
  goto menu
)

pushd "%~dp0main-portal"
call npm run build
set "EXIT_CODE=%ERRORLEVEL%"
popd

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Frontend build failed with exit code %EXIT_CODE%.
  pause
  goto menu
)

echo [OK] Frontend build completed.
echo.
pm2 restart portal-api >nul 2>nul
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo [WARN] portal-api is not running. Trying start flow...
  "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
  set "EXIT_CODE=%ERRORLEVEL%"
  if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Restart/start failed with exit code %EXIT_CODE%.
    echo Check logs with: pm2 logs portal-api
    pause
    goto menu
  )
)
echo [OK] Backend restart completed.
pm2 status
pause
goto menu

:do_open
echo.
echo ============================================================
echo Opening Local Portal...
echo ============================================================
echo.
set "PORTAL_URL=http://localhost:8002"
start "" "%PORTAL_URL%"
echo [OK] Browser opened: %PORTAL_URL%
pause
goto menu

:do_enable_autostart
echo.
echo ============================================================
echo Enabling PM2 Auto-Start...
echo ============================================================
echo.
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure-startup.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Auto-start setup failed with exit code %EXIT_CODE%.
  echo Try running this script as Administrator if needed.
) else (
  call :detect_autostart
  if /i "%AUTOSTART_STATE%"=="enabled" (
    echo [OK] PM2 auto-start is enabled.
  ) else (
    echo [WARN] Setup completed but auto-start status is still unknown/disabled.
  )
  echo Tip: Ensure app process is saved with "pm2 save".
)
pause
goto menu

:do_disable_autostart
echo.
echo ============================================================
echo Disabling PM2 Auto-Start...
echo ============================================================
echo.
where pm2-startup >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  call pm2-startup uninstall >nul 2>nul
  set "UNINSTALL_EXIT=%ERRORLEVEL%"
) else (
  set "UNINSTALL_EXIT=1"
  echo [WARN] pm2-startup command not found, trying registry cleanup only.
)

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PM2 /f >nul 2>nul
set "REG_EXIT=%ERRORLEVEL%"

if "%UNINSTALL_EXIT%"=="0" (
  echo [OK] pm2-startup uninstall executed.
) else (
  echo [INFO] pm2-startup uninstall not executed or returned non-zero.
)

if "%REG_EXIT%"=="0" (
  echo [OK] HKCU startup entry "PM2" removed.
) else (
  echo [INFO] HKCU startup entry "PM2" was not present.
)

call :detect_autostart
if /i "%AUTOSTART_STATE%"=="disabled" (
  echo [OK] PM2 auto-start is disabled.
) else (
  echo [WARN] PM2 auto-start still appears enabled.
)
pause
goto menu

:detect_pm2_state
set "PM2_STATE=unknown"
set "PM2_PID=0"
for /f "usebackq delims=" %%A in (`pm2 pid portal-api 2^>nul`) do (
  if "!PM2_PID!"=="0" set "PM2_PID=%%A"
)
set "PM2_PID=!PM2_PID: =!"
set /a PM2_PID_NUM=0
set /a PM2_PID_NUM=!PM2_PID! 2>nul
if errorlevel 1 set /a PM2_PID_NUM=0
set "PM2_PID=!PM2_PID_NUM!"
if !PM2_PID_NUM! GTR 0 (
  set "PM2_STATE=online"
) else (
  set "PM2_STATE=offline"
)
exit /b 0

:detect_health
if /i not "%PM2_STATE%"=="online" (
  set "HEALTH_STATE=not-running"
  exit /b 0
)

where curl >nul 2>nul
if errorlevel 1 (
  set "HEALTH_STATE=unknown"
  exit /b 0
)

set "HEALTH_CODE=000"
for /f "usebackq delims=" %%A in (`curl -s -o nul -w "%%{http_code}" http://localhost:8002/health 2^>nul`) do set "HEALTH_CODE=%%A"
if "!HEALTH_CODE!"=="200" (
  set "HEALTH_STATE=ok (200)"
) else if "!HEALTH_CODE!"=="000" (
  set "HEALTH_STATE=unreachable"
) else (
  set "HEALTH_STATE=http !HEALTH_CODE!"
)
exit /b 0

:detect_autostart
set "AUTOSTART_STATE=disabled"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PM2 >nul 2>nul
if not errorlevel 1 (
  set "AUTOSTART_STATE=enabled"
)
exit /b 0

:end
exit /b 0
