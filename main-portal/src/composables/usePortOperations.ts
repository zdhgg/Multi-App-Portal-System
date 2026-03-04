/**
 * 端口操作组合式函数 - 统一的操作抽象层
 */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortMonitoringStore } from '@/stores/portMonitoring'
import { portManagementApiService } from '@/services/portManagementApi'

export interface OperationResult<T = any> {
  success: boolean
  data?: T
  error?: string
  warnings?: string[]
}

export interface BatchOperationResult {
  total: number
  successful: number
  failed: number
  results: Array<{
    port: number
    success: boolean
    error?: string
  }>
}

export function usePortOperations() {
  const portStore = usePortMonitoringStore()
  
  // 操作状态
  const operationInProgress = ref(false)
  const currentOperation = ref<string | null>(null)
  const operationProgress = ref(0)

  // 单端口操作
  const releasePort = async (
    port: number, 
    options: {
      force?: boolean
      reason?: string
      skipConfirmation?: boolean
    } = {}
  ): Promise<OperationResult> => {
    const { force = false, reason, skipConfirmation = false } = options
    
    try {
      // 确认对话框
      if (!skipConfirmation) {
        await ElMessageBox.confirm(
          `确定要${force ? '强制' : ''}释放端口 ${port} 吗？${reason ? `\n原因：${reason}` : ''}`,
          '确认操作',
          {
            confirmButtonText: force ? '强制释放' : '释放',
            cancelButtonText: '取消',
            type: force ? 'warning' : 'info',
            dangerouslyUseHTMLString: true
          }
        )
      }

      operationInProgress.value = true
      currentOperation.value = `释放端口 ${port}`

      const result = await portStore.forceReleasePort(port, {
        reason,
        bypassSafetyCheck: force
      })

      if (result.success) {
        ElMessage.success(`端口 ${port} 已成功释放`)
        return { success: true, data: result.data }
      } else {
        throw new Error(result.error || '释放失败')
      }
    } catch (error: any) {
      if (error === 'cancel') {
        return { success: false, error: '用户取消操作' }
      }
      
      const errorMessage = error.message || '释放端口失败'
      ElMessage.error(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      operationInProgress.value = false
      currentOperation.value = null
    }
  }

  // 批量端口操作
  const batchReleaseports = async (
    ports: number[],
    options: {
      force?: boolean
      reason?: string
      maxConcurrency?: number
    } = {}
  ): Promise<BatchOperationResult> => {
    const { force = false, reason, maxConcurrency = 3 } = options
    
    if (ports.length === 0) {
      return { total: 0, successful: 0, failed: 0, results: [] }
    }

    try {
      await ElMessageBox.confirm(
        `确定要批量${force ? '强制' : ''}释放 ${ports.length} 个端口吗？`,
        '批量操作确认',
        {
          confirmButtonText: `${force ? '强制' : ''}释放全部`,
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      operationInProgress.value = true
      currentOperation.value = `批量释放 ${ports.length} 个端口`
      operationProgress.value = 0

      const results: BatchOperationResult['results'] = []
      let successful = 0
      let failed = 0

      // 分批处理，避免并发过多
      for (let i = 0; i < ports.length; i += maxConcurrency) {
        const batch = ports.slice(i, i + maxConcurrency)
        
        const batchPromises = batch.map(async (port) => {
          try {
            const result = await releasePort(port, {
              force,
              reason,
              skipConfirmation: true
            })
            
            if (result.success) {
              successful++
              return { port, success: true }
            } else {
              failed++
              return { port, success: false, error: result.error }
            }
          } catch (error: any) {
            failed++
            return { port, success: false, error: error.message }
          }
        })

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
        
        // 更新进度
        operationProgress.value = Math.round(((i + batch.length) / ports.length) * 100)
      }

      const result: BatchOperationResult = {
        total: ports.length,
        successful,
        failed,
        results
      }

      // 显示结果摘要
      if (failed === 0) {
        ElMessage.success(`成功释放 ${successful} 个端口`)
      } else if (successful === 0) {
        ElMessage.error(`释放失败，${failed} 个端口无法释放`)
      } else {
        ElMessage.warning(`部分成功：${successful} 个成功，${failed} 个失败`)
      }

      return result
    } catch (error: any) {
      if (error === 'cancel') {
        return { total: ports.length, successful: 0, failed: 0, results: [] }
      }
      throw error
    } finally {
      operationInProgress.value = false
      currentOperation.value = null
      operationProgress.value = 0
    }
  }

  // 智能清理操作
  const smartCleanup = async (options: {
    targetTypes?: string[]
    excludePorts?: number[]
    dryRun?: boolean
  } = {}): Promise<OperationResult<{
    candidates: number[]
    cleaned: number[]
    skipped: number[]
  }>> => {
    const { targetTypes = ['zombie', 'stale'], excludePorts = [], dryRun = false } = options
    
    try {
      operationInProgress.value = true
      currentOperation.value = '智能清理分析'

      // 分析需要清理的端口
      const candidates: number[] = []
      
      portStore.activePorts.forEach(port => {
        // 跳过排除的端口
        if (excludePorts.includes(port.port)) return
        
        // 检查是否为僵尸进程
        if (targetTypes.includes('zombie') && isZombiePort(port)) {
          candidates.push(port.port)
        }
        
        // 检查是否为过期端口
        if (targetTypes.includes('stale') && isStalePort(port)) {
          candidates.push(port.port)
        }
      })

      if (candidates.length === 0) {
        ElMessage.info('没有发现需要清理的端口')
        return {
          success: true,
          data: { candidates: [], cleaned: [], skipped: [] }
        }
      }

      if (dryRun) {
        ElMessage.info(`发现 ${candidates.length} 个可清理端口（预览模式）`)
        return {
          success: true,
          data: { candidates, cleaned: [], skipped: candidates }
        }
      }

      // 执行清理
      currentOperation.value = `清理 ${candidates.length} 个端口`
      const batchResult = await batchReleaseports(candidates, {
        force: true,
        reason: '智能清理',
        maxConcurrency: 2
      })

      const cleaned = batchResult.results
        .filter(r => r.success)
        .map(r => r.port)
      
      const skipped = batchResult.results
        .filter(r => !r.success)
        .map(r => r.port)

      return {
        success: true,
        data: { candidates, cleaned, skipped }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '智能清理失败'
      }
    } finally {
      operationInProgress.value = false
      currentOperation.value = null
    }
  }

  // 端口健康检查
  const healthCheck = async (): Promise<OperationResult<{
    healthy: number[]
    warning: number[]
    critical: number[]
    recommendations: string[]
  }>> => {
    try {
      operationInProgress.value = true
      currentOperation.value = '端口健康检查'

      const healthy: number[] = []
      const warning: number[] = []
      const critical: number[] = []
      const recommendations: string[] = []

      portStore.activePorts.forEach(port => {
        const riskLevel = port.security?.riskLevel || 'low'
        const responseTime = port.performance.responseTime
        
        if (riskLevel === 'high' || responseTime > 5000) {
          critical.push(port.port)
        } else if (riskLevel === 'medium' || responseTime > 2000) {
          warning.push(port.port)
        } else {
          healthy.push(port.port)
        }
      })

      // 生成建议
      if (critical.length > 0) {
        recommendations.push(`${critical.length} 个端口存在严重问题，建议立即处理`)
      }
      if (warning.length > 5) {
        recommendations.push('警告端口数量较多，建议定期清理')
      }
      if (portStore.statistics.conflicts > 0) {
        recommendations.push('存在端口冲突，建议检查配置')
      }

      return {
        success: true,
        data: { healthy, warning, critical, recommendations }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '健康检查失败'
      }
    } finally {
      operationInProgress.value = false
      currentOperation.value = null
    }
  }

  // 工具方法
  const isZombiePort = (port: any): boolean => {
    // 检查进程是否存在但无响应
    return port.process?.pid && port.performance.responseTime > 10000
  }

  const isStalePort = (port: any): boolean => {
    // 检查端口是否长时间未活动
    const lastCheck = new Date(port.performance.lastCheck)
    const hoursSinceCheck = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60)
    return hoursSinceCheck > 24
  }

  // 计算属性
  const canPerformOperations = computed(() => !operationInProgress.value)
  const operationStatus = computed(() => ({
    inProgress: operationInProgress.value,
    operation: currentOperation.value,
    progress: operationProgress.value
  }))

  return {
    // 状态
    operationInProgress,
    currentOperation,
    operationProgress,
    
    // 计算属性
    canPerformOperations,
    operationStatus,
    
    // 方法
    releasePort,
    batchReleaseports,
    smartCleanup,
    healthCheck
  }
}
