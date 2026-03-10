<template>
  <div class="port-management">
    <!-- 紧凑工具栏 -->
    <div class="toolbar">
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
      <div class="actions">
        <el-button size="small" :loading="loading.refreshAll" @click="refreshAll">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button size="small" type="warning" :loading="loading.quickCleanup" @click="quickCleanup">
          <el-icon><Delete /></el-icon> 清理
        </el-button>
        <el-button size="small" type="primary" @click="showConfigDrawer = true">
          <el-icon><Setting /></el-icon> 配置
        </el-button>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <PortManager ref="portManagerRef" />
    </div>

    <!-- 配置抽屉 -->
    <PortConfigDrawer 
      v-model="showConfigDrawer" 
      @saved="onConfigSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
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

// 刷新所有数据
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

// 快速清理
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

// 配置保存后刷新
const onConfigSaved = async () => {
  await portStore.refreshAll(true)
  ElMessage.success('配置已更新')
}

// 页面初始化
onMounted(async () => {
  await portStore.fetchStatistics()
  
  // 定时更新（每30秒）
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
  padding: 16px;
  min-height: 100vh;
  background: #f5f7fa;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.stats-inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
}

.actions {
  display: flex;
  gap: 8px;
}

.main-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 16px;
  min-height: 500px;
}

@media (max-width: 768px) {
  .port-management {
    padding: 12px;
  }

  .toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .stats-inline {
    justify-content: center;
  }

  .actions {
    justify-content: center;
  }
}
</style>
