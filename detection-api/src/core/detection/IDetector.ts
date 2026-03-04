/**
 * 统一检测接口定义
 * 
 * 这个文件定义了所有检测器的统一接口，确保检测逻辑的一致性和可扩展性。
 * 遵循单一职责原则和开闭原则。
 */

import type { DetectionIssue } from '../types'

// =============================================================================
// 核心检测接口
// =============================================================================

/**
 * 统一的检测结果格式
 */
export interface UnifiedDetectionResult {
  readonly id: string
  readonly directory: string
  readonly techStack: string
  readonly appType: 'frontend' | 'backend' | 'fullstack' | 'static' | 'non-web' | 'unknown'
  readonly confidence: number
  readonly features: DetectionFeatures
  readonly issues: readonly DetectionIssue[]
  readonly metadata: DetectionMetadata
  readonly createdAt: number
}

/**
 * 检测特征信息
 */
export interface DetectionFeatures {
  readonly hasPackageJson: boolean
  readonly configFiles: readonly string[]
  readonly directories: readonly string[]
  readonly scripts: readonly string[]
  readonly dependencies: readonly string[]
  readonly devDependencies: readonly string[]
  readonly ports: readonly number[]
  readonly buildTools: readonly string[]
}

/**
 * 检测元数据
 */
export interface DetectionMetadata {
  readonly detectorType: string
  readonly detectionTime: number
  readonly reasoning: readonly string[]
  readonly confidence_breakdown?: {
    readonly dependency_match: number
    readonly config_match: number
    readonly structure_match: number
    readonly script_match: number
  }
  readonly fromCache?: boolean
  readonly cacheTime?: number
  readonly errorCode?: string
  readonly errorCategory?: string
}

/**
 * 检测选项
 */
export interface DetectionOptions {
  readonly maxDepth?: number
  readonly includeNodeModules?: boolean
  readonly minConfidence?: number
  readonly customPatterns?: Record<string, string[]>
  readonly enableCaching?: boolean
  readonly timeoutMs?: number
}

// =============================================================================
// 检测器接口
// =============================================================================

/**
 * 基础检测器接口
 */
export interface IDetector {
  /**
   * 检测器名称
   */
  readonly name: string

  /**
   * 检测器版本
   */
  readonly version: string

  /**
   * 支持的检测类型
   */
  readonly supportedTypes: readonly string[]

  /**
   * 检测指定目录
   */
  detect(directory: string, options?: DetectionOptions): Promise<UnifiedDetectionResult>

  /**
   * 批量检测
   */
  detectBatch(directories: readonly string[], options?: DetectionOptions): Promise<readonly UnifiedDetectionResult[]>

  /**
   * 验证检测器是否可用
   */
  isAvailable(): Promise<boolean>
}

/**
 * 技术栈检测器接口
 */
export interface ITechStackDetector extends IDetector {
  /**
   * 分析技术栈
   */
  analyzeTechStack(directory: string, packageJson?: any): Promise<TechStackAnalysisResult>

  /**
   * 获取支持的技术栈列表
   */
  getSupportedTechStacks(): readonly string[]
}

/**
 * 全栈检测器接口
 */
export interface IFullStackDetector extends IDetector {
  /**
   * 检测全栈项目
   */
  detectFullStackProjects(rootDirectory: string, options?: DetectionOptions): Promise<readonly FullStackDetectionResult[]>

  /**
   * 检测项目关系
   */
  analyzeProjectRelationships(projects: readonly UnifiedDetectionResult[]): Promise<ProjectRelationshipResult>
}

// =============================================================================
// 辅助类型定义
// =============================================================================

/**
 * 技术栈分析结果
 */
export interface TechStackAnalysisResult {
  readonly techStack: string
  readonly category: 'frontend' | 'backend' | 'fullstack'
  readonly confidence: number
  readonly reasoning: readonly string[]
  readonly alternatives: readonly string[]
}

/**
 * 全栈检测结果
 */
export interface FullStackDetectionResult extends UnifiedDetectionResult {
  readonly fullStackInfo: {
    readonly detectionType: 'separated' | 'monorepo' | 'nested'
    readonly frontendPath: string
    readonly backendPath: string
    readonly sharedComponents?: readonly string[]
  }
}

/**
 * 项目关系分析结果
 */
export interface ProjectRelationshipResult {
  readonly dependencies: readonly ProjectDependency[]
  readonly conflicts: readonly ProjectConflict[]
  readonly recommendations: readonly string[]
}

export interface ProjectDependency {
  readonly from: string
  readonly to: string
  readonly type: 'api' | 'shared_module' | 'config' | 'build'
  readonly confidence: number
}

export interface ProjectConflict {
  readonly type: 'port' | 'dependency' | 'config'
  readonly projects: readonly string[]
  readonly description: string
  readonly severity: 'low' | 'medium' | 'high'
}

// =============================================================================
// 检测器工厂接口
// =============================================================================

/**
 * 检测器工厂接口
 */
export interface IDetectorFactory {
  /**
   * 创建技术栈检测器
   */
  createTechStackDetector(): ITechStackDetector

  /**
   * 创建全栈检测器
   */
  createFullStackDetector(): IFullStackDetector

  /**
   * 创建自定义检测器
   */
  createCustomDetector(type: string, config?: any): IDetector

  /**
   * 获取所有可用的检测器
   */
  getAvailableDetectors(): readonly string[]

  /**
   * 注册自定义检测器
   */
  registerDetector(name: string, detector: IDetector): void
}

// =============================================================================
// 检测器注册表接口
// =============================================================================

/**
 * 检测器注册表
 */
export interface IDetectorRegistry {
  /**
   * 注册检测器
   */
  register(detector: IDetector): void

  /**
   * 获取检测器
   */
  get(name: string): IDetector | undefined

  /**
   * 获取所有检测器
   */
  getAll(): readonly IDetector[]

  /**
   * 按类型获取检测器
   */
  getByType(type: string): readonly IDetector[]

  /**
   * 移除检测器
   */
  unregister(name: string): boolean

  /**
   * 列出所有检测器名称
   */
  list(): readonly string[]
}
