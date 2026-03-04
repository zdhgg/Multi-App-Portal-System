import { apiService } from './api'
import type { ApiResponse } from './api'

// 性能指标接口
export interface PerformanceMetric {
  id?: number
  port: number
  timestamp: Date
  responseTime: number
  connectionTime: number
  throughput?: number
  errorRate: number
  availability: number
  cpuUsage?: number
  memoryUsage?: number
  networkLatency: number
  successfulConnections: number
  failedConnections: number
  totalRequests: number
  activeConnections?: number
  metadata?: {
    processName?: string
    appName?: string
    environment?: string
    region?: string
  }
}

// 性能告警接口
export interface PerformanceAlert {
  id?: number
  port: number
  alertType: 'high_response_time' | 'low_availability' | 'high_error_rate' | 'connection_failure' | 'resource_exhaustion'
  severity: 'low' | 'medium' | 'high' | 'critical'
  threshold: number
  currentValue: number
  message: string
  timestamp: Date
  acknowledged: boolean
  resolvedAt?: Date
}

// 性能趋势接口
export interface PerformanceTrend {
  port: number
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d'
  metrics: {
    avgResponseTime: number
    maxResponseTime: number
    minResponseTime: number
    availability: number
    errorRate: number
    throughput: number
    trend: 'improving' | 'degrading' | 'stable'
    changePercent: number
  }
  dataPoints: PerformanceMetric[]
  recommendations: string[]
}

// 监控配置接口
export interface MonitoringConfig {
  interval: number
  enabled: boolean
  ports: number[]
  thresholds: {
    responseTime: number
    availability: number
    errorRate: number
  }
  alerting: {
    enabled: boolean
    channels: ('email' | 'webhook' | 'console')[]
  }
}

// 性能概览接口
export interface PerformanceOverview {
  port: number
  status: 'healthy' | 'unhealthy' | 'error'
  metrics?: {
    avgResponseTime: number
    availability: number
    errorRate: number
    trend: 'improving' | 'degrading' | 'stable'
  }
  alertCount?: number
  error?: string
}

// 性能摘要接口
export interface PerformanceSummary {
  monitoring: {
    enabled: boolean
    totalPorts: number
    activeMonitors: number
  }
  performance: {
    healthyPorts: number
    warningPorts: number
    criticalPorts: number
    avgResponseTime: number
    avgAvailability: number
  }
  alerts: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    unacknowledged: number
  }
}

/**
 * 端口性能监控API服务类
 */
export class PortPerformanceApiService {

  // ==================== 监控管理API ====================

  /**
   * 获取监控状态
   */
  async getMonitoringStatus(): Promise<ApiResponse<{
    enabled: boolean
    monitoredPorts: number[]
    activeMonitors: number
    config: MonitoringConfig
  }>> {
    try {
      const response = await apiService.get<ApiResponse<any>>('/port-performance/status')
      return response
    } catch (error) {
      console.error('Failed to get monitoring status:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get monitoring status' 
      }
    }
  }

  /**
   * 启动端口监控
   */
  async startMonitoring(ports: number[], config?: Partial<MonitoringConfig>): Promise<ApiResponse<{
    monitoredPorts: number[]
    config: MonitoringConfig
  }>> {
    try {
      const response = await apiService.post<ApiResponse<any>>('/port-performance/start', {
        ports,
        config
      })
      return response
    } catch (error) {
      console.error('Failed to start monitoring:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start monitoring' 
      }
    }
  }

  /**
   * 停止端口监控
   */
  async stopMonitoring(ports?: number[]): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>('/port-performance/stop', {
        ports
      })
      return response
    } catch (error) {
      console.error('Failed to stop monitoring:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to stop monitoring' 
      }
    }
  }

  /**
   * 更新监控配置
   */
  async updateConfig(config: Partial<MonitoringConfig>): Promise<ApiResponse<MonitoringConfig>> {
    try {
      const response = await apiService.put<ApiResponse<MonitoringConfig>>('/port-performance/config', {
        config
      })
      return response
    } catch (error) {
      console.error('Failed to update config:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update config' 
      }
    }
  }

  // ==================== 性能数据查询API ====================

  /**
   * 获取端口性能指标
   */
  async getPortMetrics(port: number, options: {
    timeRange?: string
    limit?: number
  } = {}): Promise<ApiResponse<PerformanceMetric[]>> {
    try {
      const params = new URLSearchParams()
      if (options.timeRange) params.append('timeRange', options.timeRange)
      if (options.limit) params.append('limit', options.limit.toString())

      const url = `/port-performance/metrics/${port}${params.toString() ? '?' + params.toString() : ''}`
      const response = await apiService.get<ApiResponse<any>>(url)

      if (response.success && response.data) {
        // 转换日期字段
        const metrics = response.data.map((metric: any) => ({
          ...metric,
          timestamp: new Date(metric.timestamp)
        }))

        return {
          ...response,
          data: metrics
        }
      }

      return response
    } catch (error) {
      console.error('Failed to get port metrics:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get port metrics' 
      }
    }
  }

  /**
   * 获取端口性能趋势分析
   */
  async getPerformanceTrend(port: number, timeRange: string = '24h'): Promise<ApiResponse<PerformanceTrend>> {
    try {
      const response = await apiService.get<ApiResponse<any>>(`/port-performance/trends/${port}?timeRange=${timeRange}`)

      if (response.success && response.data) {
        // 转换日期字段
        const trend = {
          ...response.data,
          dataPoints: response.data.dataPoints.map((metric: any) => ({
            ...metric,
            timestamp: new Date(metric.timestamp)
          }))
        }

        return {
          ...response,
          data: trend
        }
      }

      return response
    } catch (error) {
      console.error('Failed to get performance trend:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get performance trend' 
      }
    }
  }

  /**
   * 获取多端口性能概览
   */
  async getPerformanceOverview(ports: number[], timeRange: string = '24h'): Promise<ApiResponse<PerformanceOverview[]>> {
    try {
      const response = await apiService.post<ApiResponse<any>>('/port-performance/overview', {
        ports,
        timeRange
      })
      return response
    } catch (error) {
      console.error('Failed to get performance overview:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get performance overview' 
      }
    }
  }

  // ==================== 告警管理API ====================

  /**
   * 获取端口告警
   */
  async getPortAlerts(port: number, acknowledged: boolean = false): Promise<ApiResponse<PerformanceAlert[]>> {
    try {
      const response = await apiService.get<ApiResponse<any>>(`/port-performance/alerts/${port}?acknowledged=${acknowledged}`)

      if (response.success && response.data) {
        // 转换日期字段
        const alerts = response.data.map((alert: any) => ({
          ...alert,
          timestamp: new Date(alert.timestamp),
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : undefined
        }))

        return {
          ...response,
          data: alerts
        }
      }

      return response
    } catch (error) {
      console.error('Failed to get port alerts:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get port alerts' 
      }
    }
  }

  /**
   * 获取所有活跃告警
   */
  async getAllAlerts(options: {
    acknowledged?: boolean
    severity?: string
    limit?: number
  } = {}): Promise<ApiResponse<PerformanceAlert[]>> {
    try {
      const params = new URLSearchParams()
      if (options.acknowledged !== undefined) params.append('acknowledged', options.acknowledged.toString())
      if (options.severity) params.append('severity', options.severity)
      if (options.limit) params.append('limit', options.limit.toString())

      const url = `/port-performance/alerts${params.toString() ? '?' + params.toString() : ''}`
      const response = await apiService.get<ApiResponse<any>>(url)

      if (response.success && response.data) {
        // 转换日期字段
        const alerts = response.data.map((alert: any) => ({
          ...alert,
          timestamp: new Date(alert.timestamp),
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : undefined
        }))

        return {
          ...response,
          data: alerts
        }
      }

      return response
    } catch (error) {
      console.error('Failed to get all alerts:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get all alerts' 
      }
    }
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId: number): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>(`/port-performance/alerts/${alertId}/acknowledge`)
      return response
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to acknowledge alert' 
      }
    }
  }

  // ==================== 数据管理API ====================

  /**
   * 数据清理
   */
  async cleanupData(retentionDays: number = 30): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<ApiResponse<void>>('/port-performance/cleanup', {
        retentionDays
      })
      return response
    } catch (error) {
      console.error('Failed to cleanup data:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to cleanup data' 
      }
    }
  }

  /**
   * 获取性能统计摘要
   */
  async getPerformanceSummary(timeRange: string = '24h'): Promise<ApiResponse<PerformanceSummary>> {
    try {
      const response = await apiService.get<ApiResponse<PerformanceSummary>>(`/port-performance/summary?timeRange=${timeRange}`)
      return response
    } catch (error) {
      console.error('Failed to get performance summary:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get performance summary' 
      }
    }
  }

  // ==================== 实用工具方法 ====================

  /**
   * 格式化性能指标数值
   */
  formatMetricValue(value: number, type: 'time' | 'percentage' | 'bytes' | 'count'): string {
    switch (type) {
      case 'time':
        if (value < 1000) return `${value.toFixed(0)}ms`
        return `${(value / 1000).toFixed(2)}s`
      
      case 'percentage':
        return `${value.toFixed(1)}%`
      
      case 'bytes':
        if (value < 1024) return `${value.toFixed(0)}B`
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`
        if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`
        return `${(value / 1024 / 1024 / 1024).toFixed(1)}GB`
      
      case 'count':
        if (value < 1000) return value.toString()
        if (value < 1000000) return `${(value / 1000).toFixed(1)}K`
        return `${(value / 1000000).toFixed(1)}M`
      
      default:
        return value.toString()
    }
  }

  /**
   * 获取状态颜色
   */
  getStatusColor(status: 'healthy' | 'unhealthy' | 'error' | string): string {
    const colorMap: Record<string, string> = {
      healthy: '#67C23A',
      unhealthy: '#E6A23C',
      error: '#F56C6C',
      improving: '#67C23A',
      degrading: '#F56C6C',
      stable: '#409EFF'
    }
    return colorMap[status] || '#909399'
  }

  /**
   * 获取严重程度颜色
   */
  getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
    const colorMap: Record<string, string> = {
      low: '#67C23A',
      medium: '#E6A23C',
      high: '#F56C6C',
      critical: '#F56C6C'
    }
    return colorMap[severity] || '#909399'
  }

  /**
   * 计算健康评分
   */
  calculateHealthScore(metrics: {
    availability: number
    avgResponseTime: number
    errorRate: number
  }): {
    score: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
    status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  } {
    let score = 100

    // 可用性权重 40%
    if (metrics.availability < 99) score -= (99 - metrics.availability) * 2
    if (metrics.availability < 95) score -= 20
    if (metrics.availability < 90) score -= 30

    // 响应时间权重 35%
    if (metrics.avgResponseTime > 1000) score -= Math.min(30, (metrics.avgResponseTime - 1000) / 100)
    if (metrics.avgResponseTime > 2000) score -= 20
    if (metrics.avgResponseTime > 5000) score -= 30

    // 错误率权重 25%
    if (metrics.errorRate > 1) score -= metrics.errorRate * 5
    if (metrics.errorRate > 5) score -= 20
    if (metrics.errorRate > 10) score -= 30

    score = Math.max(0, Math.min(100, score))

    let grade: 'A' | 'B' | 'C' | 'D' | 'F'
    let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

    if (score >= 90) {
      grade = 'A'
      status = 'excellent'
    } else if (score >= 80) {
      grade = 'B'
      status = 'good'
    } else if (score >= 70) {
      grade = 'C'
      status = 'fair'
    } else if (score >= 60) {
      grade = 'D'
      status = 'poor'
    } else {
      grade = 'F'
      status = 'critical'
    }

    return { score, grade, status }
  }
}

// 创建服务实例
export const portPerformanceApiService = new PortPerformanceApiService()









