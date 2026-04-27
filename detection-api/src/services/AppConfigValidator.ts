/**
 * 应用配置验证服务
 * 
 * 用于检测和验证应用的配置文件,识别常见的配置问题
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../utils/logger.js'

export interface ConfigIssue {
  type: 'error' | 'warning' | 'info'
  category: 'proxy' | 'port' | 'path' | 'dependency' | 'cors' | 'env' | 'build' | 'security' | 'other'
  message: string
  file: string
  line?: number
  currentValue?: string
  expectedValue?: string
  autoFixable: boolean
  suggestion?: string
}

export interface ConfigValidationResult {
  valid: boolean
  issues: ConfigIssue[]
  configFiles: {
    viteConfig?: string
    packageJson?: string
    envFile?: string
  }
}

export class AppConfigValidator {
  private readonly frontendDirCandidates = [
    'frontend',
    'client',
    'web',
    'ui',
    'app-ui',
    'portal',
    'apps/frontend',
    'apps/client',
    'apps/web',
    'apps/ui'
  ] as const

  /**
   * 验证应用配置
   */
  async validateAppConfig(appDirectory: string, appPorts: { frontend: number, backend: number }): Promise<ConfigValidationResult> {
    const issues: ConfigIssue[] = []
    const configFiles: ConfigValidationResult['configFiles'] = {}

    try {
      // 检测前端配置文件
      const frontendDir = this.resolveFrontendDirectory(appDirectory)
      if (frontendDir) {
        // 检查 Vite 配置
        const viteConfigPath = this.findViteConfig(frontendDir)
        if (viteConfigPath) {
          configFiles.viteConfig = viteConfigPath
          const viteIssues = await this.validateViteConfig(viteConfigPath, appPorts)
          issues.push(...viteIssues)
        }

        // 检查 package.json
        const packageJsonPath = join(frontendDir, 'package.json')
        if (existsSync(packageJsonPath)) {
          configFiles.packageJson = packageJsonPath
          const packageIssues = await this.validatePackageJson(packageJsonPath, appPorts)
          issues.push(...packageIssues)
        }

        // 检查环境变量文件
        const envPath = join(frontendDir, '.env')
        if (existsSync(envPath)) {
          configFiles.envFile = envPath
          const envIssues = await this.validateEnvFile(envPath, appPorts)
          issues.push(...envIssues)
        }
      }

      return {
        valid: issues.filter(i => i.type === 'error').length === 0,
        issues,
        configFiles
      }
    } catch (error) {
      logger.error('配置验证失败', { error, appDirectory })
      throw error
    }
  }

  private resolveFrontendDirectory(appDirectory: string): string | null {
    for (const candidate of this.frontendDirCandidates) {
      const candidatePath = join(appDirectory, candidate)
      if (existsSync(candidatePath)) {
        return candidatePath
      }
    }

    return null
  }

  /**
   * 查找 Vite 配置文件
   */
  private findViteConfig(directory: string): string | null {
    const possibleNames = [
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mts',
      'vite.config.mjs'
    ]

    for (const name of possibleNames) {
      const path = join(directory, name)
      if (existsSync(path)) {
        return path
      }
    }

    return null
  }

  /**
   * 验证 Vite 配置
   */
  private async validateViteConfig(configPath: string, appPorts: { frontend: number, backend: number }): Promise<ConfigIssue[]> {
    const issues: ConfigIssue[] = []

    try {
      const content = readFileSync(configPath, 'utf-8')
      
      // 检查代理配置
      const proxyIssues = this.checkProxyConfig(content, configPath, appPorts.backend)
      issues.push(...proxyIssues)

      // 检查端口配置
      const portIssues = this.checkPortConfig(content, configPath, appPorts.frontend)
      issues.push(...portIssues)

      // 检查 CORS 配置
      const corsIssues = this.checkCorsConfig(content, configPath)
      issues.push(...corsIssues)

      // 检查构建配置
      const buildIssues = this.checkBuildConfig(content, configPath)
      issues.push(...buildIssues)

      // 检查路径别名配置
      const pathIssues = this.checkPathAliasConfig(content, configPath)
      issues.push(...pathIssues)

      // 检查开发服务器配置
      const serverIssues = this.checkServerConfig(content, configPath)
      issues.push(...serverIssues)

      // 检查安全配置
      const securityIssues = this.checkSecurityConfig(content, configPath)
      issues.push(...securityIssues)

    } catch (error) {
      logger.error('读取Vite配置失败', { error, configPath })
      issues.push({
        type: 'error',
        category: 'other',
        message: `无法读取配置文件: ${error instanceof Error ? error.message : String(error)}`,
        file: configPath,
        autoFixable: false
      })
    }

    return issues
  }

  /**
   * 检查代理配置
   */
  private checkProxyConfig(content: string, file: string, expectedBackendPort: number): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 匹配代理配置: target: 'http://localhost:XXXX'
    const proxyRegex = /proxy:\s*\{[^}]*['"]\/api['"]\s*:\s*\{[^}]*target:\s*['"](https?:\/\/[^'"]+)['"]/s
    const match = content.match(proxyRegex)

    if (match) {
      const targetUrl = match[1]
      const portMatch = targetUrl.match(/:(\d+)/)
      
      if (portMatch) {
        const currentPort = parseInt(portMatch[1])
        
        if (currentPort !== expectedBackendPort) {
          // 找到行号
          const lines = content.split('\n')
          let lineNumber = 0
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('target:') && lines[i].includes(targetUrl)) {
              lineNumber = i + 1
              break
            }
          }

          issues.push({
            type: 'error',
            category: 'proxy',
            message: `代理端口配置错误: 当前指向 ${currentPort}, 应该指向后端端口 ${expectedBackendPort}`,
            file,
            line: lineNumber,
            currentValue: `http://localhost:${currentPort}`,
            expectedValue: `http://localhost:${expectedBackendPort}`,
            autoFixable: true
          })
        }
      }
    } else {
      // 没有找到代理配置
      issues.push({
        type: 'warning',
        category: 'proxy',
        message: '未找到 /api 代理配置,可能导致API请求失败',
        file,
        autoFixable: false
      })
    }

    return issues
  }

  /**
   * 检查端口配置
   */
  private checkPortConfig(content: string, file: string, expectedFrontendPort: number): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 匹配端口配置: port: XXXX
    const portRegex = /server:\s*\{[^}]*port:\s*[^,\n}]*/s
    const match = content.match(portRegex)

    if (match) {
      const portMatch = match[0].match(/port:\s*(?:parseInt\([^)]*\)\s*\|\|\s*)?(\d+)/)
      
      if (portMatch) {
        const configuredPort = parseInt(portMatch[1])
        
        if (configuredPort !== expectedFrontendPort) {
          issues.push({
            type: 'warning',
            category: 'port',
            message: `前端端口配置 (${configuredPort}) 与应用注册端口 (${expectedFrontendPort}) 不一致`,
            file,
            currentValue: String(configuredPort),
            expectedValue: String(expectedFrontendPort),
            autoFixable: false // 端口配置可能有环境变量,不自动修复
          })
        }
      }
    }

    return issues
  }

  /**
   * 检查 CORS 配置
   */
  private checkCorsConfig(content: string, file: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查是否启用了 CORS
    if (!content.includes('cors:') && !content.includes('cors :')) {
      issues.push({
        type: 'info',
        category: 'cors',
        message: '建议在开发服务器中启用 CORS 配置以避免跨域问题',
        file,
        autoFixable: false,
        suggestion: '在 server 配置中添加: cors: true'
      })
    } else {
      // 检查 CORS 是否设置为 true
      const corsDisabledMatch = content.match(/cors:\s*false/)
      if (corsDisabledMatch) {
        issues.push({
          type: 'warning',
          category: 'cors',
          message: 'CORS 已被禁用,可能导致开发环境跨域请求失败',
          file,
          currentValue: 'false',
          expectedValue: 'true',
          autoFixable: true,
          suggestion: '将 cors: false 改为 cors: true'
        })
      }
    }

    return issues
  }

  /**
   * 检查构建配置
   */
  private checkBuildConfig(content: string, file: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查构建输出目录
    const outDirMatch = content.match(/outDir:\s*['"]([^'"]+)['"]/)
    if (outDirMatch) {
      const outDir = outDirMatch[1]
      // 检查是否使用了绝对路径
      if (outDir.includes(':') || outDir.startsWith('/')) {
        issues.push({
          type: 'warning',
          category: 'build',
          message: '构建输出目录使用了绝对路径,建议使用相对路径',
          file,
          currentValue: outDir,
          autoFixable: false,
          suggestion: '使用相对路径如: dist 或 build'
        })
      }
    }

    // 检查 base 路径配置
    const baseMatch = content.match(/base:\s*['"]([^'"]+)['"]/)
    if (baseMatch) {
      const base = baseMatch[1]
      // 检查生产环境的 base 路径
      if (base !== '/' && !base.startsWith('./')) {
        issues.push({
          type: 'info',
          category: 'build',
          message: `检测到自定义 base 路径: ${base}, 请确保与部署路径一致`,
          file,
          currentValue: base,
          autoFixable: false
        })
      }
    }

    // 检查是否启用了 sourcemap
    const sourcemapMatch = content.match(/sourcemap:\s*(true|false|['"](?:inline|hidden)['"])/)
    if (!sourcemapMatch) {
      issues.push({
        type: 'info',
        category: 'build',
        message: '未配置 sourcemap,建议在开发环境启用以便调试',
        file,
        autoFixable: false,
        suggestion: '在 build 配置中添加: sourcemap: true'
      })
    }

    // 检查是否配置了代码分割
    const chunkSizeMatch = content.match(/chunkSizeWarningLimit/)
    if (!chunkSizeMatch) {
      issues.push({
        type: 'info',
        category: 'build',
        message: '未配置代码分割警告限制,大型应用建议配置',
        file,
        autoFixable: false,
        suggestion: '在 build 配置中添加: chunkSizeWarningLimit: 500'
      })
    }

    return issues
  }

  /**
   * 检查路径别名配置
   */
  private checkPathAliasConfig(content: string, file: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查是否配置了 @ 别名
    const aliasMatch = content.match(/resolve:\s*\{[^}]*alias:/s)
    if (!aliasMatch) {
      issues.push({
        type: 'info',
        category: 'path',
        message: '未配置路径别名,建议配置 @ 指向 src 目录',
        file,
        autoFixable: false,
        suggestion: "在 resolve 中添加: alias: { '@': path.resolve(__dirname, './src') }"
      })
    } else {
      // 检查 @ 别名是否正确配置
      const atAliasMatch = content.match(/['"]@['"]\s*:\s*(?:path\.resolve|fileURLToPath)/)
      if (!atAliasMatch) {
        issues.push({
          type: 'warning',
          category: 'path',
          message: '路径别名 @ 可能未正确配置',
          file,
          autoFixable: false,
          suggestion: "确保使用 path.resolve(__dirname, './src') 或 fileURLToPath"
        })
      }
    }

    return issues
  }

  /**
   * 检查开发服务器配置
   */
  private checkServerConfig(content: string, file: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查 host 配置
    const hostMatch = content.match(/host:\s*['"]([^'"]+)['"]/)
    if (!hostMatch) {
      issues.push({
        type: 'info',
        category: 'other',
        message: '未配置 host,默认只能通过 localhost 访问',
        file,
        autoFixable: false,
        suggestion: "添加 host: '0.0.0.0' 以允许局域网访问"
      })
    }

    // 检查 strictPort 配置
    const strictPortMatch = content.match(/strictPort:\s*(true|false)/)
    if (!strictPortMatch) {
      issues.push({
        type: 'info',
        category: 'port',
        message: '未配置 strictPort,端口被占用时会自动使用其他端口',
        file,
        autoFixable: false,
        suggestion: '添加 strictPort: true 以确保使用指定端口'
      })
    }

    // 检查 open 配置
    const openMatch = content.match(/open:\s*(true|false)/)
    if (openMatch && openMatch[1] === 'true') {
      issues.push({
        type: 'info',
        category: 'other',
        message: '启用了自动打开浏览器,在某些环境下可能不需要',
        file,
        currentValue: 'true',
        autoFixable: false
      })
    }

    return issues
  }

  /**
   * 检查安全配置
   */
  private checkSecurityConfig(content: string, file: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查是否暴露了敏感信息
    const sensitivePatterns = [
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/, message: '配置文件中可能包含密码' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/, message: '配置文件中可能包含密钥' },
      { pattern: /token\s*[:=]\s*['"][^'"]+['"]/, message: '配置文件中可能包含令牌' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/, message: '配置文件中可能包含API密钥' }
    ]

    for (const { pattern, message } of sensitivePatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: 'warning',
          category: 'security',
          message: `${message},建议使用环境变量`,
          file,
          autoFixable: false,
          suggestion: '将敏感信息移至 .env 文件并添加到 .gitignore'
        })
      }
    }

    // 检查是否在生产环境启用了 devtools
    const devtoolsMatch = content.match(/devtools:\s*true/)
    if (devtoolsMatch) {
      issues.push({
        type: 'warning',
        category: 'security',
        message: '开发工具可能在生产环境启用,存在安全风险',
        file,
        currentValue: 'true',
        expectedValue: 'false (in production)',
        autoFixable: false,
        suggestion: '使用环境变量控制: devtools: process.env.NODE_ENV !== "production"'
      })
    }

    return issues
  }

  /**
   * 验证 package.json
   */
  private async validatePackageJson(packageJsonPath: string, appPorts: { frontend: number, backend: number }): Promise<ConfigIssue[]> {
    const issues: ConfigIssue[] = []

    try {
      const content = readFileSync(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(content)

      // 检查启动脚本
      if (packageJson.scripts) {
        const { scripts } = packageJson

        // 检查是否有开发脚本
        if (!scripts.dev && !scripts.start) {
          issues.push({
            type: 'warning',
            category: 'other',
            message: '未找到 dev 或 start 脚本',
            file: packageJsonPath,
            autoFixable: false,
            suggestion: '添加 "dev": "vite" 到 scripts'
          })
        }

        // 检查是否有构建脚本
        if (!scripts.build) {
          issues.push({
            type: 'warning',
            category: 'build',
            message: '未找到 build 脚本',
            file: packageJsonPath,
            autoFixable: false,
            suggestion: '添加 "build": "vite build" 到 scripts'
          })
        }

        // 检查是否有预览脚本
        if (!scripts.preview && scripts.build) {
          issues.push({
            type: 'info',
            category: 'build',
            message: '建议添加 preview 脚本以预览构建结果',
            file: packageJsonPath,
            autoFixable: false,
            suggestion: '添加 "preview": "vite preview" 到 scripts'
          })
        }
      }

      // 检查依赖版本
      if (packageJson.dependencies) {
        const depIssues = this.checkDependencyVersions(packageJson.dependencies, packageJsonPath, 'dependencies')
        issues.push(...depIssues)
      }

      if (packageJson.devDependencies) {
        const devDepIssues = this.checkDependencyVersions(packageJson.devDependencies, packageJsonPath, 'devDependencies')
        issues.push(...devDepIssues)
      }

      // 检查是否有 type: module
      if (packageJson.type !== 'module') {
        issues.push({
          type: 'info',
          category: 'other',
          message: '未设置 "type": "module",可能影响 ES 模块导入',
          file: packageJsonPath,
          autoFixable: false,
          suggestion: '添加 "type": "module" 以支持 ES 模块'
        })
      }

      // 检查 engines 字段
      if (!packageJson.engines) {
        issues.push({
          type: 'info',
          category: 'other',
          message: '未指定 Node.js 版本要求',
          file: packageJsonPath,
          autoFixable: false,
          suggestion: '添加 "engines": { "node": ">=16.0.0" }'
        })
      }

    } catch (error) {
      logger.error('读取package.json失败', { error, packageJsonPath })
    }

    return issues
  }

  /**
   * 检查依赖版本
   */
  private checkDependencyVersions(dependencies: Record<string, string>, file: string, type: string): ConfigIssue[] {
    const issues: ConfigIssue[] = []

    // 检查是否使用了不安全的版本范围
    for (const [name, version] of Object.entries(dependencies)) {
      // 检查是否使用了 * 或 latest
      if (version === '*' || version === 'latest') {
        issues.push({
          type: 'warning',
          category: 'dependency',
          message: `依赖 ${name} 使用了不安全的版本 "${version}"`,
          file,
          currentValue: version,
          autoFixable: false,
          suggestion: '使用具体版本号或版本范围,如 "^1.0.0"'
        })
      }

      // 检查是否使用了 file: 或 link: 协议
      if (version.startsWith('file:') || version.startsWith('link:')) {
        issues.push({
          type: 'warning',
          category: 'dependency',
          message: `依赖 ${name} 使用了本地路径,可能导致部署问题`,
          file,
          currentValue: version,
          autoFixable: false,
          suggestion: '使用 npm 包或 git 仓库'
        })
      }

      // 检查常见的版本冲突
      if (name === 'vue' && type === 'dependencies') {
        const vueVersion = version.replace(/[\^~]/, '')
        const majorVersion = parseInt(vueVersion.split('.')[0])

        if (majorVersion < 3) {
          issues.push({
            type: 'info',
            category: 'dependency',
            message: `检测到 Vue ${majorVersion}.x,建议升级到 Vue 3`,
            file,
            currentValue: version,
            autoFixable: false
          })
        }
      }
    }

    return issues
  }

  /**
   * 验证环境变量文件
   */
  private async validateEnvFile(envPath: string, appPorts: { frontend: number, backend: number }): Promise<ConfigIssue[]> {
    const issues: ConfigIssue[] = []

    try {
      const content = readFileSync(envPath, 'utf-8')

      // 检查端口配置
      const portMatch = content.match(/VITE_(?:DEV_)?PORT\s*=\s*(\d+)/)
      if (portMatch) {
        const envPort = parseInt(portMatch[1])
        if (envPort !== appPorts.frontend) {
          issues.push({
            type: 'info',
            category: 'port',
            message: `.env 文件中的端口 (${envPort}) 与应用注册端口 (${appPorts.frontend}) 不一致`,
            file: envPath,
            currentValue: String(envPort),
            expectedValue: String(appPorts.frontend),
            autoFixable: false
          })
        }
      }

      // 检查 API 基础 URL
      const apiUrlMatch = content.match(/VITE_API_(?:BASE_)?URL\s*=\s*(.+)/)
      if (apiUrlMatch) {
        const apiUrl = apiUrlMatch[1].trim()

        // 检查是否使用了硬编码的 localhost
        if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
          issues.push({
            type: 'warning',
            category: 'env',
            message: 'API URL 使用了硬编码的 localhost,可能导致生产环境问题',
            file: envPath,
            currentValue: apiUrl,
            autoFixable: false,
            suggestion: '使用相对路径或环境变量控制'
          })
        }

        // 检查端口是否匹配
        const urlPortMatch = apiUrl.match(/:(\d+)/)
        if (urlPortMatch) {
          const urlPort = parseInt(urlPortMatch[1])
          if (urlPort !== appPorts.backend) {
            issues.push({
              type: 'warning',
              category: 'env',
              message: `API URL 中的端口 (${urlPort}) 与后端端口 (${appPorts.backend}) 不一致`,
              file: envPath,
              currentValue: apiUrl,
              expectedValue: apiUrl.replace(`:${urlPort}`, `:${appPorts.backend}`),
              autoFixable: true
            })
          }
        }
      }

      // 检查是否有必需的环境变量
      const requiredVars = ['VITE_APP_TITLE', 'VITE_API_URL', 'VITE_API_BASE_URL']
      const missingVars = requiredVars.filter(varName => !content.includes(varName))

      if (missingVars.length > 0) {
        issues.push({
          type: 'info',
          category: 'env',
          message: `缺少常用环境变量: ${missingVars.join(', ')}`,
          file: envPath,
          autoFixable: false,
          suggestion: '添加应用所需的环境变量'
        })
      }

      // 检查是否有空值
      const emptyVarMatch = content.match(/^([A-Z_]+)\s*=\s*$/m)
      if (emptyVarMatch) {
        issues.push({
          type: 'warning',
          category: 'env',
          message: `环境变量 ${emptyVarMatch[1]} 为空`,
          file: envPath,
          autoFixable: false,
          suggestion: '为环境变量设置有效值或删除该行'
        })
      }

      // 检查是否有敏感信息
      const sensitivePatterns = [
        { pattern: /PASSWORD\s*=\s*.+/, message: '密码' },
        { pattern: /SECRET\s*=\s*.+/, message: '密钥' },
        { pattern: /PRIVATE_KEY\s*=\s*.+/, message: '私钥' },
        { pattern: /TOKEN\s*=\s*.+/, message: '令牌' }
      ]

      for (const { pattern, message } of sensitivePatterns) {
        if (pattern.test(content)) {
          issues.push({
            type: 'warning',
            category: 'security',
            message: `环境变量文件包含${message},请确保已添加到 .gitignore`,
            file: envPath,
            autoFixable: false,
            suggestion: '检查 .gitignore 是否包含 .env 文件'
          })
          break // 只提示一次
        }
      }

      // 检查是否有注释说明
      if (!content.includes('#') && !content.includes('//')) {
        issues.push({
          type: 'info',
          category: 'env',
          message: '建议为环境变量添加注释说明',
          file: envPath,
          autoFixable: false,
          suggestion: '使用 # 添加注释说明每个变量的用途'
        })
      }

    } catch (error) {
      logger.error('读取.env文件失败', { error, envPath })
    }

    return issues
  }
}
