/**
 * Intelligent Build Service
 * 
 * 智能化前端构建检测和分析服务
 * 基于现有的技术栈检测能力，专门针对前端构建配置进行深度分析
 */

import { join, basename, relative, resolve } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { logger } from '../utils/logger'
import { ApplicationService } from '../core/ApplicationService'
import { BuildAnalysisError, BuildAnalysisErrorType, createBuildError } from './buildErrors'

export interface BuildConfiguration {
  tool: string // 构建工具：vite, webpack, next, nuxt, etc.
  script: string // 构建脚本：npm run build
  outputDir: string // 输出目录：dist, build, .next, etc.
  configFile?: string // 配置文件路径
  hasCodeSplitting: boolean // 是否有代码分割
  hasMinification: boolean // 是否有压缩
  hasSourceMap: boolean // 是否有源码映射
  customConfig?: any // 自定义配置内容
}

export interface BuildOptimization {
  type: string // 优化类型
  description: string // 优化描述
  config: any // 优化配置
  priority: 'high' | 'medium' | 'low' // 优先级
}

export interface DeploymentStrategy {
  type: 'unified' | 'static' | 'spa' | 'ssr' // 部署类型
  description: string // 策略描述
  benefits: string[] // 优势列表
  requirements?: string[] // 要求列表
}

export interface BuildStatus {
  hasBuilt: boolean           // 是否已有构建产物
  outputExists: boolean       // 输出目录是否存在
  outputDir: string           // 输出目录路径
  lastBuildTime?: number      // 上次构建时间（输出目录修改时间）
  lastBuildTimeFormatted?: string // 格式化的构建时间
  filesCount?: number         // 构建产物文件数量
  totalSize?: number          // 构建产物总大小（字节）
  totalSizeFormatted?: string // 格式化的大小
  isStale?: boolean           // 是否过时（源文件比构建产物更新）
  staleReason?: string        // 过时原因
}

export interface BuildAnalysis {
  appId: string
  buildTool: string
  buildScript: string
  outputDir: string
  workingDirectory?: string
  optimizations: BuildOptimization[]
  deploymentStrategy: DeploymentStrategy
  confidence: number // 分析置信度
  issues: string[] // 发现的问题
  analysisTime: number // 分析完成时间戳
  buildStatus?: BuildStatus // 已构建状态
}

export class IntelligentBuildService {
  private applicationService: ApplicationService
  private static analysisCache = new Map<string, { analysis: BuildAnalysis; timestamp: number }>()
  private static readonly CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

  constructor(applicationService: ApplicationService) {
    this.applicationService = applicationService
  }

  /**
   * 分析前端项目的构建配置
   */
  async analyzeFrontendBuild(appId: string): Promise<BuildAnalysis> {
    logger.info('开始分析前端构建配置', { appId })

    try {
      // 检查应用是否存在
      const app = await this.applicationService.findById(appId)
      if (!app) {
        throw createBuildError(BuildAnalysisErrorType.APP_NOT_FOUND, { appId })
      }

      const rootPath = app.directory

      // 验证路径是否存在
      if (!existsSync(rootPath)) {
        throw createBuildError(BuildAnalysisErrorType.INVALID_PATH, { 
          path: rootPath,
          appId 
        })
      }

      // 动态解析最可能的前端构建目录（支持 monorepo / workspace / 全栈）
      const pathResolution = this.resolveFrontendProjectPath(
        rootPath,
        app.fullStack?.frontendConfig?.workingDirectory
      )
      const projectPath = pathResolution.projectPath

      logger.info('前端构建目录解析结果', {
        appId,
        rootPath,
        projectPath,
        reason: pathResolution.reason,
        candidateCount: pathResolution.candidateCount
      })

      // 检测构建工具和配置
      const buildConfig = await this.detectBuildConfiguration(projectPath)
      
      // 生成优化建议
      const optimizations = this.suggestOptimizations(buildConfig, app)
      
      // 推荐部署策略
      const deploymentStrategy = this.recommendDeploymentStrategy(app, buildConfig)
      
      // 计算置信度
      const confidence = this.calculateConfidence(buildConfig, app)

      // 检测已构建状态
      const buildStatus = this.detectBuildStatus(projectPath, buildConfig.outputDir)

      const analysis: BuildAnalysis = {
        appId,
        buildTool: buildConfig.tool,
        buildScript: buildConfig.script,
        outputDir: buildConfig.outputDir,
        workingDirectory: projectPath,
        optimizations,
        deploymentStrategy,
        confidence,
        issues: this.detectIssues(buildConfig, app),
        analysisTime: Date.now(),
        buildStatus
      }

      logger.info('前端构建配置分析完成', {
        appId,
        buildTool: analysis.buildTool,
        confidence: analysis.confidence,
        hasBuilt: buildStatus.hasBuilt,
        lastBuildTime: buildStatus.lastBuildTimeFormatted
      })

      // 缓存分析结果
      IntelligentBuildService.analysisCache.set(appId, {
        analysis,
        timestamp: Date.now()
      })

      return analysis
    } catch (error) {
      // 如果已经是BuildAnalysisError，直接抛出
      if (error instanceof BuildAnalysisError) {
        logger.error('构建分析失败', { 
          appId, 
          errorType: error.type,
          message: error.userMessage 
        })
        throw error
      }

      // 其他错误转换为UNKNOWN类型
      logger.error('前端构建配置分析失败（未知错误）', { appId, error })
      throw createBuildError(BuildAnalysisErrorType.UNKNOWN, {
        originalError: error.message,
        appId
      })
    }
  }

  /**
   * 获取最近的构建分析结果
   */
  async getLatestBuildAnalysis(appId: string): Promise<BuildAnalysis | null> {
    try {
      const cached = IntelligentBuildService.analysisCache.get(appId)

      if (cached) {
        const now = Date.now()
        // 检查缓存是否过期
        if (now - cached.timestamp < IntelligentBuildService.CACHE_TTL) {
          logger.info('返回缓存的构建分析结果', { appId, cacheAge: now - cached.timestamp })
          return cached.analysis
        } else {
          // 清除过期缓存
          IntelligentBuildService.analysisCache.delete(appId)
        }
      }

      logger.info('未找到有效的缓存分析结果', { appId })
      return null
    } catch (error) {
      logger.error('获取最近构建分析结果失败', { appId, error })
      return null
    }
  }

  /**
   * 对外暴露：解析前端构建工作目录（供执行阶段复用）
   */
  resolveFrontendWorkingDirectory(appDirectory: string, preferredWorkingDirectory?: string): string {
    return this.resolveFrontendProjectPath(appDirectory, preferredWorkingDirectory).projectPath
  }

  /**
   * 动态解析前端构建目录
   * 规则：优先显式配置，其次递归扫描 package.json 并按前端特征打分
   */
  private resolveFrontendProjectPath(
    appDirectory: string,
    preferredWorkingDirectory?: string
  ): { projectPath: string; reason: string; candidateCount: number } {
    const rootPath = resolve(appDirectory)

    // 1) 优先使用显式配置
    if (preferredWorkingDirectory) {
      const preferredPath = resolve(preferredWorkingDirectory)
      if (existsSync(join(preferredPath, 'package.json'))) {
        return {
          projectPath: preferredPath,
          reason: 'preferred-working-directory',
          candidateCount: 1
        }
      }
    }

    // 根目录都不可用时直接返回
    if (!existsSync(rootPath)) {
      return {
        projectPath: appDirectory,
        reason: 'root-directory-not-found',
        candidateCount: 0
      }
    }

    // 2) 扫描候选 package.json 目录
    const candidates = this.collectPackageJsonCandidates(rootPath, 5, 200)
    const workspacePrefixes = this.extractWorkspacePrefixes(rootPath)
    const scoredCandidates = candidates
      .map((candidatePath) => this.scoreFrontendCandidate(candidatePath, rootPath, workspacePrefixes))
      .sort((a, b) => b.score - a.score)

    if (scoredCandidates.length === 0) {
      return {
        projectPath: rootPath,
        reason: 'no-package-json-candidate',
        candidateCount: 0
      }
    }

    const best = scoredCandidates[0]
    if (best.score >= 20) {
      return {
        projectPath: best.path,
        reason: `scored:${best.score}:${best.reasons.join(',')}`,
        candidateCount: candidates.length
      }
    }

    // 3) 分数不足则退回根目录（若根有 package.json）
    if (existsSync(join(rootPath, 'package.json'))) {
      return {
        projectPath: rootPath,
        reason: 'fallback-root-package-json',
        candidateCount: candidates.length
      }
    }

    // 4) 最后兜底：返回最高分候选
    return {
      projectPath: best.path,
      reason: `fallback-best-candidate:${best.score}`,
      candidateCount: candidates.length
    }
  }

  /**
   * 递归收集包含 package.json 的目录
   */
  private collectPackageJsonCandidates(
    rootPath: string,
    maxDepth = 5,
    maxCandidates = 200
  ): string[] {
    const results: string[] = []
    const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]
    const visited = new Set<string>()

    while (queue.length > 0 && results.length < maxCandidates) {
      const current = queue.shift()
      if (!current) continue

      const currentPath = current.path
      const currentDepth = current.depth
      const normalized = currentPath.toLowerCase()

      if (visited.has(normalized)) {
        continue
      }
      visited.add(normalized)

      const packageJsonPath = join(currentPath, 'package.json')
      if (existsSync(packageJsonPath)) {
        results.push(currentPath)
      }

      if (currentDepth >= maxDepth) {
        continue
      }

      try {
        const entries = readdirSync(currentPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue
          }

          if (this.shouldSkipScanDirectory(entry.name)) {
            continue
          }

          queue.push({
            path: join(currentPath, entry.name),
            depth: currentDepth + 1
          })
        }
      } catch {
        continue
      }
    }

    return results
  }

  /**
   * 目录扫描排除规则（降低噪音与性能开销）
   */
  private shouldSkipScanDirectory(dirName: string): boolean {
    const name = dirName.toLowerCase()
    const skipNames = new Set([
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      '.idea',
      '.vscode',
      'dist',
      'build',
      '.next',
      '.nuxt',
      '.cache',
      'coverage',
      'logs',
      'log',
      'tmp',
      '.tmp',
      'backups'
    ])

    if (skipNames.has(name)) {
      return true
    }

    // 跳过隐藏目录（但允许 .config 这类必要目录可按需扩展）
    if (name.startsWith('.')) {
      return true
    }

    return false
  }

  /**
   * 为候选目录计算前端构建相关分数
   */
  private scoreFrontendCandidate(
    candidatePath: string,
    rootPath: string,
    workspacePrefixes: string[]
  ): { path: string; score: number; reasons: string[] } {
    let score = 0
    const reasons: string[] = []

    const packageJson = this.readPackageJsonSafe(join(candidatePath, 'package.json'))
    if (!packageJson) {
      return { path: candidatePath, score: -100, reasons: ['invalid-package-json'] }
    }

    const scripts = packageJson.scripts || {}
    const dependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    } as Record<string, string>
    const depNames = Object.keys(dependencies)
    const relativePath = relative(rootPath, candidatePath).replace(/\\/g, '/')

    const frontendDeps = [
      'vue', '@vue/runtime-core', '@vue/cli-service',
      'react', 'react-dom', 'react-scripts',
      'next', 'nuxt',
      '@angular/core', '@angular/cli',
      'svelte', 'solid-js',
      'vite', '@vitejs/plugin-vue', '@vitejs/plugin-react'
    ]
    const bundlerDeps = ['vite', 'webpack', 'rollup', 'parcel', 'esbuild']
    const backendDeps = ['express', 'koa', 'fastify', 'nestjs', '@nestjs/core', 'hapi']

    const frontendDepCount = frontendDeps.filter(dep => depNames.includes(dep)).length
    const bundlerDepCount = bundlerDeps.filter(dep => depNames.includes(dep)).length
    const backendDepCount = backendDeps.filter(dep => depNames.includes(dep)).length

    if (typeof scripts.build === 'string' && scripts.build.trim()) {
      score += 35
      reasons.push('has-build-script')
    }

    const hasBuildVariant = Object.keys(scripts).some(name => name.startsWith('build:'))
    if (hasBuildVariant) {
      score += 12
      reasons.push('has-build-variant')
    }

    if (frontendDepCount > 0) {
      score += 40 + Math.min(15, frontendDepCount * 3)
      reasons.push(`frontend-deps:${frontendDepCount}`)
    }

    if (bundlerDepCount > 0) {
      score += 12
      reasons.push(`bundler-deps:${bundlerDepCount}`)
    }

    const hasFrontendConfig = [
      'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
      'next.config.js', 'next.config.mjs', 'next.config.ts',
      'nuxt.config.ts', 'nuxt.config.js',
      'webpack.config.js', 'rollup.config.js'
    ].some(file => existsSync(join(candidatePath, file)))

    if (hasFrontendConfig) {
      score += 10
      reasons.push('has-frontend-config')
    }

    const hasFrontendSource = ['src', 'pages', 'app', 'components']
      .some(dir => existsSync(join(candidatePath, dir)))
    if (hasFrontendSource) {
      score += 8
      reasons.push('has-frontend-source')
    }

    if (existsSync(join(candidatePath, 'node_modules'))) {
      score += 8
      reasons.push('has-local-node_modules')
    }

    if (relativePath && /(frontend|client|web|ui|portal|apps|packages)/i.test(relativePath)) {
      score += 6
      reasons.push('frontend-like-path')
    }

    if (workspacePrefixes.some(prefix => relativePath.startsWith(prefix))) {
      score += 8
      reasons.push('matches-workspace-pattern')
    }

    const isRootCandidate = resolve(candidatePath) === resolve(rootPath)
    if (isRootCandidate && workspacePrefixes.length > 0) {
      score -= 8
      reasons.push('workspace-root-penalty')
    }

    if (backendDepCount > 0 && frontendDepCount === 0) {
      score -= 25
      reasons.push('backend-only-penalty')
    }

    if (this.hasWorkspaceDeclaration(packageJson) && !scripts.build && frontendDepCount === 0) {
      score -= 20
      reasons.push('workspace-aggregator-penalty')
    }

    return { path: candidatePath, score, reasons }
  }

  private readPackageJsonSafe(packageJsonPath: string): any | null {
    try {
      return JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    } catch {
      return null
    }
  }

  private hasWorkspaceDeclaration(packageJson: any): boolean {
    const workspaces = packageJson?.workspaces
    return Array.isArray(workspaces) || Array.isArray(workspaces?.packages)
  }

  /**
   * 提取 workspace 路径前缀，用于候选目录打分
   */
  private extractWorkspacePrefixes(rootPath: string): string[] {
    const packageJson = this.readPackageJsonSafe(join(rootPath, 'package.json'))
    if (!packageJson) {
      return []
    }

    let patterns: string[] = []
    if (Array.isArray(packageJson.workspaces)) {
      patterns = packageJson.workspaces
    } else if (Array.isArray(packageJson.workspaces?.packages)) {
      patterns = packageJson.workspaces.packages
    }

    return patterns
      .map((pattern: string) => String(pattern).replace(/\\/g, '/').trim())
      .map((pattern: string) => pattern.replace(/\/\*\*?$/, '').replace(/\*.*$/, ''))
      .filter((pattern: string) => pattern.length > 0)
  }

  /**
   * 检测构建配置
   */
  private async detectBuildConfiguration(projectPath: string): Promise<BuildConfiguration> {
    const packageJsonPath = join(projectPath, 'package.json')
    
    // 检查 package.json 是否存在
    if (!existsSync(packageJsonPath)) {
      throw createBuildError(BuildAnalysisErrorType.NO_PACKAGE_JSON, { 
        path: packageJsonPath,
        projectPath 
      })
    }

    let packageJson: any
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    } catch (error) {
      throw createBuildError(BuildAnalysisErrorType.INVALID_CONFIG, {
        file: 'package.json',
        error: error.message,
        projectPath
      })
    }

    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
    const scripts = packageJson.scripts || {}

    // 检测构建工具
    const buildTool = this.detectBuildTool(dependencies, projectPath)
    
    // 如果没有检测到构建工具
    if (!buildTool || buildTool === 'Unknown') {
      throw createBuildError(BuildAnalysisErrorType.NO_BUILD_TOOL, {
        dependencies: Object.keys(dependencies),
        projectPath
      })
    }
    
    // 检测构建脚本
    const buildScript = this.detectBuildScript(scripts, buildTool)
    
    // 检测输出目录
    const outputDir = this.detectOutputDirectory(projectPath, buildTool, packageJson)
    
    // 检测配置文件
    const configFile = this.detectConfigFile(projectPath, buildTool)
    
    // 分析构建特性
    const features = await this.analyzeBuildFeatures(projectPath, buildTool, configFile)

    return {
      tool: buildTool,
      script: buildScript,
      outputDir,
      configFile,
      ...features
    }
  }

  /**
   * 检测构建工具
   */
  private detectBuildTool(dependencies: Record<string, string>, projectPath: string): string {
    // Next.js 检测
    if (dependencies.next) {
      return 'Next.js'
    }
    
    // Nuxt.js 检测
    if (dependencies.nuxt) {
      return 'Nuxt.js'
    }
    
    // Vite 检测
    if (dependencies.vite || dependencies['@vitejs/plugin-vue'] || dependencies['@vitejs/plugin-react']) {
      return 'Vite'
    }
    
    // Create React App 检测
    if (dependencies['react-scripts']) {
      return 'Create React App'
    }
    
    // Vue CLI 检测
    if (dependencies['@vue/cli-service']) {
      return 'Vue CLI'
    }
    
    // Angular CLI 检测
    if (existsSync(join(projectPath, 'angular.json'))) {
      return 'Angular CLI'
    }
    
    // Webpack 检测
    if (dependencies.webpack || existsSync(join(projectPath, 'webpack.config.js'))) {
      return 'Webpack'
    }
    
    // Rollup 检测
    if (dependencies.rollup || existsSync(join(projectPath, 'rollup.config.js'))) {
      return 'Rollup'
    }
    
    // Parcel 检测
    if (dependencies.parcel) {
      return 'Parcel'
    }

    return 'Unknown'
  }

  /**
   * 检测构建脚本
   */
  private detectBuildScript(scripts: Record<string, string>, buildTool: string): string {
    // 优先检查标准的 build 脚本
    if (scripts.build) {
      return 'npm run build'
    }
    
    // 检查其他可能的构建脚本
    const buildScriptNames = ['build:prod', 'build:production', 'compile', 'bundle']
    
    for (const scriptName of buildScriptNames) {
      if (scripts[scriptName]) {
        return `npm run ${scriptName}`
      }
    }
    
    // 根据构建工具推断默认脚本
    switch (buildTool) {
      case 'Next.js':
        return 'npm run build'
      case 'Nuxt.js':
        return 'npm run build'
      case 'Vite':
        return 'npm run build'
      case 'Create React App':
        return 'npm run build'
      case 'Vue CLI':
        return 'npm run build'
      case 'Angular CLI':
        return 'npm run build'
      default:
        return 'npm run build'
    }
  }

  /**
   * 检测输出目录
   */
  private detectOutputDirectory(projectPath: string, buildTool: string, packageJson: any): string {
    // 根据构建工具的默认输出目录
    const defaultOutputDirs: Record<string, string> = {
      'Next.js': '.next',
      'Nuxt.js': '.nuxt',
      'Vite': 'dist',
      'Create React App': 'build',
      'Vue CLI': 'dist',
      'Angular CLI': 'dist',
      'Webpack': 'dist',
      'Rollup': 'dist',
      'Parcel': 'dist'
    }

    const defaultDir = defaultOutputDirs[buildTool] || 'dist'
    
    // 检查是否存在自定义输出目录配置
    // 这里可以进一步解析配置文件来获取准确的输出目录
    
    return defaultDir
  }

  /**
   * 检测配置文件
   */
  private detectConfigFile(projectPath: string, buildTool: string): string | undefined {
    const configFiles: Record<string, string[]> = {
      'Next.js': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      'Nuxt.js': ['nuxt.config.js', 'nuxt.config.ts'],
      'Vite': ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
      'Vue CLI': ['vue.config.js'],
      'Angular CLI': ['angular.json'],
      'Webpack': ['webpack.config.js', 'webpack.config.ts'],
      'Rollup': ['rollup.config.js', 'rollup.config.ts']
    }

    const possibleConfigs = configFiles[buildTool] || []
    
    for (const configFile of possibleConfigs) {
      const configPath = join(projectPath, configFile)
      if (existsSync(configPath)) {
        return configFile
      }
    }

    return undefined
  }

  /**
   * 分析构建特性
   */
  private async analyzeBuildFeatures(
    projectPath: string, 
    buildTool: string, 
    configFile?: string
  ): Promise<{
    hasCodeSplitting: boolean
    hasMinification: boolean
    hasSourceMap: boolean
    customConfig?: any
  }> {
    let hasCodeSplitting = false
    let hasMinification = false
    let hasSourceMap = false
    let customConfig: any = undefined

    // 根据构建工具的默认特性
    switch (buildTool) {
      case 'Next.js':
      case 'Nuxt.js':
      case 'Vite':
      case 'Create React App':
      case 'Vue CLI':
      case 'Angular CLI':
        hasCodeSplitting = true
        hasMinification = true
        hasSourceMap = true
        break
    }

    // 如果有配置文件，尝试解析具体配置
    if (configFile) {
      try {
        const configPath = join(projectPath, configFile)
        const configContent = readFileSync(configPath, 'utf-8')
        
        // 简单的配置解析（可以进一步完善）
        if (configContent.includes('splitChunks') || configContent.includes('manualChunks')) {
          hasCodeSplitting = true
        }
        
        if (configContent.includes('minify') || configContent.includes('terser')) {
          hasMinification = true
        }
        
        if (configContent.includes('sourcemap') || configContent.includes('sourceMap')) {
          hasSourceMap = true
        }

        // 尝试解析配置内容（仅支持简单的 JSON 格式）
        if (configFile.endsWith('.json')) {
          try {
            customConfig = JSON.parse(configContent)
          } catch {
            // 忽略解析错误
          }
        }
      } catch (error) {
        logger.warn('配置文件解析失败', { configFile, error })
      }
    }

    return {
      hasCodeSplitting,
      hasMinification,
      hasSourceMap,
      customConfig
    }
  }

  /**
   * 生成优化建议
   */
  private suggestOptimizations(buildConfig: BuildConfiguration, app: any): BuildOptimization[] {
    const optimizations: BuildOptimization[] = []

    // 代码分割优化
    if (!buildConfig.hasCodeSplitting && buildConfig.tool === 'Vite') {
      optimizations.push({
        type: 'code-splitting',
        description: '启用智能代码分割以减少初始包大小',
        priority: 'high',
        config: {
          rollupOptions: {
            output: {
              manualChunks: {
                vendor: ['vue', 'react', 'vue-router', 'react-router-dom'],
                utils: ['axios', 'lodash']
              }
            }
          }
        }
      })
    }

    // 压缩优化
    if (!buildConfig.hasMinification) {
      optimizations.push({
        type: 'minification',
        description: '启用代码压缩以减少文件大小',
        priority: 'high',
        config: {
          minify: 'terser',
          terserOptions: {
            compress: {
              drop_console: true,
              drop_debugger: true
            }
          }
        }
      })
    }

    // 源码映射优化
    if (!buildConfig.hasSourceMap) {
      optimizations.push({
        type: 'sourcemap',
        description: '启用源码映射以便于调试',
        priority: 'medium',
        config: {
          sourcemap: true
        }
      })
    }

    // 缓存优化
    optimizations.push({
      type: 'caching',
      description: '优化缓存策略以提升加载性能',
      priority: 'medium',
      config: {
        cacheDir: 'node_modules/.vite',
        build: {
          rollupOptions: {
            output: {
              chunkFileNames: 'assets/[name]-[hash].js',
              entryFileNames: 'assets/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash].[ext]'
            }
          }
        }
      }
    })

    return optimizations
  }

  /**
   * 推荐部署策略
   */
  private recommendDeploymentStrategy(app: any, buildConfig: BuildConfiguration): DeploymentStrategy {
    // 如果是全栈项目，推荐统一部署
    if (app.fullStack?.isFullStack) {
      return {
        type: 'unified',
        description: '前端构建后与后端统一部署，使用单一进程提供服务',
        benefits: [
          '减少进程数量，节省资源',
          '简化端口管理',
          '提升性能，减少网络跳转',
          '统一日志和监控'
        ],
        requirements: [
          '后端需要支持静态文件服务',
          '需要配置 SPA 路由回退'
        ]
      }
    }

    // SSR 框架推荐 SSR 部署
    if (buildConfig.tool === 'Next.js' || buildConfig.tool === 'Nuxt.js') {
      return {
        type: 'ssr',
        description: '使用服务端渲染部署，提供更好的 SEO 和首屏性能',
        benefits: [
          '更好的 SEO 支持',
          '更快的首屏加载',
          '更好的用户体验'
        ],
        requirements: [
          '需要 Node.js 运行环境',
          '需要配置服务端渲染'
        ]
      }
    }

    // SPA 应用推荐静态部署
    return {
      type: 'spa',
      description: '构建为单页应用静态文件，使用 CDN 或静态服务器部署',
      benefits: [
        '更快的加载速度',
        '更低的服务器成本',
        '更好的缓存策略',
        '更高的可用性'
      ],
      requirements: [
        '需要配置路由回退',
        '需要处理 API 跨域问题'
      ]
    }
  }

  /**
   * 计算分析置信度
   */
  private calculateConfidence(buildConfig: BuildConfiguration, app: any): number {
    let confidence = 0.5 // 基础分数

    // 构建工具识别准确性
    if (buildConfig.tool !== 'Unknown') {
      confidence += 0.3
    }

    // 配置文件存在性
    if (buildConfig.configFile) {
      confidence += 0.1
    }

    // 构建脚本存在性
    if (buildConfig.script !== 'npm run build' || buildConfig.script) {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * 检测潜在问题
   */
  private detectIssues(buildConfig: BuildConfiguration, app: any): string[] {
    const issues: string[] = []

    if (buildConfig.tool === 'Unknown') {
      issues.push('无法识别构建工具，可能需要手动配置')
    }

    if (!buildConfig.configFile) {
      issues.push('未找到构建配置文件，将使用默认配置')
    }

    if (!buildConfig.hasCodeSplitting) {
      issues.push('未启用代码分割，可能导致初始包过大')
    }

    if (!buildConfig.hasMinification) {
      issues.push('未启用代码压缩，生产环境文件可能过大')
    }

    return issues
  }

  /**
   * 检查应用是否为前端项目
   */
  async isFrontendProject(appId: string): Promise<boolean> {
    try {
      const app = await this.applicationService.findById(appId)
      const frontendStacks = ['React', 'Vue', 'Angular', 'Next.js', 'Nuxt.js', 'Vite', 'Svelte']

      // 处理不同的techStack格式
      let techStackToCheck: string = ''

      if (typeof app.techStack === 'string') {
        techStackToCheck = app.techStack
      } else if (Array.isArray(app.techStack)) {
        techStackToCheck = app.techStack.join(' ')
      } else if (app.techStack && typeof app.techStack === 'object') {
        // 处理对象格式的techStack
        if (app.techStack.name) {
          techStackToCheck = app.techStack.name
        }
        if (app.techStack.category) {
          techStackToCheck += ' ' + app.techStack.category
        }
      }

      // 检查是否为全栈项目
      if (app.fullStack?.isFullStack) {
        logger.info('检测到全栈项目，支持前端构建', { appId, techStack: techStackToCheck })
        return true
      }

      // 检查技术栈是否包含前端框架
      const isFrontend = frontendStacks.some(stack =>
        techStackToCheck.toLowerCase().includes(stack.toLowerCase())
      )

      logger.info('前端项目检查结果', {
        appId,
        techStack: techStackToCheck,
        isFrontend,
        isFullStack: app.fullStack?.isFullStack || false
      })

      return isFrontend
    } catch (error) {
      logger.error('检查前端项目失败', { appId, error })
      return false
    }
  }

  /**
   * 检测已构建状态
   */
  private detectBuildStatus(projectPath: string, outputDir: string): BuildStatus {
    const outputPath = join(projectPath, outputDir)
    
    const status: BuildStatus = {
      hasBuilt: false,
      outputExists: false,
      outputDir: outputPath
    }

    try {
      if (!existsSync(outputPath)) {
        return status
      }

      status.outputExists = true

      // 获取输出目录信息
      const outputStat = statSync(outputPath)
      status.lastBuildTime = outputStat.mtimeMs
      status.lastBuildTimeFormatted = this.formatDateTime(outputStat.mtime)

      // 递归计算文件数量和大小
      const { count, size } = this.calculateDirStats(outputPath)
      status.filesCount = count
      status.totalSize = size
      status.totalSizeFormatted = this.formatFileSize(size)

      // 判断是否有有效的构建产物
      status.hasBuilt = count > 0 && this.hasValidBuildArtifacts(outputPath)

      // 检测是否过时（源文件比构建产物更新）
      if (status.hasBuilt) {
        const staleCheck = this.checkIfStale(projectPath, outputPath, outputStat.mtimeMs)
        status.isStale = staleCheck.isStale
        status.staleReason = staleCheck.reason
      }

      logger.info('构建状态检测完成', {
        outputPath,
        hasBuilt: status.hasBuilt,
        filesCount: status.filesCount,
        totalSize: status.totalSizeFormatted,
        isStale: status.isStale
      })

      return status
    } catch (error) {
      logger.warn('检测构建状态失败', { outputPath, error })
      return status
    }
  }

  /**
   * 检查是否有有效的构建产物
   */
  private hasValidBuildArtifacts(outputPath: string): boolean {
    try {
      const files = readdirSync(outputPath)
      
      // 检查是否有 index.html（SPA/MPA）
      if (files.includes('index.html')) return true
      
      // 检查是否有 JS/CSS 文件
      const hasJsOrCss = files.some(f => 
        f.endsWith('.js') || f.endsWith('.css') || 
        f === 'assets' || f === 'static' || f === '_next'
      )
      
      return hasJsOrCss
    } catch {
      return false
    }
  }

  /**
   * 检查构建是否过时
   */
  private checkIfStale(projectPath: string, outputPath: string, buildTime: number): { isStale: boolean; reason?: string } {
    try {
      // 检查关键源文件是否比构建产物更新
      const sourceFiles = [
        'package.json',
        'src',
        'pages',
        'app',
        'components',
        'vite.config.ts',
        'vite.config.js',
        'next.config.js',
        'nuxt.config.ts',
        'webpack.config.js'
      ]

      for (const file of sourceFiles) {
        const filePath = join(projectPath, file)
        if (existsSync(filePath)) {
          const stat = statSync(filePath)
          if (stat.mtimeMs > buildTime) {
            return {
              isStale: true,
              reason: `${file} 已更新（${this.formatDateTime(stat.mtime)}）`
            }
          }
        }
      }

      // 检查 src 目录下的文件
      const srcPath = join(projectPath, 'src')
      if (existsSync(srcPath)) {
        const latestSrcTime = this.getLatestModTime(srcPath)
        if (latestSrcTime > buildTime) {
          return {
            isStale: true,
            reason: `源代码已更新`
          }
        }
      }

      return { isStale: false }
    } catch {
      return { isStale: false }
    }
  }

  /**
   * 获取目录中最新的修改时间
   */
  private getLatestModTime(dirPath: string, depth = 3): number {
    if (depth <= 0) return 0
    
    try {
      let latest = 0
      const entries = readdirSync(dirPath)
      
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue
        
        const entryPath = join(dirPath, entry)
        try {
          const stat = statSync(entryPath)
          if (stat.isFile()) {
            latest = Math.max(latest, stat.mtimeMs)
          } else if (stat.isDirectory()) {
            latest = Math.max(latest, this.getLatestModTime(entryPath, depth - 1))
          }
        } catch {
          continue
        }
      }
      
      return latest
    } catch {
      return 0
    }
  }

  /**
   * 计算目录统计信息
   */
  private calculateDirStats(dirPath: string): { count: number; size: number } {
    let count = 0
    let size = 0

    try {
      const entries = readdirSync(dirPath)
      
      for (const entry of entries) {
        const entryPath = join(dirPath, entry)
        try {
          const stat = statSync(entryPath)
          if (stat.isFile()) {
            count++
            size += stat.size
          } else if (stat.isDirectory()) {
            const subStats = this.calculateDirStats(entryPath)
            count += subStats.count
            size += subStats.size
          }
        } catch {
          continue
        }
      }
    } catch {
      // ignore
    }

    return { count, size }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  /**
   * 格式化日期时间
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  /**
   * 获取支持的构建工具列表
   */
  getSupportedBuildTools(): string[] {
    return [
      'Next.js',
      'Nuxt.js',
      'Vite',
      'Create React App',
      'Vue CLI',
      'Angular CLI',
      'Webpack',
      'Rollup',
      'Parcel'
    ]
  }
}
