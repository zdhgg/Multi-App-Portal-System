import { apiService } from './api'
import type { RequestConfig } from './api'

const DEFAULT_PM2_CONFIRMATION_TOKEN = 'CONFIRM'

function resolvePm2ConfirmationToken(): string | null {
  const rawValue = String((import.meta as any).env?.VITE_PM2_CONFIRM_TOKEN || '').trim()
  const isProduction = Boolean((import.meta as any).env?.PROD)

  if (rawValue) {
    if (isProduction && rawValue === DEFAULT_PM2_CONFIRMATION_TOKEN) {
      return null
    }
    return rawValue
  }

  return isProduction ? null : DEFAULT_PM2_CONFIRMATION_TOKEN
}

// PM2进程状态接口
export interface PM2Process {
  name: string
  pm_id: number
  pid?: number
  status: 'online' | 'stopped' | 'error' | 'stopping' | 'launching'
  cpu: number
  memory: number
  uptime: number
  restarts: number
  script?: string
  instances?: number | string
  exec_mode?: 'fork' | 'cluster'
  watch?: boolean
  max_memory_restart?: string
  env?: Record<string, string>
  log_file?: string
  error_file?: string
  out_file?: string
}

// PM2配置接口
export interface PM2Config {
  name: string
  script: string
  cwd?: string
  instances?: number | string
  exec_mode?: 'fork' | 'cluster'
  watch?: boolean
  ignore_watch?: string[]
  max_memory_restart?: string
  env?: Record<string, string>
  env_production?: Record<string, string>
  log_file?: string
  error_file?: string
  out_file?: string
  time?: boolean
  restart_delay?: number
  max_restarts?: number
  min_uptime?: string
  autorestart?: boolean
  merge_logs?: boolean
}

// PM2生态系统配置
export interface PM2EcosystemConfig {
  apps: PM2Config[]
}

// PM2统计信息
export interface PM2Stats {
  total: number
  online: number
  stopped: number
  error: number
  launching: number
}

// PM2日志类型
export type PM2LogType = 'out' | 'error' | 'combined'

// PM2日志响应
export interface PM2LogResponse {
  logs: string
  type: PM2LogType
  timestamp: string
}

// PM2状态响应
export interface PM2StatusResponse {
  enabled: boolean
  platform: string
  isWindows: boolean
  envFileExists: boolean
  envFileHasPM2Config: boolean
  pm2DaemonRunning: boolean
  needsRestart: boolean
  needsConfig: boolean
  restartCommand: string
  configPath: string
}

// PM2启用响应
export interface PM2EnableResponse {
  envPath: string
  needsRestart: boolean
  restartCommand: string
}

export interface PM2SyncStateResult {
  synced: number
  updated: number
  errors: number
  message: string
}

// PM2诊断问题
export interface PM2DiagnosticIssue {
  type: 'port_conflict' | 'missing_dependencies' | 'config_error' | 'path_error' | 'startup_script_error' | 'permission_error'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  solution: string
  autoFixable: boolean
  fixCommand?: string
}

// PM2诊断结果
export interface PM2DiagnosticResult {
  success: boolean
  processName: string
  status: 'online' | 'error' | 'stopped' | 'unknown'
  issues: PM2DiagnosticIssue[]
  recommendations: string[]
  autoFixAvailable: boolean
  diagnosticDetails: Record<string, any>
}

// PM2自动修复结果
export interface PM2AutoFixResult {
  success: boolean
  fixedIssues: string[]
  failedIssues: string[]
  message: string
}

// 应用启动方式更新请求
export interface AppLaunchMethodRequest {
  method: 'traditional' | 'pm2'
  pm2Config?: Partial<PM2Config>
}

// PM2 API服务类
export class PM2ApiService {
  private readonly confirmationHeader = 'X-Confirm-Action'
  private readonly confirmationValue = resolvePm2ConfirmationToken()

  private withConfirmation(config: RequestConfig = {}): RequestConfig {
    if (!this.confirmationValue) {
      throw new Error('PM2高风险操作已禁用：请在生产环境配置 VITE_PM2_CONFIRM_TOKEN 且不要使用默认值')
    }

    const baseHeaders = (config.headers || {}) as Record<string, string>
    return {
      ...config,
      headers: {
        ...baseHeaders,
        [this.confirmationHeader]: this.confirmationValue
      }
    }
  }

  /**
   * 获取PM2进程列表
   */
  async getProcessList(): Promise<PM2Process[]> {
    try {
      const response = await apiService.get<{ success: boolean; data: PM2Process[] }>('/pm2/processes', { showErrorMessage: false })
      return response.data || []
    } catch (e: any) {
      // 后端在 Windows 默认禁用 PM2 时会返回 503，这里静默降级为无进程
      if (e && e.status === 503) return []
      throw e
    }
  }

  /**
   * 获取PM2统计信息
   */
  async getStats(): Promise<PM2Stats> {
    try {
      const response = await apiService.get<{ success: boolean; data: PM2Stats }>('/pm2/stats', { showErrorMessage: false })
      return response.data || { total: 0, online: 0, stopped: 0, error: 0, launching: 0 }
    } catch (e: any) {
      if (e && e.status === 503) {
        return { total: 0, online: 0, stopped: 0, error: 0, launching: 0 }
      }
      throw e
    }
  }

  /**
   * 启动PM2进程
   */
  async startProcess(name: string): Promise<void> {
    await apiService.post(`/pm2/processes/${encodeURIComponent(name)}/start`, undefined, this.withConfirmation())
  }

  /**
   * 停止PM2进程
   */
  async stopProcess(name: string): Promise<void> {
    await apiService.post(`/pm2/processes/${encodeURIComponent(name)}/stop`, undefined, this.withConfirmation())
  }

  /**
   * 重启PM2进程
   */
  async restartProcess(name: string): Promise<void> {
    await apiService.post(`/pm2/processes/${encodeURIComponent(name)}/restart`, undefined, this.withConfirmation())
  }

  /**
   * 删除PM2进程
   */
  async deleteProcess(name: string): Promise<void> {
    await apiService.delete(`/pm2/processes/${encodeURIComponent(name)}`, this.withConfirmation())
  }

  /**
   * 重载PM2进程（零停机重启）
   */
  async reloadProcess(name: string): Promise<void> {
    await apiService.post(`/pm2/processes/${encodeURIComponent(name)}/reload`)
  }

  /**
   * 获取PM2进程日志
   */
  async getProcessLogs(name: string, logType: PM2LogType = 'combined', lines: number = 100): Promise<PM2LogResponse> {
    const response = await apiService.get<{ success: boolean; data: PM2LogResponse }>(
      `/pm2/processes/${encodeURIComponent(name)}/logs?type=${logType}&lines=${lines}`
    )
    // 后端返回格式: { success: true, data: { logs, type, timestamp } }
    return response?.data || { logs: '', type: logType, timestamp: new Date().toISOString() }
  }

  /**
   * 清空PM2进程日志
   */
  async clearProcessLogs(name: string): Promise<void> {
    await apiService.delete(`/pm2/processes/${encodeURIComponent(name)}/logs`, this.withConfirmation())
  }

  /**
   * 获取应用的PM2状态
   */
  async getAppPM2Status(appId: string): Promise<PM2Process | null> {
    try {
      const response = await apiService.get<PM2Process>(`/api/apps/${appId}/pm2-status`)
      return response || null
    } catch (error) {
      return null
    }
  }

  /**
   * 更新应用的启动方式
   */
  async updateAppLaunchMethod(appId: string, request: AppLaunchMethodRequest): Promise<void> {
    await apiService.put(`/api/apps/${appId}/launch-method`, request)
  }

  /**
   * 使用PM2启动应用
   */
  async startAppWithPM2(appId: string, config?: Partial<PM2Config>): Promise<PM2Process> {
    const response = await apiService.post<PM2Process>(`/pm2/apps/${appId}/start`, { config }, this.withConfirmation())
    return response
  }

  /**
   * 通过应用ID启动PM2进程（自动创建配置）
   */
  async startProcessByAppId(appId: string, config?: Partial<PM2Config>): Promise<{
    appId: string
    appName: string
    pm2ProcessName: string
    config: PM2Config
  }> {
    const response = await apiService.post(`/pm2/apps/${appId}/start`, { config }, this.withConfirmation())
    return response as any
  }

  /**
   * 生成PM2配置
   * 支持传入应用ID数组或包含{name, script, port?}的对象数组
   */
  async generatePM2Config(
    apps: Array<string | { name: string; script: string; port?: number }>,
    globalConfig?: Partial<PM2Config>
  ): Promise<PM2EcosystemConfig> {
    const response = await apiService.post<PM2EcosystemConfig>('/pm2/config/generate', {
      apps,
      options: globalConfig
    })
    return response
  }

  /**
   * 应用PM2配置
   */
  async applyPM2Config(config: PM2EcosystemConfig): Promise<void> {
    await apiService.post('/pm2/config/apply', { config }, this.withConfirmation())
  }

  /**
   * 导出PM2配置
   */
  async exportPM2Config(): Promise<PM2EcosystemConfig> {
    const response = await apiService.get<PM2EcosystemConfig>('/pm2/config/export')
    return response
  }

  /**
   * 对比 PM2 配置与当前运行配置
   */
  async diffPM2Config(config: PM2EcosystemConfig): Promise<{
    added: string[]
    removed: string[]
    changed: Array<{ name: string; before?: Partial<PM2Config> | null; after?: Partial<PM2Config> | null; changedFields: string[] }>
  }> {
    const response = await apiService.post('/pm2/config/diff', { config })
    return (response as any).data
  }

  /**
   * 获取PM2进程的详细信息
   */
  async getProcessDetails(name: string): Promise<PM2Process> {
    const response = await apiService.get<PM2Process>(`/pm2/processes/${encodeURIComponent(name)}`)
    return response
  }

  /**
   * 更新PM2进程配置
   */
  async updateProcessConfig(name: string, config: Partial<PM2Config>): Promise<void> {
    await apiService.put(`/pm2/processes/${encodeURIComponent(name)}/config`, config)
  }

  /**
   * 监控PM2进程（实时数据）
   */
  async monitorProcess(name: string): Promise<PM2Process> {
    const response = await apiService.get<PM2Process>(`/pm2/processes/${encodeURIComponent(name)}/monitor`)
    return response
  }

  /**
   * 获取PM2全局信息
   */
  async getPM2Info(): Promise<{
    version: string
    nodeVersion: string
    platform: string
    arch: string
    pm2Home: string
  }> {
    const response = await apiService.get('/pm2/info')
    return response as any
  }

  /**
   * 保存PM2进程
   */
  async saveProcesses(): Promise<void> {
    await apiService.post('/pm2/save', undefined, this.withConfirmation())
  }

  /**
   * 恢复PM2进程
   */
  async resurrectProcesses(): Promise<void> {
    await apiService.post('/pm2/resurrect', undefined, this.withConfirmation())
  }

  /**
   * 停止所有PM2进程
   */
  async stopAll(): Promise<void> {
    await apiService.post('/pm2/stop-all', undefined, this.withConfirmation())
  }

  /**
   * 重启所有PM2进程
   */
  async restartAll(): Promise<void> {
    await apiService.post('/pm2/restart-all', undefined, this.withConfirmation())
  }

  /**
   * 删除所有PM2进程
   */
  async deleteAll(): Promise<void> {
    await apiService.post('/pm2/delete-all', undefined, this.withConfirmation())
  }

  /**
   * 刷新PM2进程列表
   */
  async refresh(): Promise<PM2Process[]> {
    return this.getProcessList()
  }

  /**
   * 立即同步门户中的应用运行状态
   */
  async syncState(): Promise<PM2SyncStateResult> {
    const response = await apiService.post<{ success: boolean; data: PM2SyncStateResult }>(
      '/pm2/sync-state',
      undefined,
      { showErrorMessage: false }
    )
    return response.data
  }

  /**
   * 获取PM2集成状态
   */
  async getPM2Status(): Promise<PM2StatusResponse> {
    const response = await apiService.get<{ success: boolean; data: PM2StatusResponse }>('/pm2/status')
    return response.data
  }

  /**
   * 诊断 PM2 状态
   */
  async diagnosePM2(): Promise<any> {
    const response = await apiService.post<any>('/pm2/diagnose')
    return (response as any).data
  }

  /**
   * 自动修复 PM2 问题
   */
  async fixPM2(issueType: string): Promise<any> {
    const response = await apiService.post<any>('/pm2/fix', { issueType }, this.withConfirmation())
    return (response as any).data
  }

  /**
   * 启用PM2集成（创建/更新.env文件）
   */
  async enablePM2(): Promise<PM2EnableResponse> {
    const response = await apiService.post<{ success: boolean; data: PM2EnableResponse }>('/pm2/enable', undefined, this.withConfirmation())
    return response.data
  }

  /**
   * 自动诊断PM2进程问题
   */
  async autoDiagnose(name: string): Promise<PM2DiagnosticResult> {
    const response = await apiService.post<PM2DiagnosticResult>(
      `/pm2/processes/${encodeURIComponent(name)}/auto-diagnose`
    )
    return response
  }

  /**
   * 自动修复PM2进程问题
   */
  async autoFix(name: string, issues: PM2DiagnosticIssue[]): Promise<PM2AutoFixResult> {
    const response = await apiService.post<PM2AutoFixResult>(
      `/pm2/processes/${encodeURIComponent(name)}/auto-fix`,
      { issues },
      this.withConfirmation()
    )
    return response
  }

  /**
   * 自动为应用补全 start 脚本
   */
  async autofixStartScript(appId: string, options?: { prefer?: 'preview' | 'serve' | 'dev'; dryRun?: boolean }): Promise<{ changed: boolean; script?: string; used?: string; dryRun?: boolean }> {
    const payload: any = { appId }
    if (options?.prefer) payload.prefer = options.prefer
    if (typeof options?.dryRun === 'boolean') payload.dryRun = options.dryRun
    const response = await apiService.post<{ success: boolean; message: string; data: { changed: boolean; script?: string; used?: string; dryRun?: boolean } }>(
      '/pm2/scripts/autofix',
      payload,
      this.withConfirmation()
    )
    return (response as any).data || { changed: false }
  }

  /**
   * 验证应用的环境变量配置
   */
  async validateEnv(appId: string, env?: Record<string, string>): Promise<{
    valid: boolean
    issues: Array<{
      key: string
      severity: 'error' | 'warning'
      message: string
      suggestion?: string
    }>
    autoFixable: boolean
    suggestions: string[]
  }> {
    const response = await apiService.post(`/pm2/apps/${appId}/validate-env`, { env })
    return response as any
  }

  /**
   * 自动修复环境变量并启动应用
   */
  async autoFixEnvAndStart(appId: string, config?: Partial<PM2Config>): Promise<{
    appId: string
    appName: string
    pm2ProcessName: string
    config: PM2Config
    envFixed: boolean
    fixedVars: string[]
  }> {
    const response = await apiService.post(`/pm2/apps/${appId}/autofix-and-start`, { config })
    return response as any
  }

  /**
   * 生成JWT密钥
   */
  generateJwtSecret(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
    let result = ''
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length]
    }
    return result
  }
}

// 导出PM2 API服务实例
export const pm2ApiService = new PM2ApiService()

// 导出默认实例
export default pm2ApiService
