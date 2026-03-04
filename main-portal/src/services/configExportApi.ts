import { apiService } from './api'
import type { ApiResponse } from './api'

export interface BackupInfo {
  id: string
  name: string
  description?: string
  createdAt: string
  size: number
  filePath: string
  includedApps: string[]
  metadata: {
    configurationsCount: number
    environmentsCount: number
    templatesCount: number
  }
}

export interface BackupCreateOptions {
  includeEnvironments?: boolean
  includeTemplates?: boolean
  includeSensitiveData?: boolean
  appIds?: string[]
}

class ConfigExportApiService {
  async createBackup(options: BackupCreateOptions = {}): Promise<ApiResponse<BackupInfo>> {
    return apiService.post<ApiResponse<BackupInfo>>('/config-export/backup', options)
  }

  async listBackups(): Promise<ApiResponse<BackupInfo[]>> {
    return apiService.get<ApiResponse<BackupInfo[]>>('/config-export/backups')
  }

  async deleteBackup(id: string): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`/config-export/backups/${id}`)
  }

  async restoreBackup(id: string, opts: { overwriteExisting?: boolean; validateBeforeImport?: boolean; mergeEnvironments?: boolean; createBackup?: boolean } = {}): Promise<ApiResponse<any>> {
    return apiService.post<ApiResponse<any>>(`/config-export/backups/${id}/restore`, opts)
  }

  async importFromFile(file: File, options: { overwriteExisting?: boolean; validateBeforeImport?: boolean; mergeEnvironments?: boolean; createBackup?: boolean } = {}): Promise<ApiResponse<any>> {
    const form = new FormData()
    form.append('configFile', file)
    Object.entries(options).forEach(([k, v]) => { if (v !== undefined) form.append(k, String(v)) })
    return apiService.upload<ApiResponse<any>>('/config-export/import', form)
  }
}

export const configExportApiService = new ConfigExportApiService()

