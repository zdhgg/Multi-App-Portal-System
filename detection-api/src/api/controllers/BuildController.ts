/**
 * 构建工具控制器
 * 处理构建工具检测和管理
 * 
 * Phase 1 修复：集成 IntelligentBuildService 实现完整的构建分析
 */

import { Router, Request, Response } from 'express'
import { logger } from '../../utils/logger.js'
import { IntelligentBuildService, BuildAnalysis } from '../../services/intelligentBuildService.js'
import { ApplicationService } from '../../core/ApplicationService.js'
import { BuildAnalysisError, BuildAnalysisErrorType } from '../../services/buildErrors.js'
import { BuildExecutionService, BuildExecutionOptions } from '../../services/buildExecutionService.js'
import { UnifiedDeploymentService } from '../../services/unifiedDeploymentService.js'

export class BuildController {
  private router = Router()
  private applicationService: ApplicationService | null = null
  private buildService: IntelligentBuildService | null = null
  private buildExecutionService: BuildExecutionService | null = null
  private unifiedDeploymentService: UnifiedDeploymentService | null = null

  constructor(applicationService?: ApplicationService) {
    if (applicationService) {
      this.applicationService = applicationService
      this.buildService = new IntelligentBuildService(applicationService)
      this.buildExecutionService = new BuildExecutionService(applicationService, this.buildService)
      this.unifiedDeploymentService = new UnifiedDeploymentService(applicationService, this.buildService)
    }
    this.setupRoutes()
  }

  /**
   * 设置应用服务（用于延迟初始化）
   */
  setApplicationService(applicationService: ApplicationService): void {
    this.applicationService = applicationService
    this.buildService = new IntelligentBuildService(applicationService)
    this.buildExecutionService = new BuildExecutionService(applicationService, this.buildService)
    this.unifiedDeploymentService = new UnifiedDeploymentService(applicationService, this.buildService)
    logger.info('BuildController: ApplicationService 已注入')
  }

  private setupRoutes(): void {
    // 获取支持的构建工具列表
    this.router.get('/supported-tools', this.getSupportedTools.bind(this))
    
    // 分析应用构建配置
    this.router.post('/analyze/:appId', this.analyzeBuild.bind(this))
    
    // 执行构建
    this.router.post('/execute/:appId', this.executeBuild.bind(this))
    
    // 获取构建进度
    this.router.get('/progress/:executionId', this.getBuildProgress.bind(this))
    
    // 取消构建
    this.router.post('/cancel/:executionId', this.cancelBuild.bind(this))
    
    // 统一部署（构建 + 部署到后端 + 更新PM2配置）
    this.router.post('/unified-deploy/:appId', this.unifiedDeploy.bind(this))
    
    // 获取部署进度
    this.router.get('/deploy-progress/:deploymentId', this.getDeployProgress.bind(this))
    
    // 获取构建状态
    this.router.get('/status/:appId', this.getBuildStatus.bind(this))
    
    // 检查是否为前端项目
    this.router.get('/check-frontend/:appId', this.checkFrontendProject.bind(this))
  }

  /**
   * 获取支持的构建工具列表
   */
  async getSupportedTools(req: Request, res: Response): Promise<void> {
    try {
      const supportedTools = {
        frameworks: [
          {
            name: 'Next.js',
            category: 'framework',
            description: 'React框架，支持SSR和SSG',
            detectionFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
            packageName: 'next'
          },
          {
            name: 'Nuxt.js',
            category: 'framework',
            description: 'Vue框架，支持SSR和SSG',
            detectionFiles: ['nuxt.config.js', 'nuxt.config.ts'],
            packageName: 'nuxt'
          },
          {
            name: 'Create React App',
            category: 'framework',
            description: 'React官方脚手架',
            detectionFiles: ['react-scripts'],
            packageName: 'react-scripts'
          },
          {
            name: 'Vue CLI',
            category: 'framework',
            description: 'Vue官方脚手架',
            detectionFiles: ['vue.config.js'],
            packageName: '@vue/cli-service'
          },
          {
            name: 'Angular CLI',
            category: 'framework',
            description: 'Angular官方脚手架',
            detectionFiles: ['angular.json'],
            packageName: '@angular/cli'
          }
        ],
        bundlers: [
          {
            name: 'Vite',
            category: 'bundler',
            description: '快速的前端构建工具',
            detectionFiles: ['vite.config.js', 'vite.config.ts'],
            packageName: 'vite'
          },
          {
            name: 'Webpack',
            category: 'bundler',
            description: '模块打包工具',
            detectionFiles: ['webpack.config.js'],
            packageName: 'webpack'
          },
          {
            name: 'Rollup',
            category: 'bundler',
            description: 'JavaScript模块打包器',
            detectionFiles: ['rollup.config.js'],
            packageName: 'rollup'
          },
          {
            name: 'Parcel',
            category: 'bundler',
            description: '零配置Web应用打包工具',
            detectionFiles: ['.parcelrc'],
            packageName: 'parcel'
          }
        ]
      }
      
      res.json({
        success: true,
        data: supportedTools,
        message: '支持的构建工具列表获取成功'
      })
    } catch (error) {
      logger.error('获取支持的构建工具列表失败:', error)
      res.status(500).json({
        success: false,
        error: '获取支持的构建工具列表失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 分析应用构建配置
   */
  async analyzeBuild(req: Request, res: Response): Promise<void> {
    try {
      const { appId } = req.params
      
      logger.info('开始分析应用构建配置', { appId })
      
      // 检查服务是否已初始化
      if (!this.buildService || !this.applicationService) {
        res.status(500).json({
          success: false,
          error: 'BuildService 未初始化',
          suggestion: '请确保服务已正确注入'
        })
        return
      }

      // 先检查是否为前端项目
      const isFrontend = await this.buildService.isFrontendProject(appId)
      if (!isFrontend) {
        res.status(400).json({
          success: false,
          error: '该应用不是前端项目，无法进行构建分析',
          errorType: 'NOT_FRONTEND',
          suggestion: '构建分析仅适用于前端项目（Vue、React、Angular等）'
        })
        return
      }

      // 执行构建分析
      const analysis = await this.buildService.analyzeFrontendBuild(appId)
      
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
          appId: req.params.appId, 
          errorType: error.type,
          userMessage: error.userMessage
        })

        // 根据错误类型返回不同的HTTP状态码
        let statusCode = 500
        if (error.type === BuildAnalysisErrorType.NOT_FRONTEND || 
            error.type === BuildAnalysisErrorType.NO_BUILD_TOOL) {
          statusCode = 400
        } else if (error.type === BuildAnalysisErrorType.APP_NOT_FOUND) {
          statusCode = 404
        }

        res.status(statusCode).json({
          success: false,
          error: error.userMessage,
          errorType: error.type,
          suggestion: error.technicalDetails?.suggestion,
          details: error.technicalDetails
        })
        return
      }

      // 处理未知错误
      logger.error('构建配置分析失败（未知错误）', { appId: req.params.appId, error })
      res.status(500).json({
        success: false,
        error: '构建分析失败，请查看日志获取详情',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 获取构建状态
   */
  async getBuildStatus(req: Request, res: Response): Promise<void> {
    try {
      const { appId } = req.params
      
      logger.info('获取构建状态', { appId })
      
      // TODO: 实现实际的构建状态查询逻辑
      
      res.json({
        success: true,
        data: {
          appId,
          status: 'idle',
          lastBuildTime: null
        }
      })
    } catch (error) {
      logger.error('获取构建状态失败:', error)
      res.status(500).json({
        success: false,
        error: '获取构建状态失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 检查是否为前端项目
   */
  async checkFrontendProject(req: Request, res: Response): Promise<void> {
    try {
      const { appId } = req.params
      
      logger.info('检查前端项目', { appId })
      
      // 检查服务是否已初始化
      if (!this.buildService) {
        res.status(500).json({
          success: false,
          error: 'BuildService 未初始化'
        })
        return
      }

      const isFrontend = await this.buildService.isFrontendProject(appId)
      
      res.json({
        success: true,
        data: {
          appId,
          isFrontend,
          supportsBuild: isFrontend
        },
        message: isFrontend ? '检测到前端项目' : '非前端项目'
      })
    } catch (error) {
      logger.error('检查前端项目失败:', error)
      res.status(500).json({
        success: false,
        error: '检查前端项目失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 执行构建
   */
  async executeBuild(req: Request, res: Response): Promise<void> {
    try {
      const { appId } = req.params
      const { buildScript, cleanBuild = false, environment = 'production' } = req.body

      logger.info('开始执行构建', { appId, buildScript, cleanBuild, environment })

      // 检查服务是否已初始化
      if (!this.buildService || !this.buildExecutionService) {
        res.status(500).json({
          success: false,
          error: 'BuildExecutionService 未初始化'
        })
        return
      }

      // 先获取构建分析结果
      const analysis = await this.buildService.analyzeFrontendBuild(appId)

      // 构建执行选项
      const options: BuildExecutionOptions = {
        appId,
        buildTool: analysis.buildTool,
        buildScript: buildScript || analysis.buildScript,
        outputDir: analysis.outputDir,
        workingDirectory: analysis.workingDirectory,
        environment,
        cleanBuild
      }

      // 执行构建
      const executionId = await this.buildExecutionService.executeBuild(options)

      res.json({
        success: true,
        data: {
          executionId,
          appId,
          buildTool: analysis.buildTool,
          buildScript: options.buildScript,
          status: 'queued'
        },
        message: '构建任务已启动'
      })

    } catch (error) {
      logger.error('执行构建失败:', error)
      res.status(500).json({
        success: false,
        error: '执行构建失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 获取构建进度
   */
  async getBuildProgress(req: Request, res: Response): Promise<void> {
    try {
      const { executionId } = req.params

      if (!this.buildExecutionService) {
        res.status(500).json({
          success: false,
          error: 'BuildExecutionService 未初始化'
        })
        return
      }

      const progress = this.buildExecutionService.getBuildProgress(executionId)

      if (!progress) {
        res.status(404).json({
          success: false,
          error: '未找到构建任务',
          executionId
        })
        return
      }

      res.json({
        success: true,
        data: progress
      })

    } catch (error) {
      logger.error('获取构建进度失败:', error)
      res.status(500).json({
        success: false,
        error: '获取构建进度失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 取消构建
   */
  async cancelBuild(req: Request, res: Response): Promise<void> {
    try {
      const { executionId } = req.params

      if (!this.buildExecutionService) {
        res.status(500).json({
          success: false,
          error: 'BuildExecutionService 未初始化'
        })
        return
      }

      const cancelled = await this.buildExecutionService.cancelBuild(executionId)

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: '未找到构建任务或任务已完成',
          executionId
        })
        return
      }

      res.json({
        success: true,
        message: '构建已取消',
        executionId
      })

    } catch (error) {
      logger.error('取消构建失败:', error)
      res.status(500).json({
        success: false,
        error: '取消构建失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 统一部署（构建 + 部署到后端静态目录 + 更新PM2配置）
   */
  async unifiedDeploy(req: Request, res: Response): Promise<void> {
    try {
      const { appId } = req.params
      const { staticDir = 'public', backupOld = true } = req.body

      logger.info('开始统一部署', { appId, staticDir, backupOld })

      // 检查服务是否已初始化
      if (!this.unifiedDeploymentService) {
        res.status(500).json({
          success: false,
          error: 'UnifiedDeploymentService 未初始化'
        })
        return
      }

      // 启动部署
      const deploymentId = await this.unifiedDeploymentService.deploy({
        appId,
        staticDir,
        backupOld
      })

      res.json({
        success: true,
        data: {
          deploymentId,
          appId,
          status: 'preparing'
        },
        message: '统一部署任务已启动'
      })

    } catch (error) {
      logger.error('统一部署失败:', error)
      res.status(500).json({
        success: false,
        error: '统一部署失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 获取部署进度
   */
  async getDeployProgress(req: Request, res: Response): Promise<void> {
    try {
      const { deploymentId } = req.params

      if (!this.unifiedDeploymentService) {
        res.status(500).json({
          success: false,
          error: 'UnifiedDeploymentService 未初始化'
        })
        return
      }

      const progress = this.unifiedDeploymentService.getProgress(deploymentId)

      if (!progress) {
        res.status(404).json({
          success: false,
          error: '未找到部署任务',
          deploymentId
        })
        return
      }

      res.json({
        success: true,
        data: progress
      })

    } catch (error) {
      logger.error('获取部署进度失败:', error)
      res.status(500).json({
        success: false,
        error: '获取部署进度失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  getRouter(): Router {
    return this.router
  }
}
