/**
 * Log Entry Model
 * 日志条目数据模型
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  source: string
  appId?: string
  appName?: string
  metadata?: Record<string, any>
}

export interface LogQuery {
  appId?: string
  level?: LogLevel
  source?: string
  startTime?: string
  endTime?: string
  search?: string
  limit?: number
  offset?: number
}

export interface LogStats {
  total: number
  byLevel: Record<LogLevel, number>
  bySource: Record<string, number>
  timeRange: {
    start: string
    end: string
  }
}

export interface LogExportOptions {
  appId?: string
  level?: LogLevel
  source?: string
  startTime?: string
  endTime?: string
  search?: string
  format: 'json' | 'csv' | 'txt'
}

export interface LogClearOptions {
  appId?: string
  olderThan?: string
}

export interface LogClearResult {
  deletedCount: number
  message: string
}

// 日志源类型
export enum LogSource {
  WINSTON = 'winston',
  POWERSHELL = 'powershell',
  PM2 = 'pm2',
  APPLICATION = 'application',
  SYSTEM = 'system',
  BUILD = 'build'
}

// 原始日志条目（用于解析不同格式的日志）
export interface RawLogEntry {
  raw: string
  timestamp?: Date
  level?: string
  message?: string
  source?: string
  metadata?: Record<string, any>
}

// Winston日志格式
export interface WinstonLogEntry {
  level: string
  message: string
  timestamp: string
  [key: string]: any
}

// PowerShell日志格式
export interface PowerShellLogEntry {
  timestamp: string
  component: string
  level: string
  source: string
  message: string
}

// PM2日志格式
export interface PM2LogEntry {
  timestamp: string
  level: string
  message: string
  app_name?: string
  process_id?: number
}

// 日志解析结果
export interface LogParseResult {
  success: boolean
  entry?: LogEntry
  error?: string
}

// 日志文件信息
export interface LogFileInfo {
  path: string
  source: LogSource
  size: number
  lastModified: Date
  isActive: boolean
}

// 日志监控配置
export interface LogMonitorConfig {
  watchFiles: LogFileInfo[]
  pollInterval: number
  maxFileSize: number
  enableRealtime: boolean
}
