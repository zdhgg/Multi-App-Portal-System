/**
 * PM2 进程管理 Store
 * 统一管理 PM2 相关状态和操作
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { pm2ApiService } from '@/services/pm2Api'
import { appsApiService } from '@/services/appsApi'
import type { PM2Process, PM2StatusResponse, PM2DiagnosticResult } from '@/services/pm2Api'

export const usePM2Store = defineStore('pm2', () => {
  // ===== 状态 =====
  const statusLoaded = ref(false)
  const status = ref<PM2StatusResponse>({
    enabled: false,
    platform: 'win32',
    isWindows: true,
    envFileExists: false,
    envFileHasPM2Config: false,
    pm2DaemonRunning: false,
    needsRestart: false,
    needsConfig: true,
    restartCommand: '',
    configPath: ''
  })
  
  const processes = ref<PM2Process[]>([])
  const loading = ref(false)
  const enableLoading = ref(false)
  
  // 当前操作的进程
  const currentProcess = ref<PM2Process | null>(null)
  
  // 诊断相关
  const diagnosing = ref(false)
  const fixing = ref(false)
  const diagnosisResult = ref<PM2DiagnosticResult | null>(null)
  
  // 可用应用列表
  const availableApps = ref<Array<{ id: string; name: string }>>([])

  // ===== 计算属性 =====
  const isEnabled = computed(() => status.value.enabled)
  
  const stats = computed(() => ({
    total: processes.value.length,
    online: processes.value.filter(p => p.status === 'online').length,
    stopped: processes.value.filter(p => p.status === 'stopped').length,
    error: processes.value.filter(p => p.status === 'error' || (p.status as string) === 'errored').length
  }))

  // ===== 状态管理 Actions =====
  async function refreshStatus() {
    try {
      const result = await pm2ApiService.getPM2Status()
      // 容错：只要守护进程可达，也认为前端启用，避免偶发 env 读取差异造成的误判
      status.value = { ...result, enabled: !!(result.enabled || result.pm2DaemonRunning) }
      statusLoaded.value = true
    } catch (error) {
      console.error('获取PM2状态失败:', error)
      statusLoaded.value = true
    }
  }

  async function enablePM2() {
    try {
      enableLoading.value = true
      const result = await pm2ApiService.enablePM2()
      ElMessage.success('PM2配置已完成')
      await refreshStatus()
      return result
    } catch (error: any) {
      ElMessage.error(error.message || '启用PM2配置失败')
      throw error
    } finally {
      enableLoading.value = false
    }
  }

  // ===== 进程列表 Actions =====
  async function refreshProcesses() {
    if (!status.value.enabled) {
      processes.value = []
      return
    }
    
    try {
      loading.value = true
      const result = await pm2ApiService.getProcessList()
      processes.value = result
    } catch (error) {
      console.error('获取进程列表失败:', error)
      ElMessage.error('获取进程列表失败')
    } finally {
      loading.value = false
    }
  }

  async function startProcess(name: string) {
    try {
      await pm2ApiService.startProcess(name)
      ElMessage.success(`进程 ${name} 启动成功`)
      await refreshProcesses()
    } catch (error: any) {
      ElMessage.error(`启动进程失败: ${error.message}`)
      throw error
    }
  }

  async function stopProcess(name: string) {
    try {
      await pm2ApiService.stopProcess(name)
      ElMessage.success(`进程 ${name} 停止成功`)
      await refreshProcesses()
    } catch (error) {
      ElMessage.error(`停止进程 ${name} 失败`)
      throw error
    }
  }

  async function restartProcess(name: string) {
    try {
      await pm2ApiService.restartProcess(name)
      ElMessage.success(`进程 ${name} 重启成功`)
      await refreshProcesses()
    } catch (error) {
      ElMessage.error(`重启进程 ${name} 失败`)
      throw error
    }
  }

  async function deleteProcess(name: string) {
    try {
      await ElMessageBox.confirm(
        `确定要删除进程 "${name}" 吗？此操作不可撤销。`,
        '确认删除',
        { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
      )
      await pm2ApiService.deleteProcess(name)
      ElMessage.success(`进程 ${name} 删除成功`)
      await refreshProcesses()
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error(`删除进程 ${name} 失败`)
        throw error
      }
    }
  }

  // ===== 诊断 Actions =====
  async function diagnoseProcess(process: PM2Process) {
    currentProcess.value = process
    diagnosing.value = true
    
    try {
      ElMessage.info('正在执行智能诊断...')
      const result = await pm2ApiService.autoDiagnose(process.name)
      diagnosisResult.value = result
      
      if (result.issues.length === 0) {
        ElMessage.success('诊断完成：未发现明显问题')
      } else {
        ElMessage.warning(`诊断完成：发现 ${result.issues.length} 个问题`)
      }
      
      return result
    } catch (error) {
      ElMessage.error('自动诊断失败')
      throw error
    } finally {
      diagnosing.value = false
    }
  }

  async function autoFixIssues() {
    if (!diagnosisResult.value) return
    
    const fixableIssues = diagnosisResult.value.issues.filter(i => i.autoFixable)
    if (fixableIssues.length === 0) {
      ElMessage.warning('没有可自动修复的问题')
      return
    }
    
    try {
      await ElMessageBox.confirm(
        `将尝试自动修复 ${fixableIssues.length} 个问题，是否继续？`,
        '确认自动修复',
        { type: 'warning' }
      )
      
      fixing.value = true
      const result = await pm2ApiService.autoFix(
        diagnosisResult.value.processName,
        fixableIssues
      )
      
      if (result.success) {
        ElMessage.success(result.message)
        // 延迟后重新诊断
        setTimeout(async () => {
          if (currentProcess.value) {
            await diagnoseProcess(currentProcess.value)
          }
          await refreshProcesses()
        }, 2000)
      } else {
        ElMessage.error(result.message)
      }
      
      return result
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error('自动修复失败')
        throw error
      }
    } finally {
      fixing.value = false
    }
  }

  // ===== 应用列表 =====
  async function loadAvailableApps() {
    try {
      const response = await appsApiService.getApps()
      if (response.success && response.data) {
        availableApps.value = response.data.map(app => ({
          id: app.id,
          name: app.name
        }))
      }
    } catch (error) {
      console.error('加载应用列表失败:', error)
    }
  }

  // ===== 初始化 =====
  async function initialize() {
    await refreshStatus()
    await refreshProcesses()
    await loadAvailableApps()
  }

  // ===== 清理 =====
  function setCurrentProcess(process: PM2Process | null) {
    currentProcess.value = process
  }

  function clearDiagnosisResult() {
    diagnosisResult.value = null
  }

  return {
    // 状态
    statusLoaded,
    status,
    processes,
    loading,
    enableLoading,
    currentProcess,
    diagnosing,
    fixing,
    diagnosisResult,
    availableApps,
    
    // 计算属性
    isEnabled,
    stats,
    
    // Actions
    refreshStatus,
    enablePM2,
    refreshProcesses,
    startProcess,
    stopProcess,
    restartProcess,
    deleteProcess,
    diagnoseProcess,
    autoFixIssues,
    loadAvailableApps,
    initialize,
    setCurrentProcess,
    clearDiagnosisResult
  }
})
