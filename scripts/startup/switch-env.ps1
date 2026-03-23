# 智能多Web应用门户系统 - 环境快速切换脚本
# 支持开发环境(dev)和生产环境(prod)的快速切换

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "prod", "development", "production")]
    [string]$Environment,
    
    [switch]$VerboseOutput,
    [switch]$DryRun
)

# 标准化环境名称
$env_name = switch ($Environment.ToLower()) {
    { $_ -in @("dev", "development") } { "development" }
    { $_ -in @("prod", "production") } { "production" }
}

# 配置路径
$CONFIG_DIR = "configs"
$DETECTION_API_DIR = "detection-api"
$MAIN_PORTAL_DIR = "main-portal"

# 环境配置文件映射
$ENV_CONFIGS = @{
    "development" = @{
        "env_file" = "$CONFIG_DIR/development.env"
        "pm2_config" = "$CONFIG_DIR/pm2-development.js"
        "display_name" = "开发环境"
        "description" = "本地开发，热重载，详细日志"
    }
    "production" = @{
        "env_file" = "$CONFIG_DIR/production.env"
        "pm2_config" = "$CONFIG_DIR/pm2-production.js"
        "display_name" = "生产环境"
        "description" = "优化性能，集群模式，精简日志"
    }
}

# 日志函数
function Write-Log {
    param($Message, $Level = "INFO", $Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $prefix = "[$timestamp] [$Level]"
    
    if ($VerboseOutput -or $Level -eq "ERROR") {
        Write-Host "$prefix $Message" -ForegroundColor $Color
    } elseif ($Level -eq "INFO") {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Write-Success { param($Message) Write-Log $Message "INFO" "Green" }
function Write-Warning { param($Message) Write-Log $Message "WARN" "Yellow" }
function Write-Error { param($Message) Write-Log $Message "ERROR" "Red" }
function Write-Info { param($Message) Write-Log $Message "INFO" "Cyan" }

# 检查文件是否存在
function Test-ConfigFile {
    param($FilePath, $Description)
    
    if (Test-Path $FilePath) {
        Write-Log "✅ $Description 存在: $FilePath" "DEBUG" "Gray"
        return $true
    } else {
        Write-Warning "⚠️ $Description 不存在: $FilePath"
        return $false
    }
}

# 备份现有配置
function Backup-CurrentConfig {
    $backup_dir = "config/backups"
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    
    if (-not (Test-Path $backup_dir)) {
        New-Item -ItemType Directory -Path $backup_dir -Force | Out-Null
        Write-Log "📁 创建备份目录: $backup_dir" "DEBUG"
    }
    
    # 备份.env文件
    if (Test-Path "$DETECTION_API_DIR/.env") {
        $backup_env = "$backup_dir/.env-$timestamp"
        Copy-Item "$DETECTION_API_DIR/.env" $backup_env
        Write-Log "💾 备份环境配置: $backup_env" "DEBUG"
    }
    
    # 备份PM2配置
    if (Test-Path "ecosystem.config.js") {
        $backup_pm2 = "$backup_dir/ecosystem.config-$timestamp.js"
        Copy-Item "ecosystem.config.js" $backup_pm2
        Write-Log "💾 备份PM2配置: $backup_pm2" "DEBUG"
    }
}

# 应用环境配置
function Set-EnvironmentConfig {
    param($EnvName)
    
    $config = $ENV_CONFIGS[$EnvName]
    $success = $true
    
    Write-Info "🔄 切换到 $($config.display_name)..."
    Write-Log "📝 $($config.description)" "INFO" "Gray"
    
    if (-not $DryRun) {
        # 备份当前配置
        Backup-CurrentConfig
    }
    
    # 复制环境配置文件
    if (Test-ConfigFile $config.env_file "环境配置文件") {
        if ($DryRun) {
            Write-Info "🔍 [模拟] 复制 $($config.env_file) → $DETECTION_API_DIR/.env"
        } else {
            Copy-Item $config.env_file "$DETECTION_API_DIR/.env" -Force
            Write-Success "✅ 环境配置已更新: $DETECTION_API_DIR/.env"
        }
    } else {
        $success = $false
    }
    
    # 复制PM2配置文件
    if (Test-ConfigFile $config.pm2_config "PM2配置文件") {
        if ($DryRun) {
            Write-Info "🔍 [模拟] 复制 $($config.pm2_config) → ecosystem.config.js"
        } else {
            Copy-Item $config.pm2_config "ecosystem.config.js" -Force
            Write-Success "✅ PM2配置已更新: ecosystem.config.js"
        }
    } else {
        $success = $false
    }
    
    return $success
}

# 验证环境切换
function Test-EnvironmentSwitch {
    param($EnvName)
    
    Write-Info "🔍 验证环境切换结果..."
    
    # 检查.env文件
    if (Test-Path "$DETECTION_API_DIR/.env") {
        $env_content = Get-Content "$DETECTION_API_DIR/.env" -Raw
        if ($env_content -match "NODE_ENV\s*=\s*$EnvName") {
            Write-Success "✅ 环境变量配置正确: NODE_ENV=$EnvName"
        } else {
            Write-Warning "⚠️ 环境变量可能不正确，请检查 .env 文件"
        }
    }
    
    # 检查PM2配置
    if (Test-Path "ecosystem.config.js") {
        Write-Success "✅ PM2配置文件已更新"
    }
}

# 显示环境信息
function Show-EnvironmentInfo {
    param($EnvName)
    
    $config = $ENV_CONFIGS[$EnvName]
    
    Write-Host ""
    Write-Host "🌟 环境切换完成！" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "📋 当前环境: $($config.display_name)" -ForegroundColor Cyan
    Write-Host "📝 环境描述: $($config.description)" -ForegroundColor Gray
    Write-Host "📁 配置文件: $($config.env_file)" -ForegroundColor Gray
    Write-Host "⚙️ PM2配置: $($config.pm2_config)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🚀 下一步操作建议:" -ForegroundColor Yellow
    
    if ($EnvName -eq "development") {
        Write-Host "   • 启动统一启动器: .\start.ps1" -ForegroundColor White
        Write-Host "   • 启动开发环境: .\scripts\startup\enhanced-start.ps1" -ForegroundColor White
        Write-Host "   • 或使用PM2: pm2 start ecosystem.config.js" -ForegroundColor White
    } else {
        Write-Host "   • 构建项目: npm run build" -ForegroundColor White
        Write-Host "   • 启动生产环境: pm2 start ecosystem.config.js --env production" -ForegroundColor White
    }
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
}

# 主函数
function Main {
    Write-Host ""
    Write-Host "🔄 智能多Web应用门户系统 - 环境切换工具" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    
    if ($DryRun) {
        Write-Warning "🔍 运行模式: 模拟模式 (不会实际修改文件)"
    }
    
    # 检查配置目录
    if (-not (Test-Path $CONFIG_DIR)) {
        Write-Error "❌ 配置目录不存在: $CONFIG_DIR"
        Write-Error "请确保在项目根目录运行此脚本"
        exit 1
    }
    
    # 检查项目目录
    if (-not (Test-Path $DETECTION_API_DIR) -or -not (Test-Path $MAIN_PORTAL_DIR)) {
        Write-Error "❌ 项目目录不完整"
        Write-Error "请确保在项目根目录运行此脚本"
        exit 1
    }
    
    # 应用环境配置
    $success = Set-EnvironmentConfig $env_name
    
    if ($success) {
        if (-not $DryRun) {
            Test-EnvironmentSwitch $env_name
        }
        Show-EnvironmentInfo $env_name
    } else {
        Write-Error "❌ 环境切换失败，请检查配置文件"
        exit 1
    }
}

# 执行主函数
Main
