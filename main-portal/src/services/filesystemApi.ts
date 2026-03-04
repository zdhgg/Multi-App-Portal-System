import { apiService } from './api'
import type { ApiResponse } from './api'

// 文件系统相关的类型定义
export interface FileSystemItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  lastModified?: string
  isHidden: boolean
  hasPermission: boolean
}

export interface BrowseResult {
  currentPath: string
  parentPath: string | null
  items: FileSystemItem[]
}

export interface PathValidation {
  path: string
  exists: boolean
  isDirectory: boolean
  isAccessible: boolean
  isValid: boolean
  errorMessage?: string
}

export interface HomeDirectory {
  path: string
  name: string
}

export interface FolderSelectionResult {
  cancelled: boolean
  path?: string
  source?: 'native'
}

export interface ExeFileItem {
  name: string
  path: string
}

export interface ExeScanResult {
  directory: string
  files: ExeFileItem[]
}

// 文件系统API服务类
export class FilesystemApiService {

  /**
   * 浏览文件系统
   */
  async browse(params?: {
    path?: string
    showHidden?: boolean
  }): Promise<ApiResponse<BrowseResult>> {
    const queryString = new URLSearchParams()
    if (params?.path) {
      queryString.append('path', params.path)
    }
    if (params?.showHidden !== undefined) {
      queryString.append('showHidden', params.showHidden.toString())
    }

    const endpoint = `/filesystem/browse${queryString.toString() ? `?${queryString.toString()}` : ''}`
    return apiService.get<ApiResponse<BrowseResult>>(endpoint, {
      requireAuth: true // Phase 3: filesystem 需要 admin 权限
    })
  }

  /**
   * 验证路径
   */
  async validatePath(path: string): Promise<ApiResponse<PathValidation>> {
    return apiService.post<ApiResponse<PathValidation>>('/filesystem/validate', { path })
  }

  /**
   * 获取用户主目录
   */
  async getHomeDirectory(): Promise<ApiResponse<HomeDirectory>> {
    return apiService.get<ApiResponse<HomeDirectory>>('/filesystem/home')
  }

  /**
   * 创建目录
   */
  async createDirectory(path: string): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>('/filesystem/mkdir', { path })
  }

  /**
   * 删除文件或目录
   */
  async deleteItem(path: string): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`/filesystem/item`, {
      body: JSON.stringify({ path })
    })
  }

  /**
   * 重命名文件或目录
   */
  async renameItem(oldPath: string, newPath: string): Promise<ApiResponse<void>> {
    return apiService.put<ApiResponse<void>>('/filesystem/rename', {
      oldPath,
      newPath
    })
  }

  /**
   * 获取文件内容
   */
  async getFileContent(path: string): Promise<ApiResponse<string>> {
    return apiService.get<ApiResponse<string>>(`/filesystem/file/content`, {
      headers: {
        'X-File-Path': encodeURIComponent(path)
      }
    })
  }

  /**
   * 保存文件内容
   */
  async saveFileContent(path: string, content: string): Promise<ApiResponse<void>> {
    return apiService.put<ApiResponse<void>>('/filesystem/file/content', {
      path,
      content
    })
  }

  /**
   * 在系统文件管理器中打开文件夹
   */
  async openFolder(path: string): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>('/filesystem/open-folder', { path })
  }

  /**
   * 打开后端原生目录选择器（优先返回绝对路径）
   */
  async selectFolder(startPath?: string, silent = false): Promise<ApiResponse<FolderSelectionResult>> {
    const payload = startPath ? { startPath } : {}
    return apiService.post<ApiResponse<FolderSelectionResult>>('/filesystem/select-folder', payload, {
      timeout: 180000,
      showErrorMessage: !silent
    })
  }

  /**
   * 扫描指定目录下的 .exe 文件（最多 2 层深度）
   */
  async scanExeFiles(directory: string): Promise<ApiResponse<ExeScanResult>> {
    const encoded = encodeURIComponent(directory)
    return apiService.get<ApiResponse<ExeScanResult>>(`/filesystem/scan-exe-files?path=${encoded}`, {
      requireAuth: true
    })
  }
}

// 创建文件系统API服务实例
export const filesystemApiService = new FilesystemApiService()
