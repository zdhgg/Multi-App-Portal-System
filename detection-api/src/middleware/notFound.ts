import type { Request, Response } from 'express'

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    code: 'ROUTE_NOT_FOUND',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
    path: req.path
  })
}