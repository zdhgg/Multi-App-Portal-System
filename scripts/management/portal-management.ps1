# 门户系统管理脚本
# 提供简单的命令行界面来管理门户系统

param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'monitor', 'save', 'help')]
    [string]$Command = 'help'
)

$ErrorActionPreference = "Stop"
$PrimaryProcessName = 'portal-api'
$LegacyProcessName = 'portal-backend'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$StartProductionScript = Join-Path $ProjectRoot "start-production.ps1"

function Get-Pm2CommandPath {
    foreach ($candidate in @('pm2.cmd', 'pm2')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

function Get-PowerShellCommandPath {
    foreach ($candidate in @('pwsh.exe', 'powershell.exe')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

$Pm2Command = Get-Pm2CommandPath

function Test-Pm2Available {
    return -not [string]::IsNullOrWhiteSpace($Pm2Command)
}

function Invoke-Pm2 {
    param([string[]]$Arguments)

    if (-not (Test-Pm2Available)) {
        return [PSCustomObject]@{
            Output = @("未检测到 PM2 命令。")
            ExitCode = 127
        }
    }

    $output = & $Pm2Command @Arguments 2>&1 | ForEach-Object { "$_" }
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) {
        $exitCode = 0
    }

    return [PSCustomObject]@{
        Output = @($output)
        ExitCode = [int]$exitCode
    }
}

function Get-Pm2Pid {
    param([string]$ProcessName)

    $result = Invoke-Pm2 -Arguments @('pid', $ProcessName)
    if ($result.ExitCode -ne 0) {
        return $null
    }

    foreach ($line in $result.Output) {
        $trimmed = ([string]$line).Trim()
        if ($trimmed -match '^\d+$') {
            $processPid = [int]$trimmed
            if ($processPid -gt 0) {
                return $processPid
            }
        }
    }

    return $null
}

function Get-RunningPortalProcessName {
    foreach ($name in @($PrimaryProcessName, $LegacyProcessName)) {
        if (Get-Pm2Pid -ProcessName $name) {
            return $name
        }
    }

    return $null
}

function Get-RunningPortalProcessNames {
    $names = @()
    foreach ($name in @($PrimaryProcessName, $LegacyProcessName)) {
        if (Get-Pm2Pid -ProcessName $name) {
            $names += $name
        }
    }

    return $names
}

function Get-ListeningProcessInfo {
    param([int]$Port)

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $listener) {
        return [PSCustomObject]@{
            IsListening = $false
            Pid = $null
            ProcessName = $null
        }
    }

    $processName = $null
    try {
        $processName = (Get-Process -Id $listener.OwningProcess -ErrorAction Stop).ProcessName
    } catch {
    }

    return [PSCustomObject]@{
        IsListening = $true
        Pid = [int]$listener.OwningProcess
        ProcessName = $processName
    }
}

function Get-PortalHealthInfo {
    param([int]$TimeoutSeconds = 10)

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8002/health" -TimeoutSec $TimeoutSeconds -ErrorAction Stop

        $healthData = if ($response.data) { $response.data } else { $response }
        $statusText = if ($healthData.status) { [string]$healthData.status } else { "ok" }
        $versionText = if ($healthData.version) { [string]$healthData.version } else { $null }
        $uptimeValue = $null
        if ($null -ne $healthData.uptime) {
            try {
                $uptimeValue = [double]$healthData.uptime
            } catch {
            }
        }

        return [PSCustomObject]@{
            Healthy = $true
            StatusCode = 200
            StatusText = $statusText
            Version = $versionText
            UptimeSeconds = $uptimeValue
            Raw = $response
            Error = $null
        }
    } catch {
        return [PSCustomObject]@{
            Healthy = $false
            StatusCode = $null
            StatusText = $null
            Version = $null
            UptimeSeconds = $null
            Raw = $null
            Error = $_.Exception.Message
        }
    }
}

function Show-PortalStatusSummary {
    param([string]$Title = "服务状态")

    $runningProcess = Get-RunningPortalProcessName
    $pm2Pid = $null
    if ($runningProcess) {
        $pm2Pid = Get-Pm2Pid -ProcessName $runningProcess
    }

    $portInfo = Get-ListeningProcessInfo -Port 8002
    $healthInfo = Get-PortalHealthInfo -TimeoutSeconds 10

    Write-Host $Title -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "PM2: 未安装或不可用" -ForegroundColor Yellow
    } elseif ($runningProcess) {
        Write-Host ("PM2 进程: 运行中 ({0})" -f $runningProcess) -ForegroundColor Green
        Write-Host ("  PID: {0}" -f $pm2Pid) -ForegroundColor Gray
    } else {
        Write-Host "PM2 进程: 未运行" -ForegroundColor Yellow
    }

    if ($portInfo.IsListening) {
        $processName = if ($portInfo.ProcessName) { $portInfo.ProcessName } else { "未知进程" }
        Write-Host ("监听端口: 8002 已占用 ({0}, PID {1})" -f $processName, $portInfo.Pid) -ForegroundColor White
    } else {
        Write-Host "监听端口: 8002 未监听" -ForegroundColor Yellow
    }

    if ($healthInfo.Healthy) {
        Write-Host ("健康检查: 正常 (HTTP {0})" -f $healthInfo.StatusCode) -ForegroundColor Green
        if ($healthInfo.Version) {
            Write-Host ("  版本: {0}" -f $healthInfo.Version) -ForegroundColor Gray
        }
        if ($null -ne $healthInfo.UptimeSeconds) {
            Write-Host ("  运行时间: {0} 秒" -f [math]::Round($healthInfo.UptimeSeconds, 2)) -ForegroundColor Gray
        }
    } else {
        Write-Host "健康检查: 失败" -ForegroundColor Red
        Write-Host ("  原因: {0}" -f $healthInfo.Error) -ForegroundColor Gray
    }
}

function Show-Header {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  智能多 Web 应用门户系统 - 管理工具" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
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
    Write-Host "  monitor  - 打开 PM2 监控面板" -ForegroundColor White
    Write-Host "  save     - 保存 PM2 配置（开机自启）" -ForegroundColor White
    Write-Host "  help     - 显示帮助信息" -ForegroundColor White
    Write-Host ""
}

function Start-Portal {
    Show-Header
    Write-Host "正在启动门户系统..." -ForegroundColor Yellow
    Write-Host ""

    $runningProcess = Get-RunningPortalProcessName
    if ($runningProcess) {
        Write-Host "门户系统已经在运行中。" -ForegroundColor Green
        Write-Host ""
        Show-PortalStatusSummary -Title "当前状态"
        return 0
    }

    if (-not (Test-Path $StartProductionScript)) {
        Write-Host "未找到 start-production.ps1，无法执行启动。" -ForegroundColor Red
        return 1
    }

    $powerShellCommand = Get-PowerShellCommandPath
    if (-not $powerShellCommand) {
        Write-Host "未检测到可用的 PowerShell 可执行文件。" -ForegroundColor Red
        return 1
    }

    & $powerShellCommand -NoProfile -ExecutionPolicy Bypass -File $StartProductionScript -NonInteractive 2>&1 | Out-Host
    if ($null -eq $LASTEXITCODE) {
        return 0
    }

    return [int]$LASTEXITCODE
}

function Stop-Portal {
    Show-Header
    Write-Host "正在停止门户系统..." -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "未检测到 PM2，无法执行停止操作。" -ForegroundColor Red
        return 1
    }

    $runningProcesses = @(Get-RunningPortalProcessNames)
    if ($runningProcesses.Count -eq 0) {
        Write-Host "当前没有检测到正在运行的门户服务。" -ForegroundColor Yellow
        return 0
    }

    $stopAttempted = $false
    foreach ($processName in $runningProcesses) {
        $result = Invoke-Pm2 -Arguments @('stop', $processName)
        if ($result.ExitCode -eq 0) {
            Write-Host ("已向 PM2 发送停止命令: {0}" -f $processName) -ForegroundColor DarkGray
        }
        if ($result.ExitCode -eq 0) {
            $stopAttempted = $true
        }
    }

    Start-Sleep -Seconds 1
    $stillRunning = @(Get-RunningPortalProcessNames)
    if ($stillRunning.Count -eq 0 -and $stopAttempted) {
        Write-Host ""
        Write-Host "门户系统已停止。" -ForegroundColor Green
        return 0
    }

    Write-Host ""
    Write-Host "停止没有完全成功，请检查 PM2 状态。" -ForegroundColor Yellow
    return 1
}

function Restart-Portal {
    Show-Header
    Write-Host "正在重启门户系统..." -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "未检测到 PM2，改为执行启动流程。" -ForegroundColor Yellow
        return (Start-Portal)
    }

    $targetProcess = Get-RunningPortalProcessName
    if (-not $targetProcess) {
        Write-Host "当前没有运行中的门户进程，改为执行启动流程。" -ForegroundColor Yellow
        return (Start-Portal)
    }

    $result = Invoke-Pm2 -Arguments @('restart', $targetProcess)
    if ($result.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "门户系统已重启。" -ForegroundColor Green
        Write-Host ""
        Write-Host "等待服务就绪..." -ForegroundColor Gray
        Start-Sleep -Seconds 5

        try {
            $null = Invoke-RestMethod -Uri "http://localhost:8002/health" -ErrorAction Stop
            Write-Host "服务健康检查通过。" -ForegroundColor Green
        } catch {
            Write-Host "健康检查失败，请查看日志。" -ForegroundColor Yellow
        }

        return 0
    }

    return [int]$result.ExitCode
}

function Show-Status {
    Show-Header
    Show-PortalStatusSummary -Title "服务状态"
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    return 0
}

function Show-Logs {
    Show-Header
    Write-Host "实时日志（按 Ctrl+C 退出）" -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "未检测到 PM2，无法查看日志。" -ForegroundColor Red
        return 1
    }

    $targetProcess = Get-RunningPortalProcessName
    if (-not $targetProcess) {
        $targetProcess = $PrimaryProcessName
        Write-Host ("当前没有运行中的门户进程，默认尝试查看 {0} 日志。" -f $targetProcess) -ForegroundColor Yellow
    }

    & $Pm2Command logs $targetProcess | Out-Host
    if ($null -eq $LASTEXITCODE) {
        return 0
    }

    return [int]$LASTEXITCODE
}

function Show-Monitor {
    Show-Header
    Write-Host "正在启动 PM2 监控面板..." -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "未检测到 PM2，无法打开监控面板。" -ForegroundColor Red
        return 1
    }

    & $Pm2Command monit | Out-Host
    if ($null -eq $LASTEXITCODE) {
        return 0
    }

    return [int]$LASTEXITCODE
}

function Save-Config {
    Show-Header
    Write-Host "正在保存 PM2 配置..." -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Pm2Available)) {
        Write-Host "未检测到 PM2，无法保存配置。" -ForegroundColor Red
        return 1
    }

    $result = Invoke-Pm2 -Arguments @('save')
    if ($result.Output.Count -gt 0) {
        $result.Output | Out-Host
    }

    if ($result.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "PM2 配置已保存。" -ForegroundColor Green
        Write-Host "如需开机自启，请执行 pm2 startup 并按提示完成管理员授权。" -ForegroundColor Gray
    }

    return [int]$result.ExitCode
}

try {
    $exitCode = switch ($Command) {
        'start'   { Start-Portal }
        'stop'    { Stop-Portal }
        'restart' { Restart-Portal }
        'status'  { Show-Status }
        'logs'    { Show-Logs }
        'monitor' { Show-Monitor }
        'save'    { Save-Config }
        'help'    { Show-Help; 0 }
        default   { Show-Help; 1 }
    }

    if ($null -eq $exitCode) {
        $exitCode = 0
    }

    exit ([int]$exitCode)
} catch {
    Write-Host ""
    Write-Host ("错误: {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ""
    exit 1
}
