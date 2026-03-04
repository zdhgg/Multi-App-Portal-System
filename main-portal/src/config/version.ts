/**
 * 系统版本信息配置
 */

export interface VersionInfo {
  name: string
  version: string
  buildDate: string
  description: string
  author: string
  repository?: string
}

export const VERSION_INFO: VersionInfo = {
  name: '智能多Web应用门户系统',
  version: '2.0.0',
  buildDate: '2025-12-12',
  description: '一个智能化的Web应用检测、管理和统一门户系统',
  author: 'Portal Team',
  repository: 'https://github.com/portal-system'
}

/**
 * 获取完整版本字符串
 */
export function getVersionString(): string {
  return `v${VERSION_INFO.version}`
}

/**
 * 获取系统信息
 */
export function getSystemInfo(): Record<string, string> {
  return {
    '系统名称': VERSION_INFO.name,
    '当前版本': getVersionString(),
    '构建日期': VERSION_INFO.buildDate,
    '浏览器': navigator.userAgent.split(' ').slice(-1)[0] || 'Unknown'
  }
}
