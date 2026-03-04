# Schedules a daily system backup using Windows Task Scheduler
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/schedule-backup.ps1 -Time "02:00" -Host "http://localhost:8002" -TaskName "PortalDailyBackup"

param(
  [string]$Time = "02:00",
  [string]$Host = "http://localhost:8002",
  [string]$TaskName = "PortalDailyBackup"
)

$ErrorActionPreference = 'Stop'

function Get-NodePath {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) { throw "Node.js is required in PATH to run backup script." }
  return $node.Source
}

$nodePath = Get-NodePath
$scriptPath = Join-Path $PSScriptRoot 'backup-cli.js'
if (-not (Test-Path $scriptPath)) { throw "backup-cli.js not found at $scriptPath" }

# Convert time string to schedule components
$parts = $Time.Split(':')
if ($parts.Count -ne 2) { throw "Time format error. Use HH:mm (e.g., 02:00)." }
$hour = [int]$parts[0]
$minute = [int]$parts[1]

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`" --host `"$Host`""
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($hour).AddMinutes($minute).TimeOfDay)

try {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false | Out-Null
  }
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Portal system daily backup" -RunLevel Highest | Out-Null
  Write-Host "✅ Scheduled task '$TaskName' created: daily at $Time" -ForegroundColor Green
  Write-Host "   Action: $nodePath $scriptPath --host $Host"
} catch {
  Write-Error "Failed to create scheduled task: $($_.Exception.Message)"
  exit 1
}

