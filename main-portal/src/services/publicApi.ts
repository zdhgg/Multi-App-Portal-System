import { apiService } from './api'
import type { ApiResponse } from './api'
import type { AppPort } from '@/types/app'

// 公共API相关的类型定义
export interface PublicApp {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  pinned?: boolean
  techStack: string
  status: string
  isRunning: boolean
  accessUrl?: string
  directUrl?: string
  accessPath?: string
  accessHost?: string
  accessProtocol?: 'http' | 'https'
  lanAccessUrl?: string | null
  port?: number
  // ✅ 新增：多端口支持
  frontend_port?: number
  backend_port?: number
  network?: {
    protocol?: 'http' | 'https'
    primaryPort?: number
    secondaryPorts?: number[]
  }
  ports?: AppPort[]
  uptime?: number
  lastUpdated?: string
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'unhealthy'
  timestamp: string
  services: {
    database: boolean
    appManager: boolean
    proxyService: boolean
  }
  apps: {
    total: number
    online: number
    running: number
    offline: number
  }
  uptime: number
  memory: {
    used: number
    total: number
  }
}

export interface SystemStats {
  apps: {
    total: number
    online: number
    offline: number
    running: number
  }
  techStacks: Record<string, number>
  recentActivity: Array<{
    timestamp: string
    type: string
    message: string
  }>
  performance: {
    avgResponseTime: number
    successRate: number
    errorRate: number
  }
}

export interface PortalConfig {
  title: string
  description: string
  version: string
  features: string[]
  maintenance: {
    enabled: boolean
    message?: string
    estimatedEnd?: string
  }
  announcements: Array<{
    id: string
    type: 'info' | 'warning' | 'success' | 'error'
    title: string
    message: string
    startDate: string
    endDate?: string
  }>
}

// 公共API服务类
export class PublicApiService {
  private resolveAnonymousMode(): boolean {
    const rawValue = (import.meta as any).env?.VITE_PUBLIC_API_ANONYMOUS
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return !import.meta.env.PROD
    }

    return ['1', 'true', 'on', 'yes'].includes(String(rawValue).trim().toLowerCase())
  }

  private getPublicRequestConfig(extra: Record<string, any> = {}): Record<string, any> {
    const anonymousMode = this.resolveAnonymousMode()
    return {
      requireAuth: !anonymousMode,
      ...extra
    }
  }

  /**
   * 获取应用列表（公开访问）
   */
  async getApps(): Promise<ApiResponse<{
    apps: PublicApp[]
    total: number
    lastUpdated: string
  }>> {
    return apiService.get<ApiResponse<any>>('/v2/public/apps', this.getPublicRequestConfig())
  }

  /**
   * 获取固定到首页的应用列表（公开访问）
   */
  async getPinnedApps(): Promise<ApiResponse<PublicApp[]>> {
    return apiService.get<ApiResponse<PublicApp[]>>('/v2/public/apps/pinned', this.getPublicRequestConfig())
  }

  /**
   * 获取单个应用信息（公开访问）
   */
  async getApp(nameOrId: string): Promise<ApiResponse<PublicApp>> {
    return apiService.get<ApiResponse<PublicApp>>(`/v2/public/apps/${nameOrId}`, this.getPublicRequestConfig())
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth(): Promise<ApiResponse<SystemHealth>> {
    return apiService.get<ApiResponse<SystemHealth>>('/v2/public/health', this.getPublicRequestConfig())
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats(): Promise<ApiResponse<SystemStats>> {
    return apiService.get<ApiResponse<SystemStats>>('/v2/public/stats', this.getPublicRequestConfig())
  }

  /**
   * 获取门户配置信息
   */
  async getPortalConfig(): Promise<ApiResponse<PortalConfig>> {
    return apiService.get<ApiResponse<PortalConfig>>('/v2/public/config', this.getPublicRequestConfig())
  }

  /**
   * 获取应用访问URL
   */
  async getAppAccessUrl(nameOrId: string): Promise<ApiResponse<{
    app: PublicApp
    accessUrl: string
    directUrl?: string
    isAvailable: boolean
  }>> {
    return apiService.get<ApiResponse<any>>(`/v2/public/apps/${nameOrId}/access`, this.getPublicRequestConfig())
  }

  /**
   * 检查应用可用性
   */
  async checkAppAvailability(nameOrId: string): Promise<ApiResponse<{
    isAvailable: boolean
    status: string
    responseTime?: number
    lastCheck: string
  }>> {
    return apiService.get<ApiResponse<any>>(`/v2/public/apps/${nameOrId}/availability`, this.getPublicRequestConfig())
  }

  /**
   * 获取技术栈统计
   */
  async getTechStackStats(): Promise<ApiResponse<Record<string, {
    count: number
    apps: Array<{
      id: string
      name: string
      status: string
    }>
  }>>> {
    return apiService.get<ApiResponse<any>>('/v2/public/tech-stacks', this.getPublicRequestConfig())
  }

  /**
   * 搜索应用
   */
  async searchApps(query: string, filters?: {
    techStack?: string
    status?: string
    limit?: number
  }): Promise<ApiResponse<{
    apps: PublicApp[]
    query: string
    total: number
    filters?: any
  }>> {
    const params = new URLSearchParams({ q: query })
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString())
        }
      })
    }

    return apiService.get<ApiResponse<any>>(`/v2/public/search?${params.toString()}`, this.getPublicRequestConfig())
  }

  /**
   * 获取应用运行时间统计
   */
  async getUptimeStats(nameOrId: string, period: '24h' | '7d' | '30d' = '24h'): Promise<ApiResponse<{
    app: PublicApp
    period: string
    uptime: number
    downtime: number
    availability: number
    incidents: Array<{
      start: string
      end?: string
      duration: number
      reason?: string
    }>
  }>> {
    return apiService.get<ApiResponse<any>>(`/v2/public/apps/${nameOrId}/uptime?period=${period}`, this.getPublicRequestConfig())
  }

  /**
   * 上报应用访问记录
   */
  async recordAppAccess(nameOrId: string, metadata?: {
    userAgent?: string
    referrer?: string
    timestamp?: string
  }): Promise<ApiResponse> {
    return apiService.post<ApiResponse>(`/v2/public/apps/${nameOrId}/access-log`, {
      timestamp: new Date().toISOString(),
      ...metadata
    }, this.getPublicRequestConfig({
      showErrorMessage: false // 静默记录，不干扰用户体验
    }))
  }

  /**
   * 获取系统公告
   */
  async getAnnouncements(): Promise<ApiResponse<Array<{
    id: string
    type: 'info' | 'warning' | 'success' | 'error'
    title: string
    message: string
    startDate: string
    endDate?: string
    priority: number
  }>>> {
    return apiService.get<ApiResponse<any>>('/v2/public/announcements', this.getPublicRequestConfig())
  }

  /**
   * 检查系统维护状态
   */
  async getMaintenanceStatus(): Promise<ApiResponse<{
    inMaintenance: boolean
    message?: string
    estimatedEnd?: string
    affectedServices?: string[]
  }>> {
    return apiService.get<ApiResponse<any>>('/v2/public/maintenance', this.getPublicRequestConfig())
  }
}

// 创建公共API服务实例
export const publicApiService = new PublicApiService()
