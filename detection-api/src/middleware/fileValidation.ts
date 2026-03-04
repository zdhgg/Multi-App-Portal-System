/**
 * 文件上传验证中间件
 * 提供增强的文件内容验证和安全检查
 */

import { Request, Response, NextFunction } from 'express'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import { logger } from '../utils/logger.js'

/**
 * 配置导入文件的结构接口
 */
interface ConfigurationImportData {
  version?: string
  exportedAt?: string
  configurations?: Array<{
    name: string
    type: string
    [key: string]: any
  }>
  environments?: Array<{
    name: string
    [key: string]: any
  }>
  templates?: any[]
}

/**
 * 文件验证选项
 */
interface FileValidationOptions {
  maxFileSize?: number
  allowedMimeTypes?: string[]
  requireJsonStructure?: boolean
  requiredFields?: string[]
  customValidator?: (data: any) => { isValid: boolean; errors: string[] }
}

/**
 * 创建文件内容验证中间件
 */
export function createFileValidationMiddleware(options: FileValidationOptions = {}) {
  const {
    maxFileSize = 50 * 1024 * 1024, // 50MB
    allowedMimeTypes = ['application/json', 'text/plain'],
    requireJsonStructure = true,
    requiredFields = [],
    customValidator
  } = options

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. 检查文件是否存在
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '未上传文件'
        })
      }

      const filePath = req.file.path
      const filename = req.file.originalname

      logger.info('开始验证上传文件', {
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      })

      // 2. 文件大小检查
      if (req.file.size > maxFileSize) {
        await cleanupFile(filePath)
        return res.status(400).json({
          success: false,
          message: `文件大小超过限制（最大${maxFileSize / 1024 / 1024}MB）`
        })
      }

      // 3. MIME类型检查
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        await cleanupFile(filePath)
        return res.status(400).json({
          success: false,
          message: `不支持的文件类型：${req.file.mimetype}`
        })
      }

      // 4. 读取文件内容
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch (error) {
        await cleanupFile(filePath)
        return res.status(400).json({
          success: false,
          message: '无法读取文件内容'
        })
      }

      // 5. 检查文件是否为空
      if (!content || content.trim().length === 0) {
        await cleanupFile(filePath)
        return res.status(400).json({
          success: false,
          message: '文件内容为空'
        })
      }

      // 6. JSON格式验证
      let jsonData: any
      if (requireJsonStructure) {
        try {
          jsonData = JSON.parse(content)
        } catch (error) {
          await cleanupFile(filePath)
          return res.status(400).json({
            success: false,
            message: '文件不是有效的JSON格式',
            error: error instanceof Error ? error.message : String(error)
          })
        }

        // 7. JSON结构验证
        if (!jsonData || typeof jsonData !== 'object') {
          await cleanupFile(filePath)
          return res.status(400).json({
            success: false,
            message: 'JSON文件结构无效（必须是对象或数组）'
          })
        }

        // 8. 必需字段检查
        if (requiredFields.length > 0) {
          const missingFields = requiredFields.filter(field => !(field in jsonData))
          if (missingFields.length > 0) {
            await cleanupFile(filePath)
            return res.status(400).json({
              success: false,
              message: `JSON配置缺少必需字段：${missingFields.join(', ')}`
            })
          }
        }

        // 9. 自定义验证器
        if (customValidator) {
          const validationResult = customValidator(jsonData)
          if (!validationResult.isValid) {
            await cleanupFile(filePath)
            return res.status(400).json({
              success: false,
              message: '文件内容验证失败',
              errors: validationResult.errors
            })
          }
        }
      }

      // 10. 计算文件哈希（用于审计和去重）
      const hash = createHash('sha256').update(content).digest('hex')

      // 11. 将验证信息附加到请求对象
      req.body.fileHash = hash
      req.body.fileSize = req.file.size
      req.body.validatedContent = jsonData

      logger.info('文件验证通过', {
        filename,
        size: req.file.size,
        hash: hash.substring(0, 16) + '...',
        hasJsonData: !!jsonData
      })

      next()
    } catch (error) {
      logger.error('文件内容验证失败', { 
        error: error instanceof Error ? error.message : String(error),
        file: req.file?.originalname
      })

      // 清理文件
      if (req.file?.path) {
        await cleanupFile(req.file.path)
      }

      res.status(500).json({
        success: false,
        message: '文件验证过程中发生错误'
      })
    }
  }
}

/**
 * 配置导入文件的专用验证器
 */
export function validateConfigurationImport(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // 检查版本信息
  if (data.version && typeof data.version !== 'string') {
    errors.push('版本信息格式错误')
  }

  // 检查导出时间
  if (data.exportedAt && typeof data.exportedAt !== 'string') {
    errors.push('导出时间格式错误')
  }

  // 检查配置数组
  if (data.configurations) {
    if (!Array.isArray(data.configurations)) {
      errors.push('configurations 必须是数组')
    } else {
      data.configurations.forEach((config: any, index: number) => {
        if (!config.name || typeof config.name !== 'string') {
          errors.push(`配置项 ${index} 缺少有效的 name 字段`)
        }
        if (!config.type || typeof config.type !== 'string') {
          errors.push(`配置项 ${index} 缺少有效的 type 字段`)
        }
      })
    }
  }

  // 检查环境数组
  if (data.environments) {
    if (!Array.isArray(data.environments)) {
      errors.push('environments 必须是数组')
    } else {
      data.environments.forEach((env: any, index: number) => {
        if (!env.name || typeof env.name !== 'string') {
          errors.push(`环境配置 ${index} 缺少有效的 name 字段`)
        }
      })
    }
  }

  // 检查模板数组
  if (data.templates && !Array.isArray(data.templates)) {
    errors.push('templates 必须是数组')
  }

  // 至少要有一种配置数据
  if (!data.configurations && !data.environments && !data.templates) {
    errors.push('文件必须包含至少一种配置数据（configurations、environments 或 templates）')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * 清理临时文件
 */
async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
    logger.debug('临时文件已清理', { filePath })
  } catch (error) {
    logger.warn('清理临时文件失败', { 
      filePath, 
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 配置导入文件验证中间件（预配置）
 */
export const validateConfigImportFile = createFileValidationMiddleware({
  maxFileSize: 50 * 1024 * 1024,
  allowedMimeTypes: ['application/json', 'text/plain'],
  requireJsonStructure: true,
  customValidator: validateConfigurationImport
})

