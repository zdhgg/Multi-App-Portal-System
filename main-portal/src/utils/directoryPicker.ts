import { isLocalAccess } from './networkUtils'
import { createApp, h } from 'vue'
import FolderBrowser from '@/components/FolderBrowser.vue'
import { filesystemApiService, type FolderSelectionResult } from '@/services/filesystemApi'

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

export const getNativeDirectoryPickerUnavailableMessage = (): string => {
  if (!isLocalAccess()) {
    return '当前通过局域网地址访问，“选择目录”会在服务器本机弹出系统窗口，无法可靠显示在当前浏览器前。请直接手动输入服务器上的绝对路径，或在服务器本机使用 http://localhost:8002 打开页面后再选择目录。'
  }

  return '当前环境不适合使用后端原生目录选择，请手动输入完整路径。'
}

export const getDirectoryPickerCompatibilityDescription = (): string => {
  if (!canUseNativeDirectoryPickerInCurrentContext()) {
    return '当前通过局域网远程访问，将使用网页式服务器目录浏览器；如需选择客户端本机目录，请在服务器本机使用 http://localhost:8002 打开页面。'
  }

  if (canUseBrowserDirectoryPickerInCurrentContext()) {
    return '当前环境支持浏览器目录选择，但浏览器仍无法稳定返回 Windows 绝对路径，建议优先使用后端原生目录选择。'
  }

  if (!isLocalAccess()) {
    return '当前通过局域网 HTTP 地址访问，浏览器目录选择能力受限。建议在服务器本机使用 http://localhost:8002 打开页面，或直接手动输入服务器上的绝对路径。'
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
      return '后端原生目录选择失败，且当前通过局域网地址访问，浏览器无法可靠回退到本地目录选择。请在服务器本机使用 http://localhost:8002 打开页面后重试，或手动输入完整路径。'
    }

    return '后端原生目录选择失败。请手动输入完整路径，或刷新页面后重试。'
  }

  if (!isLocalAccess()) {
    return '当前通过局域网地址访问，浏览器无法可靠回退到本地目录选择。请在服务器本机使用 http://localhost:8002 打开页面后重试，或手动输入完整路径。'
  }

  return errorMessage || '目录选择失败，请手动输入完整路径。'
}

const openWebDirectoryPicker = (startPath?: string): Promise<FolderSelectionResult> => {
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
  silent = false
): Promise<FolderSelectionResult> => {
  if (canUseNativeDirectoryPickerInCurrentContext()) {
    const response = await filesystemApiService.selectFolder(startPath, silent)
    if (!response.success || !response.data) {
      throw new Error(response.message || '目录选择失败')
    }

    return response.data
  }

  return openWebDirectoryPicker(startPath)
}
