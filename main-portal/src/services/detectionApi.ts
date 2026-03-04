import { apiService } from './api'
import type { ApiResponse } from './api'

// 检测相关的类型定义
export interface DetectionResult {
  id: string
  name: string
  directory: string
  techStack: string
  confidence: number
  ports: {
    frontend?: number
    backend?: number
  }
  files: string[]
  packageInfo?: any
  suggestions: string[]
}

export interface SingleDirectoryTraditionalResult {
  id?: string
  sessionId?: string
  name?: string
  directory: string
  techStack: string
  confidence: number
  issues?: Array<{
    type: string
    code?: string
    message: string
  }>
  enhancedData?: Record<string, any>
  [key: string]: any
}

export interface SingleDirectoryEnhancedResult {
  id?: string
  name?: string
  directory?: string
  type?: string
  confidence?: number
  componentCount?: number
  portInfo?: {
    main?: { port: number; [key: string]: any }
    frontend?: { port: number; [key: string]: any }
    backend?: { port: number; [key: string]: any }
    [key: string]: any
  }
  fullstackInfo?: {
    detectionType?: string
    frontendPath?: string
    backendPath?: string
    frontendDirectory?: string
    backendDirectory?: string
    frontendTechStack?: string
    backendTechStack?: string
    originalPorts?: {
      frontend?: number[]
      backend?: number[]
    }
    [key: string]: any
  }
  [key: string]: any
}

export interface SingleDirectoryDetectionData {
  traditional: SingleDirectoryTraditionalResult
  enhanced?: SingleDirectoryEnhancedResult
}

export interface ScanConfig {
  workspacePath: string
  config?: {
    maxDepth?: number
    includePatterns?: string[]
    excludePatterns?: string[]
    timeoutMs?: number
    portStrategy?: 'use_original' | 'auto_allocate' | 'manual'
    workspaceDepth?: number
  }
}

export interface ScanStatus {
  scanId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  currentPath?: string
  startTime: string
  endTime?: string
  error?: string
}

export interface ScanResults {
  scanId: string
  results: DetectionResult[]
  summary: {
    totalDirectories: number
    detectedApps: number
    techStacks: Record<string, number>
  }
}

// 检测API服务类
export class DetectionApiService {

  /**
   * 开始工作区扫描
   */
  async startScan(config: ScanConfig): Promise<ApiResponse<{ scanId: string }>> {
    return apiService.post<ApiResponse<{ scanId: string }>>('/detection/scan', config)
  }

  /**
   * 获取扫描状态
   */
  async getScanStatus(scanId: string): Promise<ApiResponse<ScanStatus>> {
    return apiService.get<ApiResponse<ScanStatus>>(`/detection/scan/${scanId}`)
  }

  /**
   * 获取扫描结果
   */
  async getScanResults(scanId: string): Promise<ApiResponse<ScanResults>> {
    return apiService.get<ApiResponse<ScanResults>>(`/detection/results/${scanId}`)
  }

  /**
   * 取消扫描
   */
  async cancelScan(scanId: string): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>(`/detection/scan/${scanId}/cancel`)
  }

  /**
   * 清理扫描会话
   */
  async clearScan(scanId: string): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`/detection/scan/${scanId}`)
  }

  /**
   * 检测单个目录（增强版，支持全栈检测）
   */
  async detectDirectory(data: {
    directory: string
    autoAllocatePorts?: boolean
  }): Promise<ApiResponse<SingleDirectoryDetectionData>> {
    const rawResponse = await apiService.post<any>('/v2/detection/single-directory', data)
    return normalizeSingleDirectoryResponse(rawResponse)
  }

  /**
   * 检测单个目录（传统版）
   */
  async detectDirectoryTraditional(data: {
    directory: string
    autoAllocatePorts?: boolean
  }): Promise<ApiResponse<DetectionResult>> {
    const response = await this.detectDirectory(data)
    return {
      success: response.success && !!response.data?.traditional,
      data: response.data?.traditional as unknown as DetectionResult,
      error: response.error,
      message: response.message
    }
  }

  /**
   * 获取活跃扫描会话
   */
  async getActiveSessions(): Promise<ApiResponse<ScanStatus[]>> {
    return apiService.get<ApiResponse<ScanStatus[]>>('/detection/sessions')
  }

  /**
   * 获取技术栈规则
   */
  async getTechStackRules(): Promise<ApiResponse<any[]>> {
    return apiService.get<ApiResponse<any[]>>('/detection/rules')
  }

  /**
   * 获取端口状态
   */
  async getPortStatus(): Promise<ApiResponse<any>> {
    return apiService.get<ApiResponse<any>>('/detection/ports')
  }

  /**
   * 检查端口可用性
   */
  async checkPorts(ports: number[]): Promise<ApiResponse<any>> {
    return apiService.post<ApiResponse<any>>('/detection/check-ports', { ports })
  }
}

// 创建检测API服务实例
export const detectionApiService = new DetectionApiService()

function normalizeSingleDirectoryResponse(rawResponse: any): ApiResponse<SingleDirectoryDetectionData> {
  const wrappedData =
    rawResponse?.data && (rawResponse.data?.traditional || rawResponse.data?.enhanced)
      ? rawResponse.data
      : undefined

  const legacyData =
    rawResponse?.traditional || rawResponse?.enhanced
      ? {
          traditional: rawResponse.traditional,
          enhanced: rawResponse.enhanced
        }
      : undefined

  const data = wrappedData || legacyData
  const success = typeof rawResponse?.success === 'boolean' ? rawResponse.success : !!data
  const error =
    typeof rawResponse?.error === 'string'
      ? rawResponse.error
      : rawResponse?.error?.message

  return {
    success,
    data,
    error,
    message: rawResponse?.message
  }
}
