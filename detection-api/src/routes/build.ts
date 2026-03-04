/**
 * Build Analysis API Routes
 * 
 * 智能化前端构建分析相关的API路由
 */

import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger'
import { IntelligentBuildService } from '../services/intelligentBuildService'
import { ApplicationService } from '../core/ApplicationService'
import { BuildAnalysisError, BuildAnalysisErrorType } from '../services/buildErrors'

const router = Router()

// 全局变量存储服务实例，在服务器启动时初始化
let applicationService: ApplicationService | null = null

/**
 * 初始化构建服务所需的依赖
 */
export function initBuildService(appService: ApplicationService): void {
  applicationService = appService
}

/**
 * 分析应用构建配置
 * POST /api/build/analyze/:appId
 */
router.post('/analyze/:appId', async (req: Request, res: Response) => {
  const { appId } = req.params
  
  try {
    logger.info('开始分析应用构建配置', { appId })

    // 检查应用服务是否已初始化
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    // 创建构建服务实例
    const buildService = new IntelligentBuildService(applicationService)
    
    // 检查是否为前端项目
    const isFrontend = await buildService.isFrontendProject(appId)
    if (!isFrontend) {
      return res.status(400).json({
        success: false,
        error: '该应用不是前端项目，无法进行构建分析'
      })
    }

    // 执行构建分析
    const analysis = await buildService.analyzeFrontendBuild(appId)
    
    logger.info('构建配置分析完成', { 
      appId, 
      buildTool: analysis.buildTool,
      confidence: analysis.confidence 
    })

    res.json({
      success: true,
      data: analysis,
      message: '构建分析完成'
    })

  } catch (error) {
    // 处理 BuildAnalysisError
    if (error instanceof BuildAnalysisError) {
      logger.error('构建配置分析失败', { 
        appId, 
        errorType: error.type,
        userMessage: error.userMessage,
        technicalDetails: error.technicalDetails
      })

      // 根据错误类型返回不同的HTTP状态码
      let statusCode = 500
      if (error.type === BuildAnalysisErrorType.NOT_FRONTEND || 
          error.type === BuildAnalysisErrorType.NO_BUILD_TOOL) {
        statusCode = 400 // 业务逻辑错误
      } else if (error.type === BuildAnalysisErrorType.APP_NOT_FOUND) {
        statusCode = 404 // 资源不存在
      }

      return res.status(statusCode).json({
        success: false,
        error: error.userMessage,
        errorType: error.type,
        suggestion: error.technicalDetails?.suggestion,
        details: error.technicalDetails
      })
    }

    // 处理未知错误
    logger.error('构建配置分析失败（未知错误）', { appId, error })
    res.status(500).json({
      success: false,
      error: '构建分析失败，请查看日志获取详情'
    })
  }
})

/**
 * 获取最近的构建分析结果
 * GET /api/build/analysis/:appId
 */
router.get('/analysis/:appId', async (req: Request, res: Response) => {
  const { appId } = req.params

  try {
    logger.info('获取最近的构建分析结果', { appId })

    // 检查应用服务是否已初始化
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    // 创建构建服务实例
    const buildService = new IntelligentBuildService(applicationService)

    // 获取最近的分析结果
    const analysis = await buildService.getLatestBuildAnalysis(appId)

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: '未找到构建分析结果，请先进行构建分析'
      })
    }

    logger.info('成功获取构建分析结果', {
      appId,
      buildTool: analysis.buildTool,
      analysisTime: analysis.analysisTime
    })

    res.json({
      success: true,
      data: analysis,
      message: '获取构建分析结果成功'
    })

  } catch (error) {
    logger.error('获取构建分析结果失败', { appId, error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取构建分析结果失败'
    })
  }
})

/**
 * 获取构建状态
 * GET /api/build/status/:appId
 */
router.get('/status/:appId', async (req: Request, res: Response) => {
  const { appId } = req.params
  
  try {
    logger.info('获取构建状态', { appId })

    // 这里可以从数据库或缓存中获取构建状态
    // 目前返回模拟数据，后续可以扩展
    const status = {
      appId,
      status: 'ready', // ready, building, failed, unknown
      lastAnalysis: new Date().toISOString(),
      buildTool: null,
      optimizations: [],
      issues: []
    }

    res.json({
      success: true,
      data: status,
      message: '构建状态获取成功'
    })

  } catch (error) {
    logger.error('获取构建状态失败', { appId, error: error.message })
    
    res.status(500).json({
      success: false,
      error: error.message || '获取构建状态失败'
    })
  }
})

/**
 * 获取支持的构建工具列表
 * GET /api/build/supported-tools
 */
router.get('/supported-tools', async (req: Request, res: Response) => {
  try {
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    const buildService = new IntelligentBuildService(applicationService)
    const supportedTools = buildService.getSupportedBuildTools()

    res.json({
      success: true,
      data: {
        tools: supportedTools,
        count: supportedTools.length
      },
      message: '支持的构建工具列表获取成功'
    })

  } catch (error) {
    logger.error('获取支持的构建工具列表失败', { error: error.message })

    res.status(500).json({
      success: false,
      error: error.message || '获取支持的构建工具列表失败'
    })
  }
})

/**
 * 检查应用是否为前端项目
 * GET /api/build/check-frontend/:appId
 */
router.get('/check-frontend/:appId', async (req: Request, res: Response) => {
  const { appId } = req.params
  
  try {
    logger.info('检查应用是否为前端项目', { appId })

    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    const buildService = new IntelligentBuildService(applicationService)
    const isFrontend = await buildService.isFrontendProject(appId)
    
    res.json({
      success: true,
      data: {
        appId,
        isFrontend,
        supportsBuild: isFrontend
      },
      message: isFrontend ? '该应用是前端项目' : '该应用不是前端项目'
    })

  } catch (error) {
    logger.error('检查前端项目失败', { appId, error: error.message })
    
    res.status(500).json({
      success: false,
      error: error.message || '检查前端项目失败'
    })
  }
})

/**
 * 批量检查多个应用的前端项目状态
 * POST /api/build/batch-check-frontend
 */
router.post('/batch-check-frontend', async (req: Request, res: Response) => {
  const { appIds } = req.body
  
  if (!Array.isArray(appIds) || appIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: '请提供有效的应用ID列表'
    })
  }

  try {
    logger.info('批量检查前端项目', { appIds })

    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    const buildService = new IntelligentBuildService(applicationService)
    const results = []

    for (const appId of appIds) {
      try {
        const isFrontend = await buildService.isFrontendProject(appId)
        results.push({
          appId,
          isFrontend,
          supportsBuild: isFrontend,
          error: null
        })
      } catch (error) {
        results.push({
          appId,
          isFrontend: false,
          supportsBuild: false,
          error: error.message
        })
      }
    }

    const frontendCount = results.filter(r => r.isFrontend).length
    
    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: appIds.length,
          frontend: frontendCount,
          backend: appIds.length - frontendCount
        }
      },
      message: `批量检查完成，发现 ${frontendCount} 个前端项目`
    })

  } catch (error) {
    logger.error('批量检查前端项目失败', { appIds, error: error.message })
    
    res.status(500).json({
      success: false,
      error: error.message || '批量检查前端项目失败'
    })
  }
})

// ==================== 构建执行相关路由 ====================

/**
 * 执行构建任务
 * POST /api/build/execute/:appId
 */
router.post('/execute/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const {
      environment = 'production',
      cleanBuild = false,
      enableOptimizations = true,
      priority = 'normal'
    } = req.body

    // 检查应用服务是否已初始化
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    // 获取构建分析结果
    const buildService = new IntelligentBuildService(applicationService)
    const analysis = await buildService.analyzeFrontendBuild(appId)

    if (!analysis.buildTool) {
      return res.status(400).json({
        success: false,
        message: '未检测到有效的构建工具'
      })
    }

    // 准备构建选项
    const buildOptions = {
      appId,
      buildTool: analysis.buildTool,
      buildScript: analysis.buildScript,
      outputDir: analysis.outputDir,
      workingDirectory: analysis.workingDirectory,
      environment,
      cleanBuild,
      enableOptimizations
    }

    // 添加到构建队列
    const buildQueueManager = req.app.locals.buildQueueManager
    const buildId = await buildQueueManager.addBuild(buildOptions, priority)

    res.json({
      success: true,
      data: {
        buildId,
        message: '构建任务已加入队列'
      }
    })
  } catch (error) {
    logger.error('执行构建失败', { appId: req.params.appId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '执行构建失败'
    })
  }
})

/**
 * 获取构建进度
 * GET /api/build/progress/:buildId
 */
router.get('/progress/:buildId', async (req: Request, res: Response) => {
  try {
    const { buildId } = req.params
    const buildExecutionService = req.app.locals.buildExecutionService
    const buildQueueManager = req.app.locals.buildQueueManager

    let executionId = buildId

    // 如果是 queue_ 开头的 ID，需要通过映射获取真实的 executionId
    if (buildId.startsWith('queue_')) {
      const mappedExecutionId = buildQueueManager?.getExecutionId(buildId)
      if (mappedExecutionId) {
        executionId = mappedExecutionId
      } else {
        return res.status(404).json({
          success: false,
          message: '构建任务不存在或尚未开始执行'
        })
      }
    }

    const progress = buildExecutionService.getBuildProgress(executionId)
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: '构建任务不存在'
      })
    }

    res.json({
      success: true,
      data: progress
    })
  } catch (error) {
    logger.error('获取构建进度失败', { buildId: req.params.buildId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取构建进度失败'
    })
  }
})

/**
 * 取消构建任务
 * POST /api/build/cancel/:buildId
 */
router.post('/cancel/:buildId', async (req: Request, res: Response) => {
  try {
    const { buildId } = req.params
    const buildExecutionService = req.app.locals.buildExecutionService
    const buildQueueManager = req.app.locals.buildQueueManager

    let executionId = buildId

    // 如果是 queue_ 开头的 ID，需要通过映射获取真实的 executionId
    if (buildId.startsWith('queue_')) {
      const mappedExecutionId = buildQueueManager?.getExecutionId(buildId)
      if (mappedExecutionId) {
        executionId = mappedExecutionId
      } else {
        return res.status(404).json({
          success: false,
          message: '构建任务不存在或尚未开始执行'
        })
      }
    }

    const cancelled = await buildExecutionService.cancelBuild(executionId)

    res.json({
      success: true,
      data: {
        cancelled,
        message: cancelled ? '构建任务已取消' : '构建任务无法取消'
      }
    })
  } catch (error) {
    logger.error('取消构建失败', { buildId: req.params.buildId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '取消构建失败'
    })
  }
})

/**
 * 获取构建队列状态
 * GET /api/build/queue/status
 */
router.get('/queue/status', async (req: Request, res: Response) => {
  try {
    const buildQueueManager = req.app.locals.buildQueueManager
    const stats = buildQueueManager.getQueueStats()
    const queuedBuilds = buildQueueManager.getQueuedBuilds()
    const runningBuilds = buildQueueManager.getRunningBuilds()

    res.json({
      success: true,
      data: {
        stats,
        queuedBuilds,
        runningBuilds
      }
    })
  } catch (error) {
    logger.error('获取队列状态失败', { error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取队列状态失败'
    })
  }
})

/**
 * 获取构建历史
 * GET /api/build/history/:appId
 */
router.get('/history/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { limit = 50, offset = 0 } = req.query

    const buildHistoryService = req.app.locals.buildHistoryService
    const history = await buildHistoryService.getAppBuildHistory(
      appId,
      parseInt(limit as string)
    )

    res.json({
      success: true,
      data: history
    })
  } catch (error) {
    logger.error('获取构建历史失败', { appId: req.params.appId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取构建历史失败'
    })
  }
})

/**
 * 获取构建详情
 * GET /api/build/execution/:executionId
 */
router.get('/execution/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params
    const buildHistoryService = req.app.locals.buildHistoryService

    const execution = await buildHistoryService.getBuildExecutionWithDetails(executionId)
    if (!execution) {
      return res.status(404).json({
        success: false,
        message: '构建执行记录不存在'
      })
    }

    res.json({
      success: true,
      data: execution
    })
  } catch (error) {
    logger.error('获取构建详情失败', { executionId: req.params.executionId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取构建详情失败'
    })
  }
})

/**
 * 获取构建统计信息
 * GET /api/build/statistics/:appId?
 */
router.get('/statistics/:appId?', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { days = 30 } = req.query

    const buildHistoryService = req.app.locals.buildHistoryService
    const statistics = await buildHistoryService.getBuildStatistics(
      appId,
      parseInt(days as string)
    )

    res.json({
      success: true,
      data: statistics
    })
  } catch (error) {
    logger.error('获取构建统计失败', { appId: req.params.appId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取构建统计失败'
    })
  }
})

/**
 * 生成优化的PM2配置
 * POST /api/build/optimize-pm2/:appId
 */
router.post('/optimize-pm2/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { variables = {}, applyConfig = false } = req.body

    // 检查应用服务是否已初始化
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: 'ApplicationService 未初始化'
      })
    }

    // 获取构建分析结果
    const buildService = new IntelligentBuildService(applicationService)
    const analysis = await buildService.analyzeFrontendBuild(appId)

    // 生成优化配置
    const pm2ConfigOptimizer = req.app.locals.pm2ConfigOptimizer
    const recommendation = await pm2ConfigOptimizer.generateOptimizedConfig(
      appId,
      analysis,
      variables
    )

    // 如果需要应用配置
    if (applyConfig) {
      const configPath = await pm2ConfigOptimizer.applyOptimizedConfig(
        appId,
        recommendation.config
      )
      recommendation.config.configPath = configPath
    }

    res.json({
      success: true,
      data: recommendation
    })
  } catch (error) {
    logger.error('生成PM2配置失败', { appId: req.params.appId, error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '生成PM2配置失败'
    })
  }
})

/**
 * 获取PM2配置模板
 * GET /api/build/pm2-templates
 */
router.get('/pm2-templates', async (req: Request, res: Response) => {
  try {
    const pm2ConfigOptimizer = req.app.locals.pm2ConfigOptimizer
    const templates = await pm2ConfigOptimizer.getConfigTemplates()

    res.json({
      success: true,
      data: templates
    })
  } catch (error) {
    logger.error('获取PM2模板失败', { error: error.message })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取PM2模板失败'
    })
  }
})

// ==================== 高级构建功能路由 ====================

/**
 * 获取构建缓存统计
 * GET /api/build/cache/stats
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const buildCacheService = req.app.locals.buildCacheService
    if (!buildCacheService) {
      return res.status(500).json({
        success: false,
        error: 'Build cache service not available'
      })
    }

    const stats = await buildCacheService.getCacheStats()
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('Get cache stats failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get cache stats failed'
    })
  }
})

/**
 * 清理构建缓存
 * POST /api/build/cache/cleanup
 */
router.post('/cache/cleanup', async (req: Request, res: Response) => {
  try {
    const buildCacheService = req.app.locals.buildCacheService
    if (!buildCacheService) {
      return res.status(500).json({
        success: false,
        error: 'Build cache service not available'
      })
    }

    const result = await buildCacheService.cleanupExpiredCache()
    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.deletedEntries} cache entries, freed ${(result.freedSpace / 1024 / 1024).toFixed(2)}MB`
    })
  } catch (error) {
    logger.error('Cache cleanup failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Cache cleanup failed'
    })
  }
})

/**
 * 获取构建模板列表
 * GET /api/build/templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { framework, buildTool, category } = req.query
    const buildTemplateService = req.app.locals.buildTemplateService

    if (!buildTemplateService) {
      return res.status(500).json({
        success: false,
        error: 'Build template service not available'
      })
    }

    const filters: any = {}
    if (framework) filters.framework = framework as string
    if (buildTool) filters.buildTool = buildTool as string
    if (category) filters.category = category as string

    const templates = await buildTemplateService.getTemplates(filters)
    res.json({
      success: true,
      data: templates
    })
  } catch (error) {
    logger.error('Get templates failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get templates failed'
    })
  }
})

/**
 * 应用构建模板
 * POST /api/build/templates/:templateId/apply/:appId
 */
router.post('/templates/:templateId/apply/:appId', async (req: Request, res: Response) => {
  try {
    const { templateId, appId } = req.params
    const { variables } = req.body

    const buildTemplateService = req.app.locals.buildTemplateService
    if (!buildTemplateService) {
      return res.status(500).json({
        success: false,
        error: 'Build template service not available'
      })
    }

    // 获取应用路径（简化实现）
    const projectPath = `/path/to/app/${appId}` // 需要从applicationService获取实际路径

    await buildTemplateService.applyTemplate(templateId, projectPath, variables)
    res.json({
      success: true,
      message: 'Template applied successfully'
    })
  } catch (error) {
    logger.error('Apply template failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Apply template failed'
    })
  }
})

/**
 * 获取性能趋势
 * GET /api/build/performance/:appId/trend
 */
router.get('/performance/:appId/trend', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { buildTool = '', days = 30 } = req.query

    const buildPerformanceService = req.app.locals.buildPerformanceService
    if (!buildPerformanceService) {
      return res.status(500).json({
        success: false,
        error: 'Build performance service not available'
      })
    }

    const trend = await buildPerformanceService.getPerformanceTrend(
      appId,
      buildTool as string,
      parseInt(days as string)
    )

    res.json({
      success: true,
      data: trend
    })
  } catch (error) {
    logger.error('Get performance trend failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get performance trend failed'
    })
  }
})

/**
 * 生成性能报告
 * GET /api/build/performance/:appId/report
 */
router.get('/performance/:appId/report', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { type = 'weekly' } = req.query

    const buildPerformanceService = req.app.locals.buildPerformanceService
    if (!buildPerformanceService) {
      return res.status(500).json({
        success: false,
        error: 'Build performance service not available'
      })
    }

    const report = await buildPerformanceService.generatePerformanceReport(
      appId,
      type as 'daily' | 'weekly' | 'monthly'
    )

    res.json({
      success: true,
      data: report
    })
  } catch (error) {
    logger.error('Generate performance report failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Generate performance report failed'
    })
  }
})

/**
 * 创建批量构建
 * POST /api/build/batch
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const buildBatchService = req.app.locals.buildBatchService
    if (!buildBatchService) {
      return res.status(500).json({
        success: false,
        error: 'Build batch service not available'
      })
    }

    const batchId = await buildBatchService.createBatchBuildRequest(req.body)
    res.json({
      success: true,
      data: { batchId },
      message: 'Batch build request created successfully'
    })
  } catch (error) {
    logger.error('Create batch build failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create batch build failed'
    })
  }
})

/**
 * 执行批量构建
 * POST /api/build/batch/:batchId/execute
 */
router.post('/batch/:batchId/execute', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params
    const buildBatchService = req.app.locals.buildBatchService

    if (!buildBatchService) {
      return res.status(500).json({
        success: false,
        error: 'Build batch service not available'
      })
    }

    const executionId = await buildBatchService.executeBatchBuild(batchId)
    res.json({
      success: true,
      data: { executionId },
      message: 'Batch build execution started'
    })
  } catch (error) {
    logger.error('Execute batch build failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Execute batch build failed'
    })
  }
})

/**
 * 获取批量构建状态
 * GET /api/build/batch/execution/:executionId
 */
router.get('/batch/execution/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params
    const buildBatchService = req.app.locals.buildBatchService

    if (!buildBatchService) {
      return res.status(500).json({
        success: false,
        error: 'Build batch service not available'
      })
    }

    const status = await buildBatchService.getBatchBuildStatus(executionId)
    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    logger.error('Get batch build status failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get batch build status failed'
    })
  }
})

// ==================== Week 5: Advanced Features ====================

/**
 * 构建流水线管理
 */
router.get('/pipelines', async (req: Request, res: Response) => {
  try {
    const { category, createdBy, isActive } = req.query
    const pipelineService = req.app.locals.buildPipelineService

    if (!pipelineService) {
      return res.status(500).json({
        success: false,
        error: 'Pipeline service not available'
      })
    }

    const filters: any = {}
    if (category) filters.category = category as string
    if (createdBy) filters.createdBy = createdBy as string
    if (isActive !== undefined) filters.isActive = isActive === 'true'

    const pipelines = await pipelineService.getPipelines(filters)
    res.json({
      success: true,
      data: pipelines
    })
  } catch (error) {
    logger.error('Get pipelines failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get pipelines failed'
    })
  }
})

router.post('/pipelines', async (req: Request, res: Response) => {
  try {
    const pipelineService = req.app.locals.buildPipelineService

    if (!pipelineService) {
      return res.status(500).json({
        success: false,
        error: 'Pipeline service not available'
      })
    }

    const pipelineId = await pipelineService.createPipeline(req.body)
    res.json({
      success: true,
      data: { id: pipelineId },
      message: 'Pipeline created successfully'
    })
  } catch (error) {
    logger.error('Create pipeline failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create pipeline failed'
    })
  }
})

router.post('/pipelines/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { triggeredBy = 'manual', variables } = req.body
    const pipelineService = req.app.locals.buildPipelineService

    if (!pipelineService) {
      return res.status(500).json({
        success: false,
        error: 'Pipeline service not available'
      })
    }

    const executionId = await pipelineService.executePipeline(id, triggeredBy, 'manual', variables)
    res.json({
      success: true,
      data: { executionId },
      message: 'Pipeline execution started'
    })
  } catch (error) {
    logger.error('Execute pipeline failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Execute pipeline failed'
    })
  }
})

/**
 * 多环境部署管理
 */
router.get('/environments', async (req: Request, res: Response) => {
  try {
    const { type, status, tags } = req.query
    const environmentService = req.app.locals.environmentService

    if (!environmentService) {
      return res.status(500).json({
        success: false,
        error: 'Environment service not available'
      })
    }

    const filters: any = {}
    if (type) filters.type = type as string
    if (status) filters.status = status as string
    if (tags) filters.tags = (tags as string).split(',')

    const environments = await environmentService.getEnvironments(filters)
    res.json({
      success: true,
      data: environments
    })
  } catch (error) {
    logger.error('Get environments failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get environments failed'
    })
  }
})

router.post('/environments/:envId/deploy/:appId', async (req: Request, res: Response) => {
  try {
    const { envId, appId } = req.params
    const { version, deployedBy = 'system', buildId } = req.body
    const environmentService = req.app.locals.environmentService

    if (!environmentService) {
      return res.status(500).json({
        success: false,
        error: 'Environment service not available'
      })
    }

    const deploymentId = await environmentService.deployToEnvironment(envId, appId, version, deployedBy, buildId)
    res.json({
      success: true,
      data: { deploymentId },
      message: 'Deployment started successfully'
    })
  } catch (error) {
    logger.error('Deploy to environment failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deploy to environment failed'
    })
  }
})

router.get('/environments/:id/health', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const environmentService = req.app.locals.environmentService

    if (!environmentService) {
      return res.status(500).json({
        success: false,
        error: 'Environment service not available'
      })
    }

    const health = await environmentService.getEnvironmentHealth(id)
    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Environment health not found'
      })
    }

    res.json({
      success: true,
      data: health
    })
  } catch (error) {
    logger.error('Get environment health failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get environment health failed'
    })
  }
})

/**
 * 安全扫描管理
 */
router.post('/security/scan/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { type = 'full', triggeredBy = 'manual', config, buildId } = req.body
    const securityScanService = req.app.locals.securityScanService

    if (!securityScanService) {
      return res.status(500).json({
        success: false,
        error: 'Security scan service not available'
      })
    }

    const scanId = await securityScanService.startScan(appId, type, triggeredBy, config, buildId)
    res.json({
      success: true,
      data: { scanId },
      message: 'Security scan started successfully'
    })
  } catch (error) {
    logger.error('Start security scan failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Start security scan failed'
    })
  }
})

/**
 * AI优化分析
 */
router.post('/ai/analyze/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params
    const { type = 'comprehensive', triggeredBy = 'manual', dataRange } = req.body
    const aiOptimizationService = req.app.locals.aiOptimizationService

    if (!aiOptimizationService) {
      return res.status(500).json({
        success: false,
        error: 'AI optimization service not available'
      })
    }

    const analysisId = await aiOptimizationService.startAnalysis(appId, type, triggeredBy, dataRange)
    res.json({
      success: true,
      data: { analysisId },
      message: 'AI optimization analysis started successfully'
    })
  } catch (error) {
    logger.error('Start AI analysis failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Start AI analysis failed'
    })
  }
})

router.get('/ai/analysis/:analysisId', async (req: Request, res: Response) => {
  try {
    const { analysisId } = req.params
    const aiOptimizationService = req.app.locals.aiOptimizationService

    if (!aiOptimizationService) {
      return res.status(500).json({
        success: false,
        error: 'AI optimization service not available'
      })
    }

    const analysis = await aiOptimizationService.getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found'
      })
    }

    res.json({
      success: true,
      data: analysis
    })
  } catch (error) {
    logger.error('Get AI analysis failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get AI analysis failed'
    })
  }
})

/**
 * 性能基准测试
 */
router.get('/benchmarks', async (req: Request, res: Response) => {
  try {
    const { appId, status } = req.query
    const benchmarkService = req.app.locals.benchmarkService

    if (!benchmarkService) {
      return res.status(500).json({
        success: false,
        error: 'Benchmark service not available'
      })
    }

    const benchmarks = await benchmarkService.getBenchmarks(appId as string, status as string)
    res.json({
      success: true,
      data: benchmarks
    })
  } catch (error) {
    logger.error('Get benchmarks failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get benchmarks failed'
    })
  }
})

router.post('/benchmarks', async (req: Request, res: Response) => {
  try {
    const benchmarkService = req.app.locals.benchmarkService

    if (!benchmarkService) {
      return res.status(500).json({
        success: false,
        error: 'Benchmark service not available'
      })
    }

    const benchmarkId = await benchmarkService.createBenchmark(req.body)
    res.json({
      success: true,
      data: { id: benchmarkId },
      message: 'Benchmark created successfully'
    })
  } catch (error) {
    logger.error('Create benchmark failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create benchmark failed'
    })
  }
})

router.post('/benchmarks/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { triggeredBy = 'manual', options } = req.body
    const benchmarkService = req.app.locals.benchmarkService

    if (!benchmarkService) {
      return res.status(500).json({
        success: false,
        error: 'Benchmark service not available'
      })
    }

    const executionId = await benchmarkService.executeBenchmark(id, triggeredBy, 'manual', options)
    res.json({
      success: true,
      data: { executionId },
      message: 'Benchmark execution started successfully'
    })
  } catch (error) {
    logger.error('Execute benchmark failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Execute benchmark failed'
    })
  }
})

router.get('/benchmarks/executions', async (req: Request, res: Response) => {
  try {
    const { benchmarkId, appId, limit = 20 } = req.query
    const benchmarkService = req.app.locals.benchmarkService

    if (!benchmarkService) {
      return res.status(500).json({
        success: false,
        error: 'Benchmark service not available'
      })
    }

    const executions = await benchmarkService.getExecutionHistory(
      benchmarkId as string,
      appId as string,
      parseInt(limit as string)
    )
    res.json({
      success: true,
      data: executions
    })
  } catch (error) {
    logger.error('Get benchmark executions failed', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get benchmark executions failed'
    })
  }
})

export default router
