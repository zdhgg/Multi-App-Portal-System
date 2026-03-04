import { apiService, type ApiResponse } from './api'

export interface SystemSettingsMeta {
  versionToken: string
  updatedAt: string
}

export interface SystemSettingsPayload {
  settings: any
  versionToken: string
}

export interface SystemSettingsResponse extends SystemSettingsMeta {
  settings: any
}

export interface SystemStatistics {
  adminCount: number
  logTotal: number
  activeAlerts: number
  systemUptime: number
}

class SystemSettingsApiService {
  async get(): Promise<ApiResponse<SystemSettingsResponse>> {
    return apiService.get<ApiResponse<SystemSettingsResponse>>('/settings')
  }

  async save(payload: SystemSettingsPayload): Promise<ApiResponse<SystemSettingsResponse>> {
    return apiService.put<ApiResponse<SystemSettingsResponse>>('/settings', payload)
  }

  async getStatistics(): Promise<ApiResponse<SystemStatistics>> {
    return apiService.get<ApiResponse<SystemStatistics>>('/settings/statistics')
  }
}

export const systemSettingsApiService = new SystemSettingsApiService()

