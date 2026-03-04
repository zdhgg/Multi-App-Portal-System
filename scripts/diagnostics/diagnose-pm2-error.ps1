#!/usr/bin/env pwsh
<#
.SYNOPSIS
    PM2 进程错误快速诊断工具

.DESCRIPTION
    自动诊断PM2进程启动失败的原因，并提供修复建议

.PARAMETER ProcessName
    要诊断的PM2进程名称

.PARAMETER AppPath
    应用的实际路径（可选）

.EXAMPLE
    .\diagnose-pm2-error.ps1 -ProcessName "teaching-inspection-systemv1.3"

.EXAMPLE
    .\diagnose-pm2-error.ps1 -ProcessName "teaching-inspection-systemv1.3" -AppPath "D:\Apps\teaching-app"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ProcessName = "teaching-inspection-systemv1.3",
    
    [Parameter(Mandatory=$false)]
    [string]$AppPath = ""
)

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 分隔线
function Write-Separator {
    Write-Host ("=" * 80) -ForegroundColor Gray
}

# 标题
function Write-Title {
    param([string]$Title)
    Write-Separator
    Write-ColorOutput "  $Title" "Cyan"
    Write-Separator
}

# 清屏并显示标题
Clear-Host
Write-ColorOutput @"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║         PM2 进程错误诊断工具 v1.0                                 ║
║         Intelligent Multi-App Portal System                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
"@ "Cyan"

Write-Host ""
Write-ColorOutput "🔍 开始诊断进程: $ProcessName" "Yellow"
Write-Host ""

# 步骤1: 检查PM2是否安装
Write-Title "步骤 1: 检查PM2环境"

try {
    $pm2Version = pm2 --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✅ PM2 已安装 (版本: $pm2Version)" "Green"
    } else {
        Write-ColorOutput "❌ PM2 未安装或无法访问" "Red"
        Write-ColorOutput "   请运行: npm install -g pm2" "Yellow"
        exit 1
    }
} catch {
    Write-ColorOutput "❌ 无法执行 PM2 命令" "Red"
    exit 1
}

# 步骤2: 查看进程列表
Write-Title "步骤 2: PM2 进程列表"

$processList = pm2 jlist | ConvertFrom-Json
$targetProcess = $processList | Where-Object { $_.name -eq $ProcessName }

if ($targetProcess) {
    Write-ColorOutput "✅ 找到进程: $ProcessName" "Green"
    Write-Host ""
    Write-ColorOutput "进程信息:" "White"
    Write-ColorOutput "  名称: $($targetProcess.name)" "Gray"
    Write-ColorOutput "  状态: $($targetProcess.pm2_env.status)" "Gray"
    Write-ColorOutput "  PID: $($targetProcess.pid)" "Gray"
    Write-ColorOutput "  启动次数: $($targetProcess.pm2_env.restart_time)" "Gray"
    
    # 如果未提供应用路径，从PM2配置中获取
    if ([string]::IsNullOrEmpty($AppPath)) {
        $AppPath = $targetProcess.pm2_env.pm_cwd
    }
} else {
    Write-ColorOutput "⚠️ 未找到进程: $ProcessName" "Yellow"
    Write-ColorOutput "   请检查进程名称是否正确" "Yellow"
    Write-Host ""
    Write-ColorOutput "当前PM2进程列表:" "White"
    pm2 list
    exit 1
}

# 步骤3: 检查进程状态
Write-Title "步骤 3: 进程状态分析"

$status = $targetProcess.pm2_env.status
Write-ColorOutput "当前状态: $status" "White"

switch ($status) {
    "online" {
        Write-ColorOutput "✅ 进程运行正常" "Green"
        Write-ColorOutput "   如果功能异常，请检查应用日志" "Yellow"
    }
    "stopped" {
        Write-ColorOutput "⚠️ 进程已停止" "Yellow"
        Write-ColorOutput "   运行 'pm2 start $ProcessName' 启动进程" "Yellow"
    }
    "errored" {
        Write-ColorOutput "❌ 进程处于错误状态" "Red"
        Write-ColorOutput "   继续诊断以查找错误原因..." "Yellow"
    }
    default {
        Write-ColorOutput "⚠️ 未知状态: $status" "Yellow"
    }
}

# 步骤4: 查看错误日志
Write-Title "步骤 4: 错误日志分析"

Write-ColorOutput "📋 最近的错误日志 (最后20行):" "Yellow"
Write-Host ""

$errorLogs = pm2 logs $ProcessName --err --lines 20 --nostream 2>&1
if ($errorLogs) {
    $errorLogs | ForEach-Object {
        if ($_ -match "error|Error|ERROR|failed|Failed|FAILED") {
            Write-ColorOutput $_ "Red"
        } elseif ($_ -match "warn|Warn|WARN|warning|Warning") {
            Write-ColorOutput $_ "Yellow"
        } else {
            Write-ColorOutput $_ "Gray"
        }
    }
} else {
    Write-ColorOutput "ℹ️ 暂无错误日志" "Gray"
}

# 步骤5: 常见问题诊断
Write-Title "步骤 5: 常见问题诊断"

$issues = @()

# 检查1: 端口占用
Write-ColorOutput "检查 1: 端口占用..." "White"
$port = $targetProcess.pm2_env.env.PORT
if ($port) {
    Write-ColorOutput "  应用端口: $port" "Gray"
    $portInUse = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
    if ($portInUse) {
        Write-ColorOutput "  ❌ 端口 $port 已被占用" "Red"
        $issues += @{
            Type = "端口冲突"
            Description = "端口 $port 已被其他进程占用"
            Solution = @"
解决方案：
1. 停止占用端口的进程：
   netstat -ano | findstr :$port
   taskkill /PID <进程ID> /F

2. 或修改应用配置使用其他端口
"@
        }
    } else {
        Write-ColorOutput "  ✅ 端口 $port 可用" "Green"
    }
} else {
    Write-ColorOutput "  ℹ️ 未配置端口" "Gray"
}

# 检查2: 依赖安装
Write-ColorOutput "`n检查 2: 依赖安装..." "White"
if ($AppPath -and (Test-Path $AppPath)) {
    Write-ColorOutput "  应用路径: $AppPath" "Gray"
    $nodeModulesPath = Join-Path $AppPath "node_modules"
    if (Test-Path $nodeModulesPath) {
        Write-ColorOutput "  ✅ node_modules 存在" "Green"
    } else {
        Write-ColorOutput "  ❌ node_modules 不存在" "Red"
        $issues += @{
            Type = "依赖缺失"
            Description = "应用依赖未安装"
            Solution = @"
解决方案：
cd "$AppPath"
npm install
"@
        }
    }
} else {
    Write-ColorOutput "  ⚠️ 无法访问应用路径" "Yellow"
}

# 检查3: package.json
Write-ColorOutput "`n检查 3: 启动脚本..." "White"
if ($AppPath -and (Test-Path $AppPath)) {
    $packageJsonPath = Join-Path $AppPath "package.json"
    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
        if ($packageJson.scripts) {
            Write-ColorOutput "  ✅ package.json 存在" "Green"
            Write-ColorOutput "  可用脚本:" "Gray"
            $packageJson.scripts.PSObject.Properties | ForEach-Object {
                Write-ColorOutput "    - $($_.Name): $($_.Value)" "Gray"
            }
        }
    } else {
        Write-ColorOutput "  ❌ package.json 不存在" "Red"
    }
}

# 步骤6: 修复建议
Write-Title "步骤 6: 修复建议"

if ($issues.Count -gt 0) {
    Write-ColorOutput "发现 $($issues.Count) 个问题：`n" "Red"
    
    $issueNum = 1
    foreach ($issue in $issues) {
        Write-ColorOutput "问题 $issueNum : $($issue.Type)" "Yellow"
        Write-ColorOutput "描述: $($issue.Description)" "Gray"
        Write-ColorOutput "解决方案:" "Green"
        Write-ColorOutput $issue.Solution "White"
        Write-Host ""
        $issueNum++
    }
} else {
    Write-ColorOutput "✅ 未发现明显问题" "Green"
    Write-Host ""
    Write-ColorOutput "如果进程仍然无法启动，建议：" "Yellow"
    Write-ColorOutput "1. 手动测试启动命令" "White"
    Write-ColorOutput "   cd `"$AppPath`"" "Gray"
    Write-ColorOutput "   npm run dev" "Gray"
    Write-Host ""
    Write-ColorOutput "2. 查看完整的PM2进程详情" "White"
    Write-ColorOutput "   pm2 show $ProcessName" "Gray"
    Write-Host ""
    Write-ColorOutput "3. 查看完整的错误日志" "White"
    Write-ColorOutput "   pm2 logs $ProcessName --err --lines 100" "Gray"
}

# 步骤7: 快速修复选项
Write-Title "步骤 7: 快速修复选项"

Write-Host ""
Write-ColorOutput "请选择操作：" "Cyan"
Write-ColorOutput "  [1] 重启进程" "White"
Write-ColorOutput "  [2] 删除并重新配置进程" "White"
Write-ColorOutput "  [3] 安装依赖" "White"
Write-ColorOutput "  [4] 手动测试启动" "White"
Write-ColorOutput "  [5] 查看详细日志" "White"
Write-ColorOutput "  [0] 退出" "White"
Write-Host ""

$choice = Read-Host "请输入选项 (0-5)"

switch ($choice) {
    "1" {
        Write-ColorOutput "`n🔄 重启进程..." "Yellow"
        pm2 restart $ProcessName
        Start-Sleep -Seconds 2
        pm2 list
    }
    "2" {
        Write-ColorOutput "`n🗑️ 删除进程..." "Yellow"
        pm2 delete $ProcessName
        Write-ColorOutput "✅ 进程已删除" "Green"
        Write-ColorOutput "请前往门户系统的'应用管理'页面重新配置并启动" "Yellow"
    }
    "3" {
        if ($AppPath -and (Test-Path $AppPath)) {
            Write-ColorOutput "`n📦 安装依赖..." "Yellow"
            Set-Location $AppPath
            npm install
        } else {
            Write-ColorOutput "❌ 无法访问应用路径" "Red"
        }
    }
    "4" {
        if ($AppPath -and (Test-Path $AppPath)) {
            Write-ColorOutput "`n🧪 手动测试启动..." "Yellow"
            Set-Location $AppPath
            Write-ColorOutput "已进入应用目录: $AppPath" "Green"
            Write-ColorOutput "请运行: npm run dev" "Yellow"
        } else {
            Write-ColorOutput "❌ 无法访问应用路径" "Red"
        }
    }
    "5" {
        Write-ColorOutput "`n📋 查看详细日志..." "Yellow"
        pm2 logs $ProcessName
    }
    "0" {
        Write-ColorOutput "`n👋 退出诊断工具" "Cyan"
    }
    default {
        Write-ColorOutput "`n⚠️ 无效选项" "Yellow"
    }
}

Write-Host ""
Write-Separator
Write-ColorOutput "诊断完成！" "Green"
Write-Separator
Write-Host ""

