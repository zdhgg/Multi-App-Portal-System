/**
 * ScanContext - 扫描上下文
 * 
 * 在整个管道执行过程中共享的上下文对象
 * 包含配置、中间结果和元数据
 */

import { ScanConfig } from './ScanConfig'

/**
 * 扫描到的目录信息
 */
export interface ScannedDirectory {
  path: string
  depth: number
  hasPackageJson: boolean
  entries: string[]
  parentPath: string | null
}

/**
 * 检测到的应用信息
 */
export interface DetectedApplication {
  id: string
  directory: string
  name: string
  techStack: string
  confidence: number
  isFullStackComponent: boolean
  componentType?: 'frontend' | 'backend' | 'unknown'
  packageJson?: any
}

/**
 * 全栈项目信息
 */
export interface FullStackProject {
  id: string
  name: string
  directory: string
  type: 'separated' | 'monorepo' | 'nested'
  frontend: DetectedApplication
  backend: DetectedApplication
  confidence: number
  rootPackageJson?: any
}

/**
 * 聚合后的项目
 */
export interface AggregatedProject {
  id: string
  name: string
  directory: string
  type: 'fullstack' | 'frontend' | 'backend' | 'static' | 'unknown'
  applications: DetectedApplication[]
  fullStackInfo?: FullStackProject
  ports: {
    frontend?: number
    backend?: number
    main?: number
  }
  confidence: number
  techStacks: string[]
  isBackup: boolean
  description: string
}

/**
 * 管道执行结果
 */
export interface PipelineResults {
  /** 扫描阶段：扫描到的目录 */
  scannedDirectories: ScannedDirectory[]
  
  /** 分析阶段：检测到的应用 */
  detectedApplications: DetectedApplication[]
  
  /** 分析阶段：识别的全栈项目 */
  fullStackProjects: FullStackProject[]
  
  /** 聚合阶段：最终项目列表 */
  aggregatedProjects: AggregatedProject[]
}

/**
 * 扫描元数据
 */
export interface ScanMetadata {
  sessionId: string
  workspacePath: string
  startTime: number
  endTime?: number
  duration?: number
  stageTimings: Record<string, number>
}

/**
 * 扫描上下文
 */
export interface ScanContext {
  /** 扫描配置 */
  config: ScanConfig
  
  /** 管道执行结果 */
  results: PipelineResults
  
  /** 扫描元数据 */
  metadata: ScanMetadata
}

/**
 * 创建空的扫描上下文
 */
export function createScanContext(
  sessionId: string,
  workspacePath: string,
  config: ScanConfig
): ScanContext {
  return {
    config,
    results: {
      scannedDirectories: [],
      detectedApplications: [],
      fullStackProjects: [],
      aggregatedProjects: []
    },
    metadata: {
      sessionId,
      workspacePath,
      startTime: Date.now(),
      stageTimings: {}
    }
  }
}

/**
 * 记录阶段耗时
 */
export function recordStageTiming(context: ScanContext, stageName: string, duration: number): void {
  context.metadata.stageTimings[stageName] = duration
}

/**
 * 完成扫描上下文
 */
export function finalizeScanContext(context: ScanContext): void {
  context.metadata.endTime = Date.now()
  context.metadata.duration = context.metadata.endTime - context.metadata.startTime
}
