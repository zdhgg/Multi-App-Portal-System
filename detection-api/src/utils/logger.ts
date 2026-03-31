import winston from 'winston'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { Sanitizer } from './sanitizer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 创建日志目录
const logDir = join(__dirname, '../../logs')
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true })
}

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// 控制台格式
const consoleFormatParts = [
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    return `[${timestamp}] ${level}: ${message} ${metaStr}`
  })
]

if (process.stdout.isTTY && process.env.NO_COLOR !== '1') {
  consoleFormatParts.unshift(winston.format.colorize())
}

const consoleFormat = winston.format.combine(...consoleFormatParts)

// 在 PM2 中镜像日志到 stdout/stderr，避免启动失败时 PM2 日志为空。
const shouldMirrorLogsToConsole =
  process.env.NODE_ENV !== 'production' ||
  process.env.PM2_ENABLED === '1' ||
  process.env.LOG_TO_STDOUT === '1'

// 创建logger实例
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 组合日志文件
    new winston.transports.File({
      filename: join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
})

// 开发环境以及 PM2 场景下添加控制台输出，便于启动期诊断。
if (shouldMirrorLogsToConsole) {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    stderrLevels: ['error']
  }))
}

// 是否启用脱敏（生产环境默认启用）
const enableSanitization = process.env.ENABLE_LOG_SANITIZATION !== 'false' &&
                           process.env.NODE_ENV === 'production'

// 导出便捷方法（带脱敏）
export const logError = (message: string, error?: Error | unknown, meta?: object) => {
  const sanitizedMessage = enableSanitization ? Sanitizer.sanitizePath(message) : message

  let errorData: any
  if (error instanceof Error) {
    errorData = enableSanitization
      ? Sanitizer.sanitizeError(error)
      : { message: error.message, stack: error.stack, name: error.name }
  } else {
    errorData = error
  }

  const sanitizedMeta = enableSanitization && meta
    ? Sanitizer.sanitizeObject(meta, { maskSensitiveFields: true, sanitizePaths: true })
    : meta

  logger.error(sanitizedMessage, { error: errorData, ...sanitizedMeta })
}

export const logInfo = (message: string, meta?: object) => {
  const sanitizedMessage = enableSanitization ? Sanitizer.sanitizePath(message) : message
  const sanitizedMeta = enableSanitization && meta
    ? Sanitizer.sanitizeObject(meta, { maskSensitiveFields: true, sanitizePaths: true })
    : meta

  logger.info(sanitizedMessage, sanitizedMeta)
}

export const logWarn = (message: string, meta?: object) => {
  const sanitizedMessage = enableSanitization ? Sanitizer.sanitizePath(message) : message
  const sanitizedMeta = enableSanitization && meta
    ? Sanitizer.sanitizeObject(meta, { maskSensitiveFields: true, sanitizePaths: true })
    : meta

  logger.warn(sanitizedMessage, sanitizedMeta)
}

export const logDebug = (message: string, meta?: object) => {
  const sanitizedMessage = enableSanitization ? Sanitizer.sanitizePath(message) : message
  const sanitizedMeta = enableSanitization && meta
    ? Sanitizer.sanitizeObject(meta, { maskSensitiveFields: true, sanitizePaths: true })
    : meta

  logger.debug(sanitizedMessage, sanitizedMeta)
}
