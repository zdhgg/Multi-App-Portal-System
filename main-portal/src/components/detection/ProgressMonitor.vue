<template>
  <div class="progress-monitor">
    <!-- 主进度显示 -->
    <div class="progress-header">
      <div class="progress-title">
        <el-icon :class="{ rotating: isScanning }">
          <component :is="statusIcon" />
        </el-icon>
        <span>{{ currentPhase }}</span>
        <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
      </div>
      
      <div class="progress-controls">
        <el-button 
          v-if="isScanning" 
          size="small" 
          type="warning" 
          @click="pauseScan"
          :loading="pausing"
        >
          <el-icon><VideoPause /></el-icon>
          暂停
        </el-button>
        
        <el-button 
          v-if="isScanning" 
          size="small" 
          type="danger" 
          @click="cancelScan"
          :loading="cancelling"
        >
          <el-icon><Close /></el-icon>
          取消
        </el-button>
        
        <el-button 
          v-if="!isScanning && hasResults" 
          size="small" 
          type="primary" 
          @click="exportResults"
        >
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>

    <!-- 总体进度条 -->
    <div class="overall-progress">
      <el-progress 
        :percentage="overallProgress" 
        :status="progressStatus"
        :stroke-width="8"
        :show-text="false"
      />
      
      <div class="progress-info">
        <span class="progress-text">{{ progressText }}</span>
        <span class="progress-percentage">{{ overallProgress }}%</span>
      </div>
    </div>

    <!-- 详细进度阶段 -->
    <div class="phase-progress">
      <el-steps :active="currentStepIndex" :align-center="false">
        <el-step
          v-for="(step, index) in steps"
          :key="index"
          :title="step.title"
          :description="step.description"
          :status="getStepStatus(index)"
          :icon="step.icon"
        >
          <template #description>
            <div class="step-description">
              {{ step.description }}
              <div v-if="step.details" class="step-details">
                {{ step.details }}
              </div>
              <el-progress 
                v-if="index === currentStepIndex && step.progress > 0"
                :percentage="step.progress"
                :stroke-width="4"
                :show-text="false"
                class="step-progress"
              />
            </div>
          </template>
        </el-step>
      </el-steps>
    </div>

    <!-- 实时统计 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-statistic 
          title="已扫描文件" 
          :value="stats.scannedFiles"
          :value-style="{ color: '#409EFF' }"
        >
          <template #suffix>
            <span class="stats-suffix">/ {{ stats.totalFiles }}</span>
          </template>
        </el-statistic>
      </el-col>
      
      <el-col :span="6">
        <el-statistic 
          title="发现应用" 
          :value="stats.foundApps"
          :value-style="{ color: '#67C23A' }"
        />
      </el-col>
      
      <el-col :span="6">
        <el-statistic 
          title="处理速度" 
          :value="stats.processingSpeed"
          :value-style="{ color: '#E6A23C' }"
        >
          <template #suffix>
            <span class="stats-suffix">文件/秒</span>
          </template>
        </el-statistic>
      </el-col>
      
      <el-col :span="6">
        <el-statistic 
          title="预计剩余" 
          :value="stats.estimatedTimeLeft"
          :value-style="{ color: '#909399' }"
        >
          <template #suffix>
            <span class="stats-suffix">秒</span>
          </template>
        </el-statistic>
      </el-col>
    </el-row>

    <!-- 当前处理信息 -->
    <div class="current-processing" v-if="currentFile">
      <div class="current-file">
        <el-icon><Document /></el-icon>
        <span class="file-path">{{ currentFile }}</span>
        <el-tag size="small" type="info">{{ currentOperation }}</el-tag>
      </div>
    </div>

    <!-- 实时日志 -->
    <div class="log-section" v-if="showLogs">
      <div class="log-header">
        <span>实时日志</span>
        <div class="log-controls">
          <el-switch 
            v-model="autoScroll" 
            size="small"
            active-text="自动滚动"
          />
          <el-button size="small" @click="clearLogs">
            <el-icon><Delete /></el-icon>
            清空
          </el-button>
          <el-button size="small" @click="exportLogs">
            <el-icon><Download /></el-icon>
            导出日志
          </el-button>
        </div>
      </div>
      
      <div 
        ref="logContainer" 
        class="log-container"
        :class="{ 'auto-scroll': autoScroll }"
      >
        <div 
          v-for="(log, index) in logs" 
          :key="index"
          :class="['log-entry', `log-${log.level}`]"
        >
          <span class="log-timestamp">{{ formatTime(log.timestamp) }}</span>
          <span class="log-level">{{ log.level.toUpperCase() }}</span>
          <span class="log-message">{{ log.message }}</span>
          <el-tag v-if="log.details" size="small" class="log-details">
            {{ log.details }}
          </el-tag>
        </div>
      </div>
    </div>

    <!-- 发现的应用预览 -->
    <div class="discovered-apps" v-if="discoveredApps.length > 0">
      <div class="apps-header">
        <span>发现的应用 ({{ discoveredApps.length }})</span>
        <el-button size="small" @click="previewAll">
          <el-icon><View /></el-icon>
          预览全部
        </el-button>
      </div>
      
      <div class="apps-list">
        <el-card 
          v-for="app in recentDiscoveredApps" 
          :key="app.id"
          class="app-preview"
          shadow="hover"
        >
          <div class="app-preview-content">
            <div class="app-info">
              <h4>{{ app.name }}</h4>
              <el-tag type="success" size="small">{{ app.techStack }}</el-tag>
            </div>
            <div class="app-status">
              <el-icon :style="{ color: getStatusColor(app.status) }">
                <component :is="getStatusIcon(app.status)" />
              </el-icon>
              <span>{{ app.status }}</span>
            </div>
          </div>
          
          <div class="app-path">
            <el-icon><Folder /></el-icon>
            <span>{{ app.directory }}</span>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 错误和警告 -->
    <div class="alerts-section" v-if="alerts.length > 0">
      <div class="alerts-header">
        <span>问题报告 ({{ alerts.length }})</span>
        <el-button size="small" @click="clearAlerts">
          <el-icon><Delete /></el-icon>
          清空
        </el-button>
      </div>
      
      <div class="alerts-list">
        <el-alert
          v-for="alert in alerts"
          :key="alert.id"
          :type="alert.type"
          :title="alert.title"
          :description="alert.message"
          :closable="true"
          @close="removeAlert(alert.id)"
          show-icon
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search,
  SuccessFilled,
  Warning,
  CircleClose,
  Loading,
  VideoPause,
  Close,
  Download,
  Document,
  Delete,
  View,
  Folder
} from '@element-plus/icons-vue'

export interface ProgressStep {
  title: string
  description: string
  details?: string
  progress: number
  icon?: string
  status: 'wait' | 'process' | 'finish' | 'error'
}

export interface ScanStats {
  scannedFiles: number
  totalFiles: number
  foundApps: number
  processingSpeed: number
  estimatedTimeLeft: number
}

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  details?: string
}

export interface DiscoveredApp {
  id: string
  name: string
  techStack: string
  directory: string
  status: 'valid' | 'warning' | 'error'
  confidence: number
}

export interface Alert {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message: string
  timestamp: Date
}

const props = defineProps<{
  isScanning: boolean
  scanId?: string
  showLogs?: boolean
}>()

const emit = defineEmits<{
  'pause': []
  'cancel': []
  'export-results': []
  'export-logs': []
  'preview-apps': [apps: DiscoveredApp[]]
}>()

// 响应式数据
const pausing = ref(false)
const cancelling = ref(false)
const autoScroll = ref(true)
const logContainer = ref<HTMLElement>()

const currentPhase = ref('准备扫描')
const overallProgress = ref(0)
const currentStepIndex = ref(0)
const currentFile = ref('')
const currentOperation = ref('')

const stats = ref<ScanStats>({
  scannedFiles: 0,
  totalFiles: 0,
  foundApps: 0,
  processingSpeed: 0,
  estimatedTimeLeft: 0
})

const steps = ref<ProgressStep[]>([
  {
    title: '初始化',
    description: '准备扫描环境',
    progress: 0,
    icon: 'Setting',
    status: 'wait'
  },
  {
    title: '路径扫描',
    description: '扫描文件系统',
    progress: 0,
    icon: 'Search',
    status: 'wait'
  },
  {
    title: '文件分析',
    description: '分析项目文件',
    progress: 0,
    icon: 'Document',
    status: 'wait'
  },
  {
    title: '技术栈检测',
    description: '识别技术栈',
    progress: 0,
    icon: 'Cpu',
    status: 'wait'
  },
  {
    title: '端口分配',
    description: '智能端口分配',
    progress: 0,
    icon: 'Connection',
    status: 'wait'
  },
  {
    title: '完成',
    description: '扫描完成',
    progress: 0,
    icon: 'Check',
    status: 'wait'
  }
])

const logs = ref<LogEntry[]>([])
const discoveredApps = ref<DiscoveredApp[]>([])
const alerts = ref<Alert[]>([])

// 计算属性
const statusIcon = computed(() => {
  if (cancelling.value) return CircleClose
  if (pausing.value) return VideoPause
  if (!props.isScanning) return overallProgress.value === 100 ? SuccessFilled : Search
  return Loading
})

const statusType = computed(() => {
  if (cancelling.value) return 'danger'
  if (pausing.value) return 'warning'
  if (!props.isScanning) return overallProgress.value === 100 ? 'success' : 'info'
  return 'primary'
})

const statusText = computed(() => {
  if (cancelling.value) return '取消中'
  if (pausing.value) return '暂停中'
  if (!props.isScanning) return overallProgress.value === 100 ? '已完成' : '就绪'
  return '扫描中'
})

const progressStatus = computed(() => {
  if (overallProgress.value === 100) return 'success'
  if (alerts.value.some(a => a.type === 'error')) return 'exception'
  return undefined
})

const progressText = computed(() => {
  if (overallProgress.value === 0) return '准备开始扫描'
  if (overallProgress.value === 100) return '扫描完成'
  return `${currentPhase.value} - ${stats.value.scannedFiles}/${stats.value.totalFiles} 文件`
})

const hasResults = computed(() => {
  return discoveredApps.value.length > 0 || overallProgress.value === 100
})

const recentDiscoveredApps = computed(() => {
  return discoveredApps.value.slice(-3)
})

// 方法
const getStepStatus = (index: number) => {
  const step = steps.value[index]
  if (step.status !== 'wait') return step.status
  
  if (index < currentStepIndex.value) return 'finish'
  if (index === currentStepIndex.value) return 'process'
  return 'wait'
}

const getStatusColor = (status: DiscoveredApp['status']) => {
  const colors = {
    valid: '#67C23A',
    warning: '#E6A23C',
    error: '#F56C6C'
  }
  return colors[status]
}

const getStatusIcon = (status: DiscoveredApp['status']) => {
  const icons = {
    valid: SuccessFilled,
    warning: Warning,
    error: CircleClose
  }
  return icons[status]
}

const pauseScan = async () => {
  pausing.value = true
  try {
    // 调用暂停API
    await new Promise(resolve => setTimeout(resolve, 1000))
    emit('pause')
    ElMessage.success('扫描已暂停')
  } catch (error) {
    ElMessage.error('暂停失败')
  } finally {
    pausing.value = false
  }
}

const cancelScan = async () => {
  cancelling.value = true
  try {
    // 调用取消API
    await new Promise(resolve => setTimeout(resolve, 1000))
    emit('cancel')
    ElMessage.warning('扫描已取消')
    resetProgress()
  } catch (error) {
    ElMessage.error('取消失败')
  } finally {
    cancelling.value = false
  }
}

const exportResults = () => {
  emit('export-results')
}

const exportLogs = () => {
  emit('export-logs')
}

const clearLogs = () => {
  logs.value = []
  addLog('info', '日志已清空')
}

const clearAlerts = () => {
  alerts.value = []
}

const removeAlert = (id: string) => {
  const index = alerts.value.findIndex(a => a.id === id)
  if (index > -1) {
    alerts.value.splice(index, 1)
  }
}

const previewAll = () => {
  emit('preview-apps', discoveredApps.value)
}

const formatTime = (timestamp: Date): string => {
  return timestamp.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const addLog = (level: LogEntry['level'], message: string, details?: string) => {
  logs.value.push({
    timestamp: new Date(),
    level,
    message,
    details
  })
  
  // 限制日志数量
  if (logs.value.length > 1000) {
    logs.value = logs.value.slice(-500)
  }
  
  // 自动滚动
  if (autoScroll.value) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    })
  }
}

const addDiscoveredApp = (app: DiscoveredApp) => {
  discoveredApps.value.push(app)
  addLog('info', `发现应用: ${app.name}`, `技术栈: ${app.techStack}`)
}

const addAlert = (type: Alert['type'], title: string, message: string) => {
  const alert: Alert = {
    id: Date.now().toString(),
    type,
    title,
    message,
    timestamp: new Date()
  }
  
  alerts.value.unshift(alert)
  
  // 限制警告数量
  if (alerts.value.length > 50) {
    alerts.value = alerts.value.slice(0, 50)
  }
}

const updateProgress = (data: {
  phase?: string
  stepIndex?: number
  overallProgress?: number
  currentFile?: string
  operation?: string
  stats?: Partial<ScanStats>
  stepProgress?: number
}) => {
  if (data.phase) {
    currentPhase.value = data.phase
  }
  
  if (data.stepIndex !== undefined) {
    currentStepIndex.value = data.stepIndex
    
    // 更新步骤状态
    steps.value.forEach((step, index) => {
      if (index < data.stepIndex!) {
        step.status = 'finish'
        step.progress = 100
      } else if (index === data.stepIndex) {
        step.status = 'process'
      } else {
        step.status = 'wait'
        step.progress = 0
      }
    })
  }
  
  if (data.overallProgress !== undefined) {
    overallProgress.value = Math.min(100, Math.max(0, data.overallProgress))
  }
  
  if (data.currentFile) {
    currentFile.value = data.currentFile
  }
  
  if (data.operation) {
    currentOperation.value = data.operation
  }
  
  if (data.stats) {
    stats.value = { ...stats.value, ...data.stats }
  }
  
  if (data.stepProgress !== undefined && currentStepIndex.value < steps.value.length) {
    steps.value[currentStepIndex.value].progress = data.stepProgress
  }
}

const resetProgress = () => {
  currentPhase.value = '准备扫描'
  overallProgress.value = 0
  currentStepIndex.value = 0
  currentFile.value = ''
  currentOperation.value = ''
  
  stats.value = {
    scannedFiles: 0,
    totalFiles: 0,
    foundApps: 0,
    processingSpeed: 0,
    estimatedTimeLeft: 0
  }
  
  steps.value.forEach(step => {
    step.status = 'wait'
    step.progress = 0
  })
  
  discoveredApps.value = []
}

// 模拟进度更新
const simulateProgress = () => {
  if (!props.isScanning) return
  
  const phases = [
    '初始化扫描环境',
    '扫描文件系统',
    '分析项目结构',
    '检测技术栈',
    '分配端口',
    '生成报告'
  ]
  
  let step = 0
  let progress = 0
  
  const interval = setInterval(() => {
    if (!props.isScanning) {
      clearInterval(interval)
      return
    }
    
    progress += Math.random() * 5
    
    if (progress >= 100) {
      progress = 100
      step = phases.length - 1
      clearInterval(interval)
    } else if (progress > (step + 1) * 16.67) {
      step = Math.min(step + 1, phases.length - 1)
    }
    
    updateProgress({
      phase: phases[step],
      stepIndex: step,
      overallProgress: progress,
      currentFile: `src/components/App${Math.floor(Math.random() * 10)}.vue`,
      operation: '分析',
      stats: {
        scannedFiles: Math.floor(progress * 10),
        totalFiles: 1000,
        foundApps: Math.floor(progress / 20),
        processingSpeed: Math.floor(Math.random() * 50) + 10,
        estimatedTimeLeft: Math.floor((100 - progress) * 2)
      },
      stepProgress: Math.min(100, (progress - step * 16.67) * 6)
    })
    
    // 随机添加日志
    if (Math.random() < 0.3) {
      const messages = [
        '扫描目录: src/components',
        '检测到 React 组件',
        '分析 package.json',
        '发现端口配置',
        '验证技术栈'
      ]
      
      addLog('info', messages[Math.floor(Math.random() * messages.length)])
    }
    
    // 随机发现应用
    if (Math.random() < 0.1 && discoveredApps.value.length < 5) {
      const techStacks = ['React', 'Vue', 'Angular', 'Node.js', 'Express']
      const statuses = ['valid', 'warning', 'error']
      
      addDiscoveredApp({
        id: Date.now().toString(),
        name: `应用${discoveredApps.value.length + 1}`,
        techStack: techStacks[Math.floor(Math.random() * techStacks.length)],
        directory: `/path/to/app${discoveredApps.value.length + 1}`,
        status: statuses[Math.floor(Math.random() * statuses.length)] as any,
        confidence: Math.random()
      })
    }
  }, 500)
}

// 暴露方法给父组件
defineExpose({
  updateProgress,
  addLog,
  addDiscoveredApp,
  addAlert,
  resetProgress
})

// 监听器
watch(() => props.isScanning, (isScanning) => {
  if (isScanning) {
    addLog('info', '开始扫描应用')
    simulateProgress()
  } else {
    addLog('info', '扫描结束')
  }
})

// 生命周期
onMounted(() => {
  addLog('info', '进度监控器初始化完成')
})

onUnmounted(() => {
  // 清理定时器等
})
</script>

<style scoped>
.progress-monitor {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.progress-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-controls {
  display: flex;
  gap: 8px;
}

.overall-progress {
  margin-bottom: 24px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 14px;
  color: #606266;
}

.progress-percentage {
  font-weight: 600;
  color: #409EFF;
}

.phase-progress {
  margin-bottom: 24px;
}

.step-description {
  color: #909399;
  font-size: 12px;
}

.step-details {
  margin-top: 4px;
  font-size: 11px;
  color: #C0C4CC;
}

.step-progress {
  margin-top: 8px;
  width: 120px;
}

.stats-row {
  margin-bottom: 20px;
}

.stats-suffix {
  font-size: 12px;
  color: #909399;
}

.current-processing {
  margin-bottom: 16px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 3px solid #409EFF;
}

.current-file {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.file-path {
  font-family: monospace;
  color: #606266;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-section {
  margin-bottom: 20px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: #303133;
}

.log-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-container {
  height: 200px;
  overflow-y: auto;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid #333;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-timestamp {
  color: #888;
  min-width: 70px;
}

.log-level {
  min-width: 50px;
  font-weight: bold;
}

.log-info .log-level {
  color: #409EFF;
}

.log-warn .log-level {
  color: #E6A23C;
}

.log-error .log-level {
  color: #F56C6C;
}

.log-debug .log-level {
  color: #909399;
}

.log-message {
  color: #fff;
  flex: 1;
}

.log-details {
  margin-left: auto;
}

.discovered-apps,
.alerts-section {
  margin-bottom: 20px;
}

.apps-header,
.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: #303133;
}

.apps-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.app-preview {
  border-left: 3px solid #67C23A;
}

.app-preview-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.app-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #303133;
}

.app-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #606266;
}

.app-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
