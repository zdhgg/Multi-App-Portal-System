/**
 * 错误处理模块统一导出
 * 
 * 提供完整的错误处理功能，包括错误类型、错误管理、消息模板等
 */

// 错误类型和接口
export {
  ErrorSeverity,
  ErrorCategory,
  ErrorCode,
  DetectionError,
  ErrorFactory
} from './ErrorTypes'
export type {
  ErrorContext,
  ErrorSuggestion,
  IError
} from './ErrorTypes'

// 错误管理器
export {
  ErrorManager,
} from './ErrorManager'
export type {
  RetryConfig,
  CircuitBreakerConfig,
  ErrorStats,
  OperationResult
} from './ErrorManager'

// 错误消息管理
export {
  ErrorMessageManager,
} from './ErrorMessages'
export type { ErrorMessageTemplate, Language } from './ErrorMessages'

/**
 * 便捷函数：创建常用错误
 */

import { DetectionError, ErrorCode, ErrorFactory } from './ErrorTypes'
import { ErrorManager } from './ErrorManager'

/**
 * 创建目录不存在错误
 */
export function createDirectoryNotFoundError(path: string): DetectionError {
  return ErrorFactory.createFileSystemError(
    ErrorCode.DIRECTORY_NOT_FOUND,
    `目录不存在: ${path}`,
    path
  )
}

/**
 * 创建文件不存在错误
 */
export function createFileNotFoundError(path: string): DetectionError {
  return ErrorFactory.createFileSystemError(
    ErrorCode.FILE_NOT_FOUND,
    `文件不存在: ${path}`,
    path
  )
}

/**
 * 创建检测失败错误
 */
export function createDetectionFailedError(
  directory: string,
  reason?: string,
  originalError?: Error
): DetectionError {
  const message = reason 
    ? `检测失败: ${reason}` 
    : `检测失败: ${directory}`
    
  return ErrorFactory.createDetectionError(
    ErrorCode.DETECTION_FAILED,
    message,
    directory,
    originalError
  )
}

/**
 * 创建缓存连接失败错误
 */
export function createCacheConnectionError(operation?: string): DetectionError {
  return ErrorFactory.createCacheError(
    ErrorCode.CACHE_CONNECTION_FAILED,
    '缓存服务连接失败',
    operation
  )
}

/**
 * 创建验证错误
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: any
): DetectionError {
  return ErrorFactory.createValidationError(message, field, value)
}

/**
 * 全局错误管理器实例
 */
export const errorManager = ErrorManager.getInstance()

/**
 * 便捷函数：执行带重试的操作
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  operationName?: string
): Promise<T> {
  const result = await errorManager.executeWithRetry(
    operation,
    { maxAttempts },
    operationName
  )
  
  if (!result.success) {
    throw result.error
  }
  
  return result.data!
}

/**
 * 便捷函数：处理错误
 */
export async function handleError(
  error: DetectionError | Error,
  context?: any
): Promise<void> {
  const detectionError = error instanceof DetectionError 
    ? error 
    : new DetectionError(
        ErrorCode.INTERNAL_ERROR,
        error.message,
        { originalError: error }
      )
      
  await errorManager.handleError(detectionError, context)
}

/**
 * 便捷函数：注册断路器
 */
export function registerCircuitBreaker(
  operationName: string,
  failureThreshold: number = 5,
  recoveryTimeout: number = 60000
): void {
  errorManager.registerCircuitBreaker(operationName, {
    failureThreshold,
    recoveryTimeout,
    monitoringPeriod: 300000 // 5分钟
  })
}

/**
 * 便捷函数：获取错误统计
 */
export function getErrorStats() {
  return errorManager.getErrorStats()
}

/**
 * 便捷函数：清除错误统计
 */
export function clearErrorStats(): void {
  errorManager.clearErrorStats()
}

/**
 * 错误处理装饰器
 */
export function withErrorHandling<T extends any[], R>(
  target: (...args: T) => Promise<R>,
  operationName?: string
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await target(...args)
    } catch (error) {
      const detectionError = error instanceof DetectionError 
        ? error 
        : new DetectionError(
            ErrorCode.INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error),
            { 
              originalError: error instanceof Error ? error : undefined,
              context: { metadata: { operation: operationName } }
            }
          )
      
      await errorManager.handleError(detectionError)
      throw detectionError
    }
  }
}

/**
 * 异步错误处理装饰器
 * Compatible with both TypeScript 4.x and 5.x decorator semantics
 */
export function asyncErrorHandler(operationName?: string) {
  return function <T extends any[], R>(
    target: any,
    propertyKey: string | symbol,
    descriptor?: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ): any {
    // Handle TypeScript 5.x decorator semantics (2 arguments)
    if (descriptor === undefined) {
      // For TS 5.x, target is the method itself
      const originalMethod = target as (...args: T) => Promise<R>
      return async function (this: any, ...args: T): Promise<R> {
        try {
          return await originalMethod.apply(this, args)
        } catch (error) {
          const detectionError = error instanceof DetectionError 
            ? error 
            : new DetectionError(
                ErrorCode.INTERNAL_ERROR,
                error instanceof Error ? error.message : String(error),
                { 
                  originalError: error instanceof Error ? error : undefined,
                  context: { 
                    metadata: { 
                      operation: operationName || String(propertyKey),
                      methodName: String(propertyKey)
                    }
                  }
                }
              )
          
          await errorManager.handleError(detectionError)
          throw detectionError
        }
      }
    }
    
    // Handle TypeScript 4.x decorator semantics (3 arguments)
    const originalMethod = descriptor.value!
    
    descriptor.value = async function (this: any, ...args: T): Promise<R> {
      try {
        return await originalMethod.apply(this, args)
      } catch (error) {
        const detectionError = error instanceof DetectionError 
          ? error 
          : new DetectionError(
              ErrorCode.INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error),
              { 
                originalError: error instanceof Error ? error : undefined,
                context: { 
                  metadata: { 
                    operation: operationName || `${target.constructor?.name || 'Unknown'}.${String(propertyKey)}`,
                    className: target.constructor?.name || 'Unknown',
                    methodName: String(propertyKey)
                  }
                }
              }
            )
        
        await errorManager.handleError(detectionError)
        throw detectionError
      }
    }
    
    return descriptor
  }
}

/**
 * 初始化错误处理系统
 */
export function initializeErrorHandling(): void {
  // 注册常用操作的断路器
  registerCircuitBreaker('detection', 5, 60000)
  registerCircuitBreaker('cache', 3, 30000)
  registerCircuitBreaker('filesystem', 10, 120000)
  
  // 监听错误事件
  errorManager.on('error', (error: DetectionError) => {
    // 可以在这里添加额外的错误处理逻辑
    // 例如：发送告警、记录到外部系统等
  })
}

/**
 * 错误处理中间件工厂
 */
export function createErrorMiddleware() {
  return (error: any, req: any, res: any, next: any) => {
    if (error instanceof DetectionError) {
      res.status(500).json({
        success: false,
        error: {
          code: error.code,
          message: error.getUserFriendlyMessage(),
          category: error.category,
          severity: error.severity,
          suggestions: error.suggestions,
          timestamp: error.timestamp.toISOString()
        }
      })
    } else {
      // 处理其他类型的错误
      const detectionError = new DetectionError(
        ErrorCode.INTERNAL_ERROR,
        error.message || '内部服务器错误',
        { originalError: error }
      )
      
      res.status(500).json({
        success: false,
        error: {
          code: detectionError.code,
          message: detectionError.getUserFriendlyMessage(),
          category: detectionError.category,
          severity: detectionError.severity,
          timestamp: detectionError.timestamp.toISOString()
        }
      })
    }
  }
}
