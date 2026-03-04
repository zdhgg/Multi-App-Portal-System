/**
 * DetectionPipeline - 检测管道协调器
 * 
 * 协调各个阶段的执行，确保数据在阶段间正确传递
 */

import { ScanContext, createScanContext, finalizeScanContext, AggregatedProject } from './ScanContext'
import { ScanConfig, createScanConfig } from './ScanConfig'
import { IPipelineStage } from './PipelineStage'
import { logger } from '../../utils/logger'

// 导入各个阶段（稍后实现）
import { ScannerStage } from './stages/ScannerStage'
import { AnalyzerStage } from './stages/AnalyzerStage'
import { AggregatorStage } from './stages/AggregatorStage'
import { PortAllocatorStage } from './stages/PortAllocatorStage'

/**
 * 管道执行选项
 */
export interface PipelineOptions {
  /** 要执行的阶段（默认全部） */
  stages?: string[]
  
  /** 是否在阶段失败时继续执行 */
  continueOnError?: boolean
}

/**
 * 管道执行结果
 */
export interface PipelineResult {
  success: boolean
  projects: AggregatedProject[]
  context: ScanContext
  errors: Error[]
}

/**
 * 检测管道
 */
export class DetectionPipeline {
  private stages: IPipelineStage[]
  
  constructor() {
    // 按顺序注册各个阶段
    this.stages = [
      new ScannerStage(),
      new AnalyzerStage(),
      new AggregatorStage(),
      new PortAllocatorStage()
    ]
  }
  
  /**
   * 执行完整的检测管道
   */
  async execute(
    sessionId: string,
    workspacePath: string,
    config?: Partial<ScanConfig>,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const scanConfig = createScanConfig(config)
    const context = createScanContext(sessionId, workspacePath, scanConfig)
    const errors: Error[] = []
    
    logger.info('[Pipeline] 开始执行检测管道', {
      sessionId,
      workspacePath,
      config: {
        maxDepth: scanConfig.maxDepth,
        includeFullStackDetection: scanConfig.includeFullStackDetection,
        portAllocationEnabled: scanConfig.portAllocation.enabled
      },
      stageCount: this.stages.length
    })
    
    try {
      // 确定要执行的阶段
      const stagesToRun = options?.stages 
        ? this.stages.filter(s => options.stages!.includes(s.name))
        : this.stages
      
      // 依次执行各个阶段
      for (const stage of stagesToRun) {
        try {
          await stage.execute(context)
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)))
          
          if (!options?.continueOnError) {
            throw error
          }
          
          logger.warn(`[Pipeline] 阶段 ${stage.name} 失败，继续执行后续阶段`, {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      
      // 完成上下文
      finalizeScanContext(context)
      
      logger.info('[Pipeline] 检测管道执行完成', {
        sessionId,
        duration: `${context.metadata.duration}ms`,
        projectCount: context.results.aggregatedProjects.length,
        fullStackCount: context.results.fullStackProjects.length,
        stageTimings: context.metadata.stageTimings
      })
      
      return {
        success: errors.length === 0,
        projects: context.results.aggregatedProjects,
        context,
        errors
      }
      
    } catch (error) {
      finalizeScanContext(context)
      
      logger.error('[Pipeline] 检测管道执行失败', {
        sessionId,
        duration: `${context.metadata.duration}ms`,
        error: error instanceof Error ? error.message : String(error)
      })
      
      return {
        success: false,
        projects: context.results.aggregatedProjects,
        context,
        errors: [...errors, error instanceof Error ? error : new Error(String(error))]
      }
    }
  }
  
  /**
   * 获取所有阶段名称
   */
  getStageNames(): string[] {
    return this.stages.map(s => s.name)
  }
}

/**
 * 创建默认的检测管道实例
 */
export function createDetectionPipeline(): DetectionPipeline {
  return new DetectionPipeline()
}
