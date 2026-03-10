<template>
  <div class="port-manager-compact">
    <!-- 扫描功能禁用提示（简化） -->
    <el-alert 
      v-if="scanFeature.disabled" 
      type="warning" 
      :closable="false" 
      show-icon
      class="scan-alert"
    >
      端口扫描功能已禁用，使用缓存数据
    </el-alert>

    <!-- 端口列表 -->
    <div class="port-list-section">
      <div class="list-header">
        <span class="list-title">当前占用的端口 ({{ occupiedPorts.length }})</span>
        <el-button 
          size="small" 
          text 
          :loading="loading.refresh"
          @click="refreshPortStatus"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      
      <el-table 
        :data="occupiedPorts" 
        size="small" 
        v-loading="loading.refresh"
        empty-text="暂无占用端口数据"
      >
        <el-table-column prop="port" label="端口" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.port }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="appName" label="应用" min-width="140">
          <template #default="{ row }">
            <div class="app-info">
              <span class="app-name">{{ row.appName || getProcessDisplayName(row.process) }}</span>
              <el-tag v-if="row.portType" size="small" :type="getPortTypeTagType(row.portType)" class="port-type-tag">
                {{ getPortTypeText(row.portType) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="pid" label="PID" width="80">
          <template #default="{ row }">
            <span v-if="row.pid && row.pid !== 0">{{ row.pid }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <div class="status-wrapper">
              <span v-if="row.status === 'listening' || row.status === 'occupied'" class="pulse-dot"></span>
              <el-tag :type="getStatusType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <template v-if="row.portType === 'system' || row.portType === 'portal'">
              <el-button 
                type="info" 
                size="small" 
                text
                disabled
                title="核心驻留进程，禁止手动释放"
              >
                锁定
              </el-button>
            </template>
            <template v-else>
              <el-popconfirm
                :title="getActionConfirmText(row)"
                confirm-button-text="确定"
                cancel-button-text="取消"
                @confirm="forceReleasePort(row)"
              >
                <template #reference>
                  <el-button 
                    type="danger" 
                    size="small" 
                    text
                    :loading="loading.ports[row.port]"
                  >
                    {{ getActionLabel(row) }}
                  </el-button>
                </template>
              </el-popconfirm>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { portRealtimeWebSocket, type PortStatistics } from '@/services/portManagementApi'
import { appsApiService } from '@/services/appsApi'
import { usePortMonitoringStore } from '@/stores/portMonitoring'
import { getStoredAccessToken } from '@/utils/authStorage'

const portStore = usePortMonitoringStore()

// 响应式数据
const loading = reactive({
  refresh: false,
  ports: {} as Record<number, boolean>
})

// 使用 Store 的占用端口列表（通过 groupBy 打乱重组为带层级的结构，若需要 TreeData 显示）
// 目前为了最快落地，并且兼容表格，按照应用进行聚类排序，让相似的靠在一起
const occupiedPorts = computed(() => {
  const list = [...portStore.occupiedPortsList];
  return list.sort((a, b) => {
    const aName = a.appName || getProcessDisplayName(a.process);
    const bName = b.appName || getProcessDisplayName(b.process);
    if (aName !== bName) return aName.localeCompare(bName);
    return a.port - b.port;
  });
})

const isManagedAppPort = (row: { appId?: string }) => Boolean(row.appId && row.appId !== 'system')

const getActionLabel = (row: { appId?: string }) => {
  return isManagedAppPort(row) ? '停止' : '释放'
}

const getActionConfirmText = (row: { appId?: string; appName?: string; port: number }) => {
  if (isManagedAppPort(row)) {
    return row.appName ? `确定要停止应用 ${row.appName} 吗？` : `确定要停止占用端口 ${row.port} 的应用吗？`
  }
  return `确定要释放端口 ${row.port} 吗？`
}
const scanFeature = reactive({
  disabled: false,
  reason: ''
})

// 刷新端口状态 - 统一使用 Store 的方法
const refreshPortStatus = async (showMessage = true) => {
  loading.refresh = true
  try {
    // 使用 Store 的统一刷新方法
    await portStore.refreshAll(true)
  } catch (error) {
    console.error('刷新端口状态失败:', error)
    ElMessage.error('刷新失败')
  } finally {
    loading.refresh = false
  }
}

// 强制释放端口
const forceReleasePort = async (row: { port: number; appId?: string; appName?: string }) => {
  const { port, appId, appName } = row
  loading.ports[port] = true
  try {
    if (appId && appId !== 'system') {
      const result = await appsApiService.stopApp(appId, { showErrorMessage: false })

      if (result.success) {
        await refreshPortStatus(false)
      } else {
        ElMessage.error(result.message || (typeof result.error === 'string' ? result.error : (result as any).error?.message) || `停止应用失败，端口 ${port} 未释放`)
      }
    } else {
      const token = getStoredAccessToken()
      const response = await fetch(`/api/v2/config/ports/${port}/force-release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      const result = await response.json()

      if (result.success) {
        await refreshPortStatus(false)
      } else {
        ElMessage.error(result.message || result.error?.message || `释放端口 ${port} 失败`)
      }
    }
  } catch (error) {
    ElMessage.error(appId && appId !== 'system' ? `停止应用失败，端口 ${port} 未释放` : `释放端口 ${port} 失败`)
  } finally {
    loading.ports[port] = false
  }
}

// 状态类型映射
const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    'listening': 'success',
    'allocated': 'warning',
    'open': 'info',
    'occupied': 'danger',
    'conflict': 'danger',
    'free': 'success',
    'available': 'success'
  }
  return map[status] || 'info'
}

// 状态文本映射
const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    'listening': '监听中',
    'allocated': '已分配',
    'open': '开放',
    'occupied': '占用中',
    'conflict': '冲突',
    'free': '空闲',
    'available': '可用'
  }
  return map[status] || status || '未知'
}

// 进程名称显示
const getProcessDisplayName = (name: string) => {
  if (!name || name === 'Unknown') return '未知进程'
  const map: Record<string, string> = {
    'node': 'Node.js',
    'node.exe': 'Node.js',
    'Node.js': 'Node.js',
    'vite': 'Vite',
    'tsx': 'TSX',
    'npm': 'NPM',
    'detection-api': '检测API'
  }
  return map[name] || name
}

// 端口类型标签样式
const getPortTypeTagType = (type: string) => {
  const map: Record<string, string> = {
    'frontend': 'primary',
    'backend': 'success',
    'system': 'warning',
    'portal': 'info',
    'other': 'info'
  }
  return map[type] || 'info'
}

// 端口类型文本
const getPortTypeText = (type: string) => {
  const map: Record<string, string> = {
    'frontend': '前端',
    'backend': '后端',
    'system': '系统',
    'portal': '门户',
    'other': '其他'
  }
  return map[type] || type
}

// WebSocket 事件处理
const handleRealtimeStatistics = (stats: PortStatistics) => {
  portStore.quickStats.total = Number(stats.total) || 0
  portStore.quickStats.occupied = Number(stats.totalAllocated ?? stats.allocated ?? 0)
  portStore.quickStats.available = Number(stats.available) || 0
  portStore.quickStats.conflicts = Number(stats.conflicts || 0)
}

const handlePortAllocation = () => {
  // 使用 Store 的方法刷新端口列表
  portStore.fetchOccupiedPorts(true)
}

// 暴露方法给父组件
defineExpose({
  refreshPortStatus
})

// 生命周期
onMounted(() => {
  refreshPortStatus(false)
  
  // 注册 WebSocket 监听
  portRealtimeWebSocket.on('port_statistics', handleRealtimeStatistics)
  portRealtimeWebSocket.on('port_allocation', handlePortAllocation)
})

onUnmounted(() => {
  portRealtimeWebSocket.off('port_statistics', handleRealtimeStatistics)
  portRealtimeWebSocket.off('port_allocation', handlePortAllocation)
})
</script>

<style scoped>
.port-manager-compact {
  /* 无额外样式，继承父容器 */
}

.scan-alert {
  margin-bottom: 16px;
}

.port-list-section {
  /* 端口列表区域 */
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.list-title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.text-muted {
  color: #909399;
}

.app-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-name {
  font-weight: 500;
  color: #303133;
}

.port-type-tag {
  font-size: 11px;
  padding: 0 4px;
  height: 18px;
  line-height: 16px;
}

:deep(.el-table) {
  --el-table-border-color: #ebeef5;
}

:deep(.el-table th) {
  background-color: #fafafa;
  font-weight: 500;
}

:deep(.el-table td) {
  padding: 8px 0;
}

.status-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: #67c23a;
  border-radius: 50%;
  display: inline-block;
  animation: pulse-animation 2s infinite;
}

@keyframes pulse-animation {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.7);
  }
  70% {
    box-shadow: 0 0 0 4px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}
</style>
