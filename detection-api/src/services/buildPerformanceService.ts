/**
 * Build Performance Service - 构建性能监控服务
 * 
 * 提供构建性能分析、资源使用监控、性能瓶颈识别等功能
 * 支持构建时间趋势分析和性能优化建议
 */

import os from 'os'
import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface PerformanceMetrics {
  executionId: string
  appId: string
  buildTool: string
  startTime: number
  endTime?: number
  duration?: number
  cpuUsage: {
    user: number
    system: number
    total: number
    peak: number
  }
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
    peak: number
  }
  diskUsage: {
    inputSize: number
    outputSize: number
    cacheSize: number
    tempSize: number
  }
  networkUsage: {
    downloadSize: number
    uploadSize: number
  }
  buildSteps: BuildStepMetrics[]
  bottlenecks: PerformanceBottleneck[]
  optimizationSuggestions: OptimizationSuggestion[]
}

export interface BuildStepMetrics {
  step: string
  startTime: number
  endTime: number
  duration: number
  cpuUsage: number
  memoryUsage: number
  diskIO: number
  status: 'success' | 'failed' | 'skipped'
}

export interface PerformanceBottleneck {
  type: 'cpu' | 'memory' | 'disk' | 'network'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  impact: string
  suggestion: string
  detectedAt: number
}

export interface OptimizationSuggestion {
  category: 'build-config' | 'dependencies' | 'code-splitting' | 'caching' | 'bundling'
  priority: 'low' | 'medium' | 'high'
  title: string
  description: string
  implementation: string
  expectedImprovement: string
  effort: 'low' | 'medium' | 'high'
}

export interface PerformanceTrend {
  appId: string
  buildTool: string
  timeRange: {
    start: number
    end: number
  }
  metrics: {
    averageDuration: number
    medianDuration: number
    minDuration: number
    maxDuration: number
    successRate: number
    failureRate: number
    buildCount: number
  }
  trends: {
    duration: TrendData[]
    cpuUsage: TrendData[]
    memoryUsage: TrendData[]
    outputSize: TrendData[]
  }
  improvements: {
    durationImprovement: number
    resourceOptimization: number
    cacheEfficiency: number
  }
}

export interface TrendData {
  timestamp: number
  value: number
  label?: string
}

export interface PerformanceReport {
  appId: string
  reportType: 'daily' | 'weekly' | 'monthly'
  generatedAt: number
  summary: {
    totalBuilds: number
    successfulBuilds: number
    failedBuilds: number
    averageDuration: number
    totalResourceUsage: {
      cpu: number
      memory: number
      disk: number
    }
  }
  trends: PerformanceTrend
  topBottlenecks: PerformanceBottleneck[]
  recommendations: OptimizationSuggestion[]
  comparisons: {
    previousPeriod: {
      durationChange: number
      successRateChange: number
      resourceUsageChange: number
    }
    benchmark: {
      industryAverage: number
      similarProjects: number
      bestPractice: number
    }
  }
}

export class BuildPerformanceService extends EventEmitter {
  private activeMonitors = new Map<string, NodeJS.Timeout>()
  private performanceData = new Map<string, PerformanceMetrics>()

  constructor(private db: Database) {
    super()
    this.initializePerformanceTracking()
  }

  /**
   * 初始化性能跟踪
   */
  private async initializePerformanceTracking(): Promise<void> {
    try {
      // 创建性能指标表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_performance_metrics (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          build_tool TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          cpu_usage TEXT NOT NULL,
          memory_usage TEXT NOT NULL,
          disk_usage TEXT NOT NULL,
          network_usage TEXT NOT NULL,
          build_steps TEXT NOT NULL,
          bottlenecks TEXT NOT NULL,
          optimization_suggestions TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建性能趋势表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_performance_trends (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          build_tool TEXT NOT NULL,
          date TEXT NOT NULL,
          average_duration REAL NOT NULL,
          median_duration REAL NOT NULL,
          min_duration REAL NOT NULL,
          max_duration REAL NOT NULL,
          success_rate REAL NOT NULL,
          build_count INTEGER NOT NULL,
          cpu_average REAL NOT NULL,
          memory_average REAL NOT NULL,
          disk_average REAL NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(app_id, build_tool, date)
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_performance_metrics_execution_id ON build_performance_metrics (execution_id);
        CREATE INDEX IF NOT EXISTS idx_performance_metrics_app_id ON build_performance_metrics (app_id);
        CREATE INDEX IF NOT EXISTS idx_performance_metrics_start_time ON build_performance_metrics (start_time);
        CREATE INDEX IF NOT EXISTS idx_performance_trends_app_id ON build_performance_trends (app_id);
        CREATE INDEX IF NOT EXISTS idx_performance_trends_date ON build_performance_trends (date);
      `)

      logger.debug('Build performance service initialized')
    } catch (error) {
      logger.error('Failed to initialize build performance tracking', { error })
      throw error
    }
  }

  /**
   * 开始性能监控
   */
  startPerformanceMonitoring(executionId: string, appId: string, buildTool: string): void {
    const metrics: PerformanceMetrics = {
      executionId,
      appId,
      buildTool,
      startTime: Date.now(),
      cpuUsage: { user: 0, system: 0, total: 0, peak: 0 },
      memoryUsage: { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, peak: 0 },
      diskUsage: { inputSize: 0, outputSize: 0, cacheSize: 0, tempSize: 0 },
      networkUsage: { downloadSize: 0, uploadSize: 0 },
      buildSteps: [],
      bottlenecks: [],
      optimizationSuggestions: []
    }

    this.performanceData.set(executionId, metrics)

    // 启动资源监控
    const monitor = setInterval(() => {
      this.collectResourceMetrics(executionId)
    }, 1000) // 每秒收集一次

    this.activeMonitors.set(executionId, monitor)

    logger.debug('Performance monitoring started', { executionId, appId, buildTool })
  }

  /**
   * 停止性能监控
   */
  stopPerformanceMonitoring(executionId: string): PerformanceMetrics | null {
    const monitor = this.activeMonitors.get(executionId)
    if (monitor) {
      clearInterval(monitor)
      this.activeMonitors.delete(executionId)
    }

    const metrics = this.performanceData.get(executionId)
    if (metrics) {
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime

      // 分析性能瓶颈
      this.analyzeBottlenecks(metrics)

      // 生成优化建议
      this.generateOptimizationSuggestions(metrics)

      // 保存性能数据
      this.savePerformanceMetrics(metrics)

      this.performanceData.delete(executionId)
      
      logger.debug('Performance monitoring stopped', { 
        executionId, 
        duration: metrics.duration,
        bottlenecks: metrics.bottlenecks.length,
        suggestions: metrics.optimizationSuggestions.length
      })

      return metrics
    }

    return null
  }

  /**
   * 记录构建步骤
   */
  recordBuildStep(executionId: string, step: string, startTime: number, endTime: number, status: 'success' | 'failed' | 'skipped'): void {
    const metrics = this.performanceData.get(executionId)
    if (!metrics) return

    const stepMetrics: BuildStepMetrics = {
      step,
      startTime,
      endTime,
      duration: endTime - startTime,
      cpuUsage: this.getCurrentCpuUsage(),
      memoryUsage: this.getCurrentMemoryUsage(),
      diskIO: 0, // 需要实际的磁盘IO监控
      status
    }

    metrics.buildSteps.push(stepMetrics)
  }

  /**
   * 收集资源指标
   */
  private collectResourceMetrics(executionId: string): void {
    const metrics = this.performanceData.get(executionId)
    if (!metrics) return

    // CPU使用率
    const cpuUsage = process.cpuUsage()
    const currentCpu = (cpuUsage.user + cpuUsage.system) / 1000000 // 转换为秒
    metrics.cpuUsage.total = currentCpu
    metrics.cpuUsage.peak = Math.max(metrics.cpuUsage.peak, currentCpu)

    // 内存使用
    const memUsage = process.memoryUsage()
    metrics.memoryUsage.rss = memUsage.rss
    metrics.memoryUsage.heapUsed = memUsage.heapUsed
    metrics.memoryUsage.heapTotal = memUsage.heapTotal
    metrics.memoryUsage.external = memUsage.external
    metrics.memoryUsage.peak = Math.max(metrics.memoryUsage.peak, memUsage.rss)
  }

  /**
   * 获取当前CPU使用率
   */
  private getCurrentCpuUsage(): number {
    const cpus = os.cpus()
    let totalIdle = 0
    let totalTick = 0

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times]
      }
      totalIdle += cpu.times.idle
    })

    return 100 - (100 * totalIdle / totalTick)
  }

  /**
   * 获取当前内存使用量
   */
  private getCurrentMemoryUsage(): number {
    const memUsage = process.memoryUsage()
    return memUsage.rss / 1024 / 1024 // MB
  }

  /**
   * 分析性能瓶颈
   */
  private analyzeBottlenecks(metrics: PerformanceMetrics): void {
    const bottlenecks: PerformanceBottleneck[] = []

    // CPU瓶颈检测
    if (metrics.cpuUsage.peak > 80) {
      bottlenecks.push({
        type: 'cpu',
        severity: metrics.cpuUsage.peak > 95 ? 'critical' : 'high',
        description: `High CPU usage detected (${metrics.cpuUsage.peak.toFixed(1)}%)`,
        impact: 'Build performance significantly affected',
        suggestion: 'Consider reducing parallel processes or optimizing build configuration',
        detectedAt: Date.now()
      })
    }

    // 内存瓶颈检测
    const peakMemoryMB = metrics.memoryUsage.peak / 1024 / 1024
    if (peakMemoryMB > 1024) { // 1GB
      bottlenecks.push({
        type: 'memory',
        severity: peakMemoryMB > 2048 ? 'critical' : 'high',
        description: `High memory usage detected (${peakMemoryMB.toFixed(1)}MB)`,
        impact: 'May cause build failures or system slowdown',
        suggestion: 'Optimize bundle size or increase available memory',
        detectedAt: Date.now()
      })
    }

    // 构建时间瓶颈检测
    if (metrics.duration && metrics.duration > 300000) { // 5分钟
      bottlenecks.push({
        type: 'disk',
        severity: metrics.duration > 600000 ? 'high' : 'medium',
        description: `Long build duration detected (${(metrics.duration / 1000).toFixed(1)}s)`,
        impact: 'Slow development feedback loop',
        suggestion: 'Enable build caching and optimize dependencies',
        detectedAt: Date.now()
      })
    }

    metrics.bottlenecks = bottlenecks
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationSuggestions(metrics: PerformanceMetrics): void {
    const suggestions: OptimizationSuggestion[] = []

    // 基于构建工具的建议
    if (metrics.buildTool === 'webpack') {
      suggestions.push({
        category: 'build-config',
        priority: 'high',
        title: 'Enable Webpack Bundle Analyzer',
        description: 'Analyze bundle size and identify optimization opportunities',
        implementation: 'Install webpack-bundle-analyzer and add to build script',
        expectedImprovement: '10-30% bundle size reduction',
        effort: 'low'
      })
    }

    if (metrics.buildTool === 'vite') {
      suggestions.push({
        category: 'caching',
        priority: 'medium',
        title: 'Optimize Vite Build Cache',
        description: 'Configure Vite cache settings for better performance',
        implementation: 'Update vite.config.js with optimized cache settings',
        expectedImprovement: '20-40% faster rebuilds',
        effort: 'low'
      })
    }

    // 基于性能指标的建议
    if (metrics.duration && metrics.duration > 180000) { // 3分钟
      suggestions.push({
        category: 'dependencies',
        priority: 'high',
        title: 'Optimize Dependencies',
        description: 'Review and optimize package dependencies',
        implementation: 'Use bundle analyzer to identify large dependencies',
        expectedImprovement: '15-25% faster builds',
        effort: 'medium'
      })
    }

    if (metrics.memoryUsage.peak > 512 * 1024 * 1024) { // 512MB
      suggestions.push({
        category: 'code-splitting',
        priority: 'medium',
        title: 'Implement Code Splitting',
        description: 'Split code into smaller chunks to reduce memory usage',
        implementation: 'Configure dynamic imports and route-based splitting',
        expectedImprovement: '20-30% memory reduction',
        effort: 'medium'
      })
    }

    metrics.optimizationSuggestions = suggestions
  }

  /**
   * 保存性能指标
   */
  private async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO build_performance_metrics (
          id, execution_id, app_id, build_tool, start_time, end_time, duration,
          cpu_usage, memory_usage, disk_usage, network_usage, build_steps,
          bottlenecks, optimization_suggestions, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const id = `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      stmt.run(
        id,
        metrics.executionId,
        metrics.appId,
        metrics.buildTool,
        metrics.startTime,
        metrics.endTime,
        metrics.duration,
        JSON.stringify(metrics.cpuUsage),
        JSON.stringify(metrics.memoryUsage),
        JSON.stringify(metrics.diskUsage),
        JSON.stringify(metrics.networkUsage),
        JSON.stringify(metrics.buildSteps),
        JSON.stringify(metrics.bottlenecks),
        JSON.stringify(metrics.optimizationSuggestions),
        Date.now()
      )

      // 更新趋势数据
      await this.updatePerformanceTrends(metrics)

      logger.debug('Performance metrics saved', { executionId: metrics.executionId })
    } catch (error) {
      logger.error('Failed to save performance metrics', { error })
    }
  }

  /**
   * 更新性能趋势
   */
  private async updatePerformanceTrends(metrics: PerformanceMetrics): Promise<void> {
    if (!metrics.duration) return

    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      // 获取今天的现有数据
      const existingStmt = this.db.prepare(`
        SELECT * FROM build_performance_trends 
        WHERE app_id = ? AND build_tool = ? AND date = ?
      `)
      
      const existing = existingStmt.get(metrics.appId, metrics.buildTool, today) as any

      if (existing) {
        // 更新现有记录
        const newCount = existing.build_count + 1
        const newAverage = (existing.average_duration * existing.build_count + metrics.duration) / newCount
        
        const updateStmt = this.db.prepare(`
          UPDATE build_performance_trends SET
            average_duration = ?, build_count = ?, min_duration = ?, max_duration = ?
          WHERE id = ?
        `)
        
        updateStmt.run(
          newAverage,
          newCount,
          Math.min(existing.min_duration, metrics.duration),
          Math.max(existing.max_duration, metrics.duration),
          existing.id
        )
      } else {
        // 创建新记录
        const insertStmt = this.db.prepare(`
          INSERT INTO build_performance_trends (
            id, app_id, build_tool, date, average_duration, median_duration,
            min_duration, max_duration, success_rate, build_count,
            cpu_average, memory_average, disk_average, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const id = `trend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        insertStmt.run(
          id,
          metrics.appId,
          metrics.buildTool,
          today,
          metrics.duration,
          metrics.duration, // 单个数据点，中位数等于平均数
          metrics.duration,
          metrics.duration,
          1.0, // 假设成功
          1,
          metrics.cpuUsage.total,
          metrics.memoryUsage.peak / 1024 / 1024, // MB
          0, // 磁盘使用暂时为0
          Date.now()
        )
      }
    } catch (error) {
      logger.error('Failed to update performance trends', { error })
    }
  }

  /**
   * 获取性能趋势
   */
  async getPerformanceTrend(appId: string, buildTool: string, days = 30): Promise<PerformanceTrend | null> {
    try {
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
      
      const stmt = this.db.prepare(`
        SELECT * FROM build_performance_trends 
        WHERE app_id = ? AND build_tool = ? AND date >= ? AND date <= ?
        ORDER BY date ASC
      `)
      
      const rows = stmt.all(
        appId, 
        buildTool, 
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ) as any[]

      if (rows.length === 0) return null

      // 计算总体指标
      const totalBuilds = rows.reduce((sum, row) => sum + row.build_count, 0)
      const avgDuration = rows.reduce((sum, row) => sum + row.average_duration * row.build_count, 0) / totalBuilds
      const allDurations = rows.flatMap(row => Array(row.build_count).fill(row.average_duration))
      
      allDurations.sort((a, b) => a - b)
      const medianDuration = allDurations[Math.floor(allDurations.length / 2)]
      const minDuration = Math.min(...rows.map(row => row.min_duration))
      const maxDuration = Math.max(...rows.map(row => row.max_duration))

      return {
        appId,
        buildTool,
        timeRange: {
          start: startDate.getTime(),
          end: endDate.getTime()
        },
        metrics: {
          averageDuration: avgDuration,
          medianDuration,
          minDuration,
          maxDuration,
          successRate: 0.95, // 需要实际计算
          failureRate: 0.05,
          buildCount: totalBuilds
        },
        trends: {
          duration: rows.map(row => ({
            timestamp: new Date(row.date).getTime(),
            value: row.average_duration
          })),
          cpuUsage: rows.map(row => ({
            timestamp: new Date(row.date).getTime(),
            value: row.cpu_average
          })),
          memoryUsage: rows.map(row => ({
            timestamp: new Date(row.date).getTime(),
            value: row.memory_average
          })),
          outputSize: [] // 需要额外的数据收集
        },
        improvements: {
          durationImprovement: 0, // 需要计算
          resourceOptimization: 0,
          cacheEfficiency: 0
        }
      }
    } catch (error) {
      logger.error('Failed to get performance trend', { error })
      return null
    }
  }

  /**
   * 生成性能报告
   */
  async generatePerformanceReport(appId: string, reportType: 'daily' | 'weekly' | 'monthly'): Promise<PerformanceReport | null> {
    try {
      const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
      
      // 获取性能趋势数据
      const trends = await this.getPerformanceTrend(appId, '', days)
      if (!trends) return null

      // 获取瓶颈数据
      const bottlenecksStmt = this.db.prepare(`
        SELECT bottlenecks FROM build_performance_metrics 
        WHERE app_id = ? AND start_time >= ?
        ORDER BY start_time DESC
        LIMIT 10
      `)
      
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
      const bottleneckRows = bottlenecksStmt.all(appId, cutoffTime) as any[]
      
      const allBottlenecks = bottleneckRows.flatMap(row => JSON.parse(row.bottlenecks))
      const topBottlenecks = allBottlenecks
        .sort((a, b) => {
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
          return severityOrder[b.severity] - severityOrder[a.severity]
        })
        .slice(0, 5)

      // 获取优化建议
      const suggestionsStmt = this.db.prepare(`
        SELECT optimization_suggestions FROM build_performance_metrics 
        WHERE app_id = ? AND start_time >= ?
        ORDER BY start_time DESC
        LIMIT 5
      `)
      
      const suggestionRows = suggestionsStmt.all(appId, cutoffTime) as any[]
      const allSuggestions = suggestionRows.flatMap(row => JSON.parse(row.optimization_suggestions))
      const topSuggestions = allSuggestions
        .sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 }
          return priorityOrder[b.priority] - priorityOrder[a.priority]
        })
        .slice(0, 5)

      return {
        appId,
        reportType,
        generatedAt: Date.now(),
        summary: {
          totalBuilds: trends.metrics.buildCount,
          successfulBuilds: Math.floor(trends.metrics.buildCount * trends.metrics.successRate),
          failedBuilds: Math.floor(trends.metrics.buildCount * trends.metrics.failureRate),
          averageDuration: trends.metrics.averageDuration,
          totalResourceUsage: {
            cpu: 0, // 需要计算
            memory: 0,
            disk: 0
          }
        },
        trends,
        topBottlenecks,
        recommendations: topSuggestions,
        comparisons: {
          previousPeriod: {
            durationChange: 0, // 需要计算
            successRateChange: 0,
            resourceUsageChange: 0
          },
          benchmark: {
            industryAverage: 120000, // 2分钟
            similarProjects: 90000, // 1.5分钟
            bestPractice: 60000 // 1分钟
          }
        }
      }
    } catch (error) {
      logger.error('Failed to generate performance report', { error })
      return null
    }
  }

  /**
   * 清理旧的性能数据
   */
  async cleanupOldPerformanceData(retentionDays = 90): Promise<void> {
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      
      const stmt = this.db.prepare(`
        DELETE FROM build_performance_metrics WHERE created_at < ?
      `)
      
      const result = stmt.run(cutoffTime)
      
      logger.info('Old performance data cleaned up', { deletedRecords: result.changes })
    } catch (error) {
      logger.error('Failed to cleanup old performance data', { error })
    }
  }

  /**
   * 关闭服务
   */
  close(): void {
    // 停止所有活动的监控
    for (const [executionId, monitor] of this.activeMonitors.entries()) {
      clearInterval(monitor)
      logger.debug('Performance monitor stopped', { executionId })
    }
    
    this.activeMonitors.clear()
    this.performanceData.clear()
  }
}
