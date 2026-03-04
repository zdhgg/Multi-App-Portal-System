/**
 * Detection Service - Clean Implementation
 * 
 * This service replaces the 200+ line monster function from v1.
 * Each function does one thing, no more than 20 lines.
 * 
 * "Functions should be small and focused." - Clean Code
 */

import { v4 as uuidv4 } from 'uuid'
import { existsSync } from 'fs'
import type {
  DetectionService as IDetectionService,
  DetectionSession,
  DetectionResult,
  DetectionRepository,
  DetectionSummary,
  BatchScan,
  BatchScanConfig,
  ScanMode
} from '../core/types'
import { logger } from '../utils/logger.js'
import { ProjectAggregator, type AggregatedProject } from './ProjectAggregator.js'
import { EnhancedProjectAggregator, type EnhancedAggregatedProject } from './EnhancedProjectAggregator.js'
import { EnhancedProjectAnalyzer, type ProjectAnalysisResult } from '../services/EnhancedProjectAnalyzer.js'
import { SmartProjectClassifier, type ProjectClassification } from '../services/SmartProjectClassifier.js'
import { ProjectRelationshipAnalyzer, type ProjectRelationshipGraph } from '../services/ProjectRelationshipAnalyzer.js'
import { ConfigManager } from '../services/configManager'
import { PortManagementService } from '../services/PortManagementService.js'

export class DetectionService implements IDetectionService {
  private projectAggregator: ProjectAggregator
  private enhancedProjectAggregator: EnhancedProjectAggregator
  private enhancedProjectAnalyzer = new EnhancedProjectAnalyzer()
  private smartProjectClassifier = new SmartProjectClassifier()
  private relationshipAnalyzer = new ProjectRelationshipAnalyzer()

  constructor(
    private repository: DetectionRepository,
    private fileScanner: FileScanner,
    private techStackAnalyzer: TechStackAnalyzer,
    configManager?: ConfigManager,
    portManager?: PortManagementService
  ) {
    // 如果没有传入 configManager，创建一个默认的
    const config = configManager || new ConfigManager()

    // 如果没有传入 portManager，这是一个问题，因为ProjectAggregator现在需要它。
    // 但为了兼容旧代码，我们可能需要一个回退，或者抛出错误。
    // 鉴于ServiceContainer会传入它，我们假设它存在。
    // 如果不存在，我们暂时抛出错误，因为我们无法在没有DB的情况下创建PortManagementService。
    if (!portManager) {
      // For backward compatibility or tests where portManager isn't provided,
      // we might need a mock or throw.
      // Let's assume it's provided in production.
      // If not, ProjectAggregator will fail if we don't pass it.
      // However, we can't create it here without DB.
      // Let's make it optional in ProjectAggregator? No, we updated it to be required.
      throw new Error('PortManagementService is required for DetectionService')
    }

    this.projectAggregator = new ProjectAggregator(config, portManager)
    this.enhancedProjectAggregator = new EnhancedProjectAggregator(config)
  }

  async startWorkspaceScan(workspacePath: string, config?: any): Promise<string> {
    if (!existsSync(workspacePath)) {
      throw new Error(`Workspace path does not exist: ${workspacePath}`)
    }

    // 清理相同工作区路径的旧扫描数据，防止重复
    await this.cleanupOldScansForWorkspace(workspacePath)

    const sessionId = uuidv4()
    const session: DetectionSession = {
      id: sessionId,
      workspacePath,
      state: 'running',
      startedAt: Math.floor(Date.now() / 1000),
      config: config || {}
    }

    await this.repository.saveSession(session)

    // Execute scan asynchronously
    this.executeScan(sessionId).catch(error => {
      logger.error('Scan execution failed', { sessionId, error })
      this.markSessionFailed(sessionId, error.message)
    })

    return sessionId
  }

  async getSession(sessionId: string): Promise<DetectionSession> {
    const session = await this.repository.findSessionById(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }

  async getResults(sessionId: string): Promise<readonly DetectionResult[]> {
    return await this.repository.findResultsBySession(sessionId)
  }

  /**
   * 获取聚合后的项目（智能去重和分组）
   */
  async getAggregatedProjects(sessionId: string): Promise<readonly AggregatedProject[]> {
    logger.info('Getting aggregated projects', { sessionId })

    // 获取原始检测结果
    const rawResults = await this.repository.findResultsBySession(sessionId)

    // 使用聚合器处理结果
    const aggregatedProjects = await this.projectAggregator.aggregateProjects([...rawResults])

    logger.info('Project aggregation completed', {
      sessionId,
      originalCount: rawResults.length,
      aggregatedCount: aggregatedProjects.length
    })

    return aggregatedProjects
  }

  /**
   * 获取增强聚合后的项目（专门解决全栈项目检测）
   */
  async getEnhancedAggregatedProjects(sessionId: string): Promise<readonly EnhancedAggregatedProject[]> {
    logger.info('Getting enhanced aggregated projects', { sessionId })

    const startTime = Date.now()

    try {
      // 获取会话信息以获取扫描深度配置
      const session = await this.getSession(sessionId)
      const maxDepth = session.config?.maxDepth ?? 3
      
      // 获取原始检测结果
      const rawResults = await this.repository.findResultsBySession(sessionId)

      // 使用增强聚合器处理结果（传递扫描深度配置）
      const enhancedProjects = await this.enhancedProjectAggregator.aggregateProjects([...rawResults], { maxDepth })

      const duration = Date.now() - startTime

      logger.info('Enhanced project aggregation completed', {
        sessionId,
        originalCount: rawResults.length,
        enhancedCount: enhancedProjects.length,
        fullStackCount: enhancedProjects.filter(p => p.type === 'fullstack').length,
        duration: `${duration}ms`
      })

      return enhancedProjects

    } catch (error) {
      logger.error('Enhanced project aggregation failed', { sessionId, error })
      // 降级到传统聚合
      return await this.getAggregatedProjects(sessionId) as any
    }
  }

  /**
   * 获取端口分配摘要信息
   */
  async getPortAllocationSummary(sessionId: string): Promise<{
    totalAllocated: number;
    frontendPorts: number[];
    backendPorts: number[];
    projectCount: number;
    allocationStrategy: string;
    conflictResolution: {
      totalConflicts: number;
      resolvedConflicts: number;
    };
  }> {
    logger.info('Getting port allocation summary', { sessionId })

    try {
      // 获取增强聚合项目以获取端口分配信息
      const enhancedProjects = await this.getEnhancedAggregatedProjects(sessionId)

      // 收集所有已分配的端口
      const allAllocatedPorts = new Set<number>()
      const frontendPorts: number[] = []
      const backendPorts: number[] = []
      let fullStackProjectCount = 0

      enhancedProjects.forEach(project => {
        // 从全栈项目信息中提取端口分配
        if (project.fullstackInfo?.portAllocation) {
          const allocation = project.fullstackInfo.portAllocation

          if (allocation.ports.frontend) {
            frontendPorts.push(allocation.ports.frontend)
            allAllocatedPorts.add(allocation.ports.frontend)
          }

          if (allocation.ports.backend) {
            backendPorts.push(allocation.ports.backend)
            allAllocatedPorts.add(allocation.ports.backend)
          }

          if (project.type === 'fullstack') {
            fullStackProjectCount++
          }
        }

        // 从组件端口信息中提取（备用）
        if (project.components?.frontend?.originalPort) {
          const port = project.components.frontend.originalPort
          if (!allAllocatedPorts.has(port)) {
            frontendPorts.push(port)
            allAllocatedPorts.add(port)
          }
        }

        if (project.components?.backend?.originalPort) {
          const port = project.components.backend.originalPort
          if (!allAllocatedPorts.has(port)) {
            backendPorts.push(port)
            allAllocatedPorts.add(port)
          }
        }
      })

      // 计算冲突解决情况（简化版本）
      const expectedPairs = fullStackProjectCount
      const actualPairs = Math.min(frontendPorts.length, backendPorts.length)
      const totalConflicts = Math.max(0, expectedPairs - actualPairs)

      const summary = {
        totalAllocated: allAllocatedPorts.size,
        frontendPorts: frontendPorts.sort((a, b) => a - b),
        backendPorts: backendPorts.sort((a, b) => a - b),
        projectCount: enhancedProjects.length,
        allocationStrategy: 'paired', // 固定为配对分配策略
        conflictResolution: {
          totalConflicts,
          resolvedConflicts: actualPairs
        }
      }

      logger.info('Port allocation summary generated', {
        sessionId,
        totalAllocated: summary.totalAllocated,
        frontendPortCount: frontendPorts.length,
        backendPortCount: backendPorts.length,
        projectCount: summary.projectCount
      })

      return summary

    } catch (error) {
      logger.error('Failed to generate port allocation summary', { sessionId, error })
      throw error
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.markSessionFailed(sessionId, 'Cancelled by user')
  }

  // V1 compatibility methods
  async getScanSession(sessionId: string): Promise<DetectionSession | null> {
    try {
      return await this.getSession(sessionId)
    } catch {
      return null
    }
  }

  async getScanResults(sessionId: string): Promise<readonly DetectionResult[]> {
    return await this.getResults(sessionId)
  }

  async getWorkspaceScanResult(sessionId: string): Promise<{
    session: DetectionSession
    results: readonly DetectionResult[]
    summary: DetectionSummary
  } | null> {
    const session = await this.getScanSession(sessionId)
    if (!session) return null

    const results = await this.getScanResults(sessionId)

    // Calculate summary
    const summary: DetectionSummary = {
      totalScanned: results.length,
      validFound: results.filter(r => !r.issues.some(i => i.type === 'error')).length,
      warningCount: results.filter(r => r.issues.some(i => i.type === 'warning')).length,
      errorCount: results.filter(r => r.issues.some(i => i.type === 'error')).length
    }

    return { session, results, summary }
  }

  async getActiveSessions(): Promise<DetectionSession[]> {
    return await this.repository.findActiveSessions()
  }

  async clearSession(sessionId: string): Promise<boolean> {
    try {
      await this.repository.deleteSession(sessionId)
      return true
    } catch {
      return false
    }
  }

  async detectSingleDirectory(directory: string, options?: any): Promise<DetectionResult> {
    const analysis = await this.techStackAnalyzer.analyze(directory)

    return {
      id: uuidv4(),
      sessionId: 'single-directory',
      directory,
      techStack: analysis.techStack,
      confidence: analysis.confidence,
      issues: analysis.issues,
      createdAt: Math.floor(Date.now() / 1000)
    }
  }

  /**
   * 清理指定工作区的旧扫描数据，防止重复显示
   */
  private async cleanupOldScansForWorkspace(workspacePath: string): Promise<void> {
    try {
      logger.info('Cleaning up old scans for workspace', { workspacePath })

      // 查找相同工作区路径的旧会话
      const oldSessions = await this.repository.findSessionsByWorkspace(workspacePath)

      for (const session of oldSessions) {
        // 删除会话相关的检测结果
        await this.repository.deleteResultsBySession(session.id)
        // 删除会话本身
        await this.repository.deleteSession(session.id)
        logger.info('Cleaned up old session', { sessionId: session.id, workspacePath })
      }

      // 额外清理孤立的结果（session_id为NULL的记录）
      await this.repository.cleanupOrphanedResults()

      logger.info('Workspace cleanup completed', { workspacePath })

    } catch (error) {
      logger.warn('Failed to cleanup old scans, continuing with new scan', { workspacePath, error })
      // 不抛出错误，允许新扫描继续进行
    }
  }

  /**
   * Execute the actual scanning process
   */
  private async executeScan(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId)

    try {
      // 从配置中获取扫描深度，默认为 5
      const maxDepth = session.config?.maxDepth ?? 5
      // 【重要调试日志】确认扫描配置
      logger.warn('=== SCAN CONFIG DEBUG ===', { 
        sessionId, 
        maxDepth, 
        sessionConfig: session.config,
        hasConfig: !!session.config,
        hasMaxDepth: session.config?.maxDepth !== undefined
      })

      // Step 1: Find potential application directories
      const directories = await this.fileScanner.findApplicationDirectories(
        session.workspacePath,
        { maxDepth }
      )

      // Step 2: Analyze each directory
      const results: DetectionResult[] = []
      for (const directory of directories) {
        const result = await this.analyzeDirectory(sessionId, directory)
        if (result) {
          results.push(result)
        }
      }

      // Step 3: Apply enhanced full-stack detection and aggregation
      logger.info('Applying enhanced full-stack detection and aggregation', { sessionId, resultsCount: results.length })

      let saveSuccess = false

      try {
        const { ProjectAggregator } = await import('./ProjectAggregator')
        // ✅ 修复：使用已有的projectAggregator实例，而不是创建新的
        const aggregator = this.projectAggregator

        // 执行项目聚合，包括全栈检测
        const aggregatedProjects = await aggregator.aggregateProjects(results)

        logger.info('Project aggregation completed', {
          sessionId,
          originalCount: results.length,
          aggregatedCount: aggregatedProjects.length
        })

        // 将聚合结果转换回DetectionResult格式并保存
        for (const aggregatedProject of aggregatedProjects) {
          const enhancedResult = this.convertAggregatedToDetectionResult(sessionId, aggregatedProject)
          await this.repository.saveResult(enhancedResult)
        }

        logger.info('Enhanced results saved', { sessionId, enhancedCount: aggregatedProjects.length })
        saveSuccess = true  // 标记保存成功

      } catch (aggregationError) {
        logger.warn('Enhanced aggregation failed, falling back to traditional results', {
          sessionId,
          error: aggregationError
        })
      }

      // 只有在聚合失败时才保存原始结果
      if (!saveSuccess) {
        for (const result of results) {
          logger.info('Saving individual result', { id: result.id, directory: result.directory, techStack: result.techStack })
          await this.repository.saveResult(result)
          logger.info('Result saved successfully', { id: result.id })
        }
      }

      // Step 4: Complete session
      await this.completeSession(sessionId, directories.length, results.length)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.markSessionFailed(sessionId, errorMessage)
      throw error
    }
  }

  /**
   * Analyze a single directory using enhanced analyzer
   */
  private async analyzeDirectory(
    sessionId: string,
    directory: string
  ): Promise<DetectionResult | null> {
    try {
      logger.info('Starting enhanced directory analysis', { directory })

      // 使用增强分析器进行多维度分析
      const enhancedAnalysis = await this.enhancedProjectAnalyzer.analyzeProject(directory)

      // 使用智能分类器进行分类
      const classification = this.smartProjectClassifier.classifyProject(enhancedAnalysis)

      logger.info('Enhanced analysis result', {
        directory,
        classification: classification.classification,
        confidence: classification.confidence,
        scores: classification.scores,
        reasoning: classification.reasoning
      })

      // 使用新的置信度阈值 (0.45)
      if (classification.confidence < 0.45) {
        logger.info('Skipping low confidence result', {
          directory,
          confidence: classification.confidence,
          reasoning: classification.reasoning
        })
        return null
      }

      // 转换issues格式
      const detectionIssues = enhancedAnalysis.issues.map(issue => ({
        type: 'info' as const,
        code: 'ENHANCED_ANALYSIS',
        message: issue
      }))

      const result = {
        id: uuidv4(),
        sessionId,
        directory,
        techStack: classification.classification,
        confidence: classification.confidence,
        issues: detectionIssues,
        createdAt: Math.floor(Date.now() / 1000),
        // 添加增强分析的额外信息
        enhancedData: {
          scores: classification.scores,
          reasoning: classification.reasoning,
          features: enhancedAnalysis.features
        }
      }

      logger.info('Created enhanced detection result', {
        id: result.id,
        directory,
        classification: result.techStack,
        confidence: result.confidence
      })
      return result

    } catch (error) {
      logger.error('Enhanced directory analysis failed, falling back to legacy analyzer', { directory, error })

      // 回退到原有分析器
      return await this.legacyAnalyzeDirectory(sessionId, directory)
    }
  }

  /**
   * Legacy directory analysis (fallback)
   */
  private async legacyAnalyzeDirectory(
    sessionId: string,
    directory: string
  ): Promise<DetectionResult | null> {
    try {
      logger.info('Using legacy analyzer for directory', { directory })
      const analysis = await this.techStackAnalyzer.analyze(directory)

      logger.info('Legacy analysis result', {
        directory,
        techStack: analysis.techStack,
        confidence: analysis.confidence,
        issuesCount: analysis.issues.length
      })

      if (analysis.confidence < 0.3) {
        logger.info('Skipping low confidence legacy result', { directory, confidence: analysis.confidence })
        return null
      }

      const result = {
        id: uuidv4(),
        sessionId,
        directory,
        techStack: analysis.techStack,
        confidence: analysis.confidence,
        issues: analysis.issues,
        createdAt: Math.floor(Date.now() / 1000)
      }

      logger.info('Created legacy detection result', { id: result.id, directory })
      return result

    } catch (error) {
      logger.error('Legacy directory analysis failed', { directory, error })
      return null
    }
  }

  /**
   * Mark session as completed
   */
  private async completeSession(
    sessionId: string,
    totalScanned: number,
    validFound: number
  ): Promise<void> {
    const results = await this.getResults(sessionId)
    const warningCount = results.filter(r =>
      r.issues.some(i => i.type === 'warning')
    ).length
    const errorCount = results.filter(r =>
      r.issues.some(i => i.type === 'error')
    ).length

    const summary: DetectionSummary = {
      totalScanned,
      validFound,
      warningCount,
      errorCount
    }

    const completedSession: DetectionSession = {
      ...(await this.getSession(sessionId)),
      state: 'completed',
      completedAt: Math.floor(Date.now() / 1000),
      summary
    }

    await this.repository.saveSession(completedSession)
    logger.info('Scan completed', { sessionId, summary })
  }

  /**
   * Convert aggregated project to DetectionResult format
   */
  private convertAggregatedToDetectionResult(sessionId: string, aggregatedProject: any): DetectionResult {
    // 创建增强的issues，包含聚合信息
    const enhancedIssues = [
      {
        type: 'info' as const,
        code: 'ENHANCED_AGGREGATION',
        message: `聚合项目: ${aggregatedProject.name} (${aggregatedProject.type})`
      },
      {
        type: 'info' as const,
        code: 'PORT_ALLOCATION',
        message: `端口分配: ${this.getPortSummary(aggregatedProject)}`
      }
    ]

    return {
      id: uuidv4(),
      sessionId,
      directory: aggregatedProject.directory,
      techStack: aggregatedProject.primaryTechStack,
      confidence: aggregatedProject.confidence,
      issues: enhancedIssues,
      createdAt: Math.floor(Date.now() / 1000),
      enhancedData: {
        scores: {
          frontend: aggregatedProject.type === 'frontend' || aggregatedProject.type === 'fullstack' ? 0.9 : 0.1,
          backend: aggregatedProject.type === 'backend' || aggregatedProject.type === 'fullstack' ? 0.9 : 0.1,
          fullstack: aggregatedProject.type === 'fullstack' ? 0.9 : 0.1,
          static: aggregatedProject.type === 'static' ? 0.9 : 0.1
        },
        reasoning: [
          `项目类型: ${aggregatedProject.type}`,
          `组件数量: ${aggregatedProject.componentCount}`,
          `主要技术栈: ${aggregatedProject.primaryTechStack}`,
          `置信度: ${(aggregatedProject.confidence * 100).toFixed(1)}%`
        ],
        features: {
          isAggregated: true,
          projectName: aggregatedProject.name,
          projectType: aggregatedProject.type,
          componentCount: aggregatedProject.componentCount,
          portInfo: aggregatedProject.portInfo,
          fullstackInfo: aggregatedProject.fullstackInfo
        }
      }
    }
  }

  /**
   * Get port summary for aggregated project
   */
  private getPortSummary(aggregatedProject: any): string {
    const ports: string[] = []

    if (aggregatedProject.portInfo) {
      if (aggregatedProject.portInfo.main) {
        ports.push(`主端口:${aggregatedProject.portInfo.main.port}`)
      }
      if (aggregatedProject.portInfo.frontend) {
        ports.push(`前端:${aggregatedProject.portInfo.frontend.port}`)
      }
      if (aggregatedProject.portInfo.backend) {
        ports.push(`后端:${aggregatedProject.portInfo.backend.port}`)
      }
    }

    return ports.length > 0 ? ports.join(', ') : '未分配端口'
  }

  /**
   * Mark session as failed
   */
  private async markSessionFailed(sessionId: string, reason: string): Promise<void> {
    try {
      const failedSession: DetectionSession = {
        ...(await this.getSession(sessionId)),
        state: 'failed',
        completedAt: Math.floor(Date.now() / 1000)
      }

      await this.repository.saveSession(failedSession)
      logger.error('Scan failed', { sessionId, reason })

    } catch (error) {
      logger.error('Failed to mark session as failed', { sessionId, error })
    }
  }

  /**
   * 为单个目录执行增强检测（支持全栈项目）
   */
  async detectSingleDirectoryEnhanced(directory: string, options?: any): Promise<{
    traditional: DetectionResult;
    enhanced?: EnhancedAggregatedProject;
  }> {
    logger.info('执行增强单目录检测', { directory })

    try {
      // 传统检测
      const traditional = await this.detectSingleDirectory(directory, options)

      // 直接使用增强全栈检测器检测指定目录
      const { enhancedFullStackDetector } = await import('../services/enhancedFullStackDetector')
      const fullStackProjects = await enhancedFullStackDetector.detectFullStackProjects(directory, {
        minConfidence: 0.6,
        maxDepth: 2,
        includeNodeModules: false
      })

      let enhanced: EnhancedAggregatedProject | undefined

      if (fullStackProjects.length > 0) {
        // 将检测到的全栈项目转换为增强聚合格式
        const fullStackProject = fullStackProjects[0]
        enhanced = {
          id: fullStackProject.id,
          name: fullStackProject.name,
          directory: fullStackProject.directory,
          type: 'fullstack',
          components: {
            frontend: traditional, // 使用传统检测作为前端组件
            backend: traditional   // 临时使用传统检测作为后端组件
          },
          fullstackInfo: {
            detectionType: fullStackProject.type === 'separated_fullstack' ? 'separated' :
              fullStackProject.type === 'monorepo_fullstack' ? 'monorepo' : 'nested',
            frontendPath: fullStackProject.frontend.directory,
            backendPath: fullStackProject.backend.directory,
            rootPackageJson: fullStackProject.metadata?.rootPackageJson,
            originalPorts: {
              frontend: fullStackProject.frontend.ports,
              backend: fullStackProject.backend.ports
            }
          },
          primaryTechStack: fullStackProject.frontend.techStack,
          techStacks: [fullStackProject.frontend.techStack, fullStackProject.backend.techStack],
          confidence: fullStackProject.confidence,
          componentCount: 2,
          isBackup: directory.toLowerCase().includes('backup'),
          description: `全栈项目：${fullStackProject.frontend.techStack} + ${fullStackProject.backend.techStack}`,
          detectionReason: fullStackProject.metadata?.detectionReason || '增强检测器识别'
        }

        logger.info('检测到全栈项目', {
          directory,
          type: enhanced.fullstackInfo?.detectionType,
          confidence: enhanced.confidence,
          frontend: enhanced.fullstackInfo?.frontendPath,
          backend: enhanced.fullstackInfo?.backendPath
        })
      }

      return { traditional, enhanced }

    } catch (error) {
      logger.error('增强单目录检测失败', { directory, error })
      const traditional = await this.detectSingleDirectory(directory, options)
      return { traditional }
    }
  }

  /**
   * 重新处理会话结果（使用增强聚合）
   */
  async reprocessSessionWithEnhancement(sessionId: string): Promise<{
    traditional: readonly AggregatedProject[];
    enhanced: readonly EnhancedAggregatedProject[];
  }> {
    logger.info('重新处理会话结果', { sessionId })

    const traditional = await this.getAggregatedProjects(sessionId)
    const enhanced = await this.getEnhancedAggregatedProjects(sessionId)

    return { traditional, enhanced }
  }

  /**
   * 获取项目关联分析结果
   */
  async getProjectRelationships(sessionId: string): Promise<ProjectRelationshipGraph> {
    logger.info('Starting project relationship analysis', { sessionId })

    const startTime = Date.now()

    try {
      // 获取聚合后的项目数据
      const aggregatedProjects = await this.getAggregatedProjects(sessionId)

      // 执行关联分析
      const relationshipGraph = await this.relationshipAnalyzer.analyzeRelationships([...aggregatedProjects])

      const duration = Date.now() - startTime

      logger.info('Project relationship analysis completed', {
        sessionId,
        projectCount: relationshipGraph.metadata.totalProjects,
        dependencyCount: relationshipGraph.metadata.totalDependencies,
        complexity: relationshipGraph.metadata.complexity,
        issuesFound: relationshipGraph.issues.length,
        duration: `${duration}ms`
      })

      return relationshipGraph

    } catch (error) {
      logger.error('Project relationship analysis failed', { sessionId, error })
      throw new Error(`关联分析失败: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * 获取完整的项目生态分析（聚合 + 关联分析）
   */
  async getCompleteProjectEcosystem(sessionId: string): Promise<{
    projects: readonly AggregatedProject[];
    relationships: ProjectRelationshipGraph;
    summary: {
      totalProjects: number;
      totalDependencies: number;
      complexity: string;
      startupPhases: number;
      estimatedStartupTime: number;
      criticalIssues: number;
    };
  }> {
    logger.info('Getting complete project ecosystem analysis', { sessionId })

    const startTime = Date.now()

    try {
      // 并行获取项目数据和关联分析
      const [projects, relationships] = await Promise.all([
        this.getAggregatedProjects(sessionId),
        this.getProjectRelationships(sessionId)
      ])

      // 生成摘要
      const summary = {
        totalProjects: relationships.metadata.totalProjects,
        totalDependencies: relationships.metadata.totalDependencies,
        complexity: relationships.metadata.complexity,
        startupPhases: relationships.startupOrder.phases.length,
        estimatedStartupTime: relationships.startupOrder.totalTime,
        criticalIssues: relationships.issues.filter(issue =>
          issue.severity === 'critical' || issue.severity === 'high'
        ).length
      }

      const duration = Date.now() - startTime

      logger.info('Complete project ecosystem analysis completed', {
        sessionId,
        ...summary,
        duration: `${duration}ms`
      })

      return { projects, relationships, summary }

    } catch (error) {
      logger.error('Complete project ecosystem analysis failed', { sessionId, error })
      throw new Error(`生态分析失败: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // =============================================================================
  // BATCH SCAN METHODS
  // =============================================================================

  /**
   * Start a batch scan across multiple paths
   * Implements concurrent scanning based on the scan mode
   */
  async startBatchScan(
    paths: readonly string[],
    config: BatchScanConfig
  ): Promise<{ batchId: string; sessionIds: readonly string[] }> {
    const batchId = uuidv4()
    const sessionIds: string[] = []

    logger.info('Starting batch scan', {
      batchId,
      mode: config.mode,
      pathCount: paths.length,
      maxConcurrency: config.maxConcurrency
    })

    try {
      // Determine concurrency based on mode
      const concurrency = this.getConcurrencyForMode(config.mode, config.maxConcurrency)

      // Split paths into chunks for concurrent processing
      const chunks = this.chunkArray(paths, concurrency)

      // Process each chunk concurrently
      for (const chunk of chunks) {
        const chunkSessions = await Promise.all(
          chunk.map(path => this.startWorkspaceScan(path, config.commonConfig))
        )
        sessionIds.push(...chunkSessions)
      }

      // Save batch metadata
      const batch: BatchScan = {
        id: batchId,
        mode: config.mode,
        sessionIds,
        totalPaths: paths.length,
        createdAt: Math.floor(Date.now() / 1000),
        status: 'running'
      }

      await this.repository.saveBatch(batch)

      // Monitor batch progress asynchronously
      this.monitorBatchProgress(batchId, sessionIds).catch(error => {
        logger.error('Batch monitoring failed', { batchId, error })
      })

      logger.info('Batch scan started successfully', {
        batchId,
        sessionCount: sessionIds.length,
        mode: config.mode
      })

      return { batchId, sessionIds }

    } catch (error) {
      logger.error('Batch scan startup failed', { batchId, error })
      throw new Error(`批量扫描启动失败: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get the status of a batch scan
   */
  async getBatchStatus(batchId: string): Promise<BatchScan> {
    const batch = await this.repository.findBatchById(batchId)

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`)
    }

    // Update summary with current session states
    if (batch.status === 'running') {
      const summary = await this.calculateBatchSummary(batch.sessionIds)

      // Check if all sessions are complete
      const allComplete = summary.completedSessions + summary.failedSessions === batch.sessionIds.length

      if (allComplete) {
        await this.repository.updateBatchStatus(
          batchId,
          summary.failedSessions === batch.sessionIds.length ? 'failed' : 'completed',
          summary
        )

        return {
          ...batch,
          status: summary.failedSessions === batch.sessionIds.length ? 'failed' : 'completed',
          summary
        }
      }

      return { ...batch, summary }
    }

    return batch
  }

  /**
   * Monitor batch progress and update status
   */
  private async monitorBatchProgress(
    batchId: string,
    sessionIds: readonly string[]
  ): Promise<void> {
    const maxAttempts = 60 // Monitor for up to 5 minutes
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Check every 5 seconds
      attempts++

      try {
        const summary = await this.calculateBatchSummary(sessionIds)
        const totalProcessed = summary.completedSessions + summary.failedSessions

        logger.debug('Batch progress update', {
          batchId,
          completedSessions: summary.completedSessions,
          failedSessions: summary.failedSessions,
          totalSessions: sessionIds.length
        })

        // Update summary
        await this.repository.updateBatchStatus(batchId, 'running', summary)

        // Check if all sessions are complete
        if (totalProcessed === sessionIds.length) {
          const finalStatus = summary.failedSessions === sessionIds.length ? 'failed' : 'completed'
          await this.repository.updateBatchStatus(batchId, finalStatus, summary)

          logger.info('Batch scan completed', {
            batchId,
            status: finalStatus,
            summary
          })

          return
        }
      } catch (error) {
        logger.error('Error monitoring batch progress', { batchId, error })
      }
    }

    // Timeout
    logger.warn('Batch monitoring timeout', { batchId })
  }

  /**
   * Calculate summary statistics for a batch
   */
  private async calculateBatchSummary(
    sessionIds: readonly string[]
  ): Promise<BatchScan['summary']> {
    let completedSessions = 0
    let failedSessions = 0
    let totalProjectsFound = 0

    for (const sessionId of sessionIds) {
      try {
        const session = await this.repository.findSessionById(sessionId)

        if (session) {
          if (session.state === 'completed') {
            completedSessions++
            const results = await this.repository.findResultsBySession(sessionId)
            totalProjectsFound += results.length
          } else if (session.state === 'failed') {
            failedSessions++
          }
        }
      } catch (error) {
        logger.error('Error getting session status', { sessionId, error })
        failedSessions++
      }
    }

    return {
      completedSessions,
      failedSessions,
      totalProjectsFound
    }
  }

  /**
   * Get concurrency level based on scan mode
   */
  private getConcurrencyForMode(mode: ScanMode, maxConcurrency?: number): number {
    if (maxConcurrency) {
      return maxConcurrency
    }

    switch (mode) {
      case 'single':
        return 1
      case 'multiple':
        return 3
      case 'workspace':
        return 5
      default:
        return 3
    }
  }

  /**
   * Split array into chunks for concurrent processing
   */
  private chunkArray<T>(array: readonly T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push([...array.slice(i, i + chunkSize)])
    }
    return chunks
  }
}

// =============================================================================
// SUPPORTING INTERFACES (to be implemented separately)
// =============================================================================

interface FileScanner {
  findApplicationDirectories(workspacePath: string): Promise<string[]>
}

interface TechStackAnalyzer {
  analyze(directory: string): Promise<{
    techStack: string
    confidence: number
    issues: DetectionIssue[]
  }>
}

interface DetectionIssue {
  readonly type: 'error' | 'warning' | 'info'
  readonly code: string
  readonly message: string
  readonly file?: string
  readonly suggestion?: string
}
