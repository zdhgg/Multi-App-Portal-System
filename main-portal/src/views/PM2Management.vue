<template>
  <div class="pm2-management">
    <!-- 页面标题区 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">PM2进程管理</h2>
        <span class="page-subtitle">管理通过门户部署的应用进程</span>
      </div>
      <!-- PM2状态标签 -->
      <PM2StatusAlert
        :status="pm2Status"
        :status-loaded="pm2StatusLoaded"
        :enable-loading="enableLoading"
        @enable="handleQuickEnable"
        @refresh="pm2Store.refreshStatus"
        @show-guide="showPM2ManualGuide"
      />
    </div>

    <!-- PM2已启用时显示的内容 -->
    <template v-if="pm2StatusLoaded && pm2Status.enabled">
      <!-- 统计面板：有进程时才显示 -->
      <PM2StatsPanel v-if="pm2Stats.total > 0" :stats="pm2Stats" />

      <!-- 进程列表（包含操作栏） -->
      <PM2ProcessTable
        :processes="pm2Processes"
        :loading="loading"
        :auto-refresh="autoRefresh"
        @update:auto-refresh="autoRefresh = $event"
        @start="pm2Store.startProcess"
        @stop="pm2Store.stopProcess"
        @restart="pm2Store.restartProcess"
        @delete="pm2Store.deleteProcess"
        @config="showProcessConfig"
        @logs="showLogs"
        @go-to-management="$router.push('/management')"
        @refresh="pm2Store.refreshProcesses"
      />
    </template>

    <!-- 对话框组件 -->
    <PM2ConfigDialog
      v-model="configDialogVisible"
      :process="currentProcess"
      @saved="pm2Store.refreshProcesses"
    />

    <PM2LogDialog
      v-model="logDialogVisible"
      :process="currentProcess"
      :diagnosing="diagnosing"
      @diagnose="startAutoDiagnosis"
    />

    <PM2DiagnosisDialog
      v-model="diagnosisDialogVisible"
      :result="diagnosisResult"
      :process-name="currentProcess?.name || ''"
      :fixing="fixing"
      @auto-fix="startAutoFix"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessageBox } from 'element-plus'
import { usePM2Store } from '@/stores/pm2'
import { wsManager } from '@/services/websocketApi'
import type { PM2Process } from '@/services/pm2Api'

// 导入子组件
import {
  PM2StatusAlert,
  PM2StatsPanel,
  PM2ProcessTable,
  PM2ConfigDialog,
  PM2LogDialog,
  PM2DiagnosisDialog
} from '@/components/pm2'

const router = useRouter()

// 使用 Pinia Store
const pm2Store = usePM2Store()
const {
  statusLoaded: pm2StatusLoaded,
  status: pm2Status,
  processes: pm2Processes,
  loading,
  enableLoading,
  currentProcess,
  diagnosing,
  fixing,
  diagnosisResult,
  stats: pm2Stats
} = storeToRefs(pm2Store)

// 本地对话框状态
const configDialogVisible = ref(false)
const logDialogVisible = ref(false)
const diagnosisDialogVisible = ref(false)
const autoRefresh = ref(false)

// ===== 事件处理 =====
const handleQuickEnable = async () => {
  try {
    const result = await pm2Store.enablePM2()
    ElMessageBox.alert(
      `<div style="text-align: left; line-height: 1.6;">
        <p><strong>配置文件已更新</strong></p>
        <p style="font-size: 13px; color: #606266;">路径: ${result.envPath}</p>
        <h4 style="margin: 16px 0 8px; color: #e6a23c;">需要手动重启后端</h4>
        <ol style="padding-left: 24px; font-size: 13px;">
          <li>找到运行后端的终端窗口</li>
          <li>按 <code>Ctrl+C</code> 停止服务</li>
          <li>运行 <code>npm run dev</code> 重启</li>
          <li>回到此页面点击刷新验证</li>
        </ol>
      </div>`,
      '下一步操作',
      { dangerouslyUseHTMLString: true, confirmButtonText: '我知道了' }
    )
  } catch {}
}

const showPM2ManualGuide = () => {
  ElMessageBox.alert(
    `<div style="text-align: left; line-height: 1.6;">
      <h4>步骤 1: 配置环境变量</h4>
      <ol style="padding-left: 24px; font-size: 13px;">
        <li>找到 <code>detection-api</code> 目录</li>
        <li>创建或编辑 <code>.env</code> 文件</li>
        <li>添加: <code>PM2_ENABLED=1</code></li>
      </ol>
      <h4 style="margin-top: 16px;">步骤 2: 重启后端服务</h4>
      <ol style="padding-left: 24px; font-size: 13px;">
        <li>按 <code>Ctrl+C</code> 停止服务</li>
        <li>运行 <code>npm run dev</code></li>
      </ol>
    </div>`,
    'PM2功能启用指南',
    { dangerouslyUseHTMLString: true, confirmButtonText: '我知道了' }
  )
}

// 对话框操作
const showProcessConfig = (process: PM2Process) => {
  pm2Store.setCurrentProcess(process)
  configDialogVisible.value = true
}

const showLogs = (process: PM2Process) => {
  pm2Store.setCurrentProcess(process)
  logDialogVisible.value = true
}

const startAutoDiagnosis = async (process: PM2Process) => {
  await pm2Store.diagnoseProcess(process)
  diagnosisDialogVisible.value = true
  logDialogVisible.value = false
}

const startAutoFix = async () => {
  await pm2Store.autoFixIssues()
}

// ===== 自动刷新 =====
let refreshInterval: ReturnType<typeof setInterval> | null = null

watch(autoRefresh, (enabled) => {
  if (enabled) {
    refreshInterval = setInterval(() => pm2Store.refreshProcesses(), 5000)
  } else if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
})

// ===== 生命周期 =====
onMounted(async () => {
  await pm2Store.initialize()
  
  // WebSocket 实时更新
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsManager.on('message', (data: any) => {
      if (data?.type === 'pm2_event') {
        const evt = data.payload?.event
        if (['online', 'stop', 'exit', 'restart', 'start', 'stopped', 'errored'].includes(evt)) {
          pm2Store.refreshProcesses()
        }
      }
    })
    wsManager.connect(`${protocol}//${window.location.host}/ws`)
  } catch (e) {
    console.warn('WebSocket 初始化失败', e)
  }
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  wsManager.removeAllListeners('message')
})
</script>

<style scoped>
.pm2-management {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}

.page-subtitle {
  margin-top: 4px;
  font-size: 14px;
  color: #909399;
}
</style>
