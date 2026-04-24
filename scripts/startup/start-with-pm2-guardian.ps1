# PM2守护模式启动脚本 - 门户系统自我管理
# 
# 功能：
# 1. 将门户系统后端服务通过PM2管理
# 2. 实现自动重启、崩溃恢复
# 3. 提供完整的监控和日志

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  门户系统 PM2 守护模式启动" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# 切换到项目根目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
Set-Location $projectRoot

$primaryProcess = "portal-api"
$legacyProcess = "portal-backend"

function Get-Pm2CommandPath {
    foreach ($candidate in @("pm2.cmd", "pm2")) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

# 1. 检查PM2是否安装
Write-Host "📋 步骤 1/6: 检查PM2安装状态..." -ForegroundColor Yellow
try {
    $pm2Version = pm2 --version 2>$null
    Write-Host "   ✅ PM2已安装 (版本: $pm2Version)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ PM2未安装" -ForegroundColor Red
    Write-Host ""
    Write-Host "正在安装PM2..." -ForegroundColor Yellow
    npm install -g pm2
    Write-Host "   ✅ PM2安装完成" -ForegroundColor Green
}
$pm2Command = Get-Pm2CommandPath
Write-Host ""

# 2. 检查端口占用
Write-Host "📋 步骤 2/6: 检查端口占用..." -ForegroundColor Yellow
$connection = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue
if ($connection) {
    Write-Host "   ⚠️  端口 8002 已被占用" -ForegroundColor Yellow
    Write-Host "   进程 PID: $($connection.OwningProcess)" -ForegroundColor Gray
    
    $continue = Read-Host "是否终止占用进程并继续？(Y/N)"
    if ($continue -eq 'Y' -or $continue -eq 'y') {
        Stop-Process -Id $connection.OwningProcess -Force
        Start-Sleep -Seconds 2
        Write-Host "   ✅ 进程已终止" -ForegroundColor Green
    } else {
        Write-Host "   ❌ 用户取消操作" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ✅ 端口 8002 可用" -ForegroundColor Green
}
Write-Host ""

# 3. 清理旧的PM2进程
Write-Host "📋 步骤 3/6: 清理旧的PM2进程..." -ForegroundColor Yellow
$pm2ListOutput = pm2 list 2>$null
$existingProcess = $pm2ListOutput | Select-String "$primaryProcess|$legacyProcess"
if ($existingProcess) {
    Write-Host "   发现已存在的进程，正在删除..." -ForegroundColor Yellow
    if ($pm2ListOutput | Select-String "\b$([regex]::Escape($primaryProcess))\b") {
        pm2 delete $primaryProcess 2>$null | Out-Null
    }
    if ($pm2ListOutput | Select-String "\b$([regex]::Escape($legacyProcess))\b") {
        pm2 delete $legacyProcess 2>$null | Out-Null
    }
    Start-Sleep -Seconds 1
}
Write-Host "   ✅ 清理完成" -ForegroundColor Green
Write-Host ""

# 4. 创建日志目录
Write-Host "📋 步骤 4/6: 准备日志目录..." -ForegroundColor Yellow
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-Host "   ✅ 日志目录已创建: $logDir" -ForegroundColor Green
} else {
    Write-Host "   ✅ 日志目录已存在" -ForegroundColor Green
}
Write-Host ""

# 5. 使用PM2启动后端服务
Write-Host "📋 步骤 5/6: 使用PM2启动后端服务..." -ForegroundColor Yellow
Write-Host "   配置文件: pm2-guardian.config.js" -ForegroundColor Gray
Write-Host ""

$pm2ConfigPath = Join-Path $projectRoot "pm2-guardian.config.js"
if (-not (Test-Path $pm2ConfigPath)) {
    Write-Host "   ❌ 未找到配置文件: $pm2ConfigPath" -ForegroundColor Red
    exit 1
}
$pm2ConfigName = Split-Path $pm2ConfigPath -Leaf

if (-not $pm2Command) {
    Write-Host "   ❌ 未找到 PM2 可执行文件" -ForegroundColor Red
    exit 1
}

$stdoutFile = Join-Path $env:TEMP ("portal-pm2-start-{0}.out.log" -f ([guid]::NewGuid().ToString("N")))
$stderrFile = Join-Path $env:TEMP ("portal-pm2-start-{0}.err.log" -f ([guid]::NewGuid().ToString("N")))

try {
    $pm2StartProcess = Start-Process -FilePath $pm2Command -ArgumentList @("start", $pm2ConfigName) -WorkingDirectory $projectRoot -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    $pm2StartExitCode = $pm2StartProcess.ExitCode

    if (Test-Path $stdoutFile) {
        Get-Content -Path $stdoutFile -Encoding UTF8 | Out-Host
    }
    if (Test-Path $stderrFile) {
        Get-Content -Path $stderrFile -Encoding UTF8 | Out-Host
    }
} finally {
    Remove-Item -Path $stdoutFile -ErrorAction SilentlyContinue
    Remove-Item -Path $stderrFile -ErrorAction SilentlyContinue
}

Write-Host ""
if ($pm2StartExitCode -eq 0) {
    Write-Host "   ✅ 已提交 PM2 启动命令" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ PM2 返回了非零状态，继续检查服务是否已实际启动..." -ForegroundColor Yellow
}
Write-Host ""

# 6. 等待服务就绪并验证
Write-Host "📋 步骤 6/6: 验证服务状态..." -ForegroundColor Yellow
Write-Host "   等待服务启动（最多约60秒）..." -ForegroundColor Gray

$maxAttempts = 12
$attempt = 0
$serviceReady = $false

while ($attempt -lt $maxAttempts -and -not $serviceReady) {
    Start-Sleep -Seconds 1
    $attempt++
    
    try {
        $healthResponse = Invoke-WebRequest -Uri "http://localhost:8002/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ([int]$healthResponse.StatusCode -eq 200) {
            $serviceReady = $true
            Write-Host "   ✅ 服务健康检查通过！" -ForegroundColor Green
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host ""

if ($serviceReady) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  🎉 门户系统启动成功！" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 服务信息:" -ForegroundColor Cyan
    Write-Host "   • 后端API:  http://localhost:8002" -ForegroundColor White
    Write-Host "   • 健康检查: http://localhost:8002/health" -ForegroundColor White
    Write-Host "   • API文档:  http://localhost:8002/api/v2/docs" -ForegroundColor White
    Write-Host ""
    Write-Host "🔧 PM2管理命令:" -ForegroundColor Cyan
    Write-Host "   • 查看状态: pm2 status" -ForegroundColor White
    Write-Host "   • 查看日志: pm2 logs $primaryProcess" -ForegroundColor White
    Write-Host "   • 重启服务: pm2 restart $primaryProcess" -ForegroundColor White
    Write-Host "   • 停止服务: pm2 stop $primaryProcess" -ForegroundColor White
    Write-Host "   • 监控面板: pm2 monit" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 提示:" -ForegroundColor Cyan
    Write-Host "   • 服务已配置自动重启，崩溃时会自动恢复" -ForegroundColor Gray
    Write-Host "   • 日志保存在: $logDir" -ForegroundColor Gray
    Write-Host "   • 使用 'pm2 save' 保存配置（开机自启）" -ForegroundColor Gray
    Write-Host ""
    
    # 显示PM2状态
    pm2 status
    
} else {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "  ❌ 服务启动超时" -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host ""
    Write-Host "正在查看最近日志..." -ForegroundColor Yellow
    Write-Host ""
    pm2 logs $primaryProcess --lines 50 --nostream
    Write-Host ""
    Write-Host "请检查日志并修复问题后重试" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "按任意键继续..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

