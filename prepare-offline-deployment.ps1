#!/usr/bin/env pwsh
# 准备离线部署包脚本

Write-Host "📦 准备离线部署包..." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

# 1. 检查依赖是否完整
Write-Host "`n🔍 步骤 1/5: 检查项目依赖..." -ForegroundColor Yellow

Set-Location "$projectRoot\detection-api"
if (-not (Test-Path "node_modules")) {
    Write-Host "   正在安装后端依赖..." -ForegroundColor Gray
    npm install
}
Write-Host "   ✅ 后端依赖完整" -ForegroundColor Green

Set-Location "$projectRoot\main-portal"
if (-not (Test-Path "node_modules")) {
    Write-Host "   正在安装前端依赖..." -ForegroundColor Gray
    npm install
}
Write-Host "   ✅ 前端依赖完整" -ForegroundColor Green

# 2. 构建前端
Write-Host "`n🏗️  步骤 2/5: 构建前端..." -ForegroundColor Yellow
Set-Location "$projectRoot\main-portal"
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
npm run build
Write-Host "   ✅ 前端构建完成" -ForegroundColor Green

# 3. 清理不必要的文件
Write-Host "`n🧹 步骤 3/5: 清理临时文件..." -ForegroundColor Yellow
Set-Location $projectRoot

$cleanupPaths = @(
    "detection-api\logs\*.log",
    "detection-api\data\*.db-shm",
    "detection-api\data\*.db-wal",
    "detection-api\data\test-*.db",
    "detection-api\cache\*",
    "main-portal\.vite",
    "main-portal\node_modules\.cache",
    ".git\*.log"
)

foreach ($path in $cleanupPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "   ✅ 清理完成" -ForegroundColor Green

# 4. 创建部署说明文件
Write-Host "`n📝 步骤 4/5: 创建部署说明..." -ForegroundColor Yellow

$deploymentGuide = @"
# 离线部署指南

## 内网电脑必备软件
1. Node.js v18+ (推荐 v22.x)
   - 安装包：请从本目录的 installers 文件夹获取
   - 或从 https://nodejs.org 下载

2. PM2（Node.js 安装后执行）
   - 在本目录执行: npm install -g pm2

## 部署步骤

### 方法一：使用一键启动脚本（推荐）
1. 解压本文件夹到任意位置
2. 打开 PowerShell，进入项目目录
3. 执行: .\start-production.ps1
4. 浏览器访问: http://localhost:8002

### 方法二：手动启动
1. 解压本文件夹
2. 打开 PowerShell
3. cd 到项目目录
4. 执行: pm2 start ecosystem-prod-tsx.config.js --env production
5. 查看状态: pm2 status

## 验证安装

运行以下命令检查环境：
``````powershell
# 检查 Node.js
node --version  # 应该显示 v18+ 或更高

# 检查 npm
npm --version

# 检查 PM2
pm2 --version
``````

## 常用命令

- 查看状态: pm2 status
- 查看日志: pm2 logs portal-api
- 重启服务: pm2 restart portal-api
- 停止服务: pm2 stop portal-api

## 故障排查

1. 端口被占用
   - 检查 8002 端口: netstat -ano | findstr :8002
   - 修改端口: 编辑 ecosystem-prod-tsx.config.js

2. 服务启动失败
   - 查看日志: pm2 logs portal-api --lines 50
   - 检查依赖: 确保 node_modules 文件夹完整

3. 页面无法访问
   - 检查防火墙设置
   - 确认服务已启动: pm2 status

## 技术支持

项目版本: v1.0.0
生成时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path "$projectRoot\OFFLINE_DEPLOYMENT.md" -Value $deploymentGuide -Encoding UTF8
Write-Host "   ✅ 部署说明已创建" -ForegroundColor Green

# 5. 创建检查脚本
Write-Host "`n🔧 步骤 5/5: 创建环境检查脚本..." -ForegroundColor Yellow

$checkScript = @'
#!/usr/bin/env pwsh
# 环境检查脚本

Write-Host "🔍 检查部署环境..." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$issues = @()

# 检查 Node.js
Write-Host "`n1. 检查 Node.js..."
try {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js: $nodeVersion" -ForegroundColor Green
    
    $versionNumber = [version]($nodeVersion -replace 'v', '')
    if ($versionNumber.Major -lt 18) {
        $issues += "Node.js 版本过低，需要 v18 或更高"
    }
} catch {
    Write-Host "   ❌ Node.js 未安装" -ForegroundColor Red
    $issues += "请先安装 Node.js (https://nodejs.org)"
}

# 检查 npm
Write-Host "`n2. 检查 npm..."
try {
    $npmVersion = npm --version
    Write-Host "   ✅ npm: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ npm 未安装" -ForegroundColor Red
    $issues += "npm 应该随 Node.js 一起安装"
}

# 检查 PM2
Write-Host "`n3. 检查 PM2..."
try {
    $pm2Version = pm2 --version
    Write-Host "   ✅ PM2: v$pm2Version" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  PM2 未安装" -ForegroundColor Yellow
    Write-Host "   运行: npm install -g pm2" -ForegroundColor Gray
    $issues += "请安装 PM2: npm install -g pm2"
}

# 检查项目文件
Write-Host "`n4. 检查项目文件..."
$requiredPaths = @(
    "detection-api/node_modules",
    "detection-api/src",
    "main-portal/dist",
    "ecosystem-prod-tsx.config.js",
    "start-production.ps1"
)

foreach ($path in $requiredPaths) {
    if (Test-Path $path) {
        Write-Host "   ✅ $path" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $path 缺失" -ForegroundColor Red
        $issues += "缺少必需文件: $path"
    }
}

# 检查端口
Write-Host "`n5. 检查端口占用..."
$portCheck = netstat -ano | findstr :8002
if ($portCheck) {
    Write-Host "   ⚠️  端口 8002 已被占用" -ForegroundColor Yellow
    Write-Host "   $portCheck" -ForegroundColor Gray
} else {
    Write-Host "   ✅ 端口 8002 可用" -ForegroundColor Green
}

# 总结
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
if ($issues.Count -eq 0) {
    Write-Host "✅ 环境检查通过，可以部署！" -ForegroundColor Green
    Write-Host "`n运行 .\start-production.ps1 启动服务" -ForegroundColor Cyan
} else {
    Write-Host "❌ 发现 $($issues.Count) 个问题：" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "   • $issue" -ForegroundColor Yellow
    }
}
Write-Host "=" * 60 -ForegroundColor Cyan
'@

Set-Content -Path "$projectRoot\check-environment.ps1" -Value $checkScript -Encoding UTF8
Write-Host "   ✅ 检查脚本已创建" -ForegroundColor Green

# 完成
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "✅ 离线部署包准备完成！" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`n📦 包含内容：" -ForegroundColor Cyan
Write-Host "   • 完整的项目代码和依赖" -ForegroundColor White
Write-Host "   • 已构建的前端文件" -ForegroundColor White
Write-Host "   • PM2 配置文件" -ForegroundColor White
Write-Host "   • 启动脚本" -ForegroundColor White
Write-Host "   • 部署文档" -ForegroundColor White

Write-Host "`n📋 下一步：" -ForegroundColor Cyan
Write-Host "   1. 将整个文件夹打包（zip/tar.gz）" -ForegroundColor White
Write-Host "   2. 拷贝到内网电脑" -ForegroundColor White
Write-Host "   3. 解压到任意位置" -ForegroundColor White
Write-Host "   4. 在内网电脑运行 .\check-environment.ps1 检查环境" -ForegroundColor White
Write-Host "   5. 运行 .\start-production.ps1 启动服务" -ForegroundColor White

Write-Host "`n⚠️  重要提示：" -ForegroundColor Yellow
Write-Host "   内网电脑需要先安装 Node.js 和 PM2" -ForegroundColor White
Write-Host "   建议下载 Node.js 安装包一起拷贝过去" -ForegroundColor White

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan

