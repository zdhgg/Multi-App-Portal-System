<template>
  <main class="port-management">
    <header class="page-header">
      <div class="page-title-block">
        <div class="title-row">
          <h1>端口监控</h1>
          <span :class="['data-state', `state-${portStore.dataState}`]">{{ dataStateLabel }}</span>
        </div>
        <div class="status-line">
          <span><el-icon><Connection /></el-icon>{{ connectionLabel }}</span>
          <span><el-icon><Clock /></el-icon>{{ lastSuccessLabel }}</span>
          <span v-if="portStore.snapshot?.cached">服务端缓存 {{ Math.round(portStore.snapshot.cacheAgeMs / 1000) }} 秒</span>
        </div>
      </div>

      <div class="page-actions">
        <el-button
          v-if="isAdmin"
          :icon="Delete"
          :loading="cleanupLoading"
          @click="cleanupInvalidAllocations"
        >清理失效分配</el-button>
        <el-button v-if="isAdmin" :icon="Setting" @click="showConfigDrawer = true">配置</el-button>
        <el-button
          type="primary"
          :icon="Refresh"
          :loading="portStore.loadingStates.refresh"
          @click="refreshAll"
        >刷新</el-button>
      </div>
    </header>

    <section class="summary-strip" aria-label="端口监控概览">
      <div>
        <span>监控范围</span>
        <strong>{{ portStore.quickStats.total }}</strong>
      </div>
      <div>
        <span>范围内监听</span>
        <strong>{{ portStore.quickStats.occupied }}</strong>
      </div>
      <div>
        <span>可用端口</span>
        <strong>{{ portStore.quickStats.available }}</strong>
      </div>
      <div :class="{ attention: portStore.quickStats.conflicts > 0 }">
        <span>归属冲突</span>
        <strong>{{ portStore.quickStats.conflicts }}</strong>
      </div>
    </section>

    <el-alert
      v-if="portStore.dataState === 'stale' && portStore.hasUsableData"
      type="warning"
      show-icon
      :closable="false"
      :title="`本次刷新失败，当前显示 ${lastSuccessLabel} 的快照`"
      :description="portStore.currentError || undefined"
    />
    <el-alert
      v-else-if="portStore.dataState === 'partial'"
      type="warning"
      show-icon
      :closable="false"
      title="部分归属信息暂时无法核验"
      :description="portStore.snapshot?.warnings.join('；')"
    />

    <PortManager :focus-port="focusedPort" />

    <PortConfigDrawer
      v-if="isAdmin"
      v-model="showConfigDrawer"
      @saved="onConfigSaved"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Connection, Delete, Refresh, Setting } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import PortManager from '@/components/PortManager.vue'
import PortConfigDrawer from '@/components/port-management/PortConfigDrawer.vue'
import { portInventoryApi } from '@/services/portInventoryApi'
import { useAuthStore } from '@/stores/auth'
import { usePortMonitoringStore } from '@/stores/portMonitoring'

const portStore = usePortMonitoringStore()
const authStore = useAuthStore()
const route = useRoute()
const showConfigDrawer = ref(false)
const cleanupLoading = ref(false)
const lastRouteHintKey = ref('')

const isAdmin = computed(() => authStore.isAdmin)
const focusedPort = computed<number | null>(() => {
  const raw = Array.isArray(route.query.focusPort) ? route.query.focusPort[0] : route.query.focusPort
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
})

const dataStateLabel = computed(() => ({
  idle: '等待同步',
  'initial-loading': '首次同步中',
  refreshing: '刷新中',
  ready: '数据已同步',
  partial: '部分可用',
  stale: '数据已过期',
  error: '连接失败'
}[portStore.dataState]))

const connectionLabel = computed(() => ({
  connecting: '正在连接实时通道',
  connected: '实时通知已连接',
  reconnecting: '实时通知重连中，轮询继续',
  polling: '轮询监控'
}[portStore.connectionState]))

const lastSuccessLabel = computed(() => {
  if (!portStore.lastSuccessTime) return '尚无成功快照'
  return `最近成功 ${portStore.lastSuccessTime.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`
})

const refreshAll = async () => {
  try {
    await portStore.refreshAll(true)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '端口清单刷新失败')
  }
}

const cleanupInvalidAllocations = async () => {
  cleanupLoading.value = true
  try {
    const preview = await portInventoryApi.previewZombieAllocations()
    if (preview.count === 0) {
      ElMessage.info('没有发现失效分配')
      return
    }

    const portText = preview.ports.slice(0, 12).join('、')
    const remainder = preview.ports.length > 12 ? ` 等 ${preview.ports.length} 个端口` : ''
    await ElMessageBox.confirm(
      `将删除 ${preview.count} 条无监听进程的分配记录：${portText}${remainder}`,
      '清理失效分配',
      { type: 'warning', confirmButtonText: '确认清理', cancelButtonText: '取消' }
    )

    const result = await portInventoryApi.cleanupZombieAllocations()
    ElMessage.success(`已清理 ${result.cleanedCount} 条失效分配`)
    await portStore.refreshAll(true)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '清理失效分配失败')
    }
  } finally {
    cleanupLoading.value = false
  }
}

const onConfigSaved = async () => {
  await portStore.refreshAll(true)
  ElMessage.success('端口配置已更新')
}

const notifyFocusedPortFromRoute = () => {
  const source = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from
  const appId = Array.isArray(route.query.appId) ? route.query.appId[0] : route.query.appId
  if (source !== 'management' || !focusedPort.value) return

  const key = `${source}:${focusedPort.value}:${String(appId || '')}`
  if (lastRouteHintKey.value === key) return
  lastRouteHintKey.value = key
  ElMessage.info(`已定位端口 ${focusedPort.value}`)
}

onMounted(async () => {
  notifyFocusedPortFromRoute()
  try {
    await portStore.startMonitoring()
  } catch {
    // 页面状态区会保留具体错误与重新连接入口。
  }
})

watch(
  () => [route.query.from, route.query.focusPort, route.query.appId].join('|'),
  notifyFocusedPortFromRoute
)

onUnmounted(() => portStore.stopMonitoring())
</script>

<style scoped>
.port-management {
  min-height: 100vh;
  padding: 20px;
  background: #f3f5f8;
  color: #273244;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 72px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d9dfe8;
}

.page-title-block { min-width: 0; }
.title-row, .status-line, .page-actions { display: flex; align-items: center; }
.title-row { gap: 12px; }
.title-row h1 { margin: 0; color: #1d2735; font-size: 25px; line-height: 1.2; letter-spacing: 0; }
.data-state { padding: 4px 7px; border: 1px solid #cbd3de; border-radius: 4px; background: #ffffff; color: #647084; font-size: 12px; }
.state-ready { border-color: #a7d7bf; background: #f1faf5; color: #28764d; }
.state-refreshing, .state-initial-loading { border-color: #a9c9e8; background: #f2f7fc; color: #27669c; }
.state-partial, .state-stale { border-color: #e5c98b; background: #fff9eb; color: #865f11; }
.state-error { border-color: #e6b0b0; background: #fff4f4; color: #a33b3b; }
.status-line { gap: 16px; margin-top: 9px; color: #6f7b8d; font-size: 12px; flex-wrap: wrap; }
.status-line span { display: inline-flex; align-items: center; gap: 5px; }
.page-actions { justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 16px;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  background: #ffffff;
}

.summary-strip > div { min-width: 0; padding: 15px 18px; border-right: 1px solid #e7ebf1; }
.summary-strip > div:last-child { border-right: 0; }
.summary-strip span { display: block; color: #748094; font-size: 12px; }
.summary-strip strong { display: block; margin-top: 4px; color: #1d2735; font-size: 23px; line-height: 1.15; letter-spacing: 0; }
.summary-strip .attention strong { color: #b13c3c; }
.port-management > :deep(.el-alert) { margin-bottom: 16px; border-radius: 6px; }
.port-management :deep(.el-button) { border-radius: 6px; }

@media (max-width: 800px) {
  .port-management { padding: 14px; }
  .page-header { align-items: flex-start; flex-direction: column; }
  .page-actions { justify-content: flex-start; width: 100%; }
  .summary-strip { grid-template-columns: 1fr 1fr; }
  .summary-strip > div:nth-child(2) { border-right: 0; }
  .summary-strip > div:nth-child(-n + 2) { border-bottom: 1px solid #e7ebf1; }
}

@media (max-width: 480px) {
  .page-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .page-actions :deep(.el-button) { margin: 0; }
  .page-actions :deep(.el-button:last-child) { grid-column: 1 / -1; }
}
</style>
