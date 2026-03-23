# 智能多Web应用门户系统 - 开发环境启动脚本
# 在新的终端窗口中启动前端和后端服务

Write-Host "🚀 启动智能多Web应用门户系统开发环境..." -ForegroundColor Green

# 获取当前脚本路径
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptPath "..\..")).Path
$BackendPath = Join-Path $ProjectRoot "detection-api"
$FrontendPath = Join-Path $ProjectRoot "main-portal"

if (-not (Test-Path $BackendPath)) {
    Write-Host "❌ 找不到后端目录: $BackendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $FrontendPath)) {
    Write-Host "❌ 找不到前端目录: $FrontendPath" -ForegroundColor Red
    exit 1
}

# 启动后端服务（在新窗口）
Write-Host "📡 启动后端服务 (端口: 8002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendPath'; Write-Host '🔧 后端服务启动中...' -ForegroundColor Cyan; npm run dev"

# 等待2秒让后端启动
Start-Sleep -Seconds 2

# 启动前端服务（在新窗口）
Write-Host "🎨 启动前端服务 (端口: 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendPath'; Write-Host '🎨 前端服务启动中...' -ForegroundColor Magenta; npm run dev"

Write-Host "✅ 启动命令已执行，请检查新开的窗口:" -ForegroundColor Green
Write-Host "   - 后端: http://localhost:8002" -ForegroundColor Cyan
Write-Host "   - 前端: http://localhost:3000" -ForegroundColor Magenta
Write-Host "   - API文档: http://localhost:8002/api/v2 (V2版本)" -ForegroundColor Blue

Write-Host "`n按任意键关闭此窗口..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
