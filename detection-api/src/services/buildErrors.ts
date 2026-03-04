/**
 * Build Analysis Error Types
 * 构建分析错误类型定义
 */

export enum BuildAnalysisErrorType {
  NOT_FRONTEND = 'NOT_FRONTEND',           // 不是前端项目
  NO_PACKAGE_JSON = 'NO_PACKAGE_JSON',     // 缺少package.json
  INVALID_CONFIG = 'INVALID_CONFIG',       // 配置文件损坏
  NO_BUILD_TOOL = 'NO_BUILD_TOOL',         // 未检测到构建工具
  INVALID_PATH = 'INVALID_PATH',           // 路径无效
  APP_NOT_FOUND = 'APP_NOT_FOUND',         // 应用不存在
  UNKNOWN = 'UNKNOWN'                      // 未知错误
}

export class BuildAnalysisError extends Error {
  public readonly type: BuildAnalysisErrorType
  public readonly userMessage: string
  public readonly technicalDetails?: any

  constructor(
    type: BuildAnalysisErrorType,
    message: string,
    userMessage: string,
    technicalDetails?: any
  ) {
    super(message)
    this.name = 'BuildAnalysisError'
    this.type = type
    this.userMessage = userMessage
    this.technicalDetails = technicalDetails
  }

  toJSON() {
    return {
      type: this.type,
      message: this.message,
      userMessage: this.userMessage,
      technicalDetails: this.technicalDetails
    }
  }
}

/**
 * 错误消息映射
 */
export const ERROR_MESSAGES: Record<BuildAnalysisErrorType, {
  user: string
  technical: string
  suggestion: string
}> = {
  [BuildAnalysisErrorType.NOT_FRONTEND]: {
    user: '该应用不是前端项目',
    technical: 'No frontend framework or build tool detected',
    suggestion: '构建分析功能仅适用于 Vue、React、Angular 等前端项目'
  },
  [BuildAnalysisErrorType.NO_PACKAGE_JSON]: {
    user: '未找到 package.json 文件',
    technical: 'package.json file not found in project directory',
    suggestion: '请确认应用目录正确，且包含有效的 package.json 文件'
  },
  [BuildAnalysisErrorType.INVALID_CONFIG]: {
    user: '构建配置文件格式错误',
    technical: 'Build configuration file contains syntax errors',
    suggestion: '请检查 vite.config.js、webpack.config.js 等配置文件的语法'
  },
  [BuildAnalysisErrorType.NO_BUILD_TOOL]: {
    user: '未检测到支持的构建工具',
    technical: 'No supported build tool found in dependencies',
    suggestion: '请确认项目使用 Vite、Webpack、Next.js 等主流构建工具'
  },
  [BuildAnalysisErrorType.INVALID_PATH]: {
    user: '应用目录路径无效',
    technical: 'Application directory path does not exist',
    suggestion: '请在应用管理中检查并更新正确的项目路径'
  },
  [BuildAnalysisErrorType.APP_NOT_FOUND]: {
    user: '应用不存在',
    technical: 'Application not found in database',
    suggestion: '该应用可能已被删除，请刷新应用列表'
  },
  [BuildAnalysisErrorType.UNKNOWN]: {
    user: '分析过程中发生未知错误',
    technical: 'Unexpected error during build analysis',
    suggestion: '请查看详细日志或联系技术支持'
  }
}

/**
 * 创建友好的错误对象
 */
export function createBuildError(
  type: BuildAnalysisErrorType,
  technicalDetails?: any
): BuildAnalysisError {
  const errorInfo = ERROR_MESSAGES[type]
  return new BuildAnalysisError(
    type,
    errorInfo.technical,
    errorInfo.user,
    {
      suggestion: errorInfo.suggestion,
      ...technicalDetails
    }
  )
}


