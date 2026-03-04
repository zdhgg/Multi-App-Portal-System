/**
 * Error handling utilities
 * 错误处理工具函数
 */

/**
 * 将未知错误转换为Error对象
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'string') {
    return new Error(error)
  }
  return new Error(String(error))
}

/**
 * 获取错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

/**
 * 获取错误堆栈
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack
  }
  return undefined
}

/**
 * 类型安全的错误处理装饰器
 */
export function catchError<T>(defaultValue: T) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args)
      } catch (error) {
        console.error(`Error in ${propertyKey}:`, getErrorMessage(error))
        return defaultValue
      }
    }

    return descriptor
  }
}

