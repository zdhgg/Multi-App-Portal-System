#!/usr/bin/env pwsh
# 智能多Web应用门户系统 - 生产环境快速启动脚本

Write-Host "🚀 智能多Web应用门户系统 - 生产环境启动" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

# 生产环境前置检查：确保 JWT_SECRET 可用
function Test-WeakJwtSecret {
    param(
        [string]$Secret
    )

    if ([string]::IsNullOrWhiteSpace($Secret)) { return $true }
    if ($Secret.Length -lt 32) { return $true }

    $lowered = $Secret.ToLowerInvariant()
    $placeholderHints = @(
        "change-this",
        "replace-this",
        "your-super-secret",
        "your-jwt-secret",
        "your-secret-key"
    )

    foreach ($hint in $placeholderHints) {
        if ($lowered.Contains($hint)) {
            return $true
        }
    }

    return $false
}

function New-RandomSecret {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

function Ensure-JwtSecret {
    param(
        [string]$EnvPath
    )

    $envLines = @()
    if (Test-Path $EnvPath) {
        $envLines = Get-Content -Path $EnvPath -Encoding UTF8
    }

    $jwtLineIndex = -1
    for ($i = 0; $i -lt $envLines.Count; $i++) {
        if ($envLines[$i] -match '^\s*JWT_SECRET\s*=') {
            $jwtLineIndex = $i
            break
        }
    }

    $existingSecret = $null
    if ($jwtLineIndex -ge 0) {
        $existingLine = $envLines[$jwtLineIndex]
        if ($existingLine -match '^\s*JWT_SECRET\s*=\s*(.*)\s*$') {
            $existingSecret = $Matches[1].Trim()
        }
    }

    if (-not (Test-WeakJwtSecret -Secret $existingSecret)) {
        return
    }

    $newSecret = New-RandomSecret
    if ($jwtLineIndex -ge 0) {
        $envLines[$jwtLineIndex] = "JWT_SECRET=$newSecret"
        Write-Host "   ⚠️  检测到弱 JWT_SECRET，已自动更新为安全随机值" -ForegroundColor Yellow
    } else {
        if ($envLines.Count -gt 0 -and $envLines[-1].Trim() -ne "") {
            $envLines += ""
        }
        $envLines += "JWT_SECRET=$newSecret"
        Write-Host "   ✅ 已自动写入 JWT_SECRET 到 detection-api/.env" -ForegroundColor Green
    }

    Set-Content -Path $EnvPath -Value $envLines -Encoding UTF8
}

Write-Host "`n🔐 检查生产环境密钥..." -ForegroundColor Yellow
$backendEnvPath = Join-Path $projectRoot "detection-api\.env"
Ensure-JwtSecret -EnvPath $backendEnvPath

# 检查是否已有运行的实例
Write-Host "`n🔍 检查服务状态..." -ForegroundColor Yellow
$existingProcess = $null
$usedCompatMode = $false

try {
    $jlistRaw = (pm2 jlist 2>$null | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($jlistRaw)) {
        # 兼容 PM2 在 Windows 上偶发的前缀输出，截取 JSON 数组起始位置
        $jsonStart = $jlistRaw.IndexOf('[')
        $jsonPayload = if ($jsonStart -ge 0) { $jlistRaw.Substring($jsonStart) } else { $jlistRaw }

        $pm2List = $jsonPayload | ConvertFrom-Json
        if ($pm2List -isnot [System.Array]) {
            $pm2List = @($pm2List)
        }

        $existingProcess = $pm2List | Where-Object { $_.name -eq "portal-api" } | Select-Object -First 1
    }
} catch {
    $usedCompatMode = $true
}

if (-not $existingProcess) {
    $pidText = (pm2 pid portal-api 2>$null | Out-String).Trim()
    [int]$pm2Pid = 0
    if ([int]::TryParse($pidText, [ref]$pm2Pid) -and $pm2Pid -gt 0) {
        $usedCompatMode = $true
        $existingProcess = [PSCustomObject]@{
            pid = $pm2Pid
            pm2_env = [PSCustomObject]@{
                status = "online"
                pm_uptime = $null
                PM2_ENABLED = $null
            }
        }
    }
}

if ($existingProcess -and $existingProcess.pm2_env.status -eq "online") {
    Write-Host "   ✅ 服务已在运行中" -ForegroundColor Green
    Write-Host "   进程 ID: $($existingProcess.pid)" -ForegroundColor Gray
    if ($existingProcess.pm2_env.pm_uptime) {
        Write-Host "   运行时间: $([math]::Round($existingProcess.pm2_env.pm_uptime / 1000 / 60, 1)) 分钟" -ForegroundColor Gray
    }
    if ($usedCompatMode) {
        Write-Host "   检测模式: 兼容模式" -ForegroundColor DarkGray
    }
    
    # 检查当前环境变量是否正确
    $currentPM2Enabled = $existingProcess.pm2_env.PM2_ENABLED
    if ($currentPM2Enabled -and $currentPM2Enabled -ne "1") {
        Write-Host "   ⚠️  PM2_ENABLED 未启用，需要重新加载环境变量" -ForegroundColor Yellow
    }
    
    $choice = Read-Host "`n是否重启服务? (y/N)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        Write-Host "`n🔄 重启服务（重新加载环境变量）..." -ForegroundColor Yellow
        # 🔧 修复：使用 delete + start 确保环境变量正确加载
        pm2 delete portal-api 2>$null
        Start-Sleep -Seconds 1
        pm2 start ecosystem-prod-tsx.config.js
    } else {
        Write-Host "`n跳过重启，服务继续运行" -ForegroundColor Gray
    }
} else {
    if ($existingProcess) {
        Write-Host "   ⚠️  检测到异常状态进程：$($existingProcess.pm2_env.status)，先清理再启动" -ForegroundColor Yellow
        pm2 delete portal-api 2>$null
        Start-Sleep -Seconds 1
    }

    # 启动新实例
    Write-Host "`n🚀 启动新服务..." -ForegroundColor Yellow
    Set-Location $projectRoot
    
    # 使用 tsx 配置（不需要编译）
    pm2 start ecosystem-prod-tsx.config.js
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ PM2 启动失败！" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ 服务启动成功" -ForegroundColor Green
}

# 等待服务完全启动
Write-Host "`n⏳ 等待服务完全启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 显示状态
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "📊 当前状态" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

pm2 status

# 健康检查
Write-Host "`n🏥 健康检查..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8002/health" -Method Get -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ 健康检查通过 (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "⚠️  健康检查失败，请查看日志" -ForegroundColor Red
    Write-Host "   运行命令: pm2 logs portal-api" -ForegroundColor Gray

    $recentLogs = (pm2 logs portal-api --lines 40 --nostream 2>$null | Out-String)
    if ($recentLogs -match 'JWT_SECRET not configured for production environment') {
        Write-Host "   根因: JWT_SECRET 缺失或不安全，已阻止生产环境启动" -ForegroundColor Red
        Write-Host "   处理: 检查 detection-api/.env 中 JWT_SECRET 是否为随机高强度值" -ForegroundColor Gray
    }

    exit 1
}

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "📊 服务信息" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "   🌐 访问地址: http://localhost:8002" -ForegroundColor White
Write-Host "   📡 API 地址: http://localhost:8002/api" -ForegroundColor White
Write-Host "   💚 健康检查: http://localhost:8002/health" -ForegroundColor White

Write-Host "`n📝 常用命令:" -ForegroundColor Cyan
Write-Host "   pm2 status          # 查看服务状态" -ForegroundColor Gray
Write-Host "   pm2 logs portal-api # 查看日志" -ForegroundColor Gray
Write-Host "   pm2 restart portal-api # 重启服务" -ForegroundColor Gray
Write-Host "   pm2 stop portal-api # 停止服务" -ForegroundColor Gray
Write-Host "   pm2 delete portal-api # 删除服务" -ForegroundColor Gray
Write-Host "   pm2 save           # 保存当前配置" -ForegroundColor Gray
Write-Host "   pm2 startup        # 设置开机自启" -ForegroundColor Gray

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan

