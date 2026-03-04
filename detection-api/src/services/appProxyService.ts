/**
 * 应用反向代理服务
 * 为门户系统启动的应用提供统一的局域网访问入口
 */

import { createProxyMiddleware, Options } from 'http-proxy-middleware'
import { Express } from 'express'
import { logger } from '../utils/logger.js'

export interface ProxyConfig {
  appId: string
  appName: string
  targetPort: number
  proxyPath: string
  targetHost?: string
  options?: Partial<Options>
}

export class AppProxyService {
  private proxies: Map<string, ProxyConfig> = new Map()
  private app: Express

  constructor(app: Express) {
    this.app = app
  }

  /**
   * 为应用添加代理配置
   */
  addAppProxy(config: ProxyConfig): void {
    const {
      appId,
      appName,
      targetPort,
      proxyPath,
      targetHost = 'localhost',
      options = {}
    } = config

    // 移除现有代理（如果存在）
    this.removeAppProxy(appId)

    const proxyOptions: Options = {
      target: `http://${targetHost}:${targetPort}`,
      changeOrigin: true,
      pathRewrite: {
        [`^${proxyPath}`]: ''
      },
      on: {
        error: (err: any, req: any, res: any) => {
          logger.error('代理请求失败', {
            appId,
            appName,
            error: err.message,
            url: req.url
          })
          
          if (!res.headersSent) {
            res.status(502).json({
              error: '应用服务不可用',
              appName,
              message: '请确认应用正在运行'
            })
          }
        },
        proxyReq: (proxyReq: any, req: any, res: any) => {
          logger.debug('代理请求', {
            appId,
            appName,
            method: req.method,
            url: req.url,
            target: `${targetHost}:${targetPort}`
          })
        },
        proxyRes: (proxyRes: any, req: any, res: any) => {
          logger.debug('代理响应', {
            appId,
            appName,
            statusCode: proxyRes.statusCode,
            url: req.url
          })
        }
      },
      ...options
    }

    // 创建代理中间件
    const proxy = createProxyMiddleware(proxyOptions)
    
    // 注册代理路由
    this.app.use(proxyPath, proxy)

    // 保存配置
    this.proxies.set(appId, config)

    logger.info('应用代理已添加', {
      appId,
      appName,
      proxyPath,
      target: `${targetHost}:${targetPort}`
    })
  }

  /**
   * 移除应用代理
   */
  removeAppProxy(appId: string): void {
    const config = this.proxies.get(appId)
    
    if (config) {
      // 注意：Express不支持动态移除中间件
      // 这里我们标记为已移除，实际的中间件清理需要重启服务
      this.proxies.delete(appId)
      
      logger.info('应用代理已移除', {
        appId,
        appName: config.appName,
        proxyPath: config.proxyPath
      })
    }
  }

  /**
   * 获取所有代理配置
   */
  getAllProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values())
  }

  /**
   * 获取特定应用的代理配置
   */
  getAppProxy(appId: string): ProxyConfig | undefined {
    return this.proxies.get(appId)
  }

  /**
   * 检查代理路径是否已被使用
   */
  isPathInUse(path: string): boolean {
    return Array.from(this.proxies.values()).some(config => config.proxyPath === path)
  }

  /**
   * 生成应用的代理路径
   */
  generateProxyPath(appName: string, appId: string): string {
    // 清理应用名称，生成URL友好的路径
    const cleanName = appName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let basePath = `/apps/${cleanName}`
    let counter = 1

    // 确保路径唯一
    while (this.isPathInUse(basePath)) {
      basePath = `/apps/${cleanName}-${counter}`
      counter++
    }

    return basePath
  }

  /**
   * 为应用自动配置代理
   */
  async autoConfigureProxy(appId: string, appName: string, port: number): Promise<string> {
    const proxyPath = this.generateProxyPath(appName, appId)
    
    const config: ProxyConfig = {
      appId,
      appName,
      targetPort: port,
      proxyPath,
      options: {
        // 支持WebSocket代理
        ws: true,
        // 超时配置
        timeout: 30000,
        proxyTimeout: 30000
      } as any
    }

    this.addAppProxy(config)
    return proxyPath
  }

  /**
   * 获取代理状态信息
   */
  getProxyStatus(): {
    totalProxies: number
    activeProxies: ProxyConfig[]
    proxyPaths: string[]
  } {
    const activeProxies = this.getAllProxies()
    
    return {
      totalProxies: activeProxies.length,
      activeProxies,
      proxyPaths: activeProxies.map(config => config.proxyPath)
    }
  }

  /**
   * 清理所有代理配置
   */
  clearAllProxies(): void {
    const count = this.proxies.size
    this.proxies.clear()
    
    logger.info('已清理所有代理配置', { count })
  }
}

// 单例实例
let appProxyService: AppProxyService | null = null

export function initAppProxyService(app: Express): AppProxyService {
  if (!appProxyService) {
    appProxyService = new AppProxyService(app)
    logger.info('应用代理服务已初始化')
  }
  return appProxyService
}

export function getAppProxyService(): AppProxyService | null {
  return appProxyService
}
