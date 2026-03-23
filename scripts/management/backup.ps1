# ============================================================================
# 智能多Web应用门户系统 - 数据备份管理工具 v1.1.1
# ============================================================================
# 
# 功能说明：
# - 统一数据备份和恢复管理
# - 增量备份和完整备份支持
# - 备份调度和版本管理
# - 备份验证和完整性检查
#
# 作者：Augment Agent
# 创建时间：2025-09-23
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("backup", "restore", "schedule", "verify", "clean", "list", "status", "interactive", "help")]
    [string]$Action = "interactive",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("full", "incremental", "config", "logs", "api", "custom")]
    [string]$BackupType = "full",
    
    [Parameter(Mandatory=$false)]
    [string]$BackupName = "",
    
    [Parameter(Mandatory=$false)]
    [string]$RestoreFrom = "",
    
    [Parameter(Mandatory=$false)]
    [string]$BackupPath = "",
    
    [Parameter(Mandatory=$false)]
    [array]$IncludePaths = @(),
    
    [Parameter(Mandatory=$false)]
    [array]$ExcludePaths = @(),
    
    [Parameter(Mandatory=$false)]
    [switch]$Compress,
    
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

# 备份配置
$BACKUP_CONFIG_DIR = Join-Path $PROJECT_ROOT "backups"
$BACKUP_CONFIG_FILE = Join-Path $BACKUP_CONFIG_DIR "backup-config.json"
$BACKUP_REGISTRY_FILE = Join-Path $BACKUP_CONFIG_DIR "backup-registry.json"

# 日志配置
$LOG_DIR = Join-Path $PROJECT_ROOT "logs"
$BACKUP_LOG_FILE = Join-Path $LOG_DIR "backup.log"

# 确保目录存在
if (-not (Test-Path $BACKUP_CONFIG_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_CONFIG_DIR -Force | Out-Null
}
if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}

# 备份配置架构
$BACKUP_CONFIG_SCHEMA = @{
    version = "1.1.1"
    lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    settings = @{
        defaultBackupPath = Join-Path $BACKUP_CONFIG_DIR "data"
        maxBackupRetention = 30  # 天
        compressionEnabled = $true
        verificationEnabled = $true
        incrementalEnabled = $true
        scheduleEnabled = $false
    }
    paths = @{
        configs = @(
            "configs\system-config.json"
            "configs\api-config.json"
            "configs\api-registry.json"
            "detection-api\configs\portal-config.json"
        )
        logs = @(
            "logs\*.log"
            "detection-api\logs\*.log"
        )
        data = @(
            "detection-api\data\*"
        )
        scripts = @(
            "*.ps1"
            "ecosystem.config.js"
            "package.json"
        )
        exclude = @(
            "node_modules\*"
            "*.tmp"
            "*.temp"
            ".git\*"
        )
    }
    schedule = @{
        enabled = $false
        fullBackupInterval = "daily"  # daily, weekly, monthly
        incrementalInterval = "hourly"  # hourly, daily
        time = "02:00"  # HH:mm
        retention = @{
            daily = 7
            weekly = 4
            monthly = 12
        }
    }
    notifications = @{
        enabled = $true
        onSuccess = $true
        onFailure = $true
        channels = @("console", "log")
    }
}

# 备份注册表架构
$BACKUP_REGISTRY_SCHEMA = @{
    version = "1.1.1"
    lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    backups = @()
    statistics = @{
        totalBackups = 0
        successfulBackups = 0
        failedBackups = 0
        lastBackup = $null
        totalSize = 0
    }
}

# ============================================================================
# 日志记录函数
# ============================================================================

function Write-BackupLog {
    param(
        [string]$Message,
        [ValidateSet("DEBUG", "INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO",
        [string]$Component = "BACKUP"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $logEntry = "[$timestamp] [$Level] [$Component] $Message"
    
    # 写入日志文件
    try {
        Add-Content -Path $BACKUP_LOG_FILE -Value $logEntry -Encoding UTF8
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

function Initialize-BackupConfig {
    Write-BackupLog "初始化备份配置系统..." "INFO" "CONFIG"
    
    # 创建默认配置文件
    if (-not (Test-Path $BACKUP_CONFIG_FILE)) {
        $BACKUP_CONFIG_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content -Path $BACKUP_CONFIG_FILE -Encoding UTF8
        Write-BackupLog "创建默认备份配置文件: $BACKUP_CONFIG_FILE" "SUCCESS" "CONFIG"
    }
    
    # 创建默认注册表文件
    if (-not (Test-Path $BACKUP_REGISTRY_FILE)) {
        $BACKUP_REGISTRY_SCHEMA | ConvertTo-Json -Depth 10 | Set-Content -Path $BACKUP_REGISTRY_FILE -Encoding UTF8
        Write-BackupLog "创建默认备份注册表文件: $BACKUP_REGISTRY_FILE" "SUCCESS" "CONFIG"
    }
    
    # 创建数据备份目录
    $dataBackupDir = Join-Path $BACKUP_CONFIG_DIR "data"
    if (-not (Test-Path $dataBackupDir)) {
        New-Item -ItemType Directory -Path $dataBackupDir -Force | Out-Null
        Write-BackupLog "创建数据备份目录: $dataBackupDir" "SUCCESS" "CONFIG"
    }
    
    Write-BackupLog "备份配置系统初始化完成" "SUCCESS" "CONFIG"
}

function Get-BackupConfig {
    try {
        if (Test-Path $BACKUP_CONFIG_FILE) {
            $config = Get-Content -Path $BACKUP_CONFIG_FILE -Raw | ConvertFrom-Json
            return $config
        } else {
            Write-BackupLog "备份配置文件不存在，使用默认配置" "WARN" "CONFIG"
            return $BACKUP_CONFIG_SCHEMA
        }
    } catch {
        Write-BackupLog "读取备份配置失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $BACKUP_CONFIG_SCHEMA
    }
}

function Set-BackupConfig {
    param([object]$Config)
    
    try {
        $Config.lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $BACKUP_CONFIG_FILE -Encoding UTF8
        Write-BackupLog "备份配置已保存" "SUCCESS" "CONFIG"
        return $true
    } catch {
        Write-BackupLog "保存备份配置失败: $($_.Exception.Message)" "ERROR" "CONFIG"
        return $false
    }
}

function Get-BackupRegistry {
    try {
        if (Test-Path $BACKUP_REGISTRY_FILE) {
            $registry = Get-Content -Path $BACKUP_REGISTRY_FILE -Raw | ConvertFrom-Json
            return $registry
        } else {
            Write-BackupLog "备份注册表文件不存在，使用默认注册表" "WARN" "REGISTRY"
            return $BACKUP_REGISTRY_SCHEMA
        }
    } catch {
        Write-BackupLog "读取备份注册表失败: $($_.Exception.Message)" "ERROR" "REGISTRY"
        return $BACKUP_REGISTRY_SCHEMA
    }
}

function Set-BackupRegistry {
    param([object]$Registry)
    
    try {
        $Registry.lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $Registry.statistics.totalBackups = $Registry.backups.Count
        $Registry | ConvertTo-Json -Depth 10 | Set-Content -Path $BACKUP_REGISTRY_FILE -Encoding UTF8
        Write-BackupLog "备份注册表已保存" "SUCCESS" "REGISTRY"
        return $true
    } catch {
        Write-BackupLog "保存备份注册表失败: $($_.Exception.Message)" "ERROR" "REGISTRY"
        return $false
    }
}

# ============================================================================
# 备份核心功能
# ============================================================================

function Get-BackupPaths {
    param(
        [string]$BackupType,
        [array]$IncludePaths = @(),
        [array]$ExcludePaths = @()
    )

    $config = Get-BackupConfig
    $paths = @()

    switch ($BackupType.ToLower()) {
        "full" {
            $paths += $config.paths.configs
            $paths += $config.paths.logs
            $paths += $config.paths.data
            $paths += $config.paths.scripts
        }
        "config" {
            $paths += $config.paths.configs
        }
        "logs" {
            $paths += $config.paths.logs
        }
        "api" {
            $paths += @("configs\api-config.json", "configs\api-registry.json")
        }
        "custom" {
            $paths = $IncludePaths
        }
    }

    # 添加自定义包含路径
    if ($IncludePaths.Count -gt 0) {
        $paths += $IncludePaths
    }

    # 解析通配符并转换为绝对路径
    $resolvedPaths = @()
    foreach ($path in $paths) {
        $fullPath = Join-Path $PROJECT_ROOT $path
        if ($path -like "*\*" -or $path -like "*.*") {
            # 处理通配符路径
            try {
                $matchedPaths = Get-ChildItem -Path $fullPath -ErrorAction SilentlyContinue
                foreach ($matchedPath in $matchedPaths) {
                    if ($matchedPath.PSIsContainer -eq $false) {
                        $resolvedPaths += $matchedPath.FullName
                    }
                }
            } catch {
                Write-BackupLog "解析路径失败: $path - $($_.Exception.Message)" "WARN" "PATHS"
            }
        } else {
            # 处理具体文件路径
            if (Test-Path $fullPath) {
                $resolvedPaths += $fullPath
            } else {
                Write-BackupLog "路径不存在: $fullPath" "WARN" "PATHS"
            }
        }
    }

    # 应用排除规则
    $excludePatterns = $config.paths.exclude + $ExcludePaths
    $filteredPaths = @()
    foreach ($path in $resolvedPaths) {
        $shouldExclude = $false
        foreach ($excludePattern in $excludePatterns) {
            if ($path -like "*$excludePattern*") {
                $shouldExclude = $true
                break
            }
        }
        if (-not $shouldExclude) {
            $filteredPaths += $path
        }
    }

    return $filteredPaths
}

function New-BackupInfo {
    param(
        [string]$BackupType,
        [string]$BackupName,
        [string]$BackupPath,
        [array]$IncludedFiles,
        [bool]$Compressed,
        [long]$Size
    )

    $backupInfo = @{
        id = [System.Guid]::NewGuid().ToString()
        name = $BackupName
        type = $BackupType
        path = $BackupPath
        size = $Size
        compressed = $Compressed
        createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        filesCount = $IncludedFiles.Count
        includedFiles = $IncludedFiles
        checksum = ""
        status = "completed"
        description = "Backup created by backup.ps1"
        metadata = @{
            version = "1.1.1"
            creator = $env:USERNAME
            machine = $env:COMPUTERNAME
            systemVersion = try { (Get-CimInstance -ClassName Win32_OperatingSystem).Version } catch { $PSVersionTable.PSVersion.ToString() }
        }
    }

    return $backupInfo
}

function Invoke-DataBackup {
    param(
        [string]$BackupType = "full",
        [string]$BackupName = "",
        [string]$BackupPath = "",
        [array]$IncludePaths = @(),
        [array]$ExcludePaths = @(),
        [bool]$Compress = $true
    )

    Write-BackupLog "开始数据备份..." "INFO" "BACKUP"

    try {
        # 生成备份名称
        if ([string]::IsNullOrEmpty($BackupName)) {
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $BackupName = "$BackupType-backup-$timestamp"
        }

        # 确定备份路径
        $config = Get-BackupConfig
        if ([string]::IsNullOrEmpty($BackupPath)) {
            $BackupPath = Join-Path $config.settings.defaultBackupPath $BackupName
        }

        # 获取要备份的文件列表
        $filesToBackup = Get-BackupPaths -BackupType $BackupType -IncludePaths $IncludePaths -ExcludePaths $ExcludePaths

        if ($filesToBackup.Count -eq 0) {
            return @{ Success = $false; Message = "没有找到要备份的文件" }
        }

        Write-BackupLog "找到 $($filesToBackup.Count) 个文件需要备份" "INFO" "BACKUP"

        # 创建备份目录
        $backupDir = Split-Path $BackupPath -Parent
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }

        # 执行备份
        if ($Compress) {
            # 压缩备份
            $zipPath = "$BackupPath.zip"
            Write-BackupLog "创建压缩备份: $zipPath" "INFO" "BACKUP"

            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')

            foreach ($file in $filesToBackup) {
                try {
                    $relativePath = $file.Replace($PROJECT_ROOT, "").TrimStart('\')
                    $entry = $zip.CreateEntry($relativePath)
                    $entryStream = $entry.Open()

                    # 尝试以共享读取模式打开文件
                    $fileStream = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                    $fileStream.CopyTo($entryStream)
                    $fileStream.Close()
                    $entryStream.Close()

                    Write-BackupLog "已备份: $relativePath" "DEBUG" "BACKUP"
                } catch {
                    Write-BackupLog "跳过文件（文件被锁定）: $relativePath - $($_.Exception.Message)" "WARN" "BACKUP"
                    if ($entryStream) { $entryStream.Close() }
                    if ($fileStream) { $fileStream.Close() }
                }
            }

            $zip.Dispose()
            $finalBackupPath = $zipPath
            $backupSize = (Get-Item $zipPath).Length
        } else {
            # 目录备份
            Write-BackupLog "创建目录备份: $BackupPath" "INFO" "BACKUP"

            if (-not (Test-Path $BackupPath)) {
                New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
            }

            $totalSize = 0
            foreach ($file in $filesToBackup) {
                try {
                    $relativePath = $file.Replace($PROJECT_ROOT, "").TrimStart('\')
                    $destPath = Join-Path $BackupPath $relativePath
                    $destDir = Split-Path $destPath -Parent

                    if (-not (Test-Path $destDir)) {
                        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                    }

                    Copy-Item $file $destPath -Force
                    $totalSize += (Get-Item $file).Length

                    Write-BackupLog "已备份: $relativePath" "DEBUG" "BACKUP"
                } catch {
                    Write-BackupLog "跳过文件（文件被锁定）: $relativePath - $($_.Exception.Message)" "WARN" "BACKUP"
                }
            }

            $finalBackupPath = $BackupPath
            $backupSize = $totalSize
        }

        # 创建备份信息
        $backupInfo = New-BackupInfo -BackupType $BackupType -BackupName $BackupName -BackupPath $finalBackupPath -IncludedFiles $filesToBackup -Compressed $Compress -Size $backupSize

        # 计算校验和
        if ($Compress) {
            $backupInfo.checksum = (Get-FileHash $finalBackupPath -Algorithm SHA256).Hash
        }

        # 更新备份注册表
        $registry = Get-BackupRegistry
        $registry.backups += $backupInfo
        $registry.statistics.successfulBackups++
        $registry.statistics.lastBackup = $backupInfo.createdAt
        $registry.statistics.totalSize += $backupSize
        Set-BackupRegistry $registry

        Write-BackupLog "备份完成: $BackupName (大小: $([math]::Round($backupSize / 1MB, 2)) MB)" "SUCCESS" "BACKUP"

        return @{ Success = $true; Message = "备份成功"; BackupInfo = $backupInfo }

    } catch {
        Write-BackupLog "备份失败: $($_.Exception.Message)" "ERROR" "BACKUP"

        # 更新失败统计
        $registry = Get-BackupRegistry
        $registry.statistics.failedBackups++
        Set-BackupRegistry $registry

        return @{ Success = $false; Message = $_.Exception.Message }
    }
}

# ============================================================================
# 主函数
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-BackupHelp
        return
    }
    
    # 初始化配置
    Initialize-BackupConfig
    
    # 执行指定操作
    switch ($Action.ToLower()) {
        "backup" {
            $result = Invoke-DataBackup -BackupType $BackupType -BackupName $BackupName -BackupPath $BackupPath -IncludePaths $IncludePaths -ExcludePaths $ExcludePaths -Compress:$Compress
            if ($result.Success) {
                Write-BackupLog "备份操作成功完成" "SUCCESS" "MAIN"
            } else {
                Write-BackupLog "备份操作失败: $($result.Message)" "ERROR" "MAIN"
            }
        }
        "restore" {
            if ([string]::IsNullOrEmpty($RestoreFrom)) {
                Write-BackupLog "恢复操作需要指定 -RestoreFrom 参数" "ERROR" "MAIN"
                return
            }
            $result = Invoke-DataRestore -RestoreFrom $RestoreFrom -BackupPath $BackupPath
            if ($result.Success) {
                Write-BackupLog "恢复操作成功完成" "SUCCESS" "MAIN"
            } else {
                Write-BackupLog "恢复操作失败: $($result.Message)" "ERROR" "MAIN"
            }
        }
        "schedule" {
            Show-BackupSchedule
        }
        "verify" {
            if ([string]::IsNullOrEmpty($RestoreFrom)) {
                Write-BackupLog "验证操作需要指定 -RestoreFrom 参数" "ERROR" "MAIN"
                return
            }
            $result = Test-BackupIntegrity -BackupName $RestoreFrom
            if ($result.Success) {
                Write-BackupLog "备份验证成功" "SUCCESS" "MAIN"
            } else {
                Write-BackupLog "备份验证失败: $($result.Message)" "ERROR" "MAIN"
            }
        }
        "clean" {
            $result = Remove-OldBackups
            Write-BackupLog "清理操作完成，删除了 $($result.DeletedCount) 个过期备份" "SUCCESS" "MAIN"
        }
        "list" {
            Show-BackupList
        }
        "status" {
            Show-BackupStatus
        }
        "interactive" {
            Start-InteractiveBackupManager
        }
        default {
            Write-BackupLog "未知操作: $Action" "ERROR" "MAIN"
            Show-BackupHelp
        }
    }
}

function Invoke-DataRestore {
    param(
        [string]$RestoreFrom,
        [string]$BackupPath = ""
    )

    Write-BackupLog "开始数据恢复..." "INFO" "RESTORE"

    try {
        # 查找备份信息
        $registry = Get-BackupRegistry
        $backupInfo = $registry.backups | Where-Object { $_.name -eq $RestoreFrom -or $_.id -eq $RestoreFrom }

        if (-not $backupInfo) {
            return @{ Success = $false; Message = "找不到指定的备份: $RestoreFrom" }
        }

        $sourcePath = $backupInfo.path
        if (-not (Test-Path $sourcePath)) {
            return @{ Success = $false; Message = "备份文件不存在: $sourcePath" }
        }

        Write-BackupLog "恢复备份: $($backupInfo.name)" "INFO" "RESTORE"

        # 创建恢复前备份
        Write-BackupLog "创建恢复前备份..." "INFO" "RESTORE"
        $preRestoreBackup = Invoke-DataBackup -BackupType "full" -BackupName "pre-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

        if ($backupInfo.compressed) {
            # 解压缩恢复
            Write-BackupLog "解压缩备份文件..." "INFO" "RESTORE"

            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)

            foreach ($entry in $zip.Entries) {
                $destPath = Join-Path $PROJECT_ROOT $entry.FullName
                $destDir = Split-Path $destPath -Parent

                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }

                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
                Write-BackupLog "已恢复: $($entry.FullName)" "DEBUG" "RESTORE"
            }

            $zip.Dispose()
        } else {
            # 目录恢复
            Write-BackupLog "复制备份文件..." "INFO" "RESTORE"

            $sourceFiles = Get-ChildItem -Path $sourcePath -Recurse -File
            foreach ($file in $sourceFiles) {
                $relativePath = $file.FullName.Replace($sourcePath, "").TrimStart('\')
                $destPath = Join-Path $PROJECT_ROOT $relativePath
                $destDir = Split-Path $destPath -Parent

                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }

                Copy-Item $file.FullName $destPath -Force
                Write-BackupLog "已恢复: $relativePath" "DEBUG" "RESTORE"
            }
        }

        Write-BackupLog "数据恢复完成: $($backupInfo.name)" "SUCCESS" "RESTORE"
        return @{ Success = $true; Message = "恢复成功"; PreRestoreBackup = $preRestoreBackup.BackupInfo }

    } catch {
        Write-BackupLog "恢复失败: $($_.Exception.Message)" "ERROR" "RESTORE"
        return @{ Success = $false; Message = $_.Exception.Message }
    }
}

function Test-BackupIntegrity {
    param([string]$BackupName)

    Write-BackupLog "验证备份完整性..." "INFO" "VERIFY"

    try {
        $registry = Get-BackupRegistry
        $backupInfo = $registry.backups | Where-Object { $_.name -eq $BackupName -or $_.id -eq $BackupName }

        if (-not $backupInfo) {
            return @{ Success = $false; Message = "找不到指定的备份: $BackupName" }
        }

        $backupPath = $backupInfo.path
        if (-not (Test-Path $backupPath)) {
            return @{ Success = $false; Message = "备份文件不存在: $backupPath" }
        }

        # 验证文件大小
        $currentSize = (Get-Item $backupPath).Length
        if ($currentSize -ne $backupInfo.size) {
            return @{ Success = $false; Message = "文件大小不匹配，可能已损坏" }
        }

        # 验证校验和（如果有）
        if (-not [string]::IsNullOrEmpty($backupInfo.checksum)) {
            $currentChecksum = (Get-FileHash $backupPath -Algorithm SHA256).Hash
            if ($currentChecksum -ne $backupInfo.checksum) {
                return @{ Success = $false; Message = "校验和不匹配，文件可能已损坏" }
            }
        }

        # 验证压缩文件内容（如果是压缩备份）
        if ($backupInfo.compressed) {
            try {
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $zip = [System.IO.Compression.ZipFile]::OpenRead($backupPath)
                $entryCount = $zip.Entries.Count
                $zip.Dispose()

                Write-BackupLog "压缩文件包含 $entryCount 个条目" "DEBUG" "VERIFY"
            } catch {
                return @{ Success = $false; Message = "无法读取压缩文件，可能已损坏" }
            }
        }

        Write-BackupLog "备份验证成功: $BackupName" "SUCCESS" "VERIFY"
        return @{ Success = $true; Message = "备份完整性验证通过" }

    } catch {
        Write-BackupLog "验证失败: $($_.Exception.Message)" "ERROR" "VERIFY"
        return @{ Success = $false; Message = $_.Exception.Message }
    }
}

function Remove-OldBackups {
    Write-BackupLog "清理过期备份..." "INFO" "CLEAN"

    try {
        $config = Get-BackupConfig
        $registry = Get-BackupRegistry
        $retentionDays = $config.settings.maxBackupRetention
        $cutoffDate = (Get-Date).AddDays(-$retentionDays)

        $deletedCount = 0
        $backupsToKeep = @()

        foreach ($backup in $registry.backups) {
            $backupDate = [DateTime]::Parse($backup.createdAt)
            if ($backupDate -lt $cutoffDate) {
                # 删除过期备份
                if (Test-Path $backup.path) {
                    Remove-Item $backup.path -Force -Recurse
                    Write-BackupLog "删除过期备份: $($backup.name)" "INFO" "CLEAN"
                    $deletedCount++
                }
            } else {
                $backupsToKeep += $backup
            }
        }

        # 更新注册表
        $registry.backups = $backupsToKeep
        Set-BackupRegistry $registry

        Write-BackupLog "清理完成，删除了 $deletedCount 个过期备份" "SUCCESS" "CLEAN"
        return @{ DeletedCount = $deletedCount }

    } catch {
        Write-BackupLog "清理失败: $($_.Exception.Message)" "ERROR" "CLEAN"
        return @{ DeletedCount = 0 }
    }
}

function Show-BackupList {
    Write-Host ""
    Write-Host "📋 备份列表" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $registry = Get-BackupRegistry

    if ($registry.backups.Count -eq 0) {
        Write-Host "📭 没有找到备份记录" -ForegroundColor Yellow
        return
    }

    Write-Host "📊 总体统计:" -ForegroundColor Yellow
    Write-Host "  📈 总备份数: $($registry.statistics.totalBackups)" -ForegroundColor Cyan
    Write-Host "  ✅ 成功备份: $($registry.statistics.successfulBackups)" -ForegroundColor Green
    Write-Host "  ❌ 失败备份: $($registry.statistics.failedBackups)" -ForegroundColor Red
    Write-Host "  💾 总大小: $([math]::Round($registry.statistics.totalSize / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "  🕐 最后备份: $($registry.statistics.lastBackup)" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "📋 备份详细列表:" -ForegroundColor Yellow
    foreach ($backup in $registry.backups | Sort-Object { [DateTime]::Parse($_.createdAt) } -Descending) {
        $statusIcon = if ($backup.status -eq "completed") { "✅" } else { "❌" }
        $sizeText = [math]::Round($backup.size / 1MB, 2)
        $typeIcon = switch ($backup.type) {
            "full" { "🔄" }
            "incremental" { "📈" }
            "config" { "⚙️" }
            "logs" { "📝" }
            "api" { "🔌" }
            default { "📦" }
        }

        Write-Host "  $statusIcon $typeIcon $($backup.name)" -ForegroundColor Cyan
        Write-Host "    📅 创建时间: $($backup.createdAt)" -ForegroundColor Gray
        Write-Host "    📂 类型: $($backup.type)" -ForegroundColor Gray
        Write-Host "    💾 大小: $sizeText MB" -ForegroundColor Gray
        Write-Host "    📁 路径: $($backup.path)" -ForegroundColor Gray
        Write-Host "    📊 文件数: $($backup.filesCount)" -ForegroundColor Gray
        if ($backup.compressed) {
            Write-Host "    🗜️ 已压缩" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

function Show-BackupStatus {
    Write-Host ""
    Write-Host "📊 备份系统状态" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $config = Get-BackupConfig
    $registry = Get-BackupRegistry

    Write-Host "⚙️ 系统配置:" -ForegroundColor Yellow
    Write-Host "  📁 默认备份路径: $($config.settings.defaultBackupPath)" -ForegroundColor Cyan
    Write-Host "  🗓️ 保留天数: $($config.settings.maxBackupRetention) 天" -ForegroundColor Cyan
    Write-Host "  🗜️ 压缩启用: $(if ($config.settings.compressionEnabled) { '✅ 是' } else { '❌ 否' })" -ForegroundColor Cyan
    Write-Host "  ✅ 验证启用: $(if ($config.settings.verificationEnabled) { '✅ 是' } else { '❌ 否' })" -ForegroundColor Cyan
    Write-Host "  📈 增量备份: $(if ($config.settings.incrementalEnabled) { '✅ 是' } else { '❌ 否' })" -ForegroundColor Cyan
    Write-Host "  ⏰ 调度启用: $(if ($config.settings.scheduleEnabled) { '✅ 是' } else { '❌ 否' })" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "📈 统计信息:" -ForegroundColor Yellow
    Write-Host "  📦 总备份数: $($registry.statistics.totalBackups)" -ForegroundColor Cyan
    Write-Host "  ✅ 成功备份: $($registry.statistics.successfulBackups)" -ForegroundColor Green
    Write-Host "  ❌ 失败备份: $($registry.statistics.failedBackups)" -ForegroundColor Red
    Write-Host "  💾 总存储: $([math]::Round($registry.statistics.totalSize / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "  🕐 最后备份: $($registry.statistics.lastBackup)" -ForegroundColor Cyan
    Write-Host ""

    # 检查备份路径状态
    $backupDir = $config.settings.defaultBackupPath
    if (Test-Path $backupDir) {
        $dirSize = (Get-ChildItem $backupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
        Write-Host "📁 备份目录状态:" -ForegroundColor Yellow
        Write-Host "  📂 路径: $backupDir" -ForegroundColor Cyan
        Write-Host "  💾 占用空间: $([math]::Round($dirSize / 1MB, 2)) MB" -ForegroundColor Cyan
        Write-Host "  📊 文件数量: $((Get-ChildItem $backupDir -Recurse -File).Count)" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️ 备份目录不存在: $backupDir" -ForegroundColor Yellow
    }
}

function Show-BackupSchedule {
    Write-Host ""
    Write-Host "⏰ 备份调度配置" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    $config = Get-BackupConfig
    $schedule = $config.schedule

    Write-Host "📅 调度状态:" -ForegroundColor Yellow
    Write-Host "  🔄 启用状态: $(if ($schedule.enabled) { '✅ 已启用' } else { '❌ 已禁用' })" -ForegroundColor Cyan
    Write-Host "  🔄 完整备份: $($schedule.fullBackupInterval)" -ForegroundColor Cyan
    Write-Host "  📈 增量备份: $($schedule.incrementalInterval)" -ForegroundColor Cyan
    Write-Host "  🕐 执行时间: $($schedule.time)" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "🗓️ 保留策略:" -ForegroundColor Yellow
    Write-Host "  📅 每日备份: 保留 $($schedule.retention.daily) 天" -ForegroundColor Cyan
    Write-Host "  📅 每周备份: 保留 $($schedule.retention.weekly) 周" -ForegroundColor Cyan
    Write-Host "  📅 每月备份: 保留 $($schedule.retention.monthly) 月" -ForegroundColor Cyan
    Write-Host ""

    if (-not $schedule.enabled) {
        Write-Host "💡 提示: 使用以下命令启用调度备份:" -ForegroundColor Yellow
        Write-Host "  .\backup.ps1 -Action schedule -Enable" -ForegroundColor Cyan
    }
}

function Start-InteractiveBackupManager {
    while ($true) {
        Clear-Host
        Write-Host ""
        Write-Host "🗄️ 数据备份管理系统 - 交互式界面" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 可用操作:" -ForegroundColor Yellow
        Write-Host "  1. 🗄️ 创建备份" -ForegroundColor Cyan
        Write-Host "  2. 🔄 恢复数据" -ForegroundColor Cyan
        Write-Host "  3. ✅ 验证备份" -ForegroundColor Cyan
        Write-Host "  4. 📋 查看备份列表" -ForegroundColor Cyan
        Write-Host "  5. 📊 系统状态" -ForegroundColor Cyan
        Write-Host "  6. ⏰ 调度配置" -ForegroundColor Cyan
        Write-Host "  7. 🧹 清理过期备份" -ForegroundColor Cyan
        Write-Host "  8. ⚙️ 系统配置" -ForegroundColor Cyan
        Write-Host "  0. 🚪 退出" -ForegroundColor Red
        Write-Host ""

        $choice = Read-Host "请选择操作 (0-8)"

        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "🗄️ 创建备份" -ForegroundColor Yellow
                Write-Host "备份类型: 1=完整备份, 2=配置备份, 3=日志备份, 4=API备份, 5=自定义备份"
                $typeChoice = Read-Host "请选择备份类型 (1-5)"

                $backupType = switch ($typeChoice) {
                    "1" { "full" }
                    "2" { "config" }
                    "3" { "logs" }
                    "4" { "api" }
                    "5" { "custom" }
                    default { "full" }
                }

                $backupName = Read-Host "备份名称 (可选，留空自动生成)"
                $compress = (Read-Host "是否压缩? (y/N)") -eq "y"

                Write-Host "正在创建备份..." -ForegroundColor Yellow
                $result = Invoke-DataBackup -BackupType $backupType -BackupName $backupName -Compress $compress

                if ($result.Success) {
                    Write-Host "✅ 备份创建成功!" -ForegroundColor Green
                } else {
                    Write-Host "❌ 备份创建失败: $($result.Message)" -ForegroundColor Red
                }
                Read-Host "按回车键继续"
            }
            "2" {
                Write-Host ""
                Write-Host "🔄 恢复数据" -ForegroundColor Yellow
                Show-BackupList
                $restoreFrom = Read-Host "请输入要恢复的备份名称"

                if (-not [string]::IsNullOrEmpty($restoreFrom)) {
                    Write-Host "正在恢复数据..." -ForegroundColor Yellow
                    $result = Invoke-DataRestore -RestoreFrom $restoreFrom

                    if ($result.Success) {
                        Write-Host "✅ 数据恢复成功!" -ForegroundColor Green
                    } else {
                        Write-Host "❌ 数据恢复失败: $($result.Message)" -ForegroundColor Red
                    }
                }
                Read-Host "按回车键继续"
            }
            "3" {
                Write-Host ""
                Write-Host "✅ 验证备份" -ForegroundColor Yellow
                Show-BackupList
                $verifyBackup = Read-Host "请输入要验证的备份名称"

                if (-not [string]::IsNullOrEmpty($verifyBackup)) {
                    Write-Host "正在验证备份..." -ForegroundColor Yellow
                    $result = Test-BackupIntegrity -BackupName $verifyBackup

                    if ($result.Success) {
                        Write-Host "✅ 备份验证通过!" -ForegroundColor Green
                    } else {
                        Write-Host "❌ 备份验证失败: $($result.Message)" -ForegroundColor Red
                    }
                }
                Read-Host "按回车键继续"
            }
            "4" {
                Show-BackupList
                Read-Host "按回车键继续"
            }
            "5" {
                Show-BackupStatus
                Read-Host "按回车键继续"
            }
            "6" {
                Show-BackupSchedule
                Read-Host "按回车键继续"
            }
            "7" {
                Write-Host ""
                Write-Host "🧹 清理过期备份" -ForegroundColor Yellow
                $confirm = Read-Host "确认清理过期备份? (y/N)"

                if ($confirm -eq "y") {
                    $result = Remove-OldBackups
                    Write-Host "✅ 清理完成，删除了 $($result.DeletedCount) 个过期备份" -ForegroundColor Green
                }
                Read-Host "按回车键继续"
            }
            "8" {
                Write-Host ""
                Write-Host "⚙️ 系统配置功能开发中..." -ForegroundColor Yellow
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

function Show-BackupHelp {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  智能多Web应用门户系统 - 数据备份管理工具 v1.1.1" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\backup.ps1 -Action <操作> [参数]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚙️ 可用操作:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  🗄️ 备份操作:" -ForegroundColor Magenta
    Write-Host "    backup -BackupType <类型> -BackupName <名称> -Compress  创建备份" -ForegroundColor Cyan
    Write-Host "    restore -RestoreFrom <备份名称>                        恢复数据" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ✅ 验证和管理:" -ForegroundColor Magenta
    Write-Host "    verify -RestoreFrom <备份名称>                         验证备份完整性" -ForegroundColor Cyan
    Write-Host "    list                                                   显示备份列表" -ForegroundColor Cyan
    Write-Host "    status                                                 显示系统状态" -ForegroundColor Cyan
    Write-Host "    clean                                                  清理过期备份" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ⏰ 调度管理:" -ForegroundColor Magenta
    Write-Host "    schedule                                               显示调度配置" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  🎨 交互式管理:" -ForegroundColor Magenta
    Write-Host "    interactive                                            启动交互式界面" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 备份类型:" -ForegroundColor Yellow
    Write-Host "  full        完整备份（所有文件）" -ForegroundColor Cyan
    Write-Host "  config      配置文件备份" -ForegroundColor Cyan
    Write-Host "  logs        日志文件备份" -ForegroundColor Cyan
    Write-Host "  api         API配置备份" -ForegroundColor Cyan
    Write-Host "  custom      自定义备份" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 使用示例:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  # 创建完整备份" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action backup -BackupType full -Compress" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 创建配置备份" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action backup -BackupType config -BackupName 'config-backup-v1'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 恢复备份" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action restore -RestoreFrom 'full-backup-20250923-120000'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 验证备份" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action verify -RestoreFrom 'config-backup-v1'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 查看备份列表" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action list" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # 启动交互式界面" -ForegroundColor Gray
    Write-Host "  .\backup.ps1 -Action interactive" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 配置文件:" -ForegroundColor Yellow
    Write-Host "  备份配置: backups\backup-config.json" -ForegroundColor Cyan
    Write-Host "  备份注册表: backups\backup-registry.json" -ForegroundColor Cyan
    Write-Host "  日志文件: logs\backup.log" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
}

# 执行主函数
Main
