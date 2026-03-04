import type { Request, Response, NextFunction } from 'express'
import { logger } from '@utils/logger'
import { Sanitizer } from '@utils/sanitizer'

export interface AppError extends Error {
  statusCode?: number
  code?: string
  details?: unknown
}

export class CustomError extends Error implements AppError {
  public statusCode: number
  public code?: string
  public details?: unknown

  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message)
    this.name = 'CustomError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    
    // 确保错误堆栈可用
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError)
    }
  }
}

export const createError = (
  message: string, 
  statusCode = 500, 
  code?: string, 
  details?: unknown
): CustomError => {
  return new CustomError(message, statusCode, code, details)
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 如果响应已经发送，则传递给默认的Express错误处理器
  if (res.headersSent) {
    return next(err)
  }

  // 设置默认错误状态码
  const statusCode = err.statusCode || 500
  const code = err.code || 'INTERNAL_ERROR'

  // 记录错误日志（生产环境自动脱敏）
  const isProduction = process.env.NODE_ENV === 'production'

  const logData: any = {
    message: err.message,
    statusCode,
    code,
    stack: isProduction ? Sanitizer.sanitizePath(err.stack || '') : err.stack,
    url: isProduction ? Sanitizer.sanitizePath(req.url) : req.url,
    method: req.method,
    ip: isProduction ? Sanitizer.sanitizeIP(req.ip || '') : req.ip,
    userAgent: req.get('User-Agent'),
    details: isProduction ? Sanitizer.sanitizeObject(err.details) : err.details
  }

  logger.error('API Error:', logData)

  // 构建错误响应（生产环境脱敏）
  const errorResponse: {
    success: boolean
    error: string
    code: string
    message: string
    details?: unknown
    timestamp: string
    path: string
  } = {
    success: false,
    error: 'Request failed',
    code,
    message: isProduction ? Sanitizer.sanitizePath(err.message) : err.message,
    timestamp: new Date().toISOString(),
    path: isProduction ? Sanitizer.sanitizePath(req.path) : req.path
  }

  // 开发环境下包含更多错误信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = err.details
  } else if (err.details) {
    // 生产环境脱敏details
    errorResponse.details = Sanitizer.sanitizeObject(err.details)
  }

  // 根据错误类型设置特定的响应
  switch (statusCode) {
    case 400:
      errorResponse.error = 'Bad Request'
      break
    case 401:
      errorResponse.error = 'Unauthorized'
      break
    case 403:
      errorResponse.error = 'Forbidden'
      break
    case 404:
      errorResponse.error = 'Not Found'
      break
    case 409:
      errorResponse.error = 'Conflict'
      break
    case 422:
      errorResponse.error = 'Unprocessable Entity'
      break
    case 429:
      errorResponse.error = 'Too Many Requests'
      break
    case 500:
    default:
      errorResponse.error = 'Internal Server Error'
      // 生产环境下隐藏内部错误详情
      if (process.env.NODE_ENV === 'production') {
        errorResponse.message = 'An internal server error occurred'
      }
      break
  }

  res.status(statusCode).json(errorResponse)
}

// 异步错误处理包装器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 验证错误处理
export const validationError = (message: string, details?: unknown) => {
  return new CustomError(message, 422, 'VALIDATION_ERROR', details)
}

// 未找到错误
export const notFoundError = (resource: string) => {
  return new CustomError(`${resource} not found`, 404, 'NOT_FOUND')
}

// 未授权错误
export const unauthorizedError = (message = 'Unauthorized access') => {
  return new CustomError(message, 401, 'UNAUTHORIZED')
}

// 禁止访问错误
export const forbiddenError = (message = 'Access forbidden') => {
  return new CustomError(message, 403, 'FORBIDDEN')
}

// 冲突错误
export const conflictError = (message: string, details?: unknown) => {
  return new CustomError(message, 409, 'CONFLICT', details)
}