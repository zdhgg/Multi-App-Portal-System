/**
 * 错误类型定义
 * 
 * 定义了检测系统中所有可能的错误类型和错误码
 */

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'low',           // 低级错误，不影响核心功能
  MEDIUM = 'medium',     // 中级错误，影响部分功能
  HIGH = 'high',         // 高级错误，影响主要功能
  CRITICAL = 'critical'  // 严重错误，系统无法正常工作
}

/**
 * 错误分类
 */
export enum ErrorCategory {
  VALIDATION = 'validation',         // 验证错误
  FILESYSTEM = 'filesystem',         // 文件系统错误
  NETWORK = 'network',              // 网络错误
  CACHE = 'cache',                  // 缓存错误
  DETECTION = 'detection',          // 检测错误
  CONFIGURATION = 'configuration',   // 配置错误
  AUTHENTICATION = 'authentication', // 认证错误
  AUTHORIZATION = 'authorization',   // 授权错误
  RESOURCE = 'resource',            // 资源错误
  SYSTEM = 'system'                 // 系统错误
}

/**
 * 错误码定义
 */
export enum ErrorCode {
  // 验证错误 (1000-1099)
  VALIDATION_FAILED = 'E1001',
  INVALID_PARAMETER = 'E1002',
  MISSING_REQUIRED_FIELD = 'E1003',
  INVALID_FORMAT = 'E1004',
  
  // 文件系统错误 (1100-1199)
  DIRECTORY_NOT_FOUND = 'E1101',
  FILE_NOT_FOUND = 'E1102',
  PERMISSION_DENIED = 'E1103',
  DISK_SPACE_INSUFFICIENT = 'E1104',
  FILE_CORRUPTED = 'E1105',
  
  // 网络错误 (1200-1299)
  NETWORK_TIMEOUT = 'E1201',
  CONNECTION_REFUSED = 'E1202',
  DNS_RESOLUTION_FAILED = 'E1203',
  NETWORK_UNREACHABLE = 'E1204',
  
  // 缓存错误 (1300-1399)
  CACHE_CONNECTION_FAILED = 'E1301',
  CACHE_OPERATION_FAILED = 'E1302',
  CACHE_SERIALIZATION_ERROR = 'E1303',
  CACHE_MEMORY_EXCEEDED = 'E1304',
  
  // 检测错误 (1400-1499)
  DETECTION_FAILED = 'E1401',
  DETECTOR_NOT_AVAILABLE = 'E1402',
  UNSUPPORTED_PROJECT_TYPE = 'E1403',
  DETECTION_TIMEOUT = 'E1404',
  INVALID_PROJECT_STRUCTURE = 'E1405',
  DEPENDENCY_ANALYSIS_FAILED = 'E1406',
  
  // 配置错误 (1500-1599)
  CONFIGURATION_INVALID = 'E1501',
  CONFIGURATION_MISSING = 'E1502',
  ENVIRONMENT_VARIABLE_MISSING = 'E1503',
  
  // 认证错误 (1600-1699)
  AUTHENTICATION_FAILED = 'E1601',
  TOKEN_EXPIRED = 'E1602',
  TOKEN_INVALID = 'E1603',
  
  // 授权错误 (1700-1799)
  ACCESS_DENIED = 'E1701',
  INSUFFICIENT_PERMISSIONS = 'E1702',
  
  // 资源错误 (1800-1899)
  RESOURCE_NOT_FOUND = 'E1801',
  RESOURCE_ALREADY_EXISTS = 'E1802',
  RESOURCE_LOCKED = 'E1803',
  RESOURCE_QUOTA_EXCEEDED = 'E1804',
  
  // 系统错误 (1900-1999)
  INTERNAL_ERROR = 'E1901',
  SERVICE_UNAVAILABLE = 'E1902',
  SYSTEM_OVERLOADED = 'E1903',
  MAINTENANCE_MODE = 'E1904'
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 操作ID，用于追踪 */
  operationId?: string
  /** 用户ID */
  userId?: string
  /** 请求ID */
  requestId?: string
  /** 相关资源 */
  resource?: string
  /** 额外的上下文数据 */
  metadata?: Record<string, any>
  /** 错误发生的位置 */
  location?: {
    file?: string
    function?: string
    line?: number
  }
  /** 相关的堆栈信息 */
  stackTrace?: string
  /** 操作名称 */
  operation?: string
  /** 建议列表 */
  suggestions?: any[]
}

/**
 * 错误解决建议
 */
export interface ErrorSuggestion {
  /** 建议标题 */
  title: string
  /** 建议描述 */
  description: string
  /** 操作步骤 */
  steps?: string[]
  /** 相关链接 */
  links?: Array<{
    title: string
    url: string
  }>
  /** 是否为自动修复建议 */
  autoFixable?: boolean
  /** 自动修复操作 */
  autoFixAction?: string
}

/**
 * 基础错误接口
 */
export interface IError {
  /** 错误码 */
  code: ErrorCode
  /** 错误消息 */
  message: string
  /** 错误分类 */
  category: ErrorCategory
  /** 错误严重程度 */
  severity: ErrorSeverity
  /** 错误上下文 */
  context?: ErrorContext
  /** 解决建议 */
  suggestions?: ErrorSuggestion[]
  /** 错误发生时间 */
  timestamp: Date
  /** 是否可重试 */
  retryable: boolean
  /** 原始错误 */
  originalError?: Error
}

/**
 * 检测错误类
 */
export class DetectionError extends Error implements IError {
  public readonly code: ErrorCode
  public readonly category: ErrorCategory
  public readonly severity: ErrorSeverity
  public readonly context?: ErrorContext
  public readonly suggestions?: ErrorSuggestion[]
  public readonly timestamp: Date
  public readonly retryable: boolean
  public readonly originalError?: Error

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      category?: ErrorCategory
      severity?: ErrorSeverity
      context?: ErrorContext
      suggestions?: ErrorSuggestion[]
      retryable?: boolean
      originalError?: Error
    } = {}
  ) {
    super(message)
    this.name = 'DetectionError'
    this.code = code
    this.category = options.category || this.inferCategory(code)
    this.severity = options.severity || this.inferSeverity(code)
    this.context = options.context
    this.suggestions = options.suggestions
    this.timestamp = new Date()
    this.retryable = options.retryable ?? this.inferRetryable(code)
    this.originalError = options.originalError

    // 确保错误堆栈可用
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DetectionError)
    }
  }

  /**
   * 根据错误码推断错误分类
   */
  private inferCategory(code: ErrorCode): ErrorCategory {
    const codeNum = parseInt(code.substring(1))
    
    if (codeNum >= 1000 && codeNum < 1100) return ErrorCategory.VALIDATION
    if (codeNum >= 1100 && codeNum < 1200) return ErrorCategory.FILESYSTEM
    if (codeNum >= 1200 && codeNum < 1300) return ErrorCategory.NETWORK
    if (codeNum >= 1300 && codeNum < 1400) return ErrorCategory.CACHE
    if (codeNum >= 1400 && codeNum < 1500) return ErrorCategory.DETECTION
    if (codeNum >= 1500 && codeNum < 1600) return ErrorCategory.CONFIGURATION
    if (codeNum >= 1600 && codeNum < 1700) return ErrorCategory.AUTHENTICATION
    if (codeNum >= 1700 && codeNum < 1800) return ErrorCategory.AUTHORIZATION
    if (codeNum >= 1800 && codeNum < 1900) return ErrorCategory.RESOURCE
    
    return ErrorCategory.SYSTEM
  }

  /**
   * 根据错误码推断错误严重程度
   */
  private inferSeverity(code: ErrorCode): ErrorSeverity {
    switch (code) {
      case ErrorCode.INTERNAL_ERROR:
      case ErrorCode.SERVICE_UNAVAILABLE:
      case ErrorCode.SYSTEM_OVERLOADED:
        return ErrorSeverity.CRITICAL
        
      case ErrorCode.DETECTION_FAILED:
      case ErrorCode.CACHE_CONNECTION_FAILED:
      case ErrorCode.NETWORK_TIMEOUT:
        return ErrorSeverity.HIGH
        
      case ErrorCode.DIRECTORY_NOT_FOUND:
      case ErrorCode.FILE_NOT_FOUND:
      case ErrorCode.DETECTOR_NOT_AVAILABLE:
        return ErrorSeverity.MEDIUM
        
      default:
        return ErrorSeverity.LOW
    }
  }

  /**
   * 根据错误码推断是否可重试
   */
  private inferRetryable(code: ErrorCode): boolean {
    const nonRetryableCodes = [
      ErrorCode.VALIDATION_FAILED,
      ErrorCode.INVALID_PARAMETER,
      ErrorCode.DIRECTORY_NOT_FOUND,
      ErrorCode.FILE_NOT_FOUND,
      ErrorCode.PERMISSION_DENIED,
      ErrorCode.AUTHENTICATION_FAILED,
      ErrorCode.ACCESS_DENIED,
      ErrorCode.UNSUPPORTED_PROJECT_TYPE
    ]
    
    return !nonRetryableCodes.includes(code)
  }

  /**
   * 转换为JSON格式
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      suggestions: this.suggestions,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      stack: this.stack
    }
  }

  /**
   * 创建用户友好的错误消息
   */
  getUserFriendlyMessage(): string {
    const baseMessage = this.message
    
    if (this.suggestions && this.suggestions.length > 0) {
      const suggestion = this.suggestions[0]
      return `${baseMessage}\n\n建议：${suggestion.description}`
    }
    
    return baseMessage
  }
}

/**
 * 错误工厂函数
 */
export class ErrorFactory {
  /**
   * 创建验证错误
   */
  static createValidationError(
    message: string,
    field?: string,
    value?: any
  ): DetectionError {
    return new DetectionError(ErrorCode.VALIDATION_FAILED, message, {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context: { metadata: { field, value } },
      suggestions: [{
        title: '检查输入参数',
        description: '请检查输入参数是否符合要求',
        steps: ['验证参数格式', '检查必填字段', '确认参数范围']
      }]
    })
  }

  /**
   * 创建文件系统错误
   */
  static createFileSystemError(
    code: ErrorCode,
    message: string,
    path?: string
  ): DetectionError {
    return new DetectionError(code, message, {
      category: ErrorCategory.FILESYSTEM,
      context: { resource: path },
      suggestions: [{
        title: '检查文件路径',
        description: '请确认文件或目录路径是否正确',
        steps: ['检查路径拼写', '确认文件存在', '验证访问权限']
      }]
    })
  }

  /**
   * 创建检测错误
   */
  static createDetectionError(
    code: ErrorCode,
    message: string,
    directory?: string,
    originalError?: Error
  ): DetectionError {
    return new DetectionError(code, message, {
      category: ErrorCategory.DETECTION,
      context: { resource: directory },
      originalError,
      suggestions: [{
        title: '重新检测',
        description: '请稍后重试检测操作',
        steps: ['检查项目结构', '确认依赖文件', '重新执行检测'],
        autoFixable: true,
        autoFixAction: 'retry'
      }]
    })
  }

  /**
   * 创建缓存错误
   */
  static createCacheError(
    code: ErrorCode,
    message: string,
    operation?: string
  ): DetectionError {
    return new DetectionError(code, message, {
      category: ErrorCategory.CACHE,
      context: { metadata: { operation } },
      retryable: true,
      suggestions: [{
        title: '缓存故障处理',
        description: '缓存服务暂时不可用，系统将使用直接检测',
        steps: ['检查缓存服务状态', '清理缓存数据', '重启缓存服务']
      }]
    })
  }
}
