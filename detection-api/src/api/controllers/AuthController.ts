/**
 * Authentication Controller - 认证控制器
 * 
 * 处理用户认证相关的API请求
 * 
 * Phase 2: 实现真实的登出撤销和会话管理
 */

import { Router, Request, Response } from 'express'
import Joi from 'joi'
import { promises as fs } from 'fs'
import { join } from 'path'
import { logger } from '../../utils/logger'
import { PasswordUtils } from '../../utils/passwordUtils'
import { generateToken, generateRefreshToken, verifyToken } from '../../utils/jwt.js'
import { authSecurityEnhancer } from '../../core/security/AuthSecurityEnhancer.js'
import { requireAuth, requireAdmin } from '../../middleware/authMiddleware.js'
import { createLoginRateLimiter, getClientIp } from '../../middleware/rateLimit.js'
import { verifyTotp } from '../../utils/totp.js'

// Phase 2: 会话信息接口
interface SessionInfo {
  id: string
  userId: string
  username: string
  role: string
  deviceName: string
  ip: string
  userAgent: string
  createdAt: string
  lastActive: string
  current?: boolean
}

interface UserRecord {
  id?: string
  username: string
  password: string
  role: 'admin' | 'operator' | 'guest'
  enabled?: boolean
  mustChangePassword?: boolean
  createdAt?: string
  updatedAt?: string
  lastLogin?: string
  mfaSecret?: string
}

interface PasswordPolicyConfig {
  minLength: number
  requireNumber: boolean
  requireUppercase: boolean
  requireSpecial: boolean
}

interface AccountSecurityConfig {
  maxLoginAttempts: number
  lockoutDurationMinutes: number
  passwordPolicy: PasswordPolicyConfig
}

interface SystemSettings {
  accounts?: {
    users?: UserRecord[]
    settings?: {
      maxLoginAttempts?: number
      lockoutDurationMinutes?: number
    }
  }
  security?: {
    passwordPolicy?: Partial<PasswordPolicyConfig>
  }
}

export class AuthController {
  private router = Router()
  private usersCache: UserRecord[] = []
  private settingsCache: SystemSettings | null = null
  private cacheTime: number = 0
  private CACHE_TTL = 5000 // 5秒缓存
  
  // Phase 2: 内存会话存储（生产环境建议使用 Redis）
  private sessions = new Map<string, SessionInfo>()
  private loginRateLimiter = createLoginRateLimiter()

  constructor() {
    this.setupRoutes()
  }

  /**
   * 从系统设置文件读取用户列表
   */
  private async loadUsers(): Promise<UserRecord[]> {
    const settings = await this.loadSystemSettings()
    const users = settings.accounts?.users || []
    this.usersCache = users
    return users
  }

  private async loadSystemSettings(): Promise<SystemSettings> {
    try {
      // 使用缓存避免频繁读取文件
      const now = Date.now()
      if (this.settingsCache && (now - this.cacheTime) < this.CACHE_TTL) {
        return this.settingsCache
      }

      const settingsPath = join(process.cwd(), 'configs', 'system-config.json')
      const content = await fs.readFile(settingsPath, 'utf8')
      const settings = JSON.parse(content) as SystemSettings

      this.settingsCache = settings
      this.cacheTime = now
      
      const userCount = settings.accounts?.users?.length || 0
      logger.debug('系统配置已加载', { userCount })
      return settings
    } catch (error) {
      logger.error('加载用户列表失败', { error })
      throw new Error('系统用户配置加载失败')
    }
  }

  /**
   * 清除用户缓存
   */
  private clearUsersCache(): void {
    this.usersCache = []
    this.settingsCache = null
    this.cacheTime = 0
  }

  private getAccountSecurityConfig(settings: SystemSettings): AccountSecurityConfig {
    const accountsSettings = settings.accounts?.settings || {}
    const passwordPolicy = settings.security?.passwordPolicy || {}

    return {
      maxLoginAttempts: Math.max(3, Number(accountsSettings.maxLoginAttempts || 5)),
      lockoutDurationMinutes: Math.max(1, Number(accountsSettings.lockoutDurationMinutes || 15)),
      passwordPolicy: {
        minLength: Math.max(8, Number(passwordPolicy.minLength || 8)),
        requireNumber: passwordPolicy.requireNumber !== false,
        requireUppercase: passwordPolicy.requireUppercase === true,
        requireSpecial: passwordPolicy.requireSpecial === true
      }
    }
  }

  private validatePasswordByPolicy(password: string, policy: PasswordPolicyConfig): string[] {
    const errors: string[] = []

    if (password.length < policy.minLength) {
      errors.push(`密码长度不能少于 ${policy.minLength} 位`)
    }
    if (policy.requireNumber && !/\d/.test(password)) {
      errors.push('密码必须包含数字')
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含大写字母')
    }
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
      errors.push('密码必须包含特殊字符')
    }

    return errors
  }

  private buildLoginAttemptKey(username: string, req: Request): string {
    const ip = getClientIp(req)
    return `login:${username.trim().toLowerCase()}:${ip}`
  }

  private setupRoutes(): void {
    // POST /api/auth/login - 用户登录（公开）
    this.router.post('/login', this.loginRateLimiter, this.handleLogin.bind(this))
    
    // POST /api/auth/logout - 用户登出（需认证）
    this.router.post('/logout', requireAuth, this.handleLogout.bind(this))
    
    // GET /api/auth/verify - 验证token（公开，但需携带token）
    this.router.get('/verify', this.handleVerifyToken.bind(this))
    
    // POST /api/auth/refresh - 刷新token（公开，但需携带refreshToken）
    this.router.post('/refresh', this.handleRefreshToken.bind(this))
    
    // GET /api/auth/profile - 获取用户信息（需认证）
    this.router.get('/profile', requireAuth, this.handleGetProfile.bind(this))
    
    // POST /api/auth/change-password - 修改密码（需认证）
    this.router.post('/change-password', requireAuth, this.handleChangePassword.bind(this))
    
    // GET /api/auth/sessions - 获取用户会话（需认证）
    this.router.get('/sessions', requireAuth, this.handleGetSessions.bind(this))
    
    // DELETE /api/auth/sessions/:id - 撤销会话（需认证）
    this.router.delete('/sessions/:id', requireAuth, this.handleRevokeSession.bind(this))
    
    // POST /api/auth/sessions/revoke-all-others - 撤销其他会话（需认证）
    this.router.post('/sessions/revoke-all-others', requireAuth, this.handleRevokeAllOtherSessions.bind(this))
    
    // GET /api/auth/sessions/all - 管理员查看所有会话（仅admin）
    this.router.get('/sessions/all', requireAuth, requireAdmin, this.handleGetAllSessions.bind(this))
    
    // DELETE /api/auth/sessions/user/:userId - 管理员撤销用户所有会话（仅admin）
    this.router.delete('/sessions/user/:userId', requireAuth, requireAdmin, this.handleRevokeUserSessions.bind(this))
  }

  async handleLogin(req: Request, res: Response): Promise<void> {
    try {
      // 验证输入
      const { error, value } = this.validateLoginInput(req.body)
      if (error) {
        res.status(400).json({
          success: false,
          message: '输入验证失败',
          error: error.details[0].message
        })
        return
      }

      const { username, password, rememberMe, mfaCode } = value
      const settings = await this.loadSystemSettings()
      const securityConfig = this.getAccountSecurityConfig(settings)
      const users = settings.accounts?.users || []
      const user = users.find(u => u.username === username)
      const loginAttemptKey = this.buildLoginAttemptKey(username, req)

      const blockStatus = authSecurityEnhancer.checkBlocked(loginAttemptKey)
      if (blockStatus.blocked && blockStatus.retryAfterMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil(blockStatus.retryAfterMs / 1000))
        res.setHeader('Retry-After', String(retryAfterSeconds))
        res.status(429).json({
          success: false,
          code: 'ACCOUNT_LOCKED',
          message: `登录尝试次数过多，请在 ${retryAfterSeconds} 秒后重试`
        })
        return
      }
      
      if (!user) {
        logger.warn('登录失败：用户不存在', { username })
        authSecurityEnhancer.recordAttempt(loginAttemptKey, {
          maxAttempts: securityConfig.maxLoginAttempts,
          windowMs: securityConfig.lockoutDurationMinutes * 60 * 1000,
          blockDurationMs: securityConfig.lockoutDurationMinutes * 60 * 1000
        })
        res.status(401).json({
          success: false,
          message: '用户名或密码错误'
        })
        return
      }

      if (!user.password || typeof user.password !== 'string') {
        logger.error('登录失败：用户密码配置无效', { username })
        res.status(500).json({
          success: false,
          message: '账户配置错误，请联系管理员'
        })
        return
      }

      // 使用bcrypt验证密码
      const isPasswordValid = await PasswordUtils.verifyPassword(password, user.password)
      if (!isPasswordValid) {
        logger.warn('登录失败：密码错误', { username })
        authSecurityEnhancer.recordAttempt(loginAttemptKey, {
          maxAttempts: securityConfig.maxLoginAttempts,
          windowMs: securityConfig.lockoutDurationMinutes * 60 * 1000,
          blockDurationMs: securityConfig.lockoutDurationMinutes * 60 * 1000
        })
        res.status(401).json({
          success: false,
          message: '用户名或密码错误'
        })
        return
      }

      // 检查用户状态
      if (!user.enabled) {
        logger.warn('登录失败：账户已禁用', { username })
        authSecurityEnhancer.recordAttempt(loginAttemptKey, {
          maxAttempts: securityConfig.maxLoginAttempts,
          windowMs: securityConfig.lockoutDurationMinutes * 60 * 1000,
          blockDurationMs: securityConfig.lockoutDurationMinutes * 60 * 1000
        })
        res.status(403).json({
          success: false,
          message: '账户已被禁用，请联系管理员'
        })
        return
      }

      const adminMfaEnabled = ['true', '1', 'on'].includes(String(process.env.ADMIN_MFA_REQUIRED || '').toLowerCase())
      if (adminMfaEnabled && user.role === 'admin') {
        const mfaSecret = user.mfaSecret || process.env.ADMIN_MFA_TOTP_SECRET
        if (!mfaSecret) {
          logger.error('管理员MFA已启用但未配置密钥')
          res.status(500).json({
            success: false,
            code: 'MFA_NOT_CONFIGURED',
            message: '管理员MFA未正确配置，请联系系统管理员'
          })
          return
        }

        if (!mfaCode || typeof mfaCode !== 'string') {
          res.status(401).json({
            success: false,
            code: 'MFA_REQUIRED',
            message: '管理员账户需要MFA验证码'
          })
          return
        }

        const mfaValid = verifyTotp(mfaCode, mfaSecret, { window: 1, digits: 6 })
        if (!mfaValid) {
          authSecurityEnhancer.recordAttempt(loginAttemptKey, {
            maxAttempts: securityConfig.maxLoginAttempts,
            windowMs: securityConfig.lockoutDurationMinutes * 60 * 1000,
            blockDurationMs: securityConfig.lockoutDurationMinutes * 60 * 1000
          })
          res.status(401).json({
            success: false,
            code: 'MFA_INVALID',
            message: 'MFA验证码无效'
          })
          return
        }
      }

      // 生成token
      const timestamp = Date.now()
      let accessToken: string
      let refreshToken: string

      if (process.env.NODE_ENV === 'production') {
        // 生产环境使用真实JWT Token
        try {
          accessToken = generateToken({
            sub: user.id || `user-${user.username}`,
            role: user.role,
            username: user.username,
            tokenType: 'access'
          } as any)
          refreshToken = generateRefreshToken({
            sub: user.id || `user-${user.username}`,
            role: user.role,
            username: user.username,
            tokenType: 'refresh'
          } as any)
          logger.info('生成JWT Token成功', { username: user.username, role: user.role })
        } catch (error) {
          logger.error('生成JWT Token失败', { error, username: user.username })
          res.status(500).json({
            success: false,
            message: '生成认证令牌失败，请稍后重试'
          })
          return
        }
      } else {
        // 开发环境使用Mock Token
        accessToken = `mock-jwt-token-${user.role}-${timestamp}`
        refreshToken = `mock-refresh-token-${user.role}-${timestamp}`
        logger.warn('使用Mock Token（仅限开发环境）', { username: user.username })
      }

      authSecurityEnhancer.resetAttempts(loginAttemptKey)

      // 构建响应数据
      const userData = {
        id: user.id || `user-${Date.now()}`,
        username: user.username,
        role: user.role,
        is_active: true,
        last_login: new Date().toISOString(),
        created_at: user.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        mustChangePassword: user.mustChangePassword || false
      }

      const tokens = {
        accessToken,
        refreshToken,
        expiresIn: rememberMe ? 7 * 24 * 60 * 60 : 60 * 60, // 7天或1小时
        tokenType: 'Bearer'
      }

      // Phase 2: 记录会话
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const sessionInfo: SessionInfo = {
        id: sessionId,
        userId: userData.id,
        username: userData.username,
        role: userData.role,
        deviceName: this.parseDeviceName(req.headers['user-agent'] || ''),
        ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      }
      this.sessions.set(sessionId, sessionInfo)
      
      // 同时记录到 AuthSecurityEnhancer
      authSecurityEnhancer.addSession(accessToken, {
        userId: userData.id,
        role: userData.role,
        ip: sessionInfo.ip,
        userAgent: sessionInfo.userAgent
      })
      authSecurityEnhancer.addSession(refreshToken, {
        userId: userData.id,
        role: userData.role,
        ip: sessionInfo.ip,
        userAgent: sessionInfo.userAgent
      })

      logger.info('用户登录成功', { username, role: user.role, sessionId })

      res.json({
        success: true,
        data: {
          user: userData,
          tokens,
          sessionId // 返回会话ID便于后续管理
        },
        message: '登录成功'
      })

    } catch (error) {
      logger.error('登录处理失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  async handleLogout(req: Request, res: Response): Promise<void> {
    try {
      // Phase 2: 实现真实的登出撤销
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        
        // 1. 将token加入黑名单
        authSecurityEnhancer.revokeToken(token)
        
        // 2. 移除会话记录
        authSecurityEnhancer.removeSession(token)
        
        // 3. 从内存会话中移除（根据用户ID）
        const auth = (req as any).auth
        if (auth?.userId) {
          // 只移除当前会话，不影响其他设备
          const sessionId = req.body.sessionId
          if (sessionId && this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId)
          }
        }
        
        logger.info('用户登出成功，Token已撤销', { 
          userId: auth?.userId,
          ip: req.ip 
        })
      }

      res.json({
        success: true,
        message: '登出成功，令牌已失效'
      })

    } catch (error) {
      logger.error('登出处理失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  async handleVerifyToken(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          message: 'Token无效'
        })
        return
      }

      const token = authHeader.slice(7)
      let user: UserRecord | undefined

      if (token.startsWith('mock-jwt-token-')) {
        if (process.env.NODE_ENV === 'production') {
          res.status(401).json({
            success: false,
            message: 'Token无效或已过期'
          })
          return
        }

        const parts = token.split('-')
        const role = parts[3] // admin或operator
        const users = await this.loadUsers()
        user = users.find(u => u.role === role && u.enabled !== false)
      } else {
        try {
          if (authSecurityEnhancer.isTokenRevoked(token)) {
            res.status(401).json({
              success: false,
              message: 'Token已失效'
            })
            return
          }

          const decoded = verifyToken(token)
          if (decoded.tokenType && decoded.tokenType !== 'access') {
            res.status(401).json({
              success: false,
              message: 'Token类型无效'
            })
            return
          }

          const users = await this.loadUsers()
          user = users.find(u =>
            (decoded.sub && u.id === decoded.sub) ||
            (!!decoded.username && u.username === decoded.username)
          )
        } catch (error) {
          logger.warn('Token验证失败', { error })
        }
      }
        
      if (user) {
        const userData = {
          id: user.id || `user-${Date.now()}`,
          username: user.username,
          role: user.role,
          is_active: user.enabled === true,
          last_login: user.lastLogin || null,
          created_at: user.createdAt || new Date().toISOString(),
          updated_at: user.updatedAt || new Date().toISOString()
        }

        res.json({
          success: true,
          data: userData
        })
        return
      }

      res.status(401).json({
        success: false,
        message: 'Token无效或已过期'
      })

    } catch (error) {
      logger.error('Token验证失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  async handleRefreshToken(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = typeof req.body?.refreshToken === 'string'
        ? req.body.refreshToken
        : ''

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          message: 'Refresh token无效'
        })
        return
      }

      let newAccessToken: string
      let newRefreshToken: string

      if (refreshToken.startsWith('mock-refresh-token-')) {
        if (process.env.NODE_ENV === 'production') {
          res.status(401).json({
            success: false,
            message: 'Refresh token无效或已过期'
          })
          return
        }

        const parts = refreshToken.split('-')
        const role = parts[3]
        const timestamp = Date.now()
        newAccessToken = `mock-jwt-token-${role}-${timestamp}`
        newRefreshToken = `mock-refresh-token-${role}-${timestamp}`
      } else {
        try {
          if (authSecurityEnhancer.isTokenRevoked(refreshToken)) {
            res.status(401).json({
              success: false,
              message: 'Refresh token已被撤销'
            })
            return
          }

          const decoded = verifyToken(refreshToken)
          if ((decoded as any).tokenType !== 'refresh') {
            res.status(401).json({
              success: false,
              message: 'Refresh token类型无效'
            })
            return
          }

          const users = await this.loadUsers()
          const user = users.find(u =>
            (decoded.sub && u.id === decoded.sub) ||
            (!!decoded.username && u.username === decoded.username)
          )
          
          if (!user || user.enabled !== true) {
            res.status(401).json({
              success: false,
              message: 'Refresh token无效'
            })
            return
          }

          // 轮换 refresh token，并撤销旧 token，降低泄露风险。
          authSecurityEnhancer.revokeToken(refreshToken)
          authSecurityEnhancer.removeSession(refreshToken)

          newAccessToken = generateToken({
            sub: user.id || `user-${user.username}`,
            role: user.role,
            username: user.username,
            tokenType: 'access'
          } as any)
          newRefreshToken = generateRefreshToken({
            sub: user.id || `user-${user.username}`,
            role: user.role,
            username: user.username,
            tokenType: 'refresh'
          } as any)

          authSecurityEnhancer.addSession(newAccessToken, {
            userId: user.id || `user-${user.username}`,
            role: user.role
          })
          authSecurityEnhancer.addSession(newRefreshToken, {
            userId: user.id || `user-${user.username}`,
            role: user.role
          })

          logger.debug('刷新Token成功', { username: user.username })
        } catch (error) {
          logger.warn('Refresh token验证失败', { error })
          res.status(401).json({
            success: false,
            message: 'Refresh token无效或已过期'
          })
          return
        }
      }

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: 60 * 60, // 1小时
          tokenType: 'Bearer'
        }
      })

    } catch (error) {
      logger.error('Token刷新失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  async handleGetProfile(req: Request, res: Response): Promise<void> {
    try {
      const auth = (req as any).auth
      if (!auth?.userId) {
        res.status(401).json({
          success: false,
          message: '未授权'
        })
        return
      }

      const users = await this.loadUsers()
      const user = users.find(u =>
        (u.id && u.id === auth.userId) ||
        (!!auth.username && u.username === auth.username)
      )
        
      if (user && user.enabled === true) {
        const userData = {
          id: user.id || `user-${Date.now()}`,
          username: user.username,
          role: user.role,
          is_active: true,
          last_login: user.lastLogin || null,
          created_at: user.createdAt || new Date().toISOString(),
          updated_at: user.updatedAt || new Date().toISOString()
        }

        res.json({
          success: true,
          data: userData
        })
        return
      }

      res.status(401).json({
        success: false,
        message: '用户信息获取失败'
      })

    } catch (error) {
      logger.error('获取用户信息失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  async handleChangePassword(req: Request, res: Response): Promise<void> {
    try {
      // 验证输入参数
      const { error, value } = this.validateChangePasswordInput(req.body)
      if (error) {
        res.status(400).json({
          success: false,
          message: '输入验证失败',
          error: error.details[0].message
        })
        return
      }

      const { currentPassword, newPassword, confirmPassword } = value

      // 验证新密码和确认密码是否一致
      if (newPassword !== confirmPassword) {
        res.status(400).json({
          success: false,
          message: '新密码和确认密码不一致'
        })
        return
      }

      const auth = (req as any).auth
      if (!auth?.userId) {
        res.status(401).json({
          success: false,
          message: '未授权访问'
        })
        return
      }

      const settings = await this.loadSystemSettings()
      const securityConfig = this.getAccountSecurityConfig(settings)
      const policyErrors = this.validatePasswordByPolicy(newPassword, securityConfig.passwordPolicy)
      if (policyErrors.length > 0) {
        res.status(400).json({
          success: false,
          code: 'WEAK_PASSWORD',
          message: policyErrors[0],
          details: policyErrors
        })
        return
      }

      const users = await this.loadUsers()
      const currentUser = users.find(u =>
        (u.id && u.id === auth.userId) ||
        (!!auth.username && u.username === auth.username)
      )

      if (!currentUser) {
        res.status(401).json({
          success: false,
          message: 'Token无效或已过期'
        })
        return
      }

      if (currentUser.enabled !== true) {
        res.status(403).json({
          success: false,
          message: '账户已被禁用，请联系管理员'
        })
        return
      }

      // 使用bcrypt验证当前密码
      const isPasswordValid = await PasswordUtils.verifyPassword(currentPassword, currentUser.password)
      if (!isPasswordValid) {
        res.status(400).json({
          success: false,
          message: '当前密码错误'
        })
        return
      }

      // 加密新密码
      const hashedPassword = await PasswordUtils.hashPassword(newPassword)
      
      // 更新系统设置文件中的密码
      try {
        const settingsPath = join(process.cwd(), 'configs', 'system-config.json')
        const content = await fs.readFile(settingsPath, 'utf8')
        const settings = JSON.parse(content)
        
        if (settings.accounts?.users) {
          const userIndex = settings.accounts.users.findIndex((u: any) => u.username === currentUser.username)
          if (userIndex >= 0) {
            settings.accounts.users[userIndex].password = hashedPassword
            settings.accounts.users[userIndex].updatedAt = new Date().toISOString()
            settings.accounts.users[userIndex].mustChangePassword = false
            
            await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
            this.clearUsersCache() // 清除缓存
            
            logger.info('用户密码修改成功', { username: currentUser.username })
          }
        }
      } catch (error) {
        logger.error('更新密码到配置文件失败', { error })
        throw error
      }

      res.json({
        success: true,
        message: '密码修改成功，请重新登录'
      })

    } catch (error) {
      logger.error('修改密码失败', error)
      res.status(500).json({
        success: false,
        message: '服务器内部错误'
      })
    }
  }

  // Phase 2: 获取当前用户的会话列表
  async handleGetSessions(req: Request, res: Response): Promise<void> {
    try {
      const auth = (req as any).auth
      if (!auth?.userId) {
        res.status(401).json({ success: false, message: '未认证' })
        return
      }

      // 获取当前用户的所有会话
      const userSessions: SessionInfo[] = []
      const currentToken = req.headers.authorization?.slice(7) || ''
      
      for (const [id, session] of this.sessions.entries()) {
        if (session.userId === auth.userId) {
          userSessions.push({
            ...session,
            current: id === req.body.currentSessionId // 标记当前会话
          })
        }
      }

      // 按最近活动时间排序
      userSessions.sort((a, b) => 
        new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
      )

      res.json({
        success: true,
        data: userSessions,
        message: `找到 ${userSessions.length} 个会话`
      })
    } catch (error) {
      logger.error('获取会话列表失败', error)
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  // Phase 2: 撤销指定会话
  async handleRevokeSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params
      const auth = (req as any).auth
      
      if (!auth?.userId) {
        res.status(401).json({ success: false, message: '未认证' })
        return
      }

      const session = this.sessions.get(id)
      if (!session) {
        res.status(404).json({ success: false, message: '会话不存在' })
        return
      }

      // 普通用户只能撤销自己的会话，admin可以撤销任何会话
      if (session.userId !== auth.userId && auth.role !== 'admin') {
        res.status(403).json({ success: false, message: '无权撤销此会话' })
        return
      }

      this.sessions.delete(id)
      logger.info('会话已撤销', { sessionId: id, revokedBy: auth.userId })

      res.json({
        success: true,
        message: '会话已撤销'
      })
    } catch (error) {
      logger.error('撤销会话失败', error)
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  // Phase 2: 撤销当前用户的其他所有会话
  async handleRevokeAllOtherSessions(req: Request, res: Response): Promise<void> {
    try {
      const auth = (req as any).auth
      const currentSessionId = req.body.currentSessionId
      
      if (!auth?.userId) {
        res.status(401).json({ success: false, message: '未认证' })
        return
      }

      let revokedCount = 0
      for (const [id, session] of this.sessions.entries()) {
        if (session.userId === auth.userId && id !== currentSessionId) {
          this.sessions.delete(id)
          revokedCount++
        }
      }

      logger.info('已撤销其他会话', { userId: auth.userId, revokedCount })

      res.json({
        success: true,
        message: `已撤销 ${revokedCount} 个其他会话`
      })
    } catch (error) {
      logger.error('撤销其他会话失败', error)
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  // Phase 2: 管理员获取所有会话
  async handleGetAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const allSessions = Array.from(this.sessions.values())
      
      // 按用户分组
      const sessionsByUser: Record<string, SessionInfo[]> = {}
      for (const session of allSessions) {
        if (!sessionsByUser[session.userId]) {
          sessionsByUser[session.userId] = []
        }
        sessionsByUser[session.userId].push(session)
      }

      res.json({
        success: true,
        data: {
          total: allSessions.length,
          byUser: sessionsByUser,
          sessions: allSessions
        },
        message: `共 ${allSessions.length} 个活动会话`
      })
    } catch (error) {
      logger.error('获取所有会话失败', error)
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  // Phase 2: 管理员撤销指定用户的所有会话
  async handleRevokeUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params
      const auth = (req as any).auth
      
      let revokedCount = 0
      for (const [id, session] of this.sessions.entries()) {
        if (session.userId === userId) {
          this.sessions.delete(id)
          revokedCount++
        }
      }

      logger.info('管理员撤销用户会话', { 
        targetUserId: userId, 
        revokedBy: auth.userId, 
        revokedCount 
      })

      res.json({
        success: true,
        message: `已撤销用户 ${userId} 的 ${revokedCount} 个会话`
      })
    } catch (error) {
      logger.error('撤销用户会话失败', error)
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  // Phase 2: 解析设备名称
  private parseDeviceName(userAgent: string): string {
    if (!userAgent) return '未知设备'
    
    if (userAgent.includes('Windows')) return 'Windows 设备'
    if (userAgent.includes('Mac')) return 'Mac 设备'
    if (userAgent.includes('Linux')) return 'Linux 设备'
    if (userAgent.includes('iPhone')) return 'iPhone'
    if (userAgent.includes('Android')) return 'Android 设备'
    if (userAgent.includes('iPad')) return 'iPad'
    
    return '未知设备'
  }

  /**
   * 验证登录输入
   */
  private validateLoginInput(body: any) {
    const schema = Joi.object({
      username: Joi.string().required().min(1).max(50),
      password: Joi.string().required().min(1).max(100),
      rememberMe: Joi.boolean().optional().default(false),
      mfaCode: Joi.string().optional().pattern(/^\d{6,8}$/).messages({
        'string.pattern.base': 'MFA验证码格式无效'
      })
    })

    return schema.validate(body)
  }

  /**
   * 验证密码修改输入
   */
  private validateChangePasswordInput(body: any) {
    const schema = Joi.object({
      currentPassword: Joi.string().required().min(1).max(100),
      newPassword: Joi.string().required().min(8).max(100),
      confirmPassword: Joi.string().required().min(8).max(100)
    })

    return schema.validate(body)
  }

  getRouter(): Router {
    return this.router
  }
}
