<template>
  <el-dialog
    v-model="dialogVisible"
    :title="app?.name || '应用详情'"
    width="600px"
    @close="handleClose"
    append-to-body
    destroy-on-close
  >
    <div v-if="app" class="app-detail">
      <!-- 应用头部信息 -->
      <div class="app-header">
        <div class="app-icon-large" :style="{ backgroundColor: app.color || '#3498db' }">
          {{ app.icon || '🌐' }}
        </div>
        <div class="app-info">
          <h2 class="app-title">{{ app.name }}</h2>
          <p class="app-description">{{ app.description || '暂无描述' }}</p>
          <div class="app-status" :class="statusClass">
            <span class="status-dot"></span>
            <span class="status-text">{{ statusText }}</span>
          </div>
        </div>
      </div>

      <!-- 应用详细信息 -->
      <div class="app-details">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="技术栈">
            <el-tag type="info">{{ app.techStack }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <div class="status-with-mode">
              <el-tag :type="app.isRunning ? 'success' : 'danger'">
                {{ app.isRunning ? '运行中' : '离线' }}
              </el-tag>
              <!-- 🎯 运行模式标签 -->
              <el-tag
                v-if="app.isRunning && app.deploymentMode && app.deploymentMode !== 'unknown'"
                :type="deploymentModeType"
                size="small"
                effect="light"
                style="margin-left: 8px;"
              >
                {{ deploymentModeText }}
              </el-tag>
            </div>
          </el-descriptions-item>
          <!-- 🔍 调试信息：显示端口配置 -->
          <el-descriptions-item label="端口配置" v-if="app.backend_port || app.frontend_port">
            <div style="font-size: 12px; color: #909399;">
              <div v-if="app.frontend_port">前端: {{ app.frontend_port }}</div>
              <div v-if="app.backend_port">后端: {{ app.backend_port }}</div>
              <div v-if="app.deploymentMode">模式: {{ app.deploymentMode }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="端口" v-if="getAllPorts(app).length > 0">
            <div class="ports-display">
              <template v-if="getAllPorts(app).length <= 1">
                <el-tag>{{ formatPortsDisplay(app) }}</el-tag>
              </template>
              <template v-else>
                <el-tag
                  v-for="port in getAllPorts(app)"
                  :key="port.port"
                  size="small"
                  :type="getPortTagType(port.type)"
                  class="port-tag"
                >
                  <span class="port-icon">{{ getPortTypeIcon(port.type) }}</span>
                  <span class="port-label">{{ getPortTypeLabel(port.type) }}</span>
                  <span class="port-number">{{ port.port }}</span>
                </el-tag>
              </template>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="运行时间" v-if="app.uptime">
            {{ formatUptime(app.uptime) }}
          </el-descriptions-item>
          <el-descriptions-item label="访问地址" v-if="app.accessUrl">
            <el-link :href="fullAccessUrl" target="_blank" type="primary">
              {{ fullAccessUrl }}
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="最后更新" v-if="app.lastUpdated">
            {{ formatTime(app.lastUpdated) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 快速操作 -->
      <div class="quick-actions">
        <h3>快速操作</h3>
        <div class="action-grid">
          <el-button
            v-if="app.isRunning"
            type="primary"
            size="large"
            @click="handleAccess"
            :icon="Link"
          >
            打开应用
          </el-button>
          
          <el-button
            size="large"
            @click="copyUrl"
            :icon="DocumentCopy"
          >
            复制链接
          </el-button>
        </div>
      </div>


    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button
          v-if="app?.isRunning"
          type="primary"
          @click="handleAccess"
          :icon="Link"
        >
          访问应用
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Link,
  DocumentCopy
} from '@element-plus/icons-vue'
import type { App } from '@/types/app'
import { getAppAccessUrl, getAllPorts, formatPortsDisplay } from '@/types/app'
import { generateAppAccessUrl } from '@/utils/networkUtils'

const props = defineProps<{
  visible: boolean
  app?: App | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  access: [app: App]
}>()



// 计算属性
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const statusClass = computed(() => {
  if (!props.app) return ''
  if (props.app.isRunning) return 'status-online'
  if (props.app.status === 'error') return 'status-error'
  return 'status-offline'
})

const statusText = computed(() => {
  if (!props.app) return ''
  if (props.app.isRunning) return '运行中'
  if (props.app.status === 'error') return '错误'
  if (props.app.status === 'maintenance') return '维护中'
  return '离线'
})

// 🎯 运行模式显示
const deploymentModeType = computed(() => {
  if (!props.app?.deploymentMode) return ''
  
  switch (props.app.deploymentMode) {
    case 'production':
      return 'primary' // 蓝色
    case 'development':
      return 'warning' // 橙色
    default:
      return 'info' // 灰色
  }
})

const deploymentModeText = computed(() => {
  if (!props.app?.deploymentMode) return ''
  
  switch (props.app.deploymentMode) {
    case 'production':
      return '生产(PM2)'
    case 'development':
      return '开发(DEV)'
    default:
      return '未知'
  }
})

const fullAccessUrl = computed(() => {
  if (!props.app) return ''
  
  // 🎯 直接根据 deploymentMode 动态选择端口
  const app = props.app
  let targetPort: number | null = null
  
  // 🔍 调试：打印应用完整信息
  console.log('📊 应用详情数据:', {
    name: app.name,
    deploymentMode: app.deploymentMode,
    frontend_port: app.frontend_port,
    backend_port: app.backend_port,
    isRunning: app.isRunning,
    accessUrl: app.accessUrl,
    isFullStack: app.isFullStack
  })
  
  // 1️⃣ 全栈应用：根据部署模式选择端口
  if (app.backend_port && app.frontend_port) {
    // 有前后端端口，说明是全栈应用
    if (app.deploymentMode === 'production') {
      // 生产模式 → 后端端口
      targetPort = app.backend_port
      console.log('✅ 选择生产模式端口:', targetPort)
    } else if (app.deploymentMode === 'development') {
      // 开发模式 → 前端端口
      targetPort = app.frontend_port
      console.log('✅ 选择开发模式端口:', targetPort)
    } else if (app.isRunning) {
      // 运行中但模式未知 → 优先使用前端端口（通常是用户访问的）
      targetPort = app.frontend_port
      console.log('⚠️ 模式未知，默认使用前端端口:', targetPort)
    }
  } else {
    console.log('❌ 端口信息不完整:', {
      has_backend: !!app.backend_port,
      has_frontend: !!app.frontend_port
    })
  }
  
  // 2️⃣ 如果成功选择了端口，生成URL - 🌐 支持局域网访问
  if (targetPort) {
    // ✅ 使用动态URL生成，自动适配本地/局域网访问
    const url = generateAppAccessUrl(targetPort, {
      fallbackToLocalhost: true,
      validateUrl: true
    })
    console.log('🎯 最终访问URL:', url)
    return url
  }
  
  // 3️⃣ 降级：使用后端返回的 accessUrl
  const fallbackUrl = getAppAccessUrl(app) || ''
  console.log('⚠️ 使用降级URL:', fallbackUrl)
  return fallbackUrl
})

// 方法
const handleClose = () => {
  emit('update:visible', false)
}

const handleAccess = () => {
  if (props.app) {
    emit('access', props.app)
    handleClose()
  }
}

const copyUrl = async () => {
  if (!props.app) return
  
  // 使用统一的URL获取逻辑
  const url = fullAccessUrl.value
  if (!url) {
    ElMessage.warning('暂无可用链接')
    return
  }
  
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('链接已复制到剪贴板')
  } catch (error) {
    // 降级方案
    const textarea = document.createElement('textarea')
    textarea.value = url
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    ElMessage.success('链接已复制到剪贴板')
  }
}



const formatUptime = (uptime: number) => {
  const seconds = Math.floor(uptime / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}天 ${hours % 24}小时`
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`
  return `${seconds}秒`
}

const formatTime = (timeString: string) => {
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN')
}

// 获取端口类型图标
const getPortTypeIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    frontend: '🌐',
    backend: '⚙️',
    api: '🔌',
    websocket: '📡',
    database: '🗄️'
  }
  return iconMap[type] || '🔗'
}

// 获取端口类型标签
const getPortTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WS',
    database: '数据库'
  }
  return labelMap[type] || type
}

// 获取端口标签类型
const getPortTagType = (type: string): string => {
  const typeMap: Record<string, string> = {
    frontend: 'primary',
    backend: 'success',
    api: 'warning',
    websocket: 'info',
    database: 'danger'
  }
  return typeMap[type] || ''
}


</script>

<style scoped>
.app-detail {
  padding: 8px 0;
}

.app-header {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
}

.app-icon-large {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.app-info {
  flex: 1;
}

.app-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}

.app-description {
  margin: 0 0 12px 0;
  color: #7f8c8d;
  font-size: 14px;
  line-height: 1.5;
}

.app-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.app-status.status-online {
  background: #d4edda;
  color: #155724;
}

.app-status.status-offline {
  background: #f8d7da;
  color: #721c24;
}

.app-status.status-error {
  background: #f8d7da;
  color: #721c24;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

.app-details {
  margin-bottom: 24px;
}

/* 🎯 状态与运行模式容器 */
.status-with-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ports-display {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.port-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.port-icon {
  font-size: 12px;
}

.port-label {
  font-weight: 500;
}

.port-number {
  font-weight: 600;
}

.quick-actions {
  margin-bottom: 24px;
}

.quick-actions h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}



.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    text-align: center;
    align-items: center;
  }
  
  .action-grid {
    grid-template-columns: 1fr;
  }
}
</style>