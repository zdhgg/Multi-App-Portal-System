import { apiService } from './api'
import type { ApiResponse, PaginatedResponse, RequestConfig } from './api'

const BASE_PATH = '/v2/applications'

type ApplicationDto = {
  id: string
  name: string
  directory: string
  tech_stack?: string
  techStack?: {
    name?: string
    category?: string
    startCommand?: string
  } | string
  frontend_port?: number
  backend_port?: number
  network?: {
    primaryPort?: number
    secondaryPorts?: number[]
    protocol?: string
  }
  state?: string
  metadata?: {
    description?: string
    icon?: string
    color?: string
    createdAt?: number | string
    updatedAt?: number | string
    pinned?: boolean
    accessPath?: string
    access_path?: string
  }
  deploymentMode?: string
  pm2ProcessName?: string | null
  buildScript?: string
  build_script?: string
  [key: string]: any
}

// 应用相关的类型定义
export interface App {
  id: string
  name: string
  description?: string
  directory: string
  url?: string
  icon?: string
  color?: string
  tech_stack: string
  status: 'online' | 'offline' | 'error' | 'maintenance'
  frontend_port?: number
  backend_port?: number
  network?: {
    primaryPort: number
    secondaryPorts: number[]
    protocol: 'http' | 'https'
  }
  access_path?: string
  pinned_to_homepage?: boolean
  created_at: string
  updated_at: string
  build_script?: string
}

export interface AppCreateRequest {
  name: string
  description?: string
  directory: string
  url?: string
  icon?: string
  color?: string
  tech_stack: string
  // 兼容字段（旧）
  frontend_port?: number
  backend_port?: number
  // 推荐字段（新）
  primary_port?: number
  secondary_port?: number
  secondary_ports?: number[]
  // external-exe 启动脚本（如 D:\\CLIProxyAPI\\cli-proxy-api.exe）
  build_script?: string
}

export interface AppUpdateRequest {
  name?: string
  description?: string
  directory?: string
  url?: string
  icon?: string
  color?: string
  tech_stack?: string
  access_path?: string
  accessPath?: string
  build_script?: string
  status?: 'online' | 'offline' | 'error' | 'maintenance'
  frontend_port?: number
  backend_port?: number
  primaryPort?: number
  secondaryPorts?: number[]
  protocol?: 'http' | 'https'
}

export interface AppStatusUpdateRequest {
  status: 'online' | 'offline' | 'error' | 'maintenance'
  mode?: 'development' | 'production'
}

export interface AppQueryParams {
  page?: number
  limit?: number
  status?: string
  techStack?: string
  search?: string
}

export interface AppStats {
  total: number
  online: number
  offline: number
  error: number
  maintenance: number
  byTechStack: Record<string, number>
}

export interface PortDetectionResult {
  strategy: string
  frontendPort?: number
  backendPort?: number
  suggestions: number[]
  conflicts: number[]
}

export interface PortConflictCheck {
  conflicts: Array<{
    port: number
    reason: string
    process?: string
  }>
  hasConflicts: boolean
}

export interface ImportCandidate {
  name: string
  description?: string
  directory: string
  tech_stack: string
  icon?: string
  color?: string
  frontend_port?: number
  backend_port?: number
}

export interface ImportPrecheckItem {
  index: number
  canImport: boolean
  candidate: {
    name: string
    directory: string
    techStack: string
    description?: string
    icon?: string
    color?: string
    frontendPort?: number
    backendPort?: number
  }
  errors: string[]
  warnings: string[]
  duplicate?: {
    id: string
    name: string
  }
  portConflicts?: Array<{
    port: number
    reason: string
    process?: string
  }>
}

export interface ImportPrecheckResult {
  summary: {
    total: number
    importable: number
    blocked: number
  }
  items: ImportPrecheckItem[]
}

export interface BatchImportResult {
  precheck: ImportPrecheckResult
  created: Array<{
    index: number
    app: App
    candidate: ImportPrecheckItem['candidate']
  }>
  failed: Array<{
    index: number
    candidate: ImportPrecheckItem['candidate']
    error: string
    code?: string
  }>
  skipped: ImportPrecheckItem[]
  rolledBack: boolean
  rollbackErrors: Array<{
    appId: string
    appName: string
    error: string
  }>
  summary: {
    total: number
    importable: number
    created: number
    failed: number
    skipped: number
  }
}

export interface AppRuntimeLogs {
  appId: string
  target?: 'all' | 'frontend' | 'backend'
  lines: string[]
}

// 应用API服务类
export class AppsApiService {

  /**
   * 获取应用列表（支持分页和过滤）
   */
  async getApps(params: AppQueryParams = {}): Promise<PaginatedResponse<App>> {
    const queryString = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryString.append(key, value.toString())
      }
    })

    const endpoint = `${BASE_PATH}${queryString.toString() ? `?${queryString.toString()}` : ''}`
    const response = await apiService.get<any>(endpoint, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })

    const rawApps: ApplicationDto[] = Array.isArray(response?.data) ? response.data : []
    const apps = rawApps.map(mapApplicationDtoToApp)

    const pagination = response?.pagination ?? {}

    return {
      success: response?.success ?? true,
      data: apps,
      pagination: {
        page: pagination.page ?? 1,
        limit: pagination.limit ?? apps.length,
        total: pagination.total ?? apps.length,
        totalPages: pagination.totalPages ?? (apps.length > 0 ? 1 : 0)
      },
      message: response?.message
    }
  }

  /**
   * 获取单个应用详情
   */
  async getApp(id: string): Promise<ApiResponse<App>> {
    const response = await apiService.get<any>(`${BASE_PATH}/${id}`, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })

    return {
      success: response?.success ?? true,
      data: response?.data ? mapApplicationDtoToApp(response.data as ApplicationDto) : undefined,
      error: response?.error,
      message: response?.message
    }
  }

  /**
   * 创建应用
   */
  async createApp(data: AppCreateRequest): Promise<ApiResponse<App>> {
    const payload = mapCreateRequestToDto(data)
    return apiService.post<ApiResponse<App>>(BASE_PATH, payload)
  }

  /**
   * 从检测结果创建应用
   */
  async createAppFromDetection(data: {
    scanId: string
    detectionId: string
    name?: string
    description?: string
    icon?: string
    color?: string
  }): Promise<ApiResponse<App>> {
    return apiService.post<ApiResponse<App>>(`${BASE_PATH}/from-detection`, data)
  }

  /**
   * 更新应用信息
   */
  async updateApp(id: string, data: AppUpdateRequest): Promise<ApiResponse<App>> {
    const payload = mapUpdateRequestToDto(data)
    return apiService.put<ApiResponse<App>>(`${BASE_PATH}/${id}`, payload)
  }

  /**
   * 更新应用状态（启动/停止应用）
   */
  async updateAppStatus(id: string, data: AppStatusUpdateRequest): Promise<ApiResponse<App & { url?: string; mode?: string }>> {
    return apiService.patch<ApiResponse<App & { url?: string; mode?: string }>>(`${BASE_PATH}/${id}/status`, data)
  }

  /**
   * 更新应用固定到首页状态
   */
  async updateAppPinStatus(id: string, pinned: boolean): Promise<ApiResponse<App>> {
    return apiService.patch<ApiResponse<App>>(`${BASE_PATH}/${id}/pin`, {
      pinned_to_homepage: pinned
    })
  }

  /**
   * 获取固定到首页的应用
   */
  async getPinnedApps(): Promise<ApiResponse<App[]>> {
    return apiService.get<ApiResponse<App[]>>(`${BASE_PATH}/pinned`, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 批量更新应用状态
   */
  async batchUpdateAppStatus(ids: string[], status: string): Promise<ApiResponse<{ updated: number; total: number }>> {
    return apiService.patch<ApiResponse<{ updated: number; total: number }>>(`${BASE_PATH}/batch/status`, {
      ids,
      status
    })
  }

  /**
   * 删除应用
   */
  async deleteApp(id: string): Promise<ApiResponse> {
    return apiService.delete<ApiResponse>(`${BASE_PATH}/${id}`)
  }

  /**
   * 获取应用统计信息
   */
  async getAppStats(): Promise<ApiResponse<AppStats>> {
    return apiService.get<ApiResponse<AppStats>>(`${BASE_PATH}/stats/processes`)
  }

  /**
   * 按技术栈分组获取应用
   */
  async getAppsByTechStack(): Promise<ApiResponse<Record<string, App[]>>> {
    return apiService.get<ApiResponse<Record<string, App[]>>>(`${BASE_PATH}/group/tech-stack`)
  }

  /**
   * 检测应用目录
   */
  async detectAppDirectory(id: string): Promise<ApiResponse<any>> {
    return apiService.post<ApiResponse<any>>(`${BASE_PATH}/${id}/detect`)
  }

  /**
   * 启动应用
   */
  async startApp(
    id: string,
    mode: 'development' | 'production' = 'development',
    config: RequestConfig = {}
  ): Promise<ApiResponse<{
    app: App
    process: any
    url: string
    mode: string
  }>> {
    return apiService.put<ApiResponse<any>>(`${BASE_PATH}/${id}/start`, { mode }, config)
  }

  /**
   * 停止应用
   */
  async stopApp(id: string, config: RequestConfig = {}): Promise<ApiResponse<App>> {
    return apiService.put<ApiResponse<App>>(`${BASE_PATH}/${id}/stop`, undefined, config)
  }

  /**
   * 重启应用
   */
  async restartApp(id: string): Promise<ApiResponse<{
    app: App
    process: any
    url: string
  }>> {
    return apiService.post<ApiResponse<any>>(`${BASE_PATH}/${id}/restart`)
  }

  /**
   * 获取应用运行状态
   */
  async getAppStatus(id: string): Promise<ApiResponse<{
    app: App
    isRunning: boolean
    process: any
    url: string | null
  }>> {
    return apiService.get<ApiResponse<any>>(`${BASE_PATH}/${id}/status`)
  }

  /**
   * 获取所有运行中的应用
   */
  async getRunningApps(): Promise<ApiResponse<Array<{
    app: App
    process: any
    url: string | null
  }>>> {
    return apiService.get<ApiResponse<any>>(`${BASE_PATH}/processes/running`)
  }

  /**
   * 获取应用运行日志（非 PM2 直接启动日志）
   */
  async getRuntimeLogs(
    id: string,
    lines: number = 200,
    target: 'all' | 'frontend' | 'backend' = 'all'
  ): Promise<ApiResponse<AppRuntimeLogs>> {
    const safeLines = Math.max(20, Math.min(2000, Math.floor(Number(lines) || 200)))
    const safeTarget = target === 'frontend' || target === 'backend' ? target : 'all'
    return apiService.get<ApiResponse<AppRuntimeLogs>>(`${BASE_PATH}/${id}/logs?lines=${safeLines}&target=${safeTarget}`)
  }

  /**
   * 检测应用端口配置
   */
  async detectAppPorts(id: string): Promise<ApiResponse<PortDetectionResult>> {
    return apiService.get<ApiResponse<PortDetectionResult>>(`${BASE_PATH}/${id}/ports/detect`)
  }

  /**
   * 检查端口冲突
   */
  async checkPortConflicts(ports: number[]): Promise<ApiResponse<PortConflictCheck>> {
    const response = await apiService.post<ApiResponse<any>>(`${BASE_PATH}/ports/check-conflicts`, {
      ports
    })

    const rawData = response?.data
    const rawConflicts = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData?.conflicts)
        ? rawData.conflicts
        : []

    const conflicts = rawConflicts
      .map((item: any) => ({
        port: Number(item?.port),
        reason: item?.reason || item?.details || '端口冲突',
        process: item?.process || item?.processName
      }))
      .filter((item: { port: number }) => Number.isInteger(item.port) && item.port > 0)

    const hasConflicts = typeof rawData?.hasConflicts === 'boolean'
      ? rawData.hasConflicts
      : conflicts.length > 0

    return {
      success: response?.success ?? true,
      data: {
        conflicts,
        hasConflicts
      },
      error: response?.error,
      message: response?.message
    }
  }

  /**
   * 更新应用端口配置
   */
  async updateAppPorts(id: string, data: {
    frontend_port?: number
    backend_port?: number
    strategy?: 'use_configured' | 'use_allocated' | 'manual'
  }): Promise<ApiResponse<App>> {
    return apiService.put<ApiResponse<App>>(`${BASE_PATH}/${id}/ports`, data)
  }

  /**
   * 强制清理端口
   */
  async cleanupPort(port: number): Promise<ApiResponse<{
    port: number
    wasOccupied: boolean
    released?: boolean
  }>> {
    return apiService.post<ApiResponse<any>>(`${BASE_PATH}/ports/${port}/cleanup`)
  }

  /**
   * 清理开发端口
   */
  async cleanupDevelopmentPorts(): Promise<ApiResponse<{
    results: Array<{
      port: number
      success: boolean
      message: string
    }>
    totalCleaned: number
    totalAttempted: number
  }>> {
    return apiService.post<ApiResponse<any>>(`${BASE_PATH}/ports/cleanup-dev`)
  }

  /**
   * 检查端口状态
   */
  async getPortStatus(port: number): Promise<ApiResponse<{
    port: number
    occupied: boolean
    status: 'occupied' | 'free'
  }>> {
    return apiService.get<ApiResponse<any>>(`${BASE_PATH}/ports/${port}/status`)
  }

  /**
   * 导入前预检查（重复目录、端口冲突、字段合法性）
   */
  async precheckImport(candidates: ImportCandidate[]): Promise<ApiResponse<ImportPrecheckResult>> {
    return apiService.post<ApiResponse<ImportPrecheckResult>>(`${BASE_PATH}/import/precheck`, {
      candidates
    })
  }

  /**
   * 从检测结果批量导入应用
   */
  async batchImportFromDetection(
    candidates: ImportCandidate[],
    options: { rollbackOnError?: boolean } = {}
  ): Promise<ApiResponse<BatchImportResult>> {
    const response = await apiService.post<ApiResponse<any>>(`${BASE_PATH}/import/batch`, {
      candidates,
      rollbackOnError: options.rollbackOnError !== false
    })

    const data = response?.data || {}
    const created = Array.isArray(data?.created)
      ? data.created.map((item: any) => ({
          index: item?.index,
          app: item?.app ? mapApplicationDtoToApp(item.app as ApplicationDto) : item?.app,
          candidate: item?.candidate
        }))
      : []

    return {
      success: response?.success ?? true,
      data: {
        ...data,
        created
      } as BatchImportResult,
      error: response?.error,
      message: response?.message
    }
  }
}

// 创建应用API服务实例
export const appsApiService = new AppsApiService()

function mapCreateRequestToDto(request: AppCreateRequest) {
  const primaryPort = request.primary_port ?? request.frontend_port
  const secondaryPort = request.secondary_port ?? request.backend_port
  const secondaryPorts = Array.isArray(request.secondary_ports) && request.secondary_ports.length > 0
    ? request.secondary_ports
    : secondaryPort !== undefined && secondaryPort !== null
      ? [secondaryPort]
      : undefined

  return {
    name: request.name,
    directory: request.directory,
    description: request.description,
    icon: request.icon,
    color: request.color,
    techStack: request.tech_stack,
    primaryPort,
    secondaryPorts,
    buildScript: request.build_script
  }
}

function mapUpdateRequestToDto(request: AppUpdateRequest) {
  const payload: Record<string, any> = {}

  if (request.name !== undefined) payload.name = request.name
  if (request.description !== undefined) payload.description = request.description
  if (request.directory !== undefined) payload.directory = request.directory
  if (request.icon !== undefined) payload.icon = request.icon
  if (request.color !== undefined) payload.color = request.color
  if (request.tech_stack !== undefined) payload.techStack = request.tech_stack
  if (request.access_path !== undefined) payload.accessPath = request.access_path
  if (request.accessPath !== undefined) payload.accessPath = request.accessPath
  if (request.build_script !== undefined) payload.buildScript = request.build_script

  return payload
}

function mapApplicationDtoToApp(dto: ApplicationDto): App {
  const metadata = dto.metadata ?? {}
  const network = dto.network ?? {}
  const normalizedTechStack = normalizeTechStack(dto.techStack) || normalizeTechStack(dto.tech_stack)
  const frontendPort = typeof network.primaryPort === 'number'
    ? network.primaryPort
    : typeof dto.frontend_port === 'number'
      ? dto.frontend_port
      : undefined
  const backendPort = Array.isArray(network.secondaryPorts) && network.secondaryPorts.length > 0
    ? network.secondaryPorts[0]
    : typeof dto.backend_port === 'number'
      ? dto.backend_port
      : undefined

  return {
    id: dto.id,
    name: dto.name,
    description: metadata.description ?? '',
    directory: dto.directory,
    url: undefined,
    icon: metadata.icon,
    color: metadata.color,
    tech_stack: normalizedTechStack,
    status: mapStateToStatus(dto.state),
    frontend_port: frontendPort,
    backend_port: backendPort,
    network: network.primaryPort !== undefined ? {
      primaryPort: network.primaryPort,
      secondaryPorts: Array.isArray(network.secondaryPorts) ? network.secondaryPorts : [],
      protocol: (network.protocol === 'http' || network.protocol === 'https') ? network.protocol : 'http'
    } : undefined,
    access_path: (metadata as any).accessPath ?? (metadata as any).access_path ?? undefined,
    build_script: dto.build_script ?? dto.buildScript,
    pinned_to_homepage: Boolean((metadata as any).pinned),
    created_at: toIsoString(metadata.createdAt),
    updated_at: toIsoString(metadata.updatedAt)
  }
}

function normalizeTechStack(techStack?: ApplicationDto['techStack']): string {
  if (!techStack) return ''
  if (typeof techStack === 'string') return techStack
  return techStack.name ?? ''
}

function mapStateToStatus(state?: string): App['status'] {
  switch (state) {
    case 'running':
      return 'online'
    case 'failed':
      return 'error'
    case 'maintenance':
      return 'maintenance'
    default:
      return 'offline'
  }
}

function toIsoString(value?: number | string): string {
  if (!value && value !== 0) return ''
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString()
  }
  // 尝试解析已有字符串
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString()
  }
  return String(value)
}
