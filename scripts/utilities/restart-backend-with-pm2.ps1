# Restart Backend Service with PM2 Enabled
# Note: .env file is automatically configured by the system

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Service Auto Restart Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $projectRoot "detection-api"
Set-Location $backendDir
Write-Host "Working directory: $backendDir" -ForegroundColor Gray
Write-Host ""

# Check .env file
$envPath = Join-Path $backendDir ".env"
if (Test-Path $envPath) {
    Write-Host "OK: .env file exists, PM2 config will auto-load" -ForegroundColor Green
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "PM2_ENABLED\s*=\s*1") {
        Write-Host "OK: PM2_ENABLED=1 is configured" -ForegroundColor Green
    } else {
        Write-Host "WARNING: PM2_ENABLED not found in .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: .env file not found" -ForegroundColor Yellow
}
Write-Host ""

# Start backend service
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting backend service..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "TIP: Wait for 'Server listening on http://localhost:8002'" -ForegroundColor Gray
Write-Host ""

npm run dev
