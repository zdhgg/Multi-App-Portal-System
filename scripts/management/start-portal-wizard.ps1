param()

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$StartScript = Join-Path $ProjectRoot "start-production.ps1"
$ConfigureStartupScript = Join-Path $ProjectRoot "configure-startup.ps1"
$PortalManagementScript = Join-Path $PSScriptRoot "portal-management.ps1"
$BackupScript = Join-Path $PSScriptRoot "backup.ps1"
$RestoreAssistantScript = Join-Path $PSScriptRoot "restore-portal.ps1"
$MainPortalDir = Join-Path $ProjectRoot "main-portal"
$AdminRepairScript = Join-Path $ProjectRoot "scripts\startup\start-backend-admin.ps1"
$PowerShellExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } else { "powershell.exe" }
$PortalPort = 8002
$Pm2PermissionExitCode = 91

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
$Pm2StartupCommand = Get-CommandPath -Candidates @("pm2-startup.cmd", "pm2-startup")

function Pause-Wizard {
    param([string]$Prompt = "按回车键继续")

    Read-Host $Prompt | Out-Null
}

function Read-TrimmedInput {
    param([string]$Prompt)

    return ([string](Read-Host $Prompt)).Trim()
}

function Invoke-PowerShellFile {
    param(
        [string]$Path,
        [string[]]$Arguments = @()
    )

    & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments 2>&1 | Out-Host
    if ($null -eq $LASTEXITCODE) {
        return 0
    }

    return [int]$LASTEXITCODE
}

function Test-Pm2PermissionIssue {
    param([string[]]$Lines)

    $joined = ($Lines | Where-Object { $_ -ne $null } | ForEach-Object { "$_" }) -join "`n"
    return $joined -match "EPERM|rpc\.sock|operation not permitted"
}

function Get-Pm2State {
    if (-not $Pm2Command) {
        return [PSCustomObject]@{
            State = "未安装"
            Pid = $null
            PermissionIssue = $false
        }
    }

    $lines = & $Pm2Command pid portal-api 2>&1 | ForEach-Object { "$_" }
    if (Test-Pm2PermissionIssue -Lines $lines) {
        return [PSCustomObject]@{
            State = "权限异常"
            Pid = $null
            PermissionIssue = $true
        }
    }

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\d+$') {
            $pm2Pid = [int]$trimmed
            if ($pm2Pid -gt 0) {
                $process = Get-Process -Id $pm2Pid -ErrorAction SilentlyContinue
                if ($process) {
                    return [PSCustomObject]@{
                        State = "运行中"
                        Pid = $pm2Pid
                        PermissionIssue = $false
                    }
                }
            }
        }
    }

    return [PSCustomObject]@{
        State = "未运行"
        Pid = $null
        PermissionIssue = $false
    }
}

function Get-PortOwner {
    param([int]$Port)

    $connections = netstat -ano | Select-String -Pattern ":$Port" | Select-String -Pattern "LISTENING"
    foreach ($connection in $connections) {
        $line = "$connection".Trim()
        if ($line -match '\s+(\d+)$') {
            $ownerPid = [int]$Matches[1]
            $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
            return [PSCustomObject]@{
                State = "占用"
                Pid = $ownerPid
                Name = if ($process) { $process.ProcessName } else { "未知进程" }
            }
        }
    }

    return [PSCustomObject]@{
        State = "空闲"
        Pid = $null
        Name = $null
    }
}

function Get-HealthState {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$PortalPort/health" -UseBasicParsing -TimeoutSec 4
        if ([int]$response.StatusCode -eq 200) {
            return "正常 (200)"
        }
        return "异常 (HTTP $([int]$response.StatusCode))"
    } catch {
        return "不可达"
    }
}

function Get-AutostartState {
    reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PM2 > $null 2> $null
    if ($LASTEXITCODE -eq 0) {
        return "已启用"
    }
    return "已禁用"
}

function Get-FirewallState {
    if (-not (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue)) {
        return "未知"
    }

    $primary = Get-NetFirewallRule -DisplayName "Portal-System-Portal-Backend" -ErrorAction SilentlyContinue
    $legacy = Get-NetFirewallRule -DisplayName "Portal-Port-8002" -ErrorAction SilentlyContinue
    if ($primary -or $legacy) {
        return "已配置"
    }

    return "未配置"
}

function Get-StatusSnapshot {
    $pm2 = Get-Pm2State
    $portOwner = Get-PortOwner -Port $PortalPort
    $health = Get-HealthState
    $autostart = Get-AutostartState
    $firewall = Get-FirewallState

    $portSummary = if ($portOwner.State -eq "空闲") {
        "端口空闲"
    } elseif ($pm2.Pid -and $portOwner.Pid -eq $pm2.Pid) {
        "由 PM2 portal-api 占用 (PID $($portOwner.Pid))"
    } else {
        "被 $($portOwner.Name) 占用 (PID $($portOwner.Pid))"
    }

    return [PSCustomObject]@{
        Pm2 = $pm2
        PortOwner = $portOwner
        PortSummary = $portSummary
        Health = $health
        Autostart = $autostart
        Firewall = $firewall
    }
}

function Show-Header {
    try {
        Clear-Host
    } catch {
    }
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "门户系统 - 中文控制向导" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Show-MainMenu {
    $status = Get-StatusSnapshot
    Show-Header
    Write-Host "当前状态：" -ForegroundColor Yellow
    Write-Host ("  PM2 portal-api：{0}{1}" -f $status.Pm2.State, $(if ($status.Pm2.Pid) { " (PID $($status.Pm2.Pid))" } else { "" })) -ForegroundColor White
    Write-Host ("  端口 {0}：{1}" -f $PortalPort, $status.PortSummary) -ForegroundColor White
    Write-Host ("  健康检查：{0}" -f $status.Health) -ForegroundColor White
    Write-Host ("  PM2 开机自启：{0}" -f $status.Autostart) -ForegroundColor White
    Write-Host ("  防火墙规则：{0}" -f $status.Firewall) -ForegroundColor White
    Write-Host ""
    Write-Host "[1] 启动门户" -ForegroundColor White
    Write-Host "[2] 重启门户" -ForegroundColor White
    Write-Host "[3] 停止门户" -ForegroundColor White
    Write-Host "[4] 查看状态" -ForegroundColor White
    Write-Host "[5] 构建前端并重启" -ForegroundColor White
    Write-Host "[6] 打开本地门户" -ForegroundColor White
    Write-Host "[7] 启用 PM2 开机自启" -ForegroundColor White
    Write-Host "[8] 关闭 PM2 开机自启" -ForegroundColor White
    Write-Host "[9] 备份与恢复" -ForegroundColor White
    Write-Host "[Q] 退出" -ForegroundColor White
    Write-Host ""
}

function Confirm-YesNo {
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

function Handle-Pm2PermissionIssue {
    Show-Header
    Write-Host "检测到 PM2 权限异常。" -ForegroundColor Red
    Write-Host ""
    Write-Host "常见原因：" -ForegroundColor Yellow
    Write-Host "  1. PM2 守护进程曾以管理员权限启动" -ForegroundColor White
    Write-Host "  2. 当前用户无法访问 PM2 的 rpc.sock / 日志文件" -ForegroundColor White
    Write-Host ""
    Write-Host "推荐修复脚本：" -ForegroundColor Yellow
    Write-Host ("  {0}" -f $AdminRepairScript) -ForegroundColor White
    Write-Host ""

    if (-not (Confirm-YesNo -Prompt "现在启动管理员修复脚本吗？" -DefaultYes:$false)) {
        return
    }

    $exitCode = Invoke-PowerShellFile -Path $AdminRepairScript
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "管理员修复脚本已启动。" -ForegroundColor Green
    } else {
        Write-Host ("管理员修复脚本退出码：{0}" -f $exitCode) -ForegroundColor Yellow
    }
}

function Ensure-ExternalPortAvailable {
    $status = Get-StatusSnapshot
    if ($status.PortOwner.State -eq "空闲") {
        return $true
    }

    if ($status.Pm2.Pid -and $status.PortOwner.Pid -eq $status.Pm2.Pid) {
        return $true
    }

    Show-Header
    Write-Host "检测到目标端口已被其他进程占用。" -ForegroundColor Yellow
    Write-Host ("  端口：{0}" -f $PortalPort) -ForegroundColor White
    Write-Host ("  进程：{0}" -f $status.PortOwner.Name) -ForegroundColor White
    Write-Host ("  PID：{0}" -f $status.PortOwner.Pid) -ForegroundColor White
    Write-Host ""

    if (-not (Confirm-YesNo -Prompt "是否终止该进程并继续？" -DefaultYes:$false)) {
        Write-Host "已取消启动操作。" -ForegroundColor Yellow
        Pause-Wizard
        return $false
    }

    try {
        Stop-Process -Id $status.PortOwner.Pid -Force -ErrorAction Stop
        Start-Sleep -Seconds 1
        Write-Host "端口占用进程已终止。" -ForegroundColor Green
        Pause-Wizard
        return $true
    } catch {
        Write-Host "终止外部占用进程失败，请手动处理后重试。" -ForegroundColor Red
        Pause-Wizard
        return $false
    }
}

function Start-PortalAction {
    $status = Get-StatusSnapshot
    if ($status.Pm2.PermissionIssue) {
        Handle-Pm2PermissionIssue
        return
    }

    if (-not (Ensure-ExternalPortAvailable)) {
        return
    }

    Show-Header
    Write-Host "正在启动门户..." -ForegroundColor Yellow
    Write-Host ""
    $exitCode = Invoke-PowerShellFile -Path $StartScript
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "启动完成。" -ForegroundColor Green
    } elseif ($exitCode -eq $Pm2PermissionExitCode) {
        Handle-Pm2PermissionIssue
    } else {
        Write-Host ("启动失败，退出码：{0}" -f $exitCode) -ForegroundColor Red
        Write-Host "可使用 pm2 logs portal-api 查看日志。" -ForegroundColor DarkGray
    }
    Pause-Wizard
}

function Restart-PortalAction {
    $status = Get-StatusSnapshot
    if ($status.Pm2.PermissionIssue) {
        Handle-Pm2PermissionIssue
        return
    }

    if (-not (Ensure-ExternalPortAvailable)) {
        return
    }

    Show-Header
    Write-Host "正在重启门户..." -ForegroundColor Yellow
    Write-Host ""
    $exitCode = Invoke-PowerShellFile -Path $StartScript -Arguments @("-RestartIfRunning", "-NonInteractive")
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "重启完成。" -ForegroundColor Green
    } elseif ($exitCode -eq $Pm2PermissionExitCode) {
        Handle-Pm2PermissionIssue
    } else {
        Write-Host ("重启失败，退出码：{0}" -f $exitCode) -ForegroundColor Red
        Write-Host "可使用 pm2 logs portal-api 查看日志。" -ForegroundColor DarkGray
    }
    Pause-Wizard
}

function Stop-PortalAction {
    Show-Header
    Write-Host "正在停止门户..." -ForegroundColor Yellow
    Write-Host ""
    $exitCode = Invoke-PowerShellFile -Path $PortalManagementScript -Arguments @("stop")
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "停止完成。" -ForegroundColor Green
    } else {
        Write-Host "停止未完成，请以上方提示为准。" -ForegroundColor Yellow
        Write-Host ("附加状态码：{0}" -f $exitCode) -ForegroundColor DarkGray
    }
    Pause-Wizard
}

function Show-StatusAction {
    Show-Header
    Write-Host "正在获取详细状态..." -ForegroundColor Yellow
    Write-Host ""
    $exitCode = Invoke-PowerShellFile -Path $PortalManagementScript -Arguments @("status")
    Write-Host ""
    if ($exitCode -ne 0) {
        Write-Host ("状态脚本退出码：{0}" -f $exitCode) -ForegroundColor Yellow
    }
    Pause-Wizard
}

function Build-FrontendAndRestartAction {
    Show-Header
    Write-Host "正在构建前端..." -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Path (Join-Path $MainPortalDir "package.json"))) {
        Write-Host "未找到前端项目 package.json。" -ForegroundColor Red
        Pause-Wizard
        return
    }

    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue) -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "未检测到 npm，请先安装 Node.js。" -ForegroundColor Red
        Pause-Wizard
        return
    }

    Push-Location $MainPortalDir
    try {
        & npm run build
        $buildExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    Write-Host ""
    if ($buildExitCode -ne 0) {
        Write-Host ("前端构建失败，退出码：{0}" -f $buildExitCode) -ForegroundColor Red
        Pause-Wizard
        return
    }

    Write-Host "前端构建完成，正在重启门户..." -ForegroundColor Green
    Write-Host ""
    $restartExitCode = Invoke-PowerShellFile -Path $StartScript -Arguments @("-RestartIfRunning", "-NonInteractive")
    if ($restartExitCode -eq 0) {
        Write-Host "门户已完成重启。" -ForegroundColor Green
    } elseif ($restartExitCode -eq $Pm2PermissionExitCode) {
        Handle-Pm2PermissionIssue
    } else {
        Write-Host ("重启失败，退出码：{0}" -f $restartExitCode) -ForegroundColor Red
    }
    Pause-Wizard
}

function Open-PortalAction {
    Show-Header
    $url = "http://localhost:$PortalPort"
    Start-Process $url
    Write-Host ("已在浏览器中打开：{0}" -f $url) -ForegroundColor Green
    Pause-Wizard
}

function Enable-AutostartAction {
    Show-Header
    Write-Host "正在启用 PM2 开机自启..." -ForegroundColor Yellow
    Write-Host ""
    $exitCode = Invoke-PowerShellFile -Path $ConfigureStartupScript
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "PM2 开机自启已配置。" -ForegroundColor Green
    } else {
        Write-Host ("开机自启配置失败，退出码：{0}" -f $exitCode) -ForegroundColor Red
    }
    Pause-Wizard
}

function Disable-AutostartAction {
    Show-Header
    Write-Host "正在关闭 PM2 开机自启..." -ForegroundColor Yellow
    Write-Host ""

    $pm2StartupExitCode = $null
    if ($Pm2StartupCommand) {
        & $Pm2StartupCommand uninstall
        $pm2StartupExitCode = $LASTEXITCODE
    }

    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PM2 /f > $null 2> $null
    $registryExitCode = $LASTEXITCODE

    if ($Pm2StartupCommand -and $pm2StartupExitCode -eq 0) {
        Write-Host "pm2-startup uninstall 已执行。" -ForegroundColor Green
    } elseif ($Pm2StartupCommand) {
        Write-Host "pm2-startup uninstall 未成功执行。" -ForegroundColor Yellow
    } else {
        Write-Host "未检测到 pm2-startup，已仅尝试清理注册表自启项。" -ForegroundColor Yellow
    }

    if ($registryExitCode -eq 0) {
        Write-Host "已移除 HKCU\\Run 中的 PM2 自启项。" -ForegroundColor Green
    } else {
        Write-Host "HKCU\\Run 中未发现 PM2 自启项。" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host ("当前 PM2 开机自启状态：{0}" -f (Get-AutostartState)) -ForegroundColor White
    Pause-Wizard
}

function Show-BackupMenu {
    while ($true) {
        Show-Header
        Write-Host "备份与恢复" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "[1] 创建完整备份" -ForegroundColor White
        Write-Host "[2] 创建配置备份" -ForegroundColor White
        Write-Host "[3] 查看备份列表" -ForegroundColor White
        Write-Host "[4] 启动离线恢复向导" -ForegroundColor White
        Write-Host "[5] 验证备份" -ForegroundColor White
        Write-Host "[6] 清理过期备份" -ForegroundColor White
        Write-Host "[7] 打开交互式备份管理器" -ForegroundColor White
        Write-Host "[0] 返回上一级" -ForegroundColor White
        Write-Host ""
        $choice = (Read-TrimmedInput -Prompt "请选择操作").ToUpperInvariant()

        switch ($choice) {
            "1" {
                $name = Read-TrimmedInput -Prompt "可选：输入备份名称（留空自动生成）"
                $args = @("-Action", "backup", "-BackupType", "full", "-Compress")
                if (-not [string]::IsNullOrWhiteSpace($name)) {
                    $args += @("-BackupName", $name.Trim())
                }
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments $args | Out-Null
                Pause-Wizard
            }
            "2" {
                $name = Read-TrimmedInput -Prompt "可选：输入备份名称（留空自动生成）"
                $args = @("-Action", "backup", "-BackupType", "config", "-Compress")
                if (-not [string]::IsNullOrWhiteSpace($name)) {
                    $args += @("-BackupName", $name.Trim())
                }
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments $args | Out-Null
                Pause-Wizard
            }
            "3" {
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments @("-Action", "list") | Out-Null
                Pause-Wizard
            }
            "4" {
                Show-Header
                Invoke-PowerShellFile -Path $RestoreAssistantScript | Out-Null
                Pause-Wizard
            }
            "5" {
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments @("-Action", "list") | Out-Null
                Write-Host ""
                $target = Read-TrimmedInput -Prompt "请输入要验证的备份名称或 ID"
                if ([string]::IsNullOrWhiteSpace($target)) {
                    Write-Host "已取消验证。" -ForegroundColor Yellow
                    Pause-Wizard
                    continue
                }
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments @("-Action", "verify", "-RestoreFrom", $target.Trim()) | Out-Null
                Pause-Wizard
            }
            "6" {
                if (-not (Confirm-YesNo -Prompt "确认清理过期备份吗？" -DefaultYes:$false)) {
                    continue
                }
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments @("-Action", "clean") | Out-Null
                Pause-Wizard
            }
            "7" {
                Show-Header
                Invoke-PowerShellFile -Path $BackupScript -Arguments @("-Action", "interactive") | Out-Null
                Pause-Wizard
            }
            "0" { return }
            default {
                Write-Host "无效选择，请重试。" -ForegroundColor Red
                Start-Sleep -Milliseconds 900
            }
        }
    }
}

while ($true) {
    Show-MainMenu
    $choice = (Read-TrimmedInput -Prompt "请选择操作").ToUpperInvariant()

    switch ($choice) {
        "1" { Start-PortalAction }
        "2" { Restart-PortalAction }
        "3" { Stop-PortalAction }
        "4" { Show-StatusAction }
        "5" { Build-FrontendAndRestartAction }
        "6" { Open-PortalAction }
        "7" { Enable-AutostartAction }
        "8" { Disable-AutostartAction }
        "9" { Show-BackupMenu }
        "Q" { exit 0 }
        default {
            Write-Host "无效选择，请重试。" -ForegroundColor Red
            Start-Sleep -Milliseconds 900
        }
    }
}

exit 0





