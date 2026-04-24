param(
    [string]$Selection = "",
    [switch]$Latest,
    [switch]$AutoRestart
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackupScript = Join-Path $PSScriptRoot "backup.ps1"
$PortalManagementScript = Join-Path $PSScriptRoot "portal-management.ps1"
$StartScript = Join-Path $ProjectRoot "start-production.ps1"
$BackupRegistryPath = Join-Path $ProjectRoot "backups\backup-registry.json"
$PowerShellExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } else { "powershell.exe" }
$Utf8Encoding = New-Object System.Text.UTF8Encoding($false)
$PortalPort = 8002

function Get-CommandPath {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

$Pm2Command = Get-CommandPath -Candidates @("pm2.cmd", "pm2")

function Show-Header {
    try {
        Clear-Host
    } catch {
    }
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "门户系统 - 离线恢复向导" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "该向导会执行安全的离线恢复。" -ForegroundColor Gray
    Write-Host "流程：校验备份 -> 停止门户服务 -> 执行恢复 -> 可选重启" -ForegroundColor Gray
    Write-Host ""
}

function Read-Utf8JsonFile {
    param([string]$Path)

    $resolvedPath = (Resolve-Path -Path $Path).ProviderPath
    $rawContent = [System.IO.File]::ReadAllText($resolvedPath, $Utf8Encoding)
    return $rawContent | ConvertFrom-Json
}

function Get-Backups {
    if (-not (Test-Path $BackupRegistryPath)) {
        return @()
    }

    $registry = Read-Utf8JsonFile -Path $BackupRegistryPath
    if (-not $registry.backups) {
        return @()
    }

    return @($registry.backups | Sort-Object { [DateTime]::Parse($_.createdAt) } -Descending)
}

function Format-BackupSize {
    param($Size)

    if ($null -eq $Size) {
        return "未知"
    }

    return ("{0:N2} MB" -f ($Size / 1MB))
}

function Format-BackupTime {
    param($CreatedAt)

    try {
        return ([DateTime]::Parse($CreatedAt).ToString("yyyy/MM/dd HH:mm:ss"))
    } catch {
        return [string]$CreatedAt
    }
}

function Test-IsPreRestoreBackup {
    param($Backup)

    if ($null -eq $Backup) {
        return $false
    }

    $backupName = [string]$Backup.name
    $description = [string]$Backup.description

    return $backupName.StartsWith("pre-restore-", [System.StringComparison]::OrdinalIgnoreCase) -or
        $description.StartsWith("Pre-restore backup", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-BackupDisplayName {
    param($Backup)

    if ($null -eq $Backup) {
        return ""
    }

    $backupName = [string]$Backup.name

    if (Test-IsPreRestoreBackup -Backup $Backup) {
        return "恢复前自动备份"
    }

    if ($backupName.StartsWith("scheduled-", [System.StringComparison]::OrdinalIgnoreCase)) {
        return "计划备份"
    }

    return $backupName
}

function Get-BackupDisplayNote {
    param($Backup)

    if ($null -eq $Backup) {
        return $null
    }

    $description = [string]$Backup.description

    if (Test-IsPreRestoreBackup -Backup $Backup) {
        $targetMatch = [regex]::Match($description, 'before restoring (.+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($targetMatch.Success) {
            return "说明：上一次恢复前自动创建的兜底备份；当时准备恢复：$($targetMatch.Groups[1].Value)"
        }

        return "说明：上一次恢复前自动创建的兜底备份。"
    }

    if (([string]$Backup.name).StartsWith("scheduled-", [System.StringComparison]::OrdinalIgnoreCase)) {
        return "说明：计划任务自动创建的归档备份。"
    }

    return $null
}

function Show-BackupChoices {
    param([array]$Backups)

    Write-Host "最近备份：" -ForegroundColor Yellow
    Write-Host ""

    $maxDisplay = [Math]::Min($Backups.Count, 12)
    for ($i = 0; $i -lt $maxDisplay; $i++) {
        $backup = $Backups[$i]
        $index = $i + 1
        $displayName = Get-BackupDisplayName -Backup $backup
        $displayNote = Get-BackupDisplayNote -Backup $backup
        $line = "[{0}] {1} | {2} | {3}" -f $index, $displayName, (Format-BackupTime -CreatedAt $backup.createdAt), (Format-BackupSize -Size $backup.size)
        Write-Host $line -ForegroundColor White

        if ($displayName -ne $backup.name) {
            Write-Host ("    内部名称：{0}" -f $backup.name) -ForegroundColor DarkGray
        }

        if (-not [string]::IsNullOrWhiteSpace($displayNote)) {
            Write-Host ("    {0}" -f $displayNote) -ForegroundColor DarkGray
        }
    }

    if ($Backups.Count -gt $maxDisplay) {
        Write-Host ""
        Write-Host "这里只展示最新的 $maxDisplay 份备份。" -ForegroundColor DarkGray
        Write-Host "如果你要恢复更早的备份，仍然可以手动输入备份名称或 ID。" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "直接回车：默认选择最新一份备份。" -ForegroundColor Gray
    Write-Host "输入 Q：取消。" -ForegroundColor Gray
    Write-Host ""
}

function Resolve-BackupSelection {
    param(
        [array]$Backups,
        [string]$UserSelection,
        [switch]$UseLatest
    )

    if ($Backups.Count -eq 0) {
        return $null
    }

    if ($UseLatest -or [string]::IsNullOrWhiteSpace($UserSelection)) {
        return $Backups[0]
    }

    $trimmedSelection = $UserSelection.Trim()

    if ($trimmedSelection -match "^\d+$") {
        $index = [int]$trimmedSelection
        if ($index -ge 1 -and $index -le $Backups.Count) {
            return $Backups[$index - 1]
        }
        return $null
    }

    return $Backups | Where-Object { $_.name -eq $trimmedSelection -or $_.id -eq $trimmedSelection } | Select-Object -First 1
}

function Confirm-Action {
    param(
        [string]$Prompt,
        [bool]$DefaultYes = $false
    )

    $hint = if ($DefaultYes) { "Y/n" } else { "y/N" }
    $answer = Read-Host "$Prompt [$hint]"

    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultYes
    }

    return $answer.Trim().ToUpperInvariant() -eq "Y"
}

function Invoke-BackupTool {
    param([string[]]$Arguments)

    & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $BackupScript @Arguments
    return $LASTEXITCODE
}

function Get-Pm2Pid {
    param([string]$ProcessName)

    if ([string]::IsNullOrWhiteSpace($Pm2Command)) {
        return $null
    }

    $lines = & $Pm2Command pid $ProcessName 2>&1 | ForEach-Object { "$_" }
    foreach ($line in $lines) {
        $trimmed = ([string]$line).Trim()
        if ($trimmed -match '^\d+$') {
            $pid = [int]$trimmed
            if ($pid -gt 0) {
                return $pid
            }
        }
    }

    return $null
}

function Get-RunningPortalProcesses {
    $processes = @()

    foreach ($name in @("portal-api", "portal-backend")) {
        $pm2Pid = Get-Pm2Pid -ProcessName $name
        if ($pm2Pid) {
            $processes += [PSCustomObject]@{
                Name = $name
                Pid = $pm2Pid
            }
        }
    }

    return @($processes)
}

function Get-ListeningProcessInfo {
    param([int]$Port)

    $connections = netstat -ano | Select-String -Pattern ":$Port" | Select-String -Pattern "LISTENING"
    foreach ($connection in $connections) {
        $line = "$connection".Trim()
        if ($line -match '\s+(\d+)$') {
            $ownerPid = [int]$Matches[1]
            $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
            return [PSCustomObject]@{
                IsListening = $true
                Pid = $ownerPid
                Name = if ($process) { $process.ProcessName } else { "未知进程" }
            }
        }
    }

    return [PSCustomObject]@{
        IsListening = $false
        Pid = $null
        Name = $null
    }
}

function Test-PortalHealthReachable {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$PortalPort/health" -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
        return [int]$response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-PortalStopState {
    $listener = Get-ListeningProcessInfo -Port $PortalPort
    $portalProcesses = @(Get-RunningPortalProcesses)
    $healthReachable = Test-PortalHealthReachable

    return [PSCustomObject]@{
        Listener = $listener
        PortalProcesses = $portalProcesses
        HealthReachable = $healthReachable
        Stopped = (-not $listener.IsListening -and -not $healthReachable -and $portalProcesses.Count -eq 0)
    }
}

function Format-PortalStopState {
    param($State)

    $pm2Summary = if ($State.PortalProcesses.Count -eq 0) {
        "PM2 门户进程未运行"
    } else {
        "PM2 门户进程仍在运行: " + (($State.PortalProcesses | ForEach-Object { "$($_.Name) (PID $($_.Pid))" }) -join ", ")
    }

    $portSummary = if ($State.Listener.IsListening) {
        "端口 $PortalPort 仍被 $($State.Listener.Name) (PID $($State.Listener.Pid)) 监听"
    } else {
        "端口 $PortalPort 未监听"
    }

    $healthSummary = if ($State.HealthReachable) {
        "健康检查仍可访问"
    } else {
        "健康检查不可达"
    }

    return "$pm2Summary；$portSummary；$healthSummary"
}

function Wait-ForPortalToStop {
    param([int]$TimeoutSeconds = 20)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $state = Get-PortalStopState

    while (-not $state.Stopped -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 1
        $state = Get-PortalStopState
    }

    return $state
}

function Stop-PortalServices {
    Write-Host ""
    Write-Host "[INFO] 正在停止门户服务..." -ForegroundColor Yellow
    $stopExitCode = Invoke-PowerShellFile -Path $PortalManagementScript -Arguments @("stop")
    $state = Wait-ForPortalToStop -TimeoutSeconds 20

    if (-not $state.Stopped) {
        $summary = Format-PortalStopState -State $state
        throw "门户服务尚未完全停止，已中止恢复。停止脚本退出码: $stopExitCode。当前状态: $summary"
    }

    if ($stopExitCode -ne 0) {
        Write-Host "[WARN] 停止脚本返回非零，但已确认门户服务完全停止，继续恢复。" -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] 已确认门户服务完全停止。" -ForegroundColor Green
    }

    return 0
}

function Start-PortalServices {
    Write-Host ""
    Write-Host "[INFO] 正在启动门户服务..." -ForegroundColor Yellow
    & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $StartScript -RestartIfRunning -NonInteractive
    return $LASTEXITCODE
}

try {
    Show-Header

    if (-not (Test-Path $BackupScript)) {
        throw "未找到备份脚本：$BackupScript"
    }

    if (-not (Test-Path $PortalManagementScript)) {
        throw "未找到门户管理脚本：$PortalManagementScript"
    }

    if (-not (Test-Path $StartScript)) {
        throw "未找到启动脚本：$StartScript"
    }

    $backups = Get-Backups
    if ($backups.Count -eq 0) {
        Write-Host "当前没有可用备份。" -ForegroundColor Yellow
        exit 1
    }

    if (-not $Latest -and [string]::IsNullOrWhiteSpace($Selection)) {
        Show-BackupChoices -Backups $backups
        $Selection = Read-Host "请输入备份编号、名称或 ID"
        if ($Selection.Trim().ToUpperInvariant() -eq "Q") {
            Write-Host ""
            Write-Host "已取消恢复。" -ForegroundColor Yellow
            exit 0
        }
    }

    $selectedBackup = Resolve-BackupSelection -Backups $backups -UserSelection $Selection -UseLatest:$Latest
    if (-not $selectedBackup) {
        Write-Host ""
        Write-Host "未找到指定备份。" -ForegroundColor Red
        exit 1
    }

    $selectedDisplayName = Get-BackupDisplayName -Backup $selectedBackup
    $selectedDisplayNote = Get-BackupDisplayNote -Backup $selectedBackup
    $restoreTarget = if ([string]::IsNullOrWhiteSpace([string]$selectedBackup.id)) { [string]$selectedBackup.name } else { [string]$selectedBackup.id }

    Write-Host ""
    Write-Host "已选择备份：" -ForegroundColor Yellow
    Write-Host ("  显示名称：{0}" -f $selectedDisplayName) -ForegroundColor White
    if ($selectedDisplayName -ne $selectedBackup.name) {
        Write-Host ("  内部名称：{0}" -f $selectedBackup.name) -ForegroundColor Gray
    }
    Write-Host ("  ID：      {0}" -f $selectedBackup.id) -ForegroundColor Gray
    Write-Host ("  创建时间：{0}" -f (Format-BackupTime -CreatedAt $selectedBackup.createdAt)) -ForegroundColor Gray
    Write-Host ("  大小：    {0}" -f (Format-BackupSize -Size $selectedBackup.size)) -ForegroundColor Gray
    if (-not [string]::IsNullOrWhiteSpace($selectedDisplayNote)) {
        Write-Host ("  {0}" -f $selectedDisplayNote) -ForegroundColor DarkGray
    }

    if (-not (Confirm-Action -Prompt "继续执行离线恢复吗？" -DefaultYes:$false)) {
        Write-Host ""
        Write-Host "已取消恢复。" -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Host "[INFO] 正在校验备份，确认通过后才会停止服务..." -ForegroundColor Yellow
    $verifyExitCode = Invoke-BackupTool -Arguments @("-Action", "verify", "-RestoreFrom", $restoreTarget)
    if ($verifyExitCode -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] 备份校验未通过，已中止恢复。" -ForegroundColor Red
        Write-Host "        没有停止任何服务，也没有修改现有数据。" -ForegroundColor Red
        Write-Host "        请查看上方 [VERIFY] / [MAIN] 输出以确认具体原因。" -ForegroundColor Red
        exit $verifyExitCode
    }

    Stop-PortalServices

    Write-Host ""
    Write-Host "[INFO] 正在执行恢复..." -ForegroundColor Yellow
    $restoreExitCode = Invoke-BackupTool -Arguments @("-Action", "restore", "-RestoreFrom", $restoreTarget)
    if ($restoreExitCode -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] 恢复失败。" -ForegroundColor Red
        Write-Host "        为了安全起见，服务保持停止状态，请检查上方输出后再决定是否手动启动。" -ForegroundColor Red
        exit $restoreExitCode
    }

    $shouldRestart = $AutoRestart
    if (-not $AutoRestart) {
        $shouldRestart = Confirm-Action -Prompt "现在启动门户服务吗？" -DefaultYes:$true
    }

    if (-not $shouldRestart) {
        Write-Host ""
        Write-Host "[OK] 恢复已完成，服务按你的选择保持停止。" -ForegroundColor Green
        exit 0
    }

    $startExitCode = Start-PortalServices
    if ($startExitCode -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] 恢复已完成，但服务启动失败。" -ForegroundColor Red
        exit $startExitCode
    }

    Write-Host ""
    Write-Host "[OK] 恢复和重启都已完成。" -ForegroundColor Green
    exit 0
} catch {
    Write-Host ""
    Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
