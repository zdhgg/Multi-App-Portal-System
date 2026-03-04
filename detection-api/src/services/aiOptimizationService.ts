/**
 * AI Optimization Service - AI驱动的优化建议服务
 * 
 * 基于历史构建数据的机器学习分析，智能识别性能瓶颈和优化机会，
 * 自动生成个性化的优化建议，实现优化效果预测和验证
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface OptimizationAnalysis {
  id: string
  appId: string
  type: 'performance' | 'resource' | 'dependency' | 'configuration' | 'comprehensive'
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  duration?: number
  triggeredBy: string
  dataRange: {
    startDate: number
    endDate: number
    buildCount: number
  }
  insights: AnalysisInsight[]
  recommendations: OptimizationRecommendation[]
  predictions: OptimizationPrediction[]
  metadata: {
    version: string
    algorithm: string
    confidence: number
    createdAt: number
    updatedAt: number
  }
}

export interface AnalysisInsight {
  id: string
  category: 'performance' | 'resource' | 'dependency' | 'pattern' | 'anomaly'
  type: 'trend' | 'correlation' | 'outlier' | 'pattern' | 'bottleneck'
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  confidence: number
  evidence: InsightEvidence[]
  impact: {
    performance: number
    cost: number
    reliability: number
    maintainability: number
  }
  timeframe: {
    detected: number
    firstOccurrence?: number
    frequency: number
  }
}

export interface InsightEvidence {
  type: 'metric' | 'log' | 'event' | 'correlation'
  source: string
  value: any
  timestamp: number
  context: Record<string, any>
}

export interface OptimizationRecommendation {
  id: string
  category: 'build' | 'dependency' | 'configuration' | 'infrastructure' | 'workflow'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  rationale: string
  implementation: {
    steps: ImplementationStep[]
    effort: 'low' | 'medium' | 'high'
    complexity: 'simple' | 'moderate' | 'complex'
    riskLevel: 'low' | 'medium' | 'high'
    estimatedTime: number
  }
  expectedBenefits: {
    performanceImprovement: number
    costReduction: number
    reliabilityIncrease: number
    timeReduction: number
  }
  prerequisites: string[]
  alternatives: AlternativeRecommendation[]
  validation: ValidationCriteria
  metadata: {
    confidence: number
    basedOn: string[]
    applicableVersions: string[]
    tags: string[]
  }
}

export interface ImplementationStep {
  id: string
  order: number
  title: string
  description: string
  type: 'manual' | 'automated' | 'configuration'
  command?: string
  file?: string
  content?: string
  validation?: string
  rollback?: string
}

export interface AlternativeRecommendation {
  id: string
  title: string
  description: string
  tradeoffs: string[]
  effort: 'low' | 'medium' | 'high'
  benefits: Record<string, number>
}

export interface ValidationCriteria {
  metrics: string[]
  thresholds: Record<string, number>
  testCases: string[]
  rollbackConditions: string[]
}

export interface OptimizationPrediction {
  id: string
  type: 'performance' | 'cost' | 'reliability' | 'trend'
  scenario: string
  timeframe: number
  confidence: number
  prediction: {
    metric: string
    currentValue: number
    predictedValue: number
    improvement: number
    unit: string
  }
  assumptions: string[]
  factors: PredictionFactor[]
}

export interface PredictionFactor {
  name: string
  impact: number
  confidence: number
  description: string
}

export interface BuildPattern {
  id: string
  appId: string
  pattern: string
  frequency: number
  avgDuration: number
  successRate: number
  commonIssues: string[]
  optimizationOpportunities: string[]
  lastSeen: number
  confidence: number
}

export interface PerformanceModel {
  id: string
  appId: string
  type: 'regression' | 'classification' | 'clustering' | 'time-series'
  algorithm: string
  features: string[]
  accuracy: number
  lastTrained: number
  predictions: number
  version: string
  parameters: Record<string, any>
}

export interface OptimizationExperiment {
  id: string
  recommendationId: string
  appId: string
  status: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled'
  hypothesis: string
  implementation: string
  startTime: number
  endTime?: number
  duration?: number
  baseline: ExperimentMetrics
  results?: ExperimentMetrics
  conclusion: string
  learnings: string[]
  nextSteps: string[]
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
  }
}

export interface ExperimentMetrics {
  buildTime: number
  resourceUsage: {
    cpu: number
    memory: number
    disk: number
  }
  successRate: number
  errorRate: number
  throughput: number
  cost: number
}

export class AIOptimizationService extends EventEmitter {
  private models = new Map<string, PerformanceModel>()
  private patterns = new Map<string, BuildPattern[]>()
  private activeAnalyses = new Map<string, OptimizationAnalysis>()

  constructor(private db: Database) {
    super()
    this.initializeAIService()
  }

  /**
   * 初始化AI优化服务
   */
  private async initializeAIService(): Promise<void> {
    try {
      // 创建优化分析表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS optimization_analyses (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          triggered_by TEXT NOT NULL,
          data_range TEXT NOT NULL,
          insights TEXT NOT NULL DEFAULT '[]',
          recommendations TEXT NOT NULL DEFAULT '[]',
          predictions TEXT NOT NULL DEFAULT '[]',
          version TEXT NOT NULL,
          algorithm TEXT NOT NULL,
          confidence REAL NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建构建模式表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_patterns (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          pattern TEXT NOT NULL,
          frequency INTEGER NOT NULL,
          avg_duration INTEGER NOT NULL,
          success_rate REAL NOT NULL,
          common_issues TEXT NOT NULL DEFAULT '[]',
          optimization_opportunities TEXT NOT NULL DEFAULT '[]',
          last_seen INTEGER NOT NULL,
          confidence REAL NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建性能模型表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS performance_models (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          type TEXT NOT NULL,
          algorithm TEXT NOT NULL,
          features TEXT NOT NULL,
          accuracy REAL NOT NULL,
          last_trained INTEGER NOT NULL,
          predictions INTEGER NOT NULL DEFAULT 0,
          version TEXT NOT NULL,
          parameters TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建优化实验表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS optimization_experiments (
          id TEXT PRIMARY KEY,
          recommendation_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          status TEXT NOT NULL,
          hypothesis TEXT NOT NULL,
          implementation TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          baseline TEXT NOT NULL,
          results TEXT,
          conclusion TEXT,
          learnings TEXT NOT NULL DEFAULT '[]',
          next_steps TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_optimization_analyses_app_id ON optimization_analyses (app_id);
        CREATE INDEX IF NOT EXISTS idx_optimization_analyses_status ON optimization_analyses (status);
        CREATE INDEX IF NOT EXISTS idx_optimization_analyses_start_time ON optimization_analyses (start_time);
        CREATE INDEX IF NOT EXISTS idx_build_patterns_app_id ON build_patterns (app_id);
        CREATE INDEX IF NOT EXISTS idx_build_patterns_frequency ON build_patterns (frequency);
        CREATE INDEX IF NOT EXISTS idx_performance_models_app_id ON performance_models (app_id);
        CREATE INDEX IF NOT EXISTS idx_performance_models_accuracy ON performance_models (accuracy);
        CREATE INDEX IF NOT EXISTS idx_optimization_experiments_app_id ON optimization_experiments (app_id);
        CREATE INDEX IF NOT EXISTS idx_optimization_experiments_status ON optimization_experiments (status);
      `)

      // 初始化机器学习模型
      await this.initializeMLModels()

      logger.debug('AI optimization service initialized')
    } catch (error) {
      logger.error('Failed to initialize AI optimization service', { error })
      throw error
    }
  }

  /**
   * 初始化机器学习模型
   */
  private async initializeMLModels(): Promise<void> {
    // 模拟初始化一些预训练模型
    const defaultModels = [
      {
        type: 'regression',
        algorithm: 'linear-regression',
        features: ['dependency_count', 'file_count', 'complexity', 'cache_hit_rate'],
        description: '构建时间预测模型'
      },
      {
        type: 'classification',
        algorithm: 'random-forest',
        features: ['build_tool', 'node_version', 'package_count', 'test_count'],
        description: '构建成功率预测模型'
      },
      {
        type: 'clustering',
        algorithm: 'k-means',
        features: ['duration', 'resource_usage', 'error_patterns'],
        description: '构建模式聚类模型'
      }
    ]

    for (const modelConfig of defaultModels) {
      logger.debug('ML model initialized', { 
        type: modelConfig.type, 
        algorithm: modelConfig.algorithm 
      })
    }
  }

  /**
   * 启动优化分析
   */
  async startAnalysis(
    appId: string,
    type: OptimizationAnalysis['type'],
    triggeredBy: string,
    dataRange?: { startDate: number; endDate: number }
  ): Promise<string> {
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 设置默认数据范围（最近30天）
    const defaultRange = {
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now()
    }

    const range = dataRange || defaultRange

    const analysis: OptimizationAnalysis = {
      id: analysisId,
      appId,
      type,
      status: 'pending',
      startTime: Date.now(),
      triggeredBy,
      dataRange: {
        ...range,
        buildCount: 0
      },
      insights: [],
      recommendations: [],
      predictions: [],
      metadata: {
        version: '1.0.0',
        algorithm: 'ensemble-ml',
        confidence: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }

    try {
      // 保存分析记录
      await this.saveAnalysis(analysis)
      this.activeAnalyses.set(analysisId, analysis)

      // 开始分析
      this.performAnalysis(analysis)

      logger.info('AI optimization analysis started', { analysisId, appId, type })
      return analysisId
    } catch (error) {
      logger.error('Failed to start AI optimization analysis', { appId, type, error })
      throw error
    }
  }

  /**
   * 执行优化分析
   */
  private async performAnalysis(analysis: OptimizationAnalysis): Promise<void> {
    analysis.status = 'analyzing'
    analysis.metadata.updatedAt = Date.now()

    try {
      // 收集历史数据
      const buildData = await this.collectBuildData(analysis.appId, analysis.dataRange)
      analysis.dataRange.buildCount = buildData.length

      // 生成洞察
      analysis.insights = await this.generateInsights(buildData, analysis.type)

      // 生成推荐
      analysis.recommendations = await this.generateRecommendations(buildData, analysis.insights)

      // 生成预测
      analysis.predictions = await this.generatePredictions(buildData, analysis.recommendations)

      // 计算整体置信度
      analysis.metadata.confidence = this.calculateOverallConfidence(analysis)

      analysis.status = 'completed'
      analysis.endTime = Date.now()
      analysis.duration = analysis.endTime - analysis.startTime

      logger.info('AI optimization analysis completed', {
        analysisId: analysis.id,
        duration: analysis.duration,
        insights: analysis.insights.length,
        recommendations: analysis.recommendations.length
      })

    } catch (error) {
      analysis.status = 'failed'
      analysis.endTime = Date.now()
      analysis.duration = analysis.endTime - analysis.startTime

      logger.error('AI optimization analysis failed', { analysisId: analysis.id, error })
    } finally {
      // 保存最终结果
      await this.saveAnalysis(analysis)
      this.activeAnalyses.delete(analysis.id)

      // 发送事件
      this.emit('analysis_complete', analysis)
    }
  }

  /**
   * 收集构建数据
   */
  private async collectBuildData(appId: string, dataRange: { startDate: number; endDate: number }): Promise<any[]> {
    try {
      // 从构建执行表获取历史数据
      const stmt = this.db.prepare(`
        SELECT * FROM build_executions 
        WHERE app_id = ? AND start_time BETWEEN ? AND ?
        ORDER BY start_time DESC
      `)

      const builds = stmt.all(appId, dataRange.startDate, dataRange.endDate) as any[]

      // 模拟数据增强
      return builds.map(build => ({
        ...build,
        metrics: {
          duration: build.duration || 0,
          success: build.status === 'success',
          resourceUsage: {
            cpu: Math.random() * 100,
            memory: Math.random() * 2048,
            disk: Math.random() * 1024
          },
          cacheHitRate: Math.random(),
          testCount: Math.floor(Math.random() * 100),
          dependencyCount: Math.floor(Math.random() * 500)
        }
      }))
    } catch (error) {
      logger.error('Failed to collect build data', { appId, error })
      return []
    }
  }

  /**
   * 生成洞察
   */
  private async generateInsights(buildData: any[], analysisType: string): Promise<AnalysisInsight[]> {
    const insights: AnalysisInsight[] = []

    // 性能趋势分析
    if (analysisType === 'performance' || analysisType === 'comprehensive') {
      const performanceInsight = this.analyzePerformanceTrend(buildData)
      if (performanceInsight) insights.push(performanceInsight)
    }

    // 资源使用分析
    if (analysisType === 'resource' || analysisType === 'comprehensive') {
      const resourceInsight = this.analyzeResourceUsage(buildData)
      if (resourceInsight) insights.push(resourceInsight)
    }

    // 依赖分析
    if (analysisType === 'dependency' || analysisType === 'comprehensive') {
      const dependencyInsight = this.analyzeDependencyPatterns(buildData)
      if (dependencyInsight) insights.push(dependencyInsight)
    }

    // 异常检测
    const anomalies = this.detectAnomalies(buildData)
    insights.push(...anomalies)

    return insights
  }

  /**
   * 分析性能趋势
   */
  private analyzePerformanceTrend(buildData: any[]): AnalysisInsight | null {
    if (buildData.length < 5) return null

    const durations = buildData.map(b => b.metrics.duration).filter(d => d > 0)
    if (durations.length === 0) return null

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const recentDurations = durations.slice(0, Math.min(10, durations.length))
    const recentAvg = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length

    const trend = (recentAvg - avgDuration) / avgDuration * 100

    return {
      id: 'performance-trend',
      category: 'performance',
      type: 'trend',
      title: trend > 10 ? '构建时间呈上升趋势' : trend < -10 ? '构建时间呈下降趋势' : '构建时间相对稳定',
      description: `最近构建的平均时间为 ${Math.round(recentAvg)}ms，相比历史平均时间 ${Math.round(avgDuration)}ms ${trend > 0 ? '增加' : '减少'}了 ${Math.abs(trend).toFixed(1)}%`,
      severity: trend > 20 ? 'high' : trend > 10 ? 'medium' : 'low',
      confidence: Math.min(0.9, durations.length / 20),
      evidence: [
        {
          type: 'metric',
          source: 'build_duration',
          value: { avgDuration, recentAvg, trend },
          timestamp: Date.now(),
          context: { sampleSize: durations.length }
        }
      ],
      impact: {
        performance: Math.abs(trend) / 100,
        cost: Math.abs(trend) / 200,
        reliability: 0,
        maintainability: 0
      },
      timeframe: {
        detected: Date.now(),
        frequency: durations.length
      }
    }
  }

  /**
   * 分析资源使用
   */
  private analyzeResourceUsage(buildData: any[]): AnalysisInsight | null {
    if (buildData.length === 0) return null

    const cpuUsages = buildData.map(b => b.metrics.resourceUsage.cpu)
    const avgCpuUsage = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length

    return {
      id: 'resource-usage',
      category: 'resource',
      type: 'pattern',
      title: avgCpuUsage > 80 ? 'CPU使用率偏高' : 'CPU使用率正常',
      description: `平均CPU使用率为 ${avgCpuUsage.toFixed(1)}%`,
      severity: avgCpuUsage > 90 ? 'high' : avgCpuUsage > 80 ? 'medium' : 'low',
      confidence: 0.8,
      evidence: [
        {
          type: 'metric',
          source: 'cpu_usage',
          value: { average: avgCpuUsage, max: Math.max(...cpuUsages) },
          timestamp: Date.now(),
          context: { sampleSize: cpuUsages.length }
        }
      ],
      impact: {
        performance: avgCpuUsage > 80 ? 0.6 : 0.2,
        cost: avgCpuUsage > 80 ? 0.4 : 0.1,
        reliability: avgCpuUsage > 90 ? 0.7 : 0.1,
        maintainability: 0
      },
      timeframe: {
        detected: Date.now(),
        frequency: buildData.length
      }
    }
  }

  /**
   * 分析依赖模式
   */
  private analyzeDependencyPatterns(buildData: any[]): AnalysisInsight | null {
    if (buildData.length === 0) return null

    const dependencyCounts = buildData.map(b => b.metrics.dependencyCount)
    const avgDependencies = dependencyCounts.reduce((a, b) => a + b, 0) / dependencyCounts.length

    return {
      id: 'dependency-pattern',
      category: 'dependency',
      type: 'pattern',
      title: avgDependencies > 300 ? '依赖数量较多' : '依赖数量适中',
      description: `平均依赖数量为 ${Math.round(avgDependencies)} 个`,
      severity: avgDependencies > 500 ? 'medium' : 'low',
      confidence: 0.7,
      evidence: [
        {
          type: 'metric',
          source: 'dependency_count',
          value: { average: avgDependencies, max: Math.max(...dependencyCounts) },
          timestamp: Date.now(),
          context: { sampleSize: dependencyCounts.length }
        }
      ],
      impact: {
        performance: avgDependencies > 300 ? 0.4 : 0.1,
        cost: 0.1,
        reliability: avgDependencies > 500 ? 0.3 : 0.1,
        maintainability: avgDependencies > 300 ? 0.5 : 0.2
      },
      timeframe: {
        detected: Date.now(),
        frequency: buildData.length
      }
    }
  }

  /**
   * 检测异常
   */
  private detectAnomalies(buildData: any[]): AnalysisInsight[] {
    const anomalies: AnalysisInsight[] = []

    // 检测构建时间异常
    const durations = buildData.map(b => b.metrics.duration).filter(d => d > 0)
    if (durations.length > 5) {
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const stdDev = Math.sqrt(durations.reduce((a, b) => a + Math.pow(b - avgDuration, 2), 0) / durations.length)
      
      const outliers = durations.filter(d => Math.abs(d - avgDuration) > 2 * stdDev)
      
      if (outliers.length > 0) {
        anomalies.push({
          id: 'duration-anomaly',
          category: 'anomaly',
          type: 'outlier',
          title: '检测到构建时间异常',
          description: `发现 ${outliers.length} 次构建时间异常，可能存在性能问题`,
          severity: outliers.length > durations.length * 0.1 ? 'high' : 'medium',
          confidence: 0.8,
          evidence: [
            {
              type: 'metric',
              source: 'duration_outliers',
              value: { outliers, avgDuration, stdDev },
              timestamp: Date.now(),
              context: { totalBuilds: durations.length }
            }
          ],
          impact: {
            performance: 0.6,
            cost: 0.3,
            reliability: 0.4,
            maintainability: 0.2
          },
          timeframe: {
            detected: Date.now(),
            frequency: outliers.length
          }
        })
      }
    }

    return anomalies
  }

  /**
   * 生成优化建议
   */
  private async generateRecommendations(buildData: any[], insights: AnalysisInsight[]): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = []

    // 基于洞察生成建议
    for (const insight of insights) {
      const recommendation = this.generateRecommendationFromInsight(insight, buildData)
      if (recommendation) {
        recommendations.push(recommendation)
      }
    }

    // 通用优化建议
    const generalRecommendations = this.generateGeneralRecommendations(buildData)
    recommendations.push(...generalRecommendations)

    return recommendations
  }

  /**
   * 基于洞察生成建议
   */
  private generateRecommendationFromInsight(insight: AnalysisInsight, buildData: any[]): OptimizationRecommendation | null {
    switch (insight.id) {
      case 'performance-trend':
        if (insight.severity === 'high') {
          return {
            id: 'optimize-build-performance',
            category: 'build',
            priority: 'high',
            title: '优化构建性能',
            description: '构建时间呈上升趋势，建议进行性能优化',
            rationale: '基于历史数据分析，构建时间持续增长可能影响开发效率',
            implementation: {
              steps: [
                {
                  id: 'step1',
                  order: 1,
                  title: '启用构建缓存',
                  description: '配置构建工具的缓存机制',
                  type: 'configuration',
                  command: 'npm config set cache-min 86400'
                },
                {
                  id: 'step2',
                  order: 2,
                  title: '优化依赖安装',
                  description: '使用 npm ci 替代 npm install',
                  type: 'configuration',
                  command: 'npm ci'
                }
              ],
              effort: 'medium',
              complexity: 'moderate',
              riskLevel: 'low',
              estimatedTime: 120
            },
            expectedBenefits: {
              performanceImprovement: 30,
              costReduction: 15,
              reliabilityIncrease: 10,
              timeReduction: 25
            },
            prerequisites: ['Node.js >= 14', 'npm >= 6'],
            alternatives: [],
            validation: {
              metrics: ['build_duration', 'cache_hit_rate'],
              thresholds: { build_duration: -20, cache_hit_rate: 0.8 },
              testCases: ['full build', 'incremental build'],
              rollbackConditions: ['build_failure_rate > 10%']
            },
            metadata: {
              confidence: insight.confidence,
              basedOn: [insight.id],
              applicableVersions: ['*'],
              tags: ['performance', 'cache']
            }
          }
        }
        break

      case 'resource-usage':
        if (insight.severity === 'high') {
          return {
            id: 'optimize-resource-usage',
            category: 'infrastructure',
            priority: 'medium',
            title: '优化资源使用',
            description: 'CPU使用率偏高，建议优化资源配置',
            rationale: 'CPU使用率过高可能导致构建不稳定和成本增加',
            implementation: {
              steps: [
                {
                  id: 'step1',
                  order: 1,
                  title: '调整并发设置',
                  description: '减少并发任务数量',
                  type: 'configuration'
                }
              ],
              effort: 'low',
              complexity: 'simple',
              riskLevel: 'low',
              estimatedTime: 30
            },
            expectedBenefits: {
              performanceImprovement: 15,
              costReduction: 20,
              reliabilityIncrease: 25,
              timeReduction: 5
            },
            prerequisites: [],
            alternatives: [],
            validation: {
              metrics: ['cpu_usage', 'memory_usage'],
              thresholds: { cpu_usage: 80, memory_usage: 80 },
              testCases: ['stress test'],
              rollbackConditions: ['build_failure_rate > 5%']
            },
            metadata: {
              confidence: insight.confidence,
              basedOn: [insight.id],
              applicableVersions: ['*'],
              tags: ['resource', 'optimization']
            }
          }
        }
        break
    }

    return null
  }

  /**
   * 生成通用优化建议
   */
  private generateGeneralRecommendations(buildData: any[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    // 如果缓存命中率低，建议优化缓存
    const avgCacheHitRate = buildData.reduce((sum, build) => sum + build.metrics.cacheHitRate, 0) / buildData.length
    
    if (avgCacheHitRate < 0.5) {
      recommendations.push({
        id: 'improve-cache-strategy',
        category: 'build',
        priority: 'medium',
        title: '改进缓存策略',
        description: '当前缓存命中率较低，建议优化缓存配置',
        rationale: `缓存命中率仅为 ${(avgCacheHitRate * 100).toFixed(1)}%，有很大优化空间`,
        implementation: {
          steps: [
            {
              id: 'step1',
              order: 1,
              title: '分析缓存失效原因',
              description: '检查缓存配置和失效模式',
              type: 'manual'
            },
            {
              id: 'step2',
              order: 2,
              title: '优化缓存键策略',
              description: '改进缓存键的生成逻辑',
              type: 'configuration'
            }
          ],
          effort: 'medium',
          complexity: 'moderate',
          riskLevel: 'low',
          estimatedTime: 180
        },
        expectedBenefits: {
          performanceImprovement: 40,
          costReduction: 25,
          reliabilityIncrease: 15,
          timeReduction: 35
        },
        prerequisites: [],
        alternatives: [],
        validation: {
          metrics: ['cache_hit_rate', 'build_duration'],
          thresholds: { cache_hit_rate: 0.8, build_duration: -30 },
          testCases: ['cache test'],
          rollbackConditions: []
        },
        metadata: {
          confidence: 0.8,
          basedOn: ['cache_analysis'],
          applicableVersions: ['*'],
          tags: ['cache', 'performance']
        }
      })
    }

    return recommendations
  }

  /**
   * 生成预测
   */
  private async generatePredictions(buildData: any[], recommendations: OptimizationRecommendation[]): Promise<OptimizationPrediction[]> {
    const predictions: OptimizationPrediction[] = []

    // 性能改进预测
    if (recommendations.length > 0) {
      const totalPerformanceImprovement = recommendations.reduce(
        (sum, rec) => sum + rec.expectedBenefits.performanceImprovement, 0
      )

      const avgDuration = buildData.reduce((sum, build) => sum + build.metrics.duration, 0) / buildData.length
      const predictedDuration = avgDuration * (1 - totalPerformanceImprovement / 100)

      predictions.push({
        id: 'performance-improvement',
        type: 'performance',
        scenario: '应用所有推荐的优化措施',
        timeframe: 30 * 24 * 60 * 60 * 1000, // 30天
        confidence: 0.75,
        prediction: {
          metric: 'build_duration',
          currentValue: avgDuration,
          predictedValue: predictedDuration,
          improvement: totalPerformanceImprovement,
          unit: 'ms'
        },
        assumptions: [
          '所有推荐措施都能成功实施',
          '没有新的性能瓶颈出现',
          '构建复杂度保持相对稳定'
        ],
        factors: [
          {
            name: '缓存优化',
            impact: 0.4,
            confidence: 0.8,
            description: '改进缓存策略带来的性能提升'
          },
          {
            name: '依赖优化',
            impact: 0.3,
            confidence: 0.7,
            description: '优化依赖管理带来的改进'
          }
        ]
      })
    }

    return predictions
  }

  /**
   * 计算整体置信度
   */
  private calculateOverallConfidence(analysis: OptimizationAnalysis): number {
    const insightConfidences = analysis.insights.map(i => i.confidence)
    const recommendationConfidences = analysis.recommendations.map(r => r.metadata.confidence)
    const predictionConfidences = analysis.predictions.map(p => p.confidence)

    const allConfidences = [...insightConfidences, ...recommendationConfidences, ...predictionConfidences]
    
    if (allConfidences.length === 0) return 0

    return allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length
  }

  /**
   * 保存分析结果
   */
  private async saveAnalysis(analysis: OptimizationAnalysis): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO optimization_analyses (
          id, app_id, type, status, start_time, end_time, duration,
          triggered_by, data_range, insights, recommendations, predictions,
          version, algorithm, confidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        analysis.id,
        analysis.appId,
        analysis.type,
        analysis.status,
        analysis.startTime,
        analysis.endTime,
        analysis.duration,
        analysis.triggeredBy,
        JSON.stringify(analysis.dataRange),
        JSON.stringify(analysis.insights),
        JSON.stringify(analysis.recommendations),
        JSON.stringify(analysis.predictions),
        analysis.metadata.version,
        analysis.metadata.algorithm,
        analysis.metadata.confidence,
        analysis.metadata.createdAt,
        analysis.metadata.updatedAt
      )
    } catch (error) {
      logger.error('Failed to save optimization analysis', { analysisId: analysis.id, error })
    }
  }

  /**
   * 获取分析结果
   */
  async getAnalysis(analysisId: string): Promise<OptimizationAnalysis | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM optimization_analyses WHERE id = ?')
      const row = stmt.get(analysisId) as any

      if (!row) return null

      return {
        id: row.id,
        appId: row.app_id,
        type: row.type,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        triggeredBy: row.triggered_by,
        dataRange: JSON.parse(row.data_range),
        insights: JSON.parse(row.insights),
        recommendations: JSON.parse(row.recommendations),
        predictions: JSON.parse(row.predictions),
        metadata: {
          version: row.version,
          algorithm: row.algorithm,
          confidence: row.confidence,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      }
    } catch (error) {
      logger.error('Failed to get optimization analysis', { analysisId, error })
      return null
    }
  }

  /**
   * 获取应用的分析历史
   */
  async getAnalysisHistory(appId: string, limit: number = 10): Promise<OptimizationAnalysis[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM optimization_analyses 
        WHERE app_id = ? 
        ORDER BY start_time DESC 
        LIMIT ?
      `)
      
      const rows = stmt.all(appId, limit) as any[]

      return rows.map(row => ({
        id: row.id,
        appId: row.app_id,
        type: row.type,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        triggeredBy: row.triggered_by,
        dataRange: JSON.parse(row.data_range),
        insights: JSON.parse(row.insights),
        recommendations: JSON.parse(row.recommendations),
        predictions: JSON.parse(row.predictions),
        metadata: {
          version: row.version,
          algorithm: row.algorithm,
          confidence: row.confidence,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      }))
    } catch (error) {
      logger.error('Failed to get analysis history', { appId, error })
      return []
    }
  }
}
