# 智能多Web应用门户系统 - 统一启动脚本 v1.2.2
# 集成环境管理、依赖检查、健康监控、PM2部署等功能
# 作者: Augment Agent
# 版本: 1.2.2

param(
    # 环境选择
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "development", "prod", "production")]
    [string]$Environment = "development",
    
    # 启动模式
    [Parameter(Mandatory=$false)]
    [ValidateSet("pm2", "dev", "development", "hybrid", "auto")]
    [string]$Mode = "auto",
    
    # 功能开关
    [switch]$SkipDependencyCheck,
    [switch]$SkipHealthCheck,
    [switch]$SkipBuild,
    [switch]$EnableAutoRecovery,
    [switch]$Force,
    [switch]$Quiet,
    [switch]$VerboseOutput,
    [switch]$DryRun,
    
    # 配置参数
    [int]$TimeoutSeconds = 30,
    [int]$BackendPort = 8002,
    [int]$FrontendPort = 3000,
    
    # 高级选项
    [switch]$ShowMenu,
    [switch]$Help
)

# ============================================================================
# 全局配置和常量
# ============================================================================

$SCRIPT_VERSION = "1.2.2"
$SCRIPT_NAME = "智能多Web应用门户系统统一启动器"

# 标准化环境名称
$ENV_NAME = switch ($Environment.ToLower()) {
    { $_ -in @("dev", "development") } { "development" }
    { $_ -in @("prod", "production") } { "production" }
}

# 标准化启动模式
$START_MODE = switch ($Mode.ToLower()) {
    { $_ -in @("dev", "development") } { "development" }
    "pm2" { "pm2" }
    "hybrid" { "hybrid" }
    "auto" { "auto" }
}

# 路径配置
$PROJECT_ROOT = $PSScriptRoot
$BACKEND_DIR = Join-Path $PROJECT_ROOT "detection-api"
$FRONTEND_DIR = Join-Path $PROJECT_ROOT "main-portal"

$LOGS_SCRIPT = Join-Path $PROJECT_ROOT "scripts/diagnostics/logs.ps1"
$API_SCRIPT = Join-Path $PROJECT_ROOT "scripts/management/api.ps1"
$BACKUP_SCRIPT = Join-Path $PROJECT_ROOT "scripts/management/backup.ps1"
$CONFIG_DIR = Join-Path $PROJECT_ROOT "config"

# 健康检查配置
$HEALTH_CHECK_INTERVAL = 3

# ============================================================================
# 日志和输出函数
# ============================================================================

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "DEBUG", "SUCCESS")]
        [string]$Level = "INFO",
        [string]$Component = "MAIN"
    )
    
    if ($Quiet -and $Level -notin @("ERROR", "WARN")) { return }
    if (-not $VerboseOutput -and $Level -eq "DEBUG") { return }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $prefix = "[$timestamp] [$Component] [$Level]"
    
    $color = switch ($Level) {
        "INFO" { "White" }
        "SUCCESS" { "Green" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "DEBUG" { "Cyan" }
        default { "Gray" }
    }
    
    Write-Host "$prefix $Message" -ForegroundColor $color
}

function Write-Success { param($Message, $Component = "MAIN") Write-Log $Message "SUCCESS" $Component }
function Write-Warning { param($Message, $Component = "MAIN") Write-Log $Message "WARN" $Component }
function Write-Error { param($Message, $Component = "MAIN") Write-Log $Message "ERROR" $Component }
function Write-Info { param($Message, $Component = "MAIN") Write-Log $Message "INFO" $Component }
function Write-Debug { param($Message, $Component = "MAIN") Write-Log $Message "DEBUG" $Component }

# ============================================================================
# 帮助和菜单函数
# ============================================================================

function Show-Help {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\start.ps1 [参数]" -ForegroundColor White
    Write-Host ""
    Write-Host "🎯 主要参数:" -ForegroundColor Yellow
    Write-Host "  -Environment <env>    环境选择: dev|development|prod|production (默认: development)" -ForegroundColor White
    Write-Host "  -Mode <mode>          启动模式: pm2|dev|development|hybrid|auto (默认: auto)" -ForegroundColor White
    Write-Host ""
    Write-Host "🔧 功能开关:" -ForegroundColor Yellow
    Write-Host "  -SkipDependencyCheck  跳过依赖检查" -ForegroundColor White
    Write-Host "  -SkipHealthCheck      跳过健康检查" -ForegroundColor White
    Write-Host "  -SkipBuild            跳过构建步骤" -ForegroundColor White
    Write-Host "  -EnableAutoRecovery   启用自动恢复机制" -ForegroundColor White
    Write-Host "  -Force                强制启动（终止现有进程）" -ForegroundColor White
    Write-Host "  -Quiet                静默模式" -ForegroundColor White
    Write-Host "  -VerboseOutput        详细输出" -ForegroundColor White
    Write-Host "  -DryRun               模拟运行（不实际执行）" -ForegroundColor White
    Write-Host ""
    Write-Host "⚙️ 配置参数:" -ForegroundColor Yellow
    Write-Host "  -TimeoutSeconds <n>   健康检查超时时间 (默认: 30)" -ForegroundColor White
    Write-Host "  -BackendPort <port>   后端端口 (默认: 8002)" -ForegroundColor White
    Write-Host "  -FrontendPort <port>  前端端口 (默认: 3000)" -ForegroundColor White
    Write-Host ""
    Write-Host "🎮 交互选项:" -ForegroundColor Yellow
    Write-Host "  -ShowMenu             显示交互式菜单" -ForegroundColor White
    Write-Host "  -Help                 显示此帮助信息" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 使用示例:" -ForegroundColor Yellow
    Write-Host "  .\start.ps1                                    # 自动模式启动开发环境" -ForegroundColor Green
    Write-Host "  .\start.ps1 -Environment production -Mode pm2  # PM2模式启动生产环境" -ForegroundColor Green
    Write-Host "  .\start.ps1 -ShowMenu                          # 显示交互式菜单" -ForegroundColor Green
    Write-Host "  .\start.ps1 -Mode dev -VerboseOutput           # 开发模式详细输出" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔗 向后兼容:" -ForegroundColor Yellow
    Write-Host "  现有脚本仍可独立使用：scripts/startup/ 文件夹中的启动脚本" -ForegroundColor Gray
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Show-InteractiveMenu {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🎮 请选择启动方式:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] 🚀 快速开发启动 (推荐)" -ForegroundColor Green
    Write-Host "      • 开发环境 + 开发模式" -ForegroundColor Gray
    Write-Host "      • 热重载 + 详细日志" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [2] 🏭 生产环境部署" -ForegroundColor Blue
    Write-Host "      • 生产环境 + PM2模式" -ForegroundColor Gray
    Write-Host "      • 集群模式 + 性能优化" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [3] 🔧 自定义配置" -ForegroundColor Magenta
    Write-Host "      • 手动选择环境和模式" -ForegroundColor Gray
    Write-Host "      • 高级选项配置" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [4] 📊 系统状态检查" -ForegroundColor Cyan
    Write-Host "      • 检查依赖和服务状态" -ForegroundColor Gray
    Write-Host "      • 不启动服务" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [5] 📊 监控仪表板" -ForegroundColor Magenta
    Write-Host "      • 实时监控系统状态" -ForegroundColor Gray
    Write-Host "      • PM2进程和资源监控" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [6] 📝 日志管理" -ForegroundColor Green
    Write-Host "      • 查看和搜索日志" -ForegroundColor Gray
    Write-Host "      • 日志统计和清理" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [7] ⚙️ 配置说明" -ForegroundColor Magenta
    Write-Host "      • 查看当前运行时配置入口" -ForegroundColor Gray
    Write-Host "      • 指引系统设置与端口配置位置" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [8] 🔌 API接口管理" -ForegroundColor Blue
    Write-Host "      • API发现和注册" -ForegroundColor Gray
    Write-Host "      • API监控和测试" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [9] 🗄️ 数据备份管理" -ForegroundColor DarkCyan
    Write-Host "      • 数据备份和恢复" -ForegroundColor Gray
    Write-Host "      • 备份验证和清理" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [10] 📖 查看帮助文档" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [0] 🚪 退出" -ForegroundColor Red
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

    $choice = Read-Host "请输入选择 (0-10)"
    
    switch ($choice) {
        "1" {
            Write-Info "选择: 快速开发启动" "MENU"
            return @{ Environment = "development"; Mode = "development"; Interactive = $true }
        }
        "2" {
            Write-Info "选择: 生产环境部署" "MENU"
            return @{ Environment = "production"; Mode = "pm2"; Interactive = $true }
        }
        "3" {
            return Get-CustomConfiguration
        }
        "4" {
            return @{ Environment = "development"; Mode = "check"; Interactive = $true }
        }
        "5" {
            Write-Info "启动监控仪表板..." "MENU"
            Start-MonitorDashboard
            return $null
        }
        "6" {
            Write-Info "启动日志管理..." "MENU"
            Start-LogManagement
            return $null
        }
        "7" {
            Write-Info "查看配置说明..." "MENU"
            Start-ConfigManagement
            return $null
        }
        "8" {
            Write-Info "启动API接口管理..." "MENU"
            Start-ApiManagement
            return $null
        }
        "9" {
            Write-Info "启动数据备份管理..." "MENU"
            Start-BackupManagement
            return $null
        }
        "10" {
            Show-Help
            return $null
        }
        "0" {
            Write-Info "退出启动器" "MENU"
            exit 0
        }
        default {
            Write-Warning "无效选择，请重新选择" "MENU"
            Start-Sleep -Seconds 1
            return Show-InteractiveMenu
        }
    }
}

function Get-CustomConfiguration {
    Write-Host ""
    Write-Host "🔧 自定义配置" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    
    # 环境选择
    Write-Host ""
    Write-Host "📋 选择环境:" -ForegroundColor Yellow
    Write-Host "  [1] 开发环境 (development)" -ForegroundColor Green
    Write-Host "  [2] 生产环境 (production)" -ForegroundColor Blue
    $envChoice = Read-Host "请选择环境 (1-2, 默认: 1)"
    $selectedEnv = if ($envChoice -eq "2") { "production" } else { "development" }
    
    # 模式选择
    Write-Host ""
    Write-Host "🚀 选择启动模式:" -ForegroundColor Yellow
    Write-Host "  [1] 开发模式 (development) - 热重载" -ForegroundColor Green
    Write-Host "  [2] PM2模式 (pm2) - 进程管理" -ForegroundColor Blue
    Write-Host "  [3] 混合模式 (hybrid) - 前端开发+后端PM2" -ForegroundColor Magenta
    Write-Host "  [4] 自动模式 (auto) - 智能选择" -ForegroundColor Cyan
    $modeChoice = Read-Host "请选择模式 (1-4, 默认: 4)"
    $selectedMode = switch ($modeChoice) {
        "1" { "development" }
        "2" { "pm2" }
        "3" { "hybrid" }
        default { "auto" }
    }
    
    Write-Info "配置完成: 环境=$selectedEnv, 模式=$selectedMode" "MENU"
    return @{ Environment = $selectedEnv; Mode = $selectedMode; Interactive = $true }
}

# ============================================================================
# 主函数入口
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-Help
        return
    }

    # 处理交互式菜单
    if ($ShowMenu) {
        $menuResult = Show-InteractiveMenu
        if ($null -eq $menuResult) { return }

        # 更新全局变量
        $script:ENV_NAME = $menuResult.Environment
        $script:START_MODE = $menuResult.Mode

        if ($menuResult.Mode -eq "check") {
            # 只进行系统检查，不启动服务
            Invoke-SystemCheck
            return
        }
    }

    # 显示启动信息
    Show-StartupBanner

    # 继续执行启动流程...
    Write-Info "启动流程开始..." "MAIN"
    Write-Debug "环境: $ENV_NAME, 模式: $START_MODE" "MAIN"

    if ($DryRun) {
        Write-Warning "模拟运行模式 - 不会实际执行操作" "MAIN"
    }

    # 执行启动流程
    $success = Invoke-StartupProcess

    if ($success) {
        Write-Success "🎉 启动完成！" "MAIN"
        Show-StartupSummary
    } else {
        Write-Error "❌ 启动失败" "MAIN"
        Stop-AllServices
        exit 1
    }
}

function Invoke-StartupProcess {
    # 1. 系统检查
    if (-not $SkipDependencyCheck) {
        if (-not (Invoke-SystemCheck)) {
            return $false
        }
    }

    # 2. 环境配置
    if (-not (Set-Environment $ENV_NAME)) {
        return $false
    }

    # 3. 启动服务
    if (-not (Invoke-StartupRouter)) {
        return $false
    }

    # 4. 健康检查
    if (-not $SkipHealthCheck) {
        if (-not (Invoke-HealthCheck)) {
            return $false
        }
    }

    return $true
}

function Show-StartupSummary {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  🎉 启动成功！" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 服务地址:" -ForegroundColor Yellow
    Write-Host "  • 后端API: http://localhost:$BackendPort" -ForegroundColor Cyan
    Write-Host "  • 前端界面: http://localhost:$FrontendPort" -ForegroundColor Magenta
    Write-Host "  • 健康检查: http://localhost:$BackendPort/health" -ForegroundColor Blue
    Write-Host ""
    Write-Host "📊 系统信息:" -ForegroundColor Yellow
    Write-Host "  • 环境: $ENV_NAME" -ForegroundColor Gray
    Write-Host "  • 模式: $START_MODE" -ForegroundColor Gray
    Write-Host "  • 启动时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🔧 管理命令:" -ForegroundColor Yellow
    Write-Host "  • 查看PM2状态: pm2 list" -ForegroundColor White
    Write-Host "  • 查看日志: pm2 logs" -ForegroundColor White
    Write-Host "  • 停止服务: pm2 stop all" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 监控命令:" -ForegroundColor Yellow
    Write-Host "  • 启动监控仪表板: .\monitor.ps1" -ForegroundColor Cyan
    Write-Host "  • 启用自动恢复监控: .\monitor.ps1 -EnableAutoRecovery" -ForegroundColor Cyan
    Write-Host "  • 集成监控: .\start.ps1 -ShowMenu (选择选项5)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 恢复命令:" -ForegroundColor Yellow
    Write-Host "  • 执行健康检查: .\recovery.ps1" -ForegroundColor Green
    Write-Host "  • 执行自动恢复: .\recovery.ps1 -Mode recover" -ForegroundColor Green
    Write-Host "  • 启动恢复守护进程: .\recovery.ps1 -Mode daemon" -ForegroundColor Green
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
}

function Start-LogManagement {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  日志管理系统" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    while ($true) {
        Write-Host "📝 日志管理选项:" -ForegroundColor Yellow
        Write-Host "  [1] 查看最新日志" -ForegroundColor White
        Write-Host "  [2] 搜索日志内容" -ForegroundColor White
        Write-Host "  [3] 查看日志统计" -ForegroundColor White
        Write-Host "  [4] 清理日志文件" -ForegroundColor White
        Write-Host "  [5] 实时监控日志" -ForegroundColor White
        Write-Host "  [6] 归档旧日志" -ForegroundColor White
        Write-Host "  [0] 返回主菜单" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请输入选择 (0-6)"

        switch ($choice) {
            "1" {
                Write-Info "查看最新日志..." "LOG"
                if (Test-Path $LOGS_SCRIPT) {
                    & $LOGS_SCRIPT -Action view -Component all -Level ALL -TimeRange 24h -Lines 50
                } else {
                    Write-Error "日志系统未加载，请检查logs.ps1文件"
                }
                Write-Host ""
                Read-Host "按回车键继续"
            }
            "2" {
                $searchTerm = Read-Host "请输入搜索关键词"
                if ($searchTerm) {
                    Write-Info "搜索日志: $searchTerm" "LOG"
                    if (Test-Path $LOGS_SCRIPT) {
                        & $LOGS_SCRIPT -Action search -SearchTerm $searchTerm -Component all -Level ALL -TimeRange 7d -Lines 100
                    } else {
                        Write-Error "日志系统未加载，请检查logs.ps1文件"
                    }
                } else {
                    Write-Warning "搜索关键词不能为空"
                }
                Write-Host ""
                Read-Host "按回车键继续"
            }
            "3" {
                Write-Info "生成日志统计..." "LOG"
                if (Test-Path $LOGS_SCRIPT) {
                    & $LOGS_SCRIPT -Action stats -Component all -TimeRange 7d
                } else {
                    Write-Error "日志系统未加载，请检查logs.ps1文件"
                }
                Write-Host ""
                Read-Host "按回车键继续"
            }
            "4" {
                Write-Warning "⚠️ 警告：此操作将清理日志文件"
                $confirm = Read-Host "确定要继续吗？将自动归档现有日志 (y/N)"
                if ($confirm -eq "y" -or $confirm -eq "Y") {
                    Write-Info "清理日志文件..." "LOG"
                    if (Test-Path $LOGS_SCRIPT) {
                        & $LOGS_SCRIPT -Action archive -Component all
                    } else {
                        Write-Error "日志系统未加载，请检查logs.ps1文件"
                    }
                } else {
                    Write-Info "操作已取消" "LOG"
                }
                Write-Host ""
                Read-Host "按回车键继续"
            }
            "5" {
                Write-Info "启动实时日志监控（按Ctrl+C退出）..." "LOG"
                if (Test-Path $LOGS_SCRIPT) {
                    & $LOGS_SCRIPT -Action tail -Component all -Level ALL
                } else {
                    Write-Error "日志系统未加载，请检查logs.ps1文件"
                    Read-Host "按回车键继续"
                }
            }
            "6" {
                Write-Info "归档旧日志..." "LOG"
                if (Test-Path $LOGS_SCRIPT) {
                    & $LOGS_SCRIPT -Action archive -Component all
                } else {
                    Write-Error "日志系统未加载，请检查logs.ps1文件"
                }
                Write-Host ""
                Read-Host "按回车键继续"
            }
            "0" {
                return
            }
            default {
                Write-Warning "无效选择，请输入 0-6"
                Start-Sleep -Seconds 1
            }
        }

        Clear-Host
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "  日志管理系统" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
    }
}

function Start-ConfigManagement {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  配置入口说明" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "旧的 PowerShell 配置管理脚本已移除，以避免继续使用损坏的遗留入口。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "当前推荐的配置入口：" -ForegroundColor Cyan
    Write-Host "  1. Web 界面系统设置" -ForegroundColor White
    Write-Host "     路径：系统设置 -> 安全设置 / 路径访问 / 用户管理" -ForegroundColor Gray
    Write-Host "  2. 系统设置主文件" -ForegroundColor White
    Write-Host "     $PROJECT_ROOT\configs\system-config.json" -ForegroundColor Gray
    Write-Host "  3. 端口与门户配置主文件" -ForegroundColor White
    Write-Host "     $PROJECT_ROOT\detection-api\configs\portal-config.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "兼容镜像文件（不建议手工维护）：" -ForegroundColor DarkYellow
    Write-Host "  $PROJECT_ROOT\detection-api\configs\system-config.json" -ForegroundColor DarkGray
    Write-Host "  $PROJECT_ROOT\detection-api\config\system-config.json" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "按回车键返回主菜单"
}

function Start-QuickConfigWizard {
    Start-ConfigManagement
}

function Show-StartupBanner {
    if (-not $Quiet) {
        Clear-Host
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host ""
        Write-Success "🚀 启动系统初始化..."
        Write-Host ""
        Write-Host "📋 配置信息:" -ForegroundColor Blue
        Write-Host "  • 环境: $ENV_NAME" -ForegroundColor Gray
        Write-Host "  • 模式: $START_MODE" -ForegroundColor Gray
        Write-Host "  • 后端端口: $BackendPort" -ForegroundColor Gray
        Write-Host "  • 前端端口: $FrontendPort" -ForegroundColor Gray
        Write-Host "  • 超时时间: $TimeoutSeconds 秒" -ForegroundColor Gray
        Write-Host ""
    }
}

# ============================================================================
# 系统检查和依赖验证
# ============================================================================

function Test-Prerequisites {
    Write-Info "🔍 检查系统先决条件..." "CHECK"
    $issues = @()

    # 检查Node.js
    try {
        $nodeVersion = node --version
        $requiredNodeVersion = "v18.0.0"

        if ([version]($nodeVersion -replace 'v','') -lt [version]($requiredNodeVersion -replace 'v','')) {
            $issues += "Node.js版本需要 >= $requiredNodeVersion，当前版本: $nodeVersion"
        } else {
            Write-Success "✅ Node.js检查通过: $nodeVersion" "CHECK"
        }
    } catch {
        $issues += "Node.js未安装或不在PATH中"
    }

    # 检查npm
    try {
        $npmVersion = npm --version
        Write-Success "✅ npm检查通过: v$npmVersion" "CHECK"
    } catch {
        $issues += "npm未安装或不在PATH中"
    }

    # 检查PM2（如果需要）
    if ($START_MODE -in @("pm2", "hybrid", "auto")) {
        try {
            $pm2Version = pm2 --version
            Write-Success "✅ PM2检查通过: v$pm2Version" "CHECK"
        } catch {
            if ($START_MODE -eq "pm2") {
                $issues += "PM2未安装，生产模式需要PM2"
            } else {
                Write-Warning "⚠️ PM2未安装，将使用开发模式" "CHECK"
                $script:START_MODE = "development"
            }
        }
    }

    # 检查项目结构
    $requiredDirs = @($BACKEND_DIR, $FRONTEND_DIR, $CONFIG_DIR)
    foreach ($dir in $requiredDirs) {
        if (-not (Test-Path $dir)) {
            $issues += "缺少必要目录: $dir"
        }
    }

    # 检查关键文件
    $requiredFiles = @(
        (Join-Path $BACKEND_DIR "package.json"),
        (Join-Path $FRONTEND_DIR "package.json")
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $issues += "缺少必要文件: $file"
        }
    }

    if ($issues.Count -gt 0) {
        Write-Error "❌ 系统检查失败:" "CHECK"
        foreach ($issue in $issues) {
            Write-Error "  • $issue" "CHECK"
        }
        return $false
    }

    Write-Success "✅ 所有先决条件检查通过" "CHECK"
    return $true
}

function Test-PortAvailability {
    param([int]$Port, [string]$Service)

    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -WarningAction SilentlyContinue
        if ($connection.TcpTestSucceeded) {
            Write-Warning "⚠️ 端口 $Port 已被占用 ($Service)" "PORT"

            if ($Force) {
                Write-Info "🔄 强制模式：尝试释放端口 $Port" "PORT"
                Stop-ProcessOnPort $Port
                return $true
            } else {
                Write-Error "❌ 端口 $Port 被占用，使用 -Force 参数强制启动" "PORT"
                return $false
            }
        } else {
            Write-Success "✅ 端口 $Port 可用 ($Service)" "PORT"
            return $true
        }
    } catch {
        Write-Debug "端口检查异常: $($_.Exception.Message)" "PORT"
        return $true  # 假设可用
    }
}

function Stop-ProcessOnPort {
    param([int]$Port)

    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty OwningProcess |
                    Sort-Object -Unique

        foreach ($processId in $processes) {
            if ($processId -and $processId -ne 0) {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Warning "🔄 终止进程: $($process.ProcessName) (PID: $processId)" "PORT"
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                }
            }
        }
    } catch {
        Write-Debug "终止端口进程时出错: $($_.Exception.Message)" "PORT"
    }
}

# ============================================================================
# 环境和配置管理
# ============================================================================

function Set-Environment {
    param([string]$TargetEnvironment)

    Write-Info "🔄 配置环境: $TargetEnvironment" "ENV"

    if ($DryRun) {
        Write-Info "🔍 [模拟] 环境切换到: $TargetEnvironment" "ENV"
        return $true
    }

    # 调用环境切换脚本
    $switchEnvScript = Join-Path $PROJECT_ROOT "scripts/startup/switch-env.ps1"
    if (Test-Path $switchEnvScript) {
        try {
            & $switchEnvScript -Environment $TargetEnvironment -VerboseOutput:$VerboseOutput
            Write-Success "✅ 环境配置完成: $TargetEnvironment" "ENV"
            return $true
        } catch {
            Write-Error "❌ 环境配置失败: $($_.Exception.Message)" "ENV"
            return $false
        }
    } else {
        Write-Warning "⚠️ 环境切换脚本不存在，跳过环境配置" "ENV"
        return $true
    }
}

# ============================================================================
# 启动模式路由
# ============================================================================

function Invoke-StartupRouter {
    Write-Info "🚀 启动模式路由: $START_MODE" "ROUTER"

    # 智能模式选择
    if ($START_MODE -eq "auto") {
        $START_MODE = Get-OptimalStartMode
        Write-Info "🤖 自动选择启动模式: $START_MODE" "ROUTER"
    }

    switch ($START_MODE) {
        "development" {
            return Start-DevelopmentMode
        }
        "pm2" {
            return Start-PM2Mode
        }
        "hybrid" {
            return Start-HybridMode
        }
        default {
            Write-Error "❌ 未知启动模式: $START_MODE" "ROUTER"
            return $false
        }
    }
}

function Get-OptimalStartMode {
    # 智能选择最佳启动模式
    if ($ENV_NAME -eq "production") {
        return "pm2"
    } elseif (Get-Command "pm2" -ErrorAction SilentlyContinue) {
        return "hybrid"  # 开发环境但有PM2，使用混合模式
    } else {
        return "development"
    }
}

function Start-DevelopmentMode {
    Write-Info "🚀 启动开发模式..." "DEV"

    if ($DryRun) {
        Write-Info "🔍 [模拟] 开发模式启动" "DEV"
        return $true
    }

    # 调用现有的开发启动脚本
    $devScript = Join-Path $PROJECT_ROOT "scripts/startup/start-dev.ps1"
    if (Test-Path $devScript) {
        Write-Info "📡 使用现有开发启动脚本" "DEV"
        & $devScript
        return $true
    } else {
        # 直接启动开发服务
        return Start-DevelopmentServices
    }
}

function Start-PM2Mode {
    Write-Info "🏭 启动PM2模式..." "PM2"

    if ($DryRun) {
        Write-Info "🔍 [模拟] PM2模式启动" "PM2"
        return $true
    }

    # 调用现有的PM2部署脚本
    $pm2Script = Join-Path $PROJECT_ROOT "scripts/startup/deploy-pm2.ps1"
    if (Test-Path $pm2Script) {
        Write-Info "⚙️ 使用现有PM2部署脚本" "PM2"
        & $pm2Script -Environment $ENV_NAME
        return $true
    } else {
        # 直接启动PM2服务
        return Start-PM2Services
    }
}

function Start-HybridMode {
    Write-Info "🔀 启动混合模式..." "HYBRID"

    if ($DryRun) {
        Write-Info "🔍 [模拟] 混合模式启动" "HYBRID"
        return $true
    }

    # 后端使用PM2，前端使用开发模式
    Write-Info "📡 启动后端PM2服务..." "HYBRID"
    $backendResult = Start-PM2Services

    if ($backendResult) {
        Write-Info "🎨 启动前端开发服务..." "HYBRID"
        Start-FrontendDevelopment
    }

    return $backendResult
}

function Invoke-SystemCheck {
    Write-Info "🔍 开始系统检查..." "CHECK"

    $checkResult = Test-Prerequisites
    if (-not $checkResult) {
        return $false
    }

    # 检查端口可用性
    $portCheckResult = $true
    $portCheckResult = $portCheckResult -and (Test-PortAvailability $BackendPort "后端服务")
    $portCheckResult = $portCheckResult -and (Test-PortAvailability $FrontendPort "前端服务")

    if (-not $portCheckResult) {
        return $false
    }

    Write-Success "✅ 系统检查完成" "CHECK"
    return $true
}

# ============================================================================
# 具体服务启动函数
# ============================================================================

function Start-DevelopmentServices {
    Write-Info "🚀 直接启动开发服务..." "DEV"

    # 启动后端开发服务
    Write-Info "📡 启动后端开发服务..." "DEV"
    $null = Start-Job -ScriptBlock {
        param($BackendDir)
        Set-Location $BackendDir
        npm run dev
    } -ArgumentList $BACKEND_DIR

    Start-Sleep -Seconds 3

    # 启动前端开发服务
    Write-Info "🎨 启动前端开发服务..." "DEV"
    $null = Start-Job -ScriptBlock {
        param($FrontendDir)
        Set-Location $FrontendDir
        npm run dev
    } -ArgumentList $FRONTEND_DIR

    Write-Success "✅ 开发服务启动完成" "DEV"
    return $true
}

function Start-PM2Services {
    Write-Info "🏭 启动PM2服务..." "PM2"

    try {
        # 构建项目（如果需要）
        if (-not $SkipBuild) {
            Write-Info "🔨 构建后端项目..." "PM2"
            Set-Location $BACKEND_DIR
            npm run build
            Set-Location $PROJECT_ROOT
        }

        # 启动PM2服务
        Write-Info "⚙️ 启动PM2进程..." "PM2"
        pm2 start ecosystem.config.js --env $ENV_NAME

        Write-Success "✅ PM2服务启动完成" "PM2"
        return $true
    } catch {
        Write-Error "❌ PM2服务启动失败: $($_.Exception.Message)" "PM2"
        return $false
    }
}

function Start-FrontendDevelopment {
    Write-Info "🎨 启动前端开发服务..." "FRONTEND"

    $null = Start-Job -ScriptBlock {
        param($FrontendDir)
        Set-Location $FrontendDir
        npm run dev
    } -ArgumentList $FRONTEND_DIR

    Write-Success "✅ 前端开发服务启动完成" "FRONTEND"
    return $true
}

# ============================================================================
# 健康检查模块
# ============================================================================

function Invoke-HealthCheck {
    Write-Info "💚 开始健康检查..." "HEALTH"

    $startTime = Get-Date
    $isHealthy = $false

    Write-Info "⏳ 等待服务启动..." "HEALTH"

    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Seconds $HEALTH_CHECK_INTERVAL

        if (Test-ServiceHealth) {
            $isHealthy = $true
            break
        }

        Write-Debug "等待服务响应..." "HEALTH"
    }

    if ($isHealthy) {
        Write-Success "✅ 健康检查通过" "HEALTH"
        return $true
    } else {
        Write-Error "❌ 健康检查超时" "HEALTH"
        return $false
    }
}

function Test-ServiceHealth {
    try {
        # 检查后端健康状态
        $response = Invoke-RestMethod -Uri "http://localhost:$BackendPort/health" -Method Get -TimeoutSec 5
        if ($response.status -eq "healthy") {
            Write-Success "✅ 后端服务健康" "HEALTH"
            return $true
        }
    } catch {
        Write-Debug "后端健康检查失败: $($_.Exception.Message)" "HEALTH"
    }

    return $false
}

function Test-FrontendHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -Method Get -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "✅ 前端服务健康" "HEALTH"
            return $true
        }
    } catch {
        Write-Debug "前端健康检查失败: $($_.Exception.Message)" "HEALTH"
    }

    return $false
}

# ============================================================================
# 错误处理和清理
# ============================================================================

function Stop-AllServices {
    Write-Info "🛑 停止所有服务..." "CLEANUP"

    try {
        # 停止PM2服务
        pm2 stop all 2>$null
        pm2 delete all 2>$null

        # 停止开发服务作业
        Get-Job | Stop-Job
        Get-Job | Remove-Job

        Write-Success "✅ 服务清理完成" "CLEANUP"
    } catch {
        Write-Warning "⚠️ 清理过程中出现问题: $($_.Exception.Message)" "CLEANUP"
    }
}

# ============================================================================
# 备份管理功能
# ============================================================================

function Start-BackupManagement {
    while ($true) {
        Clear-Host
        Write-Host ""
        Write-Host "🗄️ 数据备份管理系统" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 可用操作:" -ForegroundColor Yellow
        Write-Host "  [1] 🗄️ 创建备份" -ForegroundColor Cyan
        Write-Host "  [2] 🔄 恢复数据" -ForegroundColor Cyan
        Write-Host "  [3] ✅ 验证备份" -ForegroundColor Cyan
        Write-Host "  [4] 📋 查看备份列表" -ForegroundColor Cyan
        Write-Host "  [5] 📊 系统状态" -ForegroundColor Cyan
        Write-Host "  [6] ⏰ 调度配置" -ForegroundColor Cyan
        Write-Host "  [7] 🧹 清理过期备份" -ForegroundColor Cyan
        Write-Host "  [8] 🎨 交互式管理" -ForegroundColor Cyan
        Write-Host "  [0] 🔙 返回主菜单" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请选择操作 (0-8)"

        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "🗄️ 创建备份" -ForegroundColor Yellow
                Write-Host "备份类型: 1=完整备份, 2=配置备份, 3=日志备份, 4=API备份"
                $typeChoice = Read-Host "请选择备份类型 (1-4)"

                $backupType = switch ($typeChoice) {
                    "1" { "full" }
                    "2" { "config" }
                    "3" { "logs" }
                    "4" { "api" }
                    default { "full" }
                }

                $backupName = Read-Host "备份名称 (可选，留空自动生成)"
                $compress = (Read-Host "是否压缩? (Y/n)") -ne "n"

                Write-Host "正在创建备份..." -ForegroundColor Yellow

                # 调用备份脚本
                $backupArgs = @("-Action", "backup", "-BackupType", $backupType)
                if (-not [string]::IsNullOrEmpty($backupName)) {
                    $backupArgs += @("-BackupName", $backupName)
                }
                if ($compress) {
                    $backupArgs += "-Compress"
                }

                & $BACKUP_SCRIPT @backupArgs

                Read-Host "按回车键继续"
            }
            "2" {
                Write-Host ""
                Write-Host "🔄 恢复数据" -ForegroundColor Yellow

                # 显示备份列表
                & $BACKUP_SCRIPT -Action list

                $restoreFrom = Read-Host "请输入要恢复的备份名称"

                if (-not [string]::IsNullOrEmpty($restoreFrom)) {
                    Write-Host "正在恢复数据..." -ForegroundColor Yellow
                    & $BACKUP_SCRIPT -Action restore -RestoreFrom $restoreFrom
                }
                Read-Host "按回车键继续"
            }
            "3" {
                Write-Host ""
                Write-Host "✅ 验证备份" -ForegroundColor Yellow

                # 显示备份列表
                & $BACKUP_SCRIPT -Action list

                $verifyBackup = Read-Host "请输入要验证的备份名称"

                if (-not [string]::IsNullOrEmpty($verifyBackup)) {
                    Write-Host "正在验证备份..." -ForegroundColor Yellow
                    & $BACKUP_SCRIPT -Action verify -RestoreFrom $verifyBackup
                }
                Read-Host "按回车键继续"
            }
            "4" {
                & $BACKUP_SCRIPT -Action list
                Read-Host "按回车键继续"
            }
            "5" {
                & $BACKUP_SCRIPT -Action status
                Read-Host "按回车键继续"
            }
            "6" {
                & $BACKUP_SCRIPT -Action schedule
                Read-Host "按回车键继续"
            }
            "7" {
                Write-Host ""
                Write-Host "🧹 清理过期备份" -ForegroundColor Yellow
                $confirm = Read-Host "确认清理过期备份? (y/N)"

                if ($confirm -eq "y") {
                    & $BACKUP_SCRIPT -Action clean
                }
                Read-Host "按回车键继续"
            }
            "8" {
                & $BACKUP_SCRIPT -Action interactive
            }
            "0" {
                Write-Host ""
                Write-Host "🔙 返回主菜单..." -ForegroundColor Green
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

# ============================================================================
# 监控仪表板集成
# ============================================================================

function Start-MonitorDashboard {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  增强监控仪表板管理" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host ""

    Write-Host "📊 可用监控选项:" -ForegroundColor Yellow
    Write-Host "  [1] 🔍 基础监控仪表板" -ForegroundColor Cyan
    Write-Host "      • 传统PM2和系统资源监控" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [2] 🚀 增强监控仪表板" -ForegroundColor Green
    Write-Host "      • 智能告警和健康评分" -ForegroundColor Gray
    Write-Host "      • 趋势分析和API监控" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [3] 📋 生成监控报告" -ForegroundColor Blue
    Write-Host "      • 系统状态和性能报告" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [0] 🔙 返回主菜单" -ForegroundColor Red
    Write-Host ""

    $choice = Read-Host "请选择监控选项 (0-3)"

    switch ($choice) {
        "1" {
            Start-BasicMonitorDashboard
        }
        "2" {
            Start-EnhancedMonitorDashboard
        }
        "3" {
            New-MonitoringReport
        }
        "0" {
            return
        }
        default {
            Write-Host "无效选择，请重试。" -ForegroundColor Red
            Start-Sleep 2
            Start-MonitorDashboard
        }
    }
}

function Start-BasicMonitorDashboard {
    Write-Info "🚀 启动基础监控仪表板..." "MONITOR"

    # 检查monitor.ps1是否存在
    $monitorScript = Join-Path $PROJECT_ROOT "scripts/monitoring/monitor.ps1"
    if (-not (Test-Path $monitorScript)) {
        Write-Error "❌ 监控脚本不存在: $monitorScript" "MONITOR"
        Write-Host "请确保monitor.ps1文件在项目根目录中。" -ForegroundColor Yellow
        Write-Host "按任意键返回..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    try {
        # 启动监控脚本
        Write-Info "📊 正在启动实时监控..." "MONITOR"
        $monitorParams = @{
            BackendPort = $BackendPort
            FrontendPort = $FrontendPort
        }

        if ($EnableAutoRecovery) {
            $monitorParams.EnableAutoRecovery = $true
            Write-Info "🔧 自动恢复功能已启用" "MONITOR"
        }

        & $monitorScript @monitorParams
    } catch {
        Write-Error "❌ 监控仪表板启动失败: $($_.Exception.Message)" "MONITOR"
        Write-Host "按任意键返回..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

function Start-EnhancedMonitorDashboard {
    Write-Info "🚀 启动增强监控仪表板..." "MONITOR"

    # 检查monitor-enhanced.ps1是否存在
    $enhancedMonitorScript = Join-Path $PROJECT_ROOT "scripts/monitoring/monitor-enhanced.ps1"
    if (-not (Test-Path $enhancedMonitorScript)) {
        Write-Error "❌ 增强监控脚本不存在: $enhancedMonitorScript" "MONITOR"
        Write-Host "正在使用基础监控脚本..." -ForegroundColor Yellow
        Start-BasicMonitorDashboard
        return
    }

    try {
        # 启动增强监控脚本
        Write-Info "📊 正在启动增强实时监控..." "MONITOR"
        $monitorParams = @{
            BackendPort = $BackendPort
            FrontendPort = $FrontendPort
            EnableAlerts = $true
            EnableTrendAnalysis = $true
        }

        if ($EnableAutoRecovery) {
            $monitorParams.EnableAutoRecovery = $true
            Write-Info "🔧 自动恢复功能已启用" "MONITOR"
        }

        & $enhancedMonitorScript @monitorParams
    } catch {
        Write-Error "❌ 增强监控仪表板启动失败: $($_.Exception.Message)" "MONITOR"
        Write-Host "尝试使用基础监控..." -ForegroundColor Yellow
        Start-BasicMonitorDashboard
    }
}

function New-MonitoringReport {
    Write-Info "📋 生成监控报告..." "MONITOR"

    # 检查增强监控脚本是否存在
    $enhancedMonitorScript = Join-Path $PROJECT_ROOT "scripts/monitoring/monitor-enhanced.ps1"
    if (-not (Test-Path $enhancedMonitorScript)) {
        Write-Error "❌ 增强监控脚本不存在，无法生成详细报告" "MONITOR"
        Write-Host "按任意键返回..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    try {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $reportPath = Join-Path $PROJECT_ROOT "monitoring\reports\monitor-report-$timestamp.txt"

        Write-Info "📊 正在收集监控数据..." "MONITOR"
        & $enhancedMonitorScript -GenerateReport -ReportPath $reportPath

        if (Test-Path $reportPath) {
            Write-Host "✅ 监控报告已生成: $reportPath" -ForegroundColor Green
            Write-Host "是否要查看报告内容？(Y/N): " -NoNewline -ForegroundColor Yellow
            $viewReport = Read-Host

            if ($viewReport -eq "Y" -or $viewReport -eq "y") {
                Get-Content $reportPath | Write-Host
            }
        } else {
            Write-Error "❌ 报告生成失败" "MONITOR"
        }
    } catch {
        Write-Error "❌ 监控报告生成失败: $($_.Exception.Message)" "MONITOR"
    }

    Write-Host ""
    Read-Host "按回车键继续"
}

function Start-ApiManagement {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "  API接口管理系统" -ForegroundColor Blue
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host ""

    # 检查API管理脚本是否可用
    if (-not (Test-Path $API_SCRIPT)) {
        Write-Host "❌ API管理系统未加载，请检查api.ps1文件" -ForegroundColor Red
        Read-Host "按回车键返回主菜单"
        return
    }

    while ($true) {
        Write-Host "🔌 API管理选项:" -ForegroundColor Yellow
        Write-Host "  [1] 交互式API管理" -ForegroundColor White
        Write-Host "  [2] 自动发现API" -ForegroundColor White
        Write-Host "  [3] API健康检查" -ForegroundColor White
        Write-Host "  [4] API监控报告" -ForegroundColor White
        Write-Host "  [5] API统计分析" -ForegroundColor White
        Write-Host "  [6] 生成API文档" -ForegroundColor White
        Write-Host "  [0] 返回主菜单" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请输入选择 (0-6)"

        switch ($choice) {
            "1" {
                Write-Info "启动交互式API管理..." "API"
                & $API_SCRIPT -Action interactive
            }
            "2" {
                Write-Info "开始API自动发现..." "API"
                & $API_SCRIPT -Action discover
                Read-Host "按回车键继续"
            }
            "3" {
                Write-Info "执行API健康检查..." "API"
                & $API_SCRIPT -Action health
                Read-Host "按回车键继续"
            }
            "4" {
                Write-Info "执行API监控..." "API"
                & $API_SCRIPT -Action monitor
                Read-Host "按回车键继续"
            }
            "5" {
                Write-Info "显示API统计..." "API"
                & $API_SCRIPT -Action stats
                Read-Host "按回车键继续"
            }
            "6" {
                Write-Info "生成API文档..." "API"
                & $API_SCRIPT -Action docs
                Read-Host "按回车键继续"
            }
            "0" {
                Write-Info "返回主菜单..." "API"
                break
            }
            default {
                Write-Host "❌ 无效选择，请重试" -ForegroundColor Red
                Start-Sleep -Seconds 2
            }
        }

        Clear-Host
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
        Write-Host "  API接口管理系统" -ForegroundColor Blue
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
        Write-Host ""
    }
}

function Add-MonitorOption {
    param([string]$Message)

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  $Message" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 监控选项:" -ForegroundColor Yellow
    Write-Host "  • 启动监控仪表板: .\scripts\monitoring\monitor.ps1" -ForegroundColor Cyan
    Write-Host "  • 集成监控启动: .\start.ps1 -ShowMenu 选择选项5" -ForegroundColor Cyan
    Write-Host ""
}

# 执行主函数
Main

