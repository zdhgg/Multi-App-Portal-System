# 智能多Web应用门户系统 - 统一配置管理系统
# 提供配置文件的读取、写入、验证、备份等功能
# 作者: Augment Agent
# 版本: 2.0.0

param(
    [ValidateSet("get", "set", "list", "backup", "restore", "validate", "reset", "help")]
    [string]$Action = "list",
    
    [string]$ConfigKey,
    [string]$ConfigValue,
    [string]$ConfigFile = "system-config.json",
    [string]$BackupFile,
    [string]$Section,
    
    [switch]$Global,
    [switch]$Force,
    [switch]$Verbose,
    [switch]$DryRun,
    [switch]$Help
)

# ============================================================================
# 全局配置和常量
# ============================================================================

$SCRIPT_VERSION = "2.0.0"
$SCRIPT_NAME = "智能多Web应用门户系统统一配置管理"

# 路径配置
$PROJECT_ROOT = $PSScriptRoot
$CONFIG_DIR = Join-Path $PROJECT_ROOT "configs"
$BACKUP_DIR = Join-Path $CONFIG_DIR "backups"
$TEMPLATE_DIR = Join-Path $CONFIG_DIR "templates"

# 导入统一日志系统（仅导入函数，不执行主逻辑）
$LOGS_SCRIPT = Join-Path $PROJECT_ROOT "logs.ps1"
if (Test-Path $LOGS_SCRIPT) {
    # 临时保存当前参数
    $originalArgs = $args
    $originalAction = $Action

    # 清空参数以避免冲突
    $args = @()

    # 导入日志脚本
    . $LOGS_SCRIPT

    # 恢复参数
    $args = $originalArgs
    $Action = $originalAction
}

# 配置文件路径
$SYSTEM_CONFIG_FILE = Join-Path $CONFIG_DIR $ConfigFile
$PORTAL_CONFIG_FILE = Join-Path $PROJECT_ROOT "detection-api\configs\portal-config.json"
$RECOVERY_CONFIG_FILE = Join-Path $PROJECT_ROOT "recovery-config.json"

# 配置架构定义
$CONFIG_SCHEMA = @{
    system = @{
        version = "2.0.0"
        name = "Intelligent Multi-App Portal System"
        environment = "development"  # development, production
        mode = "auto"  # auto, pm2, development, hybrid
    }
    ports = @{
        backend = 8002
        frontend = 3000
        monitoring = 8002
        websocket = 8003
    }
    paths = @{
        projectRoot = $PROJECT_ROOT
        backendDir = "detection-api"
        frontendDir = "main-portal"
        configDir = "configs"
        logsDir = "logs"
        scriptsDir = "scripts"
    }
    startup = @{
        timeoutSeconds = 30
        maxRetries = 3
        healthCheckInterval = 3
        skipDependencyCheck = $false
        skipHealthCheck = $false
        skipBuild = $false
        enableAutoRecovery = $false
        verboseOutput = $false
    }
    monitoring = @{
        refreshInterval = 3
        enableRealTimeMonitoring = $true
        healthCheckTimeout = 10
        resourceCheckEnabled = $true
        processCheckEnabled = $true
        portCheckEnabled = $true
    }
    recovery = @{
        enabled = $true
        checkInterval = 30
        maxRetries = 3
        retryDelay = 10
        autoRecover = $true
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
    }
    logging = @{
        enabled = $true
        level = "INFO"  # DEBUG, INFO, WARN, ERROR, FATAL
        maxLogSize = 10485760  # 10MB
        retentionDays = 30
        components = @("SYSTEM", "RECOVERY", "MONITOR", "STARTUP", "API", "LOGS")
    }
    security = @{
        allowPortRangeModification = $true
        requireConfirmationForCriticalChanges = $true
        allowedConfigModifiers = @("admin", "system")
        configChangeAuditLog = $true
        validateConfigIntegrity = $true
    }
    performance = @{
        caching = @{
            enablePortStatusCache = $true
            cacheTimeout = 300
        }
        optimization = @{
            batchPortChecks = $true
            parallelProcessing = $true
        }
    }
    ui = @{
        theme = @{
            primaryColor = "#007bff"
            darkMode = $false
        }
        dashboard = @{
            refreshIntervalMs = 5000
            animationEnabled = $true
        }
        portManagement = @{
            showPortUsageChart = $true
        }
    }
    notifications = @{
        enabled = $true
        channels = @{
            log = @{ enabled = $true }
            console = @{ enabled = $true }
        }
        events = @{
            startup = $true
            shutdown = $true
            error = $true
            recovery = $true
        }
    }
    experimental = @{
        features = @{}
        flags = @{}
    }
}

# ============================================================================
# 核心配置管理函数
# ============================================================================

function Initialize-ConfigSystem {
    Write-LogMessage "初始化配置管理系统" "INFO" "CONFIG"
    
    # 创建配置目录结构
    @($CONFIG_DIR, $BACKUP_DIR, $TEMPLATE_DIR) | ForEach-Object {
        if (-not (Test-Path $_)) {
            try {
                New-Item -Path $_ -ItemType Directory -Force | Out-Null
                Write-LogMessage "创建配置目录: $_" "INFO" "CONFIG"
            } catch {
                Write-LogMessage "创建配置目录失败: $_ - $($_.Exception.Message)" "ERROR" "CONFIG"
            }
        }
    }
    
    # 创建默认配置文件
    if (-not (Test-Path $SYSTEM_CONFIG_FILE)) {
        try {
            $CONFIG_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content $SYSTEM_CONFIG_FILE -Encoding UTF8
            Write-LogMessage "创建默认系统配置文件: $SYSTEM_CONFIG_FILE" "SUCCESS" "CONFIG"
        } catch {
            Write-LogMessage "创建默认配置文件失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        }
    }
    
    # 创建配置模板
    Create-ConfigTemplates
}

function Create-ConfigTemplates {
    $templates = @{
        "development.json" = @{
            system = @{ environment = "development"; mode = "development" }
            ports = @{ backend = 8002; frontend = 3000 }
            startup = @{ verboseOutput = $true; skipBuild = $false }
            monitoring = @{ refreshInterval = 2 }
            logging = @{ level = "DEBUG" }
        }
        "production.json" = @{
            system = @{ environment = "production"; mode = "pm2" }
            ports = @{ backend = 8002; frontend = 3000 }
            startup = @{ verboseOutput = $false; skipBuild = $true }
            monitoring = @{ refreshInterval = 5 }
            logging = @{ level = "INFO" }
        }
        "testing.json" = @{
            system = @{ environment = "development"; mode = "auto" }
            ports = @{ backend = 8002; frontend = 3001 }
            startup = @{ timeoutSeconds = 60; maxRetries = 5 }
            monitoring = @{ refreshInterval = 1 }
            logging = @{ level = "DEBUG" }
        }
    }
    
    foreach ($templateName in $templates.Keys) {
        $templatePath = Join-Path $TEMPLATE_DIR $templateName
        if (-not (Test-Path $templatePath)) {
            try {
                $templates[$templateName] | ConvertTo-Json -Depth 10 | Set-Content $templatePath -Encoding UTF8
                Write-LogMessage "创建配置模板: $templateName" "INFO" "CONFIG"
            } catch {
                Write-LogMessage "创建配置模板失败: $templateName - $($_.Exception.Message)" "ERROR" "CONFIG"
            }
        }
    }
}

function Get-SystemConfig {
    param([string]$ConfigPath = $SYSTEM_CONFIG_FILE)
    
    if (-not (Test-Path $ConfigPath)) {
        Write-LogMessage "配置文件不存在，使用默认配置: $ConfigPath" "WARN" "CONFIG"
        return $CONFIG_SCHEMA
    }
    
    try {
        $configContent = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        Write-LogMessage "配置文件加载成功: $ConfigPath" "INFO" "CONFIG"
        
        # 合并默认配置和用户配置
        $mergedConfig = Merge-ConfigObjects $CONFIG_SCHEMA $configContent
        return $mergedConfig
    } catch {
        Write-LogMessage "配置文件解析失败，使用默认配置: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $CONFIG_SCHEMA
    }
}

function Set-SystemConfig {
    param(
        [string]$Key,
        [object]$Value,
        [string]$ConfigPath = $SYSTEM_CONFIG_FILE,
        [switch]$CreateBackup = $true
    )
    
    Write-LogMessage "设置配置项: $Key = $Value" "INFO" "CONFIG"
    
    # 创建备份
    if ($CreateBackup) {
        Backup-ConfigFile $ConfigPath
    }
    
    # 加载当前配置
    $config = Get-SystemConfig $ConfigPath
    
    # 设置配置值
    $keyParts = $Key.Split('.')
    $current = $config
    
    for ($i = 0; $i -lt $keyParts.Length - 1; $i++) {
        $part = $keyParts[$i]
        if (-not $current.$part) {
            $current.$part = @{}
        }
        $current = $current.$part
    }
    
    $finalKey = $keyParts[-1]
    $current.$finalKey = $Value
    
    # 保存配置
    try {
        $config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8
        Write-LogMessage "配置保存成功: $Key" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-LogMessage "配置保存失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Get-ConfigValue {
    param(
        [string]$Key,
        [string]$ConfigPath = $SYSTEM_CONFIG_FILE,
        [object]$DefaultValue = $null
    )

    $config = Get-SystemConfig $ConfigPath
    $keyParts = $Key.Split('.')
    $current = $config

    foreach ($part in $keyParts) {
        if ($current -is [hashtable] -and $current.ContainsKey($part)) {
            $current = $current.$part
        } elseif ($current.PSObject.Properties.Name -contains $part) {
            $current = $current.$part
        } else {
            Write-LogMessage "配置项不存在: $Key，返回默认值" "WARN" "CONFIG"
            return $DefaultValue
        }
    }

    return $current
}

function Merge-ConfigObjects {
    param([object]$Default, [object]$Override)

    if ($Override -eq $null) { return $Default }
    if ($Default -eq $null) { return $Override }

    $result = @{}

    # 复制默认配置
    if ($Default -is [hashtable]) {
        foreach ($key in $Default.Keys) {
            $result[$key] = $Default[$key]
        }
    } else {
        foreach ($prop in $Default.PSObject.Properties) {
            $result[$prop.Name] = $prop.Value
        }
    }

    # 覆盖用户配置
    if ($Override -is [hashtable]) {
        foreach ($key in $Override.Keys) {
            if ($result.ContainsKey($key) -and
                $result[$key] -is [hashtable] -and
                $Override[$key] -is [hashtable]) {
                $result[$key] = Merge-ConfigObjects $result[$key] $Override[$key]
            } else {
                $result[$key] = $Override[$key]
            }
        }
    } else {
        foreach ($prop in $Override.PSObject.Properties) {
            if ($result.ContainsKey($prop.Name) -and
                $result[$prop.Name] -is [hashtable] -and
                $prop.Value -is [hashtable]) {
                $result[$prop.Name] = Merge-ConfigObjects $result[$prop.Name] $prop.Value
            } else {
                $result[$prop.Name] = $prop.Value
            }
        }
    }

    return $result
}

function Backup-ConfigFile {
    param(
        [string]$ConfigPath,
        [string]$BackupDir = $BACKUP_DIR
    )

    if (-not (Test-Path $ConfigPath)) {
        Write-LogMessage "配置文件不存在，无法备份: $ConfigPath" "WARN" "CONFIG"
        return $false
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($ConfigPath)
    $extension = [System.IO.Path]::GetExtension($ConfigPath)
    $backupFileName = "$fileName-backup-$timestamp$extension"
    $backupPath = Join-Path $BackupDir $backupFileName

    try {
        Copy-Item $ConfigPath $backupPath -Force
        Write-LogMessage "配置文件备份成功: $backupFileName" "SUCCESS" "CONFIG"
        return $backupPath
    } catch {
        Write-LogMessage "配置文件备份失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Restore-ConfigFile {
    param(
        [string]$BackupPath,
        [string]$TargetPath = $SYSTEM_CONFIG_FILE
    )

    if (-not (Test-Path $BackupPath)) {
        Write-LogMessage "备份文件不存在: $BackupPath" "ERROR" "CONFIG"
        return $false
    }

    try {
        # 备份当前配置
        Backup-ConfigFile $TargetPath

        # 恢复配置
        Copy-Item $BackupPath $TargetPath -Force
        Write-LogMessage "配置文件恢复成功: $BackupPath -> $TargetPath" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-LogMessage "配置文件恢复失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Validate-ConfigFile {
    param([string]$ConfigPath = $SYSTEM_CONFIG_FILE)

    Write-LogMessage "验证配置文件: $ConfigPath" "INFO" "CONFIG"

    if (-not (Test-Path $ConfigPath)) {
        Write-LogMessage "配置文件不存在" "ERROR" "CONFIG"
        return $false
    }

    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        $isValid = $true
        $errors = @()

        # 验证必需的配置节
        $requiredSections = @("system", "ports", "paths", "startup", "monitoring")
        foreach ($section in $requiredSections) {
            if (-not $config.$section) {
                $errors += "缺少必需的配置节: $section"
                $isValid = $false
            }
        }

        # 验证端口配置
        if ($config.ports) {
            $ports = @($config.ports.backend, $config.ports.frontend, $config.ports.monitoring)
            foreach ($port in $ports) {
                if ($port -and ($port -lt 1024 -or $port -gt 65535)) {
                    $errors += "端口号超出有效范围: $port"
                    $isValid = $false
                }
            }
        }

        # 验证路径配置
        if ($config.paths -and $config.paths.projectRoot) {
            if (-not (Test-Path $config.paths.projectRoot)) {
                $errors += "项目根目录不存在: $($config.paths.projectRoot)"
                $isValid = $false
            }
        }

        if ($isValid) {
            Write-LogMessage "配置文件验证通过" "SUCCESS" "CONFIG"
        } else {
            Write-LogMessage "配置文件验证失败:" "ERROR" "CONFIG"
            foreach ($error in $errors) {
                Write-LogMessage "  - $error" "ERROR" "CONFIG"
            }
        }

        return $isValid
    } catch {
        Write-LogMessage "配置文件格式错误: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Reset-ConfigFile {
    param(
        [string]$ConfigPath = $SYSTEM_CONFIG_FILE,
        [switch]$Force
    )

    if (-not $Force) {
        $confirmation = Read-Host "确定要重置配置文件到默认设置吗？这将覆盖所有自定义配置。(y/N)"
        if ($confirmation -ne "y" -and $confirmation -ne "Y") {
            Write-LogMessage "配置重置已取消" "INFO" "CONFIG"
            return $false
        }
    }

    # 备份当前配置
    Backup-ConfigFile $ConfigPath

    try {
        $CONFIG_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8
        Write-LogMessage "配置文件已重置为默认设置" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-LogMessage "配置文件重置失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

# ============================================================================
# 配置显示和用户界面函数
# ============================================================================

function Show-ConfigList {
    param(
        [string]$Section = "",
        [string]$ConfigPath = $SYSTEM_CONFIG_FILE
    )

    Write-LogMessage "显示配置列表 - 节: $Section" "INFO" "CONFIG"

    $config = Get-SystemConfig $ConfigPath

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  系统配置列表" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    if ($Section) {
        # 显示特定节的配置
        if ($config.$Section) {
            Write-Host "📋 配置节: $Section" -ForegroundColor Yellow
            Write-Host ""
            Show-ConfigSection $config.$Section "$Section" 1
        } else {
            Write-Host "❌ 配置节不存在: $Section" -ForegroundColor Red
        }
    } else {
        # 显示所有配置节
        $sections = @("system", "ports", "paths", "startup", "monitoring", "recovery", "logging", "security", "performance", "ui", "notifications")

        foreach ($sectionName in $sections) {
            if ($config.$sectionName) {
                Write-Host "📋 $sectionName" -ForegroundColor Yellow
                Show-ConfigSection $config.$sectionName "$sectionName" 1
                Write-Host ""
            }
        }
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Show-ConfigSection {
    param(
        [object]$ConfigObject,
        [string]$Path,
        [int]$Indent = 0
    )

    $indentStr = "  " * $Indent

    if ($ConfigObject -is [hashtable]) {
        foreach ($key in $ConfigObject.Keys | Sort-Object) {
            $value = $ConfigObject[$key]
            $fullPath = if ($Path) { "$Path.$key" } else { $key }

            if ($value -is [hashtable] -and $value.Keys.Count -gt 0) {
                Write-Host "$indentStr🔧 ${key}:" -ForegroundColor Magenta
                Show-ConfigSection $value $fullPath ($Indent + 1)
            } else {
                $displayValue = if ($value -is [array]) {
                    "[$($value -join ', ')]"
                } elseif ($value -is [bool]) {
                    if ($value) { "✅ true" } else { "❌ false" }
                } else {
                    $value
                }
                Write-Host "$indentStr  • ${key} = " -ForegroundColor Gray -NoNewline
                Write-Host "$displayValue" -ForegroundColor White
            }
        }
    } else {
        foreach ($prop in $ConfigObject.PSObject.Properties | Sort-Object Name) {
            $fullPath = if ($Path) { "$Path.$($prop.Name)" } else { $prop.Name }

            if ($prop.Value -is [PSCustomObject] -or ($prop.Value -is [hashtable] -and $prop.Value.Keys.Count -gt 0)) {
                Write-Host "$indentStr🔧 $($prop.Name):" -ForegroundColor Magenta
                Show-ConfigSection $prop.Value $fullPath ($Indent + 1)
            } else {
                $displayValue = if ($prop.Value -is [array]) {
                    "[$($prop.Value -join ', ')]"
                } elseif ($prop.Value -is [bool]) {
                    if ($prop.Value) { "✅ true" } else { "❌ false" }
                } else {
                    $prop.Value
                }
                Write-Host "$indentStr  • $($prop.Name) = " -ForegroundColor Gray -NoNewline
                Write-Host "$displayValue" -ForegroundColor White
            }
        }
    }
}

function Show-ConfigTemplates {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  可用配置模板" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    if (Test-Path $TEMPLATE_DIR) {
        $templates = Get-ChildItem $TEMPLATE_DIR -Filter "*.json"

        if ($templates.Count -gt 0) {
            foreach ($template in $templates) {
                $templateName = [System.IO.Path]::GetFileNameWithoutExtension($template.Name)
                Write-Host "📄 $templateName" -ForegroundColor Yellow

                try {
                    $templateContent = Get-Content $template.FullName -Raw | ConvertFrom-Json
                    Write-Host "   环境: $($templateContent.system.environment)" -ForegroundColor Gray
                    Write-Host "   模式: $($templateContent.system.mode)" -ForegroundColor Gray
                    Write-Host "   后端端口: $($templateContent.ports.backend)" -ForegroundColor Gray
                    Write-Host "   前端端口: $($templateContent.ports.frontend)" -ForegroundColor Gray
                    Write-Host ""
                } catch {
                    Write-Host "   ❌ 模板文件格式错误" -ForegroundColor Red
                    Write-Host ""
                }
            }
        } else {
            Write-Host "📭 暂无可用模板" -ForegroundColor Yellow
        }
    } else {
        Write-Host "📁 模板目录不存在" -ForegroundColor Red
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
}

function Show-ConfigBackups {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "  配置备份列表" -ForegroundColor Blue
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host ""

    if (Test-Path $BACKUP_DIR) {
        $backups = Get-ChildItem $BACKUP_DIR -Filter "*backup*.json" | Sort-Object LastWriteTime -Descending

        if ($backups.Count -gt 0) {
            Write-Host "📦 最近的配置备份:" -ForegroundColor Yellow
            Write-Host ""

            $count = 0
            foreach ($backup in $backups) {
                $count++
                if ($count -gt 10) { break }  # 只显示最近10个备份

                $size = [math]::Round($backup.Length / 1KB, 2)
                Write-Host "  [$count] $($backup.Name)" -ForegroundColor White
                Write-Host "      时间: $($backup.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
                Write-Host "      大小: ${size}KB" -ForegroundColor Gray
                Write-Host ""
            }

            if ($backups.Count -gt 10) {
                Write-Host "  ... 还有 $($backups.Count - 10) 个更早的备份" -ForegroundColor Gray
            }
        } else {
            Write-Host "📭 暂无配置备份" -ForegroundColor Yellow
        }
    } else {
        Write-Host "📁 备份目录不存在" -ForegroundColor Red
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
}

function Start-InteractiveConfig {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  配置管理交互界面" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    while ($true) {
        Write-Host "⚙️ 配置管理选项:" -ForegroundColor Yellow
        Write-Host "  [1] 查看当前配置" -ForegroundColor White
        Write-Host "  [2] 修改配置项" -ForegroundColor White
        Write-Host "  [3] 查看配置模板" -ForegroundColor White
        Write-Host "  [4] 应用配置模板" -ForegroundColor White
        Write-Host "  [5] 备份当前配置" -ForegroundColor White
        Write-Host "  [6] 查看配置备份" -ForegroundColor White
        Write-Host "  [7] 恢复配置备份" -ForegroundColor White
        Write-Host "  [8] 验证配置文件" -ForegroundColor White
        Write-Host "  [9] 重置为默认配置" -ForegroundColor White
        Write-Host "  [0] 返回主菜单" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请输入选择 (0-9)"

        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "📋 选择要查看的配置节:" -ForegroundColor Yellow
                Write-Host "  [1] 全部配置"
                Write-Host "  [2] 系统配置 (system)"
                Write-Host "  [3] 端口配置 (ports)"
                Write-Host "  [4] 启动配置 (startup)"
                Write-Host "  [5] 监控配置 (monitoring)"
                Write-Host "  [6] 恢复配置 (recovery)"
                Write-Host "  [7] 日志配置 (logging)"
                Write-Host ""

                $sectionChoice = Read-Host "请选择 (1-7)"
                $sectionMap = @{
                    "1" = ""
                    "2" = "system"
                    "3" = "ports"
                    "4" = "startup"
                    "5" = "monitoring"
                    "6" = "recovery"
                    "7" = "logging"
                }

                if ($sectionMap.ContainsKey($sectionChoice)) {
                    Show-ConfigList $sectionMap[$sectionChoice]
                } else {
                    Write-Host "❌ 无效选择" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "2" {
                $key = Read-Host "请输入配置项路径 (例如: system.environment)"
                $value = Read-Host "请输入新值"

                if ($key -and $value) {
                    # 尝试转换值类型
                    $convertedValue = Convert-ConfigValue $value
                    $success = Set-SystemConfig $key $convertedValue

                    if ($success) {
                        Write-Host "✅ 配置项已更新: $key = $convertedValue" -ForegroundColor Green
                    } else {
                        Write-Host "❌ 配置项更新失败" -ForegroundColor Red
                    }
                } else {
                    Write-Host "❌ 配置项路径和值不能为空" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "3" {
                Show-ConfigTemplates
                Read-Host "按回车键继续"
            }
            "4" {
                Show-ConfigTemplates
                $templateName = Read-Host "请输入要应用的模板名称 (不含.json扩展名)"

                if ($templateName) {
                    $templatePath = Join-Path $TEMPLATE_DIR "$templateName.json"
                    if (Test-Path $templatePath) {
                        $confirm = Read-Host "确定要应用模板 '$templateName' 吗？这将覆盖当前配置。(y/N)"
                        if ($confirm -eq "y" -or $confirm -eq "Y") {
                            Apply-ConfigTemplate $templateName
                        } else {
                            Write-Host "操作已取消" -ForegroundColor Yellow
                        }
                    } else {
                        Write-Host "❌ 模板文件不存在: $templateName" -ForegroundColor Red
                    }
                }
                Read-Host "按回车键继续"
            }
            "5" {
                $backupPath = Backup-ConfigFile $SYSTEM_CONFIG_FILE
                if ($backupPath) {
                    Write-Host "✅ 配置备份成功: $([System.IO.Path]::GetFileName($backupPath))" -ForegroundColor Green
                } else {
                    Write-Host "❌ 配置备份失败" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "6" {
                Show-ConfigBackups
                Read-Host "按回车键继续"
            }
            "7" {
                Show-ConfigBackups
                $backupName = Read-Host "请输入要恢复的备份文件名"

                if ($backupName) {
                    $backupPath = Join-Path $BACKUP_DIR $backupName
                    if (Test-Path $backupPath) {
                        $confirm = Read-Host "确定要恢复备份 '$backupName' 吗？这将覆盖当前配置。(y/N)"
                        if ($confirm -eq "y" -or $confirm -eq "Y") {
                            $success = Restore-ConfigFile $backupPath
                            if ($success) {
                                Write-Host "✅ 配置恢复成功" -ForegroundColor Green
                            } else {
                                Write-Host "❌ 配置恢复失败" -ForegroundColor Red
                            }
                        } else {
                            Write-Host "操作已取消" -ForegroundColor Yellow
                        }
                    } else {
                        Write-Host "❌ 备份文件不存在: $backupName" -ForegroundColor Red
                    }
                }
                Read-Host "按回车键继续"
            }
            "8" {
                Write-Host "🔍 验证配置文件..." -ForegroundColor Cyan
                $isValid = Validate-ConfigFile
                if ($isValid) {
                    Write-Host "✅ 配置文件验证通过" -ForegroundColor Green
                } else {
                    Write-Host "❌ 配置文件验证失败，请检查日志" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "9" {
                $confirm = Read-Host "⚠️ 确定要重置配置为默认设置吗？这将丢失所有自定义配置。(y/N)"
                if ($confirm -eq "y" -or $confirm -eq "Y") {
                    $success = Reset-ConfigFile -Force
                    if ($success) {
                        Write-Host "✅ 配置已重置为默认设置" -ForegroundColor Green
                    } else {
                        Write-Host "❌ 配置重置失败" -ForegroundColor Red
                    }
                } else {
                    Write-Host "操作已取消" -ForegroundColor Yellow
                }
                Read-Host "按回车键继续"
            }
            "0" {
                return
            }
            default {
                Write-Host "❌ 无效选择，请输入 0-9" -ForegroundColor Red
                Start-Sleep -Seconds 1
            }
        }

        Clear-Host
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host "  配置管理交互界面" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host ""
    }
}

function Convert-ConfigValue {
    param([string]$Value)

    # 尝试转换为适当的类型
    if ($Value -eq "true" -or $Value -eq "false") {
        return [bool]::Parse($Value)
    } elseif ($Value -match '^\d+$') {
        return [int]$Value
    } elseif ($Value -match '^\d+\.\d+$') {
        return [double]$Value
    } elseif ($Value.StartsWith('[') -and $Value.EndsWith(']')) {
        # 数组格式 [item1,item2,item3]
        $arrayContent = $Value.Substring(1, $Value.Length - 2)
        return $arrayContent.Split(',').Trim()
    } else {
        return $Value
    }
}

function Apply-ConfigTemplate {
    param([string]$TemplateName)

    $templatePath = Join-Path $TEMPLATE_DIR "$TemplateName.json"

    if (-not (Test-Path $templatePath)) {
        Write-LogMessage "模板文件不存在: $TemplateName" "ERROR" "CONFIG"
        return $false
    }

    try {
        # 备份当前配置
        Backup-ConfigFile $SYSTEM_CONFIG_FILE

        # 加载模板
        $template = Get-Content $templatePath -Raw | ConvertFrom-Json

        # 加载当前配置
        $currentConfig = Get-SystemConfig

        # 合并配置
        $mergedConfig = Merge-ConfigObjects $currentConfig $template

        # 保存配置
        $mergedConfig | ConvertTo-Json -Depth 10 | Set-Content $SYSTEM_CONFIG_FILE -Encoding UTF8

        Write-LogMessage "配置模板应用成功: $TemplateName" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-LogMessage "配置模板应用失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

# ============================================================================
# 配置同步和集成函数
# ============================================================================

function Sync-ConfigToScripts {
    param([string]$ConfigPath = $SYSTEM_CONFIG_FILE)

    Write-LogMessage "同步配置到其他脚本" "INFO" "CONFIG"

    $config = Get-SystemConfig $ConfigPath

    # 同步到recovery.ps1配置
    $recoveryConfig = @{
        recovery = $config.recovery
        monitoring = @{
            healthCheckTimeout = $config.monitoring.healthCheckTimeout
            processCheckEnabled = $config.monitoring.processCheckEnabled
            portCheckEnabled = $config.monitoring.portCheckEnabled
            resourceCheckEnabled = $config.monitoring.resourceCheckEnabled
        }
        strategies = $config.recovery.strategies
        notifications = @{
            enabled = $config.notifications.enabled
            logLevel = $config.logging.level
            maxLogSize = $config.logging.maxLogSize
        }
    }

    try {
        $recoveryConfig | ConvertTo-Json -Depth 10 | Set-Content $RECOVERY_CONFIG_FILE -Encoding UTF8
        Write-LogMessage "恢复系统配置同步成功" "SUCCESS" "CONFIG"
    } catch {
        Write-LogMessage "恢复系统配置同步失败: $($_.Exception.Message)" "ERROR" "CONFIG"
    }

    # 同步到portal配置（如果存在）
    if (Test-Path $PORTAL_CONFIG_FILE) {
        try {
            $portalConfig = Get-Content $PORTAL_CONFIG_FILE -Raw | ConvertFrom-Json

            # 更新端口配置
            $portalConfig.portConfiguration.defaultPorts.backend = $config.ports.backend
            $portalConfig.portConfiguration.defaultPorts.frontend = $config.ports.frontend

            # 更新系统配置
            $portalConfig.systemConfiguration.logsDirectory = $config.paths.logsDir
            $portalConfig.systemConfiguration.backupRetentionDays = $config.logging.retentionDays

            # 更新应用配置
            $portalConfig.applicationConfiguration.startupTimeout = $config.startup.timeoutSeconds * 1000
            $portalConfig.applicationConfiguration.environmentVariables.NODE_ENV = $config.system.environment

            $portalConfig | ConvertTo-Json -Depth 10 | Set-Content $PORTAL_CONFIG_FILE -Encoding UTF8
            Write-LogMessage "Portal配置同步成功" "SUCCESS" "CONFIG"
        } catch {
            Write-LogMessage "Portal配置同步失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        }
    }
}

function Get-ConfigForScript {
    param(
        [ValidateSet("start", "monitor", "recovery", "logs")]
        [string]$ScriptName,
        [string]$ConfigPath = $SYSTEM_CONFIG_FILE
    )

    $config = Get-SystemConfig $ConfigPath

    switch ($ScriptName) {
        "start" {
            return @{
                Environment = $config.system.environment
                Mode = $config.system.mode
                BackendPort = $config.ports.backend
                FrontendPort = $config.ports.frontend
                TimeoutSeconds = $config.startup.timeoutSeconds
                SkipDependencyCheck = $config.startup.skipDependencyCheck
                SkipHealthCheck = $config.startup.skipHealthCheck
                SkipBuild = $config.startup.skipBuild
                EnableAutoRecovery = $config.startup.enableAutoRecovery
                VerboseOutput = $config.startup.verboseOutput
            }
        }
        "monitor" {
            return @{
                RefreshInterval = $config.monitoring.refreshInterval
                BackendPort = $config.ports.backend
                FrontendPort = $config.ports.frontend
                EnableAutoRecovery = $config.recovery.enabled
            }
        }
        "recovery" {
            return @{
                CheckInterval = $config.recovery.checkInterval
                BackendPort = $config.ports.backend
                FrontendPort = $config.ports.frontend
                EnableAutoRecover = $config.recovery.enabled
                VerboseOutput = $config.startup.verboseOutput
            }
        }
        "logs" {
            return @{
                LogLevel = $config.logging.level
                RetentionDays = $config.logging.retentionDays
                MaxLogSize = $config.logging.maxLogSize
                Components = $config.logging.components
            }
        }
    }
}

# ============================================================================
# 帮助系统和主函数
# ============================================================================

function Show-ConfigHelp {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION - 帮助文档" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\config.ps1 [参数]"
    Write-Host ""
    Write-Host "⚙️ 主要参数:" -ForegroundColor Yellow
    Write-Host "  -Action <操作>        操作类型: get|set|list|backup|restore|validate|reset|help (默认: list)"
    Write-Host "  -ConfigKey <键>       配置项路径，如: system.environment"
    Write-Host "  -ConfigValue <值>     配置项的新值"
    Write-Host "  -ConfigFile <文件>    配置文件名 (默认: system-config.json)"
    Write-Host "  -BackupFile <文件>    备份文件路径"
    Write-Host "  -Section <节>         配置节名称"
    Write-Host ""
    Write-Host "🔧 功能开关:" -ForegroundColor Yellow
    Write-Host "  -Global               全局配置模式"
    Write-Host "  -Force                强制执行操作"
    Write-Host "  -Verbose              详细输出"
    Write-Host "  -DryRun               模拟运行"
    Write-Host "  -Help                 显示帮助"
    Write-Host ""
    Write-Host "🎯 操作说明:" -ForegroundColor Yellow
    Write-Host "  get                   获取配置项值"
    Write-Host "  set                   设置配置项值"
    Write-Host "  list                  列出配置项"
    Write-Host "  backup                备份配置文件"
    Write-Host "  restore               恢复配置备份"
    Write-Host "  validate              验证配置文件"
    Write-Host "  reset                 重置为默认配置"
    Write-Host ""
    Write-Host "💡 使用示例:" -ForegroundColor Yellow
    Write-Host "  .\config.ps1                                    # 列出所有配置"
    Write-Host "  .\config.ps1 -Action get -ConfigKey system.environment  # 获取环境配置"
    Write-Host "  .\config.ps1 -Action set -ConfigKey ports.backend -ConfigValue 8002  # 设置后端端口"
    Write-Host "  .\config.ps1 -Action list -Section ports        # 列出端口配置"
    Write-Host "  .\config.ps1 -Action backup                     # 备份当前配置"
    Write-Host "  .\config.ps1 -Action validate                   # 验证配置文件"
    Write-Host ""
    Write-Host "📊 配置节说明:" -ForegroundColor Yellow
    Write-Host "  system                系统基本配置 (环境、模式等)"
    Write-Host "  ports                 端口配置 (后端、前端、监控等)"
    Write-Host "  paths                 路径配置 (项目目录、日志目录等)"
    Write-Host "  startup               启动配置 (超时、重试、开关等)"
    Write-Host "  monitoring            监控配置 (刷新间隔、检查项等)"
    Write-Host "  recovery              恢复配置 (策略、间隔等)"
    Write-Host "  logging               日志配置 (级别、保留期等)"
    Write-Host "  security              安全配置 (权限、审计等)"
    Write-Host "  performance           性能配置 (缓存、优化等)"
    Write-Host "  ui                    界面配置 (主题、刷新等)"
    Write-Host "  notifications         通知配置 (渠道、事件等)"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-ConfigHelp
        return
    }

    # 初始化配置系统
    Initialize-ConfigSystem

    # 记录操作开始
    Write-LogMessage "配置管理操作开始 - 操作: $Action" "INFO" "CONFIG"

    # 根据操作执行相应功能
    switch ($Action.ToLower()) {
        "get" {
            if (-not $ConfigKey) {
                Write-Host "❌ 请指定配置项路径 (-ConfigKey)" -ForegroundColor Red
                exit 1
            }
            $value = Get-ConfigValue $ConfigKey
            Write-Host "配置项 '$ConfigKey' = $value" -ForegroundColor Green
        }

        "set" {
            if (-not $ConfigKey -or -not $ConfigValue) {
                Write-Host "❌ 请指定配置项路径和值 (-ConfigKey 和 -ConfigValue)" -ForegroundColor Red
                exit 1
            }
            $convertedValue = Convert-ConfigValue $ConfigValue
            $success = Set-SystemConfig $ConfigKey $convertedValue
            if ($success) {
                Write-Host "✅ 配置项已更新: $ConfigKey = $convertedValue" -ForegroundColor Green
                # 同步配置到其他脚本
                Sync-ConfigToScripts
            } else {
                Write-Host "❌ 配置项更新失败" -ForegroundColor Red
                exit 1
            }
        }

        "list" {
            Show-ConfigList $Section
        }

        "backup" {
            $backupPath = Backup-ConfigFile $SYSTEM_CONFIG_FILE
            if ($backupPath) {
                Write-Host "✅ 配置备份成功: $([System.IO.Path]::GetFileName($backupPath))" -ForegroundColor Green
            } else {
                Write-Host "❌ 配置备份失败" -ForegroundColor Red
                exit 1
            }
        }

        "restore" {
            if (-not $BackupFile) {
                Write-Host "❌ 请指定备份文件路径 (-BackupFile)" -ForegroundColor Red
                exit 1
            }
            $success = Restore-ConfigFile $BackupFile
            if ($success) {
                Write-Host "✅ 配置恢复成功" -ForegroundColor Green
                # 同步配置到其他脚本
                Sync-ConfigToScripts
            } else {
                Write-Host "❌ 配置恢复失败" -ForegroundColor Red
                exit 1
            }
        }

        "validate" {
            $isValid = Validate-ConfigFile
            if ($isValid) {
                Write-Host "✅ 配置文件验证通过" -ForegroundColor Green
            } else {
                Write-Host "❌ 配置文件验证失败，请检查日志" -ForegroundColor Red
                exit 1
            }
        }

        "reset" {
            $success = Reset-ConfigFile -Force:$Force
            if ($success) {
                Write-Host "✅ 配置已重置为默认设置" -ForegroundColor Green
                # 同步配置到其他脚本
                Sync-ConfigToScripts
            } else {
                Write-Host "❌ 配置重置失败" -ForegroundColor Red
                exit 1
            }
        }

        "interactive" {
            Start-InteractiveConfig
        }

        "help" {
            Show-ConfigHelp
        }

        default {
            Write-Host "❌ 未知的操作: $Action" -ForegroundColor Red
            Write-Host "使用 -Help 参数查看帮助信息" -ForegroundColor Yellow
            exit 1
        }
    }

    # 记录操作完成
    Write-LogMessage "配置管理操作完成 - 操作: $Action" "INFO" "CONFIG"
}

# ============================================================================
# 帮助系统
# ============================================================================

function Show-ConfigHelp {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  智能多Web应用门户系统 - 配置管理工具 v2.0.0" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\config.ps1 -Action <操作> [参数]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚙️ 可用操作:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  📋 配置查看和管理:" -ForegroundColor Magenta
    Write-Host "    list                    显示所有配置项" -ForegroundColor Cyan
    Write-Host "    get -ConfigKey <键>     获取指定配置项的值" -ForegroundColor Cyan
    Write-Host "    set -ConfigKey <键> -ConfigValue <值>  设置配置项的值" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🔧 配置管理:" -ForegroundColor Magenta
    Write-Host "    validate                验证配置文件完整性" -ForegroundColor Cyan
    Write-Host "    backup                  备份当前配置文件" -ForegroundColor Cyan
    Write-Host "    restore -BackupFile <文件>  从备份恢复配置" -ForegroundColor Cyan
    Write-Host "    sync                    同步配置到其他脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🎨 交互式管理:" -ForegroundColor Magenta
    Write-Host "    interactive             启动交互式配置管理界面" -ForegroundColor Cyan
    Write-Host "    wizard                  启动配置向导" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  📚 帮助和信息:" -ForegroundColor Magenta
    Write-Host "    help                    显示此帮助信息" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 使用示例:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  # 查看所有配置" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action list" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 获取系统环境配置" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action get -ConfigKey 'system.environment'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 设置后端端口" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action set -ConfigKey 'ports.backend' -ConfigValue '8002'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 验证配置文件" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action validate" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 备份配置" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action backup" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 启动交互式管理" -ForegroundColor Gray
    Write-Host "  .\config.ps1 -Action interactive" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 配置文件位置:" -ForegroundColor Yellow
    Write-Host "  主配置文件: configs\system-config.json" -ForegroundColor Cyan
    Write-Host "  备份目录:   configs\backups\" -ForegroundColor Cyan
    Write-Host "  模板目录:   configs\templates\" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 配置架构:" -ForegroundColor Yellow
    Write-Host "  • system     - 系统基本配置 (环境、模式、版本等)" -ForegroundColor Cyan
    Write-Host "  • ports      - 端口配置 (后端、前端、监控等)" -ForegroundColor Cyan
    Write-Host "  • paths      - 路径配置 (项目目录、日志目录等)" -ForegroundColor Cyan
    Write-Host "  • startup    - 启动配置 (重试次数、超时时间等)" -ForegroundColor Cyan
    Write-Host "  • monitoring - 监控配置 (检查间隔、启用状态等)" -ForegroundColor Cyan
    Write-Host "  • recovery   - 恢复配置 (自动恢复、策略配置等)" -ForegroundColor Cyan
    Write-Host "  • logging    - 日志配置 (级别、组件、保留天数等)" -ForegroundColor Cyan
    Write-Host "  • security   - 安全配置 (权限、验证、审计等)" -ForegroundColor Cyan
    Write-Host "  • performance- 性能配置 (缓存、优化选项等)" -ForegroundColor Cyan
    Write-Host "  • ui         - 界面配置 (主题、动画、颜色等)" -ForegroundColor Cyan
    Write-Host "  • notifications - 通知配置 (渠道、事件等)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
}

# 执行主函数
Main
