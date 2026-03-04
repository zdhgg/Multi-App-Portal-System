# 智能多Web应用门户系统 - PM2部署脚本 (Windows PowerShell)
# 使用方法: .\deploy-pm2.ps1 [-Environment development|production]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("development", "production")]
    [string]$Environment = "development"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 开始部署智能多Web应用门户系统 (环境: $Environment)" -ForegroundColor Green

# 检查PM2是否安装
try {
    $pm2Version = pm2 --version
    Write-Host "✅ PM2已安装，版本: $pm2Version" -ForegroundColor Green
} catch {
    Write-Host "❌ PM2未安装，正在安装..." -ForegroundColor Yellow
    npm install -g pm2
}

# 检查Node.js版本
$nodeVersion = node --version
$requiredVersion = "v18.0.0"

if ([version]($nodeVersion -replace 'v','') -lt [version]($requiredVersion -replace 'v','')) {
    Write-Host "❌ Node.js版本需要 >= $requiredVersion，当前版本: $nodeVersion" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Node.js版本检查通过: $nodeVersion" -ForegroundColor Green

# 安装依赖
Write-Host "📦 安装后端依赖..." -ForegroundColor Yellow
Set-Location "detection-api"
npm install

Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
Set-Location "../main-portal"
npm install

# 构建项目
Write-Host "🔨 构建后端项目..." -ForegroundColor Yellow
Set-Location "../detection-api"
npm run build

if ($Environment -eq "production") {
    Write-Host "🔨 构建前端项目..." -ForegroundColor Yellow
    Set-Location "../main-portal"
    npm run build
}

# 返回项目根目录
Set-Location ".."

# 停止现有的PM2进程（如果存在）
Write-Host "🛑 停止现有服务..." -ForegroundColor Yellow
try {
    pm2 stop portal-api
    pm2 delete portal-api
} catch {
    # 忽略错误，可能是首次部署
}

if ($Environment -eq "production") {
    try {
        pm2 stop portal-frontend
        pm2 delete portal-frontend
    } catch {
        # 忽略错误
    }
}

# 创建日志目录
$logDir = "detection-api\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force
    Write-Host "✅ 创建日志目录: $logDir" -ForegroundColor Green
}

# 启动服务
Write-Host "🚀 启动后端服务..." -ForegroundColor Green
pm2 start ecosystem.config.js --env $Environment

if ($Environment -eq "production") {
    Write-Host "🚀 启动前端服务..." -ForegroundColor Green
    pm2 serve main-portal/dist 3000 --name "portal-frontend" --spa
}

# 保存PM2配置
Write-Host "💾 保存PM2配置..." -ForegroundColor Yellow
pm2 save

# 设置开机自启（仅生产环境）
if ($Environment -eq "production") {
    Write-Host "⚙️ 设置开机自启..." -ForegroundColor Yellow
    pm2 startup
}

# 显示状态
Write-Host "📊 服务状态:" -ForegroundColor Cyan
pm2 status

Write-Host ""
Write-Host "✅ 部署完成！" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 访问地址:" -ForegroundColor Cyan
Write-Host "  • 后端API: http://localhost:8002/api" -ForegroundColor White
Write-Host "  • 健康检查: http://localhost:8002/health" -ForegroundColor White

if ($Environment -eq "production") {
    Write-Host "  • 前端门户: http://localhost:3000" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "📝 开发环境说明:" -ForegroundColor Yellow
    Write-Host "  • 前端需要单独启动: cd main-portal && npm run dev" -ForegroundColor White
    Write-Host "  • 前端地址: http://localhost:3000" -ForegroundColor White
}

Write-Host ""
Write-Host "🔧 管理命令:" -ForegroundColor Cyan
Write-Host "  • 查看状态: pm2 status" -ForegroundColor White
Write-Host "  • 查看日志: pm2 logs portal-api" -ForegroundColor White
Write-Host "  • 实时监控: pm2 monit" -ForegroundColor White
Write-Host "  • 重启服务: pm2 restart portal-api" -ForegroundColor White
Write-Host "  • 停止服务: pm2 stop portal-api" -ForegroundColor White
Write-Host ""
