/**
 * API v2 Detection Controller - Clean Implementation
 * 
 * This replaces the complex detection.ts from v1.
 * Simple, focused endpoints with proper error handling.
 */

import { Router, Request, Response } from 'express'
import Joi from 'joi'
import { DetectionService } from '../../core/DetectionService'
import { ApplicationError } from '../../core/types'
import { logger } from '../../utils/logger'
import { ConfigManager } from '../../services/configManager'

export class DetectionController {
  private router = Router()

  constructor(private detectionService: DetectionService, private configManager?: ConfigManager) {
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // GET /api/v2/detection/sessions - Get all active sessions
    this.router.get('/sessions', this.handleGetActiveSessions.bind(this))
    
    // POST /api/v2/detection/sessions - Start new scan session
    this.router.post('/sessions', this.handleStartScan.bind(this))
    
    // GET /api/v2/detection/sessions/:id - Get session info
    this.router.get('/sessions/:id', this.handleGetSession.bind(this))
    
    // GET /api/v2/detection/sessions/:id/results - Get session results
    this.router.get('/sessions/:id/results', this.handleGetResults.bind(this))
    
    // GET /api/v2/detection/sessions/:id/projects - Get aggregated projects
    this.router.get('/sessions/:id/projects', this.handleGetAggregatedProjects.bind(this))
    
    // GET /api/v2/detection/sessions/:id/enhanced-projects - Get enhanced aggregated projects
    this.router.get('/sessions/:id/enhanced-projects', this.handleGetEnhancedAggregatedProjects.bind(this))
    
    // GET /api/v2/detection/sessions/:id/port-allocation - Get port allocation summary
    this.router.get('/sessions/:id/port-allocation', this.handleGetPortAllocation.bind(this))
    
    // POST /api/v2/detection/sessions/:id/reprocess - Reprocess with enhancement
    this.router.post('/sessions/:id/reprocess', this.handleReprocessWithEnhancement.bind(this))
    
    // DELETE /api/v2/detection/sessions/:id - Cancel session
    this.router.delete('/sessions/:id', this.handleCancelSession.bind(this))
    
    // POST /api/v2/detection/single-directory - Enhanced single directory detection
    this.router.post('/single-directory', this.handleEnhancedSingleDirectoryDetection.bind(this))
    
    // POST /api/v2/detection/batch-scan - Start batch scan
    this.router.post('/batch-scan', this.handleStartBatchScan.bind(this))
    
    // GET /api/v2/detection/batch/:id - Get batch status
    this.router.get('/batch/:id', this.handleGetBatchStatus.bind(this))
    
    // Legacy V1 compatibility endpoint
    this.router.post('/scan', this.handleStartScan.bind(this))
  }

  async handleStartScan(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Received scan request', { body: req.body })
      
      const { workspacePath, config } = this.validateScanInput(req.body)
      
      logger.info('Validated workspace path', { workspacePath, config })
      
      // 传递config给DetectionService，包含maxDepth等配置
      const sessionId = await this.detectionService.startWorkspaceScan(workspacePath, config)
      
      res.status(202).json({ 
        sessionId,
        message: 'Scan started' 
      })
      
      logger.info('Workspace scan started via API v2', { sessionId, workspacePath })
      
    } catch (error) {
      this.handleError(res, error, 'Failed to start scan')
    }
  }

  async handleGetActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await this.detectionService.getActiveSessions()
      
      res.json({
        success: true,
        data: sessions,
        message: 'Active sessions retrieved successfully'
      })
      
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch active sessions')
    }
  }

  async handleGetSession(req: Request, res: Response): Promise<void> {
    try {
      const session = await this.detectionService.getSession(req.params.id)
      
      res.json({ session })
      
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch session')
    }
  }

  async handleGetResults(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.id
      logger.info('Received request for detection results', { sessionId })

      const rawResults = await this.detectionService.getResults(sessionId)

      // 增强检测结果，为全栈项目添加端口信息
      const enhancedResults = await this.enhanceResultsWithPortInfo(rawResults)

      logger.info('Results retrieved and enhanced', {
        sessionId,
        resultCount: enhancedResults.length,
        fullStackCount: enhancedResults.filter(r => r.ports && r.ports.length > 1).length
      })

      res.json({
        results: enhancedResults,
        count: enhancedResults.length
      })

    } catch (error) {
      logger.error('Failed to get results in controller', { sessionId: req.params.id, error })
      this.handleError(res, error, 'Failed to fetch results')
    }
  }

  async handleGetAggregatedProjects(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.id
      logger.info('Received request for aggregated projects', { sessionId })
      
      const projects = await this.detectionService.getAggregatedProjects(sessionId)
      
      logger.info('Aggregated projects retrieved from service', { 
        sessionId, 
        projectCount: projects.length 
      })
      
      res.json({ 
        projects,
        count: projects.length,
        message: 'Aggregated projects retrieved successfully'
      })
      
    } catch (error) {
      logger.error('Failed to get aggregated projects in controller', { 
        sessionId: req.params.id, 
        error 
      })
      this.handleError(res, error, 'Failed to fetch aggregated projects')
    }
  }

  async handleCancelSession(req: Request, res: Response): Promise<void> {
    try {
      await this.detectionService.cancelSession(req.params.id)
      
      res.status(204).send()
      logger.info('Detection session cancelled via API v2', { sessionId: req.params.id })
      
    } catch (error) {
      this.handleError(res, error, 'Failed to cancel session')
    }
  }

  async handleGetEnhancedAggregatedProjects(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.id
      logger.info('Received request for enhanced aggregated projects', { sessionId })
      
      const projects = await this.detectionService.getEnhancedAggregatedProjects(sessionId)
      
      logger.info('Enhanced aggregated projects retrieved from service', { 
        sessionId, 
        projectCount: projects.length,
        fullStackCount: projects.filter(p => p.type === 'fullstack').length
      })
      
      res.json({ 
        projects,
        count: projects.length,
        fullStackCount: projects.filter(p => p.type === 'fullstack').length,
        message: 'Enhanced aggregated projects retrieved successfully'
      })
      
    } catch (error) {
      logger.error('Failed to get enhanced aggregated projects in controller', { 
        sessionId: req.params.id, 
        error 
      })
      this.handleError(res, error, 'Failed to fetch enhanced aggregated projects')
    }
  }

  async handleGetPortAllocation(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.id
      logger.info('Received request for port allocation summary', { sessionId })
      
      const portAllocation = await this.detectionService.getPortAllocationSummary(sessionId)
      
      logger.info('Port allocation summary retrieved from service', { 
        sessionId, 
        totalAllocated: portAllocation.totalAllocated,
        projectCount: portAllocation.projectCount
      })
      
      res.json({ 
        portAllocation,
        message: 'Port allocation summary retrieved successfully'
      })
      
    } catch (error) {
      logger.error('Failed to get port allocation summary in controller', { 
        sessionId: req.params.id, 
        error 
      })
      this.handleError(res, error, 'Failed to fetch port allocation summary')
    }
  }

  async handleReprocessWithEnhancement(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.id
      logger.info('Received request to reprocess session with enhancement', { sessionId })
      
      const result = await this.detectionService.reprocessSessionWithEnhancement(sessionId)
      
      logger.info('Session reprocessed with enhancement', { 
        sessionId,
        traditionalCount: result.traditional.length,
        enhancedCount: result.enhanced.length
      })
      
      res.json({ 
        ...result,
        message: 'Session reprocessed with enhancement successfully'
      })
      
    } catch (error) {
      logger.error('Failed to reprocess session with enhancement', { 
        sessionId: req.params.id, 
        error 
      })
      this.handleError(res, error, 'Failed to reprocess session')
    }
  }

  async handleEnhancedSingleDirectoryDetection(req: Request, res: Response): Promise<void> {
    try {
      const { directory } = this.validateSingleDirectoryInput(req.body)
      logger.info('Received enhanced single directory detection request', { directory })
      
      const result = await this.detectionService.detectSingleDirectoryEnhanced(directory)
      
      logger.info('Enhanced single directory detection completed', { 
        directory,
        hasEnhanced: !!result.enhanced,
        isFullStack: result.enhanced?.type === 'fullstack'
      })
      
      // 统一返回 success/data 格式，并保留旧字段兼容历史调用方
      const payload = {
        traditional: result.traditional,
        enhanced: result.enhanced
      }

      res.json({
        success: true,
        data: payload,
        ...payload,
        message: 'Enhanced single directory detection completed'
      })
      
    } catch (error) {
      logger.error('Enhanced single directory detection failed', { 
        directory: req.body?.directory, 
        error 
      })
      this.handleError(res, error, 'Enhanced single directory detection failed')
    }
  }

  private validateSingleDirectoryInput(body: any) {
    const schema = Joi.object({
      directory: Joi.string().required().min(1),
      options: Joi.object().optional()
    })

    const { error, value } = schema.validate(body)
    if (error) {
      throw new ApplicationError('Invalid input', 'VALIDATION_ERROR', { 
        details: error.details 
      })
    }

    return value
  }

  private validateScanInput(body: any) {
    const schema = Joi.object({
      workspacePath: Joi.string().required().min(1),
      config: Joi.object({
        maxDepth: Joi.number().min(1).max(10).optional()  // 扫描深度，1-10层
      }).optional()
    })

    const { error, value } = schema.validate(body)
    if (error) {
      throw new ApplicationError('Invalid input', 'VALIDATION_ERROR', { 
        details: error.details 
      })
    }

    return value
  }

  /**
   * 为检测结果添加端口信息，特别是全栈项目
   */
  private async enhanceResultsWithPortInfo(results: readonly any[]): Promise<any[]> {
    return results.map(result => {
      // 检查是否是全栈项目
      const isFullStack = this.isFullStackProject(result)

      if (isFullStack) {
        // 为全栈项目添加端口信息
        const ports = this.generateFullStackPorts(result)
        return {
          ...result,
          ports,
          isFullStack: true
        }
      } else {
        // 为单一技术栈项目添加端口信息
        const ports = this.generateSingleStackPorts(result)
        return {
          ...result,
          ports,
          isFullStack: false
        }
      }
    })
  }

  /**
   * 判断是否是全栈项目
   */
  private isFullStackProject(result: any): boolean {
    // 检查技术栈是否包含前端和后端技术
    const techStack = result.techStack?.toLowerCase() || ''
    const hasVue = techStack.includes('vue')
    const hasReact = techStack.includes('react')
    const hasAngular = techStack.includes('angular')
    const hasNode = techStack.includes('node') || techStack.includes('express')
    const hasSpring = techStack.includes('spring')
    const hasDjango = techStack.includes('django')

    const hasFrontend = hasVue || hasReact || hasAngular
    const hasBackend = hasNode || hasSpring || hasDjango

    // 或者检查增强数据中的分数
    if (result.enhancedData?.scores) {
      const scores = result.enhancedData.scores
      const frontendScore = scores.frontend || 0
      const backendScore = scores.backend || 0
      const fullstackScore = scores.fullstack || 0

      // 如果全栈分数高，或者前端和后端分数都不低
      return fullstackScore > 0.6 || (frontendScore > 0.4 && backendScore > 0.4)
    }

    return hasFrontend && hasBackend
  }

  /**
   * 为全栈项目生成端口信息
   */
  private generateFullStackPorts(result: any): any[] {
    const ports = []

    // ✅ 修复：前端端口应该是主端口（用于浏览器访问）
    const frontendPort = this.allocateFrontendPort(result)
    ports.push({
      port: frontendPort,
      type: 'frontend',
      protocol: 'http',
      description: '前端开发服务器',
      isMain: true  // ✅ 修复：前端端口为主端口
    })

    // ✅ 修复：后端端口应该是辅助端口（用于API调用）
    const backendPort = this.allocateBackendPort(result)
    ports.push({
      port: backendPort,
      type: 'backend',
      protocol: 'http',
      description: '后端API服务',
      isMain: false  // ✅ 修复：后端端口为辅助端口
    })

    return ports
  }

  /**
   * 为单一技术栈项目生成端口信息
   */
  private generateSingleStackPorts(result: any): any[] {
    const techStack = result.techStack?.toLowerCase() || ''
    const port = this.allocatePortForTechStack(techStack)

    const type = this.determinePortType(techStack)

    return [{
      port,
      type,
      protocol: 'http',
      description: `${result.techStack || '应用'}服务端口`,
      isMain: true
    }]
  }

  /**
   * 为后端分配端口
   */
  private allocateBackendPort(result: any): number {
    // 从配置管理器获取后端端口范围
    const portConfig = this.configManager?.getPortConfig()
    const backendStart = portConfig?.backendRange.start || 8001
    const backendEnd = portConfig?.backendRange.end || 8100
    const backendRange = backendEnd - backendStart + 1
    
    // 基于目录路径生成一个稳定的端口号
    const hash = this.hashString(result.directory)
    const backendPort = backendStart + (hash % backendRange)

    // ✅ 添加端口范围验证
    if (backendPort < backendStart || backendPort > backendEnd) {
      throw new Error(`后端端口 ${backendPort} 超出允许范围 ${backendStart}-${backendEnd}`)
    }

    return backendPort
  }

  /**
   * 为前端分配端口
   */
  private allocateFrontendPort(result: any): number {
    // 从配置管理器获取前端端口范围
    const portConfig = this.configManager?.getPortConfig()
    const frontendStart = portConfig?.frontendRange.start || 3001
    const frontendEnd = portConfig?.frontendRange.end || 3100
    const frontendRange = frontendEnd - frontendStart + 1
    
    // 基于目录路径生成一个稳定的前端端口号
    const hash = this.hashString(result.directory + '_frontend')
    const frontendPort = frontendStart + (hash % frontendRange)

    // ✅ 动态端口范围验证
    if (frontendPort < frontendStart || frontendPort > frontendEnd) {
      throw new Error(`前端端口 ${frontendPort} 超出允许范围 ${frontendStart}-${frontendEnd}`)
    }

    return frontendPort
  }

  /**
   * 为技术栈分配端口
   */
  private allocatePortForTechStack(techStack: string): number {
    // 从配置管理器获取端口范围
    const portConfig = this.configManager?.getPortConfig()
    const frontendStart = portConfig?.frontendRange.start || 3001
    const frontendEnd = portConfig?.frontendRange.end || 3100
    const backendStart = portConfig?.backendRange.start || 8001
    const backendEnd = portConfig?.backendRange.end || 8100
    
    // 计算端口范围
    const frontendRange = frontendEnd - frontendStart + 1
    const backendRange = backendEnd - backendStart + 1
    
    // 判断是前端还是后端技术栈
    const frontendTechs = ['vue', 'react', 'angular', 'svelte', 'nuxt', 'next']
    const backendTechs = ['node', 'express', 'spring', 'django', 'flask', 'fastapi']

    const isFrontend = frontendTechs.some(tech => techStack.includes(tech))
    const isBackend = backendTechs.some(tech => techStack.includes(tech))

    if (isFrontend && !isBackend) {
      // 纯前端项目：使用前端端口范围
      const hash = this.hashString(techStack + 'frontend')
      const port = frontendStart + (hash % frontendRange)
      // ✅ 添加端口范围验证
      if (port < frontendStart || port > frontendEnd) {
        throw new Error(`前端端口 ${port} 超出允许范围 ${frontendStart}-${frontendEnd}`)
      }
      return port
    } else if (isBackend && !isFrontend) {
      // 纯后端项目：使用后端端口范围
      const hash = this.hashString(techStack + 'backend')
      const port = backendStart + (hash % backendRange)
      // ✅ 添加端口范围验证
      if (port < backendStart || port > backendEnd) {
        throw new Error(`后端端口 ${port} 超出允许范围 ${backendStart}-${backendEnd}`)
      }
      return port
    } else {
      // 混合或未知技术栈：默认使用前端范围
      const hash = this.hashString(techStack + 'default')
      const port = frontendStart + (hash % frontendRange)
      // ✅ 添加端口范围验证
      if (port < frontendStart || port > frontendEnd) {
        throw new Error(`前端端口 ${port} 超出允许范围 ${frontendStart}-${frontendEnd}`)
      }
      return port
    }
  }

  /**
   * 确定端口类型
   */
  private determinePortType(techStack: string): 'frontend' | 'backend' | 'api' {
    if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
      return 'frontend'
    }
    if (techStack.includes('node') || techStack.includes('express') || techStack.includes('spring') || techStack.includes('django')) {
      return 'backend'
    }
    return 'api'
  }

  /**
   * 简单的字符串哈希函数
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash)
  }

  /**
   * Handle batch scan request
   */
  async handleStartBatchScan(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Received batch scan request', { body: req.body })

      const { paths, mode, maxConcurrency, commonConfig } = this.validateBatchScanInput(req.body)

      logger.info('Validated batch scan input', { 
        pathCount: paths.length, 
        mode, 
        maxConcurrency 
      })

      const result = await this.detectionService.startBatchScan(paths, {
        mode,
        maxConcurrency,
        commonConfig
      })

      res.status(202).json({
        success: true,
        data: {
          batchId: result.batchId,
          sessionIds: result.sessionIds,
          mode,
          totalPaths: paths.length
        },
        message: `批量扫描已启动，共 ${paths.length} 个路径`
      })

      logger.info('Batch scan started successfully', {
        batchId: result.batchId,
        sessionCount: result.sessionIds.length,
        mode
      })

    } catch (error) {
      this.handleError(res, error, 'Failed to start batch scan')
    }
  }

  /**
   * Handle get batch status request
   */
  async handleGetBatchStatus(req: Request, res: Response): Promise<void> {
    try {
      const batchId = req.params.id

      logger.info('Getting batch status', { batchId })

      const batch = await this.detectionService.getBatchStatus(batchId)

      res.json({
        success: true,
        data: batch,
        message: 'Batch status retrieved successfully'
      })

    } catch (error) {
      this.handleError(res, error, 'Failed to get batch status')
    }
  }

  /**
   * Validate batch scan input
   */
  private validateBatchScanInput(body: any): {
    paths: string[]
    mode: 'single' | 'multiple' | 'workspace'
    maxConcurrency?: number
    commonConfig?: any
  } {
    const schema = Joi.object({
      paths: Joi.array().items(Joi.string()).min(1).required(),
      mode: Joi.string().valid('single', 'multiple', 'workspace').default('multiple'),
      maxConcurrency: Joi.number().min(1).max(10).optional(),
      commonConfig: Joi.object({
        maxDepth: Joi.number().min(1).max(10).optional(),
        excludePatterns: Joi.array().items(Joi.string()).optional(),
        includePatterns: Joi.array().items(Joi.string()).optional(),
        timeoutMs: Joi.number().min(1000).max(600000).optional()
      }).optional()
    })

    const { error, value } = schema.validate(body)

    if (error) {
      throw new ApplicationError('VALIDATION_ERROR', error.details[0].message)
    }

    return value
  }

  private handleError(res: Response, error: any, defaultMessage: string): void {
    if (error instanceof ApplicationError) {
      const statusCode = error.code === 'VALIDATION_ERROR' ? 400 : 500
      res.status(statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          context: error.context
        }
      })
    } else {
      logger.error(defaultMessage, error)
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: defaultMessage
        }
      })
    }
  }

  getRouter(): Router {
    return this.router
  }
}
