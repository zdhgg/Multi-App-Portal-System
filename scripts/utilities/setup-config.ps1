# 智能多Web应用门户系统V2 - 配置设置脚本

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("development", "production")]
    [string]$Environment = "development"
)

Write-Host "🔧 智能多Web应用门户系统V2 - 配置设置" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$configSource = ""
$configTarget = "detection-api\.env"

switch ($Environment) {
    "development" {
        $configSource = "configs\development.env"
        Write-Host "📝 设置开发环境配置..." -ForegroundColor Green
    }
    "production" {
        $configSource = "configs\production.env"
        Write-Host "📝 设置生产环境配置..." -ForegroundColor Yellow
        Write-Host "⚠️  注意：生产环境需要在 detection-api\.env 中手动填写JWT_SECRET、PM2_CONFIRMATION_TOKEN等敏感配置" -ForegroundColor Red
    }
}

if (Test-Path $configSource) {
    Copy-Item $configSource $configTarget -Force
    Write-Host "✅ 配置文件已复制: $configSource -> $configTarget" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "📋 配置摘要:" -ForegroundColor Blue
    Write-Host "  • 环境: $Environment" -ForegroundColor Gray
    Write-Host "  • 后端端口: 8002" -ForegroundColor Gray
    Write-Host "  • 前端端口: 3000" -ForegroundColor Gray
    Write-Host "  • API版本: V2 (Clean Architecture)" -ForegroundColor Gray
    
    if ($Environment -eq "production") {
        Write-Host ""
        Write-Host "🔐 生产环境安全提醒:" -ForegroundColor Yellow
        Write-Host "  1. 修改 JWT_SECRET 为强密钥" -ForegroundColor Red
        Write-Host "  2. 修改 PM2_CONFIRMATION_TOKEN 为随机令牌" -ForegroundColor Red
        Write-Host "  3. 设置正确的 CORS_ORIGIN 域名" -ForegroundColor Red
        Write-Host "  4. 检查所有敏感配置项" -ForegroundColor Red
    }
    
} else {
    Write-Host "❌ 配置文件不存在: $configSource" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 配置完成！现在可以使用以下命令启动系统:" -ForegroundColor Green
Write-Host "  • 统一启动: .\start.ps1" -ForegroundColor Cyan
Write-Host "  • 开发环境: .\scripts\startup\enhanced-start.ps1" -ForegroundColor Cyan
Write-Host "  • 简单启动: .\scripts\startup\start-dev.ps1" -ForegroundColor Cyan
Write-Host ""

if ($Environment -eq "development") {
    $response = Read-Host "是否立即启动开发环境？ (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "🚀 启动系统..." -ForegroundColor Green
        & ".\scripts\startup\enhanced-start.ps1"
    }
}
