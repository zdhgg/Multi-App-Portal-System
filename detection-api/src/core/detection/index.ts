/**
 * 统一检测模块导出
 * 
 * 提供重构后的检测系统的统一入口点。
 * 包含所有检测器、工厂、适配器和工具函数。
 */

// =============================================================================
// 核心接口和类型
// =============================================================================

export type {
  IDetector,
  ITechStackDetector,
  IFullStackDetector,
  IDetectorFactory,
  IDetectorRegistry,
  UnifiedDetectionResult,
  DetectionFeatures,
  DetectionMetadata,
  DetectionOptions,
  TechStackAnalysisResult,
  FullStackDetectionResult,
  ProjectRelationshipResult,
  ProjectDependency,
  ProjectConflict
} from './IDetector'

// =============================================================================
// 抽象基类
// =============================================================================

export { AbstractDetector } from './AbstractDetector'

// =============================================================================
// 检测器实现
// =============================================================================

export { TechStackDetector } from './TechStackDetector'
export { UnifiedTechStackAnalyzer } from './UnifiedTechStackAnalyzer'

// =============================================================================
// 工厂和注册表
// =============================================================================

export { 
  DetectorFactory,
  detectorFactory,
  createTechStackDetector,
  getAvailableDetectors,
  registerDetector,
  getDetectorStatistics
} from './DetectorFactory'

// =============================================================================
// 适配器和兼容性
// =============================================================================

import { DetectionServiceAdapter } from './DetectionServiceAdapter'
import { detectorFactory, getDetectorStatistics } from './DetectorFactory'

export {
  DetectionResultAdapter,
  DetectionServiceAdapter,
  detectionServiceAdapter,
  quickDetect,
  quickAnalyzeTechStack,
  checkDetectorStatus
} from './DetectionServiceAdapter'

// =============================================================================
// 便捷函数和工具
// =============================================================================

/**
 * 创建并配置检测服务适配器
 */
export function createDetectionService(): DetectionServiceAdapter {
  return new DetectionServiceAdapter()
}

/**
 * 获取所有检测器的状态
 */
export async function getAllDetectorStatus(): Promise<Map<string, boolean>> {
  return await detectorFactory.checkAllDetectorsAvailability()
}

/**
 * 初始化检测系统
 */
export async function initializeDetectionSystem(): Promise<{
  success: boolean
  availableDetectors: string[]
  errors: string[]
}> {
  const errors: string[] = []

  try {
    // 确保工厂实例已创建并初始化
    const factory = detectorFactory

    // 检查所有检测器的可用性
    const availability = await getAllDetectorStatus()
    const availableDetectors: string[] = []

    for (const [name, available] of availability) {
      if (available) {
        availableDetectors.push(name)
      } else {
        errors.push(`检测器不可用: ${name}`)
      }
    }

    // 如果没有检测器可用，但工厂有注册的检测器，则认为是成功的
    const stats = getDetectorStatistics()
    const success = availableDetectors.length > 0 || stats.total > 0

    return {
      success,
      availableDetectors,
      errors
    }

  } catch (error) {
    errors.push(`初始化失败: ${error}`)
    return {
      success: false,
      availableDetectors: [],
      errors
    }
  }
}

/**
 * 重置检测系统
 */
export function resetDetectionSystem(): void {
  // 清除注册表
  const registry = detectorFactory.getRegistry()
  if ('clear' in registry && typeof registry.clear === 'function') {
    (registry as any).clear()
  }
  
  // 重新初始化默认检测器
  // 这会在下次访问时自动重新创建
}

/**
 * 获取检测系统健康状态
 */
export async function getDetectionSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  details: {
    totalDetectors: number
    availableDetectors: number
    unavailableDetectors: string[]
    lastCheck: string
  }
}> {
  try {
    const availability = await getAllDetectorStatus()
    const stats = getDetectorStatistics()
    
    const availableCount = Array.from(availability.values()).filter(Boolean).length
    const unavailableDetectors = Array.from(availability.entries())
      .filter(([_, available]) => !available)
      .map(([name, _]) => name)

    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (stats.total === 0) {
      status = 'unhealthy'
    } else if (availableCount === stats.total) {
      status = 'healthy'
    } else if (availableCount > 0) {
      status = 'degraded'
    } else {
      status = 'unhealthy'
    }

    return {
      status,
      details: {
        totalDetectors: stats.total,
        availableDetectors: availableCount,
        unavailableDetectors,
        lastCheck: new Date().toISOString()
      }
    }

  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        totalDetectors: 0,
        availableDetectors: 0,
        unavailableDetectors: [`系统错误: ${error}`],
        lastCheck: new Date().toISOString()
      }
    }
  }
}

// =============================================================================
// 版本信息
// =============================================================================

export const DETECTION_SYSTEM_VERSION = '2.0.0'
export const DETECTION_SYSTEM_NAME = 'Unified Detection System'

/**
 * 获取检测系统版本信息
 */
export function getDetectionSystemInfo(): {
  name: string
  version: string
  buildDate: string
  features: string[]
} {
  return {
    name: DETECTION_SYSTEM_NAME,
    version: DETECTION_SYSTEM_VERSION,
    buildDate: new Date().toISOString(),
    features: [
      'Unified Detection Interface',
      'Tech Stack Analysis',
      'Batch Detection',
      'Plugin Architecture',
      'Legacy Compatibility',
      'Error Recovery',
      'Performance Monitoring'
    ]
  }
}
