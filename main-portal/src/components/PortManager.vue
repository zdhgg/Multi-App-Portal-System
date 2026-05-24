<template>
  <div class="port-manager-compact">
    <el-alert
      v-if="scanFeature.disabled"
      type="warning"
      :closable="false"
      show-icon
      class="scan-alert"
    >
      端口扫描功能已禁用，当前展示缓存数据
    </el-alert>

    <div class="port-list-section">
      <div class="list-header">
        <div class="list-header-copy">
          <span class="list-eyebrow">Occupied Ports</span>
          <span class="list-title">当前占用的端口</span>
          <span class="list-note">按应用分组排序，便于快速识别冲突来源和释放目标。</span>
        </div>

        <div class="list-header-actions">
          <span v-if="focusedPortText" class="header-pill header-pill-focus">聚焦端口 {{ focusedPortText }}</span>
          <span class="header-pill">{{ occupiedPorts.length }} 个端口</span>
          <el-button
            size="small"
            class="header-refresh"
            :loading="loading.refresh"
            @click="refreshPortStatus"
          >
            <el-icon><Refresh /></el-icon> 刷新列表
          </el-button>
        </div>
      </div>

      <el-table
        ref="tableRef"
        :data="occupiedPorts"
        size="small"
        v-loading="loading.refresh"
        empty-text="暂无占用端口数据"
        class="port-table"
        :row-class-name="getRowClassName"
      >
        <el-table-column prop="port" label="端口" width="100">
          <template #default="{ row }">
            <div class="port-cell">
              <span class="port-number-pill" :class="{ 'port-number-pill-focused': isFocusedPort(row) }">{{ row.port }}</span>
              <span v-if="isFocusedPort(row)" class="focus-port-badge">焦点</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="appName" label="应用" min-width="220">
          <template #default="{ row }">
            <div class="app-info">
              <div class="app-copy">
                <span class="app-name">{{ row.appName || getProcessDisplayName(row.process) }}</span>
                <span class="app-subtitle">{{ row.process || '未知进程' }}</span>
              </div>
              <span
                v-if="row.portType"
                class="port-type-badge"
                :class="`port-type-${row.portType}`"
              >
                {{ getPortTypeText(row.portType) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="pid" label="PID" width="100">
          <template #default="{ row }">
            <span v-if="row.pid && row.pid !== 0" class="pid-value">{{ row.pid }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="140">
          <template #default="{ row }">
            <div class="status-wrapper">
              <span
                v-if="row.status === 'listening' || row.status === 'occupied'"
                class="pulse-dot"
              ></span>
              <span class="status-badge" :class="`status-${normalizeStatus(row.status)}`">
                {{ getStatusText(row.status) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" align="center">
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
                    class="release-button"
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
import { computed, reactive, onMounted, onUnmounted, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { portRealtimeWebSocket, type PortStatistics } from '@/services/portManagementApi'
import { appsApiService } from '@/services/appsApi'
import { usePortMonitoringStore } from '@/stores/portMonitoring'
import { getStoredAccessToken } from '@/utils/authStorage'

const props = defineProps<{
  focusPort?: number | null
}>()

const portStore = usePortMonitoringStore()
const tableRef = ref<{ $el?: HTMLElement } | null>(null)

const loading = reactive({
  refresh: false,
  ports: {} as Record<number, boolean>
})

const occupiedPorts = computed(() => {
  const list = [...portStore.occupiedPortsList]
  return list.sort((a, b) => {
    const aName = a.appName || getProcessDisplayName(a.process)
    const bName = b.appName || getProcessDisplayName(b.process)
    if (aName !== bName) return aName.localeCompare(bName)
    return a.port - b.port
  })
})

const focusedPortText = computed(() => (
  typeof props.focusPort === 'number' && props.focusPort > 0
    ? String(props.focusPort)
    : ''
))

const isFocusedPort = (row: { port: number }) => (
  typeof props.focusPort === 'number' &&
  props.focusPort > 0 &&
  row.port === props.focusPort
)

const getRowClassName = ({ row }: { row: { port: number } }) => (
  isFocusedPort(row) ? 'port-row-focused' : ''
)

const scrollToFocusedPort = async () => {
  if (!focusedPortText.value) {
    return
  }

  await nextTick()

  const root = tableRef.value?.$el
  const rowElement = root?.querySelector('.el-table__body tr.port-row-focused') as HTMLElement | null
  rowElement?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

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

const refreshPortStatus = async () => {
  loading.refresh = true
  try {
    await portStore.refreshAll(true)
  } catch (error) {
    console.error('刷新端口状态失败:', error)
    ElMessage.error('刷新失败')
  } finally {
    loading.refresh = false
  }
}

const forceReleasePort = async (row: { port: number; appId?: string; appName?: string }) => {
  const { port, appId } = row
  loading.ports[port] = true
  try {
    if (appId && appId !== 'system') {
      const result = await appsApiService.stopApp(appId, { showErrorMessage: false })

      if (result.success) {
        await refreshPortStatus()
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
        await refreshPortStatus()
      } else {
        ElMessage.error(result.message || result.error?.message || `释放端口 ${port} 失败`)
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    if (appId && appId !== 'system') {
      ElMessage.error(detail ? `停止应用失败: ${detail}` : `停止应用失败，端口 ${port} 未释放`)
    } else {
      ElMessage.error(detail ? `释放端口 ${port} 失败: ${detail}` : `释放端口 ${port} 失败`)
    }
  } finally {
    loading.ports[port] = false
  }
}

const normalizeStatus = (status: string) => {
  const value = String(status || '').toLowerCase()
  if (value === 'listening' || value === 'occupied') return 'active'
  if (value === 'allocated') return 'allocated'
  if (value === 'conflict' || value === 'error') return 'conflict'
  return 'available'
}

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    listening: '监听中',
    allocated: '已分配',
    open: '开放',
    occupied: '占用中',
    conflict: '冲突',
    free: '空闲',
    available: '可用'
  }
  return map[status] || status || '未知'
}

const getProcessDisplayName = (name: string) => {
  if (!name || name === 'Unknown') return '未知进程'
  const map: Record<string, string> = {
    node: 'Node.js',
    'node.exe': 'Node.js',
    'Node.js': 'Node.js',
    vite: 'Vite',
    tsx: 'TSX',
    npm: 'NPM',
    'detection-api': '检测 API'
  }
  return map[name] || name
}

const getPortTypeText = (type: string) => {
  const map: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    system: '系统',
    portal: '门户',
    other: '其他'
  }
  return map[type] || type
}

const handleRealtimeStatistics = (stats: PortStatistics) => {
  portStore.quickStats.total = Number(stats.total) || 0
  portStore.quickStats.occupied = Number(stats.totalAllocated ?? stats.allocated ?? 0)
  portStore.quickStats.available = Number(stats.available) || 0
  portStore.quickStats.conflicts = Number(stats.conflicts || 0)
}

const handlePortAllocation = () => {
  portStore.fetchOccupiedPorts(true)
}

defineExpose({
  refreshPortStatus
})

onMounted(() => {
  refreshPortStatus()
  void scrollToFocusedPort()

  portRealtimeWebSocket.on('port_statistics', handleRealtimeStatistics)
  portRealtimeWebSocket.on('port_allocation', handlePortAllocation)
})

watch(
  () => `${focusedPortText.value}|${occupiedPorts.value.map((row) => row.port).join(',')}`,
  () => {
    void scrollToFocusedPort()
  },
  {
    flush: 'post'
  }
)

onUnmounted(() => {
  portRealtimeWebSocket.off('port_statistics', handleRealtimeStatistics)
  portRealtimeWebSocket.off('port_allocation', handlePortAllocation)
})
</script>

<style scoped>
.scan-alert {
  margin-bottom: 16px;
  border-radius: 18px;
}

.port-list-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.list-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.list-header-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.list-title {
  color: var(--text-strong);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.list-note {
  color: var(--text-secondary);
  font-size: 14px;
}

.list-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.76);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.header-pill-focus {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 247, 237, 0.9);
  color: var(--warning-500);
}

.header-refresh {
  min-height: 38px;
  border-radius: 999px;
  border-color: rgba(148, 163, 184, 0.18);
}

.port-table :deep(.el-table) {
  --el-table-header-bg-color: rgba(248, 250, 252, 0.82);
  --el-table-row-hover-bg-color: rgba(37, 99, 235, 0.04);
}

.port-table :deep(th.el-table__cell) {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.port-table :deep(td.el-table__cell) {
  padding-top: 14px;
  padding-bottom: 14px;
}

.port-table :deep(.el-table__body tr.port-row-focused > td.el-table__cell) {
  background: rgba(255, 247, 237, 0.82);
}

.port-table :deep(.el-table__body tr.port-row-focused > td.el-table__cell:first-child) {
  box-shadow: inset 4px 0 0 rgba(245, 158, 11, 0.9);
}

.port-table :deep(.el-table__body tr.port-row-focused:hover > td.el-table__cell) {
  background: rgba(255, 247, 237, 0.92);
}

.port-number-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--primary-600);
  font-family: var(--font-number);
  font-size: 13px;
  font-weight: 700;
}

.port-number-pill-focused {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.24);
}

.port-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.focus-port-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning-500);
  font-size: 11px;
  font-weight: 700;
}

.text-muted {
  color: var(--text-tertiary);
}

.app-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.app-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.app-name {
  color: var(--text-strong);
  font-weight: 700;
  line-height: 1.2;
}

.app-subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-all;
}

.port-type-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.port-type-frontend {
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
}

.port-type-backend {
  background: rgba(5, 150, 105, 0.1);
  color: var(--success-500);
}

.port-type-system,
.port-type-portal {
  background: rgba(217, 119, 6, 0.1);
  color: var(--warning-500);
}

.port-type-other {
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}

.pid-value {
  font-family: var(--font-number);
  color: var(--text-strong);
  font-weight: 700;
}

.status-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  background: rgba(236, 253, 245, 0.92);
  color: var(--success-500);
}

.status-allocated {
  background: rgba(255, 247, 237, 0.92);
  color: var(--warning-500);
}

.status-conflict {
  background: rgba(254, 242, 242, 0.92);
  color: var(--danger-500);
}

.status-available {
  background: rgba(248, 250, 252, 0.92);
  color: var(--text-secondary);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: var(--success-500);
  border-radius: 50%;
  display: inline-block;
  animation: pulse-animation 2s infinite;
}

.release-button {
  font-weight: 700;
}

@keyframes pulse-animation {
  0% {
    box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(5, 150, 105, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(5, 150, 105, 0);
  }
}

@media (max-width: 768px) {
  .list-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .list-header-actions,
  .header-refresh {
    width: 100%;
  }
}
</style>
