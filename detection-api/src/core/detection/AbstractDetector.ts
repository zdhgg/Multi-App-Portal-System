/**
 * 抽象检测器基类
 * 
 * 提供所有检测器的通用功能和模板方法，减少代码重复。
 * 实现了模板方法模式和策略模式。
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { readdir } from 'fs/promises'
import { join, basename } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'
import { CacheManager, DetectionCacheOptions } from '../cache'
import type {
  IDetector,
  UnifiedDetectionResult,
  DetectionFeatures,
  DetectionMetadata,
  DetectionOptions,
  TechStackAnalysisResult
} from './IDetector'
import type { DetectionIssue } from '../types'
import {
  DetectionError,
  ErrorCode,
  createDirectoryNotFoundError,
  createDetectionFailedError,
  withErrorHandling,
  asyncErrorHandler
} from '../errors'

// =============================================================================
// 抽象检测器基类
// =============================================================================

export abstract class AbstractDetector implements IDetector {
  public abstract readonly name: string
  public abstract readonly version: string
  public abstract readonly supportedTypes: readonly string[]

  protected cacheManager?: CacheManager
  protected cacheOptions: DetectionCacheOptions = {
    enableFileTimeCheck: true,
    ttl: 1800 // 30分钟默认缓存时间
  }

  // =============================================================================
  // 缓存管理
  // =============================================================================

  /**
   * 设置缓存管理器
   */
  setCacheManager(cacheManager: CacheManager, options?: DetectionCacheOptions): void {
    this.cacheManager = cacheManager
    if (options) {
      this.cacheOptions = { ...this.cacheOptions, ...options }
    }
    logger.debug(`${this.name} 缓存管理器已设置`, { options: this.cacheOptions })
  }

  /**
   * 获取缓存键
   */
  protected getCacheKey(directory: string, options?: DetectionOptions): string {
    if (!this.cacheManager) {
      return ''
    }

    return this.cacheManager.generateKey({
      base: `detector:${this.name}`,
      params: options,
      filePath: directory
    })
  }

  /**
   * 从缓存获取结果
   */
  protected async getCachedResult(
    directory: string,
    options?: DetectionOptions
  ): Promise<UnifiedDetectionResult | null> {
    if (!this.cacheManager) {
      return null
    }

    try {
      return await this.cacheManager.getCachedDetectionResult(
        directory,
        { detector: this.name, ...options },
        this.cacheOptions
      )
    } catch (error) {
      // 缓存错误不应该影响检测流程，记录警告并继续
      logger.warn(`获取缓存失败: ${this.name}`, { directory, error })
      return null
    }
  }

  /**
   * 缓存检测结果
   */
  protected async cacheResult(
    directory: string,
    result: UnifiedDetectionResult,
    options?: DetectionOptions
  ): Promise<void> {
    if (!this.cacheManager) {
      return
    }

    try {
      await this.cacheManager.cacheDetectionResult(
        directory,
        result,
        { detector: this.name, ...options },
        this.cacheOptions
      )
      logger.debug(`结果已缓存: ${this.name}`, { directory, techStack: result.techStack })
    } catch (error) {
      // 缓存错误不应该影响检测流程，记录警告并继续
      logger.warn(`缓存结果失败: ${this.name}`, { directory, error })
    }
  }

  // =============================================================================
  // 公共接口实现
  // =============================================================================

  // @asyncErrorHandler('detection') - disabled due to TS5 decorator compatibility
  async detect(directory: string, options?: DetectionOptions): Promise<UnifiedDetectionResult> {
    const startTime = Date.now()

    logger.info(`开始检测: ${this.name}`, { directory, options })

    // 验证目录
    if (!existsSync(directory)) {
      throw createDirectoryNotFoundError(directory)
    }

    // 尝试从缓存获取结果
    const cachedResult = await this.getCachedResult(directory, options)
    if (cachedResult) {
      const cacheTime = Date.now() - startTime
      logger.info(`缓存命中: ${this.name}`, {
        directory,
        techStack: cachedResult.techStack,
        confidence: cachedResult.confidence,
        cacheTime
      })
      return {
        ...cachedResult,
        metadata: {
          ...cachedResult.metadata,
          fromCache: true,
          cacheTime
        }
      }
    }

    // 执行具体的检测逻辑（模板方法）
    const result = await this.performDetection(directory, options)

    const detectionTime = Date.now() - startTime
    logger.info(`检测完成: ${this.name}`, {
      directory,
      techStack: result.techStack,
      confidence: result.confidence,
      detectionTime
    })

    const finalResult = {
      ...result,
      metadata: {
        ...result.metadata,
        detectionTime,
        fromCache: false
      }
    }

    // 缓存检测结果
    await this.cacheResult(directory, finalResult, options)

    return finalResult
  }

  async detectBatch(directories: readonly string[], options?: DetectionOptions): Promise<readonly UnifiedDetectionResult[]> {
    logger.info(`批量检测开始: ${this.name}`, { count: directories.length })
    
    const results = await Promise.allSettled(
      directories.map(dir => this.detect(dir, options))
    )

    const successResults = results
      .filter((result): result is PromiseFulfilledResult<UnifiedDetectionResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)

    const failedCount = results.length - successResults.length
    if (failedCount > 0) {
      logger.warn(`批量检测部分失败: ${this.name}`, { 
        total: directories.length, 
        success: successResults.length, 
        failed: failedCount 
      })
    }

    return successResults
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.checkAvailability()
    } catch (error) {
      logger.warn(`检测器不可用: ${this.name}`, { error })
      return false
    }
  }

  // =============================================================================
  // 抽象方法 - 子类必须实现
  // =============================================================================

  /**
   * 执行具体的检测逻辑
   */
  protected abstract performDetection(directory: string, options?: DetectionOptions): Promise<UnifiedDetectionResult>

  /**
   * 检查检测器可用性
   */
  protected abstract checkAvailability(): Promise<boolean>

  // =============================================================================
  // 通用工具方法
  // =============================================================================

  /**
   * 读取并解析 package.json
   */
  protected readPackageJson(directory: string): any | null {
    try {
      const packageJsonPath = join(directory, 'package.json')
      if (!existsSync(packageJsonPath)) {
        return null
      }

      const content = readFileSync(packageJsonPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      logger.warn('读取 package.json 失败', { directory, error })
      return null
    }
  }

  /**
   * 获取目录中的文件列表
   */
  protected async getDirectoryEntries(directory: string): Promise<string[]> {
    try {
      return await readdir(directory)
    } catch (error) {
      logger.warn('读取目录失败', { directory, error })
      return []
    }
  }

  /**
   * 提取检测特征
   */
  protected async extractFeatures(directory: string, packageJson?: any): Promise<DetectionFeatures> {
    const entries = await this.getDirectoryEntries(directory)
    
    // 配置文件检测
    const configFiles = this.detectConfigFiles(entries)
    
    // 目录结构检测
    const directories = entries.filter(entry => {
      try {
        const stat = require('fs').statSync(join(directory, entry))
        return stat.isDirectory()
      } catch {
        return false
      }
    })

    // 脚本和依赖提取
    const scripts = packageJson?.scripts ? Object.keys(packageJson.scripts) : []
    const dependencies = packageJson?.dependencies ? Object.keys(packageJson.dependencies) : []
    const devDependencies = packageJson?.devDependencies ? Object.keys(packageJson.devDependencies) : []

    // 端口提取
    const ports = this.extractPorts(packageJson, scripts)

    // 构建工具检测
    const buildTools = this.detectBuildTools(dependencies, devDependencies, configFiles)

    return {
      hasPackageJson: !!packageJson,
      configFiles,
      directories,
      scripts,
      dependencies,
      devDependencies,
      ports,
      buildTools
    }
  }

  /**
   * 检测配置文件
   */
  private detectConfigFiles(entries: string[]): string[] {
    const configPatterns = [
      /^.*\.config\.(js|ts|mjs|json)$/,
      /^(webpack|vite|rollup|babel|eslint|prettier)\.config\.(js|ts|mjs)$/,
      /^(tsconfig|jsconfig)\.json$/,
      /^\.env/,
      /^Dockerfile$/,
      /^docker-compose\.ya?ml$/
    ]

    return entries.filter(entry => 
      configPatterns.some(pattern => pattern.test(entry))
    )
  }

  /**
   * 提取端口信息
   */
  private extractPorts(packageJson: any, scripts: string[]): number[] {
    const ports: number[] = []
    
    if (packageJson?.scripts) {
      for (const script of Object.values(packageJson.scripts) as string[]) {
        const scriptPorts = this.extractPortsFromCommand(script)
        ports.push(...scriptPorts)
      }
    }

    return [...new Set(ports)] // 去重
  }

  /**
   * 从命令中提取端口
   */
  private extractPortsFromCommand(command: string): number[] {
    const portPatterns = [
      /--port[=\s]+(\d+)/g,
      /-p[=\s]+(\d+)/g,
      /PORT[=\s]+(\d+)/g,
      /:(\d{4,5})/g
    ]

    const ports: number[] = []
    for (const pattern of portPatterns) {
      let match
      while ((match = pattern.exec(command)) !== null) {
        const port = parseInt(match[1], 10)
        if (port >= 1000 && port <= 65535) {
          ports.push(port)
        }
      }
    }

    return ports
  }

  /**
   * 检测构建工具
   */
  private detectBuildTools(dependencies: string[], devDependencies: string[], configFiles: string[]): string[] {
    const buildTools: string[] = []
    const allDeps = [...dependencies, ...devDependencies]

    // 从依赖检测
    const buildToolDeps = ['webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'snowpack', 'gulp', 'grunt']
    for (const tool of buildToolDeps) {
      if (allDeps.some(dep => dep.includes(tool))) {
        buildTools.push(tool)
      }
    }

    // 从配置文件检测
    for (const configFile of configFiles) {
      if (configFile.includes('webpack')) buildTools.push('webpack')
      if (configFile.includes('vite')) buildTools.push('vite')
      if (configFile.includes('rollup')) buildTools.push('rollup')
    }

    return [...new Set(buildTools)]
  }

  /**
   * 创建错误结果
   */
  protected createErrorResult(directory: string, error: any, detectionTime: number): UnifiedDetectionResult {
    const detectionError = error instanceof DetectionError
      ? error
      : createDetectionFailedError(directory, error instanceof Error ? error.message : String(error), error)

    return {
      id: uuidv4(),
      directory,
      techStack: 'unknown',
      appType: 'unknown',
      confidence: 0,
      features: this.createEmptyFeatures(),
      issues: [{
        type: 'error',
        code: detectionError.code,
        message: detectionError.getUserFriendlyMessage(),
        severity: detectionError.severity,
        suggestions: detectionError.suggestions
      }],
      metadata: {
        detectorType: this.name,
        detectionTime,
        reasoning: [`检测器 ${this.name} 执行失败: ${detectionError.message}`],
        errorCode: detectionError.code,
        errorCategory: detectionError.category
      },
      createdAt: Math.floor(Date.now() / 1000)
    }
  }

  /**
   * 创建空的特征对象
   */
  protected createEmptyFeatures(): DetectionFeatures {
    return {
      hasPackageJson: false,
      configFiles: [],
      directories: [],
      scripts: [],
      dependencies: [],
      devDependencies: [],
      ports: [],
      buildTools: []
    }
  }

  /**
   * 创建基础元数据
   */
  protected createMetadata(reasoning: string[], confidence_breakdown?: any): DetectionMetadata {
    return {
      detectorType: this.name,
      detectionTime: 0, // 将在 detect 方法中设置
      reasoning,
      confidence_breakdown
    }
  }
}
