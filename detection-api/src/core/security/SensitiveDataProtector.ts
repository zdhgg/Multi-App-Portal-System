/**
 * SensitiveDataProtector - 敏感信息保护
 * - 配置脱敏
 * - 错误信息与日志安全处理
 * - 环境变量保护
 */

import { logger } from '../../utils/logger'

const DEFAULT_MASK = '******'

const SECRET_KEYS = [/password/i, /secret/i, /token/i, /key/i, /credential/i, /cookie/i]

export class SensitiveDataProtector {
  maskObject<T = any>(obj: T, customMaskKeys: RegExp[] = []): T {
    try {
      const clone: any = Array.isArray(obj) ? [] : {}
      const keys = Object.keys(obj as any)
      const maskKeys = [...SECRET_KEYS, ...customMaskKeys]

      for (const k of keys) {
        const v: any = (obj as any)[k]
        if (v && typeof v === 'object') {
          clone[k] = this.maskObject(v, customMaskKeys)
          continue
        }
        if (maskKeys.some(rx => rx.test(k))) {
          clone[k] = DEFAULT_MASK
        } else {
          clone[k] = v
        }
      }
      return clone as T
    } catch {
      return obj
    }
  }

  safeError(err: any): { message: string; code?: string } {
    if (!err) return { message: 'Unknown error' }
    const code = err.code || err.name
    const message = '发生错误，请联系管理员' // 避免暴露内部细节
    return { message, code }
  }

  safeLog(message: string, context?: any): void {
    try {
      const masked = context ? this.maskObject(context) : undefined
      logger.info(message, masked)
    } catch {
      logger.info(message)
    }
  }

  getSafeEnv(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (SECRET_KEYS.some(rx => rx.test(k))) {
        out[k] = DEFAULT_MASK
      } else {
        out[k] = (v || '').slice(0, 8) + '...'
      }
    }
    return out
  }
}

export const sensitiveDataProtector = new SensitiveDataProtector()

