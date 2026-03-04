/**
 * 错误消息模板和国际化支持
 * 
 * 提供用户友好的错误消息和多语言支持
 */

import { ErrorCode, ErrorCategory } from './ErrorTypes'

/**
 * 语言类型
 */
export type Language = 'zh-CN' | 'en-US'

/**
 * 错误消息模板
 */
export interface ErrorMessageTemplate {
  /** 错误标题 */
  title: string
  /** 错误描述 */
  description: string
  /** 用户友好的消息 */
  userMessage: string
  /** 技术详情 */
  technicalDetails?: string
  /** 解决步骤 */
  resolutionSteps?: string[]
}

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<Language, Partial<Record<ErrorCode, ErrorMessageTemplate>>> = {
  'zh-CN': {
    [ErrorCode.VALIDATION_FAILED]: {
      title: '参数验证失败',
      description: '提供的参数不符合要求',
      userMessage: '请检查输入的参数是否正确',
      resolutionSteps: [
        '检查参数格式是否正确',
        '确认所有必填字段已填写',
        '验证参数值是否在有效范围内'
      ]
    },
    [ErrorCode.INVALID_PARAMETER]: {
      title: '无效参数',
      description: '参数格式或值不正确',
      userMessage: '参数格式不正确，请重新输入',
      resolutionSteps: [
        '检查参数类型',
        '验证参数格式',
        '确认参数值有效'
      ]
    },
    [ErrorCode.DIRECTORY_NOT_FOUND]: {
      title: '目录不存在',
      description: '指定的目录路径不存在',
      userMessage: '找不到指定的目录，请检查路径是否正确',
      resolutionSteps: [
        '确认目录路径拼写正确',
        '检查目录是否存在',
        '验证访问权限'
      ]
    },
    [ErrorCode.FILE_NOT_FOUND]: {
      title: '文件不存在',
      description: '指定的文件不存在',
      userMessage: '找不到指定的文件，请检查文件路径',
      resolutionSteps: [
        '确认文件路径正确',
        '检查文件是否存在',
        '验证文件权限'
      ]
    },
    [ErrorCode.PERMISSION_DENIED]: {
      title: '权限不足',
      description: '没有足够的权限访问文件或目录',
      userMessage: '权限不足，无法访问该文件或目录',
      resolutionSteps: [
        '检查文件权限设置',
        '确认用户访问权限',
        '联系管理员获取权限'
      ]
    },
    [ErrorCode.NETWORK_TIMEOUT]: {
      title: '网络超时',
      description: '网络请求超时',
      userMessage: '网络连接超时，请稍后重试',
      resolutionSteps: [
        '检查网络连接',
        '稍后重试操作',
        '联系网络管理员'
      ]
    },
    [ErrorCode.CACHE_CONNECTION_FAILED]: {
      title: '缓存连接失败',
      description: '无法连接到缓存服务',
      userMessage: '缓存服务暂时不可用，系统将使用备用方案',
      resolutionSteps: [
        '检查缓存服务状态',
        '重启缓存服务',
        '使用直接检测模式'
      ]
    },
    [ErrorCode.DETECTION_FAILED]: {
      title: '检测失败',
      description: '项目检测过程中发生错误',
      userMessage: '项目检测失败，请稍后重试',
      resolutionSteps: [
        '检查项目结构完整性',
        '确认依赖文件存在',
        '重新执行检测'
      ]
    },
    [ErrorCode.DETECTOR_NOT_AVAILABLE]: {
      title: '检测器不可用',
      description: '指定的检测器当前不可用',
      userMessage: '检测器暂时不可用，请稍后重试',
      resolutionSteps: [
        '检查检测器状态',
        '重启检测服务',
        '使用其他检测器'
      ]
    },
    [ErrorCode.UNSUPPORTED_PROJECT_TYPE]: {
      title: '不支持的项目类型',
      description: '当前不支持该类型的项目',
      userMessage: '暂不支持该类型的项目检测',
      resolutionSteps: [
        '确认项目类型',
        '查看支持的项目类型列表',
        '联系技术支持'
      ]
    },
    [ErrorCode.INTERNAL_ERROR]: {
      title: '内部错误',
      description: '系统内部发生错误',
      userMessage: '系统内部错误，请稍后重试',
      resolutionSteps: [
        '稍后重试操作',
        '检查系统状态',
        '联系技术支持'
      ]
    },
    [ErrorCode.SERVICE_UNAVAILABLE]: {
      title: '服务不可用',
      description: '服务当前不可用',
      userMessage: '服务暂时不可用，请稍后重试',
      resolutionSteps: [
        '稍后重试',
        '检查服务状态',
        '联系系统管理员'
      ]
    }
  },
  'en-US': {
    [ErrorCode.VALIDATION_FAILED]: {
      title: 'Validation Failed',
      description: 'The provided parameters do not meet the requirements',
      userMessage: 'Please check if the input parameters are correct',
      resolutionSteps: [
        'Check parameter format',
        'Ensure all required fields are filled',
        'Verify parameter values are within valid range'
      ]
    },
    [ErrorCode.INVALID_PARAMETER]: {
      title: 'Invalid Parameter',
      description: 'Parameter format or value is incorrect',
      userMessage: 'Parameter format is incorrect, please re-enter',
      resolutionSteps: [
        'Check parameter type',
        'Verify parameter format',
        'Confirm parameter value is valid'
      ]
    },
    [ErrorCode.DIRECTORY_NOT_FOUND]: {
      title: 'Directory Not Found',
      description: 'The specified directory path does not exist',
      userMessage: 'Cannot find the specified directory, please check the path',
      resolutionSteps: [
        'Confirm directory path spelling',
        'Check if directory exists',
        'Verify access permissions'
      ]
    },
    [ErrorCode.FILE_NOT_FOUND]: {
      title: 'File Not Found',
      description: 'The specified file does not exist',
      userMessage: 'Cannot find the specified file, please check the file path',
      resolutionSteps: [
        'Confirm file path is correct',
        'Check if file exists',
        'Verify file permissions'
      ]
    },
    [ErrorCode.PERMISSION_DENIED]: {
      title: 'Permission Denied',
      description: 'Insufficient permissions to access file or directory',
      userMessage: 'Insufficient permissions to access the file or directory',
      resolutionSteps: [
        'Check file permission settings',
        'Confirm user access rights',
        'Contact administrator for permissions'
      ]
    },
    [ErrorCode.NETWORK_TIMEOUT]: {
      title: 'Network Timeout',
      description: 'Network request timed out',
      userMessage: 'Network connection timed out, please try again later',
      resolutionSteps: [
        'Check network connection',
        'Retry operation later',
        'Contact network administrator'
      ]
    },
    [ErrorCode.CACHE_CONNECTION_FAILED]: {
      title: 'Cache Connection Failed',
      description: 'Unable to connect to cache service',
      userMessage: 'Cache service temporarily unavailable, system will use fallback',
      resolutionSteps: [
        'Check cache service status',
        'Restart cache service',
        'Use direct detection mode'
      ]
    },
    [ErrorCode.DETECTION_FAILED]: {
      title: 'Detection Failed',
      description: 'Error occurred during project detection',
      userMessage: 'Project detection failed, please try again later',
      resolutionSteps: [
        'Check project structure integrity',
        'Confirm dependency files exist',
        'Re-run detection'
      ]
    },
    [ErrorCode.DETECTOR_NOT_AVAILABLE]: {
      title: 'Detector Not Available',
      description: 'The specified detector is currently unavailable',
      userMessage: 'Detector temporarily unavailable, please try again later',
      resolutionSteps: [
        'Check detector status',
        'Restart detection service',
        'Use alternative detector'
      ]
    },
    [ErrorCode.UNSUPPORTED_PROJECT_TYPE]: {
      title: 'Unsupported Project Type',
      description: 'This type of project is not currently supported',
      userMessage: 'This project type is not supported for detection',
      resolutionSteps: [
        'Confirm project type',
        'Check supported project types list',
        'Contact technical support'
      ]
    },
    [ErrorCode.INTERNAL_ERROR]: {
      title: 'Internal Error',
      description: 'An internal system error occurred',
      userMessage: 'Internal system error, please try again later',
      resolutionSteps: [
        'Retry operation later',
        'Check system status',
        'Contact technical support'
      ]
    },
    [ErrorCode.SERVICE_UNAVAILABLE]: {
      title: 'Service Unavailable',
      description: 'Service is currently unavailable',
      userMessage: 'Service temporarily unavailable, please try again later',
      resolutionSteps: [
        'Try again later',
        'Check service status',
        'Contact system administrator'
      ]
    }
  }
}

/**
 * 分类友好名称
 */
const CATEGORY_NAMES: Record<Language, Record<ErrorCategory, string>> = {
  'zh-CN': {
    [ErrorCategory.VALIDATION]: '参数验证',
    [ErrorCategory.FILESYSTEM]: '文件系统',
    [ErrorCategory.NETWORK]: '网络连接',
    [ErrorCategory.CACHE]: '缓存服务',
    [ErrorCategory.DETECTION]: '项目检测',
    [ErrorCategory.CONFIGURATION]: '配置管理',
    [ErrorCategory.AUTHENTICATION]: '身份认证',
    [ErrorCategory.AUTHORIZATION]: '权限控制',
    [ErrorCategory.RESOURCE]: '资源管理',
    [ErrorCategory.SYSTEM]: '系统错误'
  },
  'en-US': {
    [ErrorCategory.VALIDATION]: 'Validation',
    [ErrorCategory.FILESYSTEM]: 'File System',
    [ErrorCategory.NETWORK]: 'Network',
    [ErrorCategory.CACHE]: 'Cache Service',
    [ErrorCategory.DETECTION]: 'Detection',
    [ErrorCategory.CONFIGURATION]: 'Configuration',
    [ErrorCategory.AUTHENTICATION]: 'Authentication',
    [ErrorCategory.AUTHORIZATION]: 'Authorization',
    [ErrorCategory.RESOURCE]: 'Resource',
    [ErrorCategory.SYSTEM]: 'System'
  }
}

/**
 * 错误消息管理器
 */
export class ErrorMessageManager {
  private static currentLanguage: Language = 'zh-CN'

  /**
   * 设置当前语言
   */
  static setLanguage(language: Language): void {
    this.currentLanguage = language
  }

  /**
   * 获取当前语言
   */
  static getLanguage(): Language {
    return this.currentLanguage
  }

  /**
   * 获取错误消息模板
   */
  static getErrorMessage(code: ErrorCode, language?: Language): ErrorMessageTemplate {
    const lang = language || this.currentLanguage
    const messages = ERROR_MESSAGES[lang]
    
    if (messages && messages[code]) {
      return messages[code]
    }

    // 回退到默认消息
    return {
      title: lang === 'zh-CN' ? '未知错误' : 'Unknown Error',
      description: lang === 'zh-CN' ? '发生了未知错误' : 'An unknown error occurred',
      userMessage: lang === 'zh-CN' ? '系统发生错误，请稍后重试' : 'System error occurred, please try again later',
      resolutionSteps: [
        lang === 'zh-CN' ? '稍后重试' : 'Try again later',
        lang === 'zh-CN' ? '联系技术支持' : 'Contact technical support'
      ]
    }
  }

  /**
   * 获取分类友好名称
   */
  static getCategoryName(category: ErrorCategory, language?: Language): string {
    const lang = language || this.currentLanguage
    return CATEGORY_NAMES[lang][category] || category
  }

  /**
   * 格式化错误消息
   */
  static formatErrorMessage(
    code: ErrorCode,
    context?: Record<string, any>,
    language?: Language
  ): string {
    const template = this.getErrorMessage(code, language)
    let message = template.userMessage

    // 替换上下文变量
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        const placeholder = `{${key}}`
        message = message.replace(new RegExp(placeholder, 'g'), String(value))
      })
    }

    return message
  }

  /**
   * 生成完整的错误报告
   */
  static generateErrorReport(
    code: ErrorCode,
    context?: Record<string, any>,
    language?: Language
  ): {
    title: string
    message: string
    category: string
    steps: string[]
    technicalDetails?: string
  } {
    const template = this.getErrorMessage(code, language)
    const category = this.getCategoryName(
      this.inferCategoryFromCode(code),
      language
    )

    return {
      title: template.title,
      message: this.formatErrorMessage(code, context, language),
      category,
      steps: template.resolutionSteps || [],
      technicalDetails: template.technicalDetails
    }
  }

  /**
   * 从错误码推断分类
   */
  private static inferCategoryFromCode(code: ErrorCode): ErrorCategory {
    const codeNum = parseInt(code.substring(1))
    
    if (codeNum >= 1000 && codeNum < 1100) return ErrorCategory.VALIDATION
    if (codeNum >= 1100 && codeNum < 1200) return ErrorCategory.FILESYSTEM
    if (codeNum >= 1200 && codeNum < 1300) return ErrorCategory.NETWORK
    if (codeNum >= 1300 && codeNum < 1400) return ErrorCategory.CACHE
    if (codeNum >= 1400 && codeNum < 1500) return ErrorCategory.DETECTION
    if (codeNum >= 1500 && codeNum < 1600) return ErrorCategory.CONFIGURATION
    if (codeNum >= 1600 && codeNum < 1700) return ErrorCategory.AUTHENTICATION
    if (codeNum >= 1700 && codeNum < 1800) return ErrorCategory.AUTHORIZATION
    if (codeNum >= 1800 && codeNum < 1900) return ErrorCategory.RESOURCE
    
    return ErrorCategory.SYSTEM
  }

  /**
   * 获取所有支持的错误码
   */
  static getSupportedErrorCodes(): ErrorCode[] {
    return Object.values(ErrorCode)
  }

  /**
   * 检查错误码是否支持
   */
  static isErrorCodeSupported(code: string): code is ErrorCode {
    return Object.values(ErrorCode).includes(code as ErrorCode)
  }
}
