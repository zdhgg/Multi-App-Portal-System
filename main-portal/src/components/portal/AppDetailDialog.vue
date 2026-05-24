<template>
  <el-dialog
    v-model="dialogVisible"
    width="760px"
    append-to-body
    destroy-on-close
    :show-close="false"
    @close="handleClose"
    class="app-detail-dialog"
  >
    <template #header="{ close }">
      <div class="dialog-header-minimal">
        <button type="button" class="dialog-close" @click="close" aria-label="关闭详情弹窗">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </template>

    <div v-if="app" class="app-detail" :class="{ 'is-offline': !app.isRunning }" :style="detailStyle">
      <section class="detail-hero">
        <div class="detail-identity">
          <div class="detail-icon-shell">
            <img v-if="isValidUrl(app.icon)" :src="app.icon" class="detail-custom-icon" />
            <div v-else class="detail-icon">
              <el-icon v-if="getResolvedIcon(app.icon)" :size="36">
                <component :is="getResolvedIcon(app.icon)" />
              </el-icon>
              <span v-else-if="app.icon" class="icon-emoji">{{ app.icon }}</span>
              <el-icon v-else :size="36">
                <component :is="getTechStackElIcon(app.techStack)" />
              </el-icon>
            </div>
          </div>

          <div class="detail-copy">
            <span class="tech-stack-pill">
              <el-icon class="tech-stack-icon"><component :is="getTechStackElIcon(app.techStack)" /></el-icon>
              {{ techStackInfo.displayName }}
            </span>
            <h3 class="detail-title">{{ app.name }}</h3>
            <p v-if="descriptionText" class="detail-description">{{ descriptionText }}</p>

            <div class="detail-status-group">
              <div class="status-pill" :class="statusClass">
                <span class="status-dot"></span>
                {{ statusText }}
              </div>
              <div v-if="deploymentModeText" class="mode-pill" :class="deploymentModeClass">
                {{ deploymentModeText }}
              </div>
              <div class="meta-pill">{{ portSummaryText }}</div>
              <div class="meta-pill" v-if="app?.isRunning">
                运行 {{ uptimeText }}
              </div>
            </div>
            <div class="detail-last-updated">最后同步于 {{ lastUpdatedText }}</div>
          </div>
        </div>

        <div class="hero-actions">
          <el-button
            v-if="app.isRunning && fullAccessUrl"
            type="primary"
            class="hero-action-primary"
            :icon="Link"
            @click="handleAccess"
          >
            打开应用
          </el-button>
          <el-button
            class="hero-action-secondary"
            :icon="DocumentCopy"
            :disabled="!fullAccessUrl"
            @click="copyUrl"
          >
            复制链接
          </el-button>
        </div>
      </section>


      <section class="detail-section">
        <div class="section-header">
          <div>
            <span class="section-eyebrow">Connection</span>
            <h4 class="section-title">访问与连接</h4>
          </div>
        </div>

        <div class="access-panel">
          <div class="access-main">
            <span class="meta-label">访问地址</span>
            <template v-if="fullAccessUrl">
              <a :href="fullAccessUrl" target="_blank" rel="noopener noreferrer" class="access-link">
                {{ fullAccessUrl }}
              </a>
            </template>
            <span v-else class="access-empty">当前没有可用的访问地址</span>
          </div>

          <div class="access-meta">
            <div class="meta-item">
              <span class="meta-label">访问主机</span>
              <span class="meta-value">{{ accessHostText }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">协议</span>
              <span class="meta-value">{{ accessProtocolText }}</span>
            </div>
            <div class="meta-item" v-if="app.accessPath">
              <span class="meta-label">路径</span>
              <span class="meta-value">{{ app.accessPath }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <div class="section-header">
          <div>
            <span class="section-eyebrow">Ports</span>
            <h4 class="section-title">端口与服务角色</h4>
          </div>
        </div>

        <div class="port-list">
          <div
            v-for="port in portItems"
            :key="`${app.id}-${port.type}-${port.port}`"
            class="port-card"
            :class="`port-${port.type}`"
          >
            <div class="port-card-header">
              <span class="port-role">{{ getPortTypeLabel(port.type) }}</span>
              <span class="port-protocol">{{ port.protocol.toUpperCase() }}</span>
            </div>
            <div class="port-number">{{ port.port }}</div>
            <div class="port-description">{{ port.description || getPortDescription(port.type) }}</div>
          </div>

          <div v-if="portItems.length === 0" class="port-card port-empty">
            <div class="port-card-header">
              <span class="port-role">端口信息</span>
            </div>
            <div class="port-number">N/A</div>
            <div class="port-description">当前应用未提供可展示的端口配置</div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button
          v-if="fullAccessUrl"
          class="footer-secondary"
          :icon="DocumentCopy"
          @click="copyUrl"
        >
          复制链接
        </el-button>
        <el-button
          v-if="app?.isRunning && fullAccessUrl"
          type="primary"
          :icon="Link"
          @click="handleAccess"
        >
          打开应用
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Close,
  Link,
  DocumentCopy
} from '@element-plus/icons-vue'
import type { App, AppPort } from '@/types/app'
import { getAllPorts, getAppAccessUrl, resolveAppProtocol } from '@/types/app'
import { generateAppAccessUrl } from '@/utils/networkUtils'
import { getTechStackInfo, getTechStackElIcon } from '@/utils/techStackUtils'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const getResolvedIcon = (iconStr?: string) => {
  if (!iconStr) return null
  return (ElementPlusIconsVue as any)[iconStr] || null
}

const isValidUrl = (url?: string) => {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:image')
}

const props = defineProps<{
  visible: boolean
  app?: App | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  access: [app: App]
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
})

const techStackInfo = computed(() => getTechStackInfo(props.app?.techStack || ''))
const portItems = computed(() => (props.app ? getAllPorts(props.app) : []))
const detailStyle = computed(() => {
  const baseColor = props.app?.color || techStackInfo.value.color || '#2563eb'
  return {
    '--detail-accent': props.app?.isRunning ? baseColor : '#94a3b8'
  }
})

const statusClass = computed(() => {
  if (!props.app) return 'status-offline'
  if (props.app.isRunning) return 'status-online'
  if (props.app.status === 'error') return 'status-error'
  return 'status-offline'
})

const statusText = computed(() => {
  if (!props.app) return '未知'
  if (props.app.isRunning) return '在线'
  if (props.app.status === 'error') return '错误'
  if (props.app.status === 'maintenance') return '维护中'
  return '离线'
})

const deploymentModeText = computed(() => {
  switch (props.app?.deploymentMode) {
    case 'production':
      return 'PM2 生产'
    case 'development':
      return 'DEV 开发'
    default:
      return ''
  }
})

const deploymentModeClass = computed(() => {
  switch (props.app?.deploymentMode) {
    case 'production':
      return 'mode-production'
    case 'development':
      return 'mode-development'
    default:
      return 'mode-unknown'
  }
})

const descriptionText = computed(() => {
  return props.app?.description?.trim() || ''
})

const fullAccessUrl = computed(() => {
  if (!props.app) return ''

  let targetPort: number | null = null

  if (props.app.backend_port && props.app.frontend_port) {
    if (props.app.deploymentMode === 'production') {
      targetPort = props.app.backend_port
    } else if (props.app.deploymentMode === 'development') {
      targetPort = props.app.frontend_port
    } else if (props.app.isRunning) {
      targetPort = props.app.frontend_port
    }
  }

  if (targetPort) {
    return generateAppAccessUrl(targetPort, {
      protocol: resolveAppProtocol(props.app),
      hostname: props.app.accessHost || undefined,
      fallbackToLocalhost: true,
      validateUrl: true
    })
  }

  return getAppAccessUrl(props.app) || ''
})

const primaryPort = computed(() => portItems.value.find(port => port.isMain) || portItems.value[0] || null)
const primaryPortDisplay = computed(() => primaryPort.value ? `${primaryPort.value.port}` : 'N/A')
const primaryAccessHelp = computed(() => {
  if (!primaryPort.value) return '当前应用未提供主访问端口'
  return `${getPortTypeLabel(primaryPort.value.type)}入口，适用于直接访问`
})

const portSummaryText = computed(() => {
  if (portItems.value.length === 0) return '未提供端口信息'
  if (portItems.value.length === 1) return `端口 ${portItems.value[0].port}`
  return `${portItems.value.length} 个服务端口`
})

const uptimeText = computed(() => {
  if (!props.app?.isRunning) return '尚未启动'
  if (typeof props.app.uptime === 'number' && props.app.uptime >= 0) {
    return formatUptime(props.app.uptime)
  }
  return '同步中'
})
const lastUpdatedText = computed(() => props.app?.lastUpdated ? formatTime(props.app.lastUpdated) : '未记录')
const accessHostText = computed(() => props.app?.accessHost || '本机 / 局域网自动适配')
const accessProtocolText = computed(() => props.app ? resolveAppProtocol(props.app).toUpperCase() : 'N/A')

const deploymentModeHelp = computed(() => {
  switch (props.app?.deploymentMode) {
    case 'production':
      return '通常由 PM2 托管并走后端端口访问'
    case 'development':
      return '通常由开发服务器提供前端访问入口'
    default:
      return '门户暂未识别当前运行方式'
  }
})

const handleClose = () => {
  emit('update:visible', false)
}

const handleAccess = () => {
  if (!props.app) return
  emit('access', props.app)
  handleClose()
}

const copyUrl = async () => {
  if (!fullAccessUrl.value) {
    ElMessage.warning('暂无可复制的访问地址')
    return
  }

  try {
    await navigator.clipboard.writeText(fullAccessUrl.value)
    ElMessage.success('链接已复制到剪贴板')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = fullAccessUrl.value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    ElMessage.success('链接已复制到剪贴板')
  }
}

const formatUptime = (uptime: number) => {
  const seconds = Math.floor(Math.max(uptime, 0) / 1000)
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

const getPortTypeLabel = (type: AppPort['type']) => {
  const labelMap: Record<AppPort['type'], string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WebSocket',
    database: '数据库'
  }

  return labelMap[type] || type
}

const getPortDescription = (type: AppPort['type']) => {
  const descriptionMap: Record<AppPort['type'], string> = {
    frontend: '面向浏览器的访问入口',
    backend: '后端服务或统一代理入口',
    api: 'API 服务入口',
    websocket: '实时通信连接端口',
    database: '数据库或持久化服务端口'
  }

  return descriptionMap[type] || '应用服务端口'
}
</script>

<style scoped>
.app-detail-dialog :deep(.el-dialog) {
  max-width: 94vw;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.16);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(18px);
}

.app-detail-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 16px 20px 0;
}

.app-detail-dialog :deep(.el-dialog__body) {
  padding: 0 20px 20px;
}

.app-detail-dialog :deep(.el-dialog__footer) {
  padding: 0 20px 20px;
}

.dialog-header-minimal {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.86);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.dialog-close:hover {
  background: rgba(226, 232, 240, 0.9);
  transform: translateY(-1px);
}

.app-detail {
  --detail-accent: #2563eb;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
}

.detail-identity {
  display: flex;
  gap: 16px;
  min-width: 0;
}

.detail-icon-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.detail-custom-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
}

.detail-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--detail-accent);
  color: white;
  font-size: 32px;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.15);
  transition: all 0.3s ease;
}

.is-offline .detail-icon {
  background: var(--detail-accent);
  box-shadow: none;
}

.is-offline .detail-custom-icon {
  filter: grayscale(100%);
  opacity: 0.7;
}

.icon-emoji {
  font-size: 32px;
  font-family: var(--font-number);
  line-height: 1;
}

.detail-copy {
  min-width: 0;
}

.tech-stack-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  transition: all 0.3s ease;
}

.is-offline .tech-stack-pill {
  background: #f1f5f9;
  color: #64748b;
}

.tech-stack-icon {
  font-size: 14px;
}

.detail-title {
  margin-top: 12px;
  font-size: 30px;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: var(--text-strong);
  word-break: break-word;
}

.detail-description {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.detail-status-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.detail-last-updated {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.status-pill,
.mode-pill,
.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
}

.status-online {
  color: var(--success-500);
  background: var(--success-50);
}

.status-offline {
  color: var(--info-500);
  background: var(--info-50);
}

.status-error {
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

.meta-pill {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(148, 163, 184, 0.14);
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 156px;
}

.hero-action-primary,
.hero-action-secondary {
  min-height: 44px;
  border-radius: 999px;
  font-weight: 700;
}

.hero-action-secondary {
  border-color: rgba(148, 163, 184, 0.2);
}

.detail-section {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.detail-section-compact {
  padding-top: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.section-title {
  color: var(--text-strong);
  font-size: 20px;
  line-height: 1.2;
}

.access-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
  gap: 16px;
}

.access-main,
.access-meta {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.access-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.access-link,
.access-empty {
  color: var(--text-strong);
  font-size: 15px;
  line-height: 1.65;
  word-break: break-all;
}

.access-link {
  text-decoration: none;
}

.access-link:hover {
  color: var(--primary-600);
}

.access-empty {
  color: var(--text-secondary);
}

.access-meta {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-value {
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 600;
}

.meta-break {
  word-break: break-all;
}

.port-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.port-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(248, 250, 252, 0.86);
}

.port-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.port-role {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.port-protocol {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.port-number {
  font-family: var(--font-number);
  color: var(--text-strong);
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
}

.port-description {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.port-frontend {
  background: rgba(236, 253, 245, 0.88);
}

.port-backend {
  background: rgba(239, 246, 255, 0.92);
}

.port-api {
  background: rgba(255, 247, 237, 0.92);
}

.port-websocket {
  background: rgba(240, 249, 255, 0.92);
}

.port-database {
  background: rgba(248, 250, 252, 0.92);
}

.port-empty {
  justify-content: center;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.footer-secondary {
  border-color: rgba(148, 163, 184, 0.2);
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

@media (max-width: 900px) {
  .detail-hero,
  .access-panel {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .hero-actions {
    width: 100%;
    min-width: 0;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .app-detail-dialog :deep(.el-dialog__header),
  .app-detail-dialog :deep(.el-dialog__body),
  .app-detail-dialog :deep(.el-dialog__footer) {
    padding-left: 18px;
    padding-right: 18px;
  }

  .detail-hero {
    padding-bottom: 18px;
  }
  
  .detail-section {
    padding: 18px;
    border-radius: 24px;
  }

  .detail-identity {
    flex-direction: column;
  }

  .detail-title {
    font-size: 26px;
  }

  .metrics-grid,
  .metadata-grid {
    grid-template-columns: 1fr;
  }

  .dialog-footer {
    width: 100%;
  }

  .dialog-footer .el-button {
    flex: 1 1 100%;
  }
}
</style>
