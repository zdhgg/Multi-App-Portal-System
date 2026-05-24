<template>
  <div class="app-card" :class="[statusClass, { 'app-offline': !app.isRunning }]" :style="cardStyle">
    <div class="card-header">
      <div class="app-identity">
        <div class="app-icon-shell">
          <img v-if="isValidUrl(app.icon)" :src="app.icon" class="app-custom-icon" />
          <div v-else class="app-icon" :style="cardStyle">
            <el-icon v-if="getResolvedIcon(app.icon)" :size="28">
              <component :is="getResolvedIcon(app.icon)" />
            </el-icon>
            <span v-else-if="app.icon" class="icon-emoji">{{ app.icon }}</span>
            <el-icon v-else :size="28">
              <component :is="getTechStackElIcon(app.techStack)" />
            </el-icon>
          </div>
        </div>

        <div class="app-headline">
          <span class="tech-stack-pill" :title="techStackInfo.displayName">
            <el-icon class="tech-stack-icon"><component :is="getTechStackElIcon(app.techStack)" /></el-icon>
            {{ techStackInfo.displayName }}
          </span>
          <h3 class="app-name" :title="app.name">{{ app.name }}</h3>
        </div>
      </div>

      <div class="header-badges">
        <div class="app-status" :class="statusClass">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <p v-if="descriptionText" class="app-description" :title="descriptionText">{{ descriptionText }}</p>

    <div class="meta-grid">
      <div class="meta-panel meta-panel-wide">
        <span class="meta-label">访问端口</span>
        <div class="port-list">
          <span
            v-for="port in portItems"
            :key="`${app.id}-${port.type}-${port.port}`"
            class="port-chip"
            :class="`port-${port.type}`"
          >
            <el-icon class="port-icon"><component :is="getPortIcon(port.type)" /></el-icon>
            <span class="port-number">{{ port.port }}</span>
          </span>
          <span v-if="portItems.length === 0" class="meta-value">N/A</span>
        </div>
      </div>

      <div v-if="showDeploymentMode" class="meta-panel">
        <span class="meta-label">运行模式</span>
        <span class="meta-value meta-value-inline">
          <el-icon class="mode-icon" :class="deploymentModeClass">
            <component :is="app.deploymentMode === 'production' ? Promotion : SetUp" />
          </el-icon>
          {{ deploymentModeText }}
        </span>
      </div>

      <div class="meta-panel">
        <span class="meta-label">运行时间</span>
        <span class="meta-value">{{ uptimeText }}</span>
      </div>
    </div>

    <div class="card-footer">
      <div class="action-buttons">
        <el-button
          @click="handlePrimaryAction"
          class="access-button"
          :type="app.isRunning ? 'primary' : 'default'"
          :icon="app.isRunning ? Link : InfoFilled"
        >
          {{ app.isRunning ? '打开应用' : '查看详情' }}
        </el-button>

        <template v-if="app.isRunning">
          <el-dropdown @command="handleAction" trigger="click">
            <el-button class="more-button" :icon="More" circle />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="refresh" :icon="Refresh" :disabled="refreshLocked">
                  刷新状态
                </el-dropdown-item>
                <el-dropdown-item command="details" :icon="InfoFilled">
                  查看详情
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <el-button
          v-else
          class="refresh-button"
          :icon="Refresh"
          :loading="refreshing"
          :disabled="refreshLocked"
          @click="handleRefresh"
        >
          {{ refreshButtonText }}
        </el-button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Link,
  More,
  Refresh,
  InfoFilled,
  Monitor,
  Cpu,
  Coin,
  Box,
  ChromeFilled,
  DataBoard,
  Promotion,
  SetUp,
  Platform
} from '@element-plus/icons-vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import type { App, AppPort } from '@/types/app'
import { getAllPorts } from '@/types/app'
import { getTechStackInfo } from '@/utils/techStackUtils'

const props = withDefaults(defineProps<{
  app: App
  refreshing?: boolean
  refreshCoolingDown?: boolean
}>(), {
  refreshing: false,
  refreshCoolingDown: false
})

const emit = defineEmits<{
  access: [app: App]
  refresh: [app: App]
  details: [app: App]
}>()

/**
 * 现代炫彩色板：每组包含起始和结束渐变色，保证通透且富有元气
 */
const COLOR_PALETTES = [
  { start: '#38bdf8', end: '#0284c7' }, // 亮蓝 (Sky)
  { start: '#818cf8', end: '#4f46e5' }, // 靛蓝 (Indigo)
  { start: '#c084fc', end: '#9333ea' }, // 亮紫 (Purple)
  { start: '#fb7185', end: '#e11d48' }, // 蔷薇 (Rose)
  { start: '#fb923c', end: '#ea580c' }, // 鲜橙 (Orange)
  { start: '#34d399', end: '#059669' }, // 翡翠 (Emerald)
  { start: '#2dd4bf', end: '#0d9488' }, // 蓝绿 (Teal)
  { start: '#fbbf24', end: '#d97706' }  // 琥珀 (Amber)
]

/**
 * 简单的哈希函数：将应用名称转换为固定的色板索引
 */
const getHashIndex = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % COLOR_PALETTES.length
}

const techStackInfo = computed(() => getTechStackInfo(props.app.techStack))
const portItems = computed(() => getAllPorts(props.app))

const getTechStackElIcon = (techStack?: string) => {
  const ts = (techStack || '').toLowerCase()
  if (ts.includes('vue') || ts.includes('react') || ts.includes('angular') || ts.includes('vite') || ts.includes('html') || ts.includes('nuxt') || ts.includes('next')) return ChromeFilled
  if (ts.includes('node') || ts.includes('express')) return DataBoard
  if (ts.includes('full')) return Box
  return Platform
}

const getResolvedIcon = (iconStr?: string) => {
  if (!iconStr) return null
  return (ElementPlusIconsVue as any)[iconStr] || null
}

const isValidUrl = (url?: string) => {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:image')
}

const getPortIcon = (type: string) => {
  if (type === 'frontend') return Monitor
  if (type === 'backend') return Cpu
  if (type === 'database') return Coin
  return Link
}

// 为占位头像分配特定的色板主题
const appTheme = computed(() => {
  const palette = COLOR_PALETTES[getHashIndex(props.app.name)]
  return { accent: palette.start, accentEnd: palette.end }
})

const cardStyle = computed(() => {
  const baseAccent = props.app.color || techStackInfo.value.color || '#3b82f6'
  return {
    '--app-accent': props.app.isRunning ? baseAccent : '#94a3b8',
    '--app-accent-end': appTheme.value.accentEnd
  }
})

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

const deploymentModeClass = computed(() => {
  switch (props.app.deploymentMode) {
    case 'production':
      return 'mode-production'
    case 'development':
      return 'mode-development'
    default:
      return 'mode-unknown'
  }
})

const deploymentModeText = computed(() => {
  switch (props.app.deploymentMode) {
    case 'production':
      return 'PM2 生产'
    case 'development':
      return 'DEV 开发'
    default:
      return ''
  }
})

const showDeploymentMode = computed(() => deploymentModeText.value.length > 0)

const descriptionText = computed(() => {
  return props.app.description?.trim() || ''
})

const uptimeText = computed(() => {
  if (!props.app.isRunning) return '尚未启动'
  if (typeof props.app.uptime === 'number' && props.app.uptime >= 0) {
    return formatUptime(props.app.uptime)
  }
  return '同步中'
})

const handleAccess = () => {
  if (!props.app.isRunning) {
    ElMessage.warning('应用当前未运行')
    return
  }

  emit('access', props.app)
}

const handlePrimaryAction = () => {
  if (props.app.isRunning) {
    handleAccess()
    return
  }

  emit('details', props.app)
}

const refreshLocked = computed(() => props.refreshing || props.refreshCoolingDown)

const refreshButtonText = computed(() => {
  if (props.refreshing) return '刷新中'
  if (props.refreshCoolingDown) return '稍后刷新'
  return '刷新'
})

const handleRefresh = () => {
  if (refreshLocked.value) return
  emit('refresh', props.app)
}

const handleAction = (command: string) => {
  switch (command) {
    case 'refresh':
      handleRefresh()
      break
    case 'details':
      emit('details', props.app)
      break
  }
}

const getPortShortLabel = (type: AppPort['type']) => {
  const labelMap: Record<AppPort['type'], string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WS',
    database: 'DB'
  }

  return labelMap[type] || type
}

const formatUptime = (uptime: number) => {
  const seconds = Math.floor(Math.max(uptime, 0) / 1000)
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
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  animation: cardEnter 0.45s ease both;
}

/* 在线应用 */
.app-card:not(.app-offline) {
  border-top: 3px solid var(--app-accent);
}

.app-card:not(.app-offline):hover {
  transform: translateY(-4px);
  border-color: #cbd5e1;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.app-card:nth-child(2n) {
  animation-delay: 0.04s;
}

.app-card:nth-child(3n) {
  animation-delay: 0.08s;
}

/* 离线应用 */
.app-offline {
  background: #f9fafb;
  border-color: #e5e7eb;
  opacity: 0.85;
}

.app-offline:hover {
  transform: translateY(-2px);
  opacity: 1;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  border-color: #cbd5e1;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.app-identity {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.app-icon-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--app-accent);
  color: white;
  font-size: 24px;
  transition: transform 0.3s ease;
}

.icon-emoji {
  font-size: 24px;
  font-family: var(--font-number);
  line-height: 1;
}

.app-custom-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
  transition: all 0.3s ease;
}

.app-offline .app-custom-icon {
  filter: grayscale(100%);
  opacity: 0.7;
}

.app-icon.is-letter {
  font-family: var(--font-number);
  font-weight: 800;
}

.app-headline {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tech-stack-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: #eff6ff; /* light blue */
  color: #3b82f6; /* blue */
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.3s ease;
}

.app-offline .tech-stack-pill {
  background: #f1f5f9;
  color: #64748b;
}

.tech-stack-icon {
  font-size: 13px;
}

.app-name {
  margin-top: 8px;
  min-height: calc(1.25em * 2);
  color: #1e293b;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.header-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.app-status,
.mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

.app-status.status-online {
  color: var(--success-500);
  background: var(--success-50);
}

.app-status.status-offline {
  color: var(--info-500);
  background: var(--info-50);
}

.app-status.status-error {
  color: var(--danger-500);
  background: var(--danger-50);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2.4s ease-in-out infinite;
}

.mode-production {
  color: var(--primary-600);
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.14);
}

.mode-development {
  color: var(--warning-500);
  background: var(--warning-50);
  border-color: rgba(217, 119, 6, 0.12);
}

.mode-unknown {
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.16);
}

.app-description {
  min-height: 40px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.meta-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
  border-radius: 0;
  background: transparent;
  border: none;
}

.meta-panel-wide {
  grid-column: 1 / -1;
}

.meta-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8; /* 使用固定颜色保证极浅的辅助感 */
}

.meta-value {
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 600;
}

.port-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.port-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #f1f5f9;
}

.port-icon {
  font-size: 14px;
  margin-right: 2px;
  display: flex;
}

.mode-icon {
  margin-right: 4px;
  font-size: 14px;
  display: flex;
}

.tech-stack-icon {
  margin-right: 4px;
  font-size: 14px;
  display: flex;
}

.meta-value-inline {
  display: inline-flex;
  align-items: center;
}

.port-number {
  font-family: var(--font-number);
  color: #1e293b;
}

.port-frontend {
  background: rgba(5, 150, 105, 0.08);
}

.port-backend {
  background: rgba(37, 99, 235, 0.08);
}

.port-api {
  background: rgba(217, 119, 6, 0.08);
}

.port-websocket {
  background: rgba(14, 165, 233, 0.08);
}

.port-database {
  background: rgba(100, 116, 139, 0.08);
}

.card-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.access-button {
  flex: 1;
  min-height: 36px;
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.access-button:not(.el-button--primary) {
  background: white;
  border-color: #e5e7eb;
  color: #475569;
}

.access-button:not(.el-button--primary):hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.more-button {
  min-width: 36px;
  min-height: 36px;
  border-color: #e5e7eb;
  color: #475569;
}

.refresh-button {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 6px;
  border-color: #e5e7eb;
  background: white;
  color: #475569;
  font-weight: 600;
  white-space: nowrap;
}

.refresh-button:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-strong);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@keyframes cardEnter {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 768px) {
  .app-card {
    min-height: 0;
    padding: 20px 18px;
  }

  .card-header {
    flex-direction: column;
  }

  .header-badges {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }

  .app-name {
    font-size: 24px;
  }
}

@media (max-width: 480px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .meta-panel-wide {
    grid-column: auto;
  }

  .action-buttons {
    gap: 10px;
  }
}
</style>
