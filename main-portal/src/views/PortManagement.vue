<template>
  <div class="port-management">
    <section class="port-hero">
      <div class="port-hero-copy">
        <span class="port-eyebrow">Port Operations</span>
        <h1 class="port-title">端口管理中心</h1>
        <p class="port-subtitle">集中查看端口占用、容量状态与冲突风险，并统一执行刷新、清理和配置调整。</p>

        <div class="port-meta">
          <span class="port-chip">{{ conflictSummaryText }}</span>
          <span class="port-chip" :class="{ 'port-chip-warning': portStore.quickStats.conflicts > 0 }">
            {{ capacitySummaryText }}
          </span>
          <span class="port-chip port-chip-muted">最近同步 {{ lastUpdatedText }}</span>
        </div>
      </div>

      <div class="port-hero-actions">
        <el-button class="port-action port-action-secondary" :loading="loading.refreshAll" @click="refreshAll">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button class="port-action" type="warning" :loading="loading.quickCleanup" @click="quickCleanup">
          <el-icon><Delete /></el-icon> 清理
        </el-button>
        <el-button class="port-action" type="primary" @click="showConfigDrawer = true">
          <el-icon><Setting /></el-icon> 配置
        </el-button>
      </div>
    </section>

    <section class="port-metrics">
      <article class="port-metric">
        <span class="metric-label">端口总量</span>
        <strong class="metric-value">{{ portStore.quickStats.total }}</strong>
        <span class="metric-help">当前纳入统一监控的端口规模</span>
      </article>
      <article class="port-metric port-metric-highlight">
        <span class="metric-label">已占用</span>
        <strong class="metric-value">{{ portStore.quickStats.occupied }}</strong>
        <span class="metric-help">当前已被应用或进程使用的端口</span>
      </article>
      <article class="port-metric port-metric-success">
        <span class="metric-label">可用</span>
        <strong class="metric-value">{{ portStore.quickStats.available }}</strong>
        <span class="metric-help">可继续分配或接入新应用的端口</span>
      </article>
      <article class="port-metric port-metric-danger">
        <span class="metric-label">冲突</span>
        <strong class="metric-value">{{ portStore.quickStats.conflicts }}</strong>
        <span class="metric-help">需要优先处理的风险端口数量</span>
      </article>
    </section>

    <section class="port-content-shell">
      <div class="content-heading">
        <div>
          <span class="content-eyebrow">Port Inventory</span>
          <h2 class="content-title">端口占用与状态</h2>
        </div>
        <p class="content-note">统一浏览当前占用端口、状态变化和释放操作，适合排查冲突与做资源清理。</p>
      </div>

      <div class="stats-inline">
        <span class="stat-item">
          占用 <el-tag type="primary" size="small">{{ portStore.quickStats.occupied }}</el-tag>
        </span>
        <span class="stat-item" v-if="portStore.quickStats.conflicts > 0">
          冲突 <el-tag type="danger" size="small">{{ portStore.quickStats.conflicts }}</el-tag>
        </span>
        <span class="stat-item">
          可用 <el-tag type="info" size="small">{{ portStore.quickStats.available }}</el-tag>
        </span>
      </div>

      <div class="main-content">
        <PortManager ref="portManagerRef" />
      </div>
    </section>

    <PortConfigDrawer
      v-model="showConfigDrawer"
      @saved="onConfigSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Delete, Setting } from '@element-plus/icons-vue'
import PortManager from '@/components/PortManager.vue'
import PortConfigDrawer from '@/components/port-management/PortConfigDrawer.vue'
import { usePortMonitoringStore } from '@/stores/portMonitoring'
import { getStoredAccessToken } from '@/utils/authStorage'

const portStore = usePortMonitoringStore()
const showConfigDrawer = ref(false)
const portManagerRef = ref<InstanceType<typeof PortManager> | null>(null)
let statisticsRefreshTimer: ReturnType<typeof setInterval> | null = null

const loading = reactive({
  refreshAll: false,
  quickCleanup: false
})

const conflictSummaryText = computed(() => {
  if (portStore.quickStats.conflicts > 0) {
    return `检测到 ${portStore.quickStats.conflicts} 个冲突端口`
  }
  return '当前未发现端口冲突'
})

const capacitySummaryText = computed(() => {
  const total = portStore.quickStats.total || 0
  const occupied = portStore.quickStats.occupied || 0

  if (total === 0) {
    return '等待统计数据同步'
  }

  return `容量占用 ${occupied} / ${total}`
})

const lastUpdatedText = computed(() => {
  if (!portStore.lastScanTime) {
    return '尚未同步'
  }

  return new Date(portStore.lastScanTime).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
})

const refreshAll = async () => {
  loading.refreshAll = true
  try {
    await portStore.refreshAll(true)
  } catch (error) {
    console.error('刷新失败:', error)
    ElMessage.error('刷新失败')
  } finally {
    loading.refreshAll = false
  }
}

const quickCleanup = async () => {
  loading.quickCleanup = true
  try {
    const token = getStoredAccessToken()
    const response = await fetch('/api/v2/config/ports/cleanup/zombies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    const result = await response.json()

    if (result.success) {
      const cleanedCount = result.data?.cleanedCount || 0
      ElMessage.success(`已清理 ${cleanedCount} 个僵尸端口`)
      await portStore.fetchStatistics()
    } else {
      ElMessage.warning('清理完成，但可能存在问题')
    }
  } catch (error) {
    console.error('快速清理失败:', error)
    ElMessage.error('清理失败')
  } finally {
    loading.quickCleanup = false
  }
}

const onConfigSaved = async () => {
  await portStore.refreshAll(true)
  ElMessage.success('配置已更新')
}

onMounted(async () => {
  await portStore.fetchStatistics()

  statisticsRefreshTimer = setInterval(() => {
    portStore.fetchStatistics()
  }, 30000)
})

onUnmounted(() => {
  if (statisticsRefreshTimer) {
    clearInterval(statisticsRefreshTimer)
    statisticsRefreshTimer = null
  }
})
</script>

<style scoped>
.port-management {
  min-height: 100vh;
  padding: 22px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 24%),
    linear-gradient(180deg, #eef4ff 0%, #f7f9fc 48%, #eef2f8 100%);
}

.port-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 28px 30px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.84));
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
}

.port-hero-copy {
  flex: 1;
  min-width: 0;
}

.port-eyebrow,
.content-eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.port-title {
  margin-top: 14px;
  color: var(--text-strong);
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.port-subtitle {
  max-width: 760px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.port-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.port-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.port-chip-warning {
  color: var(--warning-500);
  background: rgba(217, 119, 6, 0.08);
  border-color: rgba(217, 119, 6, 0.14);
}

.port-chip-muted {
  color: var(--text-tertiary);
}

.port-hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.port-action {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-weight: 700;
}

.port-action-secondary {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.8);
}

.port-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.port-metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
}

.port-metric-highlight {
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.92), rgba(255, 255, 255, 0.88));
}

.port-metric-success {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.92), rgba(255, 255, 255, 0.88));
}

.port-metric-danger {
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.92), rgba(255, 255, 255, 0.88));
}

.metric-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.metric-value {
  color: var(--text-strong);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.metric-help {
  color: var(--text-secondary);
  font-size: 13px;
}

.port-content-shell {
  padding: 24px 26px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
}

.content-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.content-title {
  margin-top: 10px;
  color: var(--text-strong);
  font-size: 26px;
  line-height: 1.1;
}

.content-note {
  max-width: 520px;
  color: var(--text-secondary);
  font-size: 14px;
}

.stats-inline {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-secondary);
}

.main-content {
  margin-top: 16px;
  padding: 16px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
  min-height: 500px;
}

@media (max-width: 980px) {
  .port-hero,
  .content-heading {
    flex-direction: column;
  }

  .port-hero-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .port-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .port-management {
    padding: 16px 14px;
  }

  .port-hero,
  .port-content-shell {
    padding: 18px;
    border-radius: 24px;
  }

  .port-metrics {
    grid-template-columns: 1fr;
  }

  .port-hero-actions,
  .port-action {
    width: 100%;
  }
}
</style>
