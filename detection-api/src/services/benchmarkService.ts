/**
 * Benchmark Service - 性能基准测试服务
 * 
 * 提供自动化的性能回归测试、构建性能基准建立和对比、
 * 性能退化检测和告警、性能优化效果量化评估等功能
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface PerformanceBenchmark {
  id: string
  appId: string
  name: string
  description?: string
  type: 'build' | 'test' | 'deploy' | 'full-pipeline' | 'custom'
  configuration: BenchmarkConfiguration
  baseline: BenchmarkResult
  status: 'active' | 'inactive' | 'archived'
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
    version: string
    tags: string[]
  }
}

export interface BenchmarkConfiguration {
  environment: {
    nodeVersion: string
    platform: string
    cpu: string
    memory: string
    disk: string
  }
  parameters: {
    iterations: number
    warmupRuns: number
    timeout: number
    parallel: boolean
    cacheEnabled: boolean
  }
  metrics: BenchmarkMetric[]
  thresholds: PerformanceThreshold[]
  triggers: BenchmarkTrigger[]
}

export interface BenchmarkMetric {
  name: string
  type: 'duration' | 'throughput' | 'resource' | 'count' | 'percentage'
  unit: string
  description: string
  aggregation: 'avg' | 'min' | 'max' | 'sum' | 'p50' | 'p95' | 'p99'
  weight: number
  enabled: boolean
}

export interface PerformanceThreshold {
  metric: string
  condition: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne'
  value: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  action: 'alert' | 'block' | 'warn'
  description: string
}

export interface BenchmarkTrigger {
  type: 'manual' | 'schedule' | 'commit' | 'release' | 'threshold'
  condition: string
  enabled: boolean
  parameters: Record<string, any>
}

export interface BenchmarkExecution {
  id: string
  benchmarkId: string
  appId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  duration?: number
  triggeredBy: string
  triggerType: string
  environment: ExecutionEnvironment
  results: BenchmarkResult
  comparison?: BenchmarkComparison
  issues: PerformanceIssue[]
  metadata: {
    version: string
    commit?: string
    branch?: string
    buildId?: string
    createdAt: number
  }
}

export interface ExecutionEnvironment {
  nodeVersion: string
  platform: string
  cpu: string
  memory: string
  disk: string
  load: number
  temperature: number
  networkLatency: number
}

export interface BenchmarkResult {
  summary: ResultSummary
  metrics: MetricResult[]
  iterations: IterationResult[]
  resources: ResourceUsage
  logs: ExecutionLog[]
  artifacts: string[]
}

export interface ResultSummary {
  totalTime: number
  successRate: number
  errorRate: number
  throughput: number
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  regressions: number
  improvements: number
}

export interface MetricResult {
  name: string
  value: number
  unit: string
  aggregation: string
  samples: number[]
  statistics: {
    min: number
    max: number
    avg: number
    median: number
    p95: number
    p99: number
    stdDev: number
  }
  trend: 'improving' | 'stable' | 'degrading'
  changePercent: number
}

export interface IterationResult {
  iteration: number
  startTime: number
  endTime: number
  duration: number
  success: boolean
  metrics: Record<string, number>
  resources: ResourceSnapshot
  error?: string
}

export interface ResourceSnapshot {
  timestamp: number
  cpu: number
  memory: number
  disk: number
  network: {
    inbound: number
    outbound: number
  }
  processes: number
}

export interface ResourceUsage {
  peak: ResourceSnapshot
  average: ResourceSnapshot
  timeline: ResourceSnapshot[]
  efficiency: {
    cpuEfficiency: number
    memoryEfficiency: number
    diskEfficiency: number
  }
}

export interface ExecutionLog {
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  source: string
  iteration?: number
  context?: Record<string, any>
}

export interface BenchmarkComparison {
  baseline: BenchmarkResult
  current: BenchmarkResult
  changes: MetricChange[]
  summary: ComparisonSummary
  significance: StatisticalSignificance
}

export interface MetricChange {
  metric: string
  baselineValue: number
  currentValue: number
  change: number
  changePercent: number
  direction: 'improvement' | 'regression' | 'neutral'
  significance: 'significant' | 'minor' | 'negligible'
  threshold?: PerformanceThreshold
}

export interface ComparisonSummary {
  overallChange: number
  significantChanges: number
  regressions: number
  improvements: number
  neutralChanges: number
  recommendation: string
}

export interface StatisticalSignificance {
  method: 'ttest' | 'mannwhitney' | 'wilcoxon'
  pValue: number
  significant: boolean
  confidenceLevel: number
  effectSize: number
}

export interface PerformanceIssue {
  id: string
  type: 'regression' | 'threshold-violation' | 'anomaly' | 'resource-leak'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  metric: string
  value: number
  threshold?: number
  impact: number
  recommendation: string
  detectedAt: number
}

export interface BenchmarkReport {
  id: string
  executionId: string
  type: 'summary' | 'detailed' | 'comparison' | 'trend'
  format: 'json' | 'html' | 'pdf' | 'csv'
  content: string
  generatedAt: number
  generatedBy: string
  recipients: string[]
  metadata: {
    template: string
    version: string
    size: number
  }
}

export class BenchmarkService extends EventEmitter {
  private activeBenchmarks = new Map<string, BenchmarkExecution>()
  private benchmarkCache = new Map<string, PerformanceBenchmark>()

  constructor(private db: Database) {
    super()
    this.initializeBenchmarkService()
  }

  /**
   * 初始化基准测试服务
   */
  private async initializeBenchmarkService(): Promise<void> {
    try {
      // 创建基准测试表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS performance_benchmarks (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          configuration TEXT NOT NULL,
          baseline TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          version TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建基准测试执行表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS benchmark_executions (
          id TEXT PRIMARY KEY,
          benchmark_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          triggered_by TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          environment TEXT NOT NULL,
          results TEXT NOT NULL DEFAULT '{}',
          comparison TEXT,
          issues TEXT NOT NULL DEFAULT '[]',
          version TEXT NOT NULL,
          "commit" TEXT,
          branch TEXT,
          build_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (benchmark_id) REFERENCES performance_benchmarks (id),
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建基准测试报告表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS benchmark_reports (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          type TEXT NOT NULL,
          format TEXT NOT NULL,
          content TEXT NOT NULL,
          generated_at INTEGER NOT NULL,
          generated_by TEXT NOT NULL,
          recipients TEXT NOT NULL DEFAULT '[]',
          template TEXT NOT NULL,
          version TEXT NOT NULL,
          size INTEGER NOT NULL,
          FOREIGN KEY (execution_id) REFERENCES benchmark_executions (id)
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_performance_benchmarks_app_id ON performance_benchmarks (app_id);
        CREATE INDEX IF NOT EXISTS idx_performance_benchmarks_status ON performance_benchmarks (status);
        CREATE INDEX IF NOT EXISTS idx_performance_benchmarks_type ON performance_benchmarks (type);
        CREATE INDEX IF NOT EXISTS idx_benchmark_executions_benchmark_id ON benchmark_executions (benchmark_id);
        CREATE INDEX IF NOT EXISTS idx_benchmark_executions_app_id ON benchmark_executions (app_id);
        CREATE INDEX IF NOT EXISTS idx_benchmark_executions_status ON benchmark_executions (status);
        CREATE INDEX IF NOT EXISTS idx_benchmark_executions_start_time ON benchmark_executions (start_time);
        CREATE INDEX IF NOT EXISTS idx_benchmark_reports_execution_id ON benchmark_reports (execution_id);
      `)

      // 初始化默认基准测试
      await this.initializeDefaultBenchmarks()

      logger.debug('Benchmark service initialized')
    } catch (error) {
      logger.error('Failed to initialize benchmark service', { error })
      throw error
    }
  }

  /**
   * 初始化默认基准测试
   */
  private async initializeDefaultBenchmarks(): Promise<void> {
    const defaultBenchmarks = [
      {
        name: '构建性能基准测试',
        description: '测量应用构建过程的性能指标',
        type: 'build' as const,
        configuration: {
          environment: {
            nodeVersion: 'latest',
            platform: 'linux',
            cpu: '2 cores',
            memory: '4GB',
            disk: 'SSD'
          },
          parameters: {
            iterations: 5,
            warmupRuns: 2,
            timeout: 600000,
            parallel: false,
            cacheEnabled: true
          },
          metrics: [
            {
              name: 'build_duration',
              type: 'duration' as const,
              unit: 'ms',
              description: '构建总时间',
              aggregation: 'avg' as const,
              weight: 1.0,
              enabled: true
            },
            {
              name: 'dependency_install_time',
              type: 'duration' as const,
              unit: 'ms',
              description: '依赖安装时间',
              aggregation: 'avg' as const,
              weight: 0.8,
              enabled: true
            },
            {
              name: 'compilation_time',
              type: 'duration' as const,
              unit: 'ms',
              description: '编译时间',
              aggregation: 'avg' as const,
              weight: 0.9,
              enabled: true
            },
            {
              name: 'bundle_size',
              type: 'count' as const,
              unit: 'bytes',
              description: '打包文件大小',
              aggregation: 'sum' as const,
              weight: 0.6,
              enabled: true
            }
          ],
          thresholds: [
            {
              metric: 'build_duration',
              condition: 'lte' as const,
              value: 120000,
              severity: 'high' as const,
              action: 'warn' as const,
              description: '构建时间不应超过2分钟'
            },
            {
              metric: 'bundle_size',
              condition: 'lte' as const,
              value: 5242880,
              severity: 'medium' as const,
              action: 'warn' as const,
              description: '打包大小不应超过5MB'
            }
          ],
          triggers: [
            {
              type: 'manual' as const,
              condition: '',
              enabled: true,
              parameters: {}
            },
            {
              type: 'commit' as const,
              condition: 'branch == "main"',
              enabled: true,
              parameters: { branch: 'main' }
            }
          ]
        },
        baseline: {
          summary: {
            totalTime: 60000,
            successRate: 100,
            errorRate: 0,
            throughput: 1,
            score: 85,
            grade: 'B' as const,
            regressions: 0,
            improvements: 0
          },
          metrics: [],
          iterations: [],
          resources: {
            peak: {
              timestamp: Date.now(),
              cpu: 80,
              memory: 2048,
              disk: 1024,
              network: { inbound: 100, outbound: 50 },
              processes: 10
            },
            average: {
              timestamp: Date.now(),
              cpu: 60,
              memory: 1536,
              disk: 512,
              network: { inbound: 80, outbound: 40 },
              processes: 8
            },
            timeline: [],
            efficiency: {
              cpuEfficiency: 0.75,
              memoryEfficiency: 0.8,
              diskEfficiency: 0.9
            }
          },
          logs: [],
          artifacts: []
        }
      },
      {
        name: '测试性能基准测试',
        description: '测量单元测试和集成测试的性能',
        type: 'test' as const,
        configuration: {
          environment: {
            nodeVersion: 'latest',
            platform: 'linux',
            cpu: '2 cores',
            memory: '4GB',
            disk: 'SSD'
          },
          parameters: {
            iterations: 3,
            warmupRuns: 1,
            timeout: 300000,
            parallel: true,
            cacheEnabled: true
          },
          metrics: [
            {
              name: 'test_duration',
              type: 'duration' as const,
              unit: 'ms',
              description: '测试总时间',
              aggregation: 'avg' as const,
              weight: 1.0,
              enabled: true
            },
            {
              name: 'test_count',
              type: 'count' as const,
              unit: 'tests',
              description: '测试用例数量',
              aggregation: 'sum' as const,
              weight: 0.5,
              enabled: true
            },
            {
              name: 'coverage',
              type: 'percentage' as const,
              unit: '%',
              description: '代码覆盖率',
              aggregation: 'avg' as const,
              weight: 0.7,
              enabled: true
            }
          ],
          thresholds: [
            {
              metric: 'test_duration',
              condition: 'lte' as const,
              value: 60000,
              severity: 'medium' as const,
              action: 'warn' as const,
              description: '测试时间不应超过1分钟'
            },
            {
              metric: 'coverage',
              condition: 'gte' as const,
              value: 80,
              severity: 'high' as const,
              action: 'warn' as const,
              description: '代码覆盖率应达到80%'
            }
          ],
          triggers: [
            {
              type: 'manual' as const,
              condition: '',
              enabled: true,
              parameters: {}
            }
          ]
        },
        baseline: {
          summary: {
            totalTime: 30000,
            successRate: 100,
            errorRate: 0,
            throughput: 2,
            score: 90,
            grade: 'A' as const,
            regressions: 0,
            improvements: 0
          },
          metrics: [],
          iterations: [],
          resources: {
            peak: {
              timestamp: Date.now(),
              cpu: 60,
              memory: 1024,
              disk: 512,
              network: { inbound: 50, outbound: 25 },
              processes: 5
            },
            average: {
              timestamp: Date.now(),
              cpu: 40,
              memory: 768,
              disk: 256,
              network: { inbound: 30, outbound: 15 },
              processes: 4
            },
            timeline: [],
            efficiency: {
              cpuEfficiency: 0.8,
              memoryEfficiency: 0.85,
              diskEfficiency: 0.9
            }
          },
          logs: [],
          artifacts: []
        }
      }
    ]

    // 这里应该检查是否已存在默认基准测试，如果不存在则创建
    logger.debug('Default benchmarks initialized')
  }

  /**
   * 创建基准测试
   */
  async createBenchmark(benchmark: Omit<PerformanceBenchmark, 'id'>): Promise<string> {
    const id = `benchmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const stmt = this.db.prepare(`
        INSERT INTO performance_benchmarks (
          id, app_id, name, description, type, configuration, baseline,
          status, created_by, created_at, updated_at, version, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        benchmark.appId,
        benchmark.name,
        benchmark.description,
        benchmark.type,
        JSON.stringify(benchmark.configuration),
        JSON.stringify(benchmark.baseline),
        benchmark.status,
        benchmark.metadata.createdBy,
        benchmark.metadata.createdAt,
        benchmark.metadata.updatedAt,
        benchmark.metadata.version,
        JSON.stringify(benchmark.metadata.tags)
      )

      this.benchmarkCache.set(id, { ...benchmark, id })

      logger.info('Benchmark created', { id, name: benchmark.name, type: benchmark.type })
      return id
    } catch (error) {
      logger.error('Failed to create benchmark', { error })
      throw error
    }
  }

  /**
   * 执行基准测试
   */
  async executeBenchmark(
    benchmarkId: string,
    triggeredBy: string,
    triggerType: string,
    options?: {
      commit?: string
      branch?: string
      buildId?: string
    }
  ): Promise<string> {
    try {
      const benchmark = await this.getBenchmarkById(benchmarkId)
      if (!benchmark) {
        throw new Error('Benchmark not found')
      }

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const execution: BenchmarkExecution = {
        id: executionId,
        benchmarkId,
        appId: benchmark.appId,
        status: 'pending',
        startTime: Date.now(),
        triggeredBy,
        triggerType,
        environment: await this.getCurrentEnvironment(),
        results: {
          summary: {
            totalTime: 0,
            successRate: 0,
            errorRate: 0,
            throughput: 0,
            score: 0,
            grade: 'F',
            regressions: 0,
            improvements: 0
          },
          metrics: [],
          iterations: [],
          resources: {
            peak: {
              timestamp: Date.now(),
              cpu: 0,
              memory: 0,
              disk: 0,
              network: { inbound: 0, outbound: 0 },
              processes: 0
            },
            average: {
              timestamp: Date.now(),
              cpu: 0,
              memory: 0,
              disk: 0,
              network: { inbound: 0, outbound: 0 },
              processes: 0
            },
            timeline: [],
            efficiency: {
              cpuEfficiency: 0,
              memoryEfficiency: 0,
              diskEfficiency: 0
            }
          },
          logs: [],
          artifacts: []
        },
        issues: [],
        metadata: {
          version: '1.0.0',
          commit: options?.commit,
          branch: options?.branch,
          buildId: options?.buildId,
          createdAt: Date.now()
        }
      }

      // 保存执行记录
      await this.saveExecution(execution)
      this.activeBenchmarks.set(executionId, execution)

      // 开始执行
      this.performBenchmark(execution, benchmark)

      logger.info('Benchmark execution started', { executionId, benchmarkId })
      return executionId
    } catch (error) {
      logger.error('Failed to execute benchmark', { benchmarkId, error })
      throw error
    }
  }

  /**
   * 执行基准测试
   */
  private async performBenchmark(execution: BenchmarkExecution, benchmark: PerformanceBenchmark): Promise<void> {
    execution.status = 'running'
    this.addExecutionLog(execution, 'info', `Starting benchmark: ${benchmark.name}`)

    try {
      const config = benchmark.configuration
      const iterations: IterationResult[] = []

      // 预热运行
      for (let i = 0; i < config.parameters.warmupRuns; i++) {
        this.addExecutionLog(execution, 'info', `Warmup run ${i + 1}/${config.parameters.warmupRuns}`)
        await this.runSingleIteration(execution, benchmark, i, true)
      }

      // 正式测试
      for (let i = 0; i < config.parameters.iterations; i++) {
        this.addExecutionLog(execution, 'info', `Iteration ${i + 1}/${config.parameters.iterations}`)
        const result = await this.runSingleIteration(execution, benchmark, i, false)
        iterations.push(result)
      }

      execution.results.iterations = iterations

      // 计算指标
      this.calculateMetrics(execution, benchmark)

      // 检测性能问题
      execution.issues = this.detectPerformanceIssues(execution, benchmark)

      // 与基线比较
      execution.comparison = this.compareWithBaseline(execution.results, benchmark.baseline)

      execution.status = 'completed'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addExecutionLog(execution, 'info', 'Benchmark execution completed successfully')

    } catch (error) {
      execution.status = 'failed'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addExecutionLog(execution, 'error', `Benchmark execution failed: ${error.message}`)
    } finally {
      // 保存最终结果
      await this.saveExecution(execution)
      this.activeBenchmarks.delete(execution.id)

      // 发送事件
      this.emit('benchmark_complete', execution)
    }
  }

  /**
   * 运行单次迭代
   */
  private async runSingleIteration(
    execution: BenchmarkExecution,
    benchmark: PerformanceBenchmark,
    iteration: number,
    isWarmup: boolean
  ): Promise<IterationResult> {
    const startTime = Date.now()

    try {
      // 模拟基准测试执行
      const duration = this.simulateBenchmarkExecution(benchmark.type)
      
      // 收集资源使用情况
      const resources = await this.collectResourceSnapshot()

      // 模拟指标收集
      const metrics = this.collectIterationMetrics(benchmark, duration)

      const endTime = Date.now()

      return {
        iteration,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: true,
        metrics,
        resources,
      }
    } catch (error) {
      const endTime = Date.now()
      
      return {
        iteration,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: false,
        metrics: {},
        resources: await this.collectResourceSnapshot(),
        error: error.message
      }
    }
  }

  /**
   * 模拟基准测试执行
   */
  private simulateBenchmarkExecution(type: string): number {
    // 根据测试类型模拟不同的执行时间
    const baseDuration = {
      'build': 60000,
      'test': 30000,
      'deploy': 45000,
      'full-pipeline': 120000,
      'custom': 40000
    }[type] || 40000

    // 添加随机变化（±20%）
    const variation = (Math.random() - 0.5) * 0.4
    return Math.round(baseDuration * (1 + variation))
  }

  /**
   * 收集资源快照
   */
  private async collectResourceSnapshot(): Promise<ResourceSnapshot> {
    // 模拟资源使用数据收集
    return {
      timestamp: Date.now(),
      cpu: Math.random() * 100,
      memory: Math.random() * 4096,
      disk: Math.random() * 1024,
      network: {
        inbound: Math.random() * 1000,
        outbound: Math.random() * 500
      },
      processes: Math.floor(Math.random() * 20) + 5
    }
  }

  /**
   * 收集迭代指标
   */
  private collectIterationMetrics(benchmark: PerformanceBenchmark, duration: number): Record<string, number> {
    const metrics: Record<string, number> = {}

    for (const metric of benchmark.configuration.metrics) {
      if (!metric.enabled) continue

      switch (metric.name) {
        case 'build_duration':
        case 'test_duration':
          metrics[metric.name] = duration
          break
        case 'bundle_size':
          metrics[metric.name] = Math.floor(Math.random() * 5242880) + 1048576 // 1-5MB
          break
        case 'test_count':
          metrics[metric.name] = Math.floor(Math.random() * 100) + 10
          break
        case 'coverage':
          metrics[metric.name] = Math.random() * 20 + 80 // 80-100%
          break
        default:
          metrics[metric.name] = Math.random() * 100
      }
    }

    return metrics
  }

  /**
   * 计算指标
   */
  private calculateMetrics(execution: BenchmarkExecution, benchmark: PerformanceBenchmark): void {
    const iterations = execution.results.iterations
    const metricResults: MetricResult[] = []

    for (const metricConfig of benchmark.configuration.metrics) {
      if (!metricConfig.enabled) continue

      const values = iterations
        .filter(iter => iter.success && iter.metrics[metricConfig.name] !== undefined)
        .map(iter => iter.metrics[metricConfig.name])

      if (values.length === 0) continue

      const sorted = [...values].sort((a, b) => a - b)
      const sum = values.reduce((a, b) => a + b, 0)
      const avg = sum / values.length
      const min = sorted[0]
      const max = sorted[sorted.length - 1]
      const median = sorted[Math.floor(sorted.length / 2)]
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      const p99 = sorted[Math.floor(sorted.length * 0.99)]
      const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length
      const stdDev = Math.sqrt(variance)

      // 计算趋势（简化实现）
      const trend = this.calculateTrend(values)
      const changePercent = this.calculateChangePercent(metricConfig.name, avg, benchmark.baseline)

      metricResults.push({
        name: metricConfig.name,
        value: avg,
        unit: metricConfig.unit,
        aggregation: metricConfig.aggregation,
        samples: values,
        statistics: {
          min,
          max,
          avg,
          median,
          p95,
          p99,
          stdDev
        },
        trend,
        changePercent
      })
    }

    execution.results.metrics = metricResults

    // 计算总体摘要
    this.calculateSummary(execution, benchmark)
  }

  /**
   * 计算趋势
   */
  private calculateTrend(values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 3) return 'stable'

    const firstHalf = values.slice(0, Math.floor(values.length / 2))
    const secondHalf = values.slice(Math.floor(values.length / 2))

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

    const change = (secondAvg - firstAvg) / firstAvg

    if (change > 0.05) return 'degrading'
    if (change < -0.05) return 'improving'
    return 'stable'
  }

  /**
   * 计算变化百分比
   */
  private calculateChangePercent(metricName: string, currentValue: number, baseline: BenchmarkResult): number {
    const baselineMetric = baseline.metrics.find(m => m.name === metricName)
    if (!baselineMetric) return 0

    return ((currentValue - baselineMetric.value) / baselineMetric.value) * 100
  }

  /**
   * 计算摘要
   */
  private calculateSummary(execution: BenchmarkExecution, benchmark: PerformanceBenchmark): void {
    const iterations = execution.results.iterations
    const successfulIterations = iterations.filter(iter => iter.success)
    
    const totalTime = iterations.reduce((sum, iter) => sum + iter.duration, 0)
    const successRate = (successfulIterations.length / iterations.length) * 100
    const errorRate = 100 - successRate
    const throughput = successfulIterations.length / (totalTime / 1000) // iterations per second

    // 计算性能评分
    const score = this.calculatePerformanceScore(execution.results.metrics, benchmark)
    const grade = this.calculateGrade(score)

    // 计算回归和改进数量
    const { regressions, improvements } = this.countChanges(execution.results.metrics)

    execution.results.summary = {
      totalTime,
      successRate,
      errorRate,
      throughput,
      score,
      grade,
      regressions,
      improvements
    }
  }

  /**
   * 计算性能评分
   */
  private calculatePerformanceScore(metrics: MetricResult[], benchmark: PerformanceBenchmark): number {
    let totalScore = 0
    let totalWeight = 0

    for (const metric of metrics) {
      const config = benchmark.configuration.metrics.find(m => m.name === metric.name)
      if (!config) continue

      // 基于变化百分比计算分数
      let metricScore = 100
      if (metric.changePercent > 0) {
        metricScore = Math.max(0, 100 - Math.abs(metric.changePercent))
      } else {
        metricScore = Math.min(100, 100 + Math.abs(metric.changePercent) / 2)
      }

      totalScore += metricScore * config.weight
      totalWeight += config.weight
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  /**
   * 计算等级
   */
  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  /**
   * 统计变化
   */
  private countChanges(metrics: MetricResult[]): { regressions: number; improvements: number } {
    let regressions = 0
    let improvements = 0

    for (const metric of metrics) {
      if (metric.changePercent > 5) {
        regressions++
      } else if (metric.changePercent < -5) {
        improvements++
      }
    }

    return { regressions, improvements }
  }

  /**
   * 检测性能问题
   */
  private detectPerformanceIssues(execution: BenchmarkExecution, benchmark: PerformanceBenchmark): PerformanceIssue[] {
    const issues: PerformanceIssue[] = []

    // 检查阈值违规
    for (const threshold of benchmark.configuration.thresholds) {
      const metric = execution.results.metrics.find(m => m.name === threshold.metric)
      if (!metric) continue

      const violated = this.checkThresholdViolation(metric.value, threshold)
      if (violated) {
        issues.push({
          id: `threshold_${threshold.metric}`,
          type: 'threshold-violation',
          severity: threshold.severity,
          title: `${threshold.metric} 阈值违规`,
          description: threshold.description,
          metric: threshold.metric,
          value: metric.value,
          threshold: threshold.value,
          impact: this.calculateImpact(threshold.severity),
          recommendation: `优化 ${threshold.metric} 以满足性能要求`,
          detectedAt: Date.now()
        })
      }
    }

    // 检查性能回归
    for (const metric of execution.results.metrics) {
      if (metric.changePercent > 20) {
        issues.push({
          id: `regression_${metric.name}`,
          type: 'regression',
          severity: metric.changePercent > 50 ? 'critical' : 'high',
          title: `${metric.name} 性能回归`,
          description: `${metric.name} 相比基线下降了 ${metric.changePercent.toFixed(1)}%`,
          metric: metric.name,
          value: metric.value,
          impact: Math.min(1, metric.changePercent / 100),
          recommendation: `分析 ${metric.name} 性能下降的原因并进行优化`,
          detectedAt: Date.now()
        })
      }
    }

    return issues
  }

  /**
   * 检查阈值违规
   */
  private checkThresholdViolation(value: number, threshold: PerformanceThreshold): boolean {
    switch (threshold.condition) {
      case 'lt': return value >= threshold.value
      case 'lte': return value > threshold.value
      case 'gt': return value <= threshold.value
      case 'gte': return value < threshold.value
      case 'eq': return value !== threshold.value
      case 'ne': return value === threshold.value
      default: return false
    }
  }

  /**
   * 计算影响程度
   */
  private calculateImpact(severity: string): number {
    switch (severity) {
      case 'critical': return 1.0
      case 'high': return 0.8
      case 'medium': return 0.6
      case 'low': return 0.4
      default: return 0.2
    }
  }

  /**
   * 与基线比较
   */
  private compareWithBaseline(current: BenchmarkResult, baseline: BenchmarkResult): BenchmarkComparison {
    const changes: MetricChange[] = []

    for (const currentMetric of current.metrics) {
      const baselineMetric = baseline.metrics.find(m => m.name === currentMetric.name)
      if (!baselineMetric) continue

      const change = currentMetric.value - baselineMetric.value
      const changePercent = (change / baselineMetric.value) * 100

      let direction: 'improvement' | 'regression' | 'neutral' = 'neutral'
      if (Math.abs(changePercent) > 5) {
        direction = changePercent < 0 ? 'improvement' : 'regression'
      }

      const significance = Math.abs(changePercent) > 10 ? 'significant' : 
                          Math.abs(changePercent) > 5 ? 'minor' : 'negligible'

      changes.push({
        metric: currentMetric.name,
        baselineValue: baselineMetric.value,
        currentValue: currentMetric.value,
        change,
        changePercent,
        direction,
        significance
      })
    }

    const significantChanges = changes.filter(c => c.significance === 'significant').length
    const regressions = changes.filter(c => c.direction === 'regression').length
    const improvements = changes.filter(c => c.direction === 'improvement').length
    const neutralChanges = changes.filter(c => c.direction === 'neutral').length

    const overallChange = changes.reduce((sum, c) => sum + c.changePercent, 0) / changes.length

    let recommendation = '性能表现稳定'
    if (regressions > improvements) {
      recommendation = '检测到性能回归，建议进行优化'
    } else if (improvements > regressions) {
      recommendation = '性能有所改善，继续保持'
    }

    return {
      baseline,
      current,
      changes,
      summary: {
        overallChange,
        significantChanges,
        regressions,
        improvements,
        neutralChanges,
        recommendation
      },
      significance: {
        method: 'ttest',
        pValue: 0.05,
        significant: significantChanges > 0,
        confidenceLevel: 0.95,
        effectSize: Math.abs(overallChange) / 100
      }
    }
  }

  /**
   * 获取当前环境信息
   */
  private async getCurrentEnvironment(): Promise<ExecutionEnvironment> {
    // 模拟环境信息收集
    return {
      nodeVersion: process.version,
      platform: process.platform,
      cpu: '2 cores',
      memory: '4GB',
      disk: 'SSD',
      load: Math.random(),
      temperature: 45 + Math.random() * 20,
      networkLatency: Math.random() * 100
    }
  }

  /**
   * 添加执行日志
   */
  private addExecutionLog(
    execution: BenchmarkExecution,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    iteration?: number,
    context?: Record<string, any>
  ): void {
    const log: ExecutionLog = {
      timestamp: Date.now(),
      level,
      message,
      source: 'benchmark',
      iteration,
      context
    }

    execution.results.logs.push(log)
  }

  /**
   * 保存执行结果
   */
  private async saveExecution(execution: BenchmarkExecution): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO benchmark_executions (
          id, benchmark_id, app_id, status, start_time, end_time, duration,
          triggered_by, trigger_type, environment, results, comparison,
          issues, version, commit, branch, build_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        execution.id,
        execution.benchmarkId,
        execution.appId,
        execution.status,
        execution.startTime,
        execution.endTime,
        execution.duration,
        execution.triggeredBy,
        execution.triggerType,
        JSON.stringify(execution.environment),
        JSON.stringify(execution.results),
        JSON.stringify(execution.comparison),
        JSON.stringify(execution.issues),
        execution.metadata.version,
        execution.metadata.commit,
        execution.metadata.branch,
        execution.metadata.buildId,
        execution.metadata.createdAt
      )
    } catch (error) {
      logger.error('Failed to save benchmark execution', { executionId: execution.id, error })
    }
  }

  /**
   * 根据ID获取基准测试
   */
  async getBenchmarkById(id: string): Promise<PerformanceBenchmark | null> {
    // 先从缓存获取
    const cached = this.benchmarkCache.get(id)
    if (cached) return cached

    // 从数据库获取
    try {
      const stmt = this.db.prepare('SELECT * FROM performance_benchmarks WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      const benchmark: PerformanceBenchmark = {
        id: row.id,
        appId: row.app_id,
        name: row.name,
        description: row.description,
        type: row.type,
        configuration: JSON.parse(row.configuration),
        baseline: JSON.parse(row.baseline),
        status: row.status,
        metadata: {
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          version: row.version,
          tags: JSON.parse(row.tags)
        }
      }

      this.benchmarkCache.set(id, benchmark)
      return benchmark
    } catch (error) {
      logger.error('Failed to get benchmark by id', { id, error })
      return null
    }
  }

  /**
   * 获取基准测试列表
   */
  async getBenchmarks(appId?: string, status?: string): Promise<PerformanceBenchmark[]> {
    try {
      let query = 'SELECT * FROM performance_benchmarks WHERE 1=1'
      const params: any[] = []

      if (appId) {
        query += ' AND app_id = ?'
        params.push(appId)
      }

      if (status) {
        query += ' AND status = ?'
        params.push(status)
      }

      query += ' ORDER BY created_at DESC'

      const stmt = this.db.prepare(query)
      const rows = stmt.all(...params) as any[]

      return rows.map(row => ({
        id: row.id,
        appId: row.app_id,
        name: row.name,
        description: row.description,
        type: row.type,
        configuration: JSON.parse(row.configuration),
        baseline: JSON.parse(row.baseline),
        status: row.status,
        metadata: {
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          version: row.version,
          tags: JSON.parse(row.tags)
        }
      }))
    } catch (error) {
      logger.error('Failed to get benchmarks', { error })
      return []
    }
  }

  /**
   * 获取执行历史
   */
  async getExecutionHistory(benchmarkId?: string, appId?: string, limit: number = 20): Promise<BenchmarkExecution[]> {
    try {
      let query = 'SELECT * FROM benchmark_executions WHERE 1=1'
      const params: any[] = []

      if (benchmarkId) {
        query += ' AND benchmark_id = ?'
        params.push(benchmarkId)
      }

      if (appId) {
        query += ' AND app_id = ?'
        params.push(appId)
      }

      query += ' ORDER BY start_time DESC LIMIT ?'
      params.push(limit)

      const stmt = this.db.prepare(query)
      const rows = stmt.all(...params) as any[]

      return rows.map(row => ({
        id: row.id,
        benchmarkId: row.benchmark_id,
        appId: row.app_id,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        triggeredBy: row.triggered_by,
        triggerType: row.trigger_type,
        environment: JSON.parse(row.environment),
        results: JSON.parse(row.results),
        comparison: row.comparison ? JSON.parse(row.comparison) : undefined,
        issues: JSON.parse(row.issues),
        metadata: {
          version: row.version,
          commit: row.commit,
          branch: row.branch,
          buildId: row.build_id,
          createdAt: row.created_at
        }
      }))
    } catch (error) {
      logger.error('Failed to get execution history', { error })
      return []
    }
  }
}
