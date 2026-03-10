#!/usr/bin/env pwsh
# 智能多Web应用门户系统 - 生产环境快速启动脚本

Write-Host "🚀 智能多Web应用门户系统 - 生产环境启动" -ForegroundColor Cyan
Write-Host ('=' * 60) -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$pm2PermissionExitCode = 91
$adminStartScript = Join-Path $projectRoot "scripts\startup\start-backend-admin.ps1"
$portalPort = 8002

function Test-PM2PermissionIssue {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }

    return (
        $Text -match 'EPERM' -and (
            $Text -match 'rpc\.sock' -or
            $Text -match '\\.pm2\\pm2\.log' -or
            $Text -match 'operation not permitted'
        )
    )
}

function Exit-PM2PermissionIssue {
    param(
        [string]$CommandName,
        [string]$Details
    )

    Write-Host ""
    Write-Host "❌ 检测到 PM2 权限问题，当前无法继续启动。" -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($CommandName)) {
        Write-Host "   失败命令: pm2 $CommandName" -ForegroundColor Gray
    }
    Write-Host "   常见原因: PM2 守护进程以更高权限启动，或命名管道权限异常。" -ForegroundColor Gray
    Write-Host "   建议处理: 以管理员身份运行修复脚本" -ForegroundColor Yellow
    Write-Host "   脚本位置: $adminStartScript" -ForegroundColor White
    Write-Host "   或在管理员 PowerShell 中执行: pm2 kill / pm2 ping" -ForegroundColor Gray

    $firstLine = ($Details -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    if ($firstLine) {
        Write-Host "   原始提示: $firstLine" -ForegroundColor DarkGray
    }

    exit $pm2PermissionExitCode
}

function Remove-PM2NoiseLines {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $filteredLines = foreach ($line in ($Text -split "`r?`n")) {
        $trimmedLine = $line.TrimEnd()

        if ($trimmedLine -match '^\(node:\d+\)\s+\[DEP\d+\]') { continue }
        if ($trimmedLine -match '^\(Use `node --trace-deprecation') { continue }
        if ($trimmedLine -match '^RemoteException') { continue }
        if ($trimmedLine -match '^\s*\+ CategoryInfo') { continue }
        if ($trimmedLine -match '^\s*\+ FullyQualifiedErrorId') { continue }
        if ($trimmedLine -match '^\s*$') { continue }

        $trimmedLine
    }

    return ($filteredLines -join "`n").Trim()
}

function Get-PM2JsonPayload {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $match = [regex]::Match($Text, '\[\s*\{[\s\S]*\}\s*\]', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) {
        return $null
    }

    return $match.Value.Trim()
}

function Format-PM2Uptime {
    param(
        $UptimeValue
    )

    if ($null -eq $UptimeValue) {
        return 'N/A'
    }

    [double]$rawValue = 0
    if (-not [double]::TryParse($UptimeValue.ToString(), [ref]$rawValue)) {
        return 'N/A'
    }

    if ($rawValue -le 0) {
        return 'N/A'
    }

    if ($rawValue -gt 1000000000000) {
        $startedAt = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$rawValue).LocalDateTime
        $duration = (Get-Date) - $startedAt

        if ($duration.TotalHours -ge 1) {
            return ('{0:N1} 小时' -f $duration.TotalHours)
        }

        return ('{0:N1} 分钟' -f [Math]::Max($duration.TotalMinutes, 0))
    }

    return ('{0:N1} 分钟' -f ($rawValue / 1000 / 60))
}

function Show-PortalProcessSummary {
    param(
        $Process,
        [string]$DetectionMode = 'jlist'
    )

    if (-not $Process) {
        Write-Host '   portal-api: 未发现 PM2 进程' -ForegroundColor Yellow
        return
    }

    $pm2Env = $Process.pm2_env
    $status = if ($pm2Env -and $pm2Env.status) { $pm2Env.status } else { 'unknown' }
    $processId = if ($Process.pid) { $Process.pid } else { 'N/A' }
    $uptime = Format-PM2Uptime -UptimeValue $pm2Env.pm_uptime
    $restartCount = if ($pm2Env -and $null -ne $pm2Env.restart_time) { $pm2Env.restart_time } else { 'N/A' }
    $workingDir = if ($pm2Env -and $pm2Env.pm_cwd) { $pm2Env.pm_cwd } elseif ($pm2Env -and $pm2Env.cwd) { $pm2Env.cwd } else { 'N/A' }

    $statusColor = switch ($status) {
        'online' { 'Green' }
        'stopped' { 'Yellow' }
        'errored' { 'Red' }
        default { 'Gray' }
    }

    Write-Host "   名称: $($Process.name)" -ForegroundColor White
    Write-Host "   状态: $status" -ForegroundColor $statusColor
    Write-Host "   PID: $processId" -ForegroundColor Gray
    Write-Host "   运行时间: $uptime" -ForegroundColor Gray
    Write-Host "   重启次数: $restartCount" -ForegroundColor Gray
    Write-Host "   检测模式: $DetectionMode" -ForegroundColor DarkGray
    Write-Host "   工作目录: $workingDir" -ForegroundColor DarkGray
}

function Get-PortalProcessInfo {
    param(
        [string]$Name = 'portal-api'
    )

    try {
        $jlistResult = Invoke-PM2 -Arguments @('jlist') -Silent
        $jsonPayload = Get-PM2JsonPayload -Text $jlistResult.Output

        if (-not [string]::IsNullOrWhiteSpace($jsonPayload)) {
            $pm2List = $jsonPayload | ConvertFrom-Json
            if ($pm2List -isnot [System.Array]) {
                $pm2List = @($pm2List)
            }

            $process = $pm2List | Where-Object { $_.name -eq $Name } | Select-Object -First 1
            if ($process) {
                return [PSCustomObject]@{
                    Process = $process
                    DetectionMode = 'jlist'
                }
            }
        }
    } catch {
    }

    $pidText = (Invoke-PM2 -Arguments @('pid', $Name) -Silent).Output.Trim()
    [int]$pm2Pid = 0
    if ([int]::TryParse($pidText, [ref]$pm2Pid) -and $pm2Pid -gt 0) {
        return [PSCustomObject]@{
            Process = [PSCustomObject]@{
                name = $Name
                pid = $pm2Pid
                pm2_env = [PSCustomObject]@{
                    status = 'online'
                    pm_uptime = $null
                    restart_time = $null
                    PM2_ENABLED = $null
                    pm_cwd = $null
                }
            }
            DetectionMode = 'compat'
        }
    }

    return $null
}

function Get-ListeningProcessInfo {
    param(
        [int]$Port
    )

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $listener) {
        return [PSCustomObject]@{
            Port = $Port
            IsListening = $false
            Pid = 0
            ProcessName = $null
        }
    }

    $processName = $null
    try {
        $processName = (Get-Process -Id $listener.OwningProcess -ErrorAction Stop).ProcessName
    } catch {
    }

    return [PSCustomObject]@{
        Port = $Port
        IsListening = $true
        Pid = [int]$listener.OwningProcess
        ProcessName = $processName
    }
}

function Wait-ForExpectedPortOwner {
    param(
        [int]$Port,
        [int]$ExpectedPid,
        [int]$TimeoutSeconds = 10
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listener = Get-ListeningProcessInfo -Port $Port
        if ($ExpectedPid -gt 0 -and $listener.IsListening -and $listener.Pid -eq $ExpectedPid) {
            return $listener
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return Get-ListeningProcessInfo -Port $Port
}

function Show-PortOwnerSummary {
    param(
        $Listener,
        [string]$Prefix = '   '
    )

    if (-not $Listener -or -not $Listener.IsListening) {
        Write-Host "${Prefix}Port $portalPort listener: available" -ForegroundColor DarkGray
        return
    }

    $owner = if ($Listener.ProcessName) {
        "$($Listener.ProcessName) (PID $($Listener.Pid))"
    } else {
        "PID $($Listener.Pid)"
    }

    Write-Host "${Prefix}Port $portalPort listener: $owner" -ForegroundColor Yellow
}

function Invoke-PM2 {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [switch]$Silent
    )

    $pm2Executable = 'pm2.cmd'
    $pm2Command = Get-Command $pm2Executable -ErrorAction SilentlyContinue
    if ($pm2Command -and $pm2Command.Source) {
        $pm2Executable = $pm2Command.Source
    }

    $quotedArgs = foreach ($argument in $Arguments) {
        if ($argument -match '[\s"]') {
            '"' + ($argument -replace '"', '""') + '"'
        } else {
            $argument
        }
    }

    $commandLine = '"' + $pm2Executable + '" ' + ($quotedArgs -join ' ')

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'cmd.exe'
    $startInfo.Arguments = '/d /c ' + $commandLine
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['NODE_NO_WARNINGS'] = '1'

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $output = (($stdout + "`n" + $stderr).Trim())
    $exitCode = $process.ExitCode

    if (Test-PM2PermissionIssue -Text $output) {
        Exit-PM2PermissionIssue -CommandName ($Arguments -join ' ') -Details $output
    }

    $trimmedOutput = Remove-PM2NoiseLines -Text $output
    if (-not $Silent -and -not [string]::IsNullOrWhiteSpace($trimmedOutput)) {
        Write-Host $trimmedOutput
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output = $trimmedOutput
    }
}

# 生产环境前置检查：确保 JWT_SECRET 可用
function Test-WeakJwtSecret {
    param(
        [string]$Secret
    )

    if ([string]::IsNullOrWhiteSpace($Secret)) { return $true }
    if ($Secret.Length -lt 32) { return $true }

    $lowered = $Secret.ToLowerInvariant()
    $placeholderHints = @(
        "change-this",
        "replace-this",
        "your-super-secret",
        "your-jwt-secret",
        "your-secret-key"
    )

    foreach ($hint in $placeholderHints) {
        if ($lowered.Contains($hint)) {
            return $true
        }
    }

    return $false
}

function New-RandomSecret {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

function Ensure-JwtSecret {
    param(
        [string]$EnvPath
    )

    $envLines = @()
    if (Test-Path $EnvPath) {
        $envLines = Get-Content -Path $EnvPath -Encoding UTF8
    }

    $jwtLineIndex = -1
    for ($i = 0; $i -lt $envLines.Count; $i++) {
        if ($envLines[$i] -match '^\s*JWT_SECRET\s*=') {
            $jwtLineIndex = $i
            break
        }
    }

    $existingSecret = $null
    if ($jwtLineIndex -ge 0) {
        $existingLine = $envLines[$jwtLineIndex]
        if ($existingLine -match '^\s*JWT_SECRET\s*=\s*(.*)\s*$') {
            $existingSecret = $Matches[1].Trim()
        }
    }

    if (-not (Test-WeakJwtSecret -Secret $existingSecret)) {
        return
    }

    $newSecret = New-RandomSecret
    if ($jwtLineIndex -ge 0) {
        $envLines[$jwtLineIndex] = "JWT_SECRET=$newSecret"
        Write-Host "   ⚠️  检测到弱 JWT_SECRET，已自动更新为安全随机值" -ForegroundColor Yellow
    } else {
        if ($envLines.Count -gt 0 -and $envLines[-1].Trim() -ne "") {
            $envLines += ""
        }
        $envLines += "JWT_SECRET=$newSecret"
        Write-Host "   ✅ 已自动写入 JWT_SECRET 到 detection-api/.env" -ForegroundColor Green
    }

    Set-Content -Path $EnvPath -Value $envLines -Encoding UTF8
}

Write-Host "`n🔐 检查生产环境密钥..." -ForegroundColor Yellow
$backendEnvPath = Join-Path $projectRoot "detection-api\.env"
Ensure-JwtSecret -EnvPath $backendEnvPath

# 检查是否已有运行的实例
Write-Host "`n🔍 检查服务状态..." -ForegroundColor Yellow
$existingProcess = $null
$usedCompatMode = $false

try {
    $processInfo = Get-PortalProcessInfo -Name 'portal-api'
    if ($processInfo) {
        $existingProcess = $processInfo.Process
        $usedCompatMode = $processInfo.DetectionMode -eq 'compat'
    }
} catch {
    $usedCompatMode = $true
}

[int]$existingPm2Pid = 0
if ($existingProcess -and $existingProcess.pid) {
    [int]::TryParse($existingProcess.pid.ToString(), [ref]$existingPm2Pid) | Out-Null
}

$preStartListener = Get-ListeningProcessInfo -Port $portalPort
if ($preStartListener.IsListening -and ($existingPm2Pid -le 0 -or $preStartListener.Pid -ne $existingPm2Pid)) {
    Write-Host "❌ Port $portalPort is already owned by another process." -ForegroundColor Red
    Show-PortOwnerSummary -Listener $preStartListener
    Write-Host "   PM2 portal-api is not the active listener, so startup verification would be unreliable." -ForegroundColor Gray
    Write-Host "   Please stop that process or free port $portalPort before retrying." -ForegroundColor Gray
    exit 1
}

if ($existingProcess -and $existingProcess.pm2_env.status -eq "online") {
    Write-Host "   ✅ 服务已在运行中" -ForegroundColor Green
    Show-PortalProcessSummary -Process $existingProcess -DetectionMode $(if ($usedCompatMode) { 'compat' } else { 'jlist' })
    
    # 检查当前环境变量是否正确
    $currentPM2Enabled = $existingProcess.pm2_env.PM2_ENABLED
    if ($currentPM2Enabled -and $currentPM2Enabled -ne "1") {
        Write-Host "   ⚠️  PM2_ENABLED 未启用，需要重新加载环境变量" -ForegroundColor Yellow
    }
    
    $choice = Read-Host "`n是否重启服务? (y/N)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        Write-Host "`n🔄 重启服务（重新加载环境变量）..." -ForegroundColor Yellow
        # 🔧 修复：使用 delete + start 确保环境变量正确加载
        Invoke-PM2 -Arguments @('delete', 'portal-api') -Silent | Out-Null
        Start-Sleep -Seconds 1
        $pm2StartResult = Invoke-PM2 -Arguments @('start', 'ecosystem-prod-loader.config.js') -Silent
        if ($pm2StartResult.ExitCode -ne 0) {
            Write-Host "❌ PM2 重启失败！" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "`n跳过重启，服务继续运行" -ForegroundColor Gray
    }
} else {
    Write-Host "   🧹 清理旧的 PM2 进程记录..." -ForegroundColor DarkGray
    Invoke-PM2 -Arguments @('delete', 'portal-api') -Silent | Out-Null
    Start-Sleep -Seconds 1

    # 启动新实例
    Write-Host "`n🚀 启动新服务..." -ForegroundColor Yellow
    Set-Location $projectRoot
    
    # 使用 tsx 配置（不需要编译）
    $pm2StartResult = Invoke-PM2 -Arguments @('start', 'ecosystem-prod-loader.config.js') -Silent
    
    if ($pm2StartResult.ExitCode -ne 0) {
        Write-Host "❌ PM2 启动失败！" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ 服务启动成功" -ForegroundColor Green
}

# 等待服务完全启动
Write-Host "`n⏳ 等待服务完全启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 显示状态
Write-Host ("`n" + ('=' * 60)) -ForegroundColor Cyan
Write-Host "📊 当前状态" -ForegroundColor Cyan
Write-Host ('=' * 60) -ForegroundColor Cyan

$statusSnapshot = Get-PortalProcessInfo -Name 'portal-api'
if ($statusSnapshot) {
    $existingProcess = $statusSnapshot.Process
    $usedCompatMode = $statusSnapshot.DetectionMode -eq 'compat'
}

[int]$pm2Pid = 0
if ($statusSnapshot -and $statusSnapshot.Process -and $statusSnapshot.Process.pid) {
    [int]::TryParse($statusSnapshot.Process.pid.ToString(), [ref]$pm2Pid) | Out-Null
}

$listenerSnapshot = Wait-ForExpectedPortOwner -Port $portalPort -ExpectedPid $pm2Pid -TimeoutSeconds 8
if ($pm2Pid -le 0 -or -not $listenerSnapshot.IsListening -or $listenerSnapshot.Pid -ne $pm2Pid) {
    Write-Host "`n❌ Startup verification failed" -ForegroundColor Red
    if ($pm2Pid -le 0) {
        Write-Host "   PM2 did not report a valid PID for portal-api." -ForegroundColor Gray
    } else {
        Write-Host "   Expected listener PID: $pm2Pid" -ForegroundColor Gray
    }
    Show-PortOwnerSummary -Listener $listenerSnapshot
    Write-Host "   Refusing to treat an existing listener on port $portalPort as a successful startup." -ForegroundColor Gray
    Write-Host "   Run: pm2 logs portal-api --lines 40" -ForegroundColor Gray
    exit 1
}

Show-PortalProcessSummary -Process $existingProcess -DetectionMode $(if ($usedCompatMode) { 'compat' } else { 'jlist' })

# 健康检查
Write-Host "`n🏥 健康检查..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$portalPort/health" -Method Get -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ 健康检查通过 (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "⚠️  健康检查失败，请查看日志" -ForegroundColor Red
    Write-Host "   运行命令: pm2 logs portal-api" -ForegroundColor Gray

    $statusSnapshot = Get-PortalProcessInfo -Name 'portal-api'
    if ($statusSnapshot) {
        Show-PortalProcessSummary -Process $statusSnapshot.Process -DetectionMode $statusSnapshot.DetectionMode
    }

    $recentLogs = (Invoke-PM2 -Arguments @('logs', 'portal-api', '--lines', '40', '--nostream') -Silent).Output
    if ($recentLogs -match 'Server process exited with code 1') {
        Write-Host "   根因: 应用启动后立即退出 (exit code 1)" -ForegroundColor Red
    }
    if ($recentLogs -match 'JWT_SECRET not configured for production environment') {
        Write-Host "   根因: JWT_SECRET 缺失或不安全，已阻止生产环境启动" -ForegroundColor Red
        Write-Host "   处理: 检查 detection-api/.env 中 JWT_SECRET 是否为随机高强度值" -ForegroundColor Gray
    }

    exit 1
}

Write-Host ("`n" + ('=' * 60)) -ForegroundColor Cyan
Write-Host "📊 服务信息" -ForegroundColor Cyan
Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host "   🌐 访问地址: http://localhost:$portalPort" -ForegroundColor White
Write-Host "   📡 API 地址: http://localhost:$portalPort/api" -ForegroundColor White
Write-Host "   💚 健康检查: http://localhost:$portalPort/health" -ForegroundColor White

Write-Host "`n📝 常用命令:" -ForegroundColor Cyan
Write-Host "   pm2 status          # 查看服务状态" -ForegroundColor Gray
Write-Host "   pm2 logs portal-api # 查看日志" -ForegroundColor Gray
Write-Host "   pm2 restart portal-api # 重启服务" -ForegroundColor Gray
Write-Host "   pm2 stop portal-api # 停止服务" -ForegroundColor Gray
Write-Host "   pm2 delete portal-api # 删除服务" -ForegroundColor Gray
Write-Host "   pm2 save           # 保存当前配置" -ForegroundColor Gray
Write-Host "   pm2 startup        # 设置开机自启" -ForegroundColor Gray

Write-Host ("`n" + ('=' * 60)) -ForegroundColor Cyan

