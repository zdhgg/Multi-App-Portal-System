/**
 * 敏感信息脱敏工具（增强版）
 * 提供全面的敏感信息保护，包括路径、Token、密码等
 */

/**
 * 敏感字段模式列表
 */
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /token/i,
  /accesstoken/i,
  /refreshtoken/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /api-key/i,
  /x-api-key/i,
  /privatekey/i,
  /private_key/i,
  /authorization/i,
  /auth/i,
  /credential/i,
  /cookie/i,
  /session/i,
  /jwt/i,
  /bearer/i
]

/**
 * 路径脱敏模式
 */
const PATH_PATTERNS = [
  // Windows用户路径
  { pattern: /([A-Z]:\\Users\\[^\\]+)/gi, replacement: '<USER_HOME>' },
  { pattern: /([A-Z]:\\Documents and Settings\\[^\\]+)/gi, replacement: '<USER_HOME>' },
  
  // Linux/Mac用户路径
  { pattern: /(\/home\/[^\/]+)/gi, replacement: '<USER_HOME>' },
  { pattern: /(\/Users\/[^\/]+)/gi, replacement: '<USER_HOME>' },
  { pattern: /(\/root)/gi, replacement: '<USER_HOME>' },
  
  // 工作目录路径（保留项目名称，隐藏完整路径）
  { pattern: /([A-Z]:\\[^\\]+\\[^\\]+\\)/gi, replacement: '<PROJECT_ROOT>\\' },
  { pattern: /(\/[^\/]+\/[^\/]+\/)/gi, replacement: '<PROJECT_ROOT>/' }
]

/**
 * IP地址脱敏模式
 */
const IP_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}\b/g

/**
 * Email脱敏模式
 */
const EMAIL_PATTERN = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g

/**
 * 敏感信息脱敏工具类
 */
export class Sanitizer {
  /**
   * 脱敏对象中的敏感字段
   */
  static sanitizeObject(obj: any, options: SanitizeOptions = {}): any {
    const {
      maskSensitiveFields = true,
      sanitizePaths = true,
      sanitizeIPs = false,
      sanitizeEmails = false,
      customPatterns = []
    } = options

    if (!obj || typeof obj !== 'object') {
      return obj
    }

    // 处理循环引用
    const seen = new WeakSet()

    // 保存this引用
    const self = this

    const sanitize = (value: any): any => {
      if (!value || typeof value !== 'object') {
        if (typeof value === 'string') {
          let sanitized = value

          if (sanitizePaths) {
            sanitized = self.sanitizePath(sanitized)
          }

          if (sanitizeIPs) {
            sanitized = self.sanitizeIP(sanitized)
          }

          if (sanitizeEmails) {
            sanitized = self.sanitizeEmail(sanitized)
          }

          // 应用自定义模式
          for (const { pattern, replacement } of customPatterns) {
            sanitized = sanitized.replace(pattern, replacement)
          }

          return sanitized
        }
        return value
      }

      // 防止循环引用
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)

      if (Array.isArray(value)) {
        return value.map(item => sanitize(item))
      }

      const sanitized: any = {}

      for (const [key, val] of Object.entries(value)) {
        const lowerKey = key.toLowerCase()

        // 检查是否为敏感字段
        // 如果值是对象或数组，递归处理而不是直接脱敏
        if (maskSensitiveFields && self.isSensitiveField(lowerKey)) {
          // 如果值是对象或数组，递归处理其内容
          if (val && typeof val === 'object') {
            sanitized[key] = sanitize(val)
          } else {
            // 只有基本类型才直接脱敏
            sanitized[key] = self.maskValue(val)
          }
        } else {
          sanitized[key] = sanitize(val)
        }
      }

      return sanitized
    }

    return sanitize(obj)
  }

  /**
   * 检查是否为敏感字段
   */
  private static isSensitiveField(fieldName: string): boolean {
    return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))
  }

  /**
   * 脱敏路径信息
   */
  static sanitizePath(text: string): string {
    if (!text || typeof text !== 'string') {
      return text
    }

    let sanitized = text

    // 应用所有路径脱敏模式
    for (const { pattern, replacement } of PATH_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement)
    }

    return sanitized
  }

  /**
   * 脱敏IP地址（保留前三段，隐藏最后一段）
   */
  static sanitizeIP(text: string): string {
    if (!text || typeof text !== 'string') {
      return text
    }

    return text.replace(IP_PATTERN, '$1***')
  }

  /**
   * 脱敏Email地址
   */
  static sanitizeEmail(text: string): string {
    if (!text || typeof text !== 'string') {
      return text
    }

    return text.replace(EMAIL_PATTERN, (match, username, domain) => {
      if (username.length <= 2) {
        return `***@${domain}`
      }
      return `${username.substring(0, 2)}***@${domain}`
    })
  }

  /**
   * 掩码敏感值
   */
  static maskValue(value: any): string {
    if (value === null || value === undefined) {
      return '***'
    }

    const str = String(value)

    // 空字符串或很短的字符串
    if (str.length === 0) {
      return ''
    }

    if (str.length <= 4) {
      return '***'
    }

    if (str.length <= 8) {
      return `${str.substring(0, 2)}***`
    }

    // 保留前4位和后4位
    return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`
  }

  /**
   * 脱敏错误对象
   */
  static sanitizeError(error: Error | any, options: SanitizeOptions = {}): any {
    if (!error) {
      return null
    }

    const sanitized: any = {
      name: error.name || 'Error',
      message: this.sanitizePath(error.message || 'Unknown error')
    }

    // 脱敏堆栈信息
    if (error.stack) {
      sanitized.stack = this.sanitizePath(error.stack)
    }

    // 脱敏其他属性
    if (error.code) {
      sanitized.code = error.code
    }

    // 脱敏details（如果存在）
    if (error.details) {
      sanitized.details = this.sanitizeObject(error.details, options)
    }

    return sanitized
  }

  /**
   * 脱敏HTTP请求信息
   */
  static sanitizeRequest(req: any): any {
    if (!req) {
      return null
    }

    const sanitized: any = {
      method: req.method,
      url: this.sanitizePath(req.url || req.originalUrl),
      path: this.sanitizePath(req.path)
    }

    // 脱敏headers（移除敏感头）
    if (req.headers) {
      const headers: any = {}
      for (const [key, value] of Object.entries(req.headers)) {
        if (this.isSensitiveField(key)) {
          headers[key] = '***'
        } else {
          headers[key] = value
        }
      }
      sanitized.headers = headers
    }

    // 脱敏query参数
    if (req.query) {
      sanitized.query = this.sanitizeObject(req.query)
    }

    // 脱敏body（不包含完整内容，只包含字段名）
    if (req.body && typeof req.body === 'object') {
      sanitized.bodyFields = Object.keys(req.body)
    }

    // IP地址
    if (req.ip) {
      sanitized.ip = this.sanitizeIP(req.ip)
    }

    return sanitized
  }

  /**
   * 为生产环境准备安全的错误响应
   */
  static getSafeErrorResponse(error: any, includeDetails = false): any {
    const response: any = {
      success: false,
      message: '服务器内部错误'
    }

    // 开发环境或明确要求时包含更多信息
    if (includeDetails) {
      response.error = this.sanitizeError(error, {
        maskSensitiveFields: true,
        sanitizePaths: true
      })
    }

    // 包含错误代码（如果有）
    if (error.code) {
      response.code = error.code
    }

    return response
  }
}

/**
 * 脱敏选项接口
 */
export interface SanitizeOptions {
  maskSensitiveFields?: boolean
  sanitizePaths?: boolean
  sanitizeIPs?: boolean
  sanitizeEmails?: boolean
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>
}

/**
 * 全局脱敏实例
 */
export const sanitizer = Sanitizer

