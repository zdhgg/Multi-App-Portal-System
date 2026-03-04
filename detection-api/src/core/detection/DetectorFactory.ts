/* DetectorFactory */

import { logger } from '../../utils/logger'
import { AbstractDetector } from './AbstractDetector'
// 内置后备技术栈检测器，提供最小可用实现，确保测试与运行环境稳定
class FallbackTechStackDetector extends AbstractDetector implements ITechStackDetector {
  public readonly name = 'tech-stack-detector'
  public readonly version = '1.0.0'
  public readonly supportedTypes = ['techstack', 'tech-stack'] as const

  async analyzeTechStack(directory: string): Promise<import('./IDetector').TechStackAnalysisResult> {
    return { techStack: 'unknown', category: 'fullstack', confidence: 0.3, reasoning: ['fallback implementation'], alternatives: [] }
  }

  getSupportedTechStacks(): readonly string[] {
    return ['React', 'Vue', 'Angular', 'Next.js', 'Nuxt.js', 'Node.js', 'NestJS']
  }

  protected async performDetection(directory: string): Promise<import('./IDetector').UnifiedDetectionResult> {
    const features = await this.extractFeatures(directory, this.readPackageJson(directory))
    const analysis = await this.analyzeTechStack(directory)
    return {
      id: require('uuid').v4(),
      directory,
      techStack: analysis.techStack,
      appType: 'frontend',
      confidence: analysis.confidence,
      features,
      issues: [],
      metadata: this.createMetadata([...analysis.reasoning]),
      createdAt: Math.floor(Date.now() / 1000)
    }
  }

  protected async checkAvailability(): Promise<boolean> {
    return true
  }
}

import { CacheManager, DetectionCacheOptions } from '../cache'
import type {
  IDetector,
  ITechStackDetector,
  IFullStackDetector,
  IDetectorFactory,
  IDetectorRegistry
} from './IDetector'

// =============================================================================
// 检测器注册表实现
// =============================================================================

class DetectorRegistry implements IDetectorRegistry {
  private readonly detectors = new Map<string, IDetector>()

  register(detector: IDetector): void {
    if (this.detectors.has(detector.name)) {
      logger.warn(`检测器已存在，将被覆盖: ${detector.name}`)
    }
    
    this.detectors.set(detector.name, detector)
    logger.info(`检测器已注册: ${detector.name} v${detector.version}`)
  }

  get(name: string): IDetector | undefined {
    return this.detectors.get(name)
  }

  getAll(): readonly IDetector[] {
    return Array.from(this.detectors.values())
  }

  getByType(type: string): readonly IDetector[] {
    return Array.from(this.detectors.values()).filter(detector =>
      detector.supportedTypes.includes(type)
    )
  }

  unregister(name: string): boolean {
    const existed = this.detectors.has(name)
    if (existed) {
      this.detectors.delete(name)
      logger.info(`检测器已注销: ${name}`)
    }
    return existed
  }

  clear(): void {
    this.detectors.clear()
    logger.info('所有检测器已清除')
  }

  list(): string[] {
    return Array.from(this.detectors.keys())
  }
}

// =============================================================================
// 检测器工厂实现
// =============================================================================

export class DetectorFactory implements IDetectorFactory {
  private readonly registry: IDetectorRegistry
  private static instance: DetectorFactory | null = null
  private cacheManager?: CacheManager
  private defaultCacheOptions: DetectionCacheOptions = {
    enableFileTimeCheck: true,
    ttl: 1800 // 30分钟
  }

  constructor() {
    this.registry = new DetectorRegistry()
    this.initializeDefaultDetectors()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): DetectorFactory {
    if (!DetectorFactory.instance) {
      DetectorFactory.instance = new DetectorFactory()
    }
    return DetectorFactory.instance
  }

  /**
   * 设置缓存管理器
   */
  setCacheManager(cacheManager: CacheManager, options?: DetectionCacheOptions): void {
    this.cacheManager = cacheManager
    if (options) {
      this.defaultCacheOptions = { ...this.defaultCacheOptions, ...options }
    }

    // 为所有已注册的检测器设置缓存
    this.registry.getAll().forEach(detector => {
      if ('setCacheManager' in detector && typeof detector.setCacheManager === 'function') {
        detector.setCacheManager(cacheManager, this.defaultCacheOptions)
      }
    })

    logger.info('缓存管理器已设置到检测器工厂', {
      detectorCount: this.registry.getAll().length,
      options: this.defaultCacheOptions
    })
  }

  /**
   * 获取缓存管理器
   */
  getCacheManager(): CacheManager | undefined {
    return this.cacheManager
  }

  // =============================================================================
  // IDetectorFactory 接口实现
  // =============================================================================

  createTechStackDetector(): ITechStackDetector {
    // 优先尝试使用独立文件的实现，其次使用内置后备实现
    let detector: ITechStackDetector
    try {
      // 动态导入，避免在测试收集阶段的静态导入导致编译问题
      const mod = require('./TechStackDetector')
      const Impl = (mod && (mod.TechStackDetector || mod.default)) as { new(): ITechStackDetector }
      detector = new Impl()
    } catch (e) {
      logger.warn('加载外部 TechStackDetector 失败，使用内置后备实现', { error: e })
      detector = new FallbackTechStackDetector()
    }

    // 设置缓存管理器
    if (this.cacheManager && (detector as any).setCacheManager) {
      (detector as any).setCacheManager(this.cacheManager, this.defaultCacheOptions)
    }

    // 确保检测器可用
    detector.isAvailable().then(available => {
      if (!available) {
        logger.warn(`技术栈检测器不可用: ${detector.name}`)
      }
    })

    return detector
  }

  createFullStackDetector(): IFullStackDetector {
    // TODO: 实现全栈检测器
    throw new Error('全栈检测器尚未实现')
  }

  createCustomDetector(type: string, config?: any): IDetector {
    const registeredDetector = this.registry.get(type)
    if (registeredDetector) {
      return registeredDetector
    }

    throw new Error(`未知的检测器类型: ${type}`)
  }

  getAvailableDetectors(): readonly string[] {
    return this.registry.list()
  }

  registerDetector(name: string, detector: IDetector): void {
    this.registry.register(detector)
  }

  // =============================================================================
  // 检测器管理方法
  // =============================================================================

  /**
   * 获取检测器注册表
   */
  getRegistry(): IDetectorRegistry {
    return this.registry
  }

  /**
   * 根据类型获取最佳检测器
   */
  getBestDetectorForType(type: string): IDetector | null {
    const detectors = this.registry.getByType(type)
    if (detectors.length === 0) {
      return null
    }

    // 简单选择第一个可用的检测器
    // 未来可以实现更复杂的选择逻辑
    return detectors[0]
  }

  /**
   * 批量创建检测器
   */
  createDetectors(types: string[]): IDetector[] {
    const detectors: IDetector[] = []
    
    for (const type of types) {
      try {
        const detector = this.createDetectorByType(type)
        if (detector) {
          detectors.push(detector)
        }
      } catch (error) {
        logger.warn(`创建检测器失败: ${type}`, { error })
      }
    }

    return detectors
  }

  /**
   * 检查所有检测器的可用性
   */
  async checkAllDetectorsAvailability(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()
    const detectors = this.registry.getAll()

    await Promise.allSettled(
      detectors.map(async detector => {
        try {
          const available = await detector.isAvailable()
          results.set(detector.name, available)
        } catch (error) {
          logger.error(`检查检测器可用性失败: ${detector.name}`, { error })
          results.set(detector.name, false)
        }
      })
    )

    return results
  }

  /**
   * 获取检测器统计信息
   */
  getStatistics(): {
    total: number
    byType: Record<string, number>
    registered: string[]
  } {
    const detectors = this.registry.getAll()
    const byType: Record<string, number> = {}

    for (const detector of detectors) {
      for (const type of detector.supportedTypes) {
        byType[type] = (byType[type] || 0) + 1
      }
    }

    return {
      total: detectors.length,
      byType,
      registered: detectors.map(d => d.name)
    }
  }

  // =============================================================================
  // 私有方法
  // =============================================================================

  /**
   * 初始化默认检测器
   */
  private initializeDefaultDetectors(): void {
    try {
      // 注册技术栈检测器
      const techStackDetector = this.createTechStackDetector()
      this.registry.register(techStackDetector)

      // TODO: 注册其他默认检测器
      // const fullStackDetector = new FullStackDetector()
      // this.registry.register(fullStackDetector)

      logger.info('默认检测器初始化完成')
    } catch (error) {
      logger.error('初始化默认检测器失败', { error })
    }
  }

  /**
   * 根据类型创建检测器
   */
  private createDetectorByType(type: string): IDetector | null {
    switch (type.toLowerCase()) {
      case 'techstack':
      case 'tech-stack':
        return this.createTechStackDetector()
      
      case 'fullstack':
      case 'full-stack':
        try {
          return this.createFullStackDetector()
        } catch {
          logger.warn('全栈检测器不可用，回退到技术栈检测器')
          return this.createTechStackDetector()
        }
      
      default:
        return this.registry.get(type) || null
    }
  }
}

// =============================================================================
// 导出单例实例
// =============================================================================

export const detectorFactory = DetectorFactory.getInstance()

// =============================================================================
// 便捷函数
// =============================================================================

/**
 * 创建技术栈检测器
 */
export function createTechStackDetector(): ITechStackDetector {
  return detectorFactory.createTechStackDetector()
}

/**
 * 获取所有可用的检测器
 */
export function getAvailableDetectors(): readonly string[] {
  return detectorFactory.getAvailableDetectors()
}

/**
 * 注册自定义检测器
 */
export function registerDetector(detector: IDetector): void {
  detectorFactory.registerDetector(detector.name, detector)
}

/**
 * 获取检测器统计信息
 */
export function getDetectorStatistics() {
  return detectorFactory.getStatistics()
}
