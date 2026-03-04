#!/usr/bin/env pwsh
# Environment Check Script for Portal System

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Portal System - Environment Check" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$issues = @()
$warnings = @()

# 1. Check Node.js
Write-Host "`n[1] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    
    if ($major -ge 18) {
        Write-Host "   [OK] Node.js $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] Node.js $nodeVersion (v18+ recommended)" -ForegroundColor Yellow
        $warnings += "Node.js version is low, recommend v18+"
    }
} catch {
    Write-Host "   [FAIL] Node.js not installed" -ForegroundColor Red
    $issues += "Install Node.js v18+ from https://nodejs.org"
}

# 2. Check npm
Write-Host "`n[2] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "   [OK] npm v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   [FAIL] npm not installed" -ForegroundColor Red
    $issues += "npm should be installed with Node.js"
}

# 3. Check PM2
Write-Host "`n[3] Checking PM2..." -ForegroundColor Yellow
try {
    $pm2Version = pm2 --version
    Write-Host "   [OK] PM2 v$pm2Version" -ForegroundColor Green
} catch {
    Write-Host "   [FAIL] PM2 not installed" -ForegroundColor Red
    $issues += "Install PM2: npm install -g pm2"
}

# 4. Check project files
Write-Host "`n[4] Checking project files..." -ForegroundColor Yellow
$requiredPaths = @(
    @{ Path = "detection-api\node_modules"; Desc = "Backend dependencies" },
    @{ Path = "detection-api\src\server.ts"; Desc = "Backend source" },
    @{ Path = "main-portal\dist\index.html"; Desc = "Frontend build" },
    @{ Path = "ecosystem-prod-tsx.config.js"; Desc = "PM2 config" },
    @{ Path = "start-production.ps1"; Desc = "Start script" }
)

foreach ($item in $requiredPaths) {
    if (Test-Path $item.Path) {
        Write-Host "   [OK] $($item.Desc)" -ForegroundColor Green
    } else {
        Write-Host "   [FAIL] $($item.Desc) missing" -ForegroundColor Red
        $issues += "Missing: $($item.Path)"
    }
}

# 5. Check port 8002
Write-Host "`n[5] Checking port 8002..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "   [WARN] Port 8002 in use (PID: $($portInUse.OwningProcess[0]))" -ForegroundColor Yellow
    $warnings += "Port 8002 is in use"
} else {
    Write-Host "   [OK] Port 8002 available" -ForegroundColor Green
}

# 6. Check firewall
Write-Host "`n[6] Checking firewall rules..." -ForegroundColor Yellow
$fwRule = Get-NetFirewallRule -DisplayName "Portal-System-Portal-Backend" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    # Backward compatibility with older rule naming
    $fwRule = Get-NetFirewallRule -DisplayName "Portal-Port-8002" -ErrorAction SilentlyContinue
}
if ($fwRule) {
    Write-Host "   [OK] Firewall rule configured" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Firewall not configured (LAN access may fail)" -ForegroundColor Yellow
    $warnings += "Run .\scripts\utilities\configure-firewall.ps1 as Admin"
}

# 7. Network info
Write-Host "`n[7] Network Info..." -ForegroundColor Yellow
$ips = Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }

foreach ($ip in $ips) {
    Write-Host "   [IP] $($ip.IPAddress) ($($ip.InterfaceAlias))" -ForegroundColor Cyan
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "[SUCCESS] Environment ready! Run: .\start-production.ps1" -ForegroundColor Green
} elseif ($issues.Count -eq 0) {
    Write-Host "[READY] Environment ready with $($warnings.Count) warning(s):" -ForegroundColor Yellow
    foreach ($w in $warnings) {
        Write-Host "   - $w" -ForegroundColor Yellow
    }
    Write-Host "`nYou can try: .\start-production.ps1" -ForegroundColor Cyan
} else {
    Write-Host "[FAILED] Found $($issues.Count) issue(s) to fix:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "   - $issue" -ForegroundColor Red
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
