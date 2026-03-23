@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PS_EXE=pwsh.exe"
set "PM2_PERMISSION_EXIT=91"
set "PORTAL_PORT=8002"

:menu
cls
echo ============================================================
echo Portal System - One-Click Control
echo ============================================================
echo.
echo Loading current status...
echo First launch can take a few seconds while PM2 and health checks initialize.
echo.
call :detect_pm2_state
call :detect_port_owner
call :detect_health
call :detect_autostart
cls
echo ============================================================
echo Portal System - One-Click Control
echo ============================================================
echo.
echo Current Status:
echo   PM2 portal-api: %PM2_STATE% ^(PID: %PM2_PID%^)
echo   Port %PORTAL_PORT%: %PORT_OWNER_LABEL%
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
call :detect_pm2_state
call :detect_port_owner
if /i "!PORT_OWNER_STATE!"=="external" (
  call :prompt_release_external_port
  if errorlevel 1 (
    pause
    goto menu
  )
)
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  if "%EXIT_CODE%"=="%PM2_PERMISSION_EXIT%" (
    call :handle_pm2_permission_issue
    goto menu
  )
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
call :detect_pm2_state
call :detect_port_owner
if /i "!PORT_OWNER_STATE!"=="external" (
  call :prompt_release_external_port
  if errorlevel 1 (
    pause
    goto menu
  )
)
pm2 restart portal-api >nul 2>nul
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo [WARN] portal-api is not running. Trying start flow...
  call :detect_pm2_state
  call :detect_port_owner
  if /i "!PORT_OWNER_STATE!"=="external" (
    call :prompt_release_external_port
    if errorlevel 1 (
      pause
      goto menu
    )
  )
  "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
  set "EXIT_CODE=%ERRORLEVEL%"
  if not "%EXIT_CODE%"=="0" (
    if "%EXIT_CODE%"=="%PM2_PERMISSION_EXIT%" (
      call :handle_pm2_permission_issue
      goto menu
    )
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
call :detect_pm2_state
call :detect_port_owner
call :detect_health
if /i "%PM2_STATE%"=="permission issue" (
  call :handle_pm2_permission_issue
  goto menu
)
echo.
echo ============================================================
echo Portal Status
echo ============================================================
echo.
echo Summary:
echo   PM2 portal-api: %PM2_STATE% ^(PID: %PM2_PID%^)
echo   Port %PORTAL_PORT%: %PORT_OWNER_LABEL%
echo   Health: %HEALTH_STATE%
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
  call :detect_pm2_state
  call :detect_port_owner
  if /i "!PORT_OWNER_STATE!"=="external" (
    call :prompt_release_external_port
    if errorlevel 1 (
      pause
      goto menu
    )
  )
  "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-production.ps1"
  set "EXIT_CODE=%ERRORLEVEL%"
  if not "%EXIT_CODE%"=="0" (
    if "%EXIT_CODE%"=="%PM2_PERMISSION_EXIT%" (
      call :handle_pm2_permission_issue
      goto menu
    )
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
set "PM2_RAW="
for /f "usebackq delims=" %%A in (`cmd /d /c "pm2 pid portal-api 2>&1"`) do (
  if not "%%~A"=="" (
    if not defined PM2_RAW set "PM2_RAW=%%~A"
    echo(%%~A| findstr /I /C:"EPERM" /C:"rpc.sock" /C:"operation not permitted" >nul && set "PM2_RAW=PM2_PERMISSION"
    if "!PM2_PID!"=="0" (
      echo(%%~A| findstr /R "^[0-9][0-9]*$" >nul && set "PM2_PID=%%~A"
    )
  )
)
if not defined PM2_RAW set "PM2_RAW=0"
if /i "!PM2_RAW!"=="PM2_PERMISSION" (
  set "PM2_STATE=permission issue"
  set "PM2_PID=N/A"
  exit /b 0
)
if "!PM2_PID!"=="0" (
  set "PM2_STATE=offline"
) else (
  set "PM2_STATE=online"
)
exit /b 0
exit /b 0

:detect_port_owner
set "PORT_OWNER_STATE=free"
set "PORT_OWNER_PID=0"
set "PORT_OWNER_NAME=unknown"
set "PORT_OWNER_LABEL=available"
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%PORTAL_PORT%" ^| findstr /C:"LISTENING"') do (
  if "!PORT_OWNER_PID!"=="0" set "PORT_OWNER_PID=%%A"
)
if "!PORT_OWNER_PID!"=="0" (
  set "PORT_OWNER_LABEL=available"
  exit /b 0
)
for /f "usebackq tokens=1 delims=," %%A in (`tasklist /fo csv /nh /fi "PID eq !PORT_OWNER_PID!"`) do (
  if /i "%%~A"=="INFO: No tasks are running which match the specified criteria." (
    set "PORT_OWNER_NAME=unknown"
  ) else if "!PORT_OWNER_NAME!"=="unknown" (
    set "PORT_OWNER_NAME=%%~A"
  )
)
if /i "!PM2_STATE!"=="online" if "!PORT_OWNER_PID!"=="!PM2_PID!" (
  set "PORT_OWNER_STATE=pm2"
  set "PORT_OWNER_LABEL=owned by PM2 portal-api (PID !PORT_OWNER_PID!)"
  exit /b 0
)
set "PORT_OWNER_STATE=external"
set "PORT_OWNER_LABEL=occupied by non-PM2 !PORT_OWNER_NAME! (PID !PORT_OWNER_PID!)"
exit /b 0

:prompt_release_external_port
if /i not "!PORT_OWNER_STATE!"=="external" exit /b 0
echo [WARN] Port %PORTAL_PORT% is occupied by !PORT_OWNER_NAME! (PID !PORT_OWNER_PID!).
choice /C YN /N /M "Stop this process and continue? (Y/N): "
if errorlevel 2 (
  echo [INFO] Startup cancelled. Free port %PORTAL_PORT% and try again.
  exit /b 1
)
echo [INFO] Stopping PID !PORT_OWNER_PID!...
taskkill /PID !PORT_OWNER_PID! /F >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to stop PID !PORT_OWNER_PID!.
  echo Close it manually, then retry.
  exit /b 1
)
timeout /t 1 /nobreak >nul
call :detect_pm2_state
call :detect_port_owner
if /i "!PORT_OWNER_STATE!"=="external" (
  echo [ERROR] Port %PORTAL_PORT% is still occupied by !PORT_OWNER_NAME! (PID !PORT_OWNER_PID!).
  exit /b 1
)
echo [OK] Port %PORTAL_PORT% is now available.
exit /b 0

:detect_health
if /i "%PM2_STATE%"=="permission issue" (
  set "HEALTH_STATE=pm2 permission issue"
  exit /b 0
)

if /i "!PORT_OWNER_STATE!"=="free" (
  set "HEALTH_STATE=unreachable"
  exit /b 0
)

where curl >nul 2>nul
if errorlevel 1 (
  set "HEALTH_STATE=unknown"
  exit /b 0
)

set "HEALTH_CODE=000"
for /f "usebackq delims=" %%A in (`curl.exe -s --connect-timeout 1 --max-time 2 -o nul -w "%%{http_code}" http://localhost:8002/health 2^>nul`) do set "HEALTH_CODE=%%A"
if "!HEALTH_CODE!"=="200" (
  if /i "!PORT_OWNER_STATE!"=="pm2" (
    set "HEALTH_STATE=ok (200, pm2)"
  ) else if /i "!PORT_OWNER_STATE!"=="external" (
    set "HEALTH_STATE=ok (200, external PID !PORT_OWNER_PID!)"
  ) else (
    set "HEALTH_STATE=ok (200)"
  )
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

:handle_pm2_permission_issue
echo [ERROR] Detected a PM2 permission problem.
echo.
echo This is usually caused by a PM2 daemon permission issue,
echo not by the project folder name itself.
echo Recommended fix: run the admin repair script.
echo.
echo Script: scripts\startup\start-backend-admin.ps1
echo.
choice /C YN /N /M "Launch the admin repair/start script now? (Y/N): "
if errorlevel 2 (
  echo.
  echo [INFO] Skipped launching the admin script.
  echo Please run scripts\startup\start-backend-admin.ps1 later.
  pause
  exit /b 0
)
echo.
echo [INFO] Launching admin repair/start script...
echo [INFO] A new administrator PowerShell window may appear.
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\startup\start-backend-admin.ps1"
set "ADMIN_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%ADMIN_EXIT_CODE%"=="0" (
  echo [WARN] Admin script returned exit code %ADMIN_EXIT_CODE%.
  echo Please check the new administrator PowerShell window.
) else (
  echo [OK] Admin script launched.
  echo If a UAC prompt appears, click Yes.
)
pause
exit /b 0

:end
exit /b 0
