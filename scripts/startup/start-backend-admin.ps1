# 以管理员权限启动后端服务
# 这个脚本会检查是否有管理员权限，如果没有则请求提升权限

param(
    [switch]$SkipPM2Fix = $false
)

# 检查是否以管理员权限运行
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 如果不是管理员，重新以管理员权限启动
if (-not (Test-Administrator)) {
    Write-Host "⚠️  当前没有管理员权限，正在请求提升权限..." -ForegroundColor Yellow
    
    # 构建参数
    $arguments = "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($SkipPM2Fix) {
        $arguments += " -SkipPM2Fix"
    }
    
    # 以管理员权限重新启动
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

Write-Host "✅ 已获得管理员权限" -ForegroundColor Green
Write-Host ""

# 计算项目根目录和后端目录
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendPath = Join-Path $projectRoot "detection-api"

# 显示目录信息
Write-Host "📁 脚本目录: $PSScriptRoot" -ForegroundColor Cyan
Write-Host "📁 项目根目录: $projectRoot" -ForegroundColor Cyan
Write-Host ""

# 可选：修复 PM2
if (-not $SkipPM2Fix) {
    Write-Host "🔧 正在修复 PM2..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        # 终止 PM2 守护进程
        Write-Host "  ⏹️  停止 PM2 守护进程..." -ForegroundColor Gray
        pm2 kill 2>&1 | Out-Null
        
        # 等待一下
        Start-Sleep -Seconds 2
        
        # 重新启动 PM2 守护进程
        Write-Host "  ▶️  重新启动 PM2 守护进程..." -ForegroundColor Gray
        $pingResult = pm2 ping 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ PM2 修复成功！" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  PM2 修复可能未完全成功，但会继续启动服务" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ⚠️  PM2 修复出错: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  继续启动服务..." -ForegroundColor Gray
    }
    
    Write-Host ""
}

if (-not (Test-Path $backendPath)) {
    Write-Host "❌ 错误: 找不到后端目录 $backendPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "📂 进入后端目录: $backendPath" -ForegroundColor Cyan
Set-Location $backendPath

# 检查 node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "⚠️  检测到 node_modules 不存在，正在安装依赖..." -ForegroundColor Yellow
    Write-Host ""
    
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ 依赖安装失败！" -ForegroundColor Red
        Write-Host ""
        Write-Host "按任意键退出..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ 依赖安装成功！" -ForegroundColor Green
}

# 检查 .env 文件
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "⚠️  检测到 .env 文件不存在" -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Write-Host "  正在从 .env.example 创建 .env 文件..." -ForegroundColor Gray
        Copy-Item ".env.example" ".env"
        Write-Host "  ✅ .env 文件已创建，请根据需要修改配置" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  也找不到 .env.example 文件，请手动创建 .env 文件" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🚀 启动后端服务..." -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# 启动服务
npm run dev

# 如果服务退出，等待用户按键
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "服务已停止。按任意键退出..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
