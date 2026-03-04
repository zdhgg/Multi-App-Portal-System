/**
 * 应用相关类型定义 - 统一接口规范
 */

// 端口信息接口
export interface AppPort {
  port: number
  type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database'
  protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp'
  description?: string
  isMain?: boolean  // 是否为主端口
}

// 核心App接口定义
export interface App {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  pinned?: boolean
  techStack: string        // 使用驼峰命名
  status: string
  isRunning: boolean
  accessUrl?: string       // 完整访问URL，如：http://localhost:3002
  directUrl?: string       // 直接访问URL（备用）
  accessPath?: string      // 访问路径，如 /management.html
  accessHost?: string      // 服务器 Host，用于跨网段访问
  accessProtocol?: 'http' | 'https' // 明确协议，避免浏览器默认 https
  lanAccessUrl?: string | null // 局域网访问地址（如有）
  directory?: string       // 应用文件夹路径
  
  // 端口信息 - 支持多端口
  port?: number           // 主端口号（向后兼容）
  ports?: AppPort[]       // 完整端口信息数组
  
  // 兼容性字段
  frontend_port?: number  // 前端端口（兼容后端API）
  backend_port?: number   // 后端端口（兼容后端API）
  network?: {
    protocol?: 'http' | 'https'
    primaryPort?: number
    secondaryPorts?: number[]
  }

  
  // 🎯 运行模式信息
  deploymentMode?: 'production' | 'development' | 'unknown'  // 运行模式
  isFullStack?: boolean   // 是否为全栈应用
  
  uptime?: number         // 运行时间（毫秒）
  lastUpdated?: string    // 最后更新时间
}

// 扩展App类型以支持UI状态
export interface AppWithUIState extends App {
  _loading?: boolean
  _deleting?: boolean
  // 添加可能缺失的属性
  last_start_time?: any
  last_stop_time?: any
  lastStartTime?: any
  lastStopTime?: any
}

// 应用状态枚举
export type AppStatusType = 'online' | 'offline' | 'error' | 'maintenance'

// 应用访问相关
export interface AppAccessInfo {
  app: App
  accessUrl: string
  directUrl?: string
  isAvailable: boolean
}

// ����Ӧ�������õ�Э��
export const resolveAppProtocol = (app: App): 'http' | 'https' => {
  if (app.accessProtocol === 'https' || app.accessProtocol === 'http') {
    return app.accessProtocol
  }

  const networkProtocol = app.network?.protocol
  if (networkProtocol === 'https' || networkProtocol === 'http') {
    return networkProtocol
  }

  const url = app.accessUrl || app.directUrl
  if (typeof url === 'string' && url.startsWith('https://')) {
    try {
      const parsed = new URL(url)
      const port = parsed.port ? parseInt(parsed.port, 10) : 443
      if (port === 443 || port === 8443) {
        return 'https'
      }
    } catch {
      // ignore parse errors
    }
  }

  return 'http'
}

// URL验证工具函数
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// 获取应用访问URL的工具函数
export const getAppAccessUrl = (app: App): string | null => {
  // 🎯 智能端口选择：根据 deploymentMode 动态选择正确的端口
  // 解决问题：WebSocket更新 deploymentMode 后，accessUrl 可能还是旧值
  
  const preferredProtocol = resolveAppProtocol(app)
  let targetPort: number | null = null
  let accessPath = typeof app.accessPath === 'string' ? app.accessPath.trim() : ''
  
  // 1️⃣ 根据部署模式和应用类型选择正确的端口
  if (app.isFullStack && app.deploymentMode && app.deploymentMode !== 'unknown') {
    if (app.deploymentMode === 'production' && app.backend_port) {
      // 生产模式（PM2）→ 使用后端端口（后端serve前端+API）
      targetPort = app.backend_port
      console.debug('🎯 使用生产模式端口:', {
        appName: app.name,
        mode: 'PM2',
        port: targetPort
      })
    } else if (app.deploymentMode === 'development' && app.frontend_port) {
      // 开发模式 → 使用前端端口（Vite开发服务器）
      targetPort = app.frontend_port
      console.debug('🎯 使用开发模式端口:', {
        appName: app.name,
        mode: 'DEV',
        port: targetPort
      })
    }
  }
  
  // 2️⃣ 如果没有根据模式选择端口，则使用后端返回的 accessUrl
  if (!targetPort) {
    const existingUrl = app.accessUrl || app.lanAccessUrl || app.directUrl
    if (existingUrl && validateUrl(existingUrl)) {
      try {
        const parsedUrl = new URL(existingUrl)
        if (parsedUrl.port) {
          targetPort = parseInt(parsedUrl.port, 10)
        }
        const parsedPath = `${parsedUrl.pathname || ''}${parsedUrl.search || ''}${parsedUrl.hash || ''}`
        if (parsedPath && parsedPath !== '/') {
          accessPath = parsedPath
        }
      } catch {
        // ignore parse errors and fall back to default logic
      }
    }

    if (targetPort === null) {
      // 降级：使用主端口
      targetPort = getMainPort(app)
    }
  }
  
  // 3️⃣ 生成访问URL
  if (targetPort) {
    try {
      const { generateAppAccessUrl } = require('@/utils/networkUtils')
      const baseUrl = generateAppAccessUrl(targetPort, {
        protocol: preferredProtocol,
        fallbackToLocalhost: true,
        validateUrl: true
      })
      if (!accessPath || accessPath === '/') {
        return baseUrl
      }

      const normalizedPath = accessPath.startsWith('/') ? accessPath : `/${accessPath}`
      const parsed = new URL(baseUrl)
      const pathOnly = normalizedPath.split('?')[0].split('#')[0]
      const query = normalizedPath.includes('?')
        ? normalizedPath.substring(normalizedPath.indexOf('?') + 1).split('#')[0]
        : ''
      const hash = normalizedPath.includes('#')
        ? normalizedPath.substring(normalizedPath.indexOf('#'))
        : ''

      parsed.pathname = pathOnly
      parsed.search = query ? `?${query}` : ''
      parsed.hash = hash || ''
      return parsed.toString()
    } catch (error) {
      console.warn('⚠️ 无法加载网络工具模块，使用 localhost 作为降级方案:', error)
      console.warn('注意：这可能导致局域网访问失败，仅适用于本地访问')
      if (!accessPath || accessPath === '/') {
        return `http://localhost:${targetPort}`
      }
      const normalizedPath = accessPath.startsWith('/') ? accessPath : `/${accessPath}`
      return `http://localhost:${targetPort}${normalizedPath}`
    }
  }

  return null
}

// 检查应用是否可访问
export const isAppAccessible = (app: App): boolean => {
  return app.isRunning && !!getAppAccessUrl(app)
}

// 端口工具函数
export const getMainPort = (app: App): number | null => {
  // 优先使用 ports 数组中的主端口
  if (app.ports && app.ports.length > 0) {
    const mainPort = app.ports.find(p => p.isMain)
    if (mainPort) return mainPort.port
    // 如果没有标记主端口，使用第一个前端端口或第一个端口
    const frontendPort = app.ports.find(p => p.type === 'frontend')
    if (frontendPort) return frontendPort.port
    return app.ports[0].port
  }
  
  // 向后兼容：使用单一端口字段
  return app.port || app.frontend_port || app.backend_port || null
}

// 获取所有端口信息，用于显示
export const getAllPorts = (app: App): AppPort[] => {
  if (app.ports && app.ports.length > 0) {
    return app.ports
  }
  
  // 从兼容性字段构建端口信息
  const ports: AppPort[] = []
  
  if (app.frontend_port) {
    ports.push({
      port: app.frontend_port,
      type: 'frontend',
      protocol: 'http',
      description: '前端服务',
      isMain: true // ✅ 修复：前端端口应该是主端口（用于浏览器访问）
    })
  }

  if (app.backend_port) {
    ports.push({
      port: app.backend_port,
      type: 'backend',
      protocol: 'http',
      description: '后端API',
      isMain: false // ✅ 修复：后端端口应该是辅助端口（用于API调用）
    })
  }
  
  if (app.port && app.port !== app.frontend_port && app.port !== app.backend_port) {
    ports.push({
      port: app.port,
      type: 'api', // 默认类型
      protocol: 'http',
      description: '应用服务',
      isMain: ports.length === 0 // 如果是唯一端口，设为主端口
    })
  }
  
  return ports
}

// 格式化端口信息为显示文本
export const formatPortsDisplay = (app: App): string => {
  const ports = getAllPorts(app)
  
  if (ports.length === 0) {
    return 'N/A'
  }
  
  if (ports.length === 1) {
    return ports[0].port.toString()
  }
  
  // 多端口显示格式：前端:3001, 后端:4001
  const portStrings = ports.map(p => {
    const typeMap: Record<string, string> = {
      frontend: '前端',
      backend: '后端',
      api: 'API',
      websocket: 'WS',
      database: '数据库'
    }
    return `${typeMap[p.type] || p.type}:${p.port}`
  })
  
  return portStrings.join(', ')
}

// 获取端口类型颜色
export const getPortTypeColor = (type: AppPort['type']): string => {
  const colorMap: Record<AppPort['type'], string> = {
    frontend: '#67C23A',    // 绿色
    backend: '#409EFF',     // 蓝色  
    api: '#E6A23C',         // 橙色
    websocket: '#F56C6C',   // 红色
    database: '#909399'     // 灰色
  }
  return colorMap[type] || '#909399'
}

// 获取端口类型图标
export const getPortTypeIcon = (type: AppPort['type']): string => {
  const iconMap: Record<AppPort['type'], string> = {
    frontend: '🌐',
    backend: '⚙️',
    api: '🔗',
    websocket: '📡',
    database: '🗄️'
  }
  return iconMap[type] || '🔌'
}
