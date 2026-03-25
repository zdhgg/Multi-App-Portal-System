<template>
  <div class="app-card" :class="[statusClass, { 'app-offline': !app.isRunning }]" :style="cardStyle">
    <div class="card-accent" aria-hidden="true"></div>

    <div class="card-header">
      <div class="app-identity">
        <div class="app-icon-shell">
          <div class="app-icon" :class="{ 'is-letter': isGenericIcon }">
            {{ displayIcon }}
          </div>
        </div>

        <div class="app-headline">
          <span class="tech-stack-pill" :title="techStackInfo.displayName">
            <span class="tech-stack-icon">{{ techStackInfo.icon }}</span>
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

    <p class="app-description" :title="descriptionText">{{ descriptionText }}</p>

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
            <span class="port-type">{{ getPortShortLabel(port.type) }}</span>
            <span class="port-number">{{ port.port }}</span>
          </span>
          <span v-if="portItems.length === 0" class="meta-value">N/A</span>
        </div>
      </div>

      <div class="meta-panel">
        <span class="meta-label">运行模式</span>
        <span class="meta-value">{{ deploymentModeText || '未识别' }}</span>
      </div>

      <div class="meta-panel">
        <span class="meta-label">运行时间</span>
        <span class="meta-value">{{ app.uptime ? formatUptime(app.uptime) : '尚未启动' }}</span>
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
  InfoFilled
} from '@element-plus/icons-vue'
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

// 智能拦截判定：无论前后是否有不可见的空白字符，只要包含火箭即替换为炫彩头像
const isGenericIcon = computed(() => {
  const currentIcon = (props.app.icon || techStackInfo.value.icon || '').trim()
  return !currentIcon || currentIcon.includes('🚀') || currentIcon.includes('◆')
})

// 智能选择展示字符或图标
const displayIcon = computed(() => {
  if (isGenericIcon.value) return props.app.name.charAt(0).toUpperCase()
  return props.app.icon || techStackInfo.value.icon || '◆'
})

// 为占位头像分配特定的色板主题
const appTheme = computed(() => {
  if (isGenericIcon.value) {
    const palette = COLOR_PALETTES[getHashIndex(props.app.name)]
    return { accent: palette.start, accentEnd: palette.end }
  }
  return { 
    accent: props.app.color || techStackInfo.value.color || '#2563eb',
    accentEnd: 'rgba(37, 99, 235, 0.86)'
  }
})

const cardStyle = computed(() => ({
  '--app-accent': appTheme.value.accent,
  '--app-accent-end': appTheme.value.accentEnd
}))

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
  const description = props.app.description?.trim()
  if (description) {
    return description
  }

  if (props.app.isRunning) {
    return `${techStackInfo.value.displayName} 已接入门户，可直接打开并访问。`
  }

  return `${techStackInfo.value.displayName} 已接入门户，当前处于离线或待启动状态。`
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
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 332px;
  padding: 22px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.9));
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.35s ease, border-color 0.35s ease, filter 0.35s ease, opacity 0.35s ease;
  animation: cardEnter 0.45s ease both;
}

/* 在线应用（极高优先级的高亮光晕与起浮） */
.app-card:not(.app-offline) {
  border-color: rgba(59, 130, 246, 0.25);
  box-shadow: 
    0 24px 54px rgba(37, 99, 235, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  transform: translateY(-2px); /* 默认比离线卡片更拔高一层 */
}

.app-card:not(.app-offline):hover {
  transform: translateY(-8px);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 
    0 32px 64px rgba(37, 99, 235, 0.16),
    0 0 0 1px rgba(59, 130, 246, 0.15); /* 悬浮时散发微光边框 */
}

.app-card:nth-child(2n) {
  animation-delay: 0.04s;
}

.app-card:nth-child(3n) {
  animation-delay: 0.08s;
}

.card-accent {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, var(--app-accent), rgba(37, 99, 235, 0.18));
  transition: background 0.3s ease;
}

/* 离线应用（全局沉底、黑白褪色、高度半透明化） */
.app-offline {
  background: linear-gradient(180deg, rgba(236, 242, 248, 0.3), rgba(226, 232, 240, 0.1));
  border-color: rgba(148, 163, 184, 0.12);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
  /* 核心魔法：应用内的所有内容（包括各色彩色徽章、蓝字、端口按钮）统统被全局物理灰度化！ */
  filter: grayscale(0.85); 
  opacity: 0.65; /* 彻底隐入背景色，模拟失效感 */
}

/* 离线卡片的轻微呼吸反馈（悬浮时稍微回复彩色，表示它可以被管理） */
.app-offline:hover {
  transform: translateY(-2px);
  filter: grayscale(0.35); /* 悬浮时回复一点点颜色供用户识别 */
  opacity: 0.95;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  border-color: rgba(148, 163, 184, 0.28);
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
  width: 62px;
  height: 62px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--app-accent), var(--app-accent-end));
  color: white;
  font-size: 24px;
  box-shadow: 0 16px 24px rgba(37, 99, 235, 0.18);
  transition: transform 0.3s ease;
}

.app-icon.is-letter {
  font-family: var(--font-number); /* 字母使用更现代化的数字字体 */
  font-weight: 800;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.app-headline {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tech-stack-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.tech-stack-icon {
  font-size: 13px;
}

.app-name {
  margin-top: 12px;
  min-height: calc(1.25em * 2);
  color: var(--text-strong);
  font-size: 24px;
  line-height: 1.25;
  letter-spacing: -0.02em;
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
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
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
  min-height: 48px;
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.meta-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px;
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
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.port-type {
  color: var(--text-secondary);
}

.port-number {
  font-family: var(--font-number);
  color: var(--text-strong);
}

.port-frontend {
  background: rgba(5, 150, 105, 0.12);
}

.port-backend {
  background: rgba(37, 99, 235, 0.12);
}

.port-api {
  background: rgba(217, 119, 6, 0.12);
}

.port-websocket {
  background: rgba(14, 165, 233, 0.12);
}

.port-database {
  background: rgba(100, 116, 139, 0.12);
}

.card-footer {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.access-button {
  flex: 1;
  min-height: 44px;
  border-radius: 999px;
  font-weight: 700;
  transition: all 0.2s ease;
}

.access-button:not(.el-button--primary) {
  background: rgba(148, 163, 184, 0.08); /* 赋予次级按钮一个轻微的背景深度 */
  border-color: rgba(148, 163, 184, 0.2);
  color: var(--text-secondary);
}

.access-button:not(.el-button--primary):hover {
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-strong);
}

.more-button {
  min-width: 44px;
  min-height: 44px;
  border-color: rgba(148, 163, 184, 0.18);
  color: var(--text-secondary);
}

.refresh-button {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-secondary);
  font-weight: 700;
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
