#!/usr/bin/env pwsh
# Configure PM2 auto-start on Windows

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Configure PM2 Auto-Start on Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check if PM2 is installed
try {
    $pm2Ver = pm2 --version
    Write-Host "`n[OK] PM2 v$pm2Ver detected" -ForegroundColor Green
} catch {
    Write-Host "`n[FAIL] PM2 not installed. Run: npm install -g pm2" -ForegroundColor Red
    exit 1
}

# Install pm2-windows-startup
Write-Host "`nInstalling pm2-windows-startup..." -ForegroundColor Yellow
$hasStartup = npm list -g pm2-windows-startup 2>$null
if (-not $hasStartup -or $hasStartup -like "*empty*") {
    npm install -g pm2-windows-startup
    Write-Host "[OK] pm2-windows-startup installed" -ForegroundColor Green
} else {
    Write-Host "[OK] pm2-windows-startup already installed" -ForegroundColor Green
}

# Configure startup
Write-Host "`nConfiguring startup service..." -ForegroundColor Yellow
pm2-startup install

# Save current process list
Write-Host "`nSaving PM2 process list..." -ForegroundColor Yellow
pm2 save

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "Auto-start configured!" -ForegroundColor Green
Write-Host "PM2 will automatically start after system reboot." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
