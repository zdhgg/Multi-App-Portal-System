/**
 * Detection Pipeline - 检测管道模块
 * 
 * 提供统一的检测管道架构，包含四个阶段：
 * 1. Scanner - 扫描目录
 * 2. Analyzer - 分析技术栈和全栈项目
 * 3. Aggregator - 聚合和去重
 * 4. PortAllocator - 端口分配
 */

// 核心类型和配置
export type { ScanConfig } from './ScanConfig'
export { 
  DEFAULT_SCAN_CONFIG, 
  createScanConfig, 
  createScanConfigFromSession 
} from './ScanConfig'

export type { 
  ScanContext, 
  ScannedDirectory, 
  DetectedApplication, 
  FullStackProject, 
  AggregatedProject,
  PipelineResults,
  ScanMetadata
} from './ScanContext'

export {
  createScanContext,
  finalizeScanContext,
  recordStageTiming
} from './ScanContext'

// 管道基础
export type { IPipelineStage } from './PipelineStage'
export { PipelineStage } from './PipelineStage'

export type { PipelineOptions, PipelineResult } from './DetectionPipeline'
export { DetectionPipeline, createDetectionPipeline } from './DetectionPipeline'

// 管道阶段
export { ScannerStage } from './stages/ScannerStage'
export { AnalyzerStage } from './stages/AnalyzerStage'
export { AggregatorStage } from './stages/AggregatorStage'
export { PortAllocatorStage } from './stages/PortAllocatorStage'
