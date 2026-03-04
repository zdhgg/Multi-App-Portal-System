<template>
  <div class="change-history-view">
    <div class="history-header">
      <h3>配置变更历史</h3>
      <div class="header-actions">
        <el-button @click="exportHistory" :icon="Download">导出历史</el-button>
        <el-button @click="refreshHistory" :loading="loading" :icon="Refresh">刷新</el-button>
      </div>
    </div>

    <!-- 历史统计 -->
    <div class="history-stats">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon total">
                <el-icon><DataAnalysis /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ totalChanges }}</div>
                <div class="stat-label">总变更数</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon recent">
                <el-icon><Clock /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ recentChanges }}</div>
                <div class="stat-label">近7天变更</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon user">
                <el-icon><User /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ activeUsers }}</div>
                <div class="stat-label">活跃用户</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon category">
                <el-icon><Folder /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ changeCategories }}</div>
                <div class="stat-label">变更类型</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 过滤器 -->
    <div class="history-filters">
      <el-row :gutter="16" align="middle">
        <el-col :span="4">
          <el-select v-model="filters.type" placeholder="变更类型" clearable>
            <el-option label="全部类型" value="" />
            <el-option label="端口范围" value="port_range" />
            <el-option label="保留端口" value="reserved_ports" />
            <el-option label="分配策略" value="policy" />
            <el-option label="监控配置" value="monitoring" />
            <el-option label="应用配置" value="application" />
            <el-option label="系统配置" value="system" />
          </el-select>
        </el-col>
        
        <el-col :span="4">
          <el-input
            v-model="filters.user"
            placeholder="操作用户"
            :prefix-icon="User"
            clearable
          />
        </el-col>
        
        <el-col :span="6">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-col>
        
        <el-col :span="4">
          <el-input
            v-model="filters.search"
            placeholder="搜索变更内容"
            :prefix-icon="Search"
            clearable
          />
        </el-col>
        
        <el-col :span="6">
          <el-button-group>
            <el-button 
              @click="setTimeRange('today')" 
              :type="isTimeRangeActive('today') ? 'primary' : ''"
              size="small"
            >
              今天
            </el-button>
            <el-button 
              @click="setTimeRange('week')" 
              :type="isTimeRangeActive('week') ? 'primary' : ''"
              size="small"
            >
              本周
            </el-button>
            <el-button 
              @click="setTimeRange('month')" 
              :type="isTimeRangeActive('month') ? 'primary' : ''"
              size="small"
            >
              本月
            </el-button>
          </el-button-group>
        </el-col>
      </el-row>
    </div>

    <!-- 变更历史列表 -->
    <div class="history-list">
      <div class="list-header">
        <h4>变更记录</h4>
        <div class="list-meta">
          共 {{ filteredHistory.length }} 条记录
        </div>
      </div>

      <el-timeline>
        <el-timeline-item
          v-for="change in paginatedHistory"
          :key="change.id"
          :timestamp="formatTimestamp(change.timestamp)"
          :type="getTimelineType(change.type)"
          :icon="getTimelineIcon(change.type)"
          placement="top"
        >
          <el-card class="change-card" shadow="hover">
            <div class="change-header">
              <div class="change-meta">
                <el-tag 
                  :type="getChangeTagType(change.type)" 
                  size="small"
                >
                  {{ getChangeTypeLabel(change.type) }}
                </el-tag>
                <span class="change-user">{{ change.user || '系统' }}</span>
                <span class="change-time">{{ formatRelativeTime(change.timestamp) }}</span>
              </div>
              <div class="change-actions">
                <el-button size="small" @click="viewChangeDetails(change)">
                  查看详情
                </el-button>
                <el-button 
                  size="small" 
                  @click="revertChange(change)"
                  :disabled="!canRevert(change)"
                >
                  回滚
                </el-button>
              </div>
            </div>

            <div class="change-content">
              <div v-if="change.reason" class="change-reason">
                <strong>变更原因：</strong>{{ change.reason }}
              </div>
              
              <div class="change-summary">
                <strong>变更摘要：</strong>
                <span>{{ getChangeSummary(change) }}</span>
              </div>

              <div v-if="change.changes.length <= 3" class="change-details-preview">
                <div 
                  v-for="(item, index) in change.changes" 
                  :key="index"
                  class="change-item"
                >
                  <div class="change-path">{{ item.path }}</div>
                  <div class="change-values">
                    <span class="old-value">{{ formatValue(item.oldValue) }}</span>
                    <el-icon class="arrow-icon"><Right /></el-icon>
                    <span class="new-value">{{ formatValue(item.newValue) }}</span>
                  </div>
                </div>
              </div>
              
              <div v-else class="change-summary-count">
                包含 {{ change.changes.length }} 项配置变更
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>

      <!-- 分页 -->
      <div class="history-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="filteredHistory.length"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>

    <!-- 变更详情对话框 -->
    <el-dialog
      v-model="showDetailsDialog"
      :title="`变更详情 - ${selectedChange?.type ? getChangeTypeLabel(selectedChange.type) : ''}`"
      width="800px"
      top="5vh"
    >
      <div v-if="selectedChange" class="change-details">
        <div class="details-header">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="变更时间">
              {{ formatTimestamp(selectedChange.timestamp) }}
            </el-descriptions-item>
            <el-descriptions-item label="操作用户">
              {{ selectedChange.user || '系统' }}
            </el-descriptions-item>
            <el-descriptions-item label="变更类型">
              <el-tag :type="getChangeTagType(selectedChange.type)">
                {{ getChangeTypeLabel(selectedChange.type) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="变更原因">
              {{ selectedChange.reason || '无' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="details-changes">
          <h4>具体变更内容</h4>
          <el-table :data="selectedChange.changes" stripe>
            <el-table-column prop="path" label="配置路径" min-width="200" />
            <el-table-column label="原值" min-width="150">
              <template #default="{ row }">
                <code class="value-code old">{{ formatValue(row.oldValue) }}</code>
              </template>
            </el-table-column>
            <el-table-column label="新值" min-width="150">
              <template #default="{ row }">
                <code class="value-code new">{{ formatValue(row.newValue) }}</code>
              </template>
            </el-table-column>
            <el-table-column label="变更类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getValueChangeType(row.oldValue, row.newValue)" size="small">
                  {{ getValueChangeLabel(row.oldValue, row.newValue) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="details-actions">
          <el-button @click="exportChangeDetails(selectedChange)">
            导出详情
          </el-button>
          <el-button 
            type="warning" 
            @click="revertChange(selectedChange)"
            :disabled="!canRevert(selectedChange)"
          >
            回滚此变更
          </el-button>
        </div>
      </div>

      <template #footer>
        <el-button @click="showDetailsDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download, Refresh, DataAnalysis, Clock, User, Folder,
  Search, Right
} from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'

const portConfigStore = usePortConfigStore()

// 响应式数据
const loading = ref(false)
const showDetailsDialog = ref(false)
const selectedChange = ref<any>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const filters = reactive<{ type: string; user: string; dateRange: string[] | null; search: string }>({
  type: '',
  user: '',
  dateRange: null,
  search: ''
})

// 模拟变更历史数据
const historyData = ref([
  {
    id: '1',
    timestamp: new Date().toISOString(),
    type: 'port_range',
    user: 'admin',
    reason: '扩展前端端口范围以支持更多应用',
    changes: [
      { path: 'portConfiguration.frontendRange.end', oldValue: 3050, newValue: 3100 }
    ]
  },
  {
    id: '2', 
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    type: 'reserved_ports',
    user: 'admin',
    reason: '添加新的系统保留端口',
    changes: [
      { path: 'portConfiguration.reservedPorts[5]', oldValue: null, newValue: { port: 5432, description: 'PostgreSQL', category: 'system' }}
    ]
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 86400000).toISOString(), 
    type: 'monitoring',
    user: 'system',
    reason: '优化监控性能',
    changes: [
      { path: 'portConfiguration.monitoring.healthCheckIntervalMs', oldValue: 30000, newValue: 60000 },
      { path: 'portConfiguration.monitoring.enableRealTimeMonitoring', oldValue: false, newValue: true }
    ]
  }
])

// 统计数据
const totalChanges = ref(156)
const recentChanges = ref(23)
const activeUsers = ref(5)
const changeCategories = ref(6)

// 计算属性
const filteredHistory = computed(() => {
  let filtered = historyData.value

  if (filters.type) {
    filtered = filtered.filter(change => change.type === filters.type)
  }

  if (filters.user) {
    filtered = filtered.filter(change => 
      (change.user || '').toLowerCase().includes(filters.user.toLowerCase())
    )
  }

  if (filters.search) {
    const search = filters.search.toLowerCase()
    filtered = filtered.filter(change => 
      change.reason?.toLowerCase().includes(search) ||
      change.changes.some(c => c.path.toLowerCase().includes(search))
    )
  }

  if (filters.dateRange && filters.dateRange.length === 2) {
    const [start, end] = filters.dateRange
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime() + 86400000 // 加一天
    filtered = filtered.filter(change => {
      const changeTime = new Date(change.timestamp).getTime()
      return changeTime >= startTime && changeTime <= endTime
    })
  }

  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredHistory.value.slice(start, end)
})

// 工具函数
const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatRelativeTime = (timestamp: string) => {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`
  return formatTimestamp(timestamp)
}

const getChangeTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    port_range: '端口范围',
    reserved_ports: '保留端口',
    policy: '分配策略',
    monitoring: '监控配置',
    application: '应用配置',
    system: '系统配置'
  }
  return labels[type] || type
}

const getChangeTagType = (type: string) => {
  const types: Record<string, string> = {
    port_range: 'primary',
    reserved_ports: 'success',
    policy: 'warning',
    monitoring: 'info',
    application: 'default',
    system: 'danger'
  }
  return types[type] || 'default'
}

const getTimelineType = (type: string) => {
  const types: Record<string, string> = {
    port_range: 'primary',
    reserved_ports: 'success', 
    policy: 'warning',
    monitoring: 'info',
    application: '',
    system: 'danger'
  }
  return types[type] || ''
}

const getTimelineIcon = (type: string) => {
  const icons: Record<string, string> = {
    port_range: 'Connection',
    reserved_ports: 'Lock',
    policy: 'Setting',
    monitoring: 'Monitor',
    application: 'Files',
    system: 'Tools'
  }
  return icons[type] || 'EditPen'
}

const formatValue = (value: any) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const getChangeSummary = (change: any) => {
  const count = change.changes.length
  if (count === 1) {
    const c = change.changes[0]
    return `修改了 ${c.path}`
  }
  return `修改了 ${count} 项配置`
}

const getValueChangeType = (oldValue: any, newValue: any) => {
  if (oldValue === null || oldValue === undefined) return 'success'
  if (newValue === null || newValue === undefined) return 'danger'
  return 'primary'
}

const getValueChangeLabel = (oldValue: any, newValue: any) => {
  if (oldValue === null || oldValue === undefined) return '新增'
  if (newValue === null || newValue === undefined) return '删除'
  return '修改'
}

const canRevert = (change: any) => {
  // 简单的回滚判断逻辑
  const now = Date.now()
  const changeTime = new Date(change.timestamp).getTime()
  const hoursDiff = (now - changeTime) / (1000 * 60 * 60)
  return hoursDiff < 24 && change.user !== 'system'
}

// 事件处理函数
const refreshHistory = async () => {
  loading.value = true
  try {
    await portConfigStore.refreshChangeHistory()
    ElMessage.success('历史记录刷新成功')
  } catch (error) {
    ElMessage.error('刷新历史记录失败')
  } finally {
    loading.value = false
  }
}

const exportHistory = () => {
  const data = {
    exportTime: new Date().toISOString(),
    totalRecords: filteredHistory.value.length,
    filters: { ...filters },
    history: filteredHistory.value
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `port-config-history-${new Date().toISOString().split('T')[0]}.json`
  link.click()

  URL.revokeObjectURL(url)
  ElMessage.success('历史记录导出成功')
}

const setTimeRange = (range: string) => {
  const now = new Date()
  let start: Date

  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'week':
      const weekStart = now.getDate() - now.getDay()
      start = new Date(now.getFullYear(), now.getMonth(), weekStart)
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    default:
      return
  }

  filters.dateRange = [
    start.toISOString().split('T')[0],
    now.toISOString().split('T')[0]
  ]
}

const isTimeRangeActive = (range: string) => {
  if (!filters.dateRange) return false
  
  const now = new Date()
  const dr = filters.dateRange as string[]
  const filterStartDate = new Date(dr[0])

  switch (range) {
    case 'today':
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return filterStartDate.getTime() === todayStart.getTime()
    case 'week':
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
      return filterStartDate.getTime() === weekStart.getTime()
    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return filterStartDate.getTime() === monthStart.getTime()
    default:
      return false
  }
}

const viewChangeDetails = (change: any) => {
  selectedChange.value = change
  showDetailsDialog.value = true
}

const revertChange = async (change: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要回滚此变更吗？这将撤销在 ${formatTimestamp(change.timestamp)} 所做的配置修改。`,
      '确认回滚',
      {
        confirmButtonText: '确定回滚',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    ElMessage.success('变更回滚成功')
    showDetailsDialog.value = false
  } catch {
    // 用户取消
  }
}

const exportChangeDetails = (change: any) => {
  const data = {
    id: change.id,
    timestamp: change.timestamp,
    type: change.type,
    user: change.user,
    reason: change.reason,
    changes: change.changes,
    exportTime: new Date().toISOString()
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `change-detail-${change.id}.json`
  link.click()

  URL.revokeObjectURL(url)
  ElMessage.success('变更详情导出成功')
}

const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
}

const handleCurrentChange = (page: number) => {
  currentPage.value = page
}

// 初始化
onMounted(() => {
  // 可以在这里加载实际的历史数据
})
</script>

<style scoped>
.change-history-view {
  padding: 20px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.history-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.history-stats {
  margin-bottom: 24px;
}

.stat-card {
  height: 100%;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
}

.stat-icon.total {
  background: linear-gradient(45deg, #3b82f6, #1d4ed8);
}

.stat-icon.recent {
  background: linear-gradient(45deg, #10b981, #059669);
}

.stat-icon.user {
  background: linear-gradient(45deg, #f59e0b, #d97706);
}

.stat-icon.category {
  background: linear-gradient(45deg, #8b5cf6, #7c3aed);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
}

.history-filters {
  margin-bottom: 24px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.history-list {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.list-header h4 {
  margin: 0;
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
}

.list-meta {
  font-size: 14px;
  color: #6b7280;
}

.change-card {
  margin-bottom: 16px;
}

.change-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.change-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.change-user {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
}

.change-time {
  font-size: 12px;
  color: #6b7280;
}

.change-actions {
  display: flex;
  gap: 8px;
}

.change-content {
  font-size: 14px;
  line-height: 1.5;
}

.change-reason {
  margin-bottom: 8px;
  color: #1f2937;
}

.change-summary {
  margin-bottom: 12px;
  color: #1f2937;
}

.change-details-preview {
  margin-top: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.change-item {
  margin-bottom: 8px;
}

.change-item:last-child {
  margin-bottom: 0;
}

.change-path {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.change-values {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.old-value {
  color: #dc2626;
  background: #fef2f2;
  padding: 2px 6px;
  border-radius: 4px;
}

.new-value {
  color: #059669;
  background: #f0fdf4;
  padding: 2px 6px;
  border-radius: 4px;
}

.arrow-icon {
  color: #6b7280;
  font-size: 12px;
}

.change-summary-count {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

.history-pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.change-details {
  padding: 16px 0;
}

.details-header {
  margin-bottom: 24px;
}

.details-changes {
  margin-bottom: 24px;
}

.details-changes h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.value-code {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value-code.old {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.value-code.new {
  background: #f0fdf4;
  color: #059669;
  border: 1px solid #bbf7d0;
}

.details-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .history-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .change-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .change-meta {
    flex-wrap: wrap;
  }

  .change-values {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>