/**
 * 异步处理器工具
 * 
 * 用于包装异步路由处理函数，自动捕获和处理错误
 */

import { Request, Response, NextFunction } from 'express'

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>

/**
 * 异步处理器包装函数
 * 自动捕获异步函数中的错误并传递给错误处理中间件
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export default asyncHandler
