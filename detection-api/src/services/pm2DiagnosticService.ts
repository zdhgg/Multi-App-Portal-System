/**
 * PM2进程自动诊断服务
 * 自动检测PM2进程错误并提供修复建议
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'
import pm2 from 'pm2'

const execAsync = promisify(exec)

export interface DiagnosticResult {
  success: boolean
  processName: string
  status: 'online' | 'error' | 'stopped' | 'unknown'
  issues: DiagnosticIssue[]
  recommendations: string[]
  autoFixAvailable: boolean
  diagnosticDetails: {
    portCheck?: PortCheckResult
    dependencyCheck?: DependencyCheckResult
    configCheck?: ConfigCheckResult
    logAnalysis?: LogAnalysisResult
    pathCheck?: PathCheckResult
  }
}

export interface DiagnosticIssue {
  type: 'port_conflict' | 'missing_dependencies' | 'config_error' | 'path_error' | 'startup_script_error' | 'permission_error'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  solution: string
  autoFixable: boolean
  fixCommand?: string
}

interface PortCheckResult {
  port?: number
  isOccupied: boolean
  occupyingProcess?: {
    pid: number
    name: string
  }
}

interface DependencyCheckResult {
  hasNodeModules: boolean
  packageJsonExists: boolean
  missingDependencies?: string[]
}

interface ConfigCheckResult {
  hasEnvFile: boolean
  hasPackageJson: boolean
  startScriptExists: boolean
  startScript?: string
}

interface LogAnalysisResult {
  hasLogs: boolean
  errorCount: number
  detectedErrors: Array<{
    type: string
    message: string
  }>
}

interface PathCheckResult {
  cwdExists: boolean
  scriptExists: boolean
  cwd?: string
  script?: string
}

export class PM2DiagnosticService {
  /**
   * 执行完整的自动诊断
   */
  async diagnose(processName: string): Promise<DiagnosticResult> {
    logger.info(`开始自动诊断进程: ${processName}`)

    try {
      // 1. 获取进程信息
      const processInfo = await this.getProcessInfo(processName)
      
      if (!processInfo) {
        return {
          success: false,
          processName,
          status: 'unknown',
          issues: [{
            type: 'config_error',
            severity: 'critical',
            title: '进程不存在',
            description: `PM2进程列表中未找到进程: ${processName}`,
            solution: '请检查进程名称是否正确，或在应用管理页面重新配置',
            autoFixable: false
          }],
          recommendations: [
            '检查进程名称拼写',
            '在应用管理页面使用"批量配置"重新创建进程',
            '查看PM2进程列表: pm2 list'
          ],
          autoFixAvailable: false,
          diagnosticDetails: {}
        }
      }

      const issues: DiagnosticIssue[] = []
      const recommendations: string[] = []
      const diagnosticDetails: any = {}

      // 2. 检查进程状态
      const status = processInfo.pm2_env?.status || 'unknown'

      // 3. 如果是错误状态，执行详细诊断
      if (status === 'errored' || status === 'error') {
        // 3.1 检查端口占用
        const portCheck = await this.checkPort(processInfo)
        diagnosticDetails.portCheck = portCheck
        
        if (portCheck.isOccupied && portCheck.port) {
          issues.push({
            type: 'port_conflict',
            severity: 'critical',
            title: '端口冲突',
            description: `端口 ${portCheck.port} 已被其他进程占用 (PID: ${portCheck.occupyingProcess?.pid})`,
            solution: `停止占用端口的进程，或修改应用配置使用其他端口`,
            autoFixable: true,
            fixCommand: `taskkill /PID ${portCheck.occupyingProcess?.pid} /F`
          })
          recommendations.push(`释放端口 ${portCheck.port}`)
        }

        // 3.2 检查依赖
        const dependencyCheck = await this.checkDependencies(processInfo)
        diagnosticDetails.dependencyCheck = dependencyCheck
        
        if (!dependencyCheck.hasNodeModules) {
          issues.push({
            type: 'missing_dependencies',
            severity: 'critical',
            title: '依赖缺失',
            description: 'node_modules 目录不存在，应用依赖未安装',
            solution: '进入应用目录执行 npm install 安装依赖',
            autoFixable: true,
            fixCommand: `cd "${processInfo.pm2_env?.pm_cwd}" && npm install`
          })
          recommendations.push('安装应用依赖')
        }

        // 3.3 检查配置
        const configCheck = await this.checkConfig(processInfo)
        diagnosticDetails.configCheck = configCheck
        
        if (!configCheck.startScriptExists) {
          issues.push({
            type: 'startup_script_error',
            severity: 'high',
            title: '启动脚本不存在',
            description: 'package.json 中未找到启动脚本',
            solution: '检查 package.json 中的 scripts 配置',
            autoFixable: false
          })
          recommendations.push('检查 package.json 配置')
        }

        // 3.4 分析日志
        const logAnalysis = await this.analyzeLogs(processName)
        diagnosticDetails.logAnalysis = logAnalysis
        
        // 根据日志内容添加具体问题
        for (const error of logAnalysis.detectedErrors) {
          if (error.type === 'MODULE_NOT_FOUND') {
            issues.push({
              type: 'missing_dependencies',
              severity: 'high',
              title: '模块未找到',
              description: error.message,
              solution: '运行 npm install 安装缺失的依赖',
              autoFixable: true,
              fixCommand: `cd "${processInfo.pm2_env?.pm_cwd}" && npm install`
            })
          } else if (error.type === 'EADDRINUSE') {
            // 端口冲突已在前面处理
          }
        }

        // 3.5 检查路径
        const pathCheck = await this.checkPath(processInfo)
        diagnosticDetails.pathCheck = pathCheck
        
        if (!pathCheck.cwdExists) {
          issues.push({
            type: 'path_error',
            severity: 'critical',
            title: '工作目录不存在',
            description: `工作目录不存在或无法访问: ${pathCheck.cwd}`,
            solution: '检查PM2配置中的 cwd 路径是否正确',
            autoFixable: false
          })
          recommendations.push('修正工作目录路径')
        }
      }

      // 4. 生成通用建议
      if (issues.length === 0 && status === 'stopped') {
        recommendations.push('进程已停止，可以尝试启动')
      }

      if (issues.length > 0) {
        recommendations.push('建议删除进程后重新配置')
        recommendations.push('在应用管理页面使用"批量配置"重新生成配置')
      }

      // 5. 判断是否可自动修复
      const autoFixAvailable = issues.some(issue => issue.autoFixable)

      return {
        success: true,
        processName,
        status: status as any,
        issues,
        recommendations,
        autoFixAvailable,
        diagnosticDetails
      }
    } catch (error) {
      logger.error('自动诊断失败:', error)
      throw error
    }
  }

  /**
   * 自动修复检测到的问题
   */
  async autoFix(processName: string, issues: DiagnosticIssue[]): Promise<{
    success: boolean
    fixedIssues: string[]
    failedIssues: string[]
    message: string
  }> {
    const fixedIssues: string[] = []
    const failedIssues: string[] = []

    for (const issue of issues) {
      if (!issue.autoFixable || !issue.fixCommand) {
        continue
      }

      try {
        logger.info(`执行自动修复: ${issue.title}`)
        logger.info(`修复命令: ${issue.fixCommand}`)

        await execAsync(issue.fixCommand)
        fixedIssues.push(issue.title)
        logger.info(`✅ 修复成功: ${issue.title}`)
      } catch (error) {
        logger.error(`❌ 修复失败: ${issue.title}`, error)
        failedIssues.push(issue.title)
      }
    }

    const success = failedIssues.length === 0 && fixedIssues.length > 0

    return {
      success,
      fixedIssues,
      failedIssues,
      message: success 
        ? `成功修复 ${fixedIssues.length} 个问题` 
        : `修复了 ${fixedIssues.length} 个问题，${failedIssues.length} 个问题修复失败`
    }
  }

  /**
   * 获取进程信息
   */
  private getProcessInfo(processName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          reject(err)
          return
        }

        pm2.list((err, list) => {
          pm2.disconnect()
          
          if (err) {
            reject(err)
            return
          }

          const process = list.find(p => p.name === processName)
          resolve(process || null)
        })
      })
    })
  }

  /**
   * 检查端口占用
   */
  private async checkPort(processInfo: any): Promise<PortCheckResult> {
    const port = processInfo.pm2_env?.env?.PORT

    if (!port) {
      return { isOccupied: false }
    }

    try {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)
      const lines = stdout.split('\n').filter(line => line.includes('LISTENING'))
      
      if (lines.length > 0) {
        // 提取PID
        const match = lines[0].match(/\s+(\d+)\s*$/)
        const pid = match ? parseInt(match[1]) : undefined

        return {
          port: parseInt(port),
          isOccupied: true,
          occupyingProcess: pid ? { pid, name: 'Unknown' } : undefined
        }
      }

      return { port: parseInt(port), isOccupied: false }
    } catch {
      return { port: parseInt(port), isOccupied: false }
    }
  }

  /**
   * 检查依赖安装
   */
  private async checkDependencies(processInfo: any): Promise<DependencyCheckResult> {
    const cwd = processInfo.pm2_env?.pm_cwd

    if (!cwd) {
      return {
        hasNodeModules: false,
        packageJsonExists: false
      }
    }

    const nodeModulesPath = path.join(cwd, 'node_modules')
    const packageJsonPath = path.join(cwd, 'package.json')

    return {
      hasNodeModules: fs.existsSync(nodeModulesPath),
      packageJsonExists: fs.existsSync(packageJsonPath)
    }
  }

  /**
   * 检查配置
   */
  private async checkConfig(processInfo: any): Promise<ConfigCheckResult> {
    const cwd = processInfo.pm2_env?.pm_cwd

    if (!cwd) {
      return {
        hasEnvFile: false,
        hasPackageJson: false,
        startScriptExists: false
      }
    }

    const envPath = path.join(cwd, '.env')
    const packageJsonPath = path.join(cwd, 'package.json')

    let startScriptExists = false
    let startScript: string | undefined

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        startScript = packageJson.scripts?.dev || packageJson.scripts?.start
        startScriptExists = !!startScript
      } catch {
        // 忽略解析错误
      }
    }

    return {
      hasEnvFile: fs.existsSync(envPath),
      hasPackageJson: fs.existsSync(packageJsonPath),
      startScriptExists,
      startScript
    }
  }

  /**
   * 分析日志
   */
  private async analyzeLogs(processName: string): Promise<LogAnalysisResult> {
    try {
      const { stdout } = await execAsync(`pm2 logs ${processName} --err --lines 50 --nostream`)
      
      const detectedErrors: Array<{ type: string; message: string }> = []

      if (stdout.includes('MODULE_NOT_FOUND') || stdout.includes('Cannot find module')) {
        detectedErrors.push({
          type: 'MODULE_NOT_FOUND',
          message: '检测到模块缺失错误'
        })
      }

      if (stdout.includes('EADDRINUSE') || stdout.includes('address already in use')) {
        detectedErrors.push({
          type: 'EADDRINUSE',
          message: '检测到端口占用错误'
        })
      }

      if (stdout.includes('ENOENT') || stdout.includes('no such file or directory')) {
        detectedErrors.push({
          type: 'ENOENT',
          message: '检测到文件或目录不存在错误'
        })
      }

      if (stdout.includes('EACCES') || stdout.includes('permission denied')) {
        detectedErrors.push({
          type: 'EACCES',
          message: '检测到权限错误'
        })
      }

      return {
        hasLogs: stdout.trim().length > 0,
        errorCount: detectedErrors.length,
        detectedErrors
      }
    } catch {
      return {
        hasLogs: false,
        errorCount: 0,
        detectedErrors: []
      }
    }
  }

  /**
   * 检查路径
   */
  private async checkPath(processInfo: any): Promise<PathCheckResult> {
    const cwd = processInfo.pm2_env?.pm_cwd
    const script = processInfo.pm2_env?.pm_exec_path

    return {
      cwdExists: cwd ? fs.existsSync(cwd) : false,
      scriptExists: script ? fs.existsSync(script) : false,
      cwd,
      script
    }
  }
}

export const pm2DiagnosticService = new PM2DiagnosticService()

