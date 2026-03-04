# 第一阶段实施方案：安全加固与关键Bug修复

**方案编号**: PHASE-1-SEC-001  
**制定日期**: 2025-10-29  
**预计工期**: 1-2周  
**优先级**: 🔴 高（立即实施）  
**负责人**: 待指定  
**审批状态**: ⏳ 待批准

---

## 📋 方案概述

### 目标
解决系统中的关键安全隐患和已知Bug，确保系统达到生产环境的安全标准。

### 范围
1. **安全加固**（4项）
   - 移除生产环境Mock Token支持
   - 加强WebSocket连接认证
   - 完善文件上传白名单验证
   - 敏感信息脱敏处理

2. **Bug修复**（3项）
   - 修复应用刷新UUID问题（已修复，需验证）
   - 完善端口冲突解决机制
   - 优化WebSocket重连逻辑

### 预期成果
- ✅ 消除高危安全漏洞
- ✅ 提升系统稳定性
- ✅ 通过安全审计
- ✅ 所有测试用例通过

---

## 🔒 安全加固任务

### 任务1：移除生产环境Mock Token支持

#### 问题描述
**风险等级**: 🔴 高  
**影响范围**: 认证系统

当前系统在生产环境仍允许 `mock-jwt-token-*` 格式的token直接通过认证，存在严重安全隐患。

**问题代码位置**:
- `detection-api/src/core/security/AuthSecurityEnhancer.ts` (第126-132行)
- `detection-api/src/api/controllers/AuthController.ts` (第147-148行, 第227-252行)
- `main-portal/src/stores/auth.ts` (第142-160行)

#### 解决方案

**1. 后端认证中间件修改**

文件: `detection-api/src/core/security/AuthSecurityEnhancer.ts`

```typescript
// 修改第126-132行
// 原代码：
// 兼容旧的 mock token：直接放行，但不进行JWT校验
if (token.startsWith('mock-jwt-token-')) {
  const role = token.split('-')[3] || 'guest'
  ;(req as any).auth = { userId: 'mock', role }
  this.resetAttempts(bfKey)
  return next()
}

// 修改为：
// 生产环境禁止 mock token
if (token.startsWith('mock-jwt-token-')) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('生产环境拒绝Mock Token', { ip, userAgent })
    return res.status(401).json({ 
      success: false, 
      message: '无效的认证凭证' 
    })
  }
  
  // 开发/测试环境允许，但记录警告
  logger.warn('使用Mock Token（仅限开发环境）', { token: token.substring(0, 20) })
  const role = token.split('-')[3] || 'guest'
  ;(req as any).auth = { userId: 'mock-dev', role, isMock: true }
  this.resetAttempts(bfKey)
  return next()
}
```

**2. 登录控制器修改**

文件: `detection-api/src/api/controllers/AuthController.ts`

```typescript
// 修改第147-148行
// 原代码：
const accessToken = `mock-jwt-token-${user.role}-${timestamp}`
const refreshToken = `mock-refresh-token-${user.role}-${timestamp}`

// 修改为：
// 生产环境使用真实JWT
let accessToken: string
let refreshToken: string

if (process.env.NODE_ENV === 'production') {
  // 生成真实JWT Token
  const { generateToken, generateRefreshToken } = await import('../utils/jwt.js')
  accessToken = generateToken({ 
    sub: user.id || `user-${user.username}`,
    role: user.role,
    username: user.username
  })
  refreshToken = generateRefreshToken({ 
    sub: user.id || `user-${user.username}`,
    role: user.role,
    username: user.username
  })
} else {
  // 开发环境使用Mock Token
  accessToken = `mock-jwt-token-${user.role}-${timestamp}`
  refreshToken = `mock-refresh-token-${user.role}-${timestamp}`
  logger.warn('使用Mock Token（仅限开发环境）', { username: user.username })
}
```

**3. 前端Token验证修改**

文件: `main-portal/src/stores/auth.ts`

```typescript
// 修改第142-160行
} else if (token.startsWith('mock-jwt-token-')) {
  // 检查是否为生产环境
  if (import.meta.env.PROD) {
    console.error('生产环境不允许使用Mock Token')
    clearAuthData()
    return false
  }
  
  // 开发环境：检查是否过旧（超过24小时）
  const timestampMatch = token.match(/mock-jwt-token-\w+-(\d+)/)
  if (timestampMatch) {
    const tokenTimestamp = parseInt(timestampMatch[1])
    const now = Date.now()
    const tokenAge = now - tokenTimestamp
    
    if (tokenAge > 24 * 60 * 60 * 1000) {
      console.warn('Mock Token已过期，清除认证数据')
      clearAuthData()
      return false
    }
  }
  console.warn('使用Mock Token（仅限开发环境）')
}
```

#### 测试验证

**测试用例1**: 生产环境拒绝Mock Token
```bash
# 设置生产环境
export NODE_ENV=production

# 测试Mock Token请求
curl -X GET http://localhost:8002/v2/auth/verify \
  -H "Authorization: Bearer mock-jwt-token-admin-1234567890"

# 预期结果：401 Unauthorized
```

**测试用例2**: 开发环境允许Mock Token
```bash
# 设置开发环境
export NODE_ENV=development

# 测试Mock Token请求
curl -X GET http://localhost:8002/v2/auth/verify \
  -H "Authorization: Bearer mock-jwt-token-admin-1234567890"

# 预期结果：200 OK（带警告日志）
```

**测试用例3**: 生产环境使用真实JWT
```bash
# 登录获取真实JWT
curl -X POST http://localhost:8002/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 使用返回的JWT访问API
curl -X GET http://localhost:8002/v2/auth/verify \
  -H "Authorization: Bearer <real-jwt-token>"

# 预期结果：200 OK
```

#### 影响评估
- **破坏性变更**: 是（生产环境）
- **向后兼容**: 开发环境兼容
- **需要迁移**: 生产环境需重新登录

---

### 任务2：加强WebSocket连接认证

#### 问题描述
**风险等级**: 🔴 高  
**影响范围**: 实时通信系统

当前WebSocket连接缺少有效的认证机制，任何人都可以连接并接收消息。

**问题代码位置**:
- `detection-api/src/services/websocketService.ts` (第186-215行)
- `main-portal/src/composables/useWebSocket.ts` (第59-86行)

#### 解决方案

**1. 后端WebSocket认证**

文件: `detection-api/src/services/websocketService.ts`

在 `handleConnection` 方法前添加认证逻辑：

```typescript
import { verifyToken } from '../utils/jwt.js'
import { parse as parseUrl } from 'url'

/**
 * 处理新的WebSocket连接（增强认证）
 */
private handleConnection(ws: WebSocket, request: any): void {
  // 1. 提取Token（从URL参数或握手头）
  const token = this.extractToken(request)
  
  // 2. 验证Token（生产环境强制验证）
  if (process.env.NODE_ENV === 'production' && !token) {
    logger.warn('WebSocket连接被拒绝：缺少认证Token', {
      ip: request.socket.remoteAddress
    })
    ws.close(1008, 'Authentication required')
    return
  }
  
  let userId = 'anonymous'
  let userRole = 'guest'
  
  if (token) {
    try {
      // 验证Token
      if (token.startsWith('mock-jwt-token-')) {
        // Mock Token处理
        if (process.env.NODE_ENV === 'production') {
          logger.warn('WebSocket连接被拒绝：生产环境不允许Mock Token')
          ws.close(1008, 'Invalid token')
          return
        }
        userRole = token.split('-')[3] || 'guest'
        userId = 'mock-dev'
      } else {
        // 真实JWT验证
        const payload = verifyToken(token)
        userId = payload.sub || 'unknown'
        userRole = payload.role || 'guest'
      }
      
      logger.info('WebSocket连接认证成功', { userId, userRole })
    } catch (error) {
      logger.warn('WebSocket Token验证失败', { 
        error: error instanceof Error ? error.message : String(error),
        ip: request.socket.remoteAddress
      })
      
      if (process.env.NODE_ENV === 'production') {
        ws.close(1008, 'Invalid token')
        return
      }
      // 开发环境允许继续，但标记为未认证
      userId = 'unauthenticated'
      userRole = 'guest'
    }
  }
  
  // 3. 创建客户端对象（添加认证信息）
  const clientId = this.generateClientId()
  const client: WebSocketClient = {
    id: clientId,
    ws,
    userId,        // 新增
    userRole,      // 新增
    authenticated: !!token,  // 新增
    subscribedBuilds: new Set(),
    subscribedApps: new Set(),
    subscribedAppBindings: false,
    subscribedLogs: {
      appIds: new Set(),
      levels: new Set(),
      sources: new Set(),
      systemLogs: false
    },
    lastPing: Date.now(),
    isAlive: true
  }
  
  this.clients.set(clientId, client)
  
  // 4. 发送欢迎消息（包含认证状态）
  this.sendToClient(ws, {
    type: 'welcome',
    data: {
      clientId,
      authenticated: client.authenticated,
      userId: client.userId,
      role: client.userRole,
      serverTime: Date.now()
    },
    timestamp: Date.now()
  })
  
  // ... 其余代码保持不变
}

/**
 * 从请求中提取Token
 */
private extractToken(request: any): string | null {
  try {
    // 1. 从URL参数提取
    const url = parseUrl(request.url || '', true)
    if (url.query?.token) {
      return decodeURIComponent(url.query.token as string)
    }
    
    // 2. 从握手头提取
    const authHeader = request.headers['authorization'] || 
                      request.headers['sec-websocket-protocol']
    
    if (authHeader) {
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7)
      }
      // 支持通过子协议传递Token
      if (typeof authHeader === 'string') {
        return authHeader
      }
    }
    
    return null
  } catch (error) {
    logger.error('提取WebSocket Token失败', { error })
    return null
  }
}
```

**2. 更新WebSocketClient接口**

文件: `detection-api/src/services/websocketService.ts`

```typescript
export interface WebSocketClient {
  id: string
  ws: WebSocket
  userId: string              // 新增
  userRole: string            // 新增
  authenticated: boolean      // 新增
  subscribedBuilds: Set<string>
  subscribedApps: Set<string>
  subscribedAppBindings: boolean
  subscribedLogs: {
    appIds: Set<string>
    levels: Set<string>
    sources: Set<string>
    systemLogs: boolean
  }
  lastPing: number
  isAlive: boolean
}
```

**3. 前端WebSocket连接优化**

文件: `main-portal/src/composables/useWebSocket.ts`

```typescript
// 修改第59-86行，优化Token传递
try {
  // 构建WebSocket URL
  let finalWsUrl = wsUrl
  const token = localStorage.getItem('auth_token')
  
  if (token) {
    // 优先使用URL参数传递Token（更可靠）
    const separator = wsUrl.includes('?') ? '&' : '?'
    finalWsUrl = `${wsUrl}${separator}token=${encodeURIComponent(token)}`
  } else if (import.meta.env.PROD) {
    // 生产环境必须有Token
    console.error('生产环境WebSocket连接需要认证Token')
    error.value = '需要登录才能建立实时连接'
    isConnecting.value = false
    return
  }

  ws = new WebSocket(finalWsUrl)
  
  // 存储WebSocket实例
  ;(window as any).__portalWebSocket = ws

  ws.onopen = () => {
    console.log('WebSocket连接成功')
    isConnected.value = true
    isConnecting.value = false
    reconnectAttempts = 0
    error.value = null

    // 连接成功后，等待服务器的welcome消息确认认证状态
    options.onConnect?.()
  }
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      
      // 处理welcome消息
      if (message.type === 'welcome') {
        console.log('WebSocket认证状态:', {
          authenticated: message.data?.authenticated,
          userId: message.data?.userId,
          role: message.data?.role
        })
        
        // 如果未认证且在生产环境，关闭连接
        if (import.meta.env.PROD && !message.data?.authenticated) {
          console.error('WebSocket未认证，关闭连接')
          ws?.close()
          error.value = '认证失败，请重新登录'
          return
        }
      }
      
      options.onMessage?.(message)
    } catch (err) {
      console.error('解析WebSocket消息失败:', err)
    }
  }
  
  // ... 其余代码
}
```

#### 测试验证

**测试用例1**: 无Token连接（生产环境）
```javascript
// 生产环境
const ws = new WebSocket('ws://localhost:8002/ws')
// 预期：连接立即关闭，code=1008
```

**测试用例2**: 有效Token连接
```javascript
const token = localStorage.getItem('auth_token')
const ws = new WebSocket(`ws://localhost:8002/ws?token=${token}`)
// 预期：连接成功，收到welcome消息，authenticated=true
```

**测试用例3**: 无效Token连接
```javascript
const ws = new WebSocket('ws://localhost:8002/ws?token=invalid-token')
// 预期：连接关闭，code=1008
```

---

### 任务3：完善文件上传白名单验证

#### 问题描述
**风险等级**: 🔴 高  
**影响范围**: 文件系统操作

当前文件上传只检查MIME类型和扩展名，缺少内容验证和完整的白名单机制。

**问题代码位置**:
- `detection-api/src/routes/configurationExport.ts` (第21-34行)

#### 解决方案

**1. 增强文件上传验证**

文件: `detection-api/src/routes/configurationExport.ts`

```typescript
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

// 配置multer用于文件上传（增强版）
const upload = multer({
  dest: 'uploads/imports/',
  fileFilter: (req, file, cb) => {
    // 1. MIME类型白名单
    const allowedMimeTypes = [
      'application/json',
      'text/plain'  // 某些系统可能将JSON识别为text/plain
    ]
    
    // 2. 扩展名白名单
    const allowedExtensions = ['.json']
    const ext = path.extname(file.originalname).toLowerCase()
    
    // 3. 文件名安全检查
    const filename = file.originalname
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return cb(new Error('文件名包含非法字符'))
    }
    
    // 4. MIME类型和扩展名验证
    if (!allowedMimeTypes.includes(file.mimetype) && !allowedExtensions.includes(ext)) {
      return cb(new Error('只允许上传JSON文件'))
    }
    
    cb(null, true)
  },
  limits: {
    fileSize: 10 * 1024 * 1024,  // 降低到10MB
    files: 1,                     // 一次只允许一个文件
    fields: 5,                    // 限制表单字段数量
    fieldSize: 1024               // 限制字段大小
  }
})

// 文件内容验证中间件
const validateFileContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未上传文件'
      })
    }
    
    const filePath = req.file.path
    
    // 1. 读取文件内容
    const content = readFileSync(filePath, 'utf-8')
    
    // 2. 验证JSON格式
    let jsonData: any
    try {
      jsonData = JSON.parse(content)
    } catch (error) {
      // 删除无效文件
      unlinkSync(filePath)
      return res.status(400).json({
        success: false,
        message: '文件不是有效的JSON格式'
      })
    }
    
    // 3. 验证JSON结构（根据业务需求）
    if (!jsonData || typeof jsonData !== 'object') {
      unlinkSync(filePath)
      return res.status(400).json({
        success: false,
        message: 'JSON文件结构无效'
      })
    }
    
    // 4. 检查必需字段（示例）
    if (Array.isArray(jsonData)) {
      // 配置数组格式
      for (const item of jsonData) {
        if (!item.name || !item.type) {
          unlinkSync(filePath)
          return res.status(400).json({
            success: false,
            message: 'JSON配置缺少必需字段（name, type）'
          })
        }
      }
    }
    
    // 5. 计算文件哈希（用于审计）
    const hash = createHash('sha256').update(content).digest('hex')
    req.body.fileHash = hash
    req.body.fileSize = req.file.size
    
    logger.info('文件上传验证通过', {
      filename: req.file.originalname,
      size: req.file.size,
      hash: hash.substring(0, 16)
    })
    
    next()
  } catch (error) {
    logger.error('文件内容验证失败', { error })
    
    // 清理文件
    if (req.file?.path) {
      try {
        unlinkSync(req.file.path)
      } catch (e) {
        // 忽略删除错误
      }
    }
    
    res.status(500).json({
      success: false,
      message: '文件验证失败'
    })
  }
}

// 应用到路由
router.post('/import', 
  upload.single('file'),
  validateFileContent,  // 新增内容验证
  async (req: Request, res: Response) => {
    // ... 原有导入逻辑
  }
)
```

**2. 添加文件清理定时任务**

文件: `detection-api/src/services/FileCleanupService.ts` (新建)

```typescript
import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { logger } from '../utils/logger.js'

export class FileCleanupService {
  private uploadDir = 'uploads/imports/'
  private maxAge = 24 * 60 * 60 * 1000  // 24小时
  private cleanupInterval: NodeJS.Timeout | null = null
  
  /**
   * 启动定时清理
   */
  start(): void {
    // 立即执行一次
    this.cleanup().catch(error => {
      logger.error('文件清理失败', { error })
    })
    
    // 每小时执行一次
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        logger.error('文件清理失败', { error })
      })
    }, 60 * 60 * 1000)
    
    logger.info('文件清理服务已启动')
  }
  
  /**
   * 停止定时清理
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      logger.info('文件清理服务已停止')
    }
  }
  
  /**
   * 清理过期文件
   */
  private async cleanup(): Promise<void> {
    try {
      const files = await readdir(this.uploadDir)
      const now = Date.now()
      let deletedCount = 0
      
      for (const file of files) {
        const filePath = join(this.uploadDir, file)
        const stats = await stat(filePath)
        
        // 删除超过24小时的文件
        if (now - stats.mtimeMs > this.maxAge) {
          await unlink(filePath)
          deletedCount++
          logger.debug('删除过期上传文件', { file, age: now - stats.mtimeMs })
        }
      }
      
      if (deletedCount > 0) {
        logger.info('文件清理完成', { deletedCount, totalFiles: files.length })
      }
    } catch (error) {
      logger.error('文件清理过程出错', { error })
    }
  }
}

export const fileCleanupService = new FileCleanupService()
```

在 `detection-api/src/server.ts` 中启动清理服务：

```typescript
import { fileCleanupService } from './services/FileCleanupService.js'

// 启动服务器后
server.listen(PORT, HOST, () => {
  logger.info(`Server running on http://${HOST}:${PORT}`)
  
  // 启动文件清理服务
  fileCleanupService.start()
})

// 优雅关闭
process.on('SIGTERM', () => {
  fileCleanupService.stop()
  // ... 其他清理逻辑
})
```

#### 测试验证

**测试用例1**: 上传有效JSON文件
```bash
curl -X POST http://localhost:8002/v2/config/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@valid-config.json"
# 预期：200 OK
```

**测试用例2**: 上传非JSON文件
```bash
curl -X POST http://localhost:8002/v2/config/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@malicious.exe"
# 预期：400 Bad Request
```

**测试用例3**: 上传超大文件
```bash
curl -X POST http://localhost:8002/v2/config/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@large-file.json"  # >10MB
# 预期：413 Payload Too Large
```

---

### 任务4：敏感信息脱敏处理

#### 问题描述
**风险等级**: 🟡 中  
**影响范围**: 日志系统、错误响应

当前系统在日志和错误消息中可能泄露敏感信息（路径、Token、密码等）。

#### 解决方案

**1. 创建敏感信息脱敏工具**

文件: `detection-api/src/utils/sanitizer.ts` (新建)

```typescript
import { logger } from './logger.js'

/**
 * 敏感信息脱敏工具
 */
export class Sanitizer {
  // 敏感字段列表
  private static sensitiveFields = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'privateKey',
    'authorization'
  ]
  
  // 路径脱敏正则
  private static pathPatterns = [
    /([A-Z]:\\Users\\[^\\]+)/gi,  // Windows用户路径
    /(\/home\/[^\/]+)/gi,          // Linux用户路径
    /(\/Users\/[^\/]+)/gi          // Mac用户路径
  ]
  
  /**
   * 脱敏对象中的敏感字段
   */
  static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }
    
    const sanitized: any = {}
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      
      // 检查是否为敏感字段
      if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = this.maskValue(value)
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value)
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizePath(value)
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }
  
  /**
   * 脱敏路径信息
   */
  static sanitizePath(path: string): string {
    if (!path || typeof path !== 'string') {
      return path
    }
    
    let sanitized = path
    
    // 替换用户路径
    for (const pattern of this.pathPatterns) {
      sanitized = sanitized.replace(pattern, '<USER_HOME>')
    }
    
    return sanitized
  }
  
  /**
   * 掩码敏感值
   */
  static maskValue(value: any): string {
    if (!value) return '***'
    
    const str = String(value)
    if (str.length <= 8) {
      return '***'
    }
    
    // 保留前4位和后4位
    return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`
  }
  
  /**
   * 脱敏错误消息
   */
  static sanitizeError(error: Error): Error {
    const sanitized = new Error(this.sanitizePath(error.message))
    sanitized.name = error.name
    
    if (error.stack) {
      sanitized.stack = this.sanitizePath(error.stack)
    }
    
    return sanitized
  }
}

// 便捷函数
export const sanitizeObject = (obj: any) => Sanitizer.sanitizeObject(obj)
export const sanitizePath = (path: string) => Sanitizer.sanitizePath(path)
export const sanitizeError = (error: Error) => Sanitizer.sanitizeError(error)
```

**2. 集成到日志系统**

文件: `detection-api/src/utils/logger.ts`

```typescript
import { sanitizeObject, sanitizePath } from './sanitizer.js'

// 修改日志方法，添加自动脱敏
class Logger {
  info(message: string, meta?: any) {
    const sanitizedMeta = meta ? sanitizeObject(meta) : undefined
    const sanitizedMessage = sanitizePath(message)
    this.winston.info(sanitizedMessage, sanitizedMeta)
  }
  
  error(message: string, error?: any, meta?: any) {
    const sanitizedMeta = meta ? sanitizeObject(meta) : undefined
    const sanitizedMessage = sanitizePath(message)
    
    if (error instanceof Error) {
      const sanitizedError = sanitizeError(error)
      this.winston.error(sanitizedMessage, {
        error: {
          message: sanitizedError.message,
          stack: sanitizedError.stack,
          name: sanitizedError.name
        },
        ...sanitizedMeta
      })
    } else {
      this.winston.error(sanitizedMessage, { error, ...sanitizedMeta })
    }
  }
  
  // ... 其他方法类似处理
}
```

**3. 生产环境错误响应脱敏**

文件: `detection-api/src/middleware/errorHandler.ts`

```typescript
import { sanitizePath, sanitizeError } from '../utils/sanitizer.js'

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('请求处理错误', err, {
    method: req.method,
    path: req.path,
    ip: req.ip
  })
  
  // 生产环境返回通用错误消息
  if (process.env.NODE_ENV === 'production') {
    res.status(err.status || 500).json({
      success: false,
      message: '服务器内部错误，请稍后重试',
      errorId: generateErrorId()  // 生成错误ID用于追踪
    })
  } else {
    // 开发环境返回详细错误（但仍然脱敏）
    const sanitizedError = sanitizeError(err)
    res.status(err.status || 500).json({
      success: false,
      message: sanitizedError.message,
      stack: sanitizedError.stack,
      details: err.details
    })
  }
}

function generateErrorId(): string {
  return `ERR-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
```

#### 测试验证

**测试用例1**: 日志脱敏
```typescript
logger.info('用户登录', {
  username: 'admin',
  password: 'secret123',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  path: 'C:\\Users\\John\\Projects\\app'
})

// 预期日志输出：
// {
//   username: 'admin',
//   password: '***',
//   token: 'eyJh...VCJ9',
//   path: '<USER_HOME>\\Projects\\app'
// }
```

**测试用例2**: 错误响应脱敏（生产环境）
```bash
# 触发错误
curl -X GET http://localhost:8002/v2/apps/invalid-id

# 预期响应：
# {
#   "success": false,
#   "message": "服务器内部错误，请稍后重试",
#   "errorId": "ERR-1698765432-abc123"
# }
```

---

## 🐛 Bug修复任务

### 任务5：验证应用刷新UUID问题修复

#### 问题描述
**优先级**: 🟡 中  
**状态**: ✅ 已修复（需验证）

应用刷新功能曾使用转换后的名称而非UUID调用API，导致刷新失败。

**代码位置**: `main-portal/src/stores/portal.ts` (第125-145行)

#### 验证方案

**1. 代码审查**
```typescript
// 当前代码（第132行）
const response = await publicApiService.getApp(app.id)  // ✅ 正确使用app.id
```

**2. 运行现有测试**
```bash
cd main-portal
npm run test -- portal-refresh-fix.test.ts
```

**3. 手动测试**
```javascript
// 在浏览器控制台
const portalStore = usePortalStore()
const app = portalStore.apps[0]
console.log('App ID:', app.id)  // 应该是UUID格式

await portalStore.refreshAppStatus(app.id)
// 检查网络请求，确认使用UUID而非转换后的名称
```

#### 预期结果
- ✅ 所有测试用例通过
- ✅ 网络请求使用UUID格式的ID
- ✅ 应用状态正确更新

---

### 任务6：完善端口冲突解决机制

#### 问题描述
**优先级**: 🟡 中  
**影响范围**: 端口管理系统

当前端口冲突只支持自动重新分配，缺少手动干预和冲突详情展示。

#### 解决方案

**1. 增强冲突检测API**

文件: `detection-api/src/routes/portManagement.ts`

添加新的API端点：

```typescript
/**
 * 获取端口冲突详情
 * GET /v2/ports/conflicts
 */
router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    const conflicts = await portManager.getPortConflicts()
    
    res.json({
      success: true,
      data: {
        conflicts,
        total: conflicts.length,
        timestamp: Date.now()
      }
    })
  } catch (error) {
    logger.error('获取端口冲突失败', { error })
    res.status(500).json({
      success: false,
      message: '获取端口冲突失败'
    })
  }
})

/**
 * 手动解决端口冲突
 * POST /v2/ports/conflicts/resolve
 */
router.post('/conflicts/resolve', async (req: Request, res: Response) => {
  try {
    const { port, strategy, targetPort } = req.body
    
    // 验证参数
    if (!port || !strategy) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数'
      })
    }
    
    // 支持的解决策略
    const strategies = ['reassign', 'force', 'release']
    if (!strategies.includes(strategy)) {
      return res.status(400).json({
        success: false,
        message: '无效的解决策略'
      })
    }
    
    let result
    switch (strategy) {
      case 'reassign':
        // 重新分配到新端口
        result = await portManager.reassignPort(port, targetPort)
        break
      case 'force':
        // 强制分配（终止占用进程）
        result = await portManager.forceAllocate(port)
        break
      case 'release':
        // 释放端口
        result = await portManager.releasePort(port)
        break
    }
    
    res.json({
      success: true,
      data: result,
      message: '端口冲突已解决'
    })
  } catch (error) {
    logger.error('解决端口冲突失败', { error })
    res.status(500).json({
      success: false,
      message: '解决端口冲突失败'
    })
  }
})
```

**2. 前端冲突管理界面**

文件: `main-portal/src/views/PortConflicts.vue` (新建)

```vue
<template>
  <div class="port-conflicts">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>端口冲突管理</span>
          <el-button @click="refresh" :loading="loading">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      
      <el-table :data="conflicts" v-loading="loading">
        <el-table-column prop="port" label="端口" width="100" />
        <el-table-column prop="conflictType" label="冲突类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getConflictTypeTag(row.conflictType)">
              {{ row.conflictType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="details" label="详情" />
        <el-table-column prop="affectedApps" label="受影响应用">
          <template #default="{ row }">
            <el-tag v-for="app in row.affectedApps" :key="app" size="small">
              {{ app }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="severity" label="严重程度" width="120">
          <template #default="{ row }">
            <el-tag :type="getSeverityTag(row.severity)">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button-group>
              <el-button size="small" @click="resolveConflict(row, 'reassign')">
                重新分配
              </el-button>
              <el-button size="small" type="danger" @click="resolveConflict(row, 'force')">
                强制释放
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { portApi } from '@/services/portApi'

const conflicts = ref([])
const loading = ref(false)

const refresh = async () => {
  loading.value = true
  try {
    const response = await portApi.getConflicts()
    conflicts.value = response.data.conflicts
  } catch (error) {
    ElMessage.error('获取端口冲突失败')
  } finally {
    loading.value = false
  }
}

const resolveConflict = async (conflict: any, strategy: string) => {
  try {
    await ElMessageBox.confirm(
      `确定要${strategy === 'reassign' ? '重新分配' : '强制释放'}端口 ${conflict.port} 吗？`,
      '确认操作',
      { type: 'warning' }
    )
    
    await portApi.resolveConflict(conflict.port, strategy)
    ElMessage.success('端口冲突已解决')
    refresh()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('解决端口冲突失败')
    }
  }
}

const getConflictTypeTag = (type: string) => {
  const map: Record<string, string> = {
    process: 'warning',
    allocation: 'danger',
    system: 'info'
  }
  return map[type] || 'info'
}

const getSeverityTag = (severity: string) => {
  const map: Record<string, string> = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return map[severity] || 'info'
}

onMounted(() => {
  refresh()
})
</script>
```

---

### 任务7：优化WebSocket重连逻辑

#### 问题描述
**优先级**: 🟡 中  
**影响范围**: 实时通信

当前WebSocket重连逻辑较简单，缺少指数退避和连接状态管理。

#### 解决方案

文件: `main-portal/src/composables/useWebSocket.ts`

```typescript
// 优化重连逻辑
const connect = () => {
  if (isConnecting.value || isConnected.value) {
    return
  }

  isConnecting.value = true

  try {
    // ... 连接代码 ...
    
    ws.onerror = (event) => {
      console.error('WebSocket错误:', event)
      error.value = 'WebSocket连接错误'
      options.onError?.(event)
    }

    ws.onclose = (event) => {
      console.log('WebSocket连接关闭:', event.code, event.reason)
      isConnected.value = false
      isConnecting.value = false
      ws = null
      
      // 清除心跳
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }

      options.onClose?.(event)

      // 智能重连逻辑
      if (options.autoReconnect && reconnectAttempts < maxReconnectAttempts) {
        // 指数退避算法：1s, 2s, 4s, 8s, 16s, 30s(max)
        const baseDelay = 1000
        const maxDelay = 30000
        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttempts),
          maxDelay
        )
        
        // 添加随机抖动（±20%）避免雷鸣群效应
        const jitter = delay * 0.2 * (Math.random() - 0.5)
        const finalDelay = Math.round(delay + jitter)
        
        console.log(`WebSocket将在 ${finalDelay}ms 后重连（第${reconnectAttempts + 1}次尝试）`)
        
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++
          connect()
        }, finalDelay)
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        error.value = '连接失败次数过多，请刷新页面重试'
        ElMessage.error({
          message: 'WebSocket连接失败，请检查网络或刷新页面',
          duration: 0,
          showClose: true
        })
      }
    }
  } catch (err) {
    console.error('创建WebSocket连接失败:', err)
    error.value = '创建WebSocket连接失败'
    isConnecting.value = false
  }
}
```

---

## 📅 实施计划

### 时间安排

| 任务 | 工作量 | 开始日期 | 完成日期 | 负责人 |
|------|--------|----------|----------|--------|
| 任务1: Mock Token移除 | 2天 | D+1 | D+2 | 待定 |
| 任务2: WebSocket认证 | 2天 | D+3 | D+4 | 待定 |
| 任务3: 文件上传验证 | 2天 | D+5 | D+6 | 待定 |
| 任务4: 敏感信息脱敏 | 1天 | D+7 | D+7 | 待定 |
| 任务5: UUID问题验证 | 0.5天 | D+8 | D+8 | 待定 |
| 任务6: 端口冲突解决 | 2天 | D+8 | D+9 | 待定 |
| 任务7: WebSocket重连 | 1天 | D+10 | D+10 | 待定 |
| 集成测试 | 2天 | D+11 | D+12 | 待定 |
| 文档更新 | 1天 | D+13 | D+13 | 待定 |

**总工期**: 13个工作日（约2周）

### 里程碑

- **M1 (D+4)**: 核心安全问题修复完成（任务1-2）
- **M2 (D+7)**: 所有安全加固完成（任务1-4）
- **M3 (D+10)**: 所有Bug修复完成（任务5-7）
- **M4 (D+13)**: 测试和文档完成，准备发布

---

## ✅ 验收标准

### 功能验收

- [ ] 生产环境拒绝Mock Token
- [ ] WebSocket连接需要有效认证
- [ ] 文件上传通过白名单验证
- [ ] 日志和错误响应已脱敏
- [ ] 应用刷新使用正确的UUID
- [ ] 端口冲突可手动解决
- [ ] WebSocket重连使用指数退避

### 测试验收

- [ ] 所有单元测试通过（167+新增测试）
- [ ] 集成测试通过
- [ ] 安全测试通过（无高危漏洞）
- [ ] 性能测试通过（无性能退化）

### 文档验收

- [ ] API文档更新
- [ ] 部署文档更新
- [ ] 安全配置文档完成
- [ ] 变更日志更新

---

## 🚨 风险评估

### 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| JWT集成问题 | 中 | 高 | 充分测试，保留Mock Token作为降级方案 |
| WebSocket认证兼容性 | 低 | 中 | 渐进式部署，先开发环境验证 |
| 文件验证性能影响 | 低 | 低 | 异步处理，限制文件大小 |

### 业务风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 生产环境用户需重新登录 | 高 | 中 | 提前通知，准备公告 |
| 旧版客户端不兼容 | 中 | 中 | 版本检测，提示升级 |

---

## 📊 成本估算

### 人力成本
- 开发工程师：13人天
- 测试工程师：3人天
- 技术文档：1人天
- **总计**: 17人天

### 其他成本
- 测试环境资源：可忽略
- 生产环境停机时间：0（热更新）

---

## 📝 后续行动

### 立即行动
1. ✅ 审批本方案
2. ⏳ 分配任务负责人
3. ⏳ 创建Git分支 `feature/phase1-security-hardening`
4. ⏳ 设置项目看板

### 实施后
1. 监控生产环境日志
2. 收集用户反馈
3. 准备第二阶段方案（性能优化）

---

## 📞 联系方式

**技术负责人**: 待指定  
**项目经理**: 待指定  
**紧急联系**: 待指定

---

**方案状态**: ⏳ 待批准  
**最后更新**: 2025-10-29  
**版本**: v1.0

