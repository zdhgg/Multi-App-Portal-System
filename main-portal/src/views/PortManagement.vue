<template>
  <div class="port-management">
    <OperationPageHeader
      status-label="端口状态"
      :chips="headerChips"
      :snapshots="headerSnapshots"
    >
      <template #actions>
        <el-button class="port-action-secondary" :loading="loading.refreshAll" @click="refreshAll">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="warning" :loading="loading.quickCleanup" @click="quickCleanup">
          <el-icon><Delete /></el-icon> 清理
        </el-button>
        <el-button type="primary" @click="showConfigDrawer = true">
          <el-icon><Setting /></el-icon> 配置
        </el-button>
      </template>
    </OperationPageHeader>

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
import {
  Refresh,
  Delete,
  Setting,
  WarningFilled,
  Histogram,
  CircleCheck,
  Connection
} from '@element-plus/icons-vue'
import OperationPageHeader from '@/components/layout/OperationPageHeader.vue'
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

const headerChips = computed<Array<{ text: string; tone?: 'default' | 'muted' | 'warning' | 'success' }>>(() => [
  {
    text: conflictSummaryText.value,
    tone: portStore.quickStats.conflicts > 0 ? 'warning' : 'success'
  },
  {
    text: capacitySummaryText.value,
    tone: portStore.quickStats.conflicts > 0 ? 'warning' : 'default'
  },
  {
    text: `最近同步 ${lastUpdatedText.value}`,
    tone: 'muted'
  }
])

const headerSnapshots = computed<Array<{
  label: string
  value: string | number
  icon: any
  tone?: 'default' | 'highlight' | 'success' | 'warning' | 'danger'
}>>(() => [
  {
    label: '端口总量',
    value: portStore.quickStats.total || 0,
    icon: Histogram
  },
  {
    label: '已占用',
    value: portStore.quickStats.occupied || 0,
    icon: Connection,
    tone: 'highlight'
  },
  {
    label: '可用',
    value: portStore.quickStats.available || 0,
    icon: CircleCheck,
    tone: 'success'
  },
  {
    label: '冲突',
    value: portStore.quickStats.conflicts || 0,
    icon: WarningFilled,
    tone: portStore.quickStats.conflicts > 0 ? 'danger' : 'warning'
  }
])

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
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 24%),
    linear-gradient(180deg, #eef4ff 0%, #f7f9fc 48%, #eef2f8 100%);
}

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

.port-action-secondary {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.8);
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
  .content-heading {
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .port-management {
    padding: 16px 14px;
    gap: 18px;
  }

  .port-content-shell {
    padding: 18px;
    border-radius: 24px;
  }
}
</style>
