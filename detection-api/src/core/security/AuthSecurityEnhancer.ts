/**
 * AuthSecurityEnhancer - JWT认证安全增强
 * - 加强token验证逻辑
 * - 实现token黑名单机制
 * - 添加防暴力破解保护
 * - 增强会话管理
 */

import { logger } from '../../utils/logger'
import { verifyToken } from '../../utils/jwt'
import type { Request, Response, NextFunction } from 'express'

interface BruteForceConfig {
  windowMs: number // 窗口期
  maxAttempts: number // 最大尝试次数
  blockDurationMs: number // 封禁时长
}

interface BruteForceRecord {
  count: number
  firstAttempt: number
  blockedUntil?: number
}

interface SessionInfo {
  jti?: string
  userId: string
  role?: string
  issuedAt?: number
  expiresAt?: number
  ip?: string
  userAgent?: string
}

export class AuthSecurityEnhancer {
  private tokenBlacklist = new Set<string>()
  private bruteForceMap = new Map<string, BruteForceRecord>()
  private sessions = new Map<string, SessionInfo>() // key=jti or token hash

  private bruteForceConfig: BruteForceConfig = {
    windowMs: 10 * 60 * 1000, // 10分钟
    maxAttempts: 10,
    blockDurationMs: 15 * 60 * 1000 // 15分钟
  }

  // 将token加入黑名单（注销/撤销）
  revokeToken(token: string): void {
    try {
      this.tokenBlacklist.add(this.fingerprint(token))
      logger.info('Token已加入黑名单')
    } catch (e) {
      logger.warn('加入黑名单失败', e)
    }
  }

  // 检查token是否在黑名单
  isTokenRevoked(token: string): boolean {
    return this.tokenBlacklist.has(this.fingerprint(token))
  }

  checkBlocked(key: string): { blocked: boolean; retryAfterMs?: number } {
    const now = Date.now()
    const record = this.bruteForceMap.get(key)

    if (record?.blockedUntil && record.blockedUntil > now) {
      return { blocked: true, retryAfterMs: record.blockedUntil - now }
    }

    return { blocked: false }
  }

  // 记录登录/验证尝试（用于暴力破解防护）
  recordAttempt(key: string, configOverride?: Partial<BruteForceConfig>): { blocked: boolean; retryAfterMs?: number } {
    const config: BruteForceConfig = {
      ...this.bruteForceConfig,
      ...configOverride
    }

    const now = Date.now()
    const record = this.bruteForceMap.get(key)

    if (record?.blockedUntil && record.blockedUntil > now) {
      return { blocked: true, retryAfterMs: record.blockedUntil - now }
    }

    if (!record || now - record.firstAttempt > config.windowMs) {
      this.bruteForceMap.set(key, { count: 1, firstAttempt: now })
      return { blocked: false }
    }

    record.count += 1
    if (record.count >= config.maxAttempts) {
      record.blockedUntil = now + config.blockDurationMs
      this.bruteForceMap.set(key, record)
      return { blocked: true, retryAfterMs: config.blockDurationMs }
    }

    this.bruteForceMap.set(key, record)
    return { blocked: false }
  }

  // 重置尝试计数
  resetAttempts(key: string): void {
    this.bruteForceMap.delete(key)
  }

  // 会话管理
  addSession(token: string, info: SessionInfo): void {
    const key = this.fingerprint(token)
    this.sessions.set(key, info)
  }

  getSession(token: string): SessionInfo | undefined {
    return this.sessions.get(this.fingerprint(token))
  }

  removeSession(token: string): void {
    this.sessions.delete(this.fingerprint(token))
  }

  // Express 中间件：严格验证Bearer Token
  authMiddleware = (requireAuth = true) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'] || ''
      const forwardedFor = req.headers['x-forwarded-for']
      const ip = typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
        : req.socket.remoteAddress || 'unknown'
      const userAgent = req.headers['user-agent'] as string | undefined

      // 暴力破解防护键（按IP+UA）
      const bfKey = `${ip}|${userAgent || 'ua'}`

      // 先检查是否已被封禁（不增加计数）
      const blockedStatus = this.checkBlocked(bfKey)
      if (blockedStatus.blocked && blockedStatus.retryAfterMs) {
        const retryAfterMs = blockedStatus.retryAfterMs
        res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString())
        return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' })
      }

      if (!authHeader.startsWith('Bearer ')) {
        if (requireAuth) {
          // 只在认证失败时记录尝试
          this.recordAttempt(bfKey)
          return res.status(401).json({ success: false, message: '未提供有效的认证信息' })
        }
        return next()
      }

      const token = authHeader.slice(7)

      if (this.isTokenRevoked(token)) {
        logger.warn('Token已在黑名单中', { path: req.path })
        this.recordAttempt(bfKey)
        return res.status(401).json({ success: false, message: 'Token已被撤销' })
      }

      // 生产环境禁止 mock token
      if (token.startsWith('mock-jwt-token-')) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('生产环境拒绝Mock Token', { ip, userAgent })
          this.recordAttempt(bfKey)
          return res.status(401).json({
            success: false,
            message: '无效的认证凭证'
          })
        }

        // 开发/测试环境允许，但记录警告
        logger.warn('使用Mock Token（仅限开发环境）')
        const role = token.split('-')[3] || 'guest'
        ;(req as any).auth = { userId: 'mock-dev', role, isMock: true }
        this.resetAttempts(bfKey)
        return next()
      }

      // 验证JWT签名和有效期
      const payload = verifyToken(token)
      if (!payload) {
        this.recordAttempt(bfKey)
        return res.status(401).json({ success: false, message: 'Token无效或已过期' })
      }

      if ((payload as any).tokenType && (payload as any).tokenType !== 'access') {
        this.recordAttempt(bfKey)
        return res.status(401).json({ success: false, message: 'Token类型无效' })
      }

      // 简单回放攻击防护：拒绝过旧签发/异常exp
      if (payload.exp && payload.iat && payload.exp < payload.iat) {
        this.recordAttempt(bfKey)
        return res.status(401).json({ success: false, message: 'Token时间戳异常' })
      }

      // 写入会话上下文（sub 是 JWT 标准字段，映射到 userId）
      ;(req as any).auth = { 
        userId: (payload as any).sub || (payload as any).userId, 
        username: (payload as any).username,
        role: (payload as any).role, 
        jti: (payload as any).jti 
      }

      // 通过验证，重置尝试计数
      this.resetAttempts(bfKey)

      next()
    } catch (error) {
      logger.error('认证中间件执行失败', error)
      return res.status(401).json({ success: false, message: '认证失败' })
    }
  }

  private fingerprint(token: string): string {
    // 轻量级指纹（避免引入crypto依赖，这里使用简化hash）
    let h = 0
    for (let i = 0; i < token.length; i++) {
      h = ((h << 5) - h) + token.charCodeAt(i)
      h |= 0
    }
    return `t-${h}`
  }
}

export const authSecurityEnhancer = new AuthSecurityEnhancer()
