# 智能多Web应用门户系统 - 增强启动脚本
# 包含健康检查、错误处理和监控功能

param(
    [switch]$NoHealthCheck,
    [switch]$SkipBuild,
    [switch]$Force,
    [int]$TimeoutSeconds = 30,
    [string]$Environment = "development"
)

# 配置变量
$BACKEND_PORT = 8002
$FRONTEND_PORT = 3000
$HEALTH_CHECK_INTERVAL = 3
$MAX_RETRIES = 3

# 日志函数
function Write-Log {
    param($Message, $Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "INFO" { "Green" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "DEBUG" { "Cyan" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Write-Success { param($Message) Write-Log $Message "INFO" }
function Write-Warning { param($Message) Write-Log $Message "WARN" }
function Write-Error { param($Message) Write-Log $Message "ERROR" }
function Write-Debug { param($Message) Write-Log $Message "DEBUG" }

# 显示启动信息
function Show-StartupInfo {
    Clear-Host
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  智能多Web应用门户系统 v1.1.0" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Success "🚀 启动增强版开发环境..."
    Write-Host ""
    Write-Host "配置信息:" -ForegroundColor Blue
    Write-Host "  • 后端端口: $BACKEND_PORT" -ForegroundColor Gray
    Write-Host "  • 前端端口: $FRONTEND_PORT" -ForegroundColor Gray
    Write-Host "  • 环境模式: $Environment" -ForegroundColor Gray
    Write-Host "  • 超时时间: $TimeoutSeconds 秒" -ForegroundColor Gray
    Write-Host ""
}

# 检查先决条件
function Test-Prerequisites {
    Write-Success "🔍 检查系统先决条件..."
    
    # 检查Node.js
    try {
        $nodeVersion = node --version
        Write-Debug "Node.js 版本: $nodeVersion"
        
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($majorVersion -lt 18) {
            throw "Node.js 版本过低，需要 18+，当前版本: $nodeVersion"
        }
        Write-Success "✅ Node.js 检查通过"
    } catch {
        Write-Error "❌ Node.js 检查失败: $_"
        return $false
    }
    
    # 检查npm
    try {
        $npmVersion = npm --version
        Write-Debug "npm 版本: $npmVersion"
        Write-Success "✅ npm 检查通过"
    } catch {
        Write-Error "❌ npm 检查失败: $_"
        return $false
    }
    
    # 检查端口占用
    $portsToCheck = @($BACKEND_PORT, $FRONTEND_PORT)
    foreach ($port in $portsToCheck) {
        $isInUse = Test-PortInUse -Port $port
        if ($isInUse -and -not $Force) {
            Write-Error "❌ 端口 $port 已被占用，使用 -Force 参数强制启动"
            return $false
        } elseif ($isInUse) {
            Write-Warning "⚠️ 端口 $port 已被占用，将尝试终止现有进程"
            Stop-ProcessOnPort -Port $port
        } else {
            Write-Debug "端口 $port 可用"
        }
    }
    
    Write-Success "✅ 所有先决条件检查通过"
    return $true
}

# 检查端口是否被占用
function Test-PortInUse {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        return $connection -ne $null
    } catch {
        return $false
    }
}

# 停止占用端口的进程
function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Warning "🔄 终止进程: $($process.ProcessName) (PID: $($process.Id))"
                Stop-Process -Id $process.Id -Force
                Start-Sleep -Seconds 2
            }
        }
    } catch {
        Write-Error "终止端口 $Port 上的进程失败: $_"
    }
}

# 检查项目结构
function Test-ProjectStructure {
    Write-Success "📁 检查项目结构..."
    
    $requiredDirs = @("detection-api", "main-portal")
    $missingDirs = @()
    
    foreach ($dir in $requiredDirs) {
        if (-not (Test-Path $dir)) {
            $missingDirs += $dir
        } else {
            Write-Debug "目录存在: $dir"
        }
    }
    
    if ($missingDirs.Count -gt 0) {
        Write-Error "❌ 缺少必要目录: $($missingDirs -join ', ')"
        return $false
    }
    
    # 检查package.json文件
    $packageFiles = @("detection-api/package.json", "main-portal/package.json")
    foreach ($file in $packageFiles) {
        if (-not (Test-Path $file)) {
            Write-Error "❌ 缺少文件: $file"
            return $false
        } else {
            Write-Debug "文件存在: $file"
        }
    }
    
    Write-Success "✅ 项目结构检查通过"
    return $true
}

# 安装依赖
function Install-Dependencies {
    Write-Success "📦 检查并安装依赖..."
    
    # 检查后端依赖
    if (-not (Test-Path "detection-api/node_modules") -or -not $SkipBuild) {
        Write-Success "📡 安装后端依赖..."
        Set-Location "detection-api"
        & npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "❌ 后端依赖安装失败"
            Set-Location ".."
            return $false
        }
        Set-Location ".."
        Write-Success "✅ 后端依赖安装完成"
    } else {
        Write-Debug "跳过后端依赖安装"
    }
    
    # 检查前端依赖
    if (-not (Test-Path "main-portal/node_modules") -or -not $SkipBuild) {
        Write-Success "🎨 安装前端依赖..."
        Set-Location "main-portal"
        & npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "❌ 前端依赖安装失败"
            Set-Location ".."
            return $false
        }
        Set-Location ".."
        Write-Success "✅ 前端依赖安装完成"
    } else {
        Write-Debug "跳过前端依赖安装"
    }
    
    return $true
}

# 构建后端
function Build-Backend {
    if ($SkipBuild) {
        Write-Debug "跳过后端构建"
        return $true
    }
    
    Write-Success "🔧 构建后端服务..."
    Set-Location "detection-api"
    
    # 检查是否需要构建
    if ((Test-Path "dist") -and (Get-ChildItem "dist" -Recurse).Count -gt 0) {
        Write-Debug "dist目录已存在，跳过构建"
        Set-Location ".."
        return $true
    }
    
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ 后端构建失败"
        Set-Location ".."
        return $false
    }
    
    Set-Location ".."
    Write-Success "✅ 后端构建完成"
    return $true
}

# 启动后端服务
function Start-Backend {
    Write-Success "📡 启动后端服务..."
    
    Set-Location "detection-api"
    
    # 启动后端服务（后台运行）
    $backendJob = Start-Job -ScriptBlock {
        param($WorkingDir)
        Set-Location $WorkingDir
        & npm run dev
    } -ArgumentList (Get-Location).Path
    
    Set-Location ".."
    
    # 等待后端启动
    $startTime = Get-Date
    $isHealthy = $false
    
    Write-Success "⏳ 等待后端服务启动..."
    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Seconds $HEALTH_CHECK_INTERVAL
        
        if (Test-BackendHealth) {
            $isHealthy = $true
            break
        }
        
        Write-Debug "等待后端服务响应..."
    }
    
    if (-not $isHealthy) {
        Write-Error "❌ 后端服务启动超时"
        Stop-Job $backendJob -PassThru | Remove-Job
        return $false
    }
    
    Write-Success "✅ 后端服务启动成功"
    return $backendJob
}

# 启动前端服务
function Start-Frontend {
    Write-Success "🎨 启动前端服务..."
    
    Set-Location "main-portal"
    
    # 启动前端服务（后台运行）
    $frontendJob = Start-Job -ScriptBlock {
        param($WorkingDir)
        Set-Location $WorkingDir
        & npm run dev
    } -ArgumentList (Get-Location).Path
    
    Set-Location ".."
    
    # 等待前端启动
    $startTime = Get-Date
    $isHealthy = $false
    
    Write-Success "⏳ 等待前端服务启动..."
    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Seconds $HEALTH_CHECK_INTERVAL
        
        if (Test-FrontendHealth) {
            $isHealthy = $true
            break
        }
        
        Write-Debug "等待前端服务响应..."
    }
    
    if (-not $isHealthy) {
        Write-Error "❌ 前端服务启动超时"
        Stop-Job $frontendJob -PassThru | Remove-Job
        return $false
    }
    
    Write-Success "✅ 前端服务启动成功"
    return $frontendJob
}

# 后端健康检查
function Test-BackendHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$BACKEND_PORT/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
        return $response.status -eq "ok"
    } catch {
        return $false
    }
}

# 前端健康检查
function Test-FrontendHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$FRONTEND_PORT" -TimeoutSec 5 -ErrorAction SilentlyContinue
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# 执行完整的健康检查
function Test-SystemHealth {
    Write-Success "🏥 执行系统健康检查..."
    
    $results = @{
        Backend = Test-BackendHealth
        Frontend = Test-FrontendHealth
        Database = Test-DatabaseHealth
        Ports = Test-PortsHealth
    }
    
    $allHealthy = $true
    foreach ($service in $results.Keys) {
        if ($results[$service]) {
            Write-Success "✅ $service 健康检查通过"
        } else {
            Write-Error "❌ $service 健康检查失败"
            $allHealthy = $false
        }
    }
    
    return $allHealthy
}

# 数据库健康检查
function Test-DatabaseHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$BACKEND_PORT/api/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
        return $response.success -eq $true
    } catch {
        return $false
    }
}

# 端口健康检查
function Test-PortsHealth {
    $backendOk = Test-PortInUse -Port $BACKEND_PORT
    $frontendOk = Test-PortInUse -Port $FRONTEND_PORT
    return $backendOk -and $frontendOk
}

# 显示启动成功信息
function Show-SuccessInfo {
    param($BackendJob, $FrontendJob)
    
    Write-Host ""
    Write-Host "🎉 系统启动成功！" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🌐 访问地址:" -ForegroundColor Blue
    Write-Host "  • 前端门户: http://localhost:$FRONTEND_PORT" -ForegroundColor White
    Write-Host "  • 后端API V2:  http://localhost:$BACKEND_PORT/api/v2" -ForegroundColor White
    Write-Host "  • 健康检查: http://localhost:$BACKEND_PORT/health" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 服务状态:" -ForegroundColor Blue
    Write-Host "  • 后端服务: 运行中 (PID: $($BackendJob.Id))" -ForegroundColor Green
    Write-Host "  • 前端服务: 运行中 (PID: $($FrontendJob.Id))" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 使用提示:" -ForegroundColor Yellow
    Write-Host "  • 按 Ctrl+C 停止所有服务" -ForegroundColor Gray
    Write-Host "  • 使用 Get-Job 查看后台任务" -ForegroundColor Gray
    Write-Host "  • 日志输出在各自的终端窗口中" -ForegroundColor Gray
    Write-Host ""
}

# 清理资源
function Stop-AllServices {
    param($BackendJob, $FrontendJob)
    
    Write-Warning "🛑 正在停止所有服务..."
    
    if ($BackendJob) {
        Stop-Job $BackendJob -PassThru | Remove-Job
        Write-Success "✅ 后端服务已停止"
    }
    
    if ($FrontendJob) {
        Stop-Job $FrontendJob -PassThru | Remove-Job
        Write-Success "✅ 前端服务已停止"
    }
    
    # 清理可能残留的进程
    Stop-ProcessOnPort -Port $BACKEND_PORT
    Stop-ProcessOnPort -Port $FRONTEND_PORT
    
    Write-Success "✅ 所有服务已清理"
}

# 主函数
function Main {
    $ErrorActionPreference = "Stop"
    
    try {
        # 显示启动信息
        Show-StartupInfo
        
        # 检查先决条件
        if (-not (Test-Prerequisites)) {
            exit 1
        }
        
        # 检查项目结构
        if (-not (Test-ProjectStructure)) {
            exit 1
        }
        
        # 安装依赖
        if (-not (Install-Dependencies)) {
            exit 1
        }
        
        # 构建后端
        if (-not (Build-Backend)) {
            exit 1
        }
        
        # 启动后端服务
        $backendJob = Start-Backend
        if (-not $backendJob) {
            exit 1
        }
        
        # 启动前端服务
        $frontendJob = Start-Frontend
        if (-not $frontendJob) {
            Stop-AllServices -BackendJob $backendJob
            exit 1
        }
        
        # 健康检查
        if (-not $NoHealthCheck) {
            if (-not (Test-SystemHealth)) {
                Write-Warning "⚠️ 部分健康检查失败，但服务已启动"
            }
        }
        
        # 显示成功信息
        Show-SuccessInfo -BackendJob $backendJob -FrontendJob $frontendJob
        
        # 等待用户输入停止
        Write-Host "按任意键停止所有服务..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        
        # 清理资源
        Stop-AllServices -BackendJob $backendJob -FrontendJob $frontendJob
        
    } catch {
        Write-Error "❌ 启动过程中发生错误: $_"
        Write-Error $_.ScriptStackTrace
        exit 1
    }
}

# 执行主函数
Main