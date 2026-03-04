<template>
  <div class="app-card" :class="{ 'app-offline': !app.isRunning }">
    <div class="card-header">
      <div class="app-icon" :style="{ backgroundColor: app.color || '#3498db' }">
        {{ app.icon || '🌐' }}
      </div>
      <div class="header-badges">
        <div class="app-status" :class="statusClass">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
        </div>
        <!-- 🎯 运行模式标签 -->
        <el-tag
          v-if="app.isRunning && app.deploymentMode"
          :type="deploymentModeType"
          size="small"
          effect="light"
          class="deployment-mode-tag"
        >
          {{ deploymentModeText }}
        </el-tag>
      </div>
    </div>

    <div class="card-body">
      <h3 class="app-name">{{ app.name }}</h3>
      <p class="app-description">{{ app.description || '暂无描述' }}</p>
      
      <div class="app-meta">
        <div class="meta-item">
          <span class="meta-label">技术栈</span>
          <span class="meta-value">{{ app.techStack }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">端口</span>
          <div class="port-info">
            <template v-if="getAllPorts(app).length <= 1">
              <span class="meta-value">{{ formatPortsDisplay(app) }}</span>
            </template>
            <template v-else>
              <div class="multiple-ports">
                <el-tag
                  v-for="port in getAllPorts(app)"
                  :key="port.port"
                  size="small"
                  :color="getPortTypeColor(port.type)"
                  effect="light"
                  class="port-tag"
                >
                  <span class="port-icon">{{ getPortTypeIcon(port.type) }}</span>
                  {{ port.port }}
                </el-tag>
              </div>
            </template>
          </div>
        </div>
        <div v-if="app.uptime" class="meta-item">
          <span class="meta-label">运行时间</span>
          <span class="meta-value">{{ formatUptime(app.uptime) }}</span>
        </div>
      </div>
    </div>

    <div class="card-footer">
      <div class="action-buttons">
        <el-button
          v-if="app.isRunning"
          type="primary"
          @click="handleAccess"
          class="access-button"
          :icon="Link"
        >
          访问应用
        </el-button>
        <el-button
          v-else
          type="info"
          disabled
          class="access-button"
        >
          应用离线
        </el-button>
        
        <el-dropdown @command="handleAction" trigger="click">
          <el-button :icon="More" circle size="small" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="refresh" :icon="Refresh">
                刷新状态
              </el-dropdown-item>
              <el-dropdown-item command="details" :icon="InfoFilled">
                查看详情
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 加载覆盖层 -->
    <div v-if="loading" class="loading-overlay">
      <el-icon class="loading-icon">
        <Loading />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Link,
  More,
  Refresh,
  InfoFilled,
  Loading
} from '@element-plus/icons-vue'
import type { App } from '@/types/app'
import { getAllPorts, formatPortsDisplay, getPortTypeColor, getPortTypeIcon } from '@/types/app'

const props = defineProps<{
  app: App
}>()

const emit = defineEmits<{
  access: [app: App]
  refresh: [app: App]
  details: [app: App]
}>()

const loading = ref(false)

// 计算属性
const statusClass = computed(() => {
  if (props.app.isRunning) return 'status-online'
  if (props.app.status === 'error') return 'status-error'
  return 'status-offline'
})

const statusText = computed(() => {
  if (props.app.isRunning) return '在线'
  if (props.app.status === 'error') return '错误'
  if (props.app.status === 'maintenance') return '维护中'
  return '离线'
})

// 🎯 运行模式显示
const deploymentModeType = computed(() => {
  if (!props.app.deploymentMode) return ''
  
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
  if (!props.app.deploymentMode) return ''
  
  switch (props.app.deploymentMode) {
    case 'production':
      return '生产(PM2)'
    case 'development':
      return '开发(DEV)'
    default:
      return '未知'
  }
})

// 方法
const handleAccess = () => {
  if (!props.app.isRunning) {
    ElMessage.warning('应用当前未运行')
    return
  }
  
  emit('access', props.app)
}

const handleAction = async (command: string) => {
  switch (command) {
    case 'refresh':
      loading.value = true
      try {
        emit('refresh', props.app)
        await new Promise(resolve => setTimeout(resolve, 1000)) // 模拟加载
        ElMessage.success('状态已刷新')
      } catch (error) {
        ElMessage.error('刷新失败')
      } finally {
        loading.value = false
      }
      break
      
    case 'details':
      emit('details', props.app)
      break
  }
}

const formatUptime = (uptime: number) => {
  const seconds = Math.floor(uptime / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}天`
  if (hours > 0) return `${hours}小时`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}
</script>

<style scoped>
.app-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.app-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.app-card.app-offline {
  opacity: 0.7;
}

.app-card.app-offline:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.app-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 🎯 头部徽章容器 */
.header-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

/* 🎯 运行模式标签样式 */
.deployment-mode-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.app-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
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

.card-body {
  margin-bottom: 20px;
}

.app-name {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1.3;
}

.app-description {
  margin: 0 0 16px 0;
  color: #7f8c8d;
  font-size: 14px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-label {
  font-size: 12px;
  color: #95a5a6;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 13px;
  color: #2c3e50;
  font-weight: 500;
}

.port-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multiple-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.port-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: white !important;
  border: none;
  font-size: 11px;
}

.port-icon {
  font-size: 10px;
}

.card-footer {
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.action-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.access-button {
  flex: 1;
  border-radius: 8px;
  font-weight: 600;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}

.loading-icon {
  font-size: 24px;
  color: #3498db;
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式设计 */
@media (max-width: 480px) {
  .app-card {
    padding: 16px;
  }
  
  .app-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }
  
  .app-name {
    font-size: 18px;
  }
  
  .meta-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>