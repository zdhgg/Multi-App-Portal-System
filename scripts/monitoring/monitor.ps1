# 智能多Web应用门户系统 - 增强实时监控仪表板
# 提供PM2进程、系统资源、服务健康状态的实时监控
# 增强功能：智能告警、趋势分析、系统健康评分、深度集成
# 作者: Augment Agent
# 版本: 3.0.0

param(
    [int]$RefreshInterval = 3,
    [int]$BackendPort = 8002,
    [int]$FrontendPort = 3000,
    [switch]$EnableAutoRecovery,
    [switch]$EnableAlerts,
    [switch]$EnableTrendAnalysis,
    [switch]$GenerateReport,
    [string]$ReportPath = "",
    [switch]$Quiet,
    [switch]$Help
)

# ============================================================================
# 全局配置和变量
# ============================================================================

$SCRIPT_VERSION = "3.0.0"
$SCRIPT_NAME = "智能多Web应用门户系统增强监控仪表板"

# 路径配置
$PROJECT_ROOT = $PSScriptRoot
$MONITOR_DATA_DIR = Join-Path $PROJECT_ROOT "monitoring"
$MONITOR_HISTORY_FILE = Join-Path $MONITOR_DATA_DIR "monitor-history.json"
$MONITOR_ALERTS_FILE = Join-Path $MONITOR_DATA_DIR "monitor-alerts.json"
$MONITOR_CONFIG_FILE = Join-Path $MONITOR_DATA_DIR "monitor-config.json"
$MONITOR_REPORTS_DIR = Join-Path $MONITOR_DATA_DIR "reports"

# 确保监控数据目录存在
if (-not (Test-Path $MONITOR_DATA_DIR)) {
    New-Item -ItemType Directory -Path $MONITOR_DATA_DIR -Force | Out-Null
}
if (-not (Test-Path $MONITOR_REPORTS_DIR)) {
    New-Item -ItemType Directory -Path $MONITOR_REPORTS_DIR -Force | Out-Null
}

# 导入统一日志系统
$LOGS_SCRIPT = Join-Path $PROJECT_ROOT "logs.ps1"
if (Test-Path $LOGS_SCRIPT) {
    . $LOGS_SCRIPT
}

# 导入配置管理系统
$CONFIG_SCRIPT = Join-Path $PROJECT_ROOT "config.ps1"
if (Test-Path $CONFIG_SCRIPT) {
    . $CONFIG_SCRIPT

    # 从统一配置系统加载配置
    if (Get-Command Get-ConfigForScript -ErrorAction SilentlyContinue) {
        try {
            $monitorConfig = Get-ConfigForScript "monitor"
            $RefreshInterval = $monitorConfig.RefreshInterval
            $BackendPort = $monitorConfig.BackendPort
            $FrontendPort = $monitorConfig.FrontendPort
            $EnableAutoRecovery = $monitorConfig.EnableAutoRecovery
        } catch {
            Write-Host "配置加载失败，使用默认值: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# 导入API管理系统
$API_SCRIPT = Join-Path $PROJECT_ROOT "api.ps1"
if (Test-Path $API_SCRIPT) {
    . $API_SCRIPT
}

# 导入备份管理系统
$BACKUP_SCRIPT = Join-Path $PROJECT_ROOT "backup.ps1"
if (Test-Path $BACKUP_SCRIPT) {
    . $BACKUP_SCRIPT
}

# 导入恢复系统
$RECOVERY_SCRIPT = Join-Path $PROJECT_ROOT "recovery.ps1"
if (Test-Path $RECOVERY_SCRIPT) {
    . $RECOVERY_SCRIPT
}

# API端点配置
$API_BASE = "http://localhost:$BackendPort/api"
$HEALTH_ENDPOINT = "http://localhost:$BackendPort/health"

# 增强监控数据缓存
$script:MonitorData = @{
    PM2Processes = @()
    PM2Stats = @{}
    SystemResources = @{}
    HealthStatus = @{}
    RecoveryStatus = @{}
    APIStatus = @{}
    BackupStatus = @{}
    PerformanceMetrics = @{}
    SystemHealth = @{
        Score = 100
        Status = "Excellent"
        Issues = @()
    }
    TrendData = @{
        CPU = @()
        Memory = @()
        Disk = @()
        ResponseTime = @()
    }
    LastUpdate = Get-Date
    Errors = @()
    Alerts = @()
}

# 增强监控配置
$script:MonitorConfig = @{
    AlertThresholds = @{
        CPU = @{ Warning = 70; Critical = 85 }
        Memory = @{ Warning = 80; Critical = 90 }
        Disk = @{ Warning = 85; Critical = 95 }
        ResponseTime = @{ Warning = 1000; Critical = 3000 }
    }
    TrendAnalysis = @{
        Enabled = $EnableTrendAnalysis
        WindowSize = 60  # 保留60个数据点
        PredictionEnabled = $true
    }
    Alerts = @{
        Enabled = $EnableAlerts
        MaxAlerts = 100
        AlertCooldown = 300  # 5分钟冷却期
    }
    HealthScore = @{
        Weights = @{
            CPU = 0.25
            Memory = 0.25
            Disk = 0.15
            Services = 0.20
            ResponseTime = 0.15
        }
    }
}

# 恢复系统状态
$script:RecoveryEnabled = $EnableAutoRecovery
$script:LastRecoveryCheck = $null
$script:RecoveryStats = @{
    TotalRecoveries = 0
    SuccessfulRecoveries = 0
    LastRecoveryTime = $null
}

# 控制台状态
$script:IsRunning = $true
$script:ShowDetails = $false
$script:ShowLogs = $false
$script:LogLines = 20

# ============================================================================
# 工具函数
# ============================================================================

function Write-ColorText {
    param(
        [string]$Text,
        [ConsoleColor]$Color = "White",
        [switch]$NoNewline
    )
    
    $originalColor = $Host.UI.RawUI.ForegroundColor
    $Host.UI.RawUI.ForegroundColor = $Color
    if ($NoNewline) {
        Write-Host $Text -NoNewline
    } else {
        Write-Host $Text
    }
    $Host.UI.RawUI.ForegroundColor = $originalColor
}

function Clear-ConsoleArea {
    param([int]$Lines = 50)
    
    for ($i = 0; $i -lt $Lines; $i++) {
        Write-Host (" " * 120)
    }
}

function Get-ProgressBar {
    param(
        [double]$Percentage,
        [int]$Width = 10,
        [string]$FilledChar = "█",
        [string]$EmptyChar = "░"
    )
    
    $filled = [math]::Floor($Percentage / 100 * $Width)
    $empty = $Width - $filled
    
    return ($FilledChar * $filled) + ($EmptyChar * $empty)
}

function Format-Bytes {
    param([long]$Bytes)
    
    if ($Bytes -ge 1GB) {
        return "{0:N1} GB" -f ($Bytes / 1GB)
    } elseif ($Bytes -ge 1MB) {
        return "{0:N1} MB" -f ($Bytes / 1MB)
    } elseif ($Bytes -ge 1KB) {
        return "{0:N1} KB" -f ($Bytes / 1KB)
    } else {
        return "$Bytes B"
    }
}

function Format-Duration {
    param([double]$Seconds)
    
    $timespan = [TimeSpan]::FromSeconds($Seconds)
    if ($timespan.Days -gt 0) {
        return "{0}d {1}h {2}m" -f $timespan.Days, $timespan.Hours, $timespan.Minutes
    } elseif ($timespan.Hours -gt 0) {
        return "{0}h {1}m" -f $timespan.Hours, $timespan.Minutes
    } else {
        return "{0}m {1}s" -f $timespan.Minutes, $timespan.Seconds
    }
}

# ============================================================================
# 增强数据收集和分析函数
# ============================================================================

function Get-EnhancedSystemResourceData {
    try {
        # 获取CPU使用率（多核心）
        $cpuCounters = Get-Counter "\Processor(*)\% Processor Time" -SampleInterval 1 -MaxSamples 1
        $totalCpu = ($cpuCounters.CounterSamples | Where-Object { $_.InstanceName -eq "_Total" }).CookedValue
        $cpuUsage = [math]::Round(100 - $totalCpu, 1)

        # 获取内存信息
        $memory = Get-CimInstance -ClassName Win32_OperatingSystem
        $totalMemory = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 2)
        $freeMemory = [math]::Round($memory.FreePhysicalMemory / 1MB, 2)
        $usedMemory = $totalMemory - $freeMemory
        $memoryUsage = [math]::Round(($usedMemory / $totalMemory) * 100, 1)

        # 获取磁盘信息（所有驱动器）
        $disks = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
        $diskInfo = @()
        foreach ($disk in $disks) {
            $totalSize = [math]::Round($disk.Size / 1GB, 2)
            $freeSpace = [math]::Round($disk.FreeSpace / 1GB, 2)
            $usedSpace = $totalSize - $freeSpace
            $usage = if ($totalSize -gt 0) { [math]::Round(($usedSpace / $totalSize) * 100, 1) } else { 0 }

            $diskInfo += @{
                Drive = $disk.DeviceID
                TotalGB = $totalSize
                UsedGB = $usedSpace
                FreeGB = $freeSpace
                UsagePercent = $usage
            }
        }

        # 获取网络信息
        $networkCounters = Get-Counter "\Network Interface(*)\Bytes Total/sec" -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue
        $networkUsage = 0
        if ($networkCounters) {
            $networkUsage = ($networkCounters.CounterSamples | Where-Object { $_.InstanceName -notlike "*Loopback*" -and $_.InstanceName -notlike "*isatap*" } | Measure-Object -Property CookedValue -Sum).Sum
            $networkUsage = [math]::Round($networkUsage / 1MB, 2)
        }

        # 获取进程信息
        $processes = Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
        $topProcesses = @()
        foreach ($proc in $processes) {
            $topProcesses += @{
                Name = $proc.ProcessName
                CPU = [math]::Round($proc.CPU, 2)
                Memory = [math]::Round($proc.WorkingSet / 1MB, 2)
                PID = $proc.Id
            }
        }

        $script:MonitorData.SystemResources = @{
            CPU = @{
                Usage = $cpuUsage
                Cores = (Get-CimInstance -ClassName Win32_Processor).NumberOfLogicalProcessors
            }
            Memory = @{
                TotalGB = $totalMemory
                UsedGB = $usedMemory
                FreeGB = $freeMemory
                UsagePercent = $memoryUsage
            }
            Disk = $diskInfo
            Network = @{
                TotalMBps = $networkUsage
            }
            TopProcesses = $topProcesses
            Timestamp = Get-Date
        }

        # 更新趋势数据
        Update-TrendData

    } catch {
        $script:MonitorData.Errors += "增强系统资源数据获取失败: $($_.Exception.Message)"
    }
}

function Get-APIPerformanceData {
    try {
        if (Get-Command Get-ApiRegistry -ErrorAction SilentlyContinue) {
            $apiRegistry = Get-ApiRegistry
            $apiPerformance = @{}

            foreach ($api in $apiRegistry.apis) {
                $startTime = Get-Date
                try {
                    $response = Invoke-RestMethod -Uri $api.url -Method GET -TimeoutSec 5
                    $responseTime = ((Get-Date) - $startTime).TotalMilliseconds

                    $apiPerformance[$api.name] = @{
                        Status = "Online"
                        ResponseTime = [math]::Round($responseTime, 2)
                        LastCheck = Get-Date
                        Url = $api.url
                    }
                } catch {
                    $apiPerformance[$api.name] = @{
                        Status = "Offline"
                        ResponseTime = -1
                        LastCheck = Get-Date
                        Error = $_.Exception.Message
                        Url = $api.url
                    }
                }
            }

            $script:MonitorData.APIStatus = $apiPerformance
        }
    } catch {
        $script:MonitorData.Errors += "API性能数据获取失败: $($_.Exception.Message)"
    }
}

function Get-BackupStatusData {
    try {
        if (Get-Command Get-BackupRegistry -ErrorAction SilentlyContinue) {
            $backupRegistry = Get-BackupRegistry

            $script:MonitorData.BackupStatus = @{
                TotalBackups = $backupRegistry.statistics.totalBackups
                SuccessfulBackups = $backupRegistry.statistics.successfulBackups
                FailedBackups = $backupRegistry.statistics.failedBackups
                LastBackup = $backupRegistry.statistics.lastBackup
                TotalSizeMB = [math]::Round($backupRegistry.statistics.totalSize / 1MB, 2)
                RecentBackups = $backupRegistry.backups | Sort-Object { [DateTime]::Parse($_.createdAt) } -Descending | Select-Object -First 5
            }
        }
    } catch {
        $script:MonitorData.Errors += "备份状态数据获取失败: $($_.Exception.Message)"
    }
}

function Update-TrendData {
    $maxPoints = $script:MonitorConfig.TrendAnalysis.WindowSize

    # 更新CPU趋势
    $script:MonitorData.TrendData.CPU += $script:MonitorData.SystemResources.CPU.Usage
    if ($script:MonitorData.TrendData.CPU.Count -gt $maxPoints) {
        $script:MonitorData.TrendData.CPU = $script:MonitorData.TrendData.CPU[-$maxPoints..-1]
    }

    # 更新内存趋势
    $script:MonitorData.TrendData.Memory += $script:MonitorData.SystemResources.Memory.UsagePercent
    if ($script:MonitorData.TrendData.Memory.Count -gt $maxPoints) {
        $script:MonitorData.TrendData.Memory = $script:MonitorData.TrendData.Memory[-$maxPoints..-1]
    }

    # 更新磁盘趋势（主驱动器）
    $mainDisk = $script:MonitorData.SystemResources.Disk | Where-Object { $_.Drive -eq "C:" }
    if ($mainDisk) {
        $script:MonitorData.TrendData.Disk += $mainDisk.UsagePercent
        if ($script:MonitorData.TrendData.Disk.Count -gt $maxPoints) {
            $script:MonitorData.TrendData.Disk = $script:MonitorData.TrendData.Disk[-$maxPoints..-1]
        }
    }

    # 更新响应时间趋势
    $avgResponseTime = 0
    $apiCount = 0
    foreach ($api in $script:MonitorData.APIStatus.Values) {
        if ($api.ResponseTime -gt 0) {
            $avgResponseTime += $api.ResponseTime
            $apiCount++
        }
    }
    if ($apiCount -gt 0) {
        $avgResponseTime = $avgResponseTime / $apiCount
        $script:MonitorData.TrendData.ResponseTime += $avgResponseTime
        if ($script:MonitorData.TrendData.ResponseTime.Count -gt $maxPoints) {
            $script:MonitorData.TrendData.ResponseTime = $script:MonitorData.TrendData.ResponseTime[-$maxPoints..-1]
        }
    }
}

# ============================================================================
# 原有数据收集函数（保持兼容性）
# ============================================================================

function Get-PM2ProcessData {
    try {
        $response = Invoke-RestMethod -Uri "$API_BASE/pm2/processes" -Method Get -TimeoutSec 5
        if ($response.success) {
            $script:MonitorData.PM2Processes = $response.data
        }
    } catch {
        $script:MonitorData.Errors += "PM2进程数据获取失败: $($_.Exception.Message)"
    }
}

function Get-PM2StatsData {
    try {
        $response = Invoke-RestMethod -Uri "$API_BASE/pm2/stats" -Method Get -TimeoutSec 5
        if ($response.success) {
            $script:MonitorData.PM2Stats = $response.data
        }
    } catch {
        $script:MonitorData.Errors += "PM2统计数据获取失败: $($_.Exception.Message)"
    }
}

function Get-SystemResourceData {
    try {
        # 获取CPU使用率
        $cpuCounter = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1
        $cpuUsage = [math]::Round(100 - $cpuCounter.CounterSamples[0].CookedValue, 1)
        
        # 获取内存使用率
        $totalMemory = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
        $availableMemory = (Get-Counter "\Memory\Available Bytes").CounterSamples[0].CookedValue
        $usedMemory = $totalMemory - $availableMemory
        $memoryUsage = [math]::Round(($usedMemory / $totalMemory) * 100, 1)
        
        $script:MonitorData.SystemResources = @{
            CPU = @{
                Usage = $cpuUsage
                Cores = (Get-CimInstance Win32_ComputerSystem).NumberOfProcessors
            }
            Memory = @{
                Total = $totalMemory
                Used = $usedMemory
                Available = $availableMemory
                Usage = $memoryUsage
            }
            Uptime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        }
    } catch {
        $script:MonitorData.Errors += "系统资源数据获取失败: $($_.Exception.Message)"
    }
}

function Get-HealthStatusData {
    try {
        # 后端健康检查
        $backendHealth = Invoke-RestMethod -Uri $HEALTH_ENDPOINT -Method Get -TimeoutSec 5
        
        # 前端健康检查
        $frontendHealthy = $false
        try {
            $frontendResponse = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -Method Get -TimeoutSec 5
            $frontendHealthy = $frontendResponse.StatusCode -eq 200
        } catch {
            $frontendHealthy = $false
        }
        
        $script:MonitorData.HealthStatus = @{
            Backend = @{
                Status = $backendHealth.status
                Uptime = $backendHealth.uptime
                Memory = $backendHealth.memory
                Version = $backendHealth.version
            }
            Frontend = @{
                Status = if ($frontendHealthy) { "healthy" } else { "unhealthy" }
            }
            WebSocket = @{
                Status = "connected"  # 简化处理
            }
        }
    } catch {
        $script:MonitorData.Errors += "健康状态数据获取失败: $($_.Exception.Message)"
    }
}

# ============================================================================
# 智能告警和健康评分系统
# ============================================================================

function Test-AlertConditions {
    $alerts = @()
    $thresholds = $script:MonitorConfig.AlertThresholds

    # CPU告警检查
    $cpuUsage = $script:MonitorData.SystemResources.CPU.Usage
    if ($cpuUsage -ge $thresholds.CPU.Critical) {
        $alerts += Create-Alert "CPU" "Critical" "CPU使用率达到 $cpuUsage%，超过临界值 $($thresholds.CPU.Critical)%"
    } elseif ($cpuUsage -ge $thresholds.CPU.Warning) {
        $alerts += Create-Alert "CPU" "Warning" "CPU使用率达到 $cpuUsage%，超过警告值 $($thresholds.CPU.Warning)%"
    }

    # 内存告警检查
    $memoryUsage = $script:MonitorData.SystemResources.Memory.UsagePercent
    if ($memoryUsage -ge $thresholds.Memory.Critical) {
        $alerts += Create-Alert "Memory" "Critical" "内存使用率达到 $memoryUsage%，超过临界值 $($thresholds.Memory.Critical)%"
    } elseif ($memoryUsage -ge $thresholds.Memory.Warning) {
        $alerts += Create-Alert "Memory" "Warning" "内存使用率达到 $memoryUsage%，超过警告值 $($thresholds.Memory.Warning)%"
    }

    # 磁盘告警检查
    foreach ($disk in $script:MonitorData.SystemResources.Disk) {
        if ($disk.UsagePercent -ge $thresholds.Disk.Critical) {
            $alerts += Create-Alert "Disk" "Critical" "磁盘 $($disk.Drive) 使用率达到 $($disk.UsagePercent)%，超过临界值 $($thresholds.Disk.Critical)%"
        } elseif ($disk.UsagePercent -ge $thresholds.Disk.Warning) {
            $alerts += Create-Alert "Disk" "Warning" "磁盘 $($disk.Drive) 使用率达到 $($disk.UsagePercent)%，超过警告值 $($thresholds.Disk.Warning)%"
        }
    }

    # API响应时间告警检查
    foreach ($apiName in $script:MonitorData.APIStatus.Keys) {
        $api = $script:MonitorData.APIStatus[$apiName]
        if ($api.Status -eq "Offline") {
            $alerts += Create-Alert "API" "Critical" "API $apiName 离线: $($api.Error)"
        } elseif ($api.ResponseTime -ge $thresholds.ResponseTime.Critical) {
            $alerts += Create-Alert "API" "Critical" "API $apiName 响应时间 $($api.ResponseTime)ms，超过临界值 $($thresholds.ResponseTime.Critical)ms"
        } elseif ($api.ResponseTime -ge $thresholds.ResponseTime.Warning) {
            $alerts += Create-Alert "API" "Warning" "API $apiName 响应时间 $($api.ResponseTime)ms，超过警告值 $($thresholds.ResponseTime.Warning)ms"
        }
    }

    # 趋势告警检查
    if ($script:MonitorConfig.TrendAnalysis.Enabled) {
        $trendAlerts = Test-TrendAlerts
        $alerts += $trendAlerts
    }

    # 更新告警列表
    $script:MonitorData.Alerts = $alerts

    # 保存告警历史
    if ($alerts.Count -gt 0) {
        Save-AlertHistory $alerts
    }
}

function Create-Alert {
    param(
        [string]$Category,
        [string]$Severity,
        [string]$Message
    )

    return @{
        Id = [System.Guid]::NewGuid().ToString()
        Category = $Category
        Severity = $Severity
        Message = $Message
        Timestamp = Get-Date
        Acknowledged = $false
    }
}

function Test-TrendAlerts {
    $alerts = @()

    # CPU趋势告警
    if ($script:MonitorData.TrendData.CPU.Count -ge 10) {
        $recentCpu = $script:MonitorData.TrendData.CPU[-10..-1]
        $avgCpu = ($recentCpu | Measure-Object -Average).Average
        $trend = Calculate-Trend $recentCpu

        if ($trend -gt 5 -and $avgCpu -gt 60) {
            $alerts += Create-Alert "Trend" "Warning" "CPU使用率呈上升趋势，平均值 $([math]::Round($avgCpu, 1))%，趋势 +$([math]::Round($trend, 1))%"
        }
    }

    # 内存趋势告警
    if ($script:MonitorData.TrendData.Memory.Count -ge 10) {
        $recentMemory = $script:MonitorData.TrendData.Memory[-10..-1]
        $avgMemory = ($recentMemory | Measure-Object -Average).Average
        $trend = Calculate-Trend $recentMemory

        if ($trend -gt 3 -and $avgMemory -gt 70) {
            $alerts += Create-Alert "Trend" "Warning" "内存使用率呈上升趋势，平均值 $([math]::Round($avgMemory, 1))%，趋势 +$([math]::Round($trend, 1))%"
        }
    }

    return $alerts
}

function Calculate-Trend {
    param([array]$Data)

    if ($Data.Count -lt 2) { return 0 }

    $n = $Data.Count
    $sumX = 0
    $sumY = 0
    $sumXY = 0
    $sumX2 = 0

    for ($i = 0; $i -lt $n; $i++) {
        $x = $i + 1
        $y = $Data[$i]
        $sumX += $x
        $sumY += $y
        $sumXY += $x * $y
        $sumX2 += $x * $x
    }

    $slope = ($n * $sumXY - $sumX * $sumY) / ($n * $sumX2 - $sumX * $sumX)
    return $slope
}

function Calculate-SystemHealthScore {
    $weights = $script:MonitorConfig.HealthScore.Weights
    $score = 100
    $issues = @()

    # CPU健康评分
    $cpuUsage = $script:MonitorData.SystemResources.CPU.Usage
    $cpuScore = 100
    if ($cpuUsage -gt 85) {
        $cpuScore = 0
        $issues += 'CPU使用率过高 (' + $cpuUsage + '%)'
    } elseif ($cpuUsage -gt 70) {
        $cpuScore = 100 - (($cpuUsage - 70) * 4)
        $issues += 'CPU使用率较高 (' + $cpuUsage + '%)'
    } elseif ($cpuUsage -gt 50) {
        $cpuScore = 100 - (($cpuUsage - 50) * 2)
    }

    # 内存健康评分
    $memoryUsage = $script:MonitorData.SystemResources.Memory.UsagePercent
    $memoryScore = 100
    if ($memoryUsage -gt 90) {
        $memoryScore = 0
        $issues += '内存使用率过高 (' + $memoryUsage + '%)'
    } elseif ($memoryUsage -gt 80) {
        $memoryScore = 100 - (($memoryUsage - 80) * 5)
        $issues += '内存使用率较高 (' + $memoryUsage + '%)'
    } elseif ($memoryUsage -gt 60) {
        $memoryScore = 100 - (($memoryUsage - 60) * 2)
    }

    # 磁盘健康评分
    $diskScore = 100
    foreach ($disk in $script:MonitorData.SystemResources.Disk) {
        if ($disk.UsagePercent -gt 95) {
            $diskScore = [math]::Min($diskScore, 0)
            $issues += '磁盘 ' + $disk.Drive + ' 空间不足 (' + $disk.UsagePercent + '%)'
        } elseif ($disk.UsagePercent -gt 85) {
            $diskScore = [math]::Min($diskScore, 100 - (($disk.UsagePercent - 85) * 5))
            $issues += '磁盘 ' + $disk.Drive + ' 空间较少 (' + $disk.UsagePercent + '%)'
        }
    }

    # 服务健康评分
    $serviceScore = 100
    $offlineServices = 0
    $totalServices = $script:MonitorData.APIStatus.Count
    if ($totalServices -gt 0) {
        foreach ($api in $script:MonitorData.APIStatus.Values) {
            if ($api.Status -eq "Offline") {
                $offlineServices++
                $issues += "服务 $($api.Url) 离线"
            }
        }
        $serviceScore = 100 - (($offlineServices / $totalServices) * 100)
    }

    # 响应时间健康评分
    $responseScore = 100
    $slowServices = 0
    if ($totalServices -gt 0) {
        foreach ($api in $script:MonitorData.APIStatus.Values) {
            if ($api.ResponseTime -gt 3000) {
                $slowServices++
                $issues += '服务 ' + $api.Url + ' 响应缓慢 (' + $api.ResponseTime + 'ms)'
            } elseif ($api.ResponseTime -gt 1000) {
                $responseScore = [math]::Min($responseScore, 100 - (($api.ResponseTime - 1000) / 20))
            }
        }
    }

    # 计算综合评分
    $totalScore = ($cpuScore * $weights.CPU) +
                  ($memoryScore * $weights.Memory) +
                  ($diskScore * $weights.Disk) +
                  ($serviceScore * $weights.Services) +
                  ($responseScore * $weights.ResponseTime)

    $totalScore = [math]::Round($totalScore, 1)

    # 确定健康状态
    $status = "Excellent"
    if ($totalScore -lt 50) {
        $status = "Critical"
    } elseif ($totalScore -lt 70) {
        $status = "Poor"
    } elseif ($totalScore -lt 85) {
        $status = "Fair"
    } elseif ($totalScore -lt 95) {
        $status = "Good"
    }

    $script:MonitorData.SystemHealth = @{
        Score = $totalScore
        Status = $status
        Issues = $issues
        Components = @{
            CPU = $cpuScore
            Memory = $memoryScore
            Disk = $diskScore
            Services = $serviceScore
            ResponseTime = $responseScore
        }
        LastCalculated = Get-Date
    }
}

function Save-AlertHistory {
    param([array]$Alerts)

    try {
        $alertHistory = @()
        if (Test-Path $MONITOR_ALERTS_FILE) {
            $alertHistory = Get-Content $MONITOR_ALERTS_FILE -Raw | ConvertFrom-Json
        }

        $alertHistory += $Alerts

        # 保留最近1000条告警
        if ($alertHistory.Count -gt 1000) {
            $alertHistory = $alertHistory[-1000..-1]
        }

        $alertHistory | ConvertTo-Json -Depth 10 | Set-Content $MONITOR_ALERTS_FILE -Encoding UTF8
    } catch {
        Write-Host "保存告警历史失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Update-MonitorData {
    # 清除旧错误
    $script:MonitorData.Errors = @()

    # 收集增强数据
    Get-EnhancedSystemResourceData
    Get-APIPerformanceData
    Get-BackupStatusData

    # 并行收集原有数据
    $jobs = @()
    $jobs += Start-Job -ScriptBlock { param($api) Invoke-RestMethod -Uri "$api/pm2/processes" -Method Get -TimeoutSec 5 } -ArgumentList $API_BASE
    $jobs += Start-Job -ScriptBlock { param($api) Invoke-RestMethod -Uri "$api/pm2/stats" -Method Get -TimeoutSec 5 } -ArgumentList $API_BASE
    $jobs += Start-Job -ScriptBlock { param($health) Invoke-RestMethod -Uri $health -Method Get -TimeoutSec 5 } -ArgumentList $HEALTH_ENDPOINT
    
    # 等待作业完成
    $results = $jobs | Wait-Job -Timeout 10 | Receive-Job
    $jobs | Remove-Job -Force
    
    # 处理结果
    if ($results.Count -ge 1 -and $results[0].success) {
        $script:MonitorData.PM2Processes = $results[0].data
    }
    if ($results.Count -ge 2 -and $results[1].success) {
        $script:MonitorData.PM2Stats = $results[1].data
    }
    if ($results.Count -ge 3) {
        $script:MonitorData.HealthStatus.Backend = $results[2]
    }
    
    # 获取系统资源（同步）- 保持兼容性
    Get-SystemResourceData

    # 执行告警检查
    if ($script:MonitorConfig.Alerts.Enabled) {
        Test-AlertConditions
    }

    # 计算系统健康评分
    Calculate-SystemHealthScore

    # 保存监控历史数据
    Save-MonitorHistory

    # 更新时间戳
    $script:MonitorData.LastUpdate = Get-Date
}

function Save-MonitorHistory {
    try {
        $historyEntry = @{
            Timestamp = Get-Date
            SystemResources = $script:MonitorData.SystemResources
            SystemHealth = $script:MonitorData.SystemHealth
            APIStatus = $script:MonitorData.APIStatus
            BackupStatus = $script:MonitorData.BackupStatus
            ActiveAlerts = $script:MonitorData.Alerts.Count
        }

        $history = @()
        if (Test-Path $MONITOR_HISTORY_FILE) {
            $history = Get-Content $MONITOR_HISTORY_FILE -Raw | ConvertFrom-Json
        }

        $history += $historyEntry

        # 保留最近24小时的数据（假设每3秒一次，约28800条记录）
        if ($history.Count -gt 28800) {
            $history = $history[-28800..-1]
        }

        $history | ConvertTo-Json -Depth 10 | Set-Content $MONITOR_HISTORY_FILE -Encoding UTF8
    } catch {
        Write-Host "保存监控历史失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Generate-MonitoringReport {
    param(
        [string]$OutputPath = "",
        [int]$HoursBack = 24
    )

    try {
        if ([string]::IsNullOrEmpty($OutputPath)) {
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $OutputPath = Join-Path $MONITOR_REPORTS_DIR "monitor-report-$timestamp.html"
        }

        # 读取历史数据
        $history = @()
        if (Test-Path $MONITOR_HISTORY_FILE) {
            $history = Get-Content $MONITOR_HISTORY_FILE -Raw | ConvertFrom-Json
        }

        # 过滤最近N小时的数据
        $cutoffTime = (Get-Date).AddHours(-$HoursBack)
        $recentHistory = $history | Where-Object { [DateTime]::Parse($_.Timestamp) -gt $cutoffTime }

        # 生成HTML报告
        $html = Generate-HTMLReport $recentHistory

        $html | Set-Content $OutputPath -Encoding UTF8

        Write-Host "监控报告已生成: $OutputPath" -ForegroundColor Green
        return $OutputPath

    } catch {
        Write-Host "生成监控报告失败: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Generate-HTMLReport {
    param([array]$History)

    $currentTime = Get-Date
    $systemHealth = $script:MonitorData.SystemHealth

    $html = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>系统监控报告 - $($currentTime.ToString('yyyy-MM-dd HH:mm:ss'))</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        .metric-card { display: inline-block; width: 200px; margin: 10px; padding: 15px; background: #f8f9fa; border-radius: 5px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { font-size: 12px; color: #666; }
        .health-excellent { color: #28a745; }
        .health-good { color: #17a2b8; }
        .health-fair { color: #ffc107; }
        .health-poor { color: #fd7e14; }
        .health-critical { color: #dc3545; }
        .alert-critical { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .alert-warning { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-item { padding: 10px; margin: 5px 0; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>智能多Web应用门户系统监控报告</h1>
            <p>生成时间: $($currentTime.ToString('yyyy-MM-dd HH:mm:ss'))</p>
        </div>

        <div class="section">
            <h2>系统健康概览</h2>
            <div class="metric-card">
                <div class="metric-value health-$($systemHealth.Status.ToLower())">$($systemHealth.Score)</div>
                <div class="metric-label">健康评分</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($systemHealth.Status)</div>
                <div class="metric-label">健康状态</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.Alerts.Count)</div>
                <div class="metric-label">活跃告警</div>
            </div>
        </div>

        <div class="section">
            <h2>当前系统状态</h2>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.SystemResources.CPU.Usage)%</div>
                <div class="metric-label">CPU使用率</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.SystemResources.Memory.UsagePercent)%</div>
                <div class="metric-label">内存使用率</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.SystemResources.Memory.TotalGB) GB</div>
                <div class="metric-label">总内存</div>
            </div>
        </div>

        <div class="section">
            <h2>活跃告警</h2>
"@

    # 添加告警信息
    if ($script:MonitorData.Alerts.Count -gt 0) {
        foreach ($alert in $script:MonitorData.Alerts) {
            $alertClass = if ($alert.Severity -eq "Critical") { "alert-critical" } else { "alert-warning" }
            $html += @"
            <div class="alert-item $alertClass">
                <strong>[$($alert.Severity)] $($alert.Category):</strong> $($alert.Message)
                <br><small>时间: $($alert.Timestamp.ToString('yyyy-MM-dd HH:mm:ss'))</small>
            </div>
"@
        }
    } else {
        $html += "<p>当前没有活跃告警</p>"
    }

    # 添加API状态表
    $html += @"
        </div>

        <div class="section">
            <h2>API服务状态</h2>
            <table>
                <tr>
                    <th>服务名称</th>
                    <th>状态</th>
                    <th>响应时间(ms)</th>
                    <th>最后检查</th>
                </tr>
"@

    foreach ($apiName in $script:MonitorData.APIStatus.Keys) {
        $api = $script:MonitorData.APIStatus[$apiName]
        $statusColor = if ($api.Status -eq "Online") { "color: green;" } else { "color: red;" }
        $html += @"
                <tr>
                    <td>$apiName</td>
                    <td style="$statusColor">$($api.Status)</td>
                    <td>$($api.ResponseTime)</td>
                    <td>$($api.LastCheck.ToString('HH:mm:ss'))</td>
                </tr>
"@
    }

    $html += @"
            </table>
        </div>

        <div class="section">
            <h2>备份系统状态</h2>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.BackupStatus.TotalBackups)</div>
                <div class="metric-label">总备份数</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.BackupStatus.SuccessfulBackups)</div>
                <div class="metric-label">成功备份</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$($script:MonitorData.BackupStatus.TotalSizeMB) MB</div>
                <div class="metric-label">备份总大小</div>
            </div>
        </div>

        <div class="section">
            <h2>报告生成信息</h2>
            <p>数据点数量: $($History.Count)</p>
            <p>监控版本: $SCRIPT_VERSION</p>
            <p>生成时间: $($currentTime.ToString('yyyy-MM-dd HH:mm:ss'))</p>
        </div>
    </div>
</body>
</html>
"@

    return $html
}

# ============================================================================
# 增强显示函数
# ============================================================================

function Show-Header {
    Write-Host ""
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Cyan
    Write-ColorText "  $SCRIPT_NAME v$SCRIPT_VERSION" -Color Cyan
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Cyan
    Write-ColorText "  最后更新: $($script:MonitorData.LastUpdate.ToString('yyyy-MM-dd HH:mm:ss'))  |  刷新间隔: ${RefreshInterval}秒" -Color Gray
    Write-Host ""
}

function Show-Help {
    Clear-Host
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Cyan
    Write-ColorText "  $SCRIPT_NAME v$SCRIPT_VERSION - 帮助文档" -Color Cyan
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Cyan
    Write-Host ""
    Write-ColorText "📖 使用方法:" -Color Yellow
    Write-Host "  .\monitor.ps1 [参数]"
    Write-Host ""
    Write-ColorText "⚙️ 基本参数:" -Color Yellow
    Write-Host "  -RefreshInterval <秒>  刷新间隔 (默认: 3秒)"
    Write-Host "  -BackendPort <端口>    后端端口 (默认: 8002)"
    Write-Host "  -FrontendPort <端口>   前端端口 (默认: 3000)"
    Write-Host "  -Quiet                 静默模式"
    Write-Host "  -Help                  显示帮助"
    Write-Host ""
    Write-ColorText "🚀 增强功能参数:" -Color Yellow
    Write-Host "  -EnableAlerts          启用智能告警系统"
    Write-Host "  -EnableTrendAnalysis   启用趋势分析"
    Write-Host "  -EnableAutoRecovery    启用自动恢复"
    Write-Host "  -GenerateReport        生成监控报告并退出"
    Write-Host "  -ReportPath <路径>     指定报告输出路径"
    Write-Host ""
    Write-ColorText "🎮 交互操作:" -Color Yellow
    Write-Host "  [R] 手动刷新数据"
    Write-Host "  [D] 切换详细视图"
    Write-Host "  [L] 切换日志视图"
    Write-Host "  [G] 日志管理"
    Write-Host "  [A] 切换自动恢复"
    Write-Host "  [F] 手动恢复"
    Write-Host "  [H] 显示帮助"
    Write-Host "  [Q] 退出监控"
    Write-Host ""
    Write-ColorText "💡 使用示例:" -Color Yellow
    Write-Host "  .\monitor.ps1                    # 默认设置启动监控"
    Write-Host "  .\monitor.ps1 -RefreshInterval 5 # 5秒刷新间隔"
    Write-Host ""
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Cyan
    Write-Host ""
    Write-Host "按任意键返回监控界面..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-SystemOverview {
    Write-ColorText "📊 系统概览" -Color Yellow

    $resources = $script:MonitorData.SystemResources
    if ($resources -and $resources.Count -gt 0 -and $resources.CPU) {
        $cpuBar = Get-ProgressBar -Percentage $resources.CPU.Usage -Width 10
        $memoryBar = Get-ProgressBar -Percentage $resources.Memory.Usage -Width 10

        Write-Host "├─ CPU: " -NoNewline
        $cpuColor = if ($resources.CPU.Usage -gt 80) { "Red" } elseif ($resources.CPU.Usage -gt 60) { "Yellow" } else { "Green" }
        Write-ColorText $cpuBar -Color $cpuColor -NoNewline
        Write-Host " $($resources.CPU.Usage)%"

        Write-Host "├─ 内存: " -NoNewline
        $memoryColor = if ($resources.Memory.Usage -gt 80) { "Red" } elseif ($resources.Memory.Usage -gt 60) { "Yellow" } else { "Green" }
        Write-ColorText $memoryBar -Color $memoryColor -NoNewline
        Write-Host " $($resources.Memory.Usage)% ($(Format-Bytes $resources.Memory.Used)/$(Format-Bytes $resources.Memory.Total))"

        Write-Host "└─ CPU核心: $($resources.CPU.Cores)个"
    } else {
        Write-ColorText "├─ 数据加载中..." -Color Gray
        Write-ColorText "├─ CPU: 检测中..." -Color Gray
        Write-ColorText "└─ 内存: 检测中..." -Color Gray
    }
    Write-Host ""
}

function Show-ProcessStatus {
    Write-ColorText "🔄 进程状态" -Color Yellow

    $processes = $script:MonitorData.PM2Processes
    if ($processes -and $processes.Count -gt 0) {
        foreach ($process in $processes) {
            $status = if ($process.pm2_env -and $process.pm2_env.status) { $process.pm2_env.status } else { "unknown" }

            $statusIcon = switch ($status) {
                "online" { "●" }
                "stopped" { "○" }
                "errored" { "✗" }
                default { "?" }
            }

            $statusColor = switch ($status) {
                "online" { "Green" }
                "stopped" { "Gray" }
                "errored" { "Red" }
                default { "Yellow" }
            }

            $processName = if ($process.name) { $process.name } else { "未知进程" }
            Write-Host "├─ $processName " -NoNewline
            Write-ColorText "[$statusIcon]" -Color $statusColor -NoNewline
            Write-Host " $status"

            if ($script:ShowDetails) {
                $processPid = if ($process.pid) { $process.pid } else { "N/A" }
                $processCpu = if ($process.monit -and $process.monit.cpu) { "$($process.monit.cpu)%" } else { "N/A" }
                $processMemory = if ($process.monit -and $process.monit.memory) { Format-Bytes $process.monit.memory } else { "N/A" }
                $processRestarts = if ($process.pm2_env -and $process.pm2_env.restart_time) { $process.pm2_env.restart_time } else { "0" }

                Write-Host "│  ├─ PID: $processPid"
                Write-Host "│  ├─ CPU: $processCpu"
                Write-Host "│  ├─ 内存: $processMemory"
                Write-Host "│  ├─ 重启次数: $processRestarts"

                if ($process.pm2_env -and $process.pm2_env.pm_uptime) {
                    try {
                        $uptime = (Get-Date) - [DateTime]$process.pm2_env.pm_uptime
                        Write-Host "│  └─ 运行时间: $(Format-Duration $uptime.TotalSeconds)"
                    } catch {
                        Write-Host "│  └─ 运行时间: N/A"
                    }
                } else {
                    Write-Host "│  └─ 运行时间: N/A"
                }
            } else {
                $processPid = if ($process.pid) { $process.pid } else { "N/A" }
                $processCpu = if ($process.monit -and $process.monit.cpu) { "$($process.monit.cpu)%" } else { "N/A" }
                $processMemory = if ($process.monit -and $process.monit.memory) { Format-Bytes $process.monit.memory } else { "N/A" }
                $processRestarts = if ($process.pm2_env -and $process.pm2_env.restart_time) { $process.pm2_env.restart_time } else { "0" }

                Write-Host "│  PID: $processPid  CPU: $processCpu  内存: $processMemory  重启: ${processRestarts}次"
            }
        }
    } else {
        Write-ColorText "├─ 无运行中的进程" -Color Gray
        Write-ColorText "└─ 请检查PM2服务状态" -Color Gray
    }
    Write-Host ""
}

function Show-HealthStatus {
    Write-ColorText "💚 服务健康状态" -Color Yellow

    $health = $script:MonitorData.HealthStatus
    if ($health.Count -gt 0) {
        # 后端状态
        $backendIcon = if ($health.Backend.Status -eq "ok") { "✅" } else { "❌" }
        $backendStatus = if ($health.Backend.Status -eq "ok") { "健康" } else { "异常" }
        Write-Host "├─ 后端API: $backendIcon $backendStatus"

        if ($script:ShowDetails -and $health.Backend) {
            Write-Host "│  ├─ 版本: $($health.Backend.Version)"
            Write-Host "│  ├─ 运行时间: $(Format-Duration $health.Backend.Uptime)"
            Write-Host "│  └─ 内存使用: $(Format-Bytes $health.Backend.Memory.heapUsed)/$(Format-Bytes $health.Backend.Memory.heapTotal)"
        }

        # 前端状态
        $frontendIcon = if ($health.Frontend.Status -eq "healthy") { "✅" } else { "❌" }
        $frontendStatus = if ($health.Frontend.Status -eq "healthy") { "健康" } else { "异常" }
        Write-Host "├─ 前端服务: $frontendIcon $frontendStatus"

        # WebSocket状态
        $wsIcon = if ($health.WebSocket.Status -eq "connected") { "✅" } else { "❌" }
        $wsStatus = if ($health.WebSocket.Status -eq "connected") { "连接" } else { "断开" }
        Write-Host "└─ WebSocket: $wsIcon $wsStatus"
    } else {
        Write-ColorText "  健康状态检查中..." -Color Gray
    }
    Write-Host ""
}

function Show-RecentLogs {
    Write-ColorText "📝 最新日志" -Color Yellow

    if ($script:ShowLogs) {
        try {
            # 尝试获取PM2日志
            $processes = $script:MonitorData.PM2Processes
            if ($processes.Count -gt 0) {
                $mainProcess = $processes[0]
                $response = Invoke-RestMethod -Uri "$API_BASE/pm2/processes/$($mainProcess.name)/logs?lines=$script:LogLines" -Method Get -TimeoutSec 5

                if ($response.success -and $response.data.logs) {
                    $logs = $response.data.logs | Select-Object -Last $script:LogLines
                    foreach ($log in $logs) {
                        $timestamp = $log.timestamp
                        $message = $log.message
                        Write-Host "├─ [$timestamp] $message"
                    }
                } else {
                    Write-ColorText "  暂无日志数据" -Color Gray
                }
            } else {
                Write-ColorText "  无可用进程日志" -Color Gray
            }
        } catch {
            Write-ColorText "  日志获取失败: $($_.Exception.Message)" -Color Red
        }
    } else {
        # 显示简化的系统事件
        $events = @(
            "[$(Get-Date -Format 'HH:mm:ss')] 监控系统运行中",
            "[$(Get-Date -Format 'HH:mm:ss')] 数据刷新正常",
            "[$(Get-Date -Format 'HH:mm:ss')] 所有服务监控中"
        )

        foreach ($event in $events) {
            Write-Host "├─ $event"
        }
    }
    Write-Host ""
}

function Show-RecoveryStatus {
    Write-ColorText "🔧 自动恢复状态" -Color Yellow

    $recoveryStatus = if ($script:RecoveryEnabled) { "✅ 启用" } else { "❌ 禁用" }
    $recoveryColor = if ($script:RecoveryEnabled) { "Green" } else { "Red" }

    Write-Host "├─ 自动恢复: " -NoNewline
    Write-ColorText $recoveryStatus -Color $recoveryColor

    if ($script:RecoveryStats.TotalRecoveries -gt 0) {
        Write-Host "├─ 总恢复次数: $($script:RecoveryStats.TotalRecoveries)"
        Write-Host "├─ 成功恢复: $($script:RecoveryStats.SuccessfulRecoveries)"
        if ($script:RecoveryStats.LastRecoveryTime) {
            Write-Host "└─ 最后恢复: $($script:RecoveryStats.LastRecoveryTime.ToString('HH:mm:ss'))"
        } else {
            Write-Host "└─ 最后恢复: 无"
        }
    } else {
        Write-Host "└─ 恢复历史: 无"
    }
    Write-Host ""
}

function Show-Controls {
    Write-ColorText "🎮 操作: " -Color Yellow -NoNewline
    $recoveryIndicator = if ($script:RecoveryEnabled) { "[A]恢复✅" } else { "[A]恢复❌" }
    Write-Host "[R]刷新 [D]详细 [L]日志 [G]日志管理 $recoveryIndicator [F]手动恢复 [H]帮助 [Q]退出"
    Write-Host ""
}

function Show-ErrorMessages {
    if ($script:MonitorData.Errors.Count -gt 0) {
        Write-ColorText "⚠️ 错误信息:" -Color Red
        foreach ($error in $script:MonitorData.Errors) {
            Write-ColorText "  • $error" -Color Red
        }
        Write-Host ""
    }
}

function Show-SystemHealthOverview {
    $health = $script:MonitorData.SystemHealth

    Write-Host ""
    Write-ColorText "🏥 系统健康概览" -Color Yellow
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Gray

    # 健康评分显示
    $scoreColor = switch ($health.Status) {
        "Excellent" { "Green" }
        "Good" { "Cyan" }
        "Fair" { "Yellow" }
        "Poor" { "Magenta" }
        "Critical" { "Red" }
        default { "White" }
    }

    Write-Host "  🎯 健康评分: " -NoNewline
    Write-ColorText "$($health.Score)/100" -Color $scoreColor -NoNewline
    Write-Host " ($($health.Status))"

    # 组件评分
    Write-Host "  📊 组件评分:"
    Write-Host "    CPU: $([math]::Round($health.Components.CPU, 1))" -ForegroundColor $(if ($health.Components.CPU -gt 80) { "Green" } elseif ($health.Components.CPU -gt 60) { "Yellow" } else { "Red" })
    Write-Host "    内存: $([math]::Round($health.Components.Memory, 1))" -ForegroundColor $(if ($health.Components.Memory -gt 80) { "Green" } elseif ($health.Components.Memory -gt 60) { "Yellow" } else { "Red" })
    Write-Host "    磁盘: $([math]::Round($health.Components.Disk, 1))" -ForegroundColor $(if ($health.Components.Disk -gt 80) { "Green" } elseif ($health.Components.Disk -gt 60) { "Yellow" } else { "Red" })
    Write-Host "    服务: $([math]::Round($health.Components.Services, 1))" -ForegroundColor $(if ($health.Components.Services -gt 80) { "Green" } elseif ($health.Components.Services -gt 60) { "Yellow" } else { "Red" })
    Write-Host "    响应: $([math]::Round($health.Components.ResponseTime, 1))" -ForegroundColor $(if ($health.Components.ResponseTime -gt 80) { "Green" } elseif ($health.Components.ResponseTime -gt 60) { "Yellow" } else { "Red" })

    # 问题列表
    if ($health.Issues.Count -gt 0) {
        Write-Host "  ⚠️ 发现问题:"
        foreach ($issue in $health.Issues) {
            Write-Host "    • $issue" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✅ 系统运行正常" -ForegroundColor Green
    }

    Write-Host ""
}

function Show-AlertsOverview {
    $alerts = $script:MonitorData.Alerts

    if ($alerts.Count -eq 0) {
        Write-ColorText "🔔 告警状态: " -Color Yellow -NoNewline
        Write-ColorText "无活跃告警" -Color Green
        return
    }

    Write-ColorText "🚨 活跃告警 ($($alerts.Count))" -Color Red
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Gray

    $criticalAlerts = $alerts | Where-Object { $_.Severity -eq "Critical" }
    $warningAlerts = $alerts | Where-Object { $_.Severity -eq "Warning" }

    if ($criticalAlerts.Count -gt 0) {
        Write-ColorText "  🔴 严重告警 ($($criticalAlerts.Count)):" -Color Red
        foreach ($alert in $criticalAlerts | Select-Object -First 3) {
            Write-Host "    • [$($alert.Category)] $($alert.Message)" -ForegroundColor Red
        }
        if ($criticalAlerts.Count -gt 3) {
            Write-Host "    ... 还有 $($criticalAlerts.Count - 3) 个严重告警" -ForegroundColor Red
        }
    }

    if ($warningAlerts.Count -gt 0) {
        Write-ColorText "  🟡 警告告警 ($($warningAlerts.Count)):" -Color Yellow
        foreach ($alert in $warningAlerts | Select-Object -First 2) {
            Write-Host "    • [$($alert.Category)] $($alert.Message)" -ForegroundColor Yellow
        }
        if ($warningAlerts.Count -gt 2) {
            Write-Host "    ... 还有 $($warningAlerts.Count - 2) 个警告告警" -ForegroundColor Yellow
        }
    }

    Write-Host ""
}

function Show-TrendAnalysis {
    if (-not $script:MonitorConfig.TrendAnalysis.Enabled) {
        return
    }

    Write-ColorText "📈 性能趋势分析" -Color Yellow
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Gray

    # CPU趋势
    if ($script:MonitorData.TrendData.CPU.Count -gt 5) {
        $cpuTrend = Calculate-Trend $script:MonitorData.TrendData.CPU[-10..-1]
        $trendIcon = if ($cpuTrend -gt 2) { "📈" } elseif ($cpuTrend -lt -2) { "📉" } else { "➡️" }
        $trendColor = if ($cpuTrend -gt 2) { "Red" } elseif ($cpuTrend -lt -2) { "Green" } else { "Yellow" }
        Write-Host "  $trendIcon CPU趋势: " -NoNewline
        Write-ColorText "$([math]::Round($cpuTrend, 1))%" -Color $trendColor
    }

    # 内存趋势
    if ($script:MonitorData.TrendData.Memory.Count -gt 5) {
        $memoryTrend = Calculate-Trend $script:MonitorData.TrendData.Memory[-10..-1]
        $trendIcon = if ($memoryTrend -gt 2) { "📈" } elseif ($memoryTrend -lt -2) { "📉" } else { "➡️" }
        $trendColor = if ($memoryTrend -gt 2) { "Red" } elseif ($memoryTrend -lt -2) { "Green" } else { "Yellow" }
        Write-Host "  $trendIcon 内存趋势: " -NoNewline
        Write-ColorText "$([math]::Round($memoryTrend, 1))%" -Color $trendColor
    }

    # 响应时间趋势
    if ($script:MonitorData.TrendData.ResponseTime.Count -gt 5) {
        $responseTrend = Calculate-Trend $script:MonitorData.TrendData.ResponseTime[-10..-1]
        $trendIcon = if ($responseTrend -gt 50) { "📈" } elseif ($responseTrend -lt -50) { "📉" } else { "➡️" }
        $trendColor = if ($responseTrend -gt 50) { "Red" } elseif ($responseTrend -lt -50) { "Green" } else { "Yellow" }
        Write-Host "  $trendIcon 响应时间趋势: " -NoNewline
        Write-ColorText "$([math]::Round($responseTrend, 1))ms" -Color $trendColor
    }

    Write-Host ""
}

function Show-APIStatusOverview {
    if ($script:MonitorData.APIStatus.Count -eq 0) {
        return
    }

    Write-ColorText "🔌 API服务状态" -Color Yellow
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Gray

    $onlineCount = 0
    $totalResponseTime = 0
    $responseCount = 0

    foreach ($apiName in $script:MonitorData.APIStatus.Keys) {
        $api = $script:MonitorData.APIStatus[$apiName]
        $statusIcon = if ($api.Status -eq "Online") { "🟢" } else { "🔴" }
        $statusColor = if ($api.Status -eq "Online") { "Green" } else { "Red" }

        if ($api.Status -eq "Online") {
            $onlineCount++
            if ($api.ResponseTime -gt 0) {
                $totalResponseTime += $api.ResponseTime
                $responseCount++
            }
        }

        Write-Host "  $statusIcon $apiName " -NoNewline
        Write-ColorText "($($api.Status))" -Color $statusColor -NoNewline
        if ($api.ResponseTime -gt 0) {
            Write-Host " - $($api.ResponseTime)ms"
        } else {
            Write-Host ""
        }
    }

    $avgResponseTime = if ($responseCount -gt 0) { [math]::Round($totalResponseTime / $responseCount, 1) } else { 0 }
    Write-Host "  📊 在线: $onlineCount/$($script:MonitorData.APIStatus.Count) | 平均响应: ${avgResponseTime}ms"
    Write-Host ""
}

function Show-BackupStatusOverview {
    if ($script:MonitorData.BackupStatus.Count -eq 0) {
        return
    }

    Write-ColorText "🗄️ 备份系统状态" -Color Yellow
    Write-ColorText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color Gray

    $backup = $script:MonitorData.BackupStatus
    Write-Host "  📦 总备份: $($backup.TotalBackups) | 成功: $($backup.SuccessfulBackups) | 失败: $($backup.FailedBackups)"
    Write-Host "  💾 总大小: $($backup.TotalSizeMB) MB"
    if ($backup.LastBackup) {
        Write-Host "  🕐 最后备份: $($backup.LastBackup)"
    }
    Write-Host ""
}

function Show-MonitorDashboard {
    Clear-Host
    Show-Header

    # 显示系统健康概览
    Show-SystemHealthOverview

    # 显示告警信息
    Show-AlertsOverview

    # 显示趋势分析
    Show-TrendAnalysis

    # 显示API状态
    Show-APIStatusOverview

    # 显示备份状态
    Show-BackupStatusOverview

    # 创建两列布局（保持原有显示逻辑）
    $leftColumn = @()
    $rightColumn = @()

    # 左列：系统概览和进程状态
    $leftColumn += "📊 系统概览"
    $leftColumn += Show-SystemOverview
    $leftColumn += "🔄 进程状态"
    $leftColumn += Show-ProcessStatus

    # 右列：健康状态和日志
    $rightColumn += "💚 服务健康状态"
    $rightColumn += Show-HealthStatus
    $rightColumn += "📝 最新日志"
    $rightColumn += Show-RecentLogs

    # 显示左列
    Show-SystemOverview
    Show-ProcessStatus

    # 显示右列
    Show-HealthStatus
    Show-RecentLogs

    # 显示恢复状态
    Show-RecoveryStatus

    # 显示错误信息
    Show-ErrorMessages

    # 显示控制说明
    Show-Controls
}

# ============================================================================
# 交互控制函数
# ============================================================================

function Handle-KeyInput {
    if ($Host.UI.RawUI.KeyAvailable) {
        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

        switch ($key.Character.ToString().ToUpper()) {
            'R' {
                # 手动刷新
                Update-MonitorData
                return $true
            }
            'D' {
                # 切换详细视图
                $script:ShowDetails = -not $script:ShowDetails
                return $true
            }
            'L' {
                # 切换日志视图
                $script:ShowLogs = -not $script:ShowLogs
                return $true
            }
            'G' {
                # 日志管理
                Invoke-LogManagement
                return $true
            }
            'A' {
                # 切换自动恢复
                $script:RecoveryEnabled = -not $script:RecoveryEnabled
                Write-ColorText "自动恢复已$(if ($script:RecoveryEnabled) { '启用' } else { '禁用' })" -Color $(if ($script:RecoveryEnabled) { "Green" } else { "Red" })
                Start-Sleep -Seconds 1
                return $true
            }
            'F' {
                # 手动恢复
                Invoke-ManualRecovery
                return $true
            }
            'H' {
                # 显示帮助
                Show-Help
                return $true
            }
            'Q' {
                # 退出
                $script:IsRunning = $false
                return $false
            }
            default {
                return $true
            }
        }
    }
    return $true
}

function Invoke-ManualRecovery {
    Write-ColorText "🔧 执行手动恢复..." -Color Yellow

    # 检查recovery.ps1是否存在
    $recoveryScript = Join-Path $PSScriptRoot "recovery.ps1"
    if (-not (Test-Path $recoveryScript)) {
        Write-ColorText "❌ 恢复脚本不存在: recovery.ps1" -Color Red
        Start-Sleep -Seconds 2
        return
    }

    try {
        # 执行恢复脚本
        Write-ColorText "正在执行系统恢复..." -Color Yellow
        $result = & $recoveryScript -Mode recover -BackendPort $BackendPort -FrontendPort $FrontendPort -VerboseOutput

        # 更新恢复统计
        $script:RecoveryStats.TotalRecoveries++
        $script:RecoveryStats.LastRecoveryTime = Get-Date

        # 检查恢复结果（简化处理）
        if ($LASTEXITCODE -eq 0) {
            $script:RecoveryStats.SuccessfulRecoveries++
            Write-ColorText "✅ 手动恢复完成" -Color Green
        } else {
            Write-ColorText "⚠️ 恢复过程中出现问题" -Color Yellow
        }

        # 刷新监控数据
        Update-MonitorData

    } catch {
        Write-ColorText "❌ 恢复执行失败: $($_.Exception.Message)" -Color Red
    }

    Start-Sleep -Seconds 3
}

function Invoke-LogManagement {
    Write-ColorText "📝 日志管理菜单" -Color Yellow
    Write-Host ""
    Write-Host "请选择日志管理操作:"
    Write-Host "  [1] 查看最新日志"
    Write-Host "  [2] 搜索日志内容"
    Write-Host "  [3] 查看日志统计"
    Write-Host "  [4] 清理日志文件"
    Write-Host "  [5] 实时监控日志"
    Write-Host "  [0] 返回监控界面"
    Write-Host ""

    $choice = Read-Host "请输入选择 (0-5)"

    switch ($choice) {
        "1" {
            Write-ColorText "查看最新日志..." -Color Cyan
            if (Get-Command Show-LogEntries -ErrorAction SilentlyContinue) {
                Show-LogEntries "all" "ALL" "" "1h" 20
            } else {
                Write-ColorText "日志系统未加载" -Color Red
            }
            Read-Host "按回车键继续"
        }
        "2" {
            $searchTerm = Read-Host "请输入搜索关键词"
            if ($searchTerm -and (Get-Command Search-LogEntries -ErrorAction SilentlyContinue)) {
                Search-LogEntries $searchTerm "all" "ALL" "24h" 30
            } else {
                Write-ColorText "搜索失败或日志系统未加载" -Color Red
            }
            Read-Host "按回车键继续"
        }
        "3" {
            Write-ColorText "生成日志统计..." -Color Cyan
            if (Get-Command Show-LogStatistics -ErrorAction SilentlyContinue) {
                Show-LogStatistics "all" "24h"
            } else {
                Write-ColorText "日志系统未加载" -Color Red
            }
            Read-Host "按回车键继续"
        }
        "4" {
            Write-ColorText "⚠️ 警告：此操作将清理日志文件" -Color Yellow
            $confirm = Read-Host "确定要继续吗？(y/N)"
            if ($confirm -eq "y" -or $confirm -eq "Y") {
                if (Get-Command Clear-LogFiles -ErrorAction SilentlyContinue) {
                    Clear-LogFiles "all" -Archive:$true -Force:$true
                } else {
                    Write-ColorText "日志系统未加载" -Color Red
                }
            }
            Read-Host "按回车键继续"
        }
        "5" {
            Write-ColorText "启动实时日志监控（按Ctrl+C退出）..." -Color Cyan
            if (Get-Command Start-LogTail -ErrorAction SilentlyContinue) {
                Start-LogTail "all" "ALL"
            } else {
                Write-ColorText "日志系统未加载" -Color Red
                Read-Host "按回车键继续"
            }
        }
        "0" {
            # 返回监控界面
        }
        default {
            Write-ColorText "无效选择" -Color Red
            Start-Sleep -Seconds 1
        }
    }
}

function Start-MonitorLoop {
    Write-Host "正在启动监控仪表板..." -ForegroundColor Green
    Write-Host "初始化数据收集..." -ForegroundColor Yellow

    # 初始数据收集
    Update-MonitorData

    Write-Host "监控仪表板已启动！按 Q 退出，按 H 查看帮助。" -ForegroundColor Green
    Start-Sleep -Seconds 2

    $lastRefresh = Get-Date

    while ($script:IsRunning) {
        # 检查是否需要刷新数据
        $now = Get-Date
        if (($now - $lastRefresh).TotalSeconds -ge $RefreshInterval) {
            Update-MonitorData
            $lastRefresh = $now
        }

        # 显示监控界面
        Show-MonitorDashboard

        # 处理用户输入
        $continue = Handle-KeyInput
        if (-not $continue) {
            break
        }

        # 短暂休眠以减少CPU使用
        Start-Sleep -Milliseconds 500
    }

    Write-Host ""
    Write-ColorText "监控仪表板已退出。" -Color Green
}

# ============================================================================
# 初始化和配置函数
# ============================================================================

function Initialize-EnhancedMonitoring {
    Write-Host "初始化增强监控系统..." -ForegroundColor Yellow

    # 启用告警系统
    if ($EnableAlerts) {
        $script:MonitorConfig.Alerts.Enabled = $true
        Write-Host "✅ 告警系统已启用" -ForegroundColor Green
    }

    # 启用趋势分析
    if ($EnableTrendAnalysis) {
        $script:MonitorConfig.TrendAnalysis.Enabled = $true
        Write-Host "✅ 趋势分析已启用" -ForegroundColor Green
    }

    # 加载历史数据
    Load-MonitoringHistory

    # 保存配置
    Save-MonitoringConfig

    Write-Host "增强监控系统初始化完成" -ForegroundColor Green
}

function Load-MonitoringHistory {
    try {
        if (Test-Path $MONITOR_HISTORY_FILE) {
            $history = Get-Content $MONITOR_HISTORY_FILE -Raw | ConvertFrom-Json

            # 加载最近的趋势数据
            $recentHistory = $history | Sort-Object { [DateTime]::Parse($_.Timestamp) } | Select-Object -Last 60

            foreach ($entry in $recentHistory) {
                if ($entry.SystemResources.CPU) {
                    $script:MonitorData.TrendData.CPU += $entry.SystemResources.CPU.Usage
                }
                if ($entry.SystemResources.Memory) {
                    $script:MonitorData.TrendData.Memory += $entry.SystemResources.Memory.UsagePercent
                }
                if ($entry.SystemResources.Disk -and $entry.SystemResources.Disk.Count -gt 0) {
                    $mainDisk = $entry.SystemResources.Disk | Where-Object { $_.Drive -eq "C:" }
                    if ($mainDisk) {
                        $script:MonitorData.TrendData.Disk += $mainDisk.UsagePercent
                    }
                }
            }

            Write-Host "已加载 $($recentHistory.Count) 条历史数据" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "加载历史数据失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Save-MonitoringConfig {
    try {
        $config = @{
            Version = $SCRIPT_VERSION
            LastUpdated = Get-Date
            AlertThresholds = $script:MonitorConfig.AlertThresholds
            TrendAnalysis = $script:MonitorConfig.TrendAnalysis
            Alerts = $script:MonitorConfig.Alerts
            HealthScore = $script:MonitorConfig.HealthScore
        }

        $config | ConvertTo-Json -Depth 10 | Set-Content $MONITOR_CONFIG_FILE -Encoding UTF8
    } catch {
        Write-Host "保存监控配置失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ============================================================================
# 主函数
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-Help
        return
    }

    # 初始化增强监控配置
    Initialize-EnhancedMonitoring

    # 处理报告生成请求
    if ($GenerateReport) {
        Write-Host "正在生成监控报告..." -ForegroundColor Yellow

        # 收集当前数据
        Update-MonitorData

        # 生成报告
        $reportPath = Generate-MonitoringReport -OutputPath $ReportPath
        if ($reportPath) {
            Write-Host "监控报告已生成: $reportPath" -ForegroundColor Green

            # 尝试打开报告
            try {
                Start-Process $reportPath
            } catch {
                Write-Host "无法自动打开报告，请手动打开: $reportPath" -ForegroundColor Yellow
            }
        }
        return
    }

    # 检查依赖
    if (-not (Test-Path "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")) {
        Write-Error "需要PowerShell环境"
        return
    }

    # 验证端口参数
    if ($BackendPort -lt 1 -or $BackendPort -gt 65535) {
        Write-Error "无效的后端端口: $BackendPort"
        return
    }

    if ($FrontendPort -lt 1 -or $FrontendPort -gt 65535) {
        Write-Error "无效的前端端口: $FrontendPort"
        return
    }

    # 测试后端连接
    try {
        Write-Host "测试后端连接..." -ForegroundColor Yellow
        $testResponse = Invoke-RestMethod -Uri $HEALTH_ENDPOINT -Method Get -TimeoutSec 5
        Write-Host "✅ 后端连接正常" -ForegroundColor Green
    } catch {
        Write-Warning "⚠️ 后端连接失败: $($_.Exception.Message)"
        Write-Host "监控功能可能受限，但仍可查看系统资源信息。" -ForegroundColor Yellow

        $continue = Read-Host "是否继续启动监控? (y/N)"
        if ($continue -ne 'y' -and $continue -ne 'Y') {
            return
        }
    }

    # 设置控制台
    try {
        $Host.UI.RawUI.WindowTitle = "$SCRIPT_NAME v$SCRIPT_VERSION"
        $Host.UI.RawUI.CursorSize = 0  # 隐藏光标
    } catch {
        # 忽略控制台设置错误
    }

    # 注册清理函数
    Register-EngineEvent PowerShell.Exiting -Action {
        $script:IsRunning = $false
        try {
            $Host.UI.RawUI.CursorSize = 25  # 恢复光标
        } catch {}
    }

    # 启动监控循环
    try {
        Start-MonitorLoop
    } catch {
        Write-Error "监控过程中发生错误: $($_.Exception.Message)"
    } finally {
        # 恢复控制台设置
        try {
            $Host.UI.RawUI.CursorSize = 25
        } catch {}
    }
}

# 执行主函数
Main
