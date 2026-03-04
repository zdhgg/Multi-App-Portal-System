/**
 * 检测服务适配器
 * 
 * 提供新旧检测接口之间的适配，确保向后兼容性。
 * 逐步迁移现有代码到新的统一检测接口。
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'
import { detectorFactory } from './DetectorFactory'
import type { UnifiedDetectionResult } from './IDetector'
import type { DetectionResult, WebAppAnalysisResult, DetectionIssue } from '../types'

// =============================================================================
// 结果转换适配器
// =============================================================================

export class DetectionResultAdapter {
  /**
   * 将统一检测结果转换为旧格式
   */
  static toLegacyDetectionResult(
    unified: UnifiedDetectionResult,
    sessionId: string = 'unified-detection'
  ): DetectionResult {
    return {
      id: unified.id,
      sessionId,
      directory: unified.directory,
      techStack: unified.techStack,
      confidence: unified.confidence,
      issues: unified.issues,
      createdAt: unified.createdAt,
      enhancedData: {
        scores: {
          frontend: unified.appType === 'frontend' ? unified.confidence : 0,
          backend: unified.appType === 'backend' ? unified.confidence : 0,
          fullstack: unified.appType === 'fullstack' ? unified.confidence : 0,
          static: unified.appType === 'static' ? unified.confidence : 0
        },
        reasoning: unified.metadata.reasoning,
        features: unified.features
      }
    }
  }

  /**
   * 将统一检测结果转换为 WebApp 分析结果
   */
  static toWebAppAnalysisResult(unified: UnifiedDetectionResult): WebAppAnalysisResult {
    return {
      techStack: unified.techStack,
      appType: unified.appType,
      confidence: unified.confidence,
      features: {
        hasPackageJson: unified.features.hasPackageJson,
        configFiles: unified.features.configFiles,
        directories: unified.features.directories,
        scripts: unified.features.scripts,
        dependencies: unified.features.dependencies,
        devDependencies: unified.features.devDependencies,
        ports: unified.features.ports || [],
        buildTools: unified.features.buildTools || []
      },
      issues: unified.issues
    }
  }

  /**
   * 批量转换检测结果
   */
  static toLegacyDetectionResults(
    unified: readonly UnifiedDetectionResult[],
    sessionId: string = 'unified-detection'
  ): readonly DetectionResult[] {
    return unified.map(result => this.toLegacyDetectionResult(result, sessionId))
  }
}

// =============================================================================
// 检测服务适配器
// =============================================================================

export class DetectionServiceAdapter {
  private readonly techStackDetector = detectorFactory.createTechStackDetector()

  /**
   * 单目录检测（新接口）
   */
  async detectSingleDirectoryUnified(
    directory: string, 
    options?: any
  ): Promise<UnifiedDetectionResult> {
    try {
      logger.info('使用统一检测器进行单目录检测', { directory })
      
      const result = await this.techStackDetector.detect(directory, {
        minConfidence: options?.minConfidence || 0.3,
        enableCaching: options?.enableCaching !== false,
        timeoutMs: options?.timeoutMs || 30000
      })

      logger.info('统一检测完成', { 
        directory, 
        techStack: result.techStack, 
        confidence: result.confidence 
      })

      return result

    } catch (error) {
      logger.error('统一检测失败', { directory, error })
      throw error
    }
  }

  /**
   * 单目录检测（兼容旧接口）
   */
  async detectSingleDirectory(
    directory: string, 
    options?: any
  ): Promise<DetectionResult> {
    const unified = await this.detectSingleDirectoryUnified(directory, options)
    return DetectionResultAdapter.toLegacyDetectionResult(unified, 'single-directory')
  }

  /**
   * 技术栈分析（兼容旧接口）
   */
  async analyzeTechStack(directory: string, packageJson?: any): Promise<WebAppAnalysisResult> {
    try {
      // 使用统一检测器进行完整检测
      const unifiedResult = await this.techStackDetector.detect(directory)

      // 转换为 WebAppAnalysisResult 格式
      return DetectionResultAdapter.toWebAppAnalysisResult(unifiedResult)

    } catch (error) {
      logger.error('技术栈分析失败', { directory, error })
      
      return {
        techStack: 'unknown',
        appType: 'unknown',
        confidence: 0.1,
        features: {
          hasPackageJson: false,
          configFiles: [],
          directories: [],
          scripts: [],
          dependencies: [],
          devDependencies: []
        },
        issues: [{
          type: 'error',
          code: 'ANALYSIS_FAILED',
          message: `分析失败: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }

  /**
   * 批量检测
   */
  async detectBatch(
    directories: readonly string[], 
    options?: any
  ): Promise<readonly DetectionResult[]> {
    try {
      logger.info('开始批量检测', { count: directories.length })
      
      const unified = await this.techStackDetector.detectBatch(directories, {
        minConfidence: options?.minConfidence || 0.3,
        enableCaching: options?.enableCaching !== false,
        timeoutMs: options?.timeoutMs || 30000
      })

      const legacy = DetectionResultAdapter.toLegacyDetectionResults(unified, 'batch-detection')
      
      logger.info('批量检测完成', { 
        total: directories.length, 
        success: legacy.length 
      })

      return legacy

    } catch (error) {
      logger.error('批量检测失败', { directories, error })
      throw error
    }
  }

  /**
   * 获取支持的技术栈
   */
  getSupportedTechStacks(): readonly string[] {
    return this.techStackDetector.getSupportedTechStacks()
  }

  /**
   * 检查检测器可用性
   */
  async isAvailable(): Promise<boolean> {
    return await this.techStackDetector.isAvailable()
  }

  /**
   * 获取检测器信息
   */
  getDetectorInfo(): {
    name: string
    version: string
    supportedTypes: readonly string[]
  } {
    return {
      name: this.techStackDetector.name,
      version: this.techStackDetector.version,
      supportedTypes: this.techStackDetector.supportedTypes
    }
  }

  /**
   * 验证检测结果
   */
  validateDetectionResult(result: UnifiedDetectionResult): {
    isValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    if (!result.id) issues.push('缺少结果ID')
    if (!result.directory) issues.push('缺少目录路径')
    if (!result.techStack) issues.push('缺少技术栈信息')
    if (result.confidence < 0 || result.confidence > 1) {
      issues.push('置信度超出有效范围 [0, 1]')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * 获取检测统计信息
   */
  getStatistics(): {
    detectorInfo: any
    factoryStats: any
  } {
    return {
      detectorInfo: this.getDetectorInfo(),
      factoryStats: detectorFactory.getStatistics()
    }
  }
}

// =============================================================================
// 导出单例实例
// =============================================================================

export const detectionServiceAdapter = new DetectionServiceAdapter()

// =============================================================================
// 便捷函数
// =============================================================================

/**
 * 快速单目录检测
 */
export async function quickDetect(directory: string): Promise<DetectionResult> {
  return await detectionServiceAdapter.detectSingleDirectory(directory)
}

/**
 * 快速技术栈分析
 */
export async function quickAnalyzeTechStack(directory: string): Promise<WebAppAnalysisResult> {
  return await detectionServiceAdapter.analyzeTechStack(directory)
}

/**
 * 检查检测器状态
 */
export async function checkDetectorStatus(): Promise<{
  available: boolean
  info: any
  stats: any
}> {
  const available = await detectionServiceAdapter.isAvailable()
  const info = detectionServiceAdapter.getDetectorInfo()
  const stats = detectionServiceAdapter.getStatistics()

  return { available, info, stats }
}
