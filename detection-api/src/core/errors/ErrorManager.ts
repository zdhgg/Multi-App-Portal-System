/**
 * 错误管理器
 * 
 * 统一管理系统中的错误处理、重试机制、错误统计和恢复策略
 */

import { EventEmitter } from 'events'
import { logger } from '../../utils/logger'
import { 
  DetectionError, 
  ErrorCode, 
  ErrorCategory, 
  ErrorSeverity,
  ErrorContext,
  ErrorSuggestion 
} from './ErrorTypes'

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟时间(ms) */
  initialDelay: number
  /** 最大延迟时间(ms) */
  maxDelay: number
  /** 退避倍数 */
  backoffMultiplier: number
  /** 抖动因子 */
  jitterFactor: number
  /** 重试条件判断函数 */
  shouldRetry?: (error: DetectionError, attempt: number) => boolean
}

/**
 * 断路器状态
 */
enum CircuitBreakerState {
  CLOSED = 'closed',     // 正常状态
  OPEN = 'open',         // 断开状态
  HALF_OPEN = 'half_open' // 半开状态
}

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  /** 失败阈值 */
  failureThreshold: number
  /** 恢复超时时间(ms) */
  recoveryTimeout: number
  /** 监控窗口时间(ms) */
  monitoringPeriod: number
}

/**
 * 错误统计信息
 */
export interface ErrorStats {
  /** 总错误数 */
  totalErrors: number
  /** 按分类统计 */
  byCategory: Record<ErrorCategory, number>
  /** 按严重程度统计 */
  bySeverity: Record<ErrorSeverity, number>
  /** 按错误码统计 */
  byCode: Record<ErrorCode, number>
  /** 重试成功率 */
  retrySuccessRate: number
  /** 最近错误 */
  recentErrors: DetectionError[]
}

/**
 * 操作结果
 */
export interface OperationResult<T> {
  /** 是否成功 */
  success: boolean
  /** 结果数据 */
  data?: T
  /** 错误信息 */
  error?: DetectionError
  /** 重试次数 */
  attempts: number
  /** 执行时间(ms) */
  duration: number
}

/**
 * 错误管理器类
 */
export class ErrorManager extends EventEmitter {
  private static instance: ErrorManager
  private errorStats: ErrorStats
  private circuitBreakers: Map<string, {
    state: CircuitBreakerState
    failureCount: number
    lastFailureTime: number
    config: CircuitBreakerConfig
  }>

  private constructor() {
    super()
    this.errorStats = this.initializeStats()
    this.circuitBreakers = new Map()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager()
    }
    return ErrorManager.instance
  }

  /**
   * 初始化错误统计
   */
  private initializeStats(): ErrorStats {
    return {
      totalErrors: 0,
      byCategory: Object.values(ErrorCategory).reduce((acc, cat) => {
        acc[cat] = 0
        return acc
      }, {} as Record<ErrorCategory, number>),
      bySeverity: Object.values(ErrorSeverity).reduce((acc, sev) => {
        acc[sev] = 0
        return acc
      }, {} as Record<ErrorSeverity, number>),
      byCode: Object.values(ErrorCode).reduce((acc, code) => {
        acc[code] = 0
        return acc
      }, {} as Record<ErrorCode, number>),
      retrySuccessRate: 0,
      recentErrors: []
    }
  }

  /**
   * 处理错误
   */
  async handleError(error: DetectionError, context?: ErrorContext): Promise<void> {
    // 更新错误上下文 (create new error with merged context since context is readonly)
    if (context) {
      const mergedContext = { ...error.context, ...context }
      ;(error as any).context = mergedContext
    }

    // 记录错误统计
    this.recordError(error)

    // 记录日志
    this.logError(error)

    // 触发错误事件
    this.emit('error', error)

    // 检查断路器状态
    this.updateCircuitBreaker(error)
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationName?: string
  ): Promise<OperationResult<T>> {
    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      ...config
    }

    const startTime = Date.now()
    let lastError: DetectionError | undefined
    let attempts = 0

    // 检查断路器状态
    if (operationName && this.isCircuitBreakerOpen(operationName)) {
      const error = new DetectionError(
        ErrorCode.SERVICE_UNAVAILABLE,
        `服务 ${operationName} 暂时不可用（断路器开启）`,
        { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.HIGH }
      )
      return {
        success: false,
        error,
        attempts: 0,
        duration: Date.now() - startTime
      }
    }

    for (attempts = 1; attempts <= retryConfig.maxAttempts; attempts++) {
      try {
        const result = await operation()
        
        // 操作成功，重置断路器
        if (operationName) {
          this.recordSuccess(operationName)
        }

        return {
          success: true,
          data: result,
          attempts,
          duration: Date.now() - startTime
        }
      } catch (error) {
        const detectionError = error instanceof DetectionError 
          ? error 
          : new DetectionError(
              ErrorCode.INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error),
              { originalError: error instanceof Error ? error : undefined }
            )

        lastError = detectionError
        await this.handleError(detectionError)

        // 检查是否应该重试
        const shouldRetry = retryConfig.shouldRetry 
          ? retryConfig.shouldRetry(detectionError, attempts)
          : detectionError.retryable && attempts < retryConfig.maxAttempts

        if (!shouldRetry) {
          break
        }

        // 计算延迟时间
        if (attempts < retryConfig.maxAttempts) {
          const delay = this.calculateDelay(attempts, retryConfig)
          logger.info(`操作失败，${delay}ms后重试 (${attempts}/${retryConfig.maxAttempts})`, {
            operation: operationName,
            error: detectionError.message,
            attempt: attempts
          })
          await this.sleep(delay)
        }
      }
    }

    return {
      success: false,
      error: lastError!,
      attempts,
      duration: Date.now() - startTime
    }
  }

  /**
   * 计算重试延迟时间
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1)
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay)
    
    // 添加抖动
    const jitter = cappedDelay * config.jitterFactor * Math.random()
    return Math.floor(cappedDelay + jitter)
  }

  /**
   * 记录错误统计
   */
  private recordError(error: DetectionError): void {
    this.errorStats.totalErrors++
    this.errorStats.byCategory[error.category]++
    this.errorStats.bySeverity[error.severity]++
    this.errorStats.byCode[error.code]++

    // 保留最近的100个错误
    this.errorStats.recentErrors.unshift(error)
    if (this.errorStats.recentErrors.length > 100) {
      this.errorStats.recentErrors.pop()
    }
  }

  /**
   * 记录日志
   */
  private logError(error: DetectionError): void {
    const logData = {
      code: error.code,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      retryable: error.retryable,
      stack: error.stack
    }

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('严重错误', logData)
        break
      case ErrorSeverity.HIGH:
        logger.error('高级错误', logData)
        break
      case ErrorSeverity.MEDIUM:
        logger.warn('中级错误', logData)
        break
      case ErrorSeverity.LOW:
        logger.info('低级错误', logData)
        break
    }
  }

  /**
   * 更新断路器状态
   */
  private updateCircuitBreaker(error: DetectionError): void {
    const operationName = error.context?.metadata?.operation as string
    if (!operationName) return

    const breaker = this.circuitBreakers.get(operationName)
    if (!breaker) return

    breaker.failureCount++
    breaker.lastFailureTime = Date.now()

    // 检查是否需要打开断路器
    if (breaker.state === CircuitBreakerState.CLOSED && 
        breaker.failureCount >= breaker.config.failureThreshold) {
      breaker.state = CircuitBreakerState.OPEN
      logger.warn(`断路器已打开: ${operationName}`, {
        failureCount: breaker.failureCount,
        threshold: breaker.config.failureThreshold
      })
    }
  }

  /**
   * 记录成功操作
   */
  private recordSuccess(operationName: string): void {
    const breaker = this.circuitBreakers.get(operationName)
    if (!breaker) return

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      breaker.state = CircuitBreakerState.CLOSED
      breaker.failureCount = 0
      logger.info(`断路器已关闭: ${operationName}`)
    } else if (breaker.state === CircuitBreakerState.CLOSED) {
      breaker.failureCount = Math.max(0, breaker.failureCount - 1)
    }
  }

  /**
   * 检查断路器是否开启
   */
  private isCircuitBreakerOpen(operationName: string): boolean {
    const breaker = this.circuitBreakers.get(operationName)
    if (!breaker) return false

    const now = Date.now()

    // 检查是否可以从开启状态转为半开状态
    if (breaker.state === CircuitBreakerState.OPEN &&
        now - breaker.lastFailureTime >= breaker.config.recoveryTimeout) {
      breaker.state = CircuitBreakerState.HALF_OPEN
      logger.info(`断路器转为半开状态: ${operationName}`)
      return false
    }

    return breaker.state === CircuitBreakerState.OPEN
  }

  /**
   * 注册断路器
   */
  registerCircuitBreaker(operationName: string, config: CircuitBreakerConfig): void {
    this.circuitBreakers.set(operationName, {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      config
    })
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): ErrorStats {
    return { ...this.errorStats }
  }

  /**
   * 清除错误统计
   */
  clearErrorStats(): void {
    this.errorStats = this.initializeStats()
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 创建错误恢复建议
   */
  createRecoverySuggestions(error: DetectionError): ErrorSuggestion[] {
    const suggestions: ErrorSuggestion[] = []

    switch (error.category) {
      case ErrorCategory.FILESYSTEM:
        suggestions.push({
          title: '检查文件系统',
          description: '验证文件路径和权限设置',
          steps: [
            '确认文件或目录存在',
            '检查读写权限',
            '验证磁盘空间'
          ]
        })
        break

      case ErrorCategory.NETWORK:
        suggestions.push({
          title: '检查网络连接',
          description: '验证网络连接和服务可用性',
          steps: [
            '检查网络连接',
            '验证服务端点',
            '确认防火墙设置'
          ]
        })
        break

      case ErrorCategory.CACHE:
        suggestions.push({
          title: '缓存故障处理',
          description: '系统将自动降级到直接检测模式',
          steps: [
            '检查缓存服务状态',
            '清理过期缓存',
            '重启缓存服务'
          ],
          autoFixable: true,
          autoFixAction: 'fallback_to_direct'
        })
        break

      case ErrorCategory.DETECTION:
        suggestions.push({
          title: '重新检测',
          description: '稍后重试检测操作',
          steps: [
            '检查项目结构完整性',
            '确认依赖文件存在',
            '重新执行检测'
          ],
          autoFixable: true,
          autoFixAction: 'retry_detection'
        })
        break
    }

    return suggestions
  }
}

// Types already exported above - removed duplicate export
