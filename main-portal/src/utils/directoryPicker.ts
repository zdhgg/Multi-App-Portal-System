import { isLocalAccess } from './networkUtils'
import { createApp, h } from 'vue'
import FolderBrowser from '@/components/FolderBrowser.vue'
import {
  filesystemApiService,
  type FolderSelectionResult,
  type SelectFolderOptions
} from '@/services/filesystemApi'

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeMessage = Reflect.get(error, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage.trim()
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return ''
}

export const canUseBrowserDirectoryPickerInCurrentContext = (): boolean => {
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext && 'showDirectoryPicker' in window)
}

export const canUseNativeDirectoryPickerInCurrentContext = (): boolean => {
  return isLocalAccess()
}

export const isServerDirectoryPickerContext = (): boolean => {
  return !canUseNativeDirectoryPickerInCurrentContext()
}

export const getDirectoryPickerModeLabel = (): string => {
  return isServerDirectoryPickerContext() ? '服务器目录模式' : '本机目录模式'
}

export const getDirectoryPickerActionLabel = (): string => {
  return isServerDirectoryPickerContext() ? '选择服务器目录' : '选择目录'
}

export const getDirectoryPickerAddActionLabel = (): string => {
  return isServerDirectoryPickerContext() ? '选择服务器目录并添加' : '选择目录并添加'
}

export const getDirectoryPickerDialogTitle = (): string => {
  return isServerDirectoryPickerContext() ? '选择服务器目录' : '选择文件夹'
}

export const getDirectoryPickerBrowseDialogTitle = (): string => {
  return isServerDirectoryPickerContext() ? '选择服务器扫描路径' : '选择扫描路径'
}

export const getDirectoryPickerAlertTitle = (): string => {
  return isServerDirectoryPickerContext() ? '当前正在浏览服务器目录' : '文件夹选择功能'
}

export const getDirectoryPickerPathPlaceholder = (): string => {
  return isServerDirectoryPickerContext() ? '输入服务器上的绝对路径...' : '输入路径...'
}

export const getDirectoryPickerSelectedLabel = (): string => {
  return isServerDirectoryPickerContext() ? '已选择服务器目录:' : '已选择:'
}

export const getDirectoryPickerSelectCurrentLabel = (): string => {
  return isServerDirectoryPickerContext() ? '选择当前服务器目录' : '选择当前目录'
}

export const getDirectoryPickerCancelMessage = (): string => {
  return isServerDirectoryPickerContext() ? '已取消服务器目录选择' : '已取消目录选择'
}

export const formatDirectoryPickerSelectionMessage = (path: string): string => {
  return isServerDirectoryPickerContext() ? `已选择服务器目录: ${path}` : `已选择目录: ${path}`
}

export const getNativeDirectoryPickerUnavailableMessage = (): string => {
  if (!isLocalAccess()) {
    return '当前通过内网地址远程访问，系统目录选择窗口只会显示在服务器本机，无法可靠出现在当前浏览器前。请直接输入服务器上的绝对路径，或在服务器本机使用 http://localhost:8002 打开页面后再选择目录。'
  }

  return '当前环境不适合使用后端原生目录选择，请手动输入完整路径。'
}

export const getDirectoryPickerCompatibilityDescription = (): string => {
  if (!canUseNativeDirectoryPickerInCurrentContext()) {
    return '当前通过内网远程访问，将打开网页式服务器目录浏览器。这里选择的是部署服务器上的路径，不是你当前电脑的本地路径；如需使用系统目录选择窗口，请在服务器本机使用 http://localhost:8002 打开页面。'
  }

  if (canUseBrowserDirectoryPickerInCurrentContext()) {
    return '当前环境支持浏览器目录选择，但浏览器仍无法稳定返回 Windows 绝对路径，建议优先使用后端原生目录选择。'
  }

  if (!isLocalAccess()) {
    return '当前通过内网 HTTP 地址远程访问，浏览器目录选择能力受限。建议在服务器本机使用 http://localhost:8002 打开页面，或直接输入服务器上的绝对路径。'
  }

  return '建议使用 Chrome/Edge 最新版，并尽量在本机使用 http://localhost:8002 访问，以获得更稳定的目录选择体验。'
}

export const getNativeDirectoryPickerFailureMessage = (error: unknown): string => {
  const errorMessage = extractErrorMessage(error)

  if (errorMessage.includes('所选目录不存在')) {
    return '后端原生目录选择返回了无效路径。请重启 portal-api 后重试；如果仍失败，请先手动输入完整路径。'
  }

  if (errorMessage.includes('原生目录选择失败')) {
    if (!isLocalAccess()) {
      return '系统目录选择失败，且当前是内网远程访问。请在服务器本机使用 http://localhost:8002 打开页面后重试，或直接输入服务器上的完整路径。'
    }

    return '后端原生目录选择失败。请手动输入完整路径，或刷新页面后重试。'
  }

  if (!isLocalAccess()) {
    return '当前是内网远程访问，无法可靠回退到本地目录选择。请在服务器本机使用 http://localhost:8002 打开页面后重试，或直接输入服务器上的完整路径。'
  }

  return errorMessage || '目录选择失败，请手动输入完整路径。'
}

const openWebDirectoryPicker = (
  startPath?: string,
  options: DirectoryPickerOptions = {}
): Promise<FolderSelectionResult> => {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ cancelled: true })
      return
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    let settled = false
    const app = createApp({
      render() {
        return h(FolderBrowser, {
          initialPath: startPath || '',
          showHidden: false,
          validateSelection: options.validateSelectedPath !== false,
          onSelect: (path: string) => finish({ cancelled: false, path, source: 'web' }),
          onClose: () => finish({ cancelled: true, source: 'web' })
        })
      }
    })

    const cleanup = () => {
      queueMicrotask(() => {
        app.unmount()
        container.remove()
      })
    }

    const finish = (result: FolderSelectionResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    app.mount(container)
  })
}

export const selectDirectoryWithBestEffort = async (
  startPath?: string,
  silent = false,
  options: DirectoryPickerOptions = {}
): Promise<FolderSelectionResult> => {
  if (canUseNativeDirectoryPickerInCurrentContext()) {
    const response = await filesystemApiService.selectFolder(startPath, silent, options)
    if (!response.success || !response.data) {
      throw new Error(response.message || '目录选择失败')
    }

    return response.data
  }

  return openWebDirectoryPicker(startPath, options)
}
export interface DirectoryPickerOptions extends SelectFolderOptions {}
