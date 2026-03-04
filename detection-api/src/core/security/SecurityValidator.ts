/**
 * 统一安全验证器
 * 
 * 提供全面的输入验证、参数过滤和安全检查功能。
 * 防护XSS、路径遍历、注入攻击等常见安全威胁。
 */

import path from 'path'
import { logger } from '../../utils/logger'
import { DetectionError, ErrorCode, ErrorFactory } from '../errors'

// =============================================================================
// 安全验证配置
// =============================================================================

export interface SecurityConfig {
  // 路径安全配置
  pathSecurity: {
    allowedExtensions: string[]
    blockedExtensions: string[]
    maxPathLength: number
    allowedBasePaths: string[]
    blockedPatterns: RegExp[]
  }
  
  // 输入验证配置
  inputValidation: {
    maxStringLength: number
    maxArrayLength: number
    allowedCharsets: RegExp
    blockedPatterns: RegExp[]
  }
  
  // 文件安全配置
  fileSecurity: {
    maxFileSize: number
    allowedMimeTypes: string[]
    scanForMalware: boolean
  }
}

// 默认安全配置
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  pathSecurity: {
    allowedExtensions: ['.js', '.ts', '.json', '.md', '.txt', '.vue', '.jsx', '.tsx'],
    blockedExtensions: ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs'],
    maxPathLength: 260,
    allowedBasePaths: [
      process.cwd(),
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'logs'),
      path.join(process.cwd(), 'temp'),
      // Windows 盘符支持（用于应用管理）
      ...(process.platform === 'win32' ? [
        'C:\\',
        'D:\\',
        'E:\\',
        'F:\\',
        'G:\\',
        'H:\\'
      ] : []),
      // Unix/Linux 用户目录支持
      ...(process.platform !== 'win32' && process.env.HOME ? [
        process.env.HOME
      ] : [])
    ],
    blockedPatterns: [
      /\.\./g,           // 路径遍历
      /[<>"|?*]/g,      // 非法文件名字符（允许 Windows 盘符冒号）
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows保留名
      /\/\//g,           // 双斜杠
      /\\{2,}/g          // 多个反斜杠
    ]
  },
  
  inputValidation: {
    maxStringLength: 10000,
    maxArrayLength: 1000,
    allowedCharsets: /^[\w\s\-_./@#$%^&*()+={}[\]|\\:";'<>?,./~`!]*$/,
    blockedPatterns: [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // XSS script标签
      /javascript:/gi,                                        // JavaScript协议
      /on\w+\s*=/gi,                                         // 事件处理器
      /expression\s*\(/gi,                                   // CSS表达式
      /vbscript:/gi,                                         // VBScript协议
      /data:text\/html/gi,                                   // Data URL HTML
      /<!--[\s\S]*?-->/g,                                    // HTML注释
      /<iframe\b[^>]*>/gi,                                   // iframe标签
      /<object\b[^>]*>/gi,                                   // object标签
      /<embed\b[^>]*>/gi                                     // embed标签
    ]
  },
  
  fileSecurity: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'text/plain',
      'text/javascript',
      'application/json',
      'text/markdown',
      'text/html',
      'text/css'
    ],
    scanForMalware: false // 在生产环境中应该启用
  }
}

// =============================================================================
// 安全验证器类
// =============================================================================

export class SecurityValidator {
  private config: SecurityConfig

  constructor(config?: Partial<SecurityConfig>) {
    this.config = {
      ...DEFAULT_SECURITY_CONFIG,
      ...config,
      pathSecurity: { ...DEFAULT_SECURITY_CONFIG.pathSecurity, ...config?.pathSecurity },
      inputValidation: { ...DEFAULT_SECURITY_CONFIG.inputValidation, ...config?.inputValidation },
      fileSecurity: { ...DEFAULT_SECURITY_CONFIG.fileSecurity, ...config?.fileSecurity }
    }
  }

  // =============================================================================
  // 路径安全验证
  // =============================================================================

  /**
   * 验证路径安全性
   */
  validatePath(inputPath: string): { isValid: boolean; sanitizedPath?: string; errors: string[] } {
    const errors: string[] = []
    
    try {
      // 基础检查
      if (!inputPath || typeof inputPath !== 'string') {
        errors.push('路径不能为空')
        return { isValid: false, errors }
      }

      // 长度检查
      if (inputPath.length > this.config.pathSecurity.maxPathLength) {
        errors.push(`路径长度超过限制 (${this.config.pathSecurity.maxPathLength})`)
      }

      // 危险模式检查
      for (const pattern of this.config.pathSecurity.blockedPatterns) {
        if (pattern.test(inputPath)) {
          errors.push(`路径包含非法字符或模式: ${pattern.source}`)
        }
      }

      // 路径遍历检查
      if (this.containsPathTraversal(inputPath)) {
        errors.push('检测到路径遍历攻击尝试')
      }

      // 规范化路径
      let sanitizedPath: string
      try {
        sanitizedPath = path.resolve(inputPath)
      } catch (error) {
        errors.push('路径格式无效')
        return { isValid: false, errors }
      }

      // 基础路径检查
      if (!this.isPathInAllowedBase(sanitizedPath)) {
        errors.push('路径不在允许的基础目录范围内')
      }

      // 扩展名检查
      const ext = path.extname(sanitizedPath).toLowerCase()
      if (ext && this.config.pathSecurity.blockedExtensions.includes(ext)) {
        errors.push(`文件扩展名被禁止: ${ext}`)
      }

      return {
        isValid: errors.length === 0,
        sanitizedPath: errors.length === 0 ? sanitizedPath : undefined,
        errors
      }

    } catch (error) {
      logger.error('路径验证失败', { inputPath, error })
      return {
        isValid: false,
        errors: ['路径验证过程中发生错误']
      }
    }
  }

  /**
   * 检查路径遍历攻击
   */
  private containsPathTraversal(inputPath: string): boolean {
    if (!inputPath || typeof inputPath !== 'string') {
      return false
    }

    // 统一分隔符，并尽量处理 URL 编码输入（例如 %2e%2e）
    let candidate = inputPath.trim()
    try {
      candidate = decodeURIComponent(candidate)
    } catch {
      // ignore decode failure, keep original candidate
    }

    if (candidate.includes('\0')) {
      return true
    }

    // 仅当路径段中出现 ".." 才视为遍历攻击，避免误伤 Windows 盘符路径
    const normalizedSeparators = candidate.replace(/\\/g, '/')
    const segments = normalizedSeparators.split('/').map(segment => segment.trim())
    return segments.some(segment => segment === '..')
  }

  /**
   * 检查路径是否在允许的基础目录内
   */
  private isPathInAllowedBase(absolutePath: string): boolean {
    const resolvedTarget = path.resolve(absolutePath)
    const normalizedTarget = process.platform === 'win32'
      ? resolvedTarget.toLowerCase()
      : resolvedTarget

    return this.config.pathSecurity.allowedBasePaths.some(basePath => {
      const resolvedBase = path.resolve(basePath)
      const normalizedBase = process.platform === 'win32'
        ? resolvedBase.toLowerCase()
        : resolvedBase

      if (normalizedTarget === normalizedBase) {
        return true
      }

      // 目录边界匹配，避免 /app 与 /apple 这类前缀误判
      const baseWithSep = normalizedBase.endsWith(path.sep)
        ? normalizedBase
        : `${normalizedBase}${path.sep}`

      return normalizedTarget.startsWith(baseWithSep)
    })
  }

  // =============================================================================
  // 输入验证
  // =============================================================================

  /**
   * 验证和清理字符串输入
   */
  validateString(input: string, options?: {
    maxLength?: number
    allowEmpty?: boolean
    customPattern?: RegExp
  }): { isValid: boolean; sanitized?: string; errors: string[] } {
    const errors: string[] = []
    
    try {
      // 类型检查
      if (typeof input !== 'string') {
        errors.push('输入必须是字符串类型')
        return { isValid: false, errors }
      }

      // 空值检查
      if (!options?.allowEmpty && input.trim().length === 0) {
        errors.push('输入不能为空')
        return { isValid: false, errors }
      }

      // 长度检查
      const maxLength = options?.maxLength || this.config.inputValidation.maxStringLength
      if (input.length > maxLength) {
        errors.push(`输入长度超过限制 (${maxLength})`)
      }

      // 字符集检查
      if (!this.config.inputValidation.allowedCharsets.test(input)) {
        errors.push('输入包含非法字符')
      }

      // 危险模式检查
      for (const pattern of this.config.inputValidation.blockedPatterns) {
        if (pattern.test(input)) {
          errors.push(`输入包含潜在的安全威胁: ${pattern.source}`)
        }
      }

      // 自定义模式检查
      if (options?.customPattern && !options.customPattern.test(input)) {
        errors.push('输入不符合要求的格式')
      }

      // 清理输入
      const sanitized = this.sanitizeString(input)

      return {
        isValid: errors.length === 0,
        sanitized: errors.length === 0 ? sanitized : undefined,
        errors
      }

    } catch (error) {
      logger.error('字符串验证失败', { input: input.substring(0, 100), error })
      return {
        isValid: false,
        errors: ['字符串验证过程中发生错误']
      }
    }
  }

  /**
   * 清理字符串输入
   */
  private sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // 移除控制字符
      .replace(/\s+/g, ' ') // 规范化空白字符
      .substring(0, this.config.inputValidation.maxStringLength) // 截断过长内容
  }

  /**
   * 验证数组输入
   */
  validateArray(input: any[], options?: {
    maxLength?: number
    itemValidator?: (item: any) => boolean
  }): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    try {
      // 类型检查
      if (!Array.isArray(input)) {
        errors.push('输入必须是数组类型')
        return { isValid: false, errors }
      }

      // 长度检查
      const maxLength = options?.maxLength || this.config.inputValidation.maxArrayLength
      if (input.length > maxLength) {
        errors.push(`数组长度超过限制 (${maxLength})`)
      }

      // 项目验证
      if (options?.itemValidator) {
        input.forEach((item, index) => {
          if (!options.itemValidator!(item)) {
            errors.push(`数组项 ${index} 验证失败`)
          }
        })
      }

      return { isValid: errors.length === 0, errors }

    } catch (error) {
      logger.error('数组验证失败', { inputLength: input?.length, error })
      return {
        isValid: false,
        errors: ['数组验证过程中发生错误']
      }
    }
  }

  // =============================================================================
  // 便捷验证方法
  // =============================================================================

  /**
   * 验证端口号
   */
  validatePort(port: any): { isValid: boolean; port?: number; errors: string[] } {
    const errors: string[] = []

    const portNum = parseInt(port, 10)
    if (isNaN(portNum)) {
      errors.push('端口必须是数字')
    } else if (portNum < 1 || portNum > 65535) {
      errors.push('端口范围必须在 1-65535 之间')
    } else if (portNum < 1024 && process.getuid && process.getuid() !== 0) {
      errors.push('非特权用户不能使用 1024 以下的端口')
    }

    return {
      isValid: errors.length === 0,
      port: errors.length === 0 ? portNum : undefined,
      errors
    }
  }

  /**
   * 验证URL
   */
  validateUrl(url: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    try {
      const urlObj = new URL(url)
      
      // 协议检查
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        errors.push('只允许 HTTP 和 HTTPS 协议')
      }

      // 主机名检查
      if (!urlObj.hostname) {
        errors.push('URL 必须包含有效的主机名')
      }

    } catch (error) {
      errors.push('URL 格式无效')
    }

    return { isValid: errors.length === 0, errors }
  }

  /**
   * 验证JSON数据
   */
  validateJson(jsonString: string): { isValid: boolean; parsed?: any; errors: string[] } {
    const errors: string[] = []

    try {
      const parsed = JSON.parse(jsonString)
      return { isValid: true, parsed, errors }
    } catch (error) {
      errors.push('JSON 格式无效')
      return { isValid: false, errors }
    }
  }

  // =============================================================================
  // 配置管理
  // =============================================================================

  /**
   * 更新安全配置
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      pathSecurity: { ...this.config.pathSecurity, ...newConfig.pathSecurity },
      inputValidation: { ...this.config.inputValidation, ...newConfig.inputValidation },
      fileSecurity: { ...this.config.fileSecurity, ...newConfig.fileSecurity }
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SecurityConfig {
    return { ...this.config }
  }
}

// =============================================================================
// 默认实例和便捷函数
// =============================================================================

export const securityValidator = new SecurityValidator()

// 便捷验证函数
export const validatePath = (path: string) => securityValidator.validatePath(path)
export const validateString = (input: string, options?: any) => securityValidator.validateString(input, options)
export const validateArray = (input: any[], options?: any) => securityValidator.validateArray(input, options)
export const validatePort = (port: any) => securityValidator.validatePort(port)
export const validateUrl = (url: string) => securityValidator.validateUrl(url)
export const validateJson = (jsonString: string) => securityValidator.validateJson(jsonString)
