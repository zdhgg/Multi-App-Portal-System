import { apiService } from './api'
import type { ApiResponse } from './api'

// 用户设置相关的类型定义
export interface UserSettings {
  id?: string
  userId?: string
  presetPaths: PresetPath[]
  defaultScanPath?: string
  recentPaths: string[]
  preferences: {
    smartFilter: boolean
    realTimePreview: boolean
    maxRecentPaths: number
  }
  createdAt?: string
  updatedAt?: string
}

export interface PresetPath {
  path: string
  description: string
  category: 'common' | 'project' | 'workspace' | 'custom'
  isDefault?: boolean
}

// 默认配置
export const DEFAULT_USER_SETTINGS: UserSettings = {
  presetPaths: [
    { path: 'D:\\Projects', description: '项目根目录', category: 'project', isDefault: true },
    { path: 'D:\\Development', description: '开发目录', category: 'workspace', isDefault: true },
    { path: 'C:\\Code', description: '代码目录', category: 'common', isDefault: true },
    { path: 'E:\\WorkSpace', description: '工作空间', category: 'workspace', isDefault: true }
  ],
  recentPaths: [],
  preferences: {
    smartFilter: true,
    realTimePreview: true,
    maxRecentPaths: 10
  }
}

// 用户设置API服务类
export class UserSettingsApiService {

  /**
   * 获取用户设置
   */
  async getUserSettings(): Promise<ApiResponse<UserSettings>> {
    try {
      const response = await apiService.get<ApiResponse<UserSettings>>('/v2/config/user-settings', {
        requireAuth: true // Phase 3: RBAC 需要认证
      })
      
      // 如果没有设置，返回默认设置
      if (!response.success || !response.data) {
        return {
          success: true,
          data: DEFAULT_USER_SETTINGS,
          message: 'Using default settings'
        }
      }
      
      return response
    } catch (error) {
      console.warn('Failed to load user settings, using defaults:', error)
      return {
        success: true,
        data: DEFAULT_USER_SETTINGS,
        message: 'Using default settings due to error'
      }
    }
  }

  /**
   * 更新用户设置
   */
  async updateUserSettings(settings: Partial<UserSettings>): Promise<ApiResponse<UserSettings>> {
    return apiService.put<ApiResponse<UserSettings>>('/v2/config/user-settings', settings, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 添加预设路径
   */
  async addPresetPath(path: PresetPath): Promise<ApiResponse<UserSettings>> {
    return apiService.post<ApiResponse<UserSettings>>('/v2/config/user-settings/preset-paths', path, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 删除预设路径
   */
  async removePresetPath(pathValue: string): Promise<ApiResponse<UserSettings>> {
    return apiService.delete<ApiResponse<UserSettings>>(`/v2/config/user-settings/preset-paths/${encodeURIComponent(pathValue)}`, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 添加到最近使用路径
   */
  async addRecentPath(path: string): Promise<ApiResponse<UserSettings>> {
    return apiService.post<ApiResponse<UserSettings>>('/v2/config/user-settings/recent-paths', { path }, {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 清空最近使用路径
   */
  async clearRecentPaths(): Promise<ApiResponse<UserSettings>> {
    return apiService.delete<ApiResponse<UserSettings>>('/v2/config/user-settings/recent-paths', {
      requireAuth: true // Phase 3: RBAC 需要认证
    })
  }

  /**
   * 获取系统推荐路径（基于操作系统）
   */
  getSystemRecommendedPaths(): PresetPath[] {
    const platform = window.navigator?.platform?.toLowerCase() || 'win32'
    const username = (window.navigator as any)?.userAgentData?.platform || 'user'
    
    if (platform.includes('win')) {
      return [
        { path: 'D:\\Projects', description: '项目根目录', category: 'project' },
        { path: 'D:\\Development', description: '开发目录', category: 'workspace' },
        { path: 'C:\\Code', description: '代码目录', category: 'common' },
        { path: `C:\\Users\\${username}\\Documents\\Projects`, description: '文档项目目录', category: 'project' },
        { path: 'E:\\WorkSpace', description: '工作空间', category: 'workspace' }
      ]
    } else if (platform.includes('mac')) {
      return [
        { path: '/Users/' + username + '/Projects', description: '项目目录', category: 'project' },
        { path: '/Users/' + username + '/Development', description: '开发目录', category: 'workspace' },
        { path: '/Users/' + username + '/Code', description: '代码目录', category: 'common' },
        { path: '/Users/' + username + '/Documents/Projects', description: '文档项目目录', category: 'project' }
      ]
    } else {
      return [
        { path: '/home/' + username + '/Projects', description: '项目目录', category: 'project' },
        { path: '/home/' + username + '/Development', description: '开发目录', category: 'workspace' },
        { path: '/home/' + username + '/Code', description: '代码目录', category: 'common' },
        { path: '/opt/projects', description: '系统项目目录', category: 'common' }
      ]
    }
  }
}

// 导出服务实例
export const userSettingsApiService = new UserSettingsApiService()
