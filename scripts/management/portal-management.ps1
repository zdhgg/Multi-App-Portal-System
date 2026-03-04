# 门户系统管理脚本
# 提供简单的命令行界面来管理门户系统

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'monitor', 'save', 'help')]
    [string]$Command = 'help'
)

$ErrorActionPreference = "Stop"
$PrimaryProcessName = 'portal-api'
$LegacyProcessName = 'portal-backend'

function Get-Pm2ProcessList {
    try {
        $jlistRaw = pm2 jlist 2>$null
        if ([string]::IsNullOrWhiteSpace($jlistRaw)) {
            return @()
        }
        return $jlistRaw | ConvertFrom-Json
    } catch {
        return @()
    }
}

function Get-RunningPortalProcessName {
    $processes = Get-Pm2ProcessList
    foreach ($name in @($PrimaryProcessName, $LegacyProcessName)) {
        $process = $processes | Where-Object { $_.name -eq $name -and $_.pm2_env.status -eq 'online' } | Select-Object -First 1
        if ($process) {
            return $name
        }
    }
    return $null
}

function Get-ExistingPortalProcessName {
    $processes = Get-Pm2ProcessList
    foreach ($name in @($PrimaryProcessName, $LegacyProcessName)) {
        $process = $processes | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if ($process) {
            return $name
        }
    }
    return $null
}

function Show-Header {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  智能多Web应用门户系统 - 管理工具" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Help {
    Show-Header
    Write-Host "用法: .\portal-management.ps1 <command>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "可用命令:" -ForegroundColor Cyan
    Write-Host "  start    - 启动门户系统后端服务" -ForegroundColor White
    Write-Host "  stop     - 停止门户系统后端服务" -ForegroundColor White
    Write-Host "  restart  - 重启门户系统后端服务" -ForegroundColor White
    Write-Host "  status   - 查看服务状态" -ForegroundColor White
    Write-Host "  logs     - 查看实时日志" -ForegroundColor White
    Write-Host "  monitor  - 打开PM2监控面板" -ForegroundColor White
    Write-Host "  save     - 保存PM2配置（开机自启）" -ForegroundColor White
    Write-Host "  help     - 显示此帮助信息" -ForegroundColor White
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Cyan
    Write-Host "  .\portal-management.ps1 start" -ForegroundColor Gray
    Write-Host "  .\portal-management.ps1 restart" -ForegroundColor Gray
    Write-Host "  .\portal-management.ps1 logs" -ForegroundColor Gray
    Write-Host ""
}

function Start-Portal {
    Show-Header
    Write-Host "🚀 启动门户系统..." -ForegroundColor Yellow
    Write-Host ""
    
    # 检查是否已经在运行
    $runningProcess = Get-RunningPortalProcessName
    if ($runningProcess) {
        Write-Host "✅ 门户系统已经在运行中" -ForegroundColor Green
        Write-Host ""
        pm2 status $runningProcess
        return
    }
    
    # 启动服务
    & "$PSScriptRoot\..\startup\start-with-pm2-guardian.ps1"
}

function Stop-Portal {
    Show-Header
    Write-Host "🛑 停止门户系统..." -ForegroundColor Yellow
    Write-Host ""
    
    $targetProcess = Get-ExistingPortalProcessName
    if (-not $targetProcess) {
        Write-Host "ℹ️ 未检测到门户服务进程" -ForegroundColor Yellow
        return
    }

    $stopSucceeded = $false

    pm2 stop $PrimaryProcessName 2>$null
    if ($LASTEXITCODE -eq 0) {
        $stopSucceeded = $true
    }

    pm2 stop $LegacyProcessName 2>$null
    if ($LASTEXITCODE -eq 0) {
        $stopSucceeded = $true
    }
    
    if ($stopSucceeded) {
        Write-Host ""
        Write-Host "✅ 门户系统已停止" -ForegroundColor Green
    } else {
        Write-Host "⚠️ 停止命令未成功执行，请检查 PM2 状态" -ForegroundColor Yellow
    }
}

function Restart-Portal {
    Show-Header
    Write-Host "🔄 重启门户系统..." -ForegroundColor Yellow
    Write-Host ""

    $targetProcess = Get-ExistingPortalProcessName
    if (-not $targetProcess) {
        Write-Host "ℹ️ 未检测到已存在进程，改为执行启动流程" -ForegroundColor Yellow
        Start-Portal
        return
    }

    pm2 restart $targetProcess
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ 门户系统已重启" -ForegroundColor Green
        Write-Host ""
        
        # 等待服务就绪
        Write-Host "等待服务就绪..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
        
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:8002/health" -ErrorAction Stop
            Write-Host "✅ 服务健康检查通过" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  健康检查失败，请查看日志" -ForegroundColor Yellow
        }
    }
}

function Show-Status {
    Show-Header
    Write-Host "📊 服务状态" -ForegroundColor Cyan
    Write-Host ""

    $targetProcess = Get-ExistingPortalProcessName
    if ($targetProcess) {
        pm2 status $targetProcess
    } else {
        Write-Host "ℹ️ 当前未检测到门户服务进程（portal-api/portal-backend）" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    # 尝试健康检查
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8002/health" -ErrorAction Stop
        Write-Host "✅ 健康检查: 正常" -ForegroundColor Green
        Write-Host "   版本: $($health.version)" -ForegroundColor Gray
        Write-Host "   运行时间: $([math]::Round($health.uptime, 2))秒" -ForegroundColor Gray
    } catch {
        Write-Host "❌ 健康检查: 失败" -ForegroundColor Red
        Write-Host "   服务可能未运行或端口不可访问" -ForegroundColor Gray
    }
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Show-Logs {
    Show-Header
    Write-Host "📝 实时日志（按 Ctrl+C 退出）" -ForegroundColor Cyan
    Write-Host ""

    $targetProcess = Get-ExistingPortalProcessName
    if (-not $targetProcess) {
        $targetProcess = $PrimaryProcessName
        Write-Host "ℹ️ 未检测到现有进程，默认尝试查看 $targetProcess 日志" -ForegroundColor Yellow
    }

    pm2 logs $targetProcess
}

function Show-Monitor {
    Show-Header
    Write-Host "📊 启动PM2监控面板..." -ForegroundColor Cyan
    Write-Host ""
    
    pm2 monit
}

function Save-Config {
    Show-Header
    Write-Host "💾 保存PM2配置..." -ForegroundColor Yellow
    Write-Host ""
    
    pm2 save
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ PM2配置已保存" -ForegroundColor Green
        Write-Host ""
        Write-Host "要设置开机自启动，请运行:" -ForegroundColor Cyan
        Write-Host "  pm2 startup" -ForegroundColor White
        Write-Host ""
        Write-Host "然后按照提示以管理员身份执行生成的命令" -ForegroundColor Gray
    }
}

# 主逻辑
try {
    switch ($Command) {
        'start'   { Start-Portal }
        'stop'    { Stop-Portal }
        'restart' { Restart-Portal }
        'status'  { Show-Status }
        'logs'    { Show-Logs }
        'monitor' { Show-Monitor }
        'save'    { Save-Config }
        'help'    { Show-Help }
        default   { Show-Help }
    }
} catch {
    Write-Host ""
    Write-Host "❌ 错误: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

