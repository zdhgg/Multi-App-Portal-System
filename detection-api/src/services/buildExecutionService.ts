/**
 * Build Execution Service - 构建执行服务
 * 
 * 负责执行前端项目的构建任务，支持多种构建工具
 * 提供构建进度监控、日志输出、错误处理等功能
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs/promises'
import { logger } from '../utils/logger'
import { ApplicationService } from '../core/ApplicationService'
import { IntelligentBuildService } from './intelligentBuildService'
import type { WebSocketManager } from './websocket'

export interface BuildExecutionOptions {
  appId: string
  buildTool: string
  buildScript: string
  outputDir: string
  // Optional frontend working directory resolved during analysis.
  workingDirectory?: string
  environment?: 'development' | 'production'
  cleanBuild?: boolean
  enableOptimizations?: boolean
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

export interface BuildResult {
  success: boolean
  executionId: string
  duration: number
  outputDir: string
  outputSize: number
  artifacts: string[]
  optimizations: string[]
  warnings: string[]
  errors: string[]
}

export class BuildExecutionService extends EventEmitter {
  private runningBuilds = new Map<string, ChildProcess>()
  private buildProgress = new Map<string, BuildProgress>()
  private buildQueue: BuildExecutionOptions[] = []
  private maxConcurrentBuilds = 3
  private currentBuilds = 0

  constructor(
    private applicationService: ApplicationService,
    private buildService: IntelligentBuildService,
    private wsManager?: WebSocketManager
  ) {
    super()
    this.setupCleanup()
  }

  /**
   * 执行构建任务
   */
  async executeBuild(options: BuildExecutionOptions): Promise<string> {
    const executionId = this.generateExecutionId()
    
    // 验证应用存在
    const app = await this.applicationService.findById(options.appId)
    if (!app) {
      throw new Error(`应用 ${options.appId} 不存在`)
    }

    // Resolve actual working directory for fullstack/monorepo frontend builds.
    const projectPath = await this.resolveWorkingDirectory(app.directory, options.workingDirectory)
    if (!await this.validateProjectPath(projectPath)) {
      throw new Error(`项目目录 ${projectPath} 不存在或无法访问`)
    }

    // 创建构建进度记录
    const progress: BuildProgress = {
      appId: options.appId,
      executionId,
      status: 'queued',
      progress: 0,
      currentStep: '等待构建',
      startTime: Date.now(),
      logs: []
    }

    this.buildProgress.set(executionId, progress)
    this.emit('buildQueued', progress)

    // 添加到队列或立即执行
    if (this.currentBuilds < this.maxConcurrentBuilds) {
      this.startBuild(options, executionId, projectPath)
    } else {
      this.buildQueue.push(options)
      this.updateProgress(executionId, { currentStep: '排队等待中...' })
    }

    return executionId
  }

  /**
   * 开始构建
   */
  private async startBuild(options: BuildExecutionOptions, executionId: string, projectPath: string) {
    this.currentBuilds++
    
    try {
      this.updateProgress(executionId, {
        status: 'running',
        progress: 5,
        currentStep: '准备构建环境'
      })

      // 准备构建环境（可能会自动切换到检测到的前端子目录）
      projectPath = await this.prepareBuildEnvironment(projectPath, options)
      
      this.updateProgress(executionId, {
        progress: 10,
        currentStep: '执行构建命令'
      })

      // 执行构建命令
      const buildResult = await this.runBuildCommand(options, executionId, projectPath)
      
      this.updateProgress(executionId, {
        progress: 90,
        currentStep: '分析构建结果'
      })

      // 分析构建结果
      const analysis = await this.analyzeBuildResult(projectPath, options.outputDir, buildResult)
      
      this.updateProgress(executionId, {
        status: 'success',
        progress: 100,
        currentStep: '构建完成',
        endTime: Date.now(),
        duration: Date.now() - this.buildProgress.get(executionId)!.startTime,
        outputSize: analysis.outputSize,
        artifacts: analysis.artifacts
      })

      this.emit('buildCompleted', this.buildProgress.get(executionId))
      
    } catch (error) {
      this.handleBuildError(executionId, error as Error)
    } finally {
      this.currentBuilds--
      this.runningBuilds.delete(executionId)
      this.processQueue()
    }
  }

  /**
   * 准备构建环境
   */
  private async prepareBuildEnvironment(projectPath: string, options: BuildExecutionOptions): Promise<string> {
    let workingPath = projectPath
    let dependencyBasePath = await this.findNearestDependencyBasePath(workingPath, projectPath)
    let dependencyMode: 'node_modules' | 'yarn-pnp' | null = dependencyBasePath ? 'node_modules' : null

    // Yarn PnP 项目可能没有 node_modules
    if (!dependencyBasePath) {
      dependencyBasePath = await this.findNearestYarnPnpBasePath(workingPath, projectPath)
      if (dependencyBasePath) {
        dependencyMode = 'yarn-pnp'
      }
    }

    if (!dependencyBasePath) {
      logger.error('依赖检查失败，未找到依赖环境', {
        projectPath,
        workingPath
      })
      throw new Error(`依赖未安装，请先运行 npm install 或 yarn install（检查目录: ${workingPath}）`)
    }

    if (dependencyMode === 'node_modules' && path.resolve(dependencyBasePath) !== path.resolve(workingPath)) {
      logger.info('检测到上级依赖目录，按 workspace/monorepo 方式继续构建', {
        workingPath,
        dependencyBasePath
      })
    } else if (dependencyMode === 'yarn-pnp') {
      logger.info('检测到 Yarn PnP 依赖环境', {
        workingPath,
        dependencyBasePath
      })
    }

    // 清理构建目录（如果需要）
    if (options.cleanBuild && options.outputDir) {
      const outputPath = path.join(workingPath, options.outputDir)
      try {
        await fs.rm(outputPath, { recursive: true, force: true })
        logger.info(`清理构建目录: ${outputPath}`)
      } catch (error) {
        logger.warn(`清理构建目录失败: ${error}`)
      }
    }

    return workingPath
  }

  /**
   * 执行构建命令
   */
  private async runBuildCommand(
    options: BuildExecutionOptions,
    executionId: string,
    projectPath: string
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const [command, ...args] = this.parseBuildScript(options.buildScript)
      
      const isWindows = process.platform === 'win32'
      const buildProcess = spawn(command, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          NODE_ENV: options.environment || 'production'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows,
        windowsHide: true  // 隐藏Windows下的CMD窗口
      })

      this.runningBuilds.set(executionId, buildProcess)

      let stdout = ''
      let stderr = ''

      // 处理标准输出
      buildProcess.stdout?.on('data', (data) => {
        const message = data.toString()
        stdout += message
        this.addBuildLog(executionId, 'info', message, 'stdout')
        this.updateBuildProgress(executionId, message)
      })

      // 处理错误输出
      buildProcess.stderr?.on('data', (data) => {
        const message = data.toString()
        stderr += message
        this.addBuildLog(executionId, 'warn', message, 'stderr')
      })

      // 处理进程退出
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`构建失败，退出码: ${code}`))
        }
      })

      // 处理进程错误
      buildProcess.on('error', (error) => {
        reject(new Error(`构建进程错误: ${error.message}`))
      })

      // 超时处理（30分钟）
      setTimeout(() => {
        if (this.runningBuilds.has(executionId)) {
          buildProcess.kill('SIGTERM')
          reject(new Error('构建超时'))
        }
      }, 30 * 60 * 1000)
    })
  }

  /**
   * 分析构建结果
   */
  private async analyzeBuildResult(
    projectPath: string,
    outputDir: string,
    buildResult: { stdout: string; stderr: string }
  ): Promise<{ outputSize: number; artifacts: string[] }> {
    const outputPath = path.join(projectPath, outputDir)
    
    try {
      const artifacts = await this.collectBuildArtifacts(outputPath)
      const outputSize = await this.calculateOutputSize(outputPath)
      
      return { outputSize, artifacts }
    } catch (error) {
      logger.warn(`分析构建结果失败: ${error}`)
      return { outputSize: 0, artifacts: [] }
    }
  }

  /**
   * 收集构建产物
   */
  private async collectBuildArtifacts(outputPath: string): Promise<string[]> {
    const artifacts: string[] = []
    
    try {
      const files = await fs.readdir(outputPath, { recursive: true })
      for (const file of files) {
        const filePath = path.join(outputPath, file.toString())
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          artifacts.push(file.toString())
        }
      }
    } catch (error) {
      logger.warn(`收集构建产物失败: ${error}`)
    }
    
    return artifacts
  }

  /**
   * 计算输出大小
   */
  private async calculateOutputSize(outputPath: string): Promise<number> {
    let totalSize = 0
    
    try {
      const files = await fs.readdir(outputPath, { recursive: true })
      for (const file of files) {
        const filePath = path.join(outputPath, file.toString())
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          totalSize += stat.size
        }
      }
    } catch (error) {
      logger.warn(`计算输出大小失败: ${error}`)
    }
    
    return totalSize
  }

  /**
   * 解析构建脚本
   */
  private parseBuildScript(buildScript: string): string[] {
    // 处理 npm run build, yarn build 等命令
    if (buildScript.startsWith('npm ')) {
      return buildScript.split(' ')
    } else if (buildScript.startsWith('yarn ')) {
      return buildScript.split(' ')
    } else if (buildScript.startsWith('pnpm ')) {
      return buildScript.split(' ')
    } else {
      // 直接命令
      return buildScript.split(' ')
    }
  }

  /**
   * 更新构建进度
   */
  private updateBuildProgress(executionId: string, output: string) {
    // 基于输出内容智能更新进度
    const progress = this.buildProgress.get(executionId)
    if (!progress) return

    let newProgress = progress.progress
    let currentStep = progress.currentStep

    // 根据输出内容判断构建阶段
    if (output.includes('Building for production')) {
      newProgress = Math.max(newProgress, 20)
      currentStep = '构建生产版本'
    } else if (output.includes('transforming')) {
      newProgress = Math.max(newProgress, 30)
      currentStep = '转换代码'
    } else if (output.includes('rendering chunks')) {
      newProgress = Math.max(newProgress, 50)
      currentStep = '生成代码块'
    } else if (output.includes('computing gzip size')) {
      newProgress = Math.max(newProgress, 70)
      currentStep = '计算压缩大小'
    } else if (output.includes('built in')) {
      newProgress = Math.max(newProgress, 85)
      currentStep = '构建完成'
    }

    this.updateProgress(executionId, { progress: newProgress, currentStep })
  }

  /**
   * 添加构建日志
   */
  private addBuildLog(
    executionId: string,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    source: 'stdout' | 'stderr' | 'system'
  ) {
    const progress = this.buildProgress.get(executionId)
    if (!progress) return

    const log: BuildLog = {
      timestamp: Date.now(),
      level,
      message: message.trim(),
      source
    }

    progress.logs.push(log)
    this.emit('buildLog', { executionId, log })

    // 通过WebSocket广播日志更新
    if (this.wsManager) {
      this.wsManager.broadcastBuildLog({
        executionId: progress.executionId,
        appId: progress.appId,
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        source: log.source
      })
    }
  }

  /**
   * 更新构建进度
   */
  private updateProgress(executionId: string, updates: Partial<BuildProgress>) {
    const progress = this.buildProgress.get(executionId)
    if (!progress) return

    Object.assign(progress, updates)
    this.emit('buildProgress', progress)

    // 通过WebSocket广播进度更新
    if (this.wsManager) {
      this.wsManager.broadcastBuildProgress({
        executionId: progress.executionId,
        appId: progress.appId,
        status: progress.status,
        progress: progress.progress,
        currentStep: progress.currentStep,
        startTime: progress.startTime,
        endTime: progress.endTime,
        duration: progress.duration,
        outputSize: progress.outputSize,
        error: progress.error
      })
    }
  }

  /**
   * 处理构建错误
   */
  private handleBuildError(executionId: string, error: Error) {
    this.updateProgress(executionId, {
      status: 'failed',
      currentStep: '构建失败',
      endTime: Date.now(),
      error: error.message
    })

    this.addBuildLog(executionId, 'error', error.message, 'system')
    this.emit('buildFailed', this.buildProgress.get(executionId))
  }

  /**
   * 处理队列
   */
  private processQueue() {
    if (this.buildQueue.length > 0 && this.currentBuilds < this.maxConcurrentBuilds) {
      const nextBuild = this.buildQueue.shift()!
      // 这里需要重新获取项目路径，简化处理
      this.applicationService.findById(nextBuild.appId).then(async app => {
        if (app) {
          const executionId = Array.from(this.buildProgress.keys()).find(id => 
            this.buildProgress.get(id)?.appId === nextBuild.appId && 
            this.buildProgress.get(id)?.status === 'queued'
          )
          if (executionId) {
            const projectPath = await this.resolveWorkingDirectory(app.directory, nextBuild.workingDirectory)
            this.startBuild(nextBuild, executionId, projectPath)
          }
        }
      }).catch((error) => {
        logger.error('处理构建队列失败', { appId: nextBuild.appId, error })
      })
    }
  }

  /**
   * 解析实际构建工作目录（兼容全栈项目的 frontend/client 子目录）
   */
  private async resolveWorkingDirectory(
    appDirectory: string,
    preferredWorkingDirectory?: string
  ): Promise<string> {
    if (preferredWorkingDirectory && await this.validateProjectPath(preferredWorkingDirectory)) {
      return preferredWorkingDirectory
    }

    try {
      const resolvedPath = this.buildService.resolveFrontendWorkingDirectory(appDirectory, preferredWorkingDirectory)
      if (resolvedPath && await this.validateProjectPath(resolvedPath)) {
        if (path.resolve(resolvedPath) !== path.resolve(appDirectory)) {
          logger.info('检测到前端工作目录，使用动态解析结果执行构建', {
            appDirectory,
            workingDirectory: resolvedPath
          })
        }
        return resolvedPath
      }
    } catch (error) {
      logger.warn('动态解析前端工作目录失败，回退应用根目录', {
        appDirectory,
        error
      })
    }

    return appDirectory
  }

  /**
   * 查找最近的 node_modules 所在目录（支持 workspace 依赖上移）
   */
  private async findNearestDependencyBasePath(startPath: string, stopPath?: string): Promise<string | null> {
    let current = path.resolve(startPath)
    const normalizedStop = stopPath ? path.resolve(stopPath).toLowerCase() : null

    while (true) {
      const nodeModulesPath = path.join(current, 'node_modules')
      if (await this.validateProjectPath(nodeModulesPath)) {
        return current
      }

      if (normalizedStop && current.toLowerCase() === normalizedStop) {
        break
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }

      current = parent
    }

    return null
  }

  /**
   * 检测 Yarn PnP（.pnp.cjs/.pnp.js）依赖模式
   */
  private async findNearestYarnPnpBasePath(startPath: string, stopPath?: string): Promise<string | null> {
    let current = path.resolve(startPath)
    const normalizedStop = stopPath ? path.resolve(stopPath).toLowerCase() : null

    while (true) {
      const pnpCjsPath = path.join(current, '.pnp.cjs')
      const pnpJsPath = path.join(current, '.pnp.js')

      if (await this.validateProjectPath(pnpCjsPath) || await this.validateProjectPath(pnpJsPath)) {
        return current
      }

      if (normalizedStop && current.toLowerCase() === normalizedStop) {
        break
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }

      current = parent
    }

    return null
  }

  /**
   * 验证项目路径
   */
  private async validateProjectPath(projectPath: string): Promise<boolean> {
    try {
      await fs.access(projectPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 生成执行ID
   */
  private generateExecutionId(): string {
    return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取构建进度
   */
  getBuildProgress(executionId: string): BuildProgress | undefined {
    return this.buildProgress.get(executionId)
  }

  /**
   * 获取所有构建进度
   */
  getAllBuildProgress(): BuildProgress[] {
    return Array.from(this.buildProgress.values())
  }

  /**
   * 取消构建
   */
  async cancelBuild(executionId: string): Promise<boolean> {
    const buildProcess = this.runningBuilds.get(executionId)
    if (buildProcess) {
      buildProcess.kill('SIGTERM')
      this.updateProgress(executionId, {
        status: 'cancelled',
        currentStep: '构建已取消',
        endTime: Date.now()
      })
      return true
    }
    return false
  }

  /**
   * 清理资源
   */
  private setupCleanup() {
    process.on('SIGINT', () => this.cleanup())
    process.on('SIGTERM', () => this.cleanup())
  }

  private cleanup() {
    // 终止所有运行中的构建
    for (const [executionId, process] of this.runningBuilds) {
      process.kill('SIGTERM')
    }
    this.runningBuilds.clear()
  }
}
