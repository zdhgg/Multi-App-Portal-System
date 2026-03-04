# 智能多应用门户系统 - 防火墙配置脚本
# 配置Windows防火墙以允许局域网访问

param(
    [switch]$Remove,
    [switch]$List
)

$ErrorActionPreference = "Stop"

# 定义需要开放的端口
$Ports = @(
    @{ Port = 3000; Name = "Portal-Frontend"; Description = "智能门户系统前端" },
    @{ Port = 8002; Name = "Portal-Backend"; Description = "智能门户系统后端API" },
    @{ Port = 3001; Name = "Portal-App-1"; Description = "门户应用端口1" },
    @{ Port = 3002; Name = "Portal-App-2"; Description = "门户应用端口2" },
    @{ Port = 3003; Name = "Portal-App-3"; Description = "门户应用端口3" },
    @{ Port = 3004; Name = "Portal-App-4"; Description = "门户应用端口4" },
    @{ Port = 3005; Name = "Portal-App-5"; Description = "门户应用端口5" }
)

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Test-AdminRights {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-FirewallRules {
    Write-ColorOutput "🔥 配置Windows防火墙规则..." "Yellow"
    
    foreach ($portInfo in $Ports) {
        $ruleName = "Portal-System-$($portInfo.Name)"
        
        try {
            # 检查规则是否已存在
            $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
            
            if ($existingRule) {
                Write-ColorOutput "  ⚠️  规则已存在: $ruleName" "Yellow"
                continue
            }
            
            # 添加入站规则
            New-NetFirewallRule -DisplayName $ruleName `
                               -Direction Inbound `
                               -Protocol TCP `
                               -LocalPort $portInfo.Port `
                               -Action Allow `
                               -Profile Domain,Private `
                               -Description $portInfo.Description
            
            Write-ColorOutput "  ✅ 已添加规则: $ruleName (端口 $($portInfo.Port))" "Green"
        }
        catch {
            Write-ColorOutput "  ❌ 添加规则失败: $ruleName - $($_.Exception.Message)" "Red"
        }
    }
}

function Remove-FirewallRules {
    Write-ColorOutput "🗑️  移除防火墙规则..." "Yellow"
    
    foreach ($portInfo in $Ports) {
        $ruleName = "Portal-System-$($portInfo.Name)"
        
        try {
            $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
            
            if ($existingRule) {
                Remove-NetFirewallRule -DisplayName $ruleName
                Write-ColorOutput "  ✅ 已移除规则: $ruleName" "Green"
            } else {
                Write-ColorOutput "  ⚠️  规则不存在: $ruleName" "Yellow"
            }
        }
        catch {
            Write-ColorOutput "  ❌ 移除规则失败: $ruleName - $($_.Exception.Message)" "Red"
        }
    }
}

function List-FirewallRules {
    Write-ColorOutput "📋 当前防火墙规则:" "Cyan"
    
    foreach ($portInfo in $Ports) {
        $ruleName = "Portal-System-$($portInfo.Name)"
        
        try {
            $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
            
            if ($existingRule) {
                $status = if ($existingRule.Enabled -eq "True") { "启用" } else { "禁用" }
                Write-ColorOutput "  ✅ $ruleName - 端口 $($portInfo.Port) - $status" "Green"
            } else {
                Write-ColorOutput "  ❌ $ruleName - 端口 $($portInfo.Port) - 未配置" "Red"
            }
        }
        catch {
            Write-ColorOutput "  ❌ 检查规则失败: $ruleName" "Red"
        }
    }
}

function Show-NetworkInfo {
    Write-ColorOutput "`n🌐 网络信息:" "Cyan"
    
    $networkAdapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.InterfaceType -eq "Ethernet" -or $_.InterfaceType -eq "Wireless80211" }
    
    foreach ($adapter in $networkAdapters) {
        $ipConfig = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        
        if ($ipConfig) {
            Write-ColorOutput "  📡 $($adapter.Name): $($ipConfig.IPAddress)" "White"
        }
    }
    
    Write-ColorOutput "`n🔗 访问地址:" "Cyan"
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -like "192.168.*" }).IPAddress | Select-Object -First 1
    
    if ($localIP) {
        Write-ColorOutput "  • 门户系统: http://$localIP:3000" "Green"
        Write-ColorOutput "  • 后端API: http://$localIP:8002/api" "Green"
        Write-ColorOutput "  • 健康检查: http://$localIP:8002/health" "Green"
    }
}

# 主程序
try {
    Write-ColorOutput "🚀 智能多应用门户系统 - 防火墙配置工具" "Cyan"
    Write-ColorOutput "================================================" "Cyan"
    
    # 检查管理员权限
    if (-not (Test-AdminRights)) {
        Write-ColorOutput "❌ 需要管理员权限才能配置防火墙规则" "Red"
        Write-ColorOutput "请以管理员身份运行PowerShell" "Yellow"
        exit 1
    }
    
    if ($List) {
        List-FirewallRules
        Show-NetworkInfo
    }
    elseif ($Remove) {
        Remove-FirewallRules
        Write-ColorOutput "`n✅ 防火墙规则移除完成" "Green"
    }
    else {
        Add-FirewallRules
        Write-ColorOutput "`n✅ 防火墙配置完成" "Green"
        Show-NetworkInfo
    }
}
catch {
    Write-ColorOutput "❌ 执行失败: $($_.Exception.Message)" "Red"
    exit 1
}
