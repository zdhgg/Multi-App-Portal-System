/**
 * PipelineStage - 管道阶段基类
 * 
 * 定义管道阶段的通用接口和基础实现
 */

import { ScanContext, recordStageTiming } from './ScanContext'
import { logger } from '../../utils/logger'

/**
 * 管道阶段接口
 */
export interface IPipelineStage {
  /** 阶段名称 */
  readonly name: string
  
  /** 执行阶段 */
  execute(context: ScanContext): Promise<void>
}

/**
 * 管道阶段基类
 */
export abstract class PipelineStage implements IPipelineStage {
  abstract readonly name: string
  
  /**
   * 执行阶段（带计时和日志）
   */
  async execute(context: ScanContext): Promise<void> {
    const startTime = Date.now()
    
    logger.info(`[Pipeline] 开始执行阶段: ${this.name}`, {
      sessionId: context.metadata.sessionId,
      config: {
        maxDepth: context.config.maxDepth,
        includeFullStackDetection: context.config.includeFullStackDetection
      }
    })
    
    try {
      await this.process(context)
      
      const duration = Date.now() - startTime
      recordStageTiming(context, this.name, duration)
      
      logger.info(`[Pipeline] 阶段完成: ${this.name}`, {
        sessionId: context.metadata.sessionId,
        duration: `${duration}ms`,
        ...this.getStageStats(context)
      })
      
    } catch (error) {
      const duration = Date.now() - startTime
      recordStageTiming(context, this.name, duration)
      
      logger.error(`[Pipeline] 阶段失败: ${this.name}`, {
        sessionId: context.metadata.sessionId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error)
      })
      
      throw error
    }
  }
  
  /**
   * 阶段具体处理逻辑（子类实现）
   */
  protected abstract process(context: ScanContext): Promise<void>
  
  /**
   * 获取阶段统计信息（子类可覆盖）
   */
  protected getStageStats(context: ScanContext): Record<string, any> {
    return {}
  }
}
