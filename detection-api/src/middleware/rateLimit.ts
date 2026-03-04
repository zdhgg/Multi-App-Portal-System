import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { logger } from '../utils/logger.js'

export interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  message?: string
  code?: string
  keyGenerator?: (req: Request) => string
  skip?: (req: Request) => boolean
  includeHeaders?: boolean
}

interface RateLimitRecord {
  count: number
  resetAt: number
}

const defaultClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0]?.trim() || req.ip || 'unknown'
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || req.ip || 'unknown'
  }

  return req.ip || req.socket.remoteAddress || 'unknown'
}

export const createRateLimiter = (options: RateLimitOptions): RequestHandler => {
  const {
    windowMs,
    maxRequests,
    message = '请求过于频繁，请稍后再试',
    code = 'RATE_LIMITED',
    keyGenerator,
    skip,
    includeHeaders = true
  } = options

  const bucket = new Map<string, RateLimitRecord>()

  // 定期清理过期计数，避免内存增长。
  const cleanupIntervalMs = Math.max(windowMs, 60_000)
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of bucket.entries()) {
      if (record.resetAt <= now) {
        bucket.delete(key)
      }
    }
  }, cleanupIntervalMs)

  timer.unref?.()

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (skip && skip(req)) {
        return next()
      }

      const now = Date.now()
      const key = keyGenerator ? keyGenerator(req) : defaultClientIp(req)

      let record = bucket.get(key)
      if (!record || record.resetAt <= now) {
        record = { count: 0, resetAt: now + windowMs }
      }

      record.count += 1
      bucket.set(key, record)

      const remaining = Math.max(0, maxRequests - record.count)
      if (includeHeaders) {
        res.setHeader('X-RateLimit-Limit', String(maxRequests))
        res.setHeader('X-RateLimit-Remaining', String(remaining))
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)))
      }

      if (record.count > maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000))
        res.setHeader('Retry-After', String(retryAfterSeconds))

        logger.warn('Rate limit exceeded', {
          key,
          path: req.path,
          method: req.method,
          maxRequests,
          windowMs,
          retryAfterSeconds
        })

        res.status(429).json({
          success: false,
          message,
          code,
          retryAfterSeconds
        })
        return
      }

      next()
    } catch (error) {
      logger.error('Rate limiter failed; request allowed by fallback', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method
      })
      next()
    }
  }
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const getGlobalRateLimitScope = (req: Request): string => {
  const segments = req.path.split('/').filter(Boolean)
  if (segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`
  }
  if (segments.length === 1) {
    return segments[0]
  }
  return 'root'
}

const isAuthPublicRoute = (req: Request): boolean => {
  return req.path === '/v2/auth/login'
    || req.path === '/v2/auth/refresh'
    || req.path === '/v2/auth/verify'
}

export const createGlobalApiRateLimiter = (): RequestHandler => {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  const maxRequests = parsePositiveInt(process.env.RATE_LIMIT_MAX, 1000)

  return createRateLimiter({
    windowMs,
    maxRequests,
    message: 'API请求频率过高，请稍后重试',
    code: 'API_RATE_LIMITED',
    // 登录/刷新/验证使用专用认证链路，避免被全局限流“连坐”
    skip: isAuthPublicRoute,
    // 以「IP + 路由域」作为桶键，避免单一路由风暴拖垮全部API
    keyGenerator: (req: Request) => `${defaultClientIp(req)}:${getGlobalRateLimitScope(req)}`
  })
}

export const createLoginRateLimiter = (): RequestHandler => {
  const windowMs = parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000)
  const maxRequests = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 30)

  return createRateLimiter({
    windowMs,
    maxRequests,
    message: '登录尝试过于频繁，请稍后再试',
    code: 'LOGIN_RATE_LIMITED',
    keyGenerator: (req: Request) => {
      const ip = defaultClientIp(req)
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : 'unknown'
      return `login:${ip}:${username}`
    }
  })
}

export const getClientIp = defaultClientIp
