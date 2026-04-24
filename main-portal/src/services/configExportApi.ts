import { apiService } from './api'
import type { ApiResponse } from './api'

export interface BackupInfo {
  id: string
  name: string
  description?: string
  createdAt: string
  size: number
  filePath: string
  originalFilePath?: string
  includedApps: string[]
  source: 'configuration-export' | 'script-registry'
  backupType: string
  format: 'json' | 'zip' | 'directory'
  metadata: {
    configurationsCount: number
    environmentsCount: number
    templatesCount: number
    creator?: string
    systemVersion?: string
    version?: string
    machine?: string
  }
  status?: string
  compressed?: boolean
  checksum?: string
  filesCount?: number
  includedFiles?: string[]
  available?: boolean
}

export interface BackupCreateOptions {
  mode?: 'configuration' | 'archive'
  backupName?: string
  outputDirectory?: string
  archiveType?: 'full' | 'incremental' | 'config' | 'logs' | 'api' | 'custom'
  includePaths?: string[]
  excludePaths?: string[]
  compress?: boolean
  includeEnvironments?: boolean
  includeTemplates?: boolean
  includeSensitiveData?: boolean
  appIds?: string[]
}

export interface OfflineRestoreLaunchResult {
  backupId: string
  backupName: string
  assistantPath: string
  launcherPid: number | null
  exitedEarly: boolean
  exitCode: number | null
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

  async launchOfflineRestoreAssistant(id: string): Promise<ApiResponse<OfflineRestoreLaunchResult>> {
    return apiService.post<ApiResponse<OfflineRestoreLaunchResult>>(`/config-export/backups/${id}/launch-offline-restore`)
  }

  async importFromFile(file: File, options: { overwriteExisting?: boolean; validateBeforeImport?: boolean; mergeEnvironments?: boolean; createBackup?: boolean } = {}): Promise<ApiResponse<any>> {
    const form = new FormData()
    form.append('configFile', file)
    Object.entries(options).forEach(([k, v]) => { if (v !== undefined) form.append(k, String(v)) })
    return apiService.upload<ApiResponse<any>>('/config-export/import', form)
  }
}

export const configExportApiService = new ConfigExportApiService()
