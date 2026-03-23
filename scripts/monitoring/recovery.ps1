# 智能多Web应用门户系统 - 自动恢复机制
# 提供故障检测、自动恢复、日志记录等功能
# 作者: Augment Agent
# 版本: 1.1.0

param(
    [string]$Mode = "monitor",  # monitor, recover, daemon
    [string]$ConfigFile = "recovery-config.json",
    [int]$CheckInterval = 30,
    [int]$BackendPort = 8002,
    [int]$FrontendPort = 3000,
    [switch]$EnableAutoRecover = $true,
    [switch]$VerboseOutput,
    [switch]$DryRun,
    [switch]$Help
)

# ============================================================================
# 全局配置和变量
# ============================================================================

$SCRIPT_VERSION = "1.1.0"
$SCRIPT_NAME = "智能多Web应用门户系统自动恢复机制"

# 路径配置
$PROJECT_ROOT = $PSScriptRoot
$CONFIG_FILE = Join-Path $PROJECT_ROOT $ConfigFile
$BACKEND_DIR = Join-Path $PROJECT_ROOT "detection-api"

# 导入统一日志系统
$LOGS_SCRIPT = Join-Path $PROJECT_ROOT "logs.ps1"
if (Test-Path $LOGS_SCRIPT) {
    . $LOGS_SCRIPT
}

# 导入配置管理系统
$CONFIG_SCRIPT = Join-Path $PROJECT_ROOT "config.ps1"
if (Test-Path $CONFIG_SCRIPT) {
    . $CONFIG_SCRIPT
}

# API端点配置
$API_BASE = "http://localhost:$BackendPort/api"
$HEALTH_ENDPOINT = "http://localhost:$BackendPort/health"

# 恢复状态
$script:RecoveryStats = @{
    TotalChecks = 0
    FailuresDetected = 0
    RecoveryAttempts = 0
    SuccessfulRecoveries = 0
    LastCheck = $null
    LastRecovery = $null
    CurrentStatus = "正常"
}

# 故障历史
$script:FailureHistory = @()

# ============================================================================
# 工具函数
# ============================================================================

function Write-RecoveryLog {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS", "DEBUG")]
        [string]$Level = "INFO",
        [string]$Component = "RECOVERY"
    )

    # 使用统一日志系统
    if (Get-Command Write-UnifiedLog -ErrorAction SilentlyContinue) {
        Write-UnifiedLog -Message $Message -Level $Level -Component $Component -Source "recovery.ps1"
    } else {
        # 回退到原始日志方式
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logEntry = "[$timestamp] [$Component] [$Level] $Message"

        # 控制台输出
        if ($VerboseOutput -or $Level -in @("ERROR", "WARN", "SUCCESS")) {
            $color = switch ($Level) {
                "INFO" { "White" }
                "WARN" { "Yellow" }
                "ERROR" { "Red" }
                "SUCCESS" { "Green" }
                "DEBUG" { "Gray" }
            }
            Write-Host $logEntry -ForegroundColor $color
        }
    }
}

function Get-DefaultConfig {
    return @{
        recovery = @{
            enabled = $true
            checkInterval = 30
            maxRetries = 3
            retryDelay = 10
        }
        monitoring = @{
            healthCheckTimeout = 10
            processCheckEnabled = $true
            portCheckEnabled = $true
            resourceCheckEnabled = $true
        }
        strategies = @{
            processRestart = @{
                enabled = $true
                maxAttempts = 3
                cooldownPeriod = 60
            }
            portCleanup = @{
                enabled = $true
                forceKill = $false
                waitTime = 5
            }
            serviceRepair = @{
                enabled = $true
                rebuildOnFailure = $false
                configReset = $true
            }
        }
        notifications = @{
            enabled = $true
            logLevel = "INFO"
            maxLogSize = 10485760  # 10MB
        }
    }
}

function Load-RecoveryConfig {
    # 尝试从统一配置系统加载配置
    if (Get-Command Get-ConfigForScript -ErrorAction SilentlyContinue) {
        try {
            $unifiedConfig = Get-ConfigForScript "recovery"
            Write-RecoveryLog "从统一配置系统加载配置成功" "INFO"

            # 转换为recovery脚本格式
            $recoveryConfig = @{
                recovery = @{
                    enabled = $unifiedConfig.EnableAutoRecover
                    checkInterval = $unifiedConfig.CheckInterval
                    maxRetries = 3
                    retryDelay = 10
                }
                monitoring = @{
                    healthCheckTimeout = 10
                    processCheckEnabled = $true
                    portCheckEnabled = $true
                    resourceCheckEnabled = $true
                }
                strategies = @{
                    processRestart = @{
                        enabled = $true
                        maxAttempts = 3
                        cooldownPeriod = 60
                    }
                    portCleanup = @{
                        enabled = $true
                        forceKill = $false
                        waitTime = 5
                    }
                    serviceRepair = @{
                        enabled = $true
                        rebuildOnFailure = $false
                        configReset = $true
                    }
                }
                notifications = @{
                    enabled = $true
                    logLevel = "INFO"
                    maxLogSize = 10485760
                }
            }

            return $recoveryConfig
        } catch {
            Write-RecoveryLog "统一配置系统加载失败，回退到本地配置: $($_.Exception.Message)" "WARN"
        }
    }

    # 回退到原有的配置加载方式
    if (Test-Path $CONFIG_FILE) {
        try {
            $configContent = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
            Write-RecoveryLog "本地配置文件加载成功" "INFO"
            return $configContent
        } catch {
            Write-RecoveryLog "配置文件格式错误，使用默认配置: $($_.Exception.Message)" "WARN"
        }
    } else {
        Write-RecoveryLog "配置文件不存在，创建默认配置" "INFO"
        $defaultConfig = Get-DefaultConfig
        try {
            $defaultConfig | ConvertTo-Json -Depth 10 | Set-Content $CONFIG_FILE -Encoding UTF8
        } catch {
            Write-RecoveryLog "无法创建配置文件: $($_.Exception.Message)" "WARN"
        }
    }

    return Get-DefaultConfig
}

# ============================================================================
# 故障检测函数
# ============================================================================

function Test-ProcessHealth {
    param([object]$Config)
    
    if (-not $Config.monitoring.processCheckEnabled) {
        return @{ Status = "跳过"; Message = "进程检查已禁用" }
    }
    
    try {
        # 检查PM2进程
        $pm2Output = pm2 list 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $pm2Output) {
            return @{
                Status = "故障";
                Message = "PM2服务未运行或无法访问";
                Type = "PM2ServiceFailure";
                Severity = "高"
            }
        }

        # 解析PM2输出（简化处理）
        $onlineCount = 0
        $totalCount = 0
        $criticalProcesses = @("portal-api", "main-app")
        $runningCritical = @()

        foreach ($line in $pm2Output) {
            if ($line -match "│\s+(\d+)\s+│\s+(\S+)\s+│\s+(\S+)\s+│") {
                $totalCount++
                $processName = $matches[2]
                $status = $matches[3]

                if ($status -eq "online") {
                    $onlineCount++
                    if ($processName -in $criticalProcesses) {
                        $runningCritical += $processName
                    }
                }
            }
        }

        if ($onlineCount -eq 0) {
            return @{
                Status = "故障";
                Message = "没有运行中的PM2进程";
                Type = "ProcessFailure";
                Severity = "高"
            }
        }

        # 检查关键进程
        $missingCritical = $criticalProcesses | Where-Object { $_ -notin $runningCritical }

        if ($missingCritical.Count -gt 0) {
            return @{
                Status = "故障";
                Message = "关键进程未运行: $($missingCritical -join ', ')";
                Type = "CriticalProcessFailure";
                Severity = "高";
                FailedProcesses = $missingCritical
            }
        }
        
        return @{ Status = "正常"; Message = "所有进程运行正常" }
        
    } catch {
        return @{ 
            Status = "故障"; 
            Message = "进程检查失败: $($_.Exception.Message)"; 
            Type = "ProcessCheckFailure";
            Severity = "中"
        }
    }
}

function Test-ServiceHealth {
    param([object]$Config)
    
    try {
        # 检查后端API健康状态
        $response = Invoke-RestMethod -Uri $HEALTH_ENDPOINT -Method Get -TimeoutSec $Config.monitoring.healthCheckTimeout
        
        if ($response.status -ne "ok") {
            return @{ 
                Status = "故障"; 
                Message = "后端API健康检查失败"; 
                Type = "ServiceHealthFailure";
                Severity = "高"
            }
        }
        
        # 检查关键API端点
        $criticalEndpoints = @(
            "$API_BASE/pm2/processes",
            "$API_BASE/pm2/stats"
        )
        
        foreach ($endpoint in $criticalEndpoints) {
            try {
                $testResponse = Invoke-RestMethod -Uri $endpoint -Method Get -TimeoutSec 5
                if (-not $testResponse.success) {
                    return @{ 
                        Status = "故障"; 
                        Message = "关键API端点异常: $endpoint"; 
                        Type = "APIEndpointFailure";
                        Severity = "中"
                    }
                }
            } catch {
                return @{ 
                    Status = "故障"; 
                    Message = "API端点无响应: $endpoint"; 
                    Type = "APIEndpointFailure";
                    Severity = "中"
                }
            }
        }
        
        return @{ Status = "正常"; Message = "服务健康检查通过" }
        
    } catch {
        return @{ 
            Status = "故障"; 
            Message = "服务健康检查失败: $($_.Exception.Message)"; 
            Type = "ServiceHealthFailure";
            Severity = "高"
        }
    }
}

function Test-PortAvailability {
    param([object]$Config)
    
    if (-not $Config.monitoring.portCheckEnabled) {
        return @{ Status = "跳过"; Message = "端口检查已禁用" }
    }
    
    $criticalPorts = @($BackendPort, $FrontendPort)
    $portIssues = @()
    
    foreach ($port in $criticalPorts) {
        try {
            $connection = Test-NetConnection -ComputerName "localhost" -Port $port -WarningAction SilentlyContinue
            if (-not $connection.TcpTestSucceeded) {
                $portIssues += "端口 $port 无法连接"
            }
        } catch {
            $portIssues += "端口 $port 检查失败: $($_.Exception.Message)"
        }
    }
    
    if ($portIssues.Count -gt 0) {
        return @{ 
            Status = "故障"; 
            Message = "端口连接问题: $($portIssues -join '; ')"; 
            Type = "PortConnectivityFailure";
            Severity = "中"
        }
    }
    
    return @{ Status = "正常"; Message = "端口连接正常" }
}

function Test-ResourceHealth {
    param([object]$Config)
    
    if (-not $Config.monitoring.resourceCheckEnabled) {
        return @{ Status = "跳过"; Message = "资源检查已禁用" }
    }
    
    try {
        # 检查内存使用率
        $totalMemory = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
        $availableMemory = (Get-Counter "\Memory\Available Bytes").CounterSamples[0].CookedValue
        $memoryUsage = [math]::Round((($totalMemory - $availableMemory) / $totalMemory) * 100, 1)
        
        # 检查CPU使用率
        $cpuCounter = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1
        $cpuUsage = [math]::Round(100 - $cpuCounter.CounterSamples[0].CookedValue, 1)
        
        $issues = @()
        
        if ($memoryUsage -gt 90) {
            $issues += "内存使用率过高: $memoryUsage%"
        }
        
        if ($cpuUsage -gt 95) {
            $issues += "CPU使用率过高: $cpuUsage%"
        }
        
        if ($issues.Count -gt 0) {
            return @{ 
                Status = "警告"; 
                Message = "资源使用率异常: $($issues -join '; ')"; 
                Type = "ResourceUsageHigh";
                Severity = "低";
                MemoryUsage = $memoryUsage;
                CPUUsage = $cpuUsage
            }
        }
        
        return @{ Status = "正常"; Message = "资源使用正常"; MemoryUsage = $memoryUsage; CPUUsage = $cpuUsage }
        
    } catch {
        return @{
            Status = "故障";
            Message = "资源检查失败: $($_.Exception.Message)";
            Type = "ResourceCheckFailure";
            Severity = "低"
        }
    }
}

# ============================================================================
# 自动恢复策略函数
# ============================================================================

function Invoke-ProcessRecovery {
    param([object]$FailureInfo, [object]$Config)

    if (-not $Config.strategies.processRestart.enabled) {
        return @{ Status = "跳过"; Message = "进程恢复已禁用" }
    }

    Write-RecoveryLog "开始进程恢复: $($FailureInfo.Message)" "INFO"

    try {
        switch ($FailureInfo.Type) {
            "ProcessFailure" {
                # 没有运行中的进程，尝试启动
                Write-RecoveryLog "尝试启动PM2服务..." "INFO"
                if ($DryRun) {
                    Write-RecoveryLog "[模拟] 启动PM2服务" "INFO"
                    return @{ Status = "成功"; Message = "[模拟] PM2服务启动成功" }
                }

                pm2 start ecosystem.config.js --env development
                Start-Sleep -Seconds 5

                # 验证恢复结果
                $verifyResult = Test-ProcessHealth $Config
                if ($verifyResult.Status -eq "正常") {
                    Write-RecoveryLog "进程恢复成功" "SUCCESS"
                    return @{ Status = "成功"; Message = "PM2服务启动成功" }
                } else {
                    Write-RecoveryLog "进程恢复失败: $($verifyResult.Message)" "ERROR"
                    return @{ Status = "失败"; Message = "PM2服务启动失败" }
                }
            }

            "CriticalProcessFailure" {
                # 关键进程异常，尝试重启
                $failedProcesses = $FailureInfo.FailedProcesses
                foreach ($process in $failedProcesses) {
                    Write-RecoveryLog "重启进程: $($process.name)" "INFO"
                    if ($DryRun) {
                        Write-RecoveryLog "[模拟] 重启进程: $($process.name)" "INFO"
                        continue
                    }

                    pm2 restart $process.name
                    Start-Sleep -Seconds 3
                }

                if (-not $DryRun) {
                    # 验证恢复结果
                    Start-Sleep -Seconds 5
                    $verifyResult = Test-ProcessHealth $Config
                    if ($verifyResult.Status -eq "正常") {
                        Write-RecoveryLog "关键进程恢复成功" "SUCCESS"
                        return @{ Status = "成功"; Message = "关键进程重启成功" }
                    } else {
                        Write-RecoveryLog "关键进程恢复失败: $($verifyResult.Message)" "ERROR"
                        return @{ Status = "失败"; Message = "关键进程重启失败" }
                    }
                } else {
                    return @{ Status = "成功"; Message = "[模拟] 关键进程重启成功" }
                }
            }

            default {
                Write-RecoveryLog "未知的进程故障类型: $($FailureInfo.Type)" "WARN"
                return @{ Status = "跳过"; Message = "未知的故障类型" }
            }
        }
    } catch {
        Write-RecoveryLog "进程恢复异常: $($_.Exception.Message)" "ERROR"
        return @{ Status = "失败"; Message = "进程恢复异常: $($_.Exception.Message)" }
    }
}

function Invoke-ServiceRecovery {
    param([object]$FailureInfo, [object]$Config)

    if (-not $Config.strategies.serviceRepair.enabled) {
        return @{ Status = "跳过"; Message = "服务恢复已禁用" }
    }

    Write-RecoveryLog "开始服务恢复: $($FailureInfo.Message)" "INFO"

    try {
        switch ($FailureInfo.Type) {
            "ServiceHealthFailure" {
                # 服务健康检查失败，尝试重启后端服务
                Write-RecoveryLog "尝试重启后端服务..." "INFO"
                if ($DryRun) {
                    Write-RecoveryLog "[模拟] 重启后端服务" "INFO"
                    return @{ Status = "成功"; Message = "[模拟] 后端服务重启成功" }
                }

                # 重启PM2中的API服务
                pm2 restart portal-api
                Start-Sleep -Seconds 10

                # 验证恢复结果
                $verifyResult = Test-ServiceHealth $Config
                if ($verifyResult.Status -eq "正常") {
                    Write-RecoveryLog "服务恢复成功" "SUCCESS"
                    return @{ Status = "成功"; Message = "后端服务重启成功" }
                } else {
                    Write-RecoveryLog "服务恢复失败: $($verifyResult.Message)" "ERROR"
                    return @{ Status = "失败"; Message = "后端服务重启失败" }
                }
            }

            "APIEndpointFailure" {
                # API端点异常，尝试重启相关服务
                Write-RecoveryLog "API端点异常，重启相关服务..." "INFO"
                if ($DryRun) {
                    Write-RecoveryLog "[模拟] 重启API服务" "INFO"
                    return @{ Status = "成功"; Message = "[模拟] API服务重启成功" }
                }

                pm2 restart portal-api
                Start-Sleep -Seconds 8

                # 验证恢复结果
                $verifyResult = Test-ServiceHealth $Config
                if ($verifyResult.Status -eq "正常") {
                    Write-RecoveryLog "API服务恢复成功" "SUCCESS"
                    return @{ Status = "成功"; Message = "API服务重启成功" }
                } else {
                    Write-RecoveryLog "API服务恢复失败: $($verifyResult.Message)" "ERROR"
                    return @{ Status = "失败"; Message = "API服务重启失败" }
                }
            }

            default {
                Write-RecoveryLog "未知的服务故障类型: $($FailureInfo.Type)" "WARN"
                return @{ Status = "跳过"; Message = "未知的故障类型" }
            }
        }
    } catch {
        Write-RecoveryLog "服务恢复异常: $($_.Exception.Message)" "ERROR"
        return @{ Status = "失败"; Message = "服务恢复异常: $($_.Exception.Message)" }
    }
}

function Invoke-PortRecovery {
    param([object]$FailureInfo, [object]$Config)

    if (-not $Config.strategies.portCleanup.enabled) {
        return @{ Status = "跳过"; Message = "端口恢复已禁用" }
    }

    Write-RecoveryLog "开始端口恢复: $($FailureInfo.Message)" "INFO"

    try {
        # 端口连接问题，尝试清理和重启服务
        Write-RecoveryLog "检查端口占用情况..." "INFO"

        $portsToCheck = @($BackendPort, $FrontendPort)
        foreach ($port in $portsToCheck) {
            try {
                $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
                            Select-Object -ExpandProperty OwningProcess |
                            Sort-Object -Unique

                if ($processes) {
                    foreach ($processId in $processes) {
                        if ($processId -and $processId -ne 0) {
                            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                            if ($process) {
                                Write-RecoveryLog "发现端口 $port 被进程占用: $($process.ProcessName) (PID: $processId)" "INFO"

                                if ($DryRun) {
                                    Write-RecoveryLog "[模拟] 终止进程: $($process.ProcessName)" "INFO"
                                } else {
                                    if ($Config.strategies.portCleanup.forceKill) {
                                        Write-RecoveryLog "强制终止进程: $($process.ProcessName)" "WARN"
                                        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                                    } else {
                                        Write-RecoveryLog "优雅终止进程: $($process.ProcessName)" "INFO"
                                        Stop-Process -Id $processId -ErrorAction SilentlyContinue
                                    }
                                    Start-Sleep -Seconds $Config.strategies.portCleanup.waitTime
                                }
                            }
                        }
                    }
                }
            } catch {
                Write-RecoveryLog "检查端口 $port 时出错: $($_.Exception.Message)" "WARN"
            }
        }

        if (-not $DryRun) {
            # 重启服务
            Write-RecoveryLog "重启服务以恢复端口连接..." "INFO"
            pm2 restart all
            Start-Sleep -Seconds 10

            # 验证恢复结果
            $verifyResult = Test-PortAvailability $Config
            if ($verifyResult.Status -eq "正常") {
                Write-RecoveryLog "端口恢复成功" "SUCCESS"
                return @{ Status = "成功"; Message = "端口连接恢复成功" }
            } else {
                Write-RecoveryLog "端口恢复失败: $($verifyResult.Message)" "ERROR"
                return @{ Status = "失败"; Message = "端口连接恢复失败" }
            }
        } else {
            return @{ Status = "成功"; Message = "[模拟] 端口连接恢复成功" }
        }

    } catch {
        Write-RecoveryLog "端口恢复异常: $($_.Exception.Message)" "ERROR"
        return @{ Status = "失败"; Message = "端口恢复异常: $($_.Exception.Message)" }
    }
}

# ============================================================================
# 主要恢复控制函数
# ============================================================================

function Invoke-SystemHealthCheck {
    param([object]$Config)

    Write-RecoveryLog "开始系统健康检查..." "INFO"
    $script:RecoveryStats.TotalChecks++
    $script:RecoveryStats.LastCheck = Get-Date

    $healthResults = @()

    # 进程健康检查
    $processHealth = Test-ProcessHealth $Config
    $healthResults += @{ Component = "进程"; Result = $processHealth }

    # 服务健康检查
    $serviceHealth = Test-ServiceHealth $Config
    $healthResults += @{ Component = "服务"; Result = $serviceHealth }

    # 端口健康检查
    $portHealth = Test-PortAvailability $Config
    $healthResults += @{ Component = "端口"; Result = $portHealth }

    # 资源健康检查
    $resourceHealth = Test-ResourceHealth $Config
    $healthResults += @{ Component = "资源"; Result = $resourceHealth }

    # 分析检查结果
    $failures = $healthResults | Where-Object { $_.Result.Status -in @("故障", "警告") }

    if ($failures.Count -eq 0) {
        $script:RecoveryStats.CurrentStatus = "正常"
        Write-RecoveryLog "系统健康检查通过" "SUCCESS"
        return @{ Status = "正常"; Results = $healthResults }
    } else {
        $script:RecoveryStats.CurrentStatus = "异常"
        $script:RecoveryStats.FailuresDetected++

        Write-RecoveryLog "检测到 $($failures.Count) 个问题" "WARN"
        foreach ($failure in $failures) {
            Write-RecoveryLog "[$($failure.Component)] $($failure.Result.Message)" "ERROR"

            # 记录故障历史
            $script:FailureHistory += @{
                Timestamp = Get-Date
                Component = $failure.Component
                Type = $failure.Result.Type
                Message = $failure.Result.Message
                Severity = $failure.Result.Severity
            }
        }

        return @{ Status = "异常"; Results = $healthResults; Failures = $failures }
    }
}

function Invoke-AutoRecovery {
    param([object]$HealthCheckResult, [object]$Config)

    if (-not $EnableAutoRecover -or -not $Config.recovery.enabled) {
        Write-RecoveryLog "自动恢复已禁用" "INFO"
        return @{ Status = "跳过"; Message = "自动恢复已禁用" }
    }

    $failures = $HealthCheckResult.Failures
    if (-not $failures -or $failures.Count -eq 0) {
        return @{ Status = "无需恢复"; Message = "系统状态正常" }
    }

    Write-RecoveryLog "开始自动恢复，共 $($failures.Count) 个问题" "INFO"
    $script:RecoveryStats.RecoveryAttempts++
    $script:RecoveryStats.LastRecovery = Get-Date

    $recoveryResults = @()
    $successCount = 0

    foreach ($failure in $failures) {
        $failureInfo = $failure.Result
        Write-RecoveryLog "处理故障: [$($failure.Component)] $($failureInfo.Message)" "INFO"

        $recoveryResult = $null

        # 根据故障类型选择恢复策略
        switch ($failureInfo.Type) {
            { $_ -in @("ProcessFailure", "CriticalProcessFailure", "ProcessCheckFailure") } {
                $recoveryResult = Invoke-ProcessRecovery $failureInfo $Config
            }
            { $_ -in @("ServiceHealthFailure", "APIEndpointFailure") } {
                $recoveryResult = Invoke-ServiceRecovery $failureInfo $Config
            }
            { $_ -in @("PortConnectivityFailure") } {
                $recoveryResult = Invoke-PortRecovery $failureInfo $Config
            }
            { $_ -in @("ResourceUsageHigh") } {
                Write-RecoveryLog "资源使用率高，建议手动检查" "WARN"
                $recoveryResult = @{ Status = "跳过"; Message = "资源问题需要手动处理" }
            }
            default {
                Write-RecoveryLog "未知故障类型: $($failureInfo.Type)" "WARN"
                $recoveryResult = @{ Status = "跳过"; Message = "未知故障类型" }
            }
        }

        $recoveryResults += @{
            Component = $failure.Component
            FailureType = $failureInfo.Type
            RecoveryResult = $recoveryResult
        }

        if ($recoveryResult.Status -eq "成功") {
            $successCount++
            Write-RecoveryLog "[$($failure.Component)] 恢复成功: $($recoveryResult.Message)" "SUCCESS"
        } elseif ($recoveryResult.Status -eq "失败") {
            Write-RecoveryLog "[$($failure.Component)] 恢复失败: $($recoveryResult.Message)" "ERROR"
        } else {
            Write-RecoveryLog "[$($failure.Component)] 恢复跳过: $($recoveryResult.Message)" "INFO"
        }

        # 恢复间隔
        if ($Config.recovery.retryDelay -gt 0) {
            Start-Sleep -Seconds $Config.recovery.retryDelay
        }
    }

    if ($successCount -gt 0) {
        $script:RecoveryStats.SuccessfulRecoveries += $successCount
        $script:RecoveryStats.CurrentStatus = "恢复中"
    }

    Write-RecoveryLog "自动恢复完成，成功: $successCount/$($failures.Count)" "INFO"

    return @{
        Status = if ($successCount -eq $failures.Count) { "完全成功" } elseif ($successCount -gt 0) { "部分成功" } else { "失败" }
        SuccessCount = $successCount
        TotalCount = $failures.Count
        Results = $recoveryResults
    }
}

function Start-RecoveryMonitor {
    param([object]$Config)

    Write-RecoveryLog "启动恢复监控守护进程..." "INFO"
    Write-RecoveryLog "检查间隔: $($Config.recovery.checkInterval) 秒" "INFO"

    $isRunning = $true

    # 注册退出处理
    Register-EngineEvent PowerShell.Exiting -Action {
        $script:isRunning = $false
        Write-RecoveryLog "恢复监控守护进程退出" "INFO"
    }

    while ($isRunning) {
        try {
            # 执行健康检查
            $healthResult = Invoke-SystemHealthCheck $Config

            # 如果检测到问题，执行自动恢复
            if ($healthResult.Status -eq "异常") {
                $recoveryResult = Invoke-AutoRecovery $healthResult $Config
                Write-RecoveryLog "恢复结果: $($recoveryResult.Status)" "INFO"
            }

            # 等待下次检查
            Start-Sleep -Seconds $Config.recovery.checkInterval

        } catch {
            Write-RecoveryLog "监控循环异常: $($_.Exception.Message)" "ERROR"
            Start-Sleep -Seconds 30  # 异常时等待30秒再继续
        }
    }
}

# ============================================================================
# 帮助和状态显示函数
# ============================================================================

function Show-RecoveryHelp {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION - 帮助文档" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\recovery.ps1 [参数]"
    Write-Host ""
    Write-Host "⚙️ 主要参数:" -ForegroundColor Yellow
    Write-Host "  -Mode <模式>           运行模式: monitor|recover|daemon (默认: monitor)"
    Write-Host "  -ConfigFile <文件>     配置文件路径 (默认: recovery-config.json)"
    Write-Host "  -CheckInterval <秒>    检查间隔 (默认: 30秒)"
    Write-Host "  -BackendPort <端口>    后端端口 (默认: 8002)"
    Write-Host "  -FrontendPort <端口>   前端端口 (默认: 3000)"
    Write-Host ""
    Write-Host "🔧 功能开关:" -ForegroundColor Yellow
    Write-Host "  -EnableAutoRecover     启用自动恢复 (默认: 启用)"
    Write-Host "  -VerboseOutput         详细输出"
    Write-Host "  -DryRun                模拟运行（不实际执行恢复操作）"
    Write-Host "  -Help                  显示帮助"
    Write-Host ""
    Write-Host "🎯 运行模式:" -ForegroundColor Yellow
    Write-Host "  monitor                执行一次健康检查并显示结果"
    Write-Host "  recover                执行一次健康检查和自动恢复"
    Write-Host "  daemon                 启动后台监控守护进程"
    Write-Host ""
    Write-Host "💡 使用示例:" -ForegroundColor Yellow
    Write-Host "  .\recovery.ps1                           # 执行一次健康检查"
    Write-Host "  .\recovery.ps1 -Mode recover              # 执行健康检查和恢复"
    Write-Host "  .\recovery.ps1 -Mode daemon               # 启动后台监控"
    Write-Host "  .\recovery.ps1 -DryRun -VerboseOutput     # 模拟运行并显示详细信息"
    Write-Host ""
    Write-Host "📊 配置文件:" -ForegroundColor Yellow
    Write-Host "  首次运行时会自动创建默认配置文件 recovery-config.json"
    Write-Host "  可以编辑配置文件来自定义恢复策略和检查参数"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Show-RecoveryStatus {
    param([object]$HealthResult = $null, [object]$RecoveryResult = $null)

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  系统恢复状态报告" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    # 显示统计信息
    Write-Host "📊 恢复统计:" -ForegroundColor Yellow
    Write-Host "  • 总检查次数: $($script:RecoveryStats.TotalChecks)" -ForegroundColor White
    Write-Host "  • 检测到故障: $($script:RecoveryStats.FailuresDetected)" -ForegroundColor White
    Write-Host "  • 恢复尝试: $($script:RecoveryStats.RecoveryAttempts)" -ForegroundColor White
    Write-Host "  • 成功恢复: $($script:RecoveryStats.SuccessfulRecoveries)" -ForegroundColor White
    Write-Host "  • 当前状态: $($script:RecoveryStats.CurrentStatus)" -ForegroundColor $(
        switch ($script:RecoveryStats.CurrentStatus) {
            "正常" { "Green" }
            "异常" { "Red" }
            "恢复中" { "Yellow" }
            default { "White" }
        }
    )

    if ($script:RecoveryStats.LastCheck) {
        Write-Host "  • 最后检查: $($script:RecoveryStats.LastCheck.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White
    }

    if ($script:RecoveryStats.LastRecovery) {
        Write-Host "  • 最后恢复: $($script:RecoveryStats.LastRecovery.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White
    }

    Write-Host ""

    # 显示健康检查结果
    if ($HealthResult) {
        Write-Host "🔍 健康检查结果:" -ForegroundColor Yellow
        foreach ($result in $HealthResult.Results) {
            $statusIcon = switch ($result.Result.Status) {
                "正常" { "✅" }
                "警告" { "⚠️" }
                "故障" { "❌" }
                "跳过" { "⏭️" }
                default { "❓" }
            }

            $statusColor = switch ($result.Result.Status) {
                "正常" { "Green" }
                "警告" { "Yellow" }
                "故障" { "Red" }
                "跳过" { "Gray" }
                default { "White" }
            }

            Write-Host "  $statusIcon [$($result.Component)] $($result.Result.Message)" -ForegroundColor $statusColor
        }
        Write-Host ""
    }

    # 显示恢复结果
    if ($RecoveryResult) {
        Write-Host "🔧 恢复操作结果:" -ForegroundColor Yellow
        Write-Host "  • 总体状态: $($RecoveryResult.Status)" -ForegroundColor $(
            switch ($RecoveryResult.Status) {
                "完全成功" { "Green" }
                "部分成功" { "Yellow" }
                "失败" { "Red" }
                "跳过" { "Gray" }
                default { "White" }
            }
        )
        Write-Host "  • 成功/总数: $($RecoveryResult.SuccessCount)/$($RecoveryResult.TotalCount)" -ForegroundColor White

        if ($RecoveryResult.Results) {
            Write-Host ""
            Write-Host "  详细结果:" -ForegroundColor Gray
            foreach ($result in $RecoveryResult.Results) {
                $resultIcon = switch ($result.RecoveryResult.Status) {
                    "成功" { "✅" }
                    "失败" { "❌" }
                    "跳过" { "⏭️" }
                    default { "❓" }
                }

                Write-Host "    $resultIcon [$($result.Component)] $($result.RecoveryResult.Message)" -ForegroundColor White
            }
        }
        Write-Host ""
    }

    # 显示故障历史（最近5条）
    if ($script:FailureHistory.Count -gt 0) {
        Write-Host "📝 最近故障历史:" -ForegroundColor Yellow
        $recentFailures = $script:FailureHistory | Sort-Object Timestamp -Descending | Select-Object -First 5
        foreach ($failure in $recentFailures) {
            $timeStr = $failure.Timestamp.ToString('MM-dd HH:mm:ss')
            Write-Host "  • [$timeStr] [$($failure.Component)] $($failure.Message)" -ForegroundColor Gray
        }
        Write-Host ""
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
}

# ============================================================================
# 主函数
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-RecoveryHelp
        return
    }

    # 加载配置
    $config = Load-RecoveryConfig

    # 初始化日志
    Write-RecoveryLog "启动自动恢复系统 v$SCRIPT_VERSION" "INFO"
    Write-RecoveryLog "运行模式: $Mode" "INFO"
    Write-RecoveryLog "配置文件: $CONFIG_FILE" "INFO"

    if ($DryRun) {
        Write-RecoveryLog "模拟运行模式 - 不会实际执行恢复操作" "WARN"
    }

    # 根据模式执行相应操作
    switch ($Mode.ToLower()) {
        "monitor" {
            Write-RecoveryLog "执行系统健康检查..." "INFO"
            $healthResult = Invoke-SystemHealthCheck $config
            Show-RecoveryStatus $healthResult
        }

        "recover" {
            Write-RecoveryLog "执行系统健康检查和自动恢复..." "INFO"
            $healthResult = Invoke-SystemHealthCheck $config

            if ($healthResult.Status -eq "异常") {
                $recoveryResult = Invoke-AutoRecovery $healthResult $config
                Show-RecoveryStatus $healthResult $recoveryResult
            } else {
                Show-RecoveryStatus $healthResult
                Write-Host "系统状态正常，无需恢复操作。" -ForegroundColor Green
            }
        }

        "daemon" {
            Write-RecoveryLog "启动后台监控守护进程..." "INFO"
            Write-Host "恢复监控守护进程已启动，按 Ctrl+C 退出..." -ForegroundColor Green
            Start-RecoveryMonitor $config
        }

        default {
            Write-RecoveryLog "未知的运行模式: $Mode" "ERROR"
            Write-Host "使用 -Help 参数查看帮助信息" -ForegroundColor Yellow
            exit 1
        }
    }

    Write-RecoveryLog "自动恢复系统执行完成" "INFO"
}

# 执行主函数
Main
