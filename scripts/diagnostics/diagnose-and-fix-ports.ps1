# ============================================================================
# 端口监听诊断和修复脚本
# ============================================================================
# 功能：
# 1. 诊断哪些端口只监听在 localhost，哪些监听在 0.0.0.0
# 2. 识别问题进程
# 3. 提供修复建议
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  🔍 端口监听诊断工具" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. 获取所有监听端口
# ============================================================================
Write-Host "📋 步骤 1/4: 分析端口监听情况" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray

$appPorts = @(3000, 3041, 3042, 3051, 8002, 8041, 8042, 8051)
$results = @()

foreach ($port in $appPorts) {
    $listening = netstat -ano | Select-String "LISTENING" | Select-String ":$port "
    
    if ($listening) {
        $listeningStr = $listening.ToString().Trim()
        
        # 提取PID
        $pid = $null
        if ($listeningStr -match "\s+(\d+)\s*$") {
            $pid = $matches[1]
        }
        
        # 判断监听类型
        $status = "未知"
        $canLanAccess = $false
        $listenAddress = ""
        
        if ($listeningStr -match "0\.0\.0\.0:$port") {
            $status = "✅ 可局域网访问"
            $canLanAccess = $true
            $listenAddress = "0.0.0.0"
        } elseif ($listeningStr -match "127\.0\.0\.1:$port") {
            $status = "❌ 仅本地访问"
            $canLanAccess = $false
            $listenAddress = "127.0.0.1"
        } elseif ($listeningStr -match "\[::\]:$port") {
            $status = "✅ 可局域网访问 (IPv6)"
            $canLanAccess = $true
            $listenAddress = "[::]"
        } elseif ($listeningStr -match "\[::1\]:$port") {
            $status = "❌ 仅本地访问 (IPv6)"
            $canLanAccess = $false
            $listenAddress = "[::1]"
        }
        
        # 获取进程信息
        $processName = ""
        $processPath = ""
        if ($pid) {
            try {
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($process) {
                    $processName = $process.ProcessName
                    $processPath = $process.Path
                }
            } catch {
                $processName = "未知"
            }
        }
        
        $results += [PSCustomObject]@{
            Port = $port
            Status = $status
            CanLanAccess = $canLanAccess
            ListenAddress = $listenAddress
            PID = $pid
            ProcessName = $processName
            ProcessPath = $processPath
        }
    }
}

# 显示结果
Write-Host ""
Write-Host "端口监听分析结果:" -ForegroundColor Cyan
Write-Host ""

$results | Format-Table @{
    Label = "端口"
    Expression = {$_.Port}
    Width = 6
}, @{
    Label = "监听地址"
    Expression = {$_.ListenAddress}
    Width = 15
}, @{
    Label = "状态"
    Expression = {$_.Status}
    Width = 30
}, @{
    Label = "PID"
    Expression = {$_.PID}
    Width = 8
}, @{
    Label = "进程"
    Expression = {$_.ProcessName}
    Width = 15
} -AutoSize

Write-Host ""

# ============================================================================
# 2. 识别问题端口
# ============================================================================
Write-Host "📋 步骤 2/4: 识别问题端口" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray

$problemPorts = $results | Where-Object { -not $_.CanLanAccess }

if ($problemPorts.Count -eq 0) {
    Write-Host "  ✅ 所有端口都可以从局域网访问！" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  发现 $($problemPorts.Count) 个端口只能本地访问：" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($port in $problemPorts) {
        Write-Host "  端口 $($port.Port):" -ForegroundColor Red
        Write-Host "    监听地址: $($port.ListenAddress)" -ForegroundColor Gray
        Write-Host "    进程PID:  $($port.PID)" -ForegroundColor Gray
        Write-Host "    进程名称: $($port.ProcessName)" -ForegroundColor Gray
        if ($port.ProcessPath) {
            Write-Host "    进程路径: $($port.ProcessPath)" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

Write-Host ""

# ============================================================================
# 3. 端口用途说明
# ============================================================================
Write-Host "📋 步骤 3/4: 端口用途说明" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray

$portDescriptions = @{
    3000 = "门户系统前端"
    3041 = "Teaching-inspection-systemV1.3 前端"
    3042 = "应用前端 (备用)"
    3051 = "training-system-v3.2 前端"
    8002 = "后端API服务"
    8041 = "Teaching-inspection-systemV1.3 后端"
    8042 = "应用后端 (备用)"
    8051 = "training-system-v3.2 后端"
}

foreach ($result in $results) {
    $description = $portDescriptions[$result.Port]
    if ($description) {
        $statusIcon = if ($result.CanLanAccess) { "✅" } else { "❌" }
        Write-Host "  $statusIcon 端口 $($result.Port): $description" -ForegroundColor $(if ($result.CanLanAccess) { "Green" } else { "Red" })
    }
}

Write-Host ""

# ============================================================================
# 4. 修复建议
# ============================================================================
Write-Host "📋 步骤 4/4: 修复建议" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray

if ($problemPorts.Count -eq 0) {
    Write-Host "  ✅ 无需修复！所有端口配置正确。" -ForegroundColor Green
} else {
    Write-Host "  需要修复以下端口：" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($port in $problemPorts) {
        $description = $portDescriptions[$port.Port]
        Write-Host "  端口 $($port.Port) ($description):" -ForegroundColor Cyan
        Write-Host "    1. 在门户系统中停止对应的应用" -ForegroundColor White
        Write-Host "    2. 等待进程完全停止" -ForegroundColor White
        Write-Host "    3. 重新启动应用" -ForegroundColor White
        Write-Host ""
        Write-Host "    或者手动停止进程：" -ForegroundColor White
        Write-Host "    Stop-Process -Id $($port.PID) -Force" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "  修复后，应用将监听在 0.0.0.0，可以从局域网访问。" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# 5. 提供一键修复选项
# ============================================================================
if ($problemPorts.Count -gt 0) {
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host "  🔧 一键修复" -ForegroundColor Cyan
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    $fix = Read-Host "是否停止所有问题进程？(Y/N)"
    
    if ($fix -eq "Y" -or $fix -eq "y") {
        Write-Host ""
        Write-Host "正在停止问题进程..." -ForegroundColor Yellow
        
        foreach ($port in $problemPorts) {
            try {
                Write-Host "  停止端口 $($port.Port) 的进程 (PID: $($port.PID))..." -ForegroundColor Cyan
                Stop-Process -Id $port.PID -Force -ErrorAction Stop
                Write-Host "  ✅ 已停止" -ForegroundColor Green
            } catch {
                Write-Host "  ❌ 停止失败: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        
        Write-Host ""
        Write-Host "✅ 进程已停止！" -ForegroundColor Green
        Write-Host ""
        Write-Host "下一步：" -ForegroundColor Yellow
        Write-Host "1. 打开门户系统: http://localhost:3000" -ForegroundColor White
        Write-Host "2. 重新启动对应的应用" -ForegroundColor White
        Write-Host "3. 验证应用可以从局域网访问" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "已取消。请手动在门户系统中重启应用。" -ForegroundColor Yellow
    }
}

# ============================================================================
# 6. 验证测试
# ============================================================================
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  🧪 验证测试" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# 获取局域网IP
$lanIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -like "192.168.*" -or 
    $_.IPAddress -like "10.*" -or 
    ($_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[01])\.")
} | Select-Object -First 1).IPAddress

if ($lanIP) {
    Write-Host "局域网IP: $lanIP" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "在其他电脑上测试以下链接：" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($result in $results) {
        $description = $portDescriptions[$result.Port]
        if ($description) {
            $url = "http://$lanIP:$($result.Port)"
            $statusIcon = if ($result.CanLanAccess) { "✅" } else { "❌" }
            Write-Host "  $statusIcon $url" -ForegroundColor $(if ($result.CanLanAccess) { "Green" } else { "Red" })
            Write-Host "     ($description)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "⚠️  未找到局域网IP地址" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  ✅ 诊断完成！" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# 生成报告
$reportPath = "port-diagnostic-report.txt"
$report = @"
============================================================================
端口监听诊断报告
生成时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
============================================================================

端口监听情况:
-----------
$($results | Format-Table -AutoSize | Out-String)

问题端口:
-----------
$($problemPorts | Format-Table -AutoSize | Out-String)

修复建议:
-----------
$(if ($problemPorts.Count -eq 0) {
    "✅ 所有端口配置正确，无需修复。"
} else {
    "需要重启以下应用：`n" + ($problemPorts | ForEach-Object { "- 端口 $($_.Port): $($portDescriptions[$_.Port])" }) -join "`n"
})

局域网访问地址:
-----------
$(if ($lanIP) {
    $results | ForEach-Object {
        $description = $portDescriptions[$_.Port]
        $status = if ($_.CanLanAccess) { "✅" } else { "❌" }
        "$status http://$lanIP:$($_.Port) - $description"
    } | Out-String
} else {
    "未找到局域网IP"
})

============================================================================
"@

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "📄 诊断报告已保存: $reportPath" -ForegroundColor Green
Write-Host ""

