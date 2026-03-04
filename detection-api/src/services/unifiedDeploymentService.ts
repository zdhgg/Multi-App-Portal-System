/**
 * Unified Deployment Service - 统一部署服务
 * 
 * 核心功能：
 * 1. 构建前端项目
 * 2. 将构建产物部署到后端静态目录
 * 3. 更新 PM2 配置（仅保留后端进程）
 * 4. 重启后端服务
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { logger } from '../utils/logger.js'
import { ApplicationService } from '../core/ApplicationService.js'
import { IntelligentBuildService, BuildAnalysis } from './intelligentBuildService.js'
import { PM2ConfigOptimizer } from './pm2ConfigOptimizer.js'
import { EventEmitter } from 'events'

export interface UnifiedDeploymentOptions {
  appId: string
  buildScript?: string
  cleanBuild?: boolean
  staticDir?: string  // 后端静态文件目录，默认 'public'
  backupOld?: boolean // 是否备份旧的静态文件
}

export interface DeploymentProgress {
  appId: string
  deploymentId: string
  status: 'preparing' | 'building' | 'deploying' | 'configuring' | 'restarting' | 'success' | 'failed' | 'cancelled'
  progress: number  // 0-100
  currentStep: string
  startTime: number
  endTime?: number
  duration?: number
  error?: string
  buildOutput?: string
  staticFilesCount?: number
  staticFilesSize?: number
}

export interface DeploymentResult {
  success: boolean
  deploymentId: string
  duration: number
  staticFilesPath: string
  pm2ConfigPath?: string
  backupPath?: string
  message: string
}

export class UnifiedDeploymentService extends EventEmitter {
  private deployments = new Map<string, DeploymentProgress>()
  private runningProcesses = new Map<string, ChildProcess>()

  constructor(
    private applicationService: ApplicationService,
    private buildService: IntelligentBuildService,
    private pm2ConfigOptimizer?: PM2ConfigOptimizer
  ) {
    super()
  }

  /**
   * 执行统一部署
   */
  async deploy(options: UnifiedDeploymentOptions): Promise<string> {
    const deploymentId = this.generateDeploymentId()
    
    // 验证应用
    const app = await this.applicationService.findById(options.appId)
    if (!app) {
      throw new Error(`应用 ${options.appId} 不存在`)
    }

    // 初始化部署进度
    const progress: DeploymentProgress = {
      appId: options.appId,
      deploymentId,
      status: 'preparing',
      progress: 0,
      currentStep: '准备部署环境',
      startTime: Date.now()
    }

    this.deployments.set(deploymentId, progress)
    this.emit('deployment:start', progress)

    // 异步执行部署流程
    this.executeDeployment(options, deploymentId, app).catch(error => {
      this.handleDeploymentError(deploymentId, error)
    })

    return deploymentId
  }

  /**
   * 执行完整的部署流程
   */
  private async executeDeployment(
    options: UnifiedDeploymentOptions,
    deploymentId: string,
    app: any
  ): Promise<void> {
    const projectPath = app.directory
    const staticDir = options.staticDir || 'public'

    try {
      // Step 1: 获取构建分析 (5%)
      this.updateProgress(deploymentId, {
        status: 'preparing',
        progress: 5,
        currentStep: '分析构建配置'
      })

      const analysis = await this.buildService.analyzeFrontendBuild(options.appId)

      // Step 2: 确定前端和后端路径
      const frontendPath = this.determineFrontendPath(app, analysis)
      const backendPath = this.determineBackendPath(app)
      const targetStaticPath = path.join(backendPath, staticDir)

      logger.info('统一部署路径配置', {
        frontendPath,
        backendPath,
        targetStaticPath,
        outputDir: analysis.outputDir
      })

      // Step 3: 执行构建 (10% - 60%)
      this.updateProgress(deploymentId, {
        status: 'building',
        progress: 10,
        currentStep: '执行前端构建'
      })

      const buildResult = await this.executeBuild(
        frontendPath,
        options.buildScript || analysis.buildScript,
        deploymentId
      )

      // Step 4: 验证构建产物 (65%)
      this.updateProgress(deploymentId, {
        status: 'deploying',
        progress: 65,
        currentStep: '验证构建产物'
      })

      const buildOutputPath = path.join(frontendPath, analysis.outputDir)
      if (!existsSync(buildOutputPath)) {
        throw new Error(`构建产物目录不存在: ${buildOutputPath}`)
      }

      // Step 5: 备份旧静态文件 (70%)
      let backupPath: string | undefined
      if (options.backupOld && existsSync(targetStaticPath)) {
        this.updateProgress(deploymentId, {
          progress: 70,
          currentStep: '备份旧静态文件'
        })
        backupPath = await this.backupStaticFiles(targetStaticPath)
      }

      // Step 6: 部署静态文件 (75%)
      this.updateProgress(deploymentId, {
        progress: 75,
        currentStep: '部署静态文件'
      })

      const { count, size } = await this.copyStaticFiles(buildOutputPath, targetStaticPath)

      this.updateProgress(deploymentId, {
        staticFilesCount: count,
        staticFilesSize: size
      })

      // Step 7: 更新 PM2 配置 (85%)
      let pm2ConfigPath: string | undefined
      if (this.pm2ConfigOptimizer) {
        this.updateProgress(deploymentId, {
          status: 'configuring',
          progress: 85,
          currentStep: '更新 PM2 配置'
        })

        pm2ConfigPath = await this.updatePM2Config(app, analysis, staticDir)
      }

      // Step 8: 完成 (100%)
      const endTime = Date.now()
      this.updateProgress(deploymentId, {
        status: 'success',
        progress: 100,
        currentStep: '部署完成',
        endTime,
        duration: endTime - this.deployments.get(deploymentId)!.startTime
      })

      this.emit('deployment:complete', {
        deploymentId,
        success: true,
        staticFilesPath: targetStaticPath,
        pm2ConfigPath,
        backupPath
      })

      logger.info('统一部署完成', {
        deploymentId,
        appId: options.appId,
        staticFilesCount: count,
        staticFilesSize: this.formatFileSize(size)
      })

    } catch (error) {
      throw error
    }
  }

  /**
   * 执行构建命令
   */
  private async executeBuild(
    projectPath: string,
    buildScript: string,
    deploymentId: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const [command, ...args] = this.parseBuildScript(buildScript)
      
      logger.info('执行构建命令', { projectPath, command, args })

      const buildProcess = spawn(command, args, {
        cwd: projectPath,
        shell: true,
        windowsHide: true,  // 隐藏Windows下的CMD窗口
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      })

      this.runningProcesses.set(deploymentId, buildProcess)

      let stdout = ''
      let stderr = ''
      let lastProgress = 10

      buildProcess.stdout?.on('data', (data) => {
        const message = data.toString()
        stdout += message
        
        // 更新进度
        lastProgress = Math.min(lastProgress + 2, 55)
        this.updateProgress(deploymentId, {
          progress: lastProgress,
          currentStep: '构建中: ' + message.trim().substring(0, 50)
        })
      })

      buildProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      buildProcess.on('close', (code) => {
        this.runningProcesses.delete(deploymentId)

        if (code === 0) {
          this.updateProgress(deploymentId, {
            progress: 60,
            currentStep: '构建完成',
            buildOutput: stdout
          })
          resolve(stdout)
        } else {
          reject(new Error(`构建失败 (exit code: ${code})\n${stderr}`))
        }
      })

      buildProcess.on('error', (error) => {
        this.runningProcesses.delete(deploymentId)
        reject(error)
      })
    })
  }

  /**
   * 备份旧静态文件
   */
  private async backupStaticFiles(staticPath: string): Promise<string> {
    const backupPath = `${staticPath}_backup_${Date.now()}`
    await fs.rename(staticPath, backupPath)
    logger.info('已备份旧静态文件', { from: staticPath, to: backupPath })
    return backupPath
  }

  /**
   * 复制静态文件
   */
  private async copyStaticFiles(
    sourcePath: string,
    targetPath: string
  ): Promise<{ count: number; size: number }> {
    // 确保目标目录存在
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true })
    }

    let count = 0
    let size = 0

    const copyRecursive = (src: string, dest: string) => {
      const entries = readdirSync(src)

      for (const entry of entries) {
        const srcPath = path.join(src, entry)
        const destPath = path.join(dest, entry)
        const stat = statSync(srcPath)

        if (stat.isDirectory()) {
          if (!existsSync(destPath)) {
            mkdirSync(destPath, { recursive: true })
          }
          copyRecursive(srcPath, destPath)
        } else {
          copyFileSync(srcPath, destPath)
          count++
          size += stat.size
        }
      }
    }

    copyRecursive(sourcePath, targetPath)

    logger.info('静态文件复制完成', {
      count,
      size: this.formatFileSize(size),
      from: sourcePath,
      to: targetPath
    })

    return { count, size }
  }

  /**
   * 更新 PM2 配置
   */
  private async updatePM2Config(
    app: any,
    analysis: BuildAnalysis,
    staticDir: string
  ): Promise<string> {
    // 生成只包含后端的 PM2 配置
    const pm2Config = {
      apps: [{
        name: `${app.name}-backend`,
        script: this.detectBackendScript(app),
        cwd: this.determineBackendPath(app),
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          SERVE_STATIC: 'true',
          STATIC_DIR: `./${staticDir}`
        },
        watch: false,
        max_memory_restart: '500M'
      }]
    }

    const configPath = path.join(app.directory, 'ecosystem.unified.config.js')
    const configContent = `module.exports = ${JSON.stringify(pm2Config, null, 2)}`
    
    await fs.writeFile(configPath, configContent, 'utf-8')
    
    logger.info('PM2 配置已更新', { configPath })
    return configPath
  }

  /**
   * 确定前端路径
   */
  private determineFrontendPath(app: any, analysis: BuildAnalysis): string {
    // 如果是全栈项目，返回前端子目录
    if (app.fullStack?.isFullStack && app.fullStack?.frontendConfig?.workingDirectory) {
      return app.fullStack.frontendConfig.workingDirectory
    }

    // 检查常见的前端目录
    const frontendDirs = ['frontend', 'client', 'web', 'ui', 'app-ui', 'portal']
    for (const dir of frontendDirs) {
      const frontendPath = path.join(app.directory, dir)
      if (existsSync(path.join(frontendPath, 'package.json'))) {
        return frontendPath
      }
    }

    // 默认返回项目根目录
    return app.directory
  }

  /**
   * 确定后端路径
   */
  private determineBackendPath(app: any): string {
    // 如果是全栈项目，返回后端子目录
    if (app.fullStack?.isFullStack && app.fullStack?.backendConfig?.workingDirectory) {
      return app.fullStack.backendConfig.workingDirectory
    }

    // 检查常见的后端目录
    const backendDirs = ['backend', 'server', 'api', 'app-server']
    for (const dir of backendDirs) {
      const backendPath = path.join(app.directory, dir)
      if (existsSync(path.join(backendPath, 'package.json'))) {
        return backendPath
      }
    }

    // 默认返回项目根目录
    return app.directory
  }

  /**
   * 检测后端启动脚本
   */
  private detectBackendScript(app: any): string {
    const backendPath = this.determineBackendPath(app)
    const packageJsonPath = path.join(backendPath, 'package.json')

    try {
      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf-8'))
      const scripts = packageJson.scripts || {}

      // 按优先级检查启动脚本
      if (scripts.start) return 'npm start'
      if (scripts.serve) return 'npm run serve'
      if (scripts.server) return 'npm run server'

      // 检查 main 字段
      if (packageJson.main) return `node ${packageJson.main}`

      return 'npm start'
    } catch {
      return 'npm start'
    }
  }

  /**
   * 解析构建脚本
   */
  private parseBuildScript(script: string): string[] {
    // 处理 npm run xxx 格式
    if (script.startsWith('npm run ')) {
      return ['npm', 'run', script.replace('npm run ', '')]
    }
    if (script.startsWith('npm ')) {
      return ['npm', ...script.replace('npm ', '').split(' ')]
    }
    if (script.startsWith('yarn ')) {
      return ['yarn', ...script.replace('yarn ', '').split(' ')]
    }
    if (script.startsWith('pnpm ')) {
      return ['pnpm', ...script.replace('pnpm ', '').split(' ')]
    }

    return script.split(' ')
  }

  /**
   * 更新部署进度
   */
  private updateProgress(deploymentId: string, update: Partial<DeploymentProgress>) {
    const progress = this.deployments.get(deploymentId)
    if (progress) {
      Object.assign(progress, update)
      this.emit('deployment:progress', progress)
    }
  }

  /**
   * 处理部署错误
   */
  private handleDeploymentError(deploymentId: string, error: Error) {
    const endTime = Date.now()
    const progress = this.deployments.get(deploymentId)
    
    this.updateProgress(deploymentId, {
      status: 'failed',
      currentStep: '部署失败',
      error: error.message,
      endTime,
      duration: progress ? endTime - progress.startTime : 0
    })

    this.emit('deployment:error', {
      deploymentId,
      error: error.message
    })

    logger.error('统一部署失败', {
      deploymentId,
      error: error.message
    })
  }

  /**
   * 获取部署进度
   */
  getProgress(deploymentId: string): DeploymentProgress | undefined {
    return this.deployments.get(deploymentId)
  }

  /**
   * 取消部署
   */
  async cancelDeployment(deploymentId: string): Promise<boolean> {
    const process = this.runningProcesses.get(deploymentId)
    if (process) {
      process.kill('SIGTERM')
      this.updateProgress(deploymentId, {
        status: 'cancelled',
        currentStep: '部署已取消'
      })
      return true
    }
    return false
  }

  /**
   * 生成部署 ID
   */
  private generateDeploymentId(): string {
    return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }
}
