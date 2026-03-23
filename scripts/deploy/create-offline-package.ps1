#!/usr/bin/env pwsh
# Portal System - Offline Deployment Package Generator v1.1.0

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Portal System - Offline Deployment Package Generator v1.1.0" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Step 1: Check dependencies
Write-Host "`n[1/6] Checking dependencies..." -ForegroundColor Yellow

Set-Location "$projectRoot\detection-api"
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing backend dependencies..." -ForegroundColor Gray
    npm install --legacy-peer-deps
}
Write-Host "   OK: Backend dependencies" -ForegroundColor Green

Set-Location "$projectRoot\main-portal"
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing frontend dependencies..." -ForegroundColor Gray
    npm install --legacy-peer-deps
}
Write-Host "   OK: Frontend dependencies" -ForegroundColor Green

# Step 2: Build frontend
if (-not $SkipBuild) {
    Write-Host "`n[2/6] Building frontend..." -ForegroundColor Yellow
    Set-Location "$projectRoot\main-portal"
    
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force "dist"
    }
    
    npm run build
    
    if (-not (Test-Path "dist\index.html")) {
        Write-Host "   FAILED: Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "   OK: Frontend built" -ForegroundColor Green
} else {
    Write-Host "`n[2/6] Skipping frontend build" -ForegroundColor Gray
}

# Step 3: Cleanup
Write-Host "`n[3/6] Cleaning temp files..." -ForegroundColor Yellow
Set-Location $projectRoot

$cleanupPatterns = @(
    "detection-api\logs\*.log",
    "detection-api\data\*.db-shm",
    "detection-api\data\*.db-wal",
    "detection-api\cache\build-cache\*",
    "main-portal\.vite"
)

foreach ($pattern in $cleanupPatterns) {
    $fullPath = Join-Path $projectRoot $pattern
    if (Test-Path $fullPath) {
        Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "   OK: Cleanup done" -ForegroundColor Green

# Step 4: Generate deployment guide
Write-Host "`n[4/6] Generating deployment guide..." -ForegroundColor Yellow

$guide = @"
# Portal System - Offline Deployment Guide

## Requirements
- Windows 10/11
- Node.js v18+
- PM2 (npm install -g pm2)

## Quick Start (3 Steps)

### Step 1: Install Node.js
Download from https://nodejs.org or use provided installer

### Step 2: Install PM2
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

### Step 3: Start Service
```powershell
cd "project-directory"
.\start-production.ps1
```

## LAN Access

### Configure Firewall (Run as Admin)
```powershell
.\configure-firewall.ps1
```

### Access URLs
- Local: http://localhost:8002
- LAN: http://<server-ip>:8002

Check server IP: ipconfig | findstr "IPv4"

## Common Commands
- pm2 status          - View status
- pm2 logs portal-api - View logs
- pm2 restart portal-api - Restart
- pm2 stop portal-api - Stop

## Troubleshooting

### Port in use
```powershell
netstat -ano | findstr :8002
taskkill /PID <pid> /F
```

### Service failed to start
```powershell
pm2 logs portal-api --lines 100
```

---
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path "$projectRoot\DEPLOYMENT_GUIDE.md" -Value $guide -Encoding UTF8
Write-Host "   OK: Deployment guide created" -ForegroundColor Green

# Step 5: Generate helper scripts
Write-Host "`n[5/6] Generating helper scripts..." -ForegroundColor Yellow

# 5.1 Firewall script
$fwScript = @'
#Requires -RunAsAdministrator
# Configure Windows Firewall for LAN access

Write-Host "Configuring Windows Firewall..." -ForegroundColor Cyan

$ports = @(8002, 3000, 3051, 3061, 3071, 8051, 8061, 8071)

foreach ($port in $ports) {
    $ruleName = "Portal-Port-$port"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
        Write-Host "   Added: Port $port" -ForegroundColor Green
    } else {
        Write-Host "   Exists: Port $port" -ForegroundColor Gray
    }
}

Write-Host "`nFirewall configured!" -ForegroundColor Green
Write-Host "`nLAN Access URLs:" -ForegroundColor Cyan

Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
    ForEach-Object { Write-Host "   http://$($_.IPAddress):8002" }
'@

Set-Content -Path "$projectRoot\configure-firewall.ps1" -Value $fwScript -Encoding UTF8
Write-Host "   OK: configure-firewall.ps1" -ForegroundColor Green

# 5.2 Environment check script
$checkScript = @'
# Environment Check Script

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Environment Check" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$issues = @()

# Check Node.js
Write-Host "`nChecking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version
    $major = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
    if ($major -ge 18) {
        Write-Host "   OK: Node.js $nodeVer" -ForegroundColor Green
    } else {
        Write-Host "   WARN: Node.js $nodeVer (v18+ recommended)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   FAIL: Node.js not installed" -ForegroundColor Red
    $issues += "Install Node.js v18+ from https://nodejs.org"
}

# Check PM2
Write-Host "`nChecking PM2..." -ForegroundColor Yellow
try {
    $pm2Ver = pm2 --version
    Write-Host "   OK: PM2 v$pm2Ver" -ForegroundColor Green
} catch {
    Write-Host "   FAIL: PM2 not installed" -ForegroundColor Red
    $issues += "Install PM2: npm install -g pm2"
}

# Check files
Write-Host "`nChecking project files..." -ForegroundColor Yellow
$files = @(
    "detection-api\node_modules",
    "detection-api\src\server.ts",
    "main-portal\dist\index.html",
    "ecosystem-prod-loader.config.js",
    "start-production.ps1"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "   OK: $f" -ForegroundColor Green
    } else {
        Write-Host "   FAIL: $f missing" -ForegroundColor Red
        $issues += "Missing: $f"
    }
}

# Check port
Write-Host "`nChecking port 8002..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "   WARN: Port 8002 in use (PID: $($portInUse.OwningProcess))" -ForegroundColor Yellow
} else {
    Write-Host "   OK: Port 8002 available" -ForegroundColor Green
}

# Network info
Write-Host "`nNetwork Info:" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
    ForEach-Object { Write-Host "   $($_.IPAddress) ($($_.InterfaceAlias))" -ForegroundColor Cyan }

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan
if ($issues.Count -eq 0) {
    Write-Host "Ready to deploy! Run: .\start-production.ps1" -ForegroundColor Green
} else {
    Write-Host "Issues found:" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
}
'@

Set-Content -Path "$projectRoot\check-environment.ps1" -Value $checkScript -Encoding UTF8
Write-Host "   OK: check-environment.ps1" -ForegroundColor Green

# 5.3 Startup script
$startupScript = @'
# Configure PM2 auto-start on Windows

Write-Host "Configuring PM2 auto-start..." -ForegroundColor Cyan

# Install pm2-windows-startup
$hasStartup = npm list -g pm2-windows-startup 2>$null
if (-not $hasStartup -or $hasStartup -like "*empty*") {
    Write-Host "   Installing pm2-windows-startup..." -ForegroundColor Gray
    npm install -g pm2-windows-startup
}

# Configure
pm2-startup install
pm2 save

Write-Host "`nAuto-start configured!" -ForegroundColor Green
Write-Host "PM2 will auto-start after system reboot." -ForegroundColor Cyan
'@

Set-Content -Path "$projectRoot\configure-startup.ps1" -Value $startupScript -Encoding UTF8
Write-Host "   OK: configure-startup.ps1" -ForegroundColor Green

# Step 6: Complete
Write-Host "`n[6/6] Complete!" -ForegroundColor Yellow

Write-Host @"

============================================================
  Offline Deployment Package Ready!
============================================================

Included:
  - detection-api/     Backend API (with node_modules)
  - main-portal/dist/  Frontend build
  - start-production.ps1      Start script
  - check-environment.ps1     Environment check
  - configure-firewall.ps1    Firewall config
  - configure-startup.ps1     Auto-start config
  - DEPLOYMENT_GUIDE.md       Deployment guide

Deployment Steps:
  1. Copy entire project folder to target machine
  2. Install Node.js v18+ and PM2
  3. Run: .\check-environment.ps1
  4. Run: .\configure-firewall.ps1 (as Admin)
  5. Run: .\start-production.ps1
  6. Run: .\configure-startup.ps1 (for auto-start)

Access URLs:
  Local: http://localhost:8002
"@ -ForegroundColor Cyan

# Show LAN IPs
Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
    ForEach-Object { Write-Host "  LAN: http://$($_.IPAddress):8002" -ForegroundColor Cyan }

Write-Host "`n============================================================" -ForegroundColor Cyan

Set-Location $projectRoot
