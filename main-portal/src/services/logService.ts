import { apiService } from './api'

// 日志级别枚举
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// 日志条目接口
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

// 日志查询参数
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

// 日志统计信息
export interface LogStats {
  total: number
  byLevel: Record<LogLevel, number>
  bySource: Record<string, number>
  timeRange: {
    start: string
    end: string
  }
}

class LogService {
  /**
   * 获取应用日志
   */
  async getAppLogs(appId: string, query: LogQuery = {}): Promise<{
    logs: LogEntry[]
    total: number
    stats: LogStats
  }> {
    const params = new URLSearchParams()
    
    if (query.level) params.append('level', query.level)
    if (query.source) params.append('source', query.source)
    if (query.startTime) params.append('startTime', query.startTime)
    if (query.endTime) params.append('endTime', query.endTime)
    if (query.search) params.append('search', query.search)
    if (query.limit) params.append('limit', query.limit.toString())
    if (query.offset) params.append('offset', query.offset.toString())

    const response = await apiService.get(`/v2/applications/${appId}/logs?${params}`)
    return response as any
  }

  /**
   * 获取系统日志
   */
  async getSystemLogs(query: LogQuery = {}): Promise<{
    logs: LogEntry[]
    total: number
    stats: LogStats
  }> {
    const params = new URLSearchParams()
    
    if (query.level) params.append('level', query.level)
    if (query.source) params.append('source', query.source)
    if (query.startTime) params.append('startTime', query.startTime)
    if (query.endTime) params.append('endTime', query.endTime)
    if (query.search) params.append('search', query.search)
    if (query.limit) params.append('limit', query.limit.toString())
    if (query.offset) params.append('offset', query.offset.toString())

    const response = await apiService.get(`/system/logs?${params}`)
    return response as any
  }

  /**
   * 导出日志
   */
  async exportLogs(query: LogQuery, format: 'json' | 'csv' | 'txt' = 'json'): Promise<Blob> {
    const params = new URLSearchParams()
    
    if (query.appId) params.append('appId', query.appId)
    if (query.level) params.append('level', query.level)
    if (query.source) params.append('source', query.source)
    if (query.startTime) params.append('startTime', query.startTime)
    if (query.endTime) params.append('endTime', query.endTime)
    if (query.search) params.append('search', query.search)
    params.append('format', format)

    const response = await apiService.get<Blob>(`/logs/export?${params}`, { responseType: 'blob' })
    return response
  }

  /**
   * 清理日志
   */
  async clearLogs(appId?: string, olderThan?: string): Promise<{ deletedCount: number }> {
    const data: any = {}
    if (appId) data.appId = appId
    if (olderThan) data.olderThan = olderThan

    const response = await apiService.request<{ deletedCount: number }>(
      '/logs',
      { method: 'DELETE', body: JSON.stringify(data) }
    )
    return response
  }

  /**
   * 清理过期日志
   */
  async cleanupLogs(retentionDays: number = 7): Promise<{
    deletedCount: number
    retentionDays: number
    cutoffDate: string
    beforeSize: number
    afterSize: number
  }> {
    const response = await apiService.post('/logs/cleanup', { retentionDays })
    return response as any
  }

  /**
   * 预估清理数量
   */
  async estimateCleanup(retentionDays: number = 7): Promise<{
    totalCount: number
    retainedCount: number
    deleteCount: number
    retentionDays: number
    cutoffDate: string
  }> {
    const response = await apiService.get(`/logs/cleanup/estimate?retentionDays=${retentionDays}`)
    return response as any
  }

  /**
   * 获取日志统计
   */
  async getLogStats(query: LogQuery = {}): Promise<LogStats> {
    const params = new URLSearchParams()
    
    if (query.appId) params.append('appId', query.appId)
    if (query.startTime) params.append('startTime', query.startTime)
    if (query.endTime) params.append('endTime', query.endTime)

    const response = await apiService.get(`/logs/stats?${params}`)
    return response as any
  }
}

export const logService = new LogService()

