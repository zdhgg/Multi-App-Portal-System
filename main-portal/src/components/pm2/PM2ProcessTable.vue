<template>
  <!-- 空状态：独立显示引导界面 -->
  <div v-if="!loading && processes.length === 0" class="empty-container">
    <div class="empty-icon">📭</div>
    <div class="empty-title">暂无PM2进程</div>
    <div class="empty-desc">
      前往「应用管理」页面，选择应用 → 启动 → 生产模式（PM2）
    </div>
    <div class="empty-actions">
      <el-button type="primary" @click="$emit('goToManagement')">
        前往应用管理
      </el-button>
    </div>
  </div>

  <!-- 有进程时：显示列表卡片 -->
  <el-card v-else class="process-list-card">
    <template #header>
      <div class="card-header">
        <span>进程列表</span>
        <div class="header-actions">
          <el-button size="small" @click="$emit('refresh')">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
          <el-switch
            :model-value="autoRefresh"
            @update:model-value="$emit('update:autoRefresh', $event)"
            active-text="自动刷新"
            size="small"
            style="margin-left: 12px;"
          />
        </div>
      </div>
    </template>

    <el-table :data="processes" v-loading="loading">
      <el-table-column prop="name" label="进程名称" width="200" />
      
      <el-table-column label="状态" width="180">
        <template #default="{ row }">
          <div class="status-cell">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
            <el-tooltip
              v-if="row.status === 'error' || row.status === 'errored'"
              placement="top"
              effect="dark"
            >
              <template #content>
                <div class="error-tooltip">
                  <strong>❌ 进程启动失败</strong><br><br>
                  可能原因：端口被占用、依赖缺失、配置错误<br><br>
                  <strong>点击"查看错误"查看详细信息</strong>
                </div>
              </template>
              <el-icon color="#F56C6C" class="error-icon">
                <Warning />
              </el-icon>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="cpu" label="CPU" width="80">
        <template #default="{ row }">{{ row.cpu }}%</template>
      </el-table-column>
      
      <el-table-column label="内存" width="100">
        <template #default="{ row }">{{ formatMemory(row.memory) }}</template>
      </el-table-column>
      
      <el-table-column label="运行时间" width="120">
        <template #default="{ row }">{{ formatUptime(row.uptime) }}</template>
      </el-table-column>
      
      <el-table-column label="操作" min-width="200">
        <template #default="{ row }">
          <div class="action-cell">
            <!-- 主操作按钮：根据状态显示 -->
            <el-button
              v-if="row.status === 'error' || row.status === 'errored'"
              type="danger"
              size="small"
              @click="$emit('logs', row)"
            >
              查看错误
            </el-button>
            <el-button
              v-else-if="row.status === 'online'"
              type="warning"
              size="small"
              @click="$emit('restart', row.name)"
            >
              重启
            </el-button>
            <el-button
              v-else
              type="success"
              size="small"
              @click="$emit('start', row.name)"
            >
              启动
            </el-button>
            
            <!-- 更多操作下拉菜单 -->
            <el-dropdown trigger="click">
              <el-button size="small">
                更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item 
                    v-if="row.status !== 'online'" 
                    @click="$emit('start', row.name)"
                  >
                    <el-icon><VideoPlay /></el-icon> 启动
                  </el-dropdown-item>
                  <el-dropdown-item 
                    v-if="row.status === 'online'" 
                    @click="$emit('stop', row.name)"
                  >
                    <el-icon><VideoPause /></el-icon> 停止
                  </el-dropdown-item>
                  <el-dropdown-item @click="$emit('restart', row.name)">
                    <el-icon><RefreshRight /></el-icon> 重启
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="$emit('logs', row)">
                    <el-icon><Document /></el-icon> 查看日志
                  </el-dropdown-item>
                  <el-dropdown-item @click="$emit('config', row)">
                    <el-icon><Setting /></el-icon> 编辑配置
                  </el-dropdown-item>
                  <el-dropdown-item 
                    divided 
                    :disabled="row.status === 'online'"
                    @click="$emit('delete', row.name)"
                  >
                    <el-icon color="#f56c6c"><Delete /></el-icon> 
                    <span style="color: #f56c6c">删除</span>
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
import { Warning, ArrowDown, VideoPlay, VideoPause, RefreshRight, Document, Setting, Delete, Refresh } from '@element-plus/icons-vue'
import type { PM2Process } from '@/services/pm2Api'

defineProps<{
  processes: PM2Process[]
  loading: boolean
  autoRefresh?: boolean
}>()

defineEmits<{
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

// 状态类型映射
const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    online: 'success',
    stopped: 'info',
    error: 'danger',
    errored: 'danger',
    launching: 'warning'
  }
  return map[status] || ''
}

// 状态文本映射
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

// 格式化内存
const formatMemory = (bytes: number | string | undefined): string => {
  if (!bytes) return '0 MB'
  const memoryBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes
  if (isNaN(memoryBytes) || memoryBytes <= 0) return '0 MB'
  const mb = memoryBytes / (1024 * 1024)
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(1)} GB`
}

// 格式化运行时间
const formatUptime = (uptime: number | string | undefined): string => {
  if (!uptime) return '-'
  const uptimeMs = typeof uptime === 'string' ? parseInt(uptime) : uptime
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
/* 空状态容器 */
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.4;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
  color: #909399;
  margin-bottom: 24px;
  text-align: center;
}

.empty-actions {
  display: flex;
  gap: 12px;
}

/* 进程列表卡片 */
.process-list-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon {
  cursor: help;
}

.error-tooltip {
  max-width: 300px;
}

.action-cell {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
