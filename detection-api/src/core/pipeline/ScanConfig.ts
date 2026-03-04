/**
 * ScanConfig - 统一扫描配置
 * 
 * 所有扫描相关的配置都在这里定义，避免配置在多个地方传递时丢失
 */

export interface ScanConfig {
  /** 扫描深度，1表示只扫描直接子目录 */
  maxDepth: number
  
  /** 排除的目录模式 */
  excludePatterns: string[]
  
  /** 是否启用全栈项目检测 */
  includeFullStackDetection: boolean
  
  /** 端口分配配置 */
  portAllocation: {
    enabled: boolean
    strategy: 'sequential' | 'paired' | 'separated'
    /** 前端端口范围 */
    frontendRange: { start: number; end: number }
    /** 后端端口范围 */
    backendRange: { start: number; end: number }
    /** 保留端口列表 */
    reservedPorts: number[]
    /** 已分配的端口列表 */
    allocatedPorts: number[]
  }
  
  /** 最小置信度阈值 */
  minConfidence: number
}

/**
 * 默认扫描配置
 */
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  maxDepth: 3,
  excludePatterns: ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'],
  includeFullStackDetection: true,
  portAllocation: {
    enabled: true,
    strategy: 'separated',
    frontendRange: { start: 3001, end: 3100 },
    backendRange: { start: 8001, end: 8100 },
    reservedPorts: [22, 80, 443, 3000, 8002],
    allocatedPorts: []
  },
  minConfidence: 0.6
}

/**
 * 从请求体创建扫描配置
 */
export function createScanConfig(requestConfig?: Partial<ScanConfig>): ScanConfig {
  return {
    maxDepth: requestConfig?.maxDepth ?? DEFAULT_SCAN_CONFIG.maxDepth,
    excludePatterns: requestConfig?.excludePatterns ?? DEFAULT_SCAN_CONFIG.excludePatterns,
    includeFullStackDetection: requestConfig?.includeFullStackDetection ?? DEFAULT_SCAN_CONFIG.includeFullStackDetection,
    minConfidence: requestConfig?.minConfidence ?? DEFAULT_SCAN_CONFIG.minConfidence,
    portAllocation: {
      enabled: requestConfig?.portAllocation?.enabled ?? DEFAULT_SCAN_CONFIG.portAllocation.enabled,
      strategy: requestConfig?.portAllocation?.strategy ?? DEFAULT_SCAN_CONFIG.portAllocation.strategy,
      frontendRange: requestConfig?.portAllocation?.frontendRange ?? DEFAULT_SCAN_CONFIG.portAllocation.frontendRange,
      backendRange: requestConfig?.portAllocation?.backendRange ?? DEFAULT_SCAN_CONFIG.portAllocation.backendRange,
      reservedPorts: requestConfig?.portAllocation?.reservedPorts ?? DEFAULT_SCAN_CONFIG.portAllocation.reservedPorts,
      allocatedPorts: requestConfig?.portAllocation?.allocatedPorts ?? DEFAULT_SCAN_CONFIG.portAllocation.allocatedPorts
    }
  }
}

/**
 * 从会话配置创建扫描配置
 */
export function createScanConfigFromSession(sessionConfig?: any): ScanConfig {
  if (!sessionConfig) {
    return { ...DEFAULT_SCAN_CONFIG, portAllocation: { ...DEFAULT_SCAN_CONFIG.portAllocation } }
  }
  
  return {
    maxDepth: sessionConfig.maxDepth ?? DEFAULT_SCAN_CONFIG.maxDepth,
    excludePatterns: sessionConfig.excludePatterns ?? DEFAULT_SCAN_CONFIG.excludePatterns,
    includeFullStackDetection: sessionConfig.includeFullStackDetection ?? DEFAULT_SCAN_CONFIG.includeFullStackDetection,
    minConfidence: sessionConfig.minConfidence ?? DEFAULT_SCAN_CONFIG.minConfidence,
    portAllocation: {
      enabled: sessionConfig.portAllocation?.enabled ?? DEFAULT_SCAN_CONFIG.portAllocation.enabled,
      strategy: sessionConfig.portAllocation?.strategy ?? DEFAULT_SCAN_CONFIG.portAllocation.strategy,
      frontendRange: sessionConfig.portAllocation?.frontendRange ?? DEFAULT_SCAN_CONFIG.portAllocation.frontendRange,
      backendRange: sessionConfig.portAllocation?.backendRange ?? DEFAULT_SCAN_CONFIG.portAllocation.backendRange,
      reservedPorts: sessionConfig.portAllocation?.reservedPorts ?? DEFAULT_SCAN_CONFIG.portAllocation.reservedPorts,
      allocatedPorts: sessionConfig.portAllocation?.allocatedPorts ?? DEFAULT_SCAN_CONFIG.portAllocation.allocatedPorts
    }
  }
}
