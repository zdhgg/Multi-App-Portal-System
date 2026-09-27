#Requires -Version 5.1
<#
.SYNOPSIS
    门户系统看门狗 —— 自动恢复 portal-api（P1）

.DESCRIPTION
    由计划任务 PortalSystem-Watchdog 每 5 分钟调用一次，也可手动执行。
    覆盖三种失效场景：
      1) PM2 守护进程自己死了（2026-09-26 22:24:54 那次故障，spawn UNKNOWN）
         -> pm2 resurrect；若 dump 恢复不出来，则 pm2 start ecosystem.config.js
      2) 守护进程活着，但 portal-api 不是 online（stopped / errored / 不在列表里）
         -> pm2 restart，最差 pm2 start ecosystem.config.js
      3) 进程 online 但 8002 端口连续两个周期都不监听（进程假死）
         -> pm2 restart portal-api

    维护模式：创建 <项目根>\logs\WATCHDOG_PAUSED 文件即跳过本轮自愈。
              加 -Force 可强制忽略维护模式。

.PARAMETER DryRun
    只探测并打印判断结果，不执行任何 pm2 写操作、不写日志文件。

.PARAMETER Force
    忽略维护模式标志文件。

.EXAMPLE
    pwsh -NoProfile -File scripts\monitoring\portal-watchdog.ps1 -DryRun

.EXAMPLE
    # 暂停自动恢复
    New-Item -ItemType File -Force "logs\WATCHDOG_PAUSED"
    # 恢复自动恢复
    Remove-Item "logs\WATCHDOG_PAUSED"
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

# 计划任务里的 pwsh 默认用系统代码页（中文环境为 936），原生命令输出的
# 框线字符（│）会被错误解码，导致解析失效。强制 UTF-8。
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }
try { $OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }

# ---------------------------------------------------------------- 常量
$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot   = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
$logDir        = Join-Path $projectRoot 'logs'
$watchLog      = Join-Path $logDir 'watchdog.log'
$lastRunFile   = Join-Path $logDir 'watchdog-last-run.txt'
$pauseFlag     = Join-Path $logDir 'WATCHDOG_PAUSED'
$missFile      = Join-Path $logDir '.watchdog-port-misses'
$ecoFile       = 'ecosystem.config.js'
$appName       = 'portal-api'
$appPort       = 8002
$maxPortMisses = 2
$maxWatchLog   = 5MB
$readyTimeout  = 120   # 拉起后等待端口就绪的最长秒数（tsx 冷启动实测约 40-90 秒）

# 计划任务环境里 PATH 可能不含 npm 全局目录，这里补上
if ($env:APPDATA) {
    $npmGlobal = Join-Path $env:APPDATA 'npm'
    if ((Test-Path -LiteralPath $npmGlobal) -and ($env:Path -notlike "*$npmGlobal*")) {
        $env:Path = "$npmGlobal;$env:Path"
    }
}

# ---------------------------------------------------------------- 工具函数
function Resolve-Pm2Path {
    if ($script:Pm2Path) { return $script:Pm2Path }
    $candidates = @()
    if ($env:APPDATA) { $candidates += (Join-Path $env:APPDATA 'npm\pm2.cmd') }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'nodejs\pm2.cmd') }
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { $script:Pm2Path = $c; return $c }
    }
    $cmd = Get-Command pm2.cmd -ErrorAction SilentlyContinue
    if ($cmd) { $script:Pm2Path = $cmd.Source; return $cmd.Source }
    return $null
}

function Get-Pm2HomePath {
    if ($env:PM2_HOME) { return $env:PM2_HOME }
    if ($env:USERPROFILE) { return (Join-Path $env:USERPROFILE '.pm2') }
    return (Join-Path $env:APPDATA '.pm2')
}

function Write-WatchdogLog {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if (-not $DryRun) {
        try {
            if (-not (Test-Path -LiteralPath $logDir)) {
                New-Item -ItemType Directory -Path $logDir -Force | Out-Null
            }
            if ((Test-Path -LiteralPath $watchLog) -and
                ((Get-Item -LiteralPath $watchLog).Length -gt $maxWatchLog)) {
                Move-Item -LiteralPath $watchLog -Destination "$watchLog.1" -Force -ErrorAction SilentlyContinue
            }
            Add-Content -LiteralPath $watchLog -Value $line -Encoding utf8
        } catch { }
    }
    Write-Host $line
}

function Invoke-Pm2Command {
    param(
        [Parameter(Mandatory)][string[]]$Pm2Args,
        [int]$TimeoutSec = 150
    )
    $pm2 = Resolve-Pm2Path
    if (-not $pm2) {
        return [pscustomobject]@{ Ok = $false; Code = -1; Output = 'pm2 可执行文件未找到' }
    }
    $out  = ''
    $code = -1
    $prev = Get-Location
    try {
        Set-Location -LiteralPath $projectRoot
        $out  = (& $pm2 @Pm2Args 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } catch {
        $out  = $_.Exception.Message
        $code = -1
    } finally {
        Set-Location -LiteralPath $prev
    }
    return [pscustomobject]@{ Ok = ($code -eq 0); Code = $code; Output = $out }
}

function Test-Pm2Daemon {
    $pidFile = Join-Path (Get-Pm2HomePath) 'pm2.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) { return $false }
    $raw = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { return $false }
    $raw = $raw.Trim()
    if ($raw -notmatch '^\d+$') { return $false }
    $daemonPid = [int]$raw
    if (-not (Get-Process -Id $daemonPid -ErrorAction SilentlyContinue)) { return $false }
    # 防 PID 复用：命令行里应当能看到 pm2
    try {
        $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$daemonPid" -ErrorAction Stop).CommandLine
        if ($cl -and ($cl -notmatch 'pm2')) { return $false }
    } catch { }
    return $true
}

# 把 pm2 jlist 的顶层数组切成一个个对象字符串。
# 不能依赖 ConvertFrom-Json：pm2 的 env 里存在仅大小写不同的重复键
# （username / USERNAME），PowerShell 会直接报错。
function Split-JsonArray {
    param([Parameter(Mandatory)][string]$Text)
    $objects = New-Object System.Collections.Generic.List[string]
    $depth = 0; $start = -1; $inStr = $false; $esc = $false
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]
        if ($inStr) {
            if ($esc) { $esc = $false }
            elseif ($ch -eq '\') { $esc = $true }
            elseif ($ch -eq '"') { $inStr = $false }
            continue
        }
        if ($ch -eq '"') { $inStr = $true; continue }
        if ($ch -eq '{') {
            if ($depth -eq 0) { $start = $i }
            $depth++
        } elseif ($ch -eq '}') {
            $depth--
            if ($depth -eq 0 -and $start -ge 0) {
                $objects.Add($Text.Substring($start, $i - $start + 1))
                $start = -1
            }
        }
    }
    return $objects
}

# 只用 pm2 jlist（纯 ASCII 结构）判断状态，避免解析依赖终端的表格输出
function Get-AppStatus {
    $r = Invoke-Pm2Command -Pm2Args @('jlist')
    if (-not $r.Ok) { return 'unknown' }
    $text = "$($r.Output)".Trim()
    if (-not $text -or $text -eq '[]') { return 'absent' }
    foreach ($obj in (Split-JsonArray -Text $text)) {
        $nm = [regex]::Match($obj, '"name"\s*:\s*"([^"]+)"')
        if (-not $nm.Success -or $nm.Groups[1].Value -ne $appName) { continue }
        $st = [regex]::Match($obj, '"status"\s*:\s*"([^"]+)"')
        $statusValue = if ($st.Success) { $st.Groups[1].Value } else { 'unknown' }
        if ($statusValue -eq 'online') {
            # 状态说 online，再用 pid 复核一次，防 PID 被回收造成的假在线
            $pm = [regex]::Match($obj, '^\s*\{\s*"pid"\s*:\s*(\d+)')
            if ($pm.Success) {
                $p = [int]$pm.Groups[1].Value
                if ($p -le 0 -or -not (Get-Process -Id $p -ErrorAction SilentlyContinue)) {
                    return 'stopped'
                }
            }
        }
        return $statusValue
    }
    return 'absent'
}

function Test-PortListening {
    param([Parameter(Mandatory)][int]$Port)
    try {
        $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
        if ($c) { return $true }
    } catch { }
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok  = $iar.AsyncWaitHandle.WaitOne(2000, $false) -and $client.Connected
        $client.Close()
        return [bool]$ok
    } catch {
        return $false
    }
}

function Wait-PortReady {
    param([Parameter(Mandatory)][int]$Port, [int]$TimeoutSec = 120)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) { return $true }
        Start-Sleep -Seconds 3
    }
    return (Test-PortListening -Port $Port)
}

function Get-PortMisses {
    if (Test-Path -LiteralPath $missFile) {
        $v = Get-Content -LiteralPath $missFile -Raw -ErrorAction SilentlyContinue
        if ($v -and ($v.Trim() -match '^\d+$')) { return [int]$v.Trim() }
    }
    return 0
}

function Set-PortMisses {
    param([int]$Value)
    if ($DryRun) { return }
    try { Set-Content -LiteralPath $missFile -Value $Value -Encoding ascii } catch { }
}

# 记录"上次检查时间与结论"，方便人工确认看门狗在正常工作（每次覆盖，不增长）
function Set-LastRun {
    param([Parameter(Mandatory)][string]$Text)
    if ($DryRun) { return }
    try {
        if (-not (Test-Path -LiteralPath $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        Set-Content -LiteralPath $lastRunFile -Encoding utf8 -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text)
    } catch { }
}

# 统一动作出口：DryRun 时只报告，不执行
function Invoke-WatchdogAction {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][string[]]$Pm2Args
    )
    if ($DryRun) {
        Write-WatchdogLog "[DRYRUN] 本应执行：$Description（等价命令 pm2 $($Pm2Args -join ' ')）" 'WARN'
        return [pscustomobject]@{ Ok = $true; Code = 0; Output = ''; Skipped = $true }
    }
    Write-WatchdogLog "执行：$Description（pm2 $($Pm2Args -join ' ')）" 'WARN'
    $r = Invoke-Pm2Command -Pm2Args $Pm2Args
    if (-not $r.Ok) {
        Write-WatchdogLog "命令返回非零 exit=$($r.Code)：$(($r.Output -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1))" 'ERROR'
    }
    return $r
}

# ---------------------------------------------------------------- 主流程
$exitCode  = 0
$didAct    = $false

if ((Test-Path -LiteralPath $pauseFlag) -and (-not $Force)) {
    Write-Host "[watchdog] 维护模式：存在 $pauseFlag，本轮跳过自愈。"
    Set-LastRun '维护模式（WATCHDOG_PAUSED），已跳过'
    exit 0
}

$pm2Path = Resolve-Pm2Path
if (-not $pm2Path) {
    Write-WatchdogLog "找不到 pm2 可执行文件，无法自愈（检查 PATH 或 npm 全局目录）" 'ERROR'
    Set-LastRun '失败：找不到 pm2'
    exit 1
}

$daemonAlive = Test-Pm2Daemon

# --- 场景 1：PM2 守护进程死了 -------------------------------------
if (-not $daemonAlive) {
    Write-WatchdogLog 'PM2 守护进程未运行（pm2.pid 指向的进程已不存在）' 'WARN'
    Invoke-WatchdogAction -Description 'pm2 resurrect 恢复守护进程与进程列表' -Pm2Args @('resurrect') | Out-Null
    $didAct = $true
    if (-not $DryRun) {
        Start-Sleep -Seconds 3
        if ((Get-AppStatus) -eq 'absent') {
            Write-WatchdogLog "$appName 未出现在恢复后的进程列表中，直接按配置拉起" 'WARN'
            Invoke-WatchdogAction -Description "pm2 start $ecoFile" -Pm2Args @('start', $ecoFile) | Out-Null
        }
    }
}

# --- 场景 2：应用不在线 -------------------------------------------
$status = Get-AppStatus
$restartStatuses = @('stopped', 'stopping', 'errored', 'one-launch-status')

if ($status -eq 'absent') {
    Invoke-WatchdogAction -Description "$appName 不在 PM2 列表中，按配置拉起" -Pm2Args @('start', $ecoFile) | Out-Null
    $didAct = $true
} elseif ($restartStatuses -contains $status) {
    Invoke-WatchdogAction -Description "$appName 状态为 $status，尝试重启" -Pm2Args @('restart', $appName) | Out-Null
    $didAct = $true
    if (-not $DryRun) {
        Start-Sleep -Seconds 3
        if ((Get-AppStatus) -eq 'absent') {
            Invoke-WatchdogAction -Description "$appName 重启无效，按配置重新拉起" -Pm2Args @('start', $ecoFile) | Out-Null
        }
    }
} elseif ($status -eq 'unknown' -or $status -eq 'launching') {
    # 读不准或正在启动时宁可不动手，交给下面的端口探测兜底
    Write-WatchdogLog "$appName 当前状态为 $status，本轮不主动重启" 'WARN'
}

# --- 场景 3：端口健康 ---------------------------------------------
if ($DryRun) {
    Write-WatchdogLog ("[DRYRUN] 守护进程={0} 应用状态={1} 端口{2}监听={3}" -f $daemonAlive, $status, $appPort, (Test-PortListening -Port $appPort))
    Set-LastRun 'DryRun（未做任何修改）'
    exit 0
}

if ($didAct) {
    if (Wait-PortReady -Port $appPort -TimeoutSec $readyTimeout) {
        Write-WatchdogLog "自愈完成：$appName 已就绪，端口 $appPort 恢复监听"
        Set-PortMisses 0
    } else {
        Write-WatchdogLog "已执行恢复动作，但 $readyTimeout 秒内端口 $appPort 仍未监听" 'ERROR'
        Set-PortMisses 1
        $exitCode = 1
    }
} else {
    $nowListening = Test-PortListening -Port $appPort
    if ($nowListening) {
        Set-PortMisses 0
    } else {
        $misses = (Get-PortMisses) + 1
        if ($misses -ge $maxPortMisses) {
            Invoke-WatchdogAction -Description "$appName 连续 $misses 个周期在线但未监听 $appPort，强制重启" -Pm2Args @('restart', $appName) | Out-Null
            Set-PortMisses 0
            if (Wait-PortReady -Port $appPort -TimeoutSec $readyTimeout) {
                Write-WatchdogLog "强制重启后端口 $appPort 恢复监听"
            } else {
                Write-WatchdogLog "强制重启后端口 $appPort 仍未监听" 'ERROR'
                $exitCode = 1
            }
        } else {
            Write-WatchdogLog "$appName 在线但端口 $appPort 未监听（第 $misses/$maxPortMisses 次，下个周期再确认）" 'WARN'
            Set-PortMisses $misses
            $exitCode = 1
        }
    }
}

if ($exitCode -eq 0) {
    $statusNow = Get-AppStatus
    Write-Host ("[watchdog] OK  app={0} status={1} port{2}=listening" -f $appName, $statusNow, $appPort)
    Set-LastRun ("正常：{0} status={1}，端口 {2} 监听中" -f $appName, $statusNow, $appPort)
    # 每小时留一条心跳，平时保持安静；心跳超过这个间隔才补写
    $stale = $true
    if (Test-Path -LiteralPath $watchLog) {
        $stale = ((Get-Date) - (Get-Item -LiteralPath $watchLog).LastWriteTime).TotalMinutes -ge 60
    }
    if ($stale) {
        Write-WatchdogLog ("HEARTBEAT 正常：{0} status={1}，端口 {2} 监听中" -f $appName, $statusNow, $appPort)
    }
} else {
    Write-Host "[watchdog] ATTENTION  自愈未完成，详见 $watchLog"
    Set-LastRun ("异常：自愈未完成，详见 {0}" -f $watchLog)
}
exit $exitCode
