/**
 * 应用端口绑定相关类型定义
 */

export interface PortRequirement {
  id?: string
  type: 'frontend' | 'backend' | 'api' | 'websocket'
  protocol: 'http' | 'https' | 'ws' | 'wss'
  count: number
  preferredRange?: 'frontend' | 'backend' | 'auto'
  description?: string
}

export interface AllocatedPort {
  id?: string
  port: number
  type: string
  protocol: string
  status: 'allocated' | 'active' | 'inactive'
  allocatedAt: string
  releasedAt?: string
}

export interface AppPortBinding {
  id: string
  appId: string
  appName: string
  techStack: string
  description?: string
  portRequirements: PortRequirement[]
  allocatedPorts: AllocatedPort[]
  status: 'pending' | 'allocated' | 'active' | 'error'
  priority: 'low' | 'normal' | 'high'
  environment: 'development' | 'testing' | 'production'
  tags: string[]
  autoAllocate: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
  lastAllocatedAt?: string
}

export interface CreateAppPortBindingRequest {
  appId: string
  appName: string
  techStack: string
  description?: string
  portRequirements: Omit<PortRequirement, 'id'>[]
  priority?: 'low' | 'normal' | 'high'
  environment?: 'development' | 'testing' | 'production'
  tags?: string[]
  autoAllocate?: boolean
}

export interface UpdateAppPortBindingRequest {
  appName?: string
  techStack?: string
  description?: string
  portRequirements?: Omit<PortRequirement, 'id'>[]
  priority?: 'low' | 'normal' | 'high'
  environment?: 'development' | 'testing' | 'production'
  tags?: string[]
}

export interface AllocatePortsRequest {
  bindingId: string
  forceReallocation?: boolean
}

export interface AllocatePortsResponse {
  success: boolean
  message: string
  data: {
    bindingId: string
    allocatedPorts: AllocatedPort[]
    conflicts?: PortConflict[]
  }
}

export interface PortAllocationResult {
  port: number
  type: string
  protocol: string
  success: boolean
  reason?: string
  conflictWith?: string
}

export interface AppPortBindingListQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  techStack?: string
  environment?: string
  tags?: string[]
  sortBy?: 'appName' | 'techStack' | 'status' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export interface AppPortBindingListResponse {
  success: boolean
  data: {
    bindings: AppPortBinding[]
    pagination: {
      currentPage: number
      pageSize: number
      total: number
      totalPages: number
    }
    statistics: AppPortBindingStatistics
  }
}

export interface AppPortBindingStatistics {
  total: number
  allocated: number
  pending: number
  conflicts: number
  byTechStack: Record<string, number>
  byEnvironment: Record<string, number>
  byStatus: Record<string, number>
  recentActivity: {
    date: string
    allocations: number
    releases: number
  }[]
}

// 端口分配策略配置
export interface PortAllocationStrategy {
  preferRandomStart: boolean
  conflictResolution: 'auto_reassign' | 'manual' | 'fail'
  maxRetries: number
  retryDelayMs: number
  allocationTimeout: number
  enablePortClustering: boolean
  enableLoadBalancing: boolean
  techStackPreferences: Record<string, {
    preferredRange: 'frontend' | 'backend' | 'auto'
    portOffset: number
  }>
}

// 端口冲突信息
export interface PortConflict {
  port: number
  existingBinding: {
    id: string
    appName: string
    type: string
    protocol: string
  }
  newRequirement: {
    bindingId: string
    appName: string
    type: string
    protocol: string
  }
  severity: 'high' | 'medium' | 'low'
  autoResolvable: boolean
  suggestedActions: string[]
}

// API响应基础类型
export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: {
    code: string
    details?: any
  }
  timestamp: string
}

// 批量操作相关类型
export interface BatchAllocatePortsRequest {
  bindingIds: string[]
  strategy?: Partial<PortAllocationStrategy>
  forceReallocation?: boolean
}

export interface BatchAllocatePortsResponse {
  success: boolean
  data: {
    successful: {
      bindingId: string
      allocatedPorts: AllocatedPort[]
    }[]
    failed: {
      bindingId: string
      error: string
      reason: string
    }[]
    conflicts: PortConflict[]
  }
}

export interface ReleasePortRequest {
  bindingId: string
  ports?: number[] // 如果不指定，则释放所有端口
}

export interface ImportBindingsRequest {
  bindings: CreateAppPortBindingRequest[]
  overwriteExisting?: boolean
  autoAllocate?: boolean
}

export interface ExportBindingsRequest {
  bindingIds?: string[]
  includeAllocatedPorts?: boolean
  format?: 'json' | 'csv' | 'yaml'
}

