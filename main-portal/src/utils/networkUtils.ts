/**
 * 网络工具函数
 * 用于统一处理URL生成、Host检测等网络相关功能
 */

import { isDebugToolsEnabled } from './debugControl'

// 网络配置接口
export interface NetworkConfig {
  protocol: 'http' | 'https'
  hostname: string
  port?: number
}

// URL生成选项
export interface UrlGenerationOptions {
  protocol?: 'http' | 'https'
  hostname?: string
  fallbackToLocalhost?: boolean
  validateUrl?: boolean
}

/**
 * 获取当前访问的Host信息
 */
export const getCurrentHost = (): string => {
  try {
    if (typeof window === 'undefined') {
      console.warn('getCurrentHost called in non-browser environment')
      return 'localhost:3000'
    }

    const location = window.location
    if (!location) {
      console.warn('window.location is not available')
      return 'localhost:3000'
    }

    // 返回完整的host（包含端口）
    return location.host || 'localhost:3000'
  } catch (error) {
    console.error('Error getting current host:', error)
    return 'localhost:3000'
  }
}

/**
 * 获取当前访问的协议
 */
export const getCurrentProtocol = (): 'http' | 'https' => {
  try {
    if (typeof window === 'undefined') {
      return 'http'
    }

    const protocol = window.location?.protocol
    return protocol === 'https:' ? 'https' : 'http'
  } catch (error) {
    console.error('Error getting current protocol:', error)
    return 'http'
  }
}

/**
 * 获取当前访问的主机名（不包含端口）
 */
export const getCurrentHostname = (): string => {
  try {
    const host = getCurrentHost()
    return host.split(':')[0] || 'localhost'
  } catch (error) {
    console.error('Error getting current hostname:', error)
    return 'localhost'
  }
}

/**
 * 解析网络配置
 */
export const parseNetworkConfig = (host?: string): NetworkConfig => {
  try {
    const currentHost = host || getCurrentHost()
    const protocol = getCurrentProtocol()
    
    // 分离主机名和端口
    const [hostname, portStr] = currentHost.split(':')
    const port = portStr ? parseInt(portStr, 10) : undefined

    return {
      protocol,
      hostname: hostname || 'localhost',
      port: port && !isNaN(port) ? port : undefined
    }
  } catch (error) {
    console.error('Error parsing network config:', error)
    return {
      protocol: 'http',
      hostname: 'localhost'
    }
  }
}

/**
 * 生成应用访问URL
 */
export const generateAppAccessUrl = (
  port: number, 
  options: UrlGenerationOptions = {}
): string => {
  try {
    const {
      protocol,
      fallbackToLocalhost = true,
      validateUrl = true
    } = options

    // 输入验证
    if (!port || port < 1 || port > 65535) {
      console.warn('Invalid port number:', port)
      port = 3000
    }

    // 获取网络配置
    const config = parseNetworkConfig()
    const preferredHost = options.hostname?.trim()
    const finalProtocol = protocol || config.protocol
    const hostname = preferredHost || config.hostname

    // 生成URL
    const url = `${finalProtocol}://${hostname}:${port}`

    // URL格式验证
    if (validateUrl) {
      try {
        new URL(url)
      } catch (urlError) {
        console.warn('Generated URL is invalid:', url, urlError)
        if (fallbackToLocalhost) {
          return `http://localhost:${port}`
        }
        throw new Error(`Invalid URL generated: ${url}`)
      }
    }

    console.debug('Generated app access URL:', {
      port,
      protocol: finalProtocol,
      hostname,
      url,
      currentHost: getCurrentHost()
    })

    return url
  } catch (error) {
    console.error('Error generating app access URL:', error)
    
    // 降级处理
    if (options.fallbackToLocalhost !== false) {
      return `http://localhost:${port || 3000}`
    }
    
    throw error
  }
}

/**
 * 生成多个端口的访问URL
 */
export const generateMultipleAppUrls = (
  ports: number[], 
  options: UrlGenerationOptions = {}
): string[] => {
  try {
    return ports.map(port => generateAppAccessUrl(port, options))
  } catch (error) {
    console.error('Error generating multiple app URLs:', error)
    return ports.map(port => `http://localhost:${port}`)
  }
}

/**
 * 检查URL是否可访问（基本格式检查）
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    
    // 基本协议检查
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false
    }
    
    // 基本主机名检查
    if (!urlObj.hostname) {
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

/**
 * 检查是否为本地访问
 */


/**
 * 获取门户系统的 WebSocket 根地址
 * 优先级：显式环境变量 -> API 基础地址 -> 当前页面地址
 */
export const resolvePortalWebSocketUrl = (path: string = '/ws'): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const env = (import.meta as any)?.env ?? {}
  const envWsUrl: string | undefined = env.VITE_WS_URL || env.VITE_WS_BASE

  const ensurePath = (rawUrl: string): string => {
    try {
      const url = new URL(rawUrl)
      if (!url.pathname || url.pathname === '/') {
        url.pathname = normalizedPath
      }
      return url.toString()
    } catch (error) {
      console.warn('Invalid WebSocket URL from environment:', rawUrl, error)
      return rawUrl
    }
  }

  if (envWsUrl) {
    return ensurePath(envWsUrl)
  }

  const apiBase: string | undefined = env.VITE_API_BASE_URL
  if (apiBase) {
    try {
      const apiUrl = new URL(apiBase)
      const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${apiUrl.host}${normalizedPath}`
    } catch (error) {
      console.warn('Unable to derive WebSocket URL from API base:', apiBase, error)
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host || `${getCurrentHostname()}:3000`
    return `${protocol}//${host}${normalizedPath}`
  }

  return `ws://localhost:8002${normalizedPath}`
}
export const isLocalAccess = (): boolean => {
  try {
    const hostname = getCurrentHostname()
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch (error) {
    console.error('Error checking local access:', error)
    return true // 默认认为是本地访问
  }
}

/**
 * 检查是否为局域网访问
 */
export const isLanAccess = (): boolean => {
  try {
    const hostname = getCurrentHostname()
    
    // 检查是否为私有IP地址
    const privateIpPattern = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/
    return privateIpPattern.test(hostname)
  } catch (error) {
    console.error('Error checking LAN access:', error)
    return false
  }
}

/**
 * 获取网络访问类型
 */
export const getNetworkAccessType = (): 'local' | 'lan' | 'external' => {
  try {
    if (isLocalAccess()) {
      return 'local'
    }
    
    if (isLanAccess()) {
      return 'lan'
    }
    
    return 'external'
  } catch (error) {
    console.error('Error getting network access type:', error)
    return 'local'
  }
}

/**
 * 格式化网络信息用于显示
 */
export const formatNetworkInfo = () => {
  try {
    const config = parseNetworkConfig()
    const accessType = getNetworkAccessType()
    
    return {
      host: getCurrentHost(),
      hostname: config.hostname,
      protocol: config.protocol,
      port: config.port,
      accessType,
      isLocal: isLocalAccess(),
      isLan: isLanAccess()
    }
  } catch (error) {
    console.error('Error formatting network info:', error)
    return {
      host: 'localhost:3000',
      hostname: 'localhost',
      protocol: 'http' as const,
      port: 3000,
      accessType: 'local' as const,
      isLocal: true,
      isLan: false
    }
  }
}

// 开发环境调试工具
if (isDebugToolsEnabled()) {
  // 暴露到window对象便于调试
  ;(window as any).networkUtils = {
    getCurrentHost,
    getCurrentProtocol,
    getCurrentHostname,
    parseNetworkConfig,
    generateAppAccessUrl,
    generateMultipleAppUrls,
    isValidUrl,
    isLocalAccess,
    isLanAccess,
    getNetworkAccessType,
    formatNetworkInfo,
    resolvePortalWebSocketUrl
  }
  
  console.log('🌐 Network utils available at window.networkUtils')
}
