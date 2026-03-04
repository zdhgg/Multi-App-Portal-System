/**
 * 验证中间件 - Simplified for Clean Architecture v2
 */

import { Request, Response, NextFunction } from 'express'
import { validationResult } from 'express-validator'
import { logger } from '../utils/logger'

/**
 * 验证中间件
 * 检查 express-validator 的验证结果
 */
export const validationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req)
  
  if (!errors.isEmpty()) {
    logger.warn('请求验证失败', {
      url: req.url,
      method: req.method,
      errors: errors.array()
    })
    
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '请求参数验证失败',
      details: errors.array().map((error: any) => ({
        field: error.param || 'unknown',
        message: error.msg || 'Validation error',
        value: error.value
      }))
    })
    return
  }
  
  next()
}

export default validationMiddleware