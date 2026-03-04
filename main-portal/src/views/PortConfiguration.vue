<template>
  <div class="port-configuration">
    <!-- 页面功能区 -->
    <div class="page-actions-bar">
      <div class="actions-left">
        <h2 class="page-subtitle">端口配置管理</h2>
      </div>
      <div class="actions-right">
        <el-button 
          type="primary" 
          :icon="Refresh" 
          @click="refreshConfig"
          :loading="loading.refresh"
        >
          刷新配置
        </el-button>
        <el-button 
          type="success" 
          :icon="Download" 
          @click="exportConfig"
        >
          导出配置
        </el-button>
        <el-button 
          type="warning" 
          :icon="Upload" 
          @click="showImportDialog = true"
        >
          导入配置
        </el-button>
      </div>
    </div>

    <!-- 配置概览卡片 -->
    <div class="config-overview">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Setting /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">配置版本</div>
                <div class="card-value">{{ configStats?.version || 'N/A' }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Connection /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">可用端口</div>
                <div class="card-value">
                  {{ (configStats?.portRangeSize.frontend || 0) + (configStats?.portRangeSize.backend || 0) }}
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Lock /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">保留端口</div>
                <div class="card-value">{{ configStats?.totalReservedPorts || 0 }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Clock /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">最后更新</div>
                <div class="card-value text-sm">
                  {{ formatDate(configStats?.lastUpdated) }}
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 配置选项卡 -->
    <el-tabs v-model="activeTab" class="config-tabs">
      <!-- 端口范围配置 -->
      <el-tab-pane label="端口范围" name="port-ranges">
        <PortRangeConfig @update="handlePortRangeUpdate" />
      </el-tab-pane>

      <!-- 保留端口配置 -->
      <el-tab-pane label="保留端口" name="reserved-ports">
        <ReservedPortsConfig 
          @add-port="handleAddReservedPort"
          @remove-port="handleRemoveReservedPort"
        />
      </el-tab-pane>

      <!-- 分配策略配置 -->
      <el-tab-pane label="分配策略" name="allocation-policy">
        <AllocationPolicyConfig @update="handlePolicyUpdate" />
      </el-tab-pane>

      <!-- 监控配置 -->
      <el-tab-pane label="监控设置" name="monitoring">
        <MonitoringConfig @update="handleMonitoringUpdate" />
      </el-tab-pane>

      <!-- 变更历史 -->
      <el-tab-pane label="变更历史" name="change-history">
        <ChangeHistoryView />
      </el-tab-pane>
    </el-tabs>

    <!-- 确认对话框 -->
    <el-dialog
      v-model="showConfirmDialog"
      title="确认操作"
      width="400px"
      :before-close="handleConfirmClose"
    >
      <p>{{ confirmMessage }}</p>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showConfirmDialog = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="handleConfirm"
            :loading="loading.confirm"
          >
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入配置对话框 -->
    <ImportConfigDialog 
      v-model:visible="showImportDialog" 
      @import-config="handleImportConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Refresh, 
  Download, 
  Upload, 
  Setting, 
  Connection, 
  Lock, 
  Clock 
} from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'
import PortRangeConfig from '@/components/port-config/PortRangeConfig.vue'
import ReservedPortsConfig from '@/components/port-config/ReservedPortsConfig.vue'
import AllocationPolicyConfig from '@/components/port-config/AllocationPolicyConfig.vue'
import MonitoringConfig from '@/components/port-config/MonitoringConfig.vue'
import ChangeHistoryView from '@/components/port-config/ChangeHistoryView.vue'
import ImportConfigDialog from '@/components/port-config/ImportConfigDialog.vue'

const portConfigStore = usePortConfigStore()

// 响应式状态
const activeTab = ref('port-ranges')
const showImportDialog = ref(false)
const showConfirmDialog = ref(false)
const confirmMessage = ref('')
const pendingAction = ref<() => void>(() => {})

// 加载状态
const loading = reactive({
  refresh: false,
  save: false,
  import: false,
  confirm: false
})

// 计算属性
const portConfig = computed(() => portConfigStore.portConfig)
const configStats = computed(() => portConfigStore.configStats)
const changeHistory = computed(() => portConfigStore.changeHistory)

// 格式化日期
const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A'
  
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 刷新配置
const refreshConfig = async () => {
  loading.refresh = true
  try {
    await portConfigStore.loadConfig()
    ElMessage.success('配置刷新成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`刷新配置失败: ${errorMessage}`)
  } finally {
    loading.refresh = false
  }
}

// 导出配置
const exportConfig = async () => {
  try {
    const configJson = await portConfigStore.exportConfig()
    
    // 创建下载链接
    const blob = new Blob([configJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `portal-config-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    
    URL.revokeObjectURL(url)
    ElMessage.success('配置导出成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导出配置失败: ${errorMessage}`)
  }
}

// 导入配置
const handleImportConfig = async (configJson: string) => {
  loading.import = true
  try {
    await portConfigStore.importConfig(configJson)
    showImportDialog.value = false
    ElMessage.success('配置导入成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入配置失败: ${errorMessage}`)
  } finally {
    loading.import = false
  }
}

// 处理端口范围更新
const handlePortRangeUpdate = async (update: {
  frontendRange?: { start: number; end: number }
  backendRange?: { start: number; end: number }
}) => {
  const isCriticalChange = 
    (update.frontendRange && portConfig.value?.frontendRange && Math.abs(
      (update.frontendRange.end - update.frontendRange.start) - 
      (portConfig.value.frontendRange.end! - portConfig.value.frontendRange.start!)
    ) > 20) ||
    (update.backendRange && portConfig.value?.backendRange && Math.abs(
      (update.backendRange.end - update.backendRange.start) - 
      (portConfig.value.backendRange.end! - portConfig.value.backendRange.start!)
    ) > 20)

  if (isCriticalChange) {
    confirmMessage.value = '此操作将显著改变端口范围，可能影响正在运行的应用。确定要继续吗？'
    pendingAction.value = () => executePortRangeUpdate(update)
    showConfirmDialog.value = true
  } else {
    await executePortRangeUpdate(update)
  }
}

// 执行端口范围更新
const executePortRangeUpdate = async (update: any) => {
  loading.save = true
  try {
    await portConfigStore.updatePortRanges(
      update.frontendRange,
      update.backendRange,
      '端口范围配置更新'
    )
    ElMessage.success('端口范围更新成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`更新端口范围失败: ${errorMessage}`)
  } finally {
    loading.save = false
  }
}

// 添加保留端口
const handleAddReservedPort = async (portInfo: {
  port: number
  description: string
  category: 'system' | 'portal' | 'custom'
}) => {
  loading.save = true
  try {
    await portConfigStore.addReservedPort(
      portInfo.port,
      portInfo.description,
      portInfo.category
    )
    ElMessage.success(`保留端口 ${portInfo.port} 添加成功`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`添加保留端口失败: ${errorMessage}`)
  } finally {
    loading.save = false
  }
}

// 移除保留端口
const handleRemoveReservedPort = async (port: number) => {
  try {
    await ElMessageBox.confirm(
      `确定要移除保留端口 ${port} 吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    loading.save = true
    await portConfigStore.removeReservedPort(port)
    ElMessage.success(`保留端口 ${port} 移除成功`)
  } catch (error) {
    if (error !== 'cancel') {
      const errorMessage = error instanceof Error ? error.message : String(error)
      ElMessage.error(`移除保留端口失败: ${errorMessage}`)
    }
  } finally {
    loading.save = false
  }
}

// 更新分配策略
const handlePolicyUpdate = async (policy: any) => {
  loading.save = true
  try {
    await portConfigStore.updateAllocationPolicy(policy)
    ElMessage.success('分配策略更新成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`更新分配策略失败: ${errorMessage}`)
  } finally {
    loading.save = false
  }
}

// 更新监控配置
const handleMonitoringUpdate = async (monitoring: any) => {
  loading.save = true
  try {
    await portConfigStore.updateMonitoringConfig(monitoring)
    ElMessage.success('监控配置更新成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`更新监控配置失败: ${errorMessage}`)
  } finally {
    loading.save = false
  }
}

// 处理确认对话框
const handleConfirm = async () => {
  loading.confirm = true
  try {
    await pendingAction.value()
    showConfirmDialog.value = false
  } catch (error) {
    // 错误已在具体操作中处理
  } finally {
    loading.confirm = false
  }
}

const handleConfirmClose = () => {
  if (!loading.confirm) {
    showConfirmDialog.value = false
  }
}

// 组件挂载时加载配置
onMounted(async () => {
  try {
    // 使用重试机制加载配置
    await portConfigStore.loadConfigWithRetry()
    console.log('端口配置加载成功')
  } catch (error) {
    console.error('端口配置加载失败:', error)
    ElMessage.error('端口配置加载失败，某些功能可能不可用')
  }

  // 监听配置加载完成事件
  document.addEventListener('portConfigLoaded', (event: any) => {
    console.log('配置加载完成事件:', event.detail)
  })

  // 监听配置错误事件
  document.addEventListener('portConfigError', (event: any) => {
    console.error('配置错误事件:', event.detail)
  })
})
</script>

<style scoped>
.port-configuration {
  padding: 24px;
  background: #f0f2f5;
  min-height: 100%;
}

.page-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.actions-left {
  flex: 1;
}

.page-subtitle {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.actions-right {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.config-overview {
  margin-bottom: 24px;
}

.overview-card {
  height: 100px;
}

.card-content {
  display: flex;
  align-items: center;
  height: 100%;
}

.card-icon {
  margin-right: 16px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  color: #0284c7;
}

.card-info {
  flex: 1;
}

.card-title {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
}

.card-value {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.card-value.text-sm {
  font-size: 12px;
  font-weight: 400;
}

.config-tabs {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:deep(.el-tabs__header) {
  margin-bottom: 20px;
}

:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background-color: #e5e7eb;
}

:deep(.el-tabs__active-bar) {
  background-color: #0284c7;
}

:deep(.el-tabs__item.is-active) {
  color: #0284c7;
  font-weight: 600;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .port-configuration {
    padding: 16px;
  }

  .page-actions-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }

  .actions-left {
    text-align: center;
  }

  .page-subtitle {
    font-size: 18px;
  }

  .actions-right {
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .config-overview :deep(.el-col) {
    margin-bottom: 12px;
  }

  .config-tabs {
    padding: 16px;
  }
}
</style>