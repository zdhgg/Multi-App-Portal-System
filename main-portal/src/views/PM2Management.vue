<template>
  <div class="pm2-management">
    <OperationPageHeader
      status-label="进程状态"
      :chips="headerChips"
      :snapshots="headerSnapshots"
    >
      <template #side>
        <PM2StatusAlert
          :status="pm2Status"
          :status-loaded="pm2StatusLoaded"
          :enable-loading="enableLoading"
          @enable="handleQuickEnable"
          @refresh="pm2Store.refreshStatus"
          @show-guide="showPM2ManualGuide"
        />
      </template>
    </OperationPageHeader>

    <!-- PM2已启用时显示的内容 -->
    <template v-if="pm2StatusLoaded && pm2Status.enabled">
      <section class="pm2-content-shell">
        <div class="content-heading">
          <div>
            <span class="content-eyebrow">Daemon Overview</span>
            <h2 class="content-title">进程监控与操作</h2>
          </div>
          <p class="content-note">查看托管进程状态，并在同一视图中完成启动、停止、重启、日志与诊断操作。</p>
        </div>

        <PM2StatsPanel v-if="pm2Stats.total > 0" :stats="pm2Stats" />

        <div class="pm2-process-shell">
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
        </div>
      </section>
    </template>

    <section v-else class="pm2-guide-shell">
      <div class="content-heading">
        <div>
          <span class="content-eyebrow">Enable PM2</span>
          <h2 class="content-title">尚未启用 PM2</h2>
        </div>
        <p class="content-note">启用后可以获得进程守护、日志管理、自动重启和统一的生产模式运维能力。</p>
      </div>
      <div class="guide-card">
        <p class="guide-description">使用右侧状态卡可以快速启用 PM2，或查看手动配置指引。完成后刷新页面即可同步最新状态。</p>
      </div>
    </section>

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
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessageBox } from 'element-plus'
import { Cpu, VideoPlay, SwitchButton, WarningFilled } from '@element-plus/icons-vue'
import { usePM2Store } from '@/stores/pm2'
import { wsManager } from '@/services/websocketApi'
import type { PM2Process } from '@/services/pm2Api'
import OperationPageHeader from '@/components/layout/OperationPageHeader.vue'

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

const pm2StatusText = computed(() => {
  if (!pm2StatusLoaded.value) return '正在检查 PM2 状态'
  if (!pm2Status.value.enabled) return 'PM2 尚未启用'
  if (pm2Status.value.pm2DaemonRunning) return 'PM2 守护进程运行中'
  return 'PM2 已启用，等待守护进程连接'
})

const pm2SummaryText = computed(() => {
  if (!pm2StatusLoaded.value) return '载入守护进程与进程清单中'
  if (!pm2Status.value.enabled) return '启用后可管理生产模式进程'
  if (pm2Stats.value.total === 0) return 'PM2 已启用，但当前还没有托管进程'
  return `当前托管 ${pm2Stats.value.total} 个进程，其中 ${pm2Stats.value.online} 个在线`
})

const headerChips = computed<Array<{ text: string; tone?: 'default' | 'muted' | 'warning' | 'success' }>>(() => [
  {
    text: pm2StatusText.value,
    tone: pm2Status.value.enabled ? 'success' : 'warning'
  },
  {
    text: autoRefresh.value ? '自动刷新已开启' : '自动刷新未开启',
    tone: autoRefresh.value ? 'warning' : 'default'
  },
  {
    text: pm2SummaryText.value,
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
    label: '总进程',
    value: pm2Stats.value.total || 0,
    icon: Cpu
  },
  {
    label: '运行中',
    value: pm2Stats.value.online || 0,
    icon: VideoPlay,
    tone: 'success'
  },
  {
    label: '已停止',
    value: pm2Stats.value.stopped || 0,
    icon: SwitchButton,
    tone: 'highlight'
  },
  {
    label: '异常',
    value: pm2Stats.value.error || 0,
    icon: WarningFilled,
    tone: pm2Stats.value.error > 0 ? 'danger' : 'warning'
  }
])

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

.pm2-content-shell,
.pm2-guide-shell {
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

.pm2-process-shell {
  margin-top: 16px;
}

.guide-card {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.guide-description {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .content-heading {
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .pm2-management {
    padding: 16px 14px;
    gap: 18px;
  }

  .pm2-content-shell,
  .pm2-guide-shell {
    padding: 18px;
    border-radius: 24px;
  }
}
</style>
