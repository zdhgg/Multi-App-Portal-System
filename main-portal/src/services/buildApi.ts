/**
 * Build Analysis API Service
 * 
 * 前端构建分析相关的API服务
 */

import { apiService } from './api'
import type { ApiResponse } from './api'

// 构建分析相关的类型定义
export interface BuildConfiguration {
  tool: string
  script: string
  outputDir: string
  configFile?: string
  hasCodeSplitting: boolean
  hasMinification: boolean
  hasSourceMap: boolean
  customConfig?: any
}

export interface BuildOptimization {
  type: string
  description: string
  config: any
  priority: 'high' | 'medium' | 'low'
}

export interface DeploymentStrategy {
  type: 'unified' | 'static' | 'spa' | 'ssr'
  description: string
  benefits: string[]
  requirements?: string[]
}

export interface BuildStatusInfo {
  hasBuilt: boolean           // 是否已有构建产物
  outputExists: boolean       // 输出目录是否存在
  outputDir: string           // 输出目录路径
  lastBuildTime?: number      // 上次构建时间
  lastBuildTimeFormatted?: string // 格式化的构建时间
  filesCount?: number         // 构建产物文件数量
  totalSize?: number          // 构建产物总大小
  totalSizeFormatted?: string // 格式化的大小
  isStale?: boolean           // 是否过时
  staleReason?: string        // 过时原因
}

export interface BuildAnalysis {
  appId: string
  buildTool: string
  buildScript: string
  outputDir: string
  optimizations: BuildOptimization[]
  deploymentStrategy: DeploymentStrategy
  confidence: number
  issues: string[]
  analysisTime: number // 分析完成时间戳
  buildStatus?: BuildStatusInfo // 已构建状态
}

export interface BuildStatus {
  appId: string
  status: 'ready' | 'building' | 'failed' | 'unknown'
  lastAnalysis: string
  buildTool: string | null
  optimizations: BuildOptimization[]
  issues: string[]
}

export interface BuildProgress {
  appId: string
  executionId: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress: number
  currentStep: string
  startTime: number
  endTime?: number
  duration?: number
  logs: Array<{
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    source: 'stdout' | 'stderr' | 'system'
  }>
  error?: string
  outputSize?: number
  artifacts?: string[]
}

export interface BuildExecutionOptions {
  buildScript?: string
  cleanBuild?: boolean
  environment?: 'development' | 'production'
  enableOptimizations?: boolean
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface SupportedToolsResponse {
  tools: string[]
  count: number
}

export interface FrontendCheckResponse {
  appId: string
  isFrontend: boolean
  supportsBuild: boolean
}

export interface BatchFrontendCheckRequest {
  appIds: string[]
}

export interface BatchFrontendCheckResponse {
  results: Array<{
    appId: string
    isFrontend: boolean
    supportsBuild: boolean
    error: string | null
  }>
  summary: {
    total: number
    frontend: number
    backend: number
  }
}

/**
 * 构建分析API服务类
 */
export class BuildApiService {
  /**
   * 分析应用构建配置
   */
  async analyzeBuild(appId: string): Promise<ApiResponse<BuildAnalysis>> {
    return apiService.post(`/build/analyze/${appId}`)
  }

  /**
   * 获取最近的构建分析结果
   */
  async getLatestBuildAnalysis(appId: string): Promise<ApiResponse<BuildAnalysis>> {
    return apiService.get(`/build/analysis/${appId}`)
  }

  /**
   * 获取构建状态
   */
  async getBuildStatus(appId: string): Promise<ApiResponse<BuildStatus>> {
    return apiService.get(`/build/status/${appId}`)
  }

  /**
   * 获取支持的构建工具列表
   */
  async getSupportedTools(): Promise<ApiResponse<SupportedToolsResponse>> {
    return apiService.get('/build/supported-tools')
  }

  /**
   * 检查应用是否为前端项目
   */
  async checkFrontendProject(appId: string): Promise<ApiResponse<FrontendCheckResponse>> {
    return apiService.get(`/build/check-frontend/${appId}`)
  }

  /**
   * 批量检查多个应用的前端项目状态
   */
  async batchCheckFrontendProjects(appIds: string[]): Promise<ApiResponse<BatchFrontendCheckResponse>> {
    return apiService.post('/build/batch-check-frontend', { appIds })
  }

  /**
   * 执行构建
   */
  async executeBuild(appId: string, options?: {
    buildScript?: string
    cleanBuild?: boolean
    environment?: 'development' | 'production'
  }): Promise<ApiResponse<{
    executionId: string
    appId: string
    buildTool: string
    buildScript: string
    status: string
  }>> {
    return apiService.post(`/build/execute/${appId}`, options || {})
  }

  /**
   * 获取构建进度
   */
  async getBuildProgress(executionId: string): Promise<ApiResponse<{
    appId: string
    executionId: string
    status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
    progress: number
    currentStep: string
    startTime: number
    endTime?: number
    duration?: number
    logs: Array<{
      timestamp: number
      level: 'info' | 'warn' | 'error' | 'debug'
      message: string
      source: 'stdout' | 'stderr' | 'system'
    }>
    error?: string
    outputSize?: number
    artifacts?: string[]
  }>> {
    return apiService.get(`/build/progress/${executionId}`)
  }

  /**
   * 取消构建
   */
  async cancelBuild(executionId: string): Promise<ApiResponse<{
    message: string
    executionId: string
  }>> {
    return apiService.post(`/build/cancel/${executionId}`)
  }

  /**
   * 统一部署（构建 + 部署到后端 + 更新PM2配置）
   */
  async unifiedDeploy(appId: string, options?: {
    staticDir?: string
    backupOld?: boolean
  }): Promise<ApiResponse<{
    deploymentId: string
    appId: string
    status: string
  }>> {
    return apiService.post(`/build/unified-deploy/${appId}`, options || {})
  }

  /**
   * 获取部署进度
   */
  async getDeployProgress(deploymentId: string): Promise<ApiResponse<{
    appId: string
    deploymentId: string
    status: 'preparing' | 'building' | 'deploying' | 'configuring' | 'restarting' | 'success' | 'failed' | 'cancelled'
    progress: number
    currentStep: string
    startTime: number
    endTime?: number
    duration?: number
    error?: string
    staticFilesCount?: number
    staticFilesSize?: number
  }>> {
    return apiService.get(`/build/deploy-progress/${deploymentId}`)
  }
}

// 创建单例实例
export const buildApiService = new BuildApiService()

// 构建分析相关的工具函数
export const buildUtils = {
  /**
   * 判断构建工具类型
   */
  getBuildToolCategory(tool: string): 'framework' | 'bundler' | 'unknown' {
    const frameworks = ['Next.js', 'Nuxt.js', 'Create React App', 'Vue CLI', 'Angular CLI']
    const bundlers = ['Vite', 'Webpack', 'Rollup', 'Parcel']
    
    if (frameworks.includes(tool)) {
      return 'framework'
    } else if (bundlers.includes(tool)) {
      return 'bundler'
    }
    
    return 'unknown'
  },

  /**
   * 获取构建工具的图标
   */
  getBuildToolIcon(tool: string): string {
    const icons: Record<string, string> = {
      'Next.js': '⚡',
      'Nuxt.js': '💚',
      'Vite': '⚡',
      'Create React App': '⚛️',
      'Vue CLI': '💚',
      'Angular CLI': '🅰️',
      'Webpack': '📦',
      'Rollup': '📦',
      'Parcel': '📦'
    }
    
    return icons[tool] || '🔧'
  },

  /**
   * 获取优化建议的优先级颜色
   */
  getOptimizationPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return 'danger'
      case 'medium':
        return 'warning'
      case 'low':
        return 'info'
      default:
        return 'info'
    }
  },

  /**
   * 获取部署策略的推荐度
   */
  getDeploymentStrategyRecommendation(strategy: DeploymentStrategy): {
    score: number
    label: string
    color: string
  } {
    switch (strategy.type) {
      case 'unified':
        return { score: 90, label: '强烈推荐', color: 'success' }
      case 'ssr':
        return { score: 85, label: '推荐', color: 'primary' }
      case 'spa':
        return { score: 75, label: '适用', color: 'info' }
      case 'static':
        return { score: 70, label: '可用', color: 'warning' }
      default:
        return { score: 50, label: '未知', color: 'info' }
    }
  },

  /**
   * 格式化构建分析置信度
   */
  formatConfidence(confidence: number): {
    percentage: string
    label: string
    color: string
  } {
    const percentage = Math.round(confidence * 100)
    
    let label: string
    let color: string
    
    if (percentage >= 90) {
      label = '非常可靠'
      color = 'success'
    } else if (percentage >= 75) {
      label = '可靠'
      color = 'primary'
    } else if (percentage >= 60) {
      label = '一般'
      color = 'warning'
    } else {
      label = '不确定'
      color = 'danger'
    }
    
    return {
      percentage: `${percentage}%`,
      label,
      color
    }
  },

  /**
   * 检查是否有高优先级优化建议
   */
  hasHighPriorityOptimizations(optimizations: BuildOptimization[]): boolean {
    return optimizations.some(opt => opt.priority === 'high')
  },

  /**
   * 获取优化建议摘要
   */
  getOptimizationSummary(optimizations: BuildOptimization[]): {
    total: number
    high: number
    medium: number
    low: number
  } {
    return {
      total: optimizations.length,
      high: optimizations.filter(opt => opt.priority === 'high').length,
      medium: optimizations.filter(opt => opt.priority === 'medium').length,
      low: optimizations.filter(opt => opt.priority === 'low').length
    }
  },

  /**
   * 生成构建分析报告摘要
   */
  generateAnalysisSummary(analysis: BuildAnalysis): string {
    const { buildTool, confidence, optimizations, issues } = analysis
    const confidenceInfo = this.formatConfidence(confidence)
    const optSummary = this.getOptimizationSummary(optimizations)

    let summary = `检测到 ${buildTool} 构建工具，分析置信度 ${confidenceInfo.percentage}`

    if (optSummary.total > 0) {
      summary += `，发现 ${optSummary.total} 项优化建议`
      if (optSummary.high > 0) {
        summary += `（${optSummary.high} 项高优先级）`
      }
    }

    if (issues.length > 0) {
      summary += `，${issues.length} 个潜在问题`
    }

    return summary
  },

  /**
   * 检查应用是否为前端项目（客户端版本）
   */
  isFrontendApp(techStack: string): boolean {
    const normalizedTechStack = techStack.toLowerCase()
    const frontendStacks = ['react', 'vue', 'angular', 'next.js', 'nuxt.js', 'vite', 'svelte', 'create react app', 'vue cli', 'angular cli']
    const fullStackKeywords = ['fullstack', 'full-stack', 'full stack', '全栈']
    return (
      frontendStacks.some(stack => normalizedTechStack.includes(stack)) ||
      fullStackKeywords.some(keyword => normalizedTechStack.includes(keyword))
    )
  },

  /**
   * 格式化相对时间
   */
  formatRelativeTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`

    return new Date(timestamp).toLocaleString('zh-CN')
  }
}

// ==================== 构建执行相关接口 ====================

export interface BuildExecutionOptions {
  environment?: 'development' | 'production'
  cleanBuild?: boolean
  enableOptimizations?: boolean
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface BuildProgress {
  appId: string
  executionId: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress: number // 0-100
  currentStep: string
  startTime: number
  endTime?: number
  duration?: number
  logs: BuildLog[]
  error?: string
  outputSize?: number
  artifacts?: string[]
}

export interface BuildLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: 'stdout' | 'stderr' | 'system'
}

export interface BuildExecutionRecord {
  id: string
  appId: string
  buildTool: string
  buildScript: string
  outputDir: string
  environment: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress: number
  currentStep?: string
  startTime: number
  endTime?: number
  duration?: number
  outputSize?: number
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

export interface BuildStatistics {
  totalBuilds: number
  successfulBuilds: number
  failedBuilds: number
  averageDuration: number
  totalOutputSize: number
  buildsByStatus: Record<string, number>
  buildsByTool: Record<string, number>
  buildTrends: Array<{
    date: string
    count: number
    successRate: number
  }>
}

export interface QueueStats {
  total: number
  queued: number
  running: number
  completed: number
  failed: number
  cancelled: number
}

export interface PM2ConfigTemplate {
  id: number
  name: string
  description: string
  templateType: 'unified' | 'spa' | 'ssr' | 'static'
  configTemplate: string
  isDefault: boolean
}

export interface DeploymentRecommendation {
  strategy: 'unified' | 'spa' | 'ssr' | 'static'
  confidence: number
  reasons: string[]
  benefits: string[]
  requirements: string[]
  config: any
}

// ==================== 构建执行API服务扩展 ====================

export class BuildExecutionApiService {
  /**
   * 执行构建任务
   */
  async executeBuild(appId: string, options: BuildExecutionOptions = {}): Promise<ApiResponse<{ buildId: string; message: string }>> {
    return apiService.post(`/build/execute/${appId}`, options)
  }

  /**
   * 获取构建进度
   */
  async getBuildProgress(executionId: string): Promise<ApiResponse<BuildProgress>> {
    return apiService.get(`/build/progress/${executionId}`)
  }

  /**
   * 取消构建任务
   */
  async cancelBuild(executionId: string): Promise<ApiResponse<{ cancelled: boolean; message: string }>> {
    return apiService.post(`/build/cancel/${executionId}`)
  }

  /**
   * 获取构建队列状态
   */
  async getQueueStatus(): Promise<ApiResponse<{ stats: QueueStats; queuedBuilds: any[]; runningBuilds: any[] }>> {
    return apiService.get('/build/queue/status')
  }

  /**
   * 获取构建历史
   */
  async getBuildHistory(appId: string, limit = 50): Promise<ApiResponse<BuildExecutionRecord[]>> {
    return apiService.get(`/build/history/${appId}?limit=${limit}`)
  }

  /**
   * 获取构建详情
   */
  async getBuildExecution(executionId: string): Promise<ApiResponse<BuildExecutionRecord & { logs: BuildLog[]; artifacts: any[] }>> {
    return apiService.get(`/build/execution/${executionId}`)
  }

  /**
   * 获取构建统计信息
   */
  async getBuildStatistics(appId?: string, days = 30): Promise<ApiResponse<BuildStatistics>> {
    const url = appId ? `/build/statistics/${appId}?days=${days}` : `/build/statistics?days=${days}`
    return apiService.get(url)
  }

  /**
   * 生成优化的PM2配置
   */
  async optimizePM2Config(appId: string, variables: any = {}, applyConfig = false): Promise<ApiResponse<DeploymentRecommendation>> {
    return apiService.post(`/build/optimize-pm2/${appId}`, { variables, applyConfig })
  }

  /**
   * 获取PM2配置模板
   */
  async getPM2Templates(): Promise<ApiResponse<PM2ConfigTemplate[]>> {
    return apiService.get('/build/pm2-templates')
  }
}

// 创建构建执行API服务实例
export const buildExecutionApiService = new BuildExecutionApiService()

// ==================== 高级构建功能API服务 ====================

export class AdvancedBuildApiService {
  /**
   * 获取构建缓存统计
   */
  async getCacheStats(): Promise<ApiResponse<any>> {
    return apiService.get('/build/cache/stats')
  }

  /**
   * 清理构建缓存
   */
  async cleanupCache(): Promise<ApiResponse<any>> {
    return apiService.post('/build/cache/cleanup')
  }

  /**
   * 获取构建模板列表
   */
  async getBuildTemplates(filters?: {
    framework?: string
    buildTool?: string
    category?: string
  }): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams()
    if (filters?.framework) params.append('framework', filters.framework)
    if (filters?.buildTool) params.append('buildTool', filters.buildTool)
    if (filters?.category) params.append('category', filters.category)

    return apiService.get(`/build/templates?${params}`)
  }

  /**
   * 应用构建模板
   */
  async applyBuildTemplate(
    templateId: string,
    appId: string,
    variables?: Record<string, string>
  ): Promise<ApiResponse<any>> {
    return apiService.post(`/build/templates/${templateId}/apply/${appId}`, { variables })
  }

  /**
   * 获取性能趋势
   */
  async getPerformanceTrend(
    appId: string,
    buildTool = '',
    days = 30
  ): Promise<ApiResponse<any>> {
    const params = new URLSearchParams()
    if (buildTool) params.append('buildTool', buildTool)
    params.append('days', days.toString())

    return apiService.get(`/build/performance/${appId}/trend?${params}`)
  }

  /**
   * 生成性能报告
   */
  async generatePerformanceReport(
    appId: string,
    type: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<ApiResponse<any>> {
    return apiService.get(`/build/performance/${appId}/report?type=${type}`)
  }

  /**
   * 创建批量构建
   */
  async createBatchBuild(batchRequest: any): Promise<ApiResponse<{ batchId: string }>> {
    return apiService.post('/build/batch', batchRequest)
  }

  /**
   * 执行批量构建
   */
  async executeBatchBuild(batchId: string): Promise<ApiResponse<{ executionId: string }>> {
    return apiService.post(`/build/batch/${batchId}/execute`)
  }

  /**
   * 获取批量构建状态
   */
  async getBatchBuildStatus(executionId: string): Promise<ApiResponse<any>> {
    return apiService.get(`/build/batch/execution/${executionId}`)
  }
}

// 创建高级构建API服务实例
export const advancedBuildApiService = new AdvancedBuildApiService()

export default buildApiService
