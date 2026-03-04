/**
 * 统一错误处理中间件
 * 
 * 提供一致的错误响应格式和错误日志记录
 */

import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger.js'

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string,
    public details?: any,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * 错误类型枚举
 */
export const ErrorCodes = {
  // 验证错误 (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // 认证错误 (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // 权限错误 (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // 资源错误 (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // 冲突错误 (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  
  // 服务器错误 (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
} as const

/**
 * 创建标准错误
 */
export function createError(
  statusCode: number,
  code: string,
  message: string,
  details?: any
): AppError {
  return new AppError(statusCode, message, code, details)
}

/**
 * 常用错误创建函数
 */
export const Errors = {
  validation: (message: string, details?: any) =>
    createError(400, ErrorCodes.VALIDATION_ERROR, message, details),
  
  unauthorized: (message: string = '未授权访问') =>
    createError(401, ErrorCodes.UNAUTHORIZED, message),
  
  forbidden: (message: string = '权限不足') =>
    createError(403, ErrorCodes.FORBIDDEN, message),
  
  notFound: (resource: string = '资源') =>
    createError(404, ErrorCodes.NOT_FOUND, `${resource}不存在`),
  
  conflict: (message: string, details?: any) =>
    createError(409, ErrorCodes.CONFLICT, message, details),
  
  internal: (message: string = '内部服务器错误', details?: any) =>
    createError(500, ErrorCodes.INTERNAL_ERROR, message, details)
}

/**
 * 判断是否为可操作错误
 */
function isOperationalError(error: any): boolean {
  if (error instanceof AppError) {
    return error.isOperational
  }
  return false
}

/**
 * 错误日志记录
 */
function logError(error: Error, req: Request): void {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString()
  }

  if (error instanceof AppError) {
    errorInfo['code'] = error.code
    errorInfo['statusCode'] = error.statusCode
    errorInfo['details'] = error.details
    
    // 根据错误级别记录日志
    if (error.statusCode >= 500) {
      logger.error('Server error occurred', errorInfo)
    } else if (error.statusCode >= 400) {
      logger.warn('Client error occurred', errorInfo)
    }
  } else {
    logger.error('Unexpected error occurred', errorInfo)
  }
}

/**
 * 发送错误响应
 */
function sendErrorResponse(error: AppError, res: Response): void {
  const response: any = {
    success: false,
    error: {
      code: error.code,
      message: error.message
    }
  }

  // 在开发环境中包含详细信息
  if (process.env.NODE_ENV === 'development') {
    response.error.details = error.details
    response.error.stack = error.stack
  } else if (error.details) {
    // 生产环境只包含安全的详细信息
    response.error.details = error.details
  }

  res.status(error.statusCode).json(response)
}

/**
 * 全局错误处理中间件
 */
export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // 记录错误日志
  logError(err, req)

  // 如果是 AppError，直接返回
  if (err instanceof AppError) {
    sendErrorResponse(err, res)
    return
  }

  // 处理特定类型的错误
  if (err.name === 'ValidationError') {
    const appError = createError(
      400,
      ErrorCodes.VALIDATION_ERROR,
      '数据验证失败',
      { validation: err.message }
    )
    sendErrorResponse(appError, res)
    return
  }

  if (err.name === 'UnauthorizedError' || err.message?.includes('jwt')) {
    const appError = createError(
      401,
      ErrorCodes.UNAUTHORIZED,
      '认证失败，请重新登录'
    )
    sendErrorResponse(appError, res)
    return
  }

  // 数据库错误
  if (err.message?.includes('SQLITE') || err.message?.includes('database')) {
    const appError = createError(
      500,
      ErrorCodes.DATABASE_ERROR,
      '数据库操作失败',
      process.env.NODE_ENV === 'development' ? { original: err.message } : undefined
    )
    sendErrorResponse(appError, res)
    return
  }

  // 未知错误
  const appError = createError(
    500,
    ErrorCodes.INTERNAL_ERROR,
    '服务器内部错误',
    process.env.NODE_ENV === 'development' ? { original: err.message } : undefined
  )
  sendErrorResponse(appError, res)
}

/**
 * 404 错误处理中间件
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = createError(
    404,
    ErrorCodes.NOT_FOUND,
    `路由不存在: ${req.method} ${req.url}`
  )
  next(error)
}

/**
 * 异步路由处理器包装
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 验证中间件包装
 */
export function validate(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    })

    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))

      next(createError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        '请求数据验证失败',
        { validation: details }
      ))
      return
    }

    req.body = value
    next()
  }
}
