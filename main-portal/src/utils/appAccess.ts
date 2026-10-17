/**
 * 应用访问地址解析
 * 用于从管理页等入口直接打开已启动的应用（与门户首页保持一致的端口选择规则）
 */

import type { App } from '@/types/app'
import { resolveAppProtocol } from '@/types/app'
import { generateAppAccessUrl } from '@/utils/networkUtils'

export interface AppAccessCandidate extends Partial<App> {
  access_path?: string
  pm2ProcessName?: string | null
}

type DeploymentMode = 'development' | 'production' | 'unknown'

const resolveFrontendPort = (app: AppAccessCandidate): number | null => {
  if (typeof app.frontend_port === 'number') return app.frontend_port
  if (typeof app.network?.primaryPort === 'number') return app.network.primaryPort
  return typeof app.port === 'number' ? app.port : null
}

const resolveBackendPort = (app: AppAccessCandidate): number | null => {
  if (typeof app.backend_port === 'number') return app.backend_port
  const secondaryPorts = app.network?.secondaryPorts
  if (Array.isArray(secondaryPorts) && typeof secondaryPorts[0] === 'number') {
    return secondaryPorts[0]
  }
  return null
}

// 开发模式启动会清空 pm2ProcessName，因此有 PM2 进程名即可视为生产模式
export const resolveAppDeploymentMode = (app: AppAccessCandidate): DeploymentMode => {
  if (app.deploymentMode === 'production' || app.deploymentMode === 'development') {
    return app.deploymentMode
  }
  return app.pm2ProcessName ? 'production' : 'unknown'
}

// 全栈应用：生产模式下前端资源由后端端口提供，开发模式下使用前端 dev server 端口
export const resolveAppOpenPort = (app: AppAccessCandidate): number | null => {
  const frontendPort = resolveFrontendPort(app)
  const backendPort = resolveBackendPort(app)

  if (app.isFullStack) {
    const mode = resolveAppDeploymentMode(app)
    if (mode === 'production' && backendPort !== null) return backendPort
    if (mode === 'development' && frontendPort !== null) return frontendPort
  }

  return frontendPort ?? backendPort
}

const normalizeAccessPath = (value?: string): string => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed === '/') return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export const resolveAppOpenUrl = (app: AppAccessCandidate): string | null => {
  const port = resolveAppOpenPort(app)
  if (port === null) return null

  const baseUrl = generateAppAccessUrl(port, {
    protocol: resolveAppProtocol(app as App),
    fallbackToLocalhost: true,
    validateUrl: true
  })

  const accessPath = normalizeAccessPath(app.accessPath ?? app.access_path)
  return accessPath ? `${baseUrl}${accessPath}` : baseUrl
}

export const isAppOnline = (app: { status?: string; isRunning?: boolean }): boolean => {
  return app.isRunning === true || app.status === 'online'
}

export const isAppOpenable = (app: AppAccessCandidate & { status?: string; isRunning?: boolean }): boolean => {
  return isAppOnline(app) && resolveAppOpenPort(app) !== null
}
