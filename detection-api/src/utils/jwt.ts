/**
 * JWT Utilities - Simplified for Clean Architecture v2
 * 
 * Phase 1 Security: 生产环境强制配置 JWT_SECRET
 */

import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { logger } from './logger'

// ===============================================================================
// JWT 配置 - 生产环境强制检查
// ===============================================================================

const DEFAULT_SECRET = 'your-super-secret-jwt-key-change-in-production'
const isProduction = process.env.NODE_ENV === 'production'
const jwtSecret = process.env.JWT_SECRET?.trim()

const isWeakJwtSecret = (secret?: string): boolean => {
  if (!secret) return true
  if (secret === DEFAULT_SECRET) return true
  if (secret.length < 32) return true

  const lowered = secret.toLowerCase()
  const placeholderHints = [
    'change-this',
    'replace-this',
    'your-super-secret',
    'your-jwt-secret',
    'your-secret-key'
  ]

  return placeholderHints.some(hint => lowered.includes(hint))
}

// 生产环境强制要求设置 JWT_SECRET
if (isProduction && isWeakJwtSecret(jwtSecret)) {
  const errorMsg = `
❌ [SECURITY] JWT_SECRET 未配置或使用默认值！

生产环境必须设置安全的 JWT_SECRET 环境变量。

解决方案：
1. 在 .env 文件中添加：JWT_SECRET=your-secure-random-string-at-least-32-chars
2. 或设置环境变量：export JWT_SECRET="your-secure-random-string"

建议使用随机生成的字符串（至少32位）：
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
`
  logger.error(errorMsg)
  throw new Error('[SECURITY] JWT_SECRET not configured for production environment')
}

// 非生产环境使用默认值时警告
if (!isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_SECRET)) {
  logger.warn('⚠️ [SECURITY] 使用默认 JWT_SECRET，仅限开发环境使用')
}

const JWT_SECRET = jwtSecret || DEFAULT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'
const JWT_ISSUER = 'intelligent-portal-system'
const JWT_AUDIENCE = 'portal-users'

const parseDurationToSeconds = (value: string | number, fallbackSeconds: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }

  const normalized = String(value).trim()
  if (!normalized) {
    return fallbackSeconds
  }

  if (/^\d+$/.test(normalized)) {
    return Math.max(0, parseInt(normalized, 10))
  }

  const match = normalized.match(/^(\d+)\s*(ms|s|m|h|d|w|y)$/i)
  if (!match) {
    return fallbackSeconds
  }

  const amount = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const unitFactors: Record<string, number> = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
    y: 365 * 24 * 60 * 60
  }

  return Math.max(0, Math.floor(amount * (unitFactors[unit] || 1)))
}

export const ACCESS_TOKEN_EXPIRES_IN_SECONDS = parseDurationToSeconds(JWT_EXPIRES_IN, 24 * 60 * 60)
export const REFRESH_TOKEN_EXPIRES_IN_SECONDS = parseDurationToSeconds(JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60)

export interface JWTPayload {
  sub: string        // 用户ID（JWT 标准字段）
  username: string
  role: 'admin' | 'operator' | 'guest'
  tokenType?: 'access' | 'refresh'
  jti?: string       // JWT ID（用于撤销）
  iat?: number
  exp?: number
}

export class JWTManager {
  /**
   * 生成访问token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    try {
      const accessPayload: JWTPayload = {
        ...payload,
        tokenType: 'access',
        jti: payload.jti || randomUUID()
      }

      return jwt.sign(accessPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      } as any)
    } catch (error) {
      logger.error('生成访问token失败:', error)
      throw new Error('Token generation failed')
    }
  }

  /**
   * 生成刷新token
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    try {
      const refreshPayload: JWTPayload = {
        ...payload,
        tokenType: 'refresh',
        jti: payload.jti || randomUUID()
      }

      return jwt.sign(refreshPayload, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      } as any)
    } catch (error) {
      logger.error('生成刷新token失败:', error)
      throw new Error('Refresh token generation failed')
    }
  }

  /**
   * 验证token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }) as JWTPayload
      return decoded
    } catch (error) {
      logger.warn('Token验证失败')
      throw new Error('Token verification failed')
    }
  }
}

// 默认实例
export const jwtManager = new JWTManager()

// 便捷函数
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>) => 
  jwtManager.generateAccessToken(payload)

export const generateRefreshToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>) => 
  jwtManager.generateRefreshToken(payload)

export const verifyToken = (token: string) => 
  jwtManager.verifyToken(token)

export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader) return null
  
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  
  return parts[1]
}
