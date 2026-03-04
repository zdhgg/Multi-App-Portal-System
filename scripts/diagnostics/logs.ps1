# 智能多Web应用门户系统 - 统一日志管理系统
# 提供日志收集、查看、搜索、清理等功能
# 作者: Augment Agent
# 版本: 2.0.0

param(
    [ValidateSet("view", "search", "clean", "stats", "tail", "archive", "help")]
    [string]$Action = "view",
    [ValidateSet("system", "recovery", "monitor", "startup", "api", "all")]
    [string]$Component = "all",
    [ValidateSet("DEBUG", "INFO", "WARN", "ERROR", "SUCCESS", "FATAL", "ALL")]
    [string]$Level = "ALL",
    [string]$SearchTerm = "",
    [string]$TimeRange = "24h",  # 1h, 6h, 24h, 7d, 30d
    [int]$Lines = 50,
    [string]$OutputFile = "",
    [switch]$Follow,
    [switch]$NoColor,
    [switch]$Verbose,
    [switch]$Help
)

# ============================================================================
# 全局配置和变量
# ============================================================================

$SCRIPT_VERSION = "2.0.0"
$SCRIPT_NAME = "智能多Web应用门户系统统一日志管理"

# 路径配置
$PROJECT_ROOT = $PSScriptRoot
$LOGS_DIR = Join-Path $PROJECT_ROOT "logs"
$ARCHIVE_DIR = Join-Path $LOGS_DIR "archive"

# 日志文件配置
$LOG_FILES = @{
    system = Join-Path $LOGS_DIR "system.log"
    recovery = Join-Path $LOGS_DIR "recovery.log"
    monitor = Join-Path $LOGS_DIR "monitor.log"
    startup = Join-Path $LOGS_DIR "startup.log"
    api = Join-Path $LOGS_DIR "api.log"
}

# 日志配置
$LOG_CONFIG = @{
    MaxFileSize = 10MB
    MaxAge = 30  # 天
    ArchiveAfter = 7  # 天
    DateFormat = "yyyy-MM-dd HH:mm:ss.fff"
    LineFormat = "[{0}] [{1}] [{2}] [{3}] {4}"
}

# 颜色配置
$COLORS = @{
    DEBUG = "Gray"
    INFO = "White"
    WARN = "Yellow"
    ERROR = "Red"
    SUCCESS = "Green"
    FATAL = "Magenta"
    TIMESTAMP = "Cyan"
    COMPONENT = "Blue"
    SOURCE = "DarkGray"
}

# ============================================================================
# 工具函数
# ============================================================================

function Write-LogMessage {
    param(
        [string]$Message,
        [ValidateSet("DEBUG", "INFO", "WARN", "ERROR", "SUCCESS", "FATAL")]
        [string]$Level = "INFO",
        [string]$Component = "LOGS",
        [string]$Source = "logs.ps1"
    )
    
    $timestamp = Get-Date -Format $LOG_CONFIG.DateFormat
    $logEntry = $LOG_CONFIG.LineFormat -f $timestamp, $Component, $Level, $Source, $Message
    
    # 写入系统日志
    try {
        Initialize-LogDirectory
        Add-Content -Path $LOG_FILES.system -Value $logEntry -Encoding UTF8
    } catch {
        # 忽略日志写入错误
    }
    
    # 控制台输出
    if ($Verbose -or $Level -in @("ERROR", "WARN", "SUCCESS")) {
        if (-not $NoColor) {
            Write-ColoredLog $logEntry $Level
        } else {
            Write-Host $logEntry
        }
    }
}

function Write-ColoredLog {
    param([string]$LogEntry, [string]$Level)
    
    # 解析日志条目
    if ($LogEntry -match '^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$') {
        $timestamp = $matches[1]
        $component = $matches[2]
        $logLevel = $matches[3]
        $source = $matches[4]
        $message = $matches[5]
        
        Write-Host "[" -NoNewline
        Write-Host $timestamp -ForegroundColor $COLORS.TIMESTAMP -NoNewline
        Write-Host "] [" -NoNewline
        Write-Host $component -ForegroundColor $COLORS.COMPONENT -NoNewline
        Write-Host "] [" -NoNewline
        Write-Host $logLevel -ForegroundColor $COLORS[$Level] -NoNewline
        Write-Host "] [" -NoNewline
        Write-Host $source -ForegroundColor $COLORS.SOURCE -NoNewline
        Write-Host "] " -NoNewline
        Write-Host $message -ForegroundColor $COLORS[$Level]
    } else {
        Write-Host $LogEntry -ForegroundColor $COLORS[$Level]
    }
}

function Initialize-LogDirectory {
    if (-not (Test-Path $LOGS_DIR)) {
        New-Item -Path $LOGS_DIR -ItemType Directory -Force | Out-Null
        Write-LogMessage "日志目录创建成功: $LOGS_DIR" "INFO"
    }
    
    if (-not (Test-Path $ARCHIVE_DIR)) {
        New-Item -Path $ARCHIVE_DIR -ItemType Directory -Force | Out-Null
        Write-LogMessage "归档目录创建成功: $ARCHIVE_DIR" "INFO"
    }
}

function Get-TimeRangeFilter {
    param([string]$Range)
    
    $now = Get-Date
    switch ($Range) {
        "1h" { return $now.AddHours(-1) }
        "6h" { return $now.AddHours(-6) }
        "24h" { return $now.AddHours(-24) }
        "7d" { return $now.AddDays(-7) }
        "30d" { return $now.AddDays(-30) }
        default { return $now.AddHours(-24) }
    }
}

function Get-LogFiles {
    param([string]$ComponentFilter)
    
    $files = @()
    
    if ($ComponentFilter -eq "all") {
        $files = $LOG_FILES.Values | Where-Object { Test-Path $_ }
        
        # 添加legacy日志文件
        $legacyFiles = @(
            (Join-Path $PROJECT_ROOT "recovery-log.txt"),
            (Join-Path $PROJECT_ROOT "detection-api/logs/combined.log")
        )
        
        foreach ($file in $legacyFiles) {
            if (Test-Path $file) {
                $files += $file
            }
        }
    } else {
        $targetFile = $LOG_FILES[$ComponentFilter]
        if ($targetFile -and (Test-Path $targetFile)) {
            $files = @($targetFile)
        }
    }
    
    return $files
}

function Parse-LogEntry {
    param([string]$Line)
    
    # 标准格式解析
    if ($Line -match '^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$') {
        return @{
            Timestamp = [DateTime]::ParseExact($matches[1], $LOG_CONFIG.DateFormat, $null)
            Component = $matches[2]
            Level = $matches[3]
            Source = $matches[4]
            Message = $matches[5]
            Raw = $Line
        }
    }
    
    # Legacy recovery格式解析
    if ($Line -match '^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$') {
        return @{
            Timestamp = [DateTime]::ParseExact($matches[1], "yyyy-MM-dd HH:mm:ss", $null)
            Component = $matches[2]
            Level = $matches[3]
            Source = "legacy"
            Message = $matches[4]
            Raw = $Line
        }
    }
    
    # JSON格式解析（API日志）
    try {
        $json = $Line | ConvertFrom-Json
        if ($json.timestamp -and $json.level -and $json.message) {
            return @{
                Timestamp = [DateTime]::ParseExact($json.timestamp, "yyyy-MM-dd HH:mm:ss", $null)
                Component = "API"
                Level = $json.level.ToUpper()
                Source = "api"
                Message = $json.message
                Raw = $Line
            }
        }
    } catch {
        # 不是JSON格式
    }
    
    # 无法解析的行
    return @{
        Timestamp = Get-Date
        Component = "UNKNOWN"
        Level = "INFO"
        Source = "unknown"
        Message = $Line
        Raw = $Line
    }
}

function Filter-LogEntries {
    param(
        [array]$Entries,
        [string]$LevelFilter,
        [string]$SearchFilter,
        [DateTime]$TimeFilter
    )
    
    $filtered = $Entries
    
    # 时间过滤
    if ($TimeFilter) {
        $filtered = $filtered | Where-Object { $_.Timestamp -ge $TimeFilter }
    }
    
    # 级别过滤
    if ($LevelFilter -ne "ALL") {
        $filtered = $filtered | Where-Object { $_.Level -eq $LevelFilter }
    }
    
    # 搜索过滤
    if ($SearchFilter) {
        $filtered = $filtered | Where-Object { 
            $_.Message -like "*$SearchFilter*" -or 
            $_.Component -like "*$SearchFilter*" -or 
            $_.Source -like "*$SearchFilter*"
        }
    }
    
    return $filtered
}

# ============================================================================
# 统一日志写入函数（供其他脚本调用）
# ============================================================================

function Write-UnifiedLog {
    param(
        [string]$Message,
        [ValidateSet("DEBUG", "INFO", "WARN", "ERROR", "SUCCESS", "FATAL")]
        [string]$Level = "INFO",
        [ValidateSet("SYSTEM", "RECOVERY", "MONITOR", "STARTUP", "API")]
        [string]$Component = "SYSTEM",
        [string]$Source = $MyInvocation.ScriptName
    )
    
    $timestamp = Get-Date -Format $LOG_CONFIG.DateFormat
    $logEntry = $LOG_CONFIG.LineFormat -f $timestamp, $Component, $Level, $Source, $Message
    
    # 确保日志目录存在
    Initialize-LogDirectory
    
    # 写入对应的组件日志文件
    $componentFile = $LOG_FILES[$Component.ToLower()]
    if ($componentFile) {
        try {
            Add-Content -Path $componentFile -Value $logEntry -Encoding UTF8
        } catch {
            # 写入失败时尝试写入系统日志
            try {
                Add-Content -Path $LOG_FILES.system -Value $logEntry -Encoding UTF8
            } catch {
                # 忽略日志写入错误
            }
        }
    }
    
    # 同时写入系统日志
    try {
        Add-Content -Path $LOG_FILES.system -Value $logEntry -Encoding UTF8
    } catch {
        # 忽略日志写入错误
    }
}

# ============================================================================
# 日志查看和搜索功能
# ============================================================================

function Show-LogEntries {
    param(
        [string]$ComponentFilter,
        [string]$LevelFilter,
        [string]$SearchFilter,
        [string]$TimeRangeFilter,
        [int]$MaxLines
    )

    Write-LogMessage "开始查看日志 - 组件: $ComponentFilter, 级别: $LevelFilter" "INFO"

    $logFiles = Get-LogFiles $ComponentFilter
    if ($logFiles.Count -eq 0) {
        Write-Host "❌ 未找到匹配的日志文件" -ForegroundColor Red
        return
    }

    $allEntries = @()
    $timeFilter = Get-TimeRangeFilter $TimeRangeFilter

    foreach ($file in $logFiles) {
        Write-LogMessage "读取日志文件: $file" "DEBUG"

        try {
            $lines = Get-Content $file -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line.Trim()) {
                    $entry = Parse-LogEntry $line
                    $allEntries += $entry
                }
            }
        } catch {
            Write-LogMessage "读取日志文件失败: $file - $($_.Exception.Message)" "WARN"
        }
    }

    # 过滤和排序
    $filteredEntries = Filter-LogEntries $allEntries $LevelFilter $SearchFilter $timeFilter
    $sortedEntries = $filteredEntries | Sort-Object Timestamp -Descending | Select-Object -First $MaxLines

    # 显示结果
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  日志查看结果 - 共 $($sortedEntries.Count) 条记录" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    if ($sortedEntries.Count -eq 0) {
        Write-Host "📝 没有找到匹配的日志条目" -ForegroundColor Yellow
        return
    }

    foreach ($entry in $sortedEntries) {
        if (-not $NoColor) {
            Write-ColoredLog $entry.Raw $entry.Level
        } else {
            Write-Host $entry.Raw
        }
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
}

function Search-LogEntries {
    param(
        [string]$SearchTerm,
        [string]$ComponentFilter,
        [string]$LevelFilter,
        [string]$TimeRangeFilter,
        [int]$MaxLines
    )

    if (-not $SearchTerm) {
        Write-Host "❌ 请提供搜索关键词" -ForegroundColor Red
        return
    }

    Write-LogMessage "搜索日志 - 关键词: $SearchTerm" "INFO"

    $logFiles = Get-LogFiles $ComponentFilter
    if ($logFiles.Count -eq 0) {
        Write-Host "❌ 未找到匹配的日志文件" -ForegroundColor Red
        return
    }

    $matchedEntries = @()
    $timeFilter = Get-TimeRangeFilter $TimeRangeFilter

    foreach ($file in $logFiles) {
        try {
            $lines = Get-Content $file -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line.Trim() -and ($line -like "*$SearchTerm*")) {
                    $entry = Parse-LogEntry $line
                    $matchedEntries += $entry
                }
            }
        } catch {
            Write-LogMessage "搜索日志文件失败: $file - $($_.Exception.Message)" "WARN"
        }
    }

    # 过滤和排序
    $filteredEntries = Filter-LogEntries $matchedEntries $LevelFilter "" $timeFilter
    $sortedEntries = $filteredEntries | Sort-Object Timestamp -Descending | Select-Object -First $MaxLines

    # 显示结果
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  搜索结果: '$SearchTerm' - 共 $($sortedEntries.Count) 条匹配记录" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    if ($sortedEntries.Count -eq 0) {
        Write-Host "🔍 没有找到匹配 '$SearchTerm' 的日志条目" -ForegroundColor Yellow
        return
    }

    foreach ($entry in $sortedEntries) {
        if (-not $NoColor) {
            # 高亮搜索关键词
            $highlightedRaw = $entry.Raw -replace "($SearchTerm)", "⭐$1⭐"
            Write-ColoredLog $highlightedRaw $entry.Level
        } else {
            Write-Host $entry.Raw
        }
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Show-LogStatistics {
    param(
        [string]$ComponentFilter,
        [string]$TimeRangeFilter
    )

    Write-LogMessage "生成日志统计 - 组件: $ComponentFilter" "INFO"

    $logFiles = Get-LogFiles $ComponentFilter
    if ($logFiles.Count -eq 0) {
        Write-Host "❌ 未找到匹配的日志文件" -ForegroundColor Red
        return
    }

    $allEntries = @()
    $timeFilter = Get-TimeRangeFilter $TimeRangeFilter

    foreach ($file in $logFiles) {
        try {
            $lines = Get-Content $file -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line.Trim()) {
                    $entry = Parse-LogEntry $line
                    if ($entry.Timestamp -ge $timeFilter) {
                        $allEntries += $entry
                    }
                }
            }
        } catch {
            Write-LogMessage "读取统计文件失败: $file - $($_.Exception.Message)" "WARN"
        }
    }

    # 统计分析
    $totalEntries = $allEntries.Count
    $levelStats = $allEntries | Group-Object Level | Sort-Object Count -Descending
    $componentStats = $allEntries | Group-Object Component | Sort-Object Count -Descending
    $sourceStats = $allEntries | Group-Object Source | Sort-Object Count -Descending

    # 时间分布统计
    $hourlyStats = $allEntries | Group-Object { $_.Timestamp.Hour } | Sort-Object Name

    # 显示统计结果
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  日志统计报告 - 时间范围: $TimeRangeFilter" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host ""

    Write-Host "📊 总体统计:" -ForegroundColor Yellow
    Write-Host "  • 总日志条目: $totalEntries" -ForegroundColor White
    Write-Host "  • 时间范围: $(Get-TimeRangeFilter $TimeRangeFilter) - $(Get-Date)" -ForegroundColor White
    Write-Host ""

    Write-Host "📈 按级别统计:" -ForegroundColor Yellow
    foreach ($stat in $levelStats) {
        $percentage = [math]::Round(($stat.Count / $totalEntries) * 100, 1)
        $color = $COLORS[$stat.Name]
        Write-Host "  • $($stat.Name): $($stat.Count) ($percentage%)" -ForegroundColor $color
    }
    Write-Host ""

    Write-Host "🏗️ 按组件统计:" -ForegroundColor Yellow
    foreach ($stat in $componentStats | Select-Object -First 10) {
        $percentage = [math]::Round(($stat.Count / $totalEntries) * 100, 1)
        Write-Host "  • $($stat.Name): $($stat.Count) ($percentage%)" -ForegroundColor Blue
    }
    Write-Host ""

    Write-Host "📁 按源文件统计:" -ForegroundColor Yellow
    foreach ($stat in $sourceStats | Select-Object -First 10) {
        $percentage = [math]::Round(($stat.Count / $totalEntries) * 100, 1)
        Write-Host "  • $($stat.Name): $($stat.Count) ($percentage%)" -ForegroundColor DarkGray
    }
    Write-Host ""

    Write-Host "⏰ 按小时分布:" -ForegroundColor Yellow
    foreach ($stat in $hourlyStats) {
        $hour = "{0:D2}:00" -f [int]$stat.Name
        $bar = "█" * [math]::Min(($stat.Count / ($hourlyStats | Measure-Object Count -Maximum).Maximum * 20), 20)
        Write-Host "  • $hour $bar $($stat.Count)" -ForegroundColor Cyan
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
}

# ============================================================================
# 日志清理和归档功能
# ============================================================================

function Clear-LogFiles {
    param(
        [string]$ComponentFilter,
        [switch]$Archive,
        [switch]$Force
    )

    Write-LogMessage "开始日志清理 - 组件: $ComponentFilter, 归档: $Archive" "INFO"

    if (-not $Force) {
        $confirmation = Read-Host "确定要清理日志文件吗？这将删除或归档现有日志。(y/N)"
        if ($confirmation -ne "y" -and $confirmation -ne "Y") {
            Write-Host "❌ 操作已取消" -ForegroundColor Yellow
            return
        }
    }

    $logFiles = Get-LogFiles $ComponentFilter
    $cleanedCount = 0
    $archivedCount = 0

    foreach ($file in $logFiles) {
        if (-not (Test-Path $file)) {
            continue
        }

        $fileInfo = Get-Item $file
        $fileName = $fileInfo.Name
        $fileSize = $fileInfo.Length

        Write-LogMessage "处理日志文件: $fileName (大小: $([math]::Round($fileSize/1MB, 2))MB)" "INFO"

        if ($Archive) {
            # 归档文件
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $archiveFileName = "$($fileName.Replace('.log', ''))-$timestamp.log"
            $archivePath = Join-Path $ARCHIVE_DIR $archiveFileName

            try {
                Copy-Item $file $archivePath -Force
                Clear-Content $file
                $archivedCount++
                Write-LogMessage "文件已归档: $archiveFileName" "SUCCESS"
            } catch {
                Write-LogMessage "归档失败: $fileName - $($_.Exception.Message)" "ERROR"
            }
        } else {
            # 直接清空文件
            try {
                Clear-Content $file
                $cleanedCount++
                Write-LogMessage "文件已清空: $fileName" "SUCCESS"
            } catch {
                Write-LogMessage "清空失败: $fileName - $($_.Exception.Message)" "ERROR"
            }
        }
    }

    Write-Host ""
    Write-Host "🧹 日志清理完成:" -ForegroundColor Green
    if ($Archive) {
        Write-Host "  • 归档文件数: $archivedCount" -ForegroundColor Cyan
    } else {
        Write-Host "  • 清空文件数: $cleanedCount" -ForegroundColor Cyan
    }
    Write-Host ""
}

function Remove-OldLogFiles {
    param([int]$DaysOld = 30)

    Write-LogMessage "清理 $DaysOld 天前的旧日志文件" "INFO"

    $cutoffDate = (Get-Date).AddDays(-$DaysOld)
    $removedCount = 0
    $totalSize = 0

    # 清理归档目录中的旧文件
    if (Test-Path $ARCHIVE_DIR) {
        $oldFiles = Get-ChildItem $ARCHIVE_DIR -File | Where-Object { $_.LastWriteTime -lt $cutoffDate }

        foreach ($file in $oldFiles) {
            $totalSize += $file.Length
            try {
                Remove-Item $file.FullName -Force
                $removedCount++
                Write-LogMessage "删除旧日志文件: $($file.Name)" "INFO"
            } catch {
                Write-LogMessage "删除失败: $($file.Name) - $($_.Exception.Message)" "ERROR"
            }
        }
    }

    Write-Host ""
    Write-Host "🗑️ 旧日志清理完成:" -ForegroundColor Green
    Write-Host "  • 删除文件数: $removedCount" -ForegroundColor Cyan
    Write-Host "  • 释放空间: $([math]::Round($totalSize/1MB, 2))MB" -ForegroundColor Cyan
    Write-Host ""
}

function Start-LogTail {
    param(
        [string]$ComponentFilter,
        [string]$LevelFilter,
        [int]$RefreshInterval = 1
    )

    Write-LogMessage "开始实时日志监控 - 组件: $ComponentFilter" "INFO"

    $logFiles = Get-LogFiles $ComponentFilter
    if ($logFiles.Count -eq 0) {
        Write-Host "❌ 未找到匹配的日志文件" -ForegroundColor Red
        return
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  实时日志监控 - 按 Ctrl+C 退出" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    # 记录每个文件的最后位置
    $filePositions = @{}
    foreach ($file in $logFiles) {
        if (Test-Path $file) {
            $filePositions[$file] = (Get-Item $file).Length
        }
    }

    $isRunning = $true

    # 注册退出处理
    Register-EngineEvent PowerShell.Exiting -Action {
        $script:isRunning = $false
    }

    while ($isRunning) {
        try {
            foreach ($file in $logFiles) {
                if (-not (Test-Path $file)) {
                    continue
                }

                $currentSize = (Get-Item $file).Length
                $lastPosition = $filePositions[$file]

                if ($currentSize -gt $lastPosition) {
                    # 读取新增内容
                    $stream = [System.IO.File]::OpenRead($file)
                    $stream.Seek($lastPosition, [System.IO.SeekOrigin]::Begin)
                    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)

                    while (-not $reader.EndOfStream) {
                        $line = $reader.ReadLine()
                        if ($line.Trim()) {
                            $entry = Parse-LogEntry $line

                            # 级别过滤
                            if ($LevelFilter -eq "ALL" -or $entry.Level -eq $LevelFilter) {
                                if (-not $NoColor) {
                                    Write-ColoredLog $entry.Raw $entry.Level
                                } else {
                                    Write-Host $entry.Raw
                                }
                            }
                        }
                    }

                    $reader.Close()
                    $stream.Close()
                    $filePositions[$file] = $currentSize
                }
            }

            Start-Sleep -Seconds $RefreshInterval

        } catch {
            Write-LogMessage "实时监控异常: $($_.Exception.Message)" "ERROR"
            Start-Sleep -Seconds 5
        }
    }

    Write-Host ""
    Write-Host "实时日志监控已停止" -ForegroundColor Yellow
}

# ============================================================================
# 帮助和主函数
# ============================================================================

function Show-LogHelp {
    Clear-Host
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $SCRIPT_NAME v$SCRIPT_VERSION - 帮助文档" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📖 使用方法:" -ForegroundColor Yellow
    Write-Host "  .\logs.ps1 [参数]"
    Write-Host ""
    Write-Host "⚙️ 主要参数:" -ForegroundColor Yellow
    Write-Host "  -Action <操作>        操作类型: view|search|clean|stats|tail|archive|help (默认: view)"
    Write-Host "  -Component <组件>     组件过滤: system|recovery|monitor|startup|api|all (默认: all)"
    Write-Host "  -Level <级别>         日志级别: DEBUG|INFO|WARN|ERROR|SUCCESS|FATAL|ALL (默认: ALL)"
    Write-Host "  -SearchTerm <关键词>  搜索关键词"
    Write-Host "  -TimeRange <范围>     时间范围: 1h|6h|24h|7d|30d (默认: 24h)"
    Write-Host "  -Lines <行数>         显示行数 (默认: 50)"
    Write-Host ""
    Write-Host "🔧 功能开关:" -ForegroundColor Yellow
    Write-Host "  -Follow               实时跟踪日志 (仅用于tail操作)"
    Write-Host "  -NoColor              禁用彩色输出"
    Write-Host "  -Verbose              详细输出"
    Write-Host "  -Help                 显示帮助"
    Write-Host ""
    Write-Host "🎯 操作说明:" -ForegroundColor Yellow
    Write-Host "  view                  查看日志条目"
    Write-Host "  search                搜索日志内容"
    Write-Host "  clean                 清理日志文件"
    Write-Host "  stats                 显示日志统计"
    Write-Host "  tail                  实时监控日志"
    Write-Host "  archive               归档旧日志"
    Write-Host ""
    Write-Host "💡 使用示例:" -ForegroundColor Yellow
    Write-Host "  .\logs.ps1                                    # 查看所有日志"
    Write-Host "  .\logs.ps1 -Action search -SearchTerm 错误    # 搜索错误信息"
    Write-Host "  .\logs.ps1 -Action stats -Component recovery  # 恢复系统统计"
    Write-Host "  .\logs.ps1 -Action tail -Level ERROR          # 实时监控错误日志"
    Write-Host "  .\logs.ps1 -Action clean -Component all       # 清理所有日志"
    Write-Host ""
    Write-Host "📊 日志组件:" -ForegroundColor Yellow
    Write-Host "  system                系统级日志聚合"
    Write-Host "  recovery              恢复系统日志"
    Write-Host "  monitor               监控系统日志"
    Write-Host "  startup               启动系统日志"
    Write-Host "  api                   API服务日志"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Initialize-LogSystem {
    # 创建日志目录结构
    Initialize-LogDirectory

    # 创建默认日志文件
    foreach ($logFile in $LOG_FILES.Values) {
        if (-not (Test-Path $logFile)) {
            try {
                New-Item -Path $logFile -ItemType File -Force | Out-Null
                Write-LogMessage "创建日志文件: $logFile" "INFO"
            } catch {
                Write-LogMessage "创建日志文件失败: $logFile - $($_.Exception.Message)" "ERROR"
            }
        }
    }

    # 迁移legacy日志
    Migrate-LegacyLogs
}

function Migrate-LegacyLogs {
    # 迁移recovery-log.txt到新的recovery.log
    $legacyRecoveryLog = Join-Path $PROJECT_ROOT "recovery-log.txt"
    if (Test-Path $legacyRecoveryLog) {
        try {
            $legacyContent = Get-Content $legacyRecoveryLog -Encoding UTF8
            foreach ($line in $legacyContent) {
                if ($line.Trim()) {
                    # 转换为新格式
                    if ($line -match '^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$') {
                        $timestamp = $matches[1]
                        $component = $matches[2]
                        $level = $matches[3]
                        $message = $matches[4]

                        # 转换为新格式
                        $newTimestamp = Get-Date $timestamp -Format $LOG_CONFIG.DateFormat
                        $newEntry = $LOG_CONFIG.LineFormat -f $newTimestamp, $component, $level, "recovery.ps1", $message
                        Add-Content -Path $LOG_FILES.recovery -Value $newEntry -Encoding UTF8
                    }
                }
            }

            # 备份原文件
            $backupPath = Join-Path $ARCHIVE_DIR "recovery-log-backup-$(Get-Date -Format 'yyyyMMdd').txt"
            Move-Item $legacyRecoveryLog $backupPath -Force
            Write-LogMessage "Legacy日志已迁移并备份: $backupPath" "SUCCESS"
        } catch {
            Write-LogMessage "Legacy日志迁移失败: $($_.Exception.Message)" "ERROR"
        }
    }
}

# ============================================================================
# 主函数
# ============================================================================

function Main {
    # 处理帮助请求
    if ($Help) {
        Show-LogHelp
        return
    }

    # 初始化日志系统
    Initialize-LogSystem

    # 记录操作开始
    Write-LogMessage "日志管理操作开始 - 操作: $Action" "INFO"

    # 根据操作执行相应功能
    switch ($Action.ToLower()) {
        "view" {
            Show-LogEntries $Component $Level $SearchTerm $TimeRange $Lines
        }

        "search" {
            if (-not $SearchTerm) {
                $SearchTerm = Read-Host "请输入搜索关键词"
            }
            Search-LogEntries $SearchTerm $Component $Level $TimeRange $Lines
        }

        "clean" {
            Clear-LogFiles $Component -Archive:$false
        }

        "archive" {
            Clear-LogFiles $Component -Archive:$true
        }

        "stats" {
            Show-LogStatistics $Component $TimeRange
        }

        "tail" {
            Start-LogTail $Component $Level
        }

        "help" {
            Show-LogHelp
        }

        default {
            Write-Host "❌ 未知的操作: $Action" -ForegroundColor Red
            Write-Host "使用 -Help 参数查看帮助信息" -ForegroundColor Yellow
            exit 1
        }
    }

    # 记录操作完成
    Write-LogMessage "日志管理操作完成 - 操作: $Action" "INFO"
}

# 执行主函数
Main
