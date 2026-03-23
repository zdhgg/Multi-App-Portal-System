<template>
  <div v-if="!loading && processes.length === 0" class="empty-container">
    <div class="empty-ornament" aria-hidden="true"></div>
    <div class="empty-title">暂无 PM2 进程</div>
    <div class="empty-desc">前往「应用管理」页面，选择应用后以生产模式（PM2）启动，即可在此统一管理。</div>
    <div class="empty-actions">
      <el-button type="primary" class="empty-action" @click="emit('goToManagement')">
        前往应用管理
      </el-button>
    </div>
  </div>

  <el-card v-else class="process-list-card">
    <template #header>
      <div class="card-header">
        <div class="header-copy">
          <span class="card-eyebrow">Process Directory</span>
          <span class="card-title">进程列表</span>
          <span class="card-subtitle">查看 PM2 进程状态、资源占用与关键运维操作。</span>
        </div>

        <div class="header-actions">
          <div class="header-summary">
            <span class="summary-pill">{{ processes.length }} 个进程</span>
            <span class="summary-pill summary-pill-danger" v-if="errorCount > 0">{{ errorCount }} 个异常</span>
          </div>

          <el-button size="small" class="refresh-button" @click="emit('refresh')">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>

          <div class="switch-pill">
            <span>自动刷新</span>
            <el-switch
              :model-value="autoRefresh"
              @update:model-value="emit('update:autoRefresh', $event)"
              size="small"
            />
          </div>
        </div>
      </div>
    </template>

    <el-table :data="processes" v-loading="loading" class="process-table">
      <el-table-column prop="name" label="进程名称" min-width="240">
        <template #default="{ row }">
          <div class="process-name-cell">
            <div class="process-avatar" :class="`status-${normalizeStatus(row.status)}`">
              {{ row.name?.slice(0, 1)?.toUpperCase() || 'P' }}
            </div>
            <div class="process-meta">
              <span class="process-name">{{ row.name }}</span>
              <span class="process-note">{{ getProcessNote(row.status) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="180">
        <template #default="{ row }">
          <div class="status-cell">
            <span class="status-badge" :class="`status-${normalizeStatus(row.status)}`">
              <span class="status-dot"></span>
              {{ getStatusText(row.status) }}
            </span>
            <el-tooltip
              v-if="isErrorStatus(row.status)"
              placement="top"
              effect="dark"
            >
              <template #content>
                <div class="error-tooltip">
                  <strong>进程启动异常</strong>
                  <div>可能原因：端口冲突、依赖缺失、启动配置错误。</div>
                  <div>建议先点击“查看错误”或查看日志后再处理。</div>
                </div>
              </template>
              <el-icon class="error-icon">
                <Warning />
              </el-icon>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="cpu" label="CPU" width="110">
        <template #default="{ row }">
          <div class="metric-cell">
            <span class="metric-number">{{ row.cpu }}%</span>
            <span class="metric-caption">实时占用</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="内存" width="130">
        <template #default="{ row }">
          <div class="metric-cell">
            <span class="metric-number">{{ formatMemory(row.memory) }}</span>
            <span class="metric-caption">常驻内存</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="运行时间" width="140">
        <template #default="{ row }">
          <div class="metric-cell">
            <span class="metric-number">{{ formatUptime(row.uptime) }}</span>
            <span class="metric-caption">本次运行周期</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" min-width="250">
        <template #default="{ row }">
          <div class="action-cell">
            <el-button
              v-if="isErrorStatus(row.status)"
              type="danger"
              size="small"
              class="primary-action"
              @click="emit('logs', row)"
            >
              查看错误
            </el-button>
            <el-button
              v-else-if="normalizeStatus(row.status) === 'online'"
              type="warning"
              size="small"
              class="primary-action"
              @click="emit('restart', row.name)"
            >
              重启
            </el-button>
            <el-button
              v-else
              type="success"
              size="small"
              class="primary-action"
              @click="emit('start', row.name)"
            >
              启动
            </el-button>

            <el-dropdown trigger="click">
              <el-button size="small" class="more-button">
                更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="normalizeStatus(row.status) !== 'online'"
                    @click="emit('start', row.name)"
                  >
                    <el-icon><VideoPlay /></el-icon> 启动
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="normalizeStatus(row.status) === 'online'"
                    @click="emit('stop', row.name)"
                  >
                    <el-icon><VideoPause /></el-icon> 停止
                  </el-dropdown-item>
                  <el-dropdown-item @click="emit('restart', row.name)">
                    <el-icon><RefreshRight /></el-icon> 重启
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="emit('logs', row)">
                    <el-icon><Document /></el-icon> 查看日志
                  </el-dropdown-item>
                  <el-dropdown-item @click="emit('config', row)">
                    <el-icon><Setting /></el-icon> 编辑配置
                  </el-dropdown-item>
                  <el-dropdown-item
                    divided
                    :disabled="normalizeStatus(row.status) === 'online'"
                    @click="emit('delete', row.name)"
                  >
                    <el-icon class="danger-icon"><Delete /></el-icon>
                    <span class="danger-text">删除</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Warning,
  ArrowDown,
  VideoPlay,
  VideoPause,
  RefreshRight,
  Document,
  Setting,
  Delete,
  Refresh
} from '@element-plus/icons-vue'
import type { PM2Process } from '@/services/pm2Api'

const props = defineProps<{
  processes: PM2Process[]
  loading: boolean
  autoRefresh?: boolean
}>()

const emit = defineEmits<{
  (e: 'start', name: string): void
  (e: 'stop', name: string): void
  (e: 'restart', name: string): void
  (e: 'delete', name: string): void
  (e: 'config', process: PM2Process): void
  (e: 'logs', process: PM2Process): void
  (e: 'goToManagement'): void
  (e: 'refresh'): void
  (e: 'update:autoRefresh', value: boolean): void
}>()

const errorCount = computed(() => props.processes.filter(process => isErrorStatus(process.status)).length)

const normalizeStatus = (status: string) => {
  const value = String(status || '').toLowerCase()
  if (value === 'errored' || value === 'error') return 'error'
  if (value === 'online') return 'online'
  if (value === 'launching') return 'launching'
  return 'stopped'
}

const isErrorStatus = (status: string) => normalizeStatus(status) === 'error'

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    online: '运行中',
    stopped: '已停止',
    error: '错误',
    errored: '错误',
    launching: '启动中'
  }
  return map[status] || status
}

const getProcessNote = (status: string) => {
  switch (normalizeStatus(status)) {
    case 'online':
      return '当前处于在线服务状态'
    case 'error':
      return '建议优先查看日志并执行诊断'
    case 'launching':
      return '正在拉起中，请稍后刷新确认'
    default:
      return '当前未运行，可手动启动'
  }
}

const formatMemory = (bytes: number | string | undefined): string => {
  if (!bytes) return '0 MB'
  const memoryBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (isNaN(memoryBytes) || memoryBytes <= 0) return '0 MB'
  const mb = memoryBytes / (1024 * 1024)
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(1)} GB`
}

const formatUptime = (uptime: number | string | undefined): string => {
  if (!uptime) return '-'
  const uptimeMs = typeof uptime === 'string' ? parseInt(uptime, 10) : uptime
  if (isNaN(uptimeMs) || uptimeMs <= 0) return '-'

  const diffMs = Date.now() - uptimeMs
  if (diffMs < 0) return '-'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}天 ${hours % 24}小时`
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}
</script>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.empty-ornament {
  width: 84px;
  height: 84px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.16), rgba(37, 99, 235, 0.02) 65%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(219, 234, 254, 0.72));
  border: 1px solid rgba(37, 99, 235, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 18px 36px rgba(37, 99, 235, 0.1);
}

.empty-title {
  margin-top: 20px;
  color: var(--text-strong);
  font-size: 24px;
  font-weight: 700;
}

.empty-desc {
  max-width: 420px;
  margin-top: 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.empty-actions {
  margin-top: 24px;
}

.empty-action {
  min-height: 44px;
  border-radius: 999px;
  font-weight: 700;
}

.process-list-card {
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.process-list-card :deep(.el-card__header) {
  padding: 20px 22px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(248, 250, 252, 0.86);
}

.process-list-card :deep(.el-card__body) {
  padding: 0;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.card-title {
  color: var(--text-strong);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.card-subtitle {
  color: var(--text-secondary);
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.summary-pill-danger {
  color: var(--danger-500);
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.12);
}

.refresh-button {
  min-height: 38px;
  border-radius: 999px;
  border-color: rgba(148, 163, 184, 0.18);
}

.switch-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.process-table :deep(.el-table) {
  --el-table-header-bg-color: rgba(248, 250, 252, 0.82);
  --el-table-row-hover-bg-color: rgba(37, 99, 235, 0.04);
}

.process-table :deep(th.el-table__cell) {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.process-table :deep(td.el-table__cell) {
  padding-top: 16px;
  padding-bottom: 16px;
}

.process-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.process-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  color: white;
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, #64748b, #475569);
}

.process-avatar.status-online {
  background: linear-gradient(135deg, #059669, #10b981);
}

.process-avatar.status-error {
  background: linear-gradient(135deg, #dc2626, #ef4444);
}

.process-avatar.status-launching {
  background: linear-gradient(135deg, #d97706, #f59e0b);
}

.process-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.process-name {
  color: var(--text-strong);
  font-weight: 700;
  line-height: 1.2;
  word-break: break-all;
}

.process-note {
  color: var(--text-secondary);
  font-size: 12px;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
}

.status-badge.status-online {
  color: var(--success-500);
  background: var(--success-50);
}

.status-badge.status-stopped {
  color: var(--info-500);
  background: var(--info-50);
}

.status-badge.status-error {
  color: var(--danger-500);
  background: var(--danger-50);
}

.status-badge.status-launching {
  color: var(--warning-500);
  background: var(--warning-50);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.error-icon {
  color: var(--danger-500);
  cursor: help;
}

.error-tooltip {
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.6;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-number {
  color: var(--text-strong);
  font-weight: 700;
}

.metric-caption {
  color: var(--text-tertiary);
  font-size: 12px;
}

.action-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-action,
.more-button {
  min-height: 34px;
  border-radius: 999px;
  font-weight: 700;
}

.more-button {
  border-color: rgba(148, 163, 184, 0.18);
}

.danger-icon,
.danger-text {
  color: var(--danger-500);
}

@media (max-width: 980px) {
  .card-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .process-list-card :deep(.el-card__header) {
    padding: 18px;
  }

  .header-actions,
  .refresh-button,
  .switch-pill {
    width: 100%;
  }

  .action-cell {
    flex-direction: column;
    align-items: stretch;
  }

  .primary-action,
  .more-button {
    width: 100%;
  }
}
</style>
