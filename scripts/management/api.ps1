# ============================================================================
# 智能多Web应用门户系统 - API接口管理工具 v1.1.0
# ============================================================================
# 
# 功能说明：
# - API接口注册和发现
# - API健康监控和性能分析
# - API测试和文档生成
# - 与现有系统集成
#
# 作者：Augment Agent
# 创建时间：2025-09-23
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("discover", "register", "monitor", "test", "docs", "health", "stats", "interactive", "help")]
    [string]$Action = "interactive",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiName = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Method = "GET",
    
    [Parameter(Mandatory=$false)]
    [string]$ConfigFile = "",
    
    [Parameter(Mandatory=$false)]
    [int]$Timeout = 30,
    
    [Parameter(Mandatory=$false)]
    [switch]$VerboseOutput,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help
)

# ============================================================================
# 全局变量和配置
# ============================================================================

# 项目根目录
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

# API配置文件路径
$API_CONFIG_DIR = Join-Path $PROJECT_ROOT "configs"
$API_CONFIG_FILE = Join-Path $API_CONFIG_DIR "api-config.json"
$API_REGISTRY_FILE = Join-Path $API_CONFIG_DIR "api-registry.json"

# 日志配置
$LOG_DIR = Join-Path $PROJECT_ROOT "logs"
$API_LOG_FILE = Join-Path $LOG_DIR "api.log"

# 确保目录存在
if (-not (Test-Path $API_CONFIG_DIR)) {
    New-Item -ItemType Directory -Path $API_CONFIG_DIR -Force | Out-Null
}
if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}

# API配置架构
$API_CONFIG_SCHEMA = @{
    version = "1.1.0"
    lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    monitoring = @{
        enabled = $true
        interval = 60  # 秒
        timeout = 30   # 秒
        retries = 3
        healthCheckEndpoints = @()
    }
    discovery = @{
        enabled = $true
        autoScan = $true
        scanInterval = 300  # 秒
        knownPorts = @(3000, 8002, 8003)
        scanPaths = @("/health", "/api", "/api/health", "/status")
    }
    testing = @{
        enabled = $true
        defaultTimeout = 30
        maxConcurrentTests = 5
        testSuites = @()
    }
    documentation = @{
        enabled = $true
        autoGenerate = $true
        outputFormat = "markdown"
        includeExamples = $true
    }
    integration = @{
        monitor = $true
        recovery = $true
        logging = $true
        config = $true
    }
}

# API注册表架构
$API_REGISTRY_SCHEMA = @{
    version = "1.1.0"
    lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    apis = @()
    categories = @("system", "application", "monitoring", "configuration", "authentication", "detection")
    statistics = @{
        totalApis = 0
        healthyApis = 0
        unhealthyApis = 0
        lastHealthCheck = $null
    }
}

# ============================================================================
# 日志记录函数
# ============================================================================

function Write-ApiLog {
    param(
        [string]$Message,
        [ValidateSet("DEBUG", "INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO",
        [string]$Component = "API"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $logEntry = "[$timestamp] [$Level] [$Component] $Message"
    
    # 写入日志文件
    try {
        Add-Content -Path $API_LOG_FILE -Value $logEntry -Encoding UTF8
    } catch {
        # 如果日志写入失败，至少输出到控制台
    }
    
    # 根据级别输出到控制台
    switch ($Level) {
        "DEBUG" { if ($VerboseOutput) { Write-Host $logEntry -ForegroundColor Gray } }
        "INFO" { Write-Host $logEntry -ForegroundColor Cyan }
        "WARN" { Write-Host $logEntry -ForegroundColor Yellow }
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
    }
}

# ============================================================================
# 配置管理函数
# ============================================================================

function Initialize-ApiConfig {
    Write-ApiLog "初始化API配置系统..." "INFO" "CONFIG"
    
    # 创建默认配置文件
    if (-not (Test-Path $API_CONFIG_FILE)) {
        $API_CONFIG_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content -Path $API_CONFIG_FILE -Encoding UTF8
        Write-ApiLog "创建默认API配置文件: $API_CONFIG_FILE" "SUCCESS" "CONFIG"
    }
    
    # 创建默认注册表文件
    if (-not (Test-Path $API_REGISTRY_FILE)) {
        $API_REGISTRY_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content -Path $API_REGISTRY_FILE -Encoding UTF8
        Write-ApiLog "创建默认API注册表文件: $API_REGISTRY_FILE" "SUCCESS" "CONFIG"
    }
    
    Write-ApiLog "API配置系统初始化完成" "SUCCESS" "CONFIG"
}

function Get-ApiConfig {
    try {
        if (Test-Path $API_CONFIG_FILE) {
            $config = Get-Content -Path $API_CONFIG_FILE -Raw | ConvertFrom-Json
            return $config
        } else {
            Write-ApiLog "API配置文件不存在，使用默认配置" "WARN" "CONFIG"
            return $API_CONFIG_SCHEMA
        }
    } catch {
        Write-ApiLog "读取API配置失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $API_CONFIG_SCHEMA
    }
}

function Set-ApiConfig {
    param([object]$Config)
    
    try {
        $Config.lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $API_CONFIG_FILE -Encoding UTF8
        Write-ApiLog "API配置已保存" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-ApiLog "保存API配置失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Get-ApiRegistry {
    try {
        if (Test-Path $API_REGISTRY_FILE) {
            $registry = Get-Content -Path $API_REGISTRY_FILE -Raw | ConvertFrom-Json
            return $registry
        } else {
            Write-ApiLog "API注册表文件不存在，使用默认注册表" "WARN" "REGISTRY"
            return $API_REGISTRY_SCHEMA
        }
    } catch {
        Write-ApiLog "读取API注册表失败: $($_.Exception.Message)" "ERROR" "REGISTRY"
        return $API_REGISTRY_SCHEMA
    }
}

function Set-ApiRegistry {
    param([object]$Registry)
    
    try {
        $Registry.lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $Registry.statistics.totalApis = $Registry.apis.Count
        $Registry | ConvertTo-Json -Depth 10 | Set-Content -Path $API_REGISTRY_FILE -Encoding UTF8
        Write-ApiLog "API注册表已保存" "SUCCESS" "REGISTRY"
        return $true
    } catch {
        Write-ApiLog "保存API注册表失败: $($_.Exception.Message)" "ERROR" "REGISTRY"
        return $false
    }
}

# ============================================================================
# API发现和注册函数
# ============================================================================

function Invoke-ApiDiscovery {
    Write-ApiLog "开始API自动发现..." "INFO" "DISCOVERY"
    
    $config = Get-ApiConfig
    $registry = Get-ApiRegistry
    $discoveredApis = @()
    
    if (-not $config.discovery.enabled) {
        Write-ApiLog "API自动发现已禁用" "WARN" "DISCOVERY"
        return $discoveredApis
    }
    
    foreach ($port in $config.discovery.knownPorts) {
        Write-ApiLog "扫描端口 $port..." "DEBUG" "DISCOVERY"
        
        foreach ($path in $config.discovery.scanPaths) {
            $url = "http://localhost:$port$path"
            
            try {
                $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $config.monitoring.timeout -ErrorAction Stop
                
                if ($response.StatusCode -eq 200) {
                    $apiInfo = @{
                        id = [System.Guid]::NewGuid().ToString()
                        name = "Auto-discovered API on port $port"
                        url = $url
                        baseUrl = "http://localhost:$port"
                        port = $port
                        path = $path
                        method = "GET"
                        category = "system"
                        status = "healthy"
                        discoveredAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                        lastChecked = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                        responseTime = 0
                        description = "Automatically discovered API endpoint"
                        tags = @("auto-discovered", "health-check")
                        healthHistory = @()
                        statistics = @{
                            totalRequests = 0
                            successfulRequests = 0
                            failedRequests = 0
                            averageResponseTime = 0
                            lastError = $null
                        }
                    }
                    
                    # 检查是否已存在
                    $existing = $registry.apis | Where-Object { $_.url -eq $url }
                    if (-not $existing) {
                        $discoveredApis += $apiInfo
                        Write-ApiLog "发现新API: $url" "SUCCESS" "DISCOVERY"
                    }
                }
            } catch {
                Write-ApiLog "扫描 $url 失败: $($_.Exception.Message)" "DEBUG" "DISCOVERY"
            }
        }
    }
    
    # 更新注册表
    if ($discoveredApis.Count -gt 0) {
        $registry.apis += $discoveredApis
        Set-ApiRegistry $registry
        Write-ApiLog "发现并注册了 $($discoveredApis.Count) 个新API" "SUCCESS" "DISCOVERY"
    } else {
        Write-ApiLog "未发现新的API接口" "INFO" "DISCOVERY"
    }
    
    return $discoveredApis
}

function Register-Api {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [string]$Category = "application",
        [string]$Description = "",
        [array]$Tags = @()
    )

    Write-ApiLog "注册新API: $Name" "INFO" "REGISTER"

    if ([string]::IsNullOrEmpty($Name) -or [string]::IsNullOrEmpty($Url)) {
        Write-ApiLog "API名称和URL不能为空" "ERROR" "REGISTER"
        return $false
    }

    $registry = Get-ApiRegistry

    # 检查是否已存在
    $existing = $registry.apis | Where-Object { $_.url -eq $Url -or $_.name -eq $Name }
    if ($existing) {
        Write-ApiLog "API已存在: $Name ($Url)" "WARN" "REGISTER"
        return $false
    }

    # 创建API信息
    $apiInfo = @{
        id = [System.Guid]::NewGuid().ToString()
        name = $Name
        url = $Url
        method = $Method.ToUpper()
        category = $Category
        status = "unknown"
        registeredAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        lastChecked = $null
        responseTime = 0
        description = $Description
        tags = $Tags
        healthHistory = @()
        statistics = @{
            totalRequests = 0
            successfulRequests = 0
            failedRequests = 0
            averageResponseTime = 0
            lastError = $null
        }
    }

    # 添加到注册表
    $registry.apis += $apiInfo

    if (Set-ApiRegistry $registry) {
        Write-ApiLog "API注册成功: $Name" "SUCCESS" "REGISTER"
        return $true
    } else {
        Write-ApiLog "API注册失败: $Name" "ERROR" "REGISTER"
        return $false
    }
}

# ============================================================================
# API监控和健康检查函数
# ============================================================================

function Test-ApiHealth {
    param(
        [object]$ApiInfo,
        [int]$Timeout = 30
    )

    $startTime = Get-Date
    $result = @{
        id = $ApiInfo.id
        name = $ApiInfo.name
        url = $ApiInfo.url
        status = "unknown"
        responseTime = 0
        statusCode = 0
        error = $null
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }

    try {
        Write-ApiLog "检查API健康状态: $($ApiInfo.name)" "DEBUG" "HEALTH"

        $response = Invoke-WebRequest -Uri $ApiInfo.url -Method $ApiInfo.method -TimeoutSec $Timeout -ErrorAction Stop
        $endTime = Get-Date

        $result.status = "healthy"
        $result.responseTime = ($endTime - $startTime).TotalMilliseconds
        $result.statusCode = $response.StatusCode

        Write-ApiLog "API健康检查成功: $($ApiInfo.name) (${result.responseTime}ms)" "SUCCESS" "HEALTH"

    } catch {
        $endTime = Get-Date
        $result.status = "unhealthy"
        $result.responseTime = ($endTime - $startTime).TotalMilliseconds
        $result.error = $_.Exception.Message

        if ($_.Exception.Response) {
            $result.statusCode = $_.Exception.Response.StatusCode.value__
        }

        Write-ApiLog "API健康检查失败: $($ApiInfo.name) - $($result.error)" "ERROR" "HEALTH"
    }

    return $result
}

function Invoke-ApiMonitoring {
    Write-ApiLog "开始API监控..." "INFO" "MONITOR"

    $config = Get-ApiConfig
    $registry = Get-ApiRegistry

    if (-not $config.monitoring.enabled) {
        Write-ApiLog "API监控已禁用" "WARN" "MONITOR"
        return
    }

    if ($registry.apis.Count -eq 0) {
        Write-ApiLog "没有注册的API需要监控" "INFO" "MONITOR"
        return
    }

    $healthResults = @()
    $healthyCount = 0
    $unhealthyCount = 0

    foreach ($api in $registry.apis) {
        $healthResult = Test-ApiHealth -ApiInfo $api -Timeout $config.monitoring.timeout
        $healthResults += $healthResult

        # 更新API状态
        $api.status = $healthResult.status
        $api.lastChecked = $healthResult.timestamp
        $api.responseTime = $healthResult.responseTime

        # 更新统计信息
        $api.statistics.totalRequests++
        if ($healthResult.status -eq "healthy") {
            $api.statistics.successfulRequests++
            $healthyCount++
        } else {
            $api.statistics.failedRequests++
            $api.statistics.lastError = $healthResult.error
            $unhealthyCount++
        }

        # 计算平均响应时间
        if ($api.statistics.totalRequests -gt 0) {
            $api.statistics.averageResponseTime =
                (($api.statistics.averageResponseTime * ($api.statistics.totalRequests - 1)) + $healthResult.responseTime) / $api.statistics.totalRequests
        }

        # 添加到健康历史
        if ($api.healthHistory.Count -ge 100) {
            $api.healthHistory = $api.healthHistory[1..99]  # 保留最近100条记录
        }
        $api.healthHistory += $healthResult
    }

    # 更新注册表统计信息
    $registry.statistics.healthyApis = $healthyCount
    $registry.statistics.unhealthyApis = $unhealthyCount
    $registry.statistics.lastHealthCheck = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

    # 保存更新的注册表
    Set-ApiRegistry $registry

    Write-ApiLog "API监控完成 - 健康: $healthyCount, 异常: $unhealthyCount" "SUCCESS" "MONITOR"

    return $healthResults
}

# ============================================================================
# 主函数
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-ApiHelp
        return
    }
    
    # 初始化配置
    Initialize-ApiConfig
    
    # 执行指定操作
    switch ($Action.ToLower()) {
        "discover" { 
            Invoke-ApiDiscovery
        }
        "register" {
            if ([string]::IsNullOrEmpty($ApiUrl) -or [string]::IsNullOrEmpty($ApiName)) {
                Write-ApiLog "注册API需要指定 -ApiUrl 和 -ApiName 参数" "ERROR" "MAIN"
                return
            }
            Register-Api -Name $ApiName -Url $ApiUrl -Method $Method -Description "手动注册的API"
        }
        "monitor" {
            Invoke-ApiMonitoring
        }
        "test" {
            if ([string]::IsNullOrEmpty($ApiUrl)) {
                Write-ApiLog "测试API需要指定 -ApiUrl 参数" "ERROR" "MAIN"
                return
            }
            Test-SingleApi -Url $ApiUrl -Method $Method
        }
        "docs" {
            Generate-ApiDocumentation
        }
        "health" {
            Show-ApiHealthStatus
        }
        "stats" {
            Show-ApiStatistics
        }
        "interactive" {
            Start-InteractiveApiManager
        }
        default {
            Write-ApiLog "未知操作: $Action" "ERROR" "MAIN"
            Show-ApiHelp
        }
    }
}

# ============================================================================
# API测试和文档函数
# ============================================================================

function Test-SingleApi {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )

    Write-ApiLog "测试API: $Url" "INFO" "TEST"

    $startTime = Get-Date
    $testResult = @{
        url = $Url
        method = $Method
        status = "unknown"
        responseTime = 0
        statusCode = 0
        headers = @{}
        body = $null
        error = $null
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }

    try {
        $requestParams = @{
            Uri = $Url
            Method = $Method
            TimeoutSec = $Timeout
            Headers = $Headers
        }

        if ($Body -and $Method -in @("POST", "PUT", "PATCH")) {
            $requestParams.Body = $Body
        }

        $response = Invoke-WebRequest @requestParams -ErrorAction Stop
        $endTime = Get-Date

        $testResult.status = "success"
        $testResult.responseTime = ($endTime - $startTime).TotalMilliseconds
        $testResult.statusCode = $response.StatusCode
        $testResult.headers = $response.Headers
        $testResult.body = $response.Content

        Write-Host ""
        Write-Host "🧪 API测试结果" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "🔗 URL: $Url" -ForegroundColor Cyan
        Write-Host "📋 方法: $Method" -ForegroundColor Cyan
        Write-Host "✅ 状态: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
        Write-Host "⏱️ 响应时间: $([math]::Round($testResult.responseTime, 2))ms" -ForegroundColor Cyan
        Write-Host "📊 响应大小: $($response.Content.Length) bytes" -ForegroundColor Cyan

        if ($VerboseOutput) {
            Write-Host ""
            Write-Host "📋 响应头:" -ForegroundColor Yellow
            foreach ($header in $response.Headers.GetEnumerator()) {
                Write-Host "  $($header.Key): $($header.Value)" -ForegroundColor Gray
            }

            Write-Host ""
            Write-Host "📄 响应内容:" -ForegroundColor Yellow
            if ($response.Content.Length -lt 1000) {
                Write-Host $response.Content -ForegroundColor Gray
            } else {
                Write-Host "$($response.Content.Substring(0, 500))..." -ForegroundColor Gray
                Write-Host "(内容过长，已截断)" -ForegroundColor Yellow
            }
        }

        Write-ApiLog "API测试成功: $Url (${testResult.responseTime}ms)" "SUCCESS" "TEST"

    } catch {
        $endTime = Get-Date
        $testResult.status = "failed"
        $testResult.responseTime = ($endTime - $startTime).TotalMilliseconds
        $testResult.error = $_.Exception.Message

        if ($_.Exception.Response) {
            $testResult.statusCode = $_.Exception.Response.StatusCode.value__
        }

        Write-Host ""
        Write-Host "❌ API测试失败" -ForegroundColor Red
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
        Write-Host "🔗 URL: $Url" -ForegroundColor Cyan
        Write-Host "📋 方法: $Method" -ForegroundColor Cyan
        Write-Host "❌ 错误: $($testResult.error)" -ForegroundColor Red
        Write-Host "⏱️ 耗时: $([math]::Round($testResult.responseTime, 2))ms" -ForegroundColor Cyan

        Write-ApiLog "API测试失败: $Url - $($testResult.error)" "ERROR" "TEST"
    }

    Write-Host ""
    return $testResult
}

function Show-ApiHealthStatus {
    Write-Host ""
    Write-Host "🏥 API健康状态报告" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $registry = Get-ApiRegistry

    if ($registry.apis.Count -eq 0) {
        Write-Host "📭 没有注册的API" -ForegroundColor Yellow
        return
    }

    Write-Host "📊 总体状态:" -ForegroundColor Yellow
    Write-Host "  📈 总API数量: $($registry.statistics.totalApis)" -ForegroundColor Cyan
    Write-Host "  ✅ 健康API: $($registry.statistics.healthyApis)" -ForegroundColor Green
    Write-Host "  ❌ 异常API: $($registry.statistics.unhealthyApis)" -ForegroundColor Red
    Write-Host "  🕐 最后检查: $($registry.statistics.lastHealthCheck)" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "📋 API详细状态:" -ForegroundColor Yellow
    foreach ($api in $registry.apis) {
        $statusIcon = switch ($api.status) {
            "healthy" { "✅" }
            "unhealthy" { "❌" }
            default { "❓" }
        }

        $statusColor = switch ($api.status) {
            "healthy" { "Green" }
            "unhealthy" { "Red" }
            default { "Yellow" }
        }

        Write-Host "  $statusIcon $($api.name)" -ForegroundColor $statusColor
        Write-Host "    🔗 URL: $($api.url)" -ForegroundColor Gray
        Write-Host "    📂 分类: $($api.category)" -ForegroundColor Gray
        Write-Host "    ⏱️ 响应时间: $([math]::Round($api.responseTime, 2))ms" -ForegroundColor Gray
        Write-Host "    🕐 最后检查: $($api.lastChecked)" -ForegroundColor Gray

        if ($api.status -eq "unhealthy" -and $api.statistics.lastError) {
            Write-Host "    ❌ 错误: $($api.statistics.lastError)" -ForegroundColor Red
        }
        Write-Host ""
    }
}

function Show-ApiStatistics {
    Write-Host ""
    Write-Host "📊 API统计报告" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $registry = Get-ApiRegistry

    if ($registry.apis.Count -eq 0) {
        Write-Host "📭 没有注册的API" -ForegroundColor Yellow
        return
    }

    $totalRequests = ($registry.apis | Measure-Object -Property { $_.statistics.totalRequests } -Sum).Sum
    $totalSuccessful = ($registry.apis | Measure-Object -Property { $_.statistics.successfulRequests } -Sum).Sum
    $totalFailed = ($registry.apis | Measure-Object -Property { $_.statistics.failedRequests } -Sum).Sum
    $avgResponseTime = ($registry.apis | Measure-Object -Property { $_.statistics.averageResponseTime } -Average).Average

    Write-Host "📈 总体统计:" -ForegroundColor Yellow
    Write-Host "  📊 总请求数: $totalRequests" -ForegroundColor Cyan
    Write-Host "  ✅ 成功请求: $totalSuccessful" -ForegroundColor Green
    Write-Host "  ❌ 失败请求: $totalFailed" -ForegroundColor Red
    Write-Host "  📊 成功率: $([math]::Round(($totalSuccessful / [math]::Max($totalRequests, 1)) * 100, 2))%" -ForegroundColor Cyan
    Write-Host "  ⏱️ 平均响应时间: $([math]::Round($avgResponseTime, 2))ms" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "📋 API详细统计:" -ForegroundColor Yellow
    foreach ($api in $registry.apis) {
        $successRate = if ($api.statistics.totalRequests -gt 0) {
            [math]::Round(($api.statistics.successfulRequests / $api.statistics.totalRequests) * 100, 2)
        } else { 0 }

        Write-Host "  📌 $($api.name)" -ForegroundColor Cyan
        Write-Host "    📊 总请求: $($api.statistics.totalRequests)" -ForegroundColor Gray
        Write-Host "    ✅ 成功: $($api.statistics.successfulRequests)" -ForegroundColor Gray
        Write-Host "    ❌ 失败: $($api.statistics.failedRequests)" -ForegroundColor Gray
        Write-Host "    📊 成功率: $successRate%" -ForegroundColor Gray
        Write-Host "    ⏱️ 平均响应时间: $([math]::Round($api.statistics.averageResponseTime, 2))ms" -ForegroundColor Gray
        Write-Host ""
    }
}

function Generate-ApiDocumentation {
    Write-Host ""
    Write-Host "📚 生成API文档" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $registry = Get-ApiRegistry

    if ($registry.apis.Count -eq 0) {
        Write-Host "📭 没有注册的API，无法生成文档" -ForegroundColor Yellow
        return
    }

    $docPath = Join-Path $PROJECT_ROOT "docs"
    if (-not (Test-Path $docPath)) {
        New-Item -ItemType Directory -Path $docPath -Force | Out-Null
    }

    $docFile = Join-Path $docPath "api-documentation.md"

    $markdown = @"
# API接口文档

> 自动生成时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## 概览

- **总API数量**: $($registry.statistics.totalApis)
- **健康API**: $($registry.statistics.healthyApis)
- **异常API**: $($registry.statistics.unhealthyApis)
- **最后检查**: $($registry.statistics.lastHealthCheck)

## API列表

"@

    foreach ($api in $registry.apis) {
        $markdown += @"

### $($api.name)

- **URL**: `$($api.url)`
- **方法**: `$($api.method)`
- **分类**: $($api.category)
- **状态**: $($api.status)
- **描述**: $($api.description)

#### 统计信息

- **总请求数**: $($api.statistics.totalRequests)
- **成功请求**: $($api.statistics.successfulRequests)
- **失败请求**: $($api.statistics.failedRequests)
- **平均响应时间**: $([math]::Round($api.statistics.averageResponseTime, 2))ms

"@

        if ($api.tags.Count -gt 0) {
            $markdown += "- **标签**: " + ($api.tags -join ", ") + "`n`n"
        }
    }

    $markdown | Set-Content -Path $docFile -Encoding UTF8
    Write-Host "📄 文档已生成: $docFile" -ForegroundColor Success
    Write-ApiLog "API文档已生成: $docFile" "SUCCESS" "DOCS"
}

function Start-InteractiveApiManager {
    while ($true) {
        Clear-Host
        Write-Host ""
        Write-Host "🚀 API接口管理系统 - 交互式界面" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 可用操作:" -ForegroundColor Yellow
        Write-Host "  1. 🔍 发现API接口" -ForegroundColor Cyan
        Write-Host "  2. 📝 注册新API" -ForegroundColor Cyan
        Write-Host "  3. 🏥 健康检查" -ForegroundColor Cyan
        Write-Host "  4. 📊 监控所有API" -ForegroundColor Cyan
        Write-Host "  5. 🧪 测试API" -ForegroundColor Cyan
        Write-Host "  6. 📈 查看统计" -ForegroundColor Cyan
        Write-Host "  7. 📚 生成文档" -ForegroundColor Cyan
        Write-Host "  8. ⚙️ 配置管理" -ForegroundColor Cyan
        Write-Host "  0. 🚪 退出" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请选择操作 (0-8)"

        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "🔍 开始API发现..." -ForegroundColor Yellow
                $discovered = Invoke-ApiDiscovery
                Write-Host "发现了 $($discovered.Count) 个新API" -ForegroundColor Green
                Read-Host "按回车键继续"
            }
            "2" {
                Write-Host ""
                Write-Host "📝 注册新API" -ForegroundColor Yellow
                $name = Read-Host "API名称"
                $url = Read-Host "API URL"
                $method = Read-Host "HTTP方法 (默认: GET)"
                if ([string]::IsNullOrEmpty($method)) { $method = "GET" }
                $description = Read-Host "描述 (可选)"

                if (-not [string]::IsNullOrEmpty($name) -and -not [string]::IsNullOrEmpty($url)) {
                    Register-Api -Name $name -Url $url -Method $method -Description $description
                } else {
                    Write-Host "名称和URL不能为空" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "3" {
                Show-ApiHealthStatus
                Read-Host "按回车键继续"
            }
            "4" {
                Write-Host ""
                Write-Host "📊 开始监控所有API..." -ForegroundColor Yellow
                Invoke-ApiMonitoring
                Read-Host "按回车键继续"
            }
            "5" {
                Write-Host ""
                Write-Host "🧪 测试API" -ForegroundColor Yellow
                $url = Read-Host "API URL"
                $method = Read-Host "HTTP方法 (默认: GET)"
                if ([string]::IsNullOrEmpty($method)) { $method = "GET" }

                if (-not [string]::IsNullOrEmpty($url)) {
                    Test-SingleApi -Url $url -Method $method
                } else {
                    Write-Host "URL不能为空" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "6" {
                Show-ApiStatistics
                Read-Host "按回车键继续"
            }
            "7" {
                Generate-ApiDocumentation
                Read-Host "按回车键继续"
            }
            "8" {
                Write-Host ""
                Write-Host "⚙️ 配置管理功能开发中..." -ForegroundColor Yellow
                Read-Host "按回车键继续"
            }
            "0" {
                Write-Host ""
                Write-Host "👋 再见！" -ForegroundColor Green
                break
            }
            default {
                Write-Host ""
                Write-Host "❌ 无效选择，请重试" -ForegroundColor Red
                Start-Sleep -Seconds 2
            }
        }
    }
}

function Show-ApiHelp {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  智能多Web应用门户系统 - API接口管理工具 v1.1.0" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\api.ps1 -Action <操作> [参数]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚙️ 可用操作:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  🔍 API发现和注册:" -ForegroundColor Magenta
    Write-Host "    discover                自动发现系统中的API接口" -ForegroundColor Cyan
    Write-Host "    register -ApiName <名称> -ApiUrl <URL> -Method <方法>  注册新API" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🏥 监控和健康检查:" -ForegroundColor Magenta
    Write-Host "    monitor                 监控所有注册的API" -ForegroundColor Cyan
    Write-Host "    health                  显示API健康状态" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🧪 测试和验证:" -ForegroundColor Magenta
    Write-Host "    test -ApiUrl <URL> -Method <方法>  测试指定API" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  📊 统计和文档:" -ForegroundColor Magenta
    Write-Host "    stats                   显示API统计信息" -ForegroundColor Cyan
    Write-Host "    docs                    生成API文档" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🎨 交互式管理:" -ForegroundColor Magenta
    Write-Host "    interactive             启动交互式管理界面" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  📚 帮助:" -ForegroundColor Magenta
    Write-Host "    help                    显示此帮助信息" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 使用示例:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  # 自动发现API" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action discover" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 注册新API" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action register -ApiName '用户API' -ApiUrl 'http://localhost:8002/api/users'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 监控所有API" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action monitor" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 测试API" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action test -ApiUrl 'http://localhost:8002/health'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 查看健康状态" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action health" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 启动交互式界面" -ForegroundColor Gray
    Write-Host "  .\api.ps1 -Action interactive" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 配置文件:" -ForegroundColor Yellow
    Write-Host "  API配置: configs\api-config.json" -ForegroundColor Cyan
    Write-Host "  API注册表: configs\api-registry.json" -ForegroundColor Cyan
    Write-Host "  日志文件: logs\api.log" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
}

# 执行主函数
Main
