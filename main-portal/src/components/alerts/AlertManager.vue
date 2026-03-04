<template>
  <div class="alert-manager">
    <el-card>
      <template #header>
        <div class="manager-header">
          <h3>告警管理中心</h3>
          <div class="header-actions">
            <el-button 
              type="primary" 
              :icon="Refresh" 
              @click="refreshAlerts"
              :loading="refreshing"
              size="small"
            >
              刷新
            </el-button>
            <el-button 
              type="success" 
              @click="acknowledgeAll"
              :disabled="unacknowledgedCount === 0"
              size="small"
            >
              全部确认
            </el-button>
            <el-button 
              type="info" 
              :icon="Setting" 
              @click="showSettings"
              size="small"
            >
              设置
            </el-button>
          </div>
        </div>
      </template>

      <!-- 告警统计概览 -->
      <div class="alert-stats">
        <el-row :gutter="16">
          <el-col :span="6">
            <div class="stat-card critical">
              <div class="stat-icon">
                <el-icon size="24"><Warning /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-number">{{ criticalCount }}</div>
                <div class="stat-label">严重告警</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card high">
              <div class="stat-icon">
                <el-icon size="24"><InfoFilled /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-number">{{ highCount }}</div>
                <div class="stat-label">高级告警</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card medium">
              <div class="stat-icon">
                <el-icon size="24"><WarningFilled /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-number">{{ mediumCount }}</div>
                <div class="stat-label">中级告警</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card total">
              <div class="stat-icon">
                <el-icon size="24"><Bell /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-number">{{ totalCount }}</div>
                <div class="stat-label">总告警数</div>
              </div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 告警筛选和搜索 -->
      <div class="alert-filters">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-select v-model="filters.type" placeholder="告警类型" clearable>
              <el-option label="全部" value="" />
              <el-option label="性能告警" value="performance" />
              <el-option label="安全告警" value="security" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-select v-model="filters.severity" placeholder="严重程度" clearable>
              <el-option label="全部" value="" />
              <el-option label="严重" value="critical" />
              <el-option label="高" value="high" />
              <el-option label="中" value="medium" />
              <el-option label="低" value="low" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-select v-model="filters.status" placeholder="状态" clearable>
              <el-option label="全部" value="" />
              <el-option label="未处理" value="unacknowledged" />
              <el-option label="已确认" value="acknowledged" />
              <el-option label="已解决" value="resolved" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-input 
              v-model="filters.search" 
              placeholder="搜索告警内容" 
              :prefix-icon="Search"
              clearable
            />
          </el-col>
        </el-row>
      </div>

      <!-- 告警列表 -->
      <div class="alert-list">
        <el-table 
          :data="filteredAlerts" 
          style="width: 100%" 
          :default-sort="{prop: 'timestamp', order: 'descending'}"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="severity" label="级别" width="80" sortable>
            <template #default="{ row }">
              <el-tag :type="getSeverityType(row.severity)" size="small">
                {{ getSeverityText(row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.type === 'performance' ? 'success' : 'warning'" size="small">
                {{ row.type === 'performance' ? '性能' : '安全' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="200" />
          <el-table-column prop="source" label="来源" width="120">
            <template #default="{ row }">
              端口 {{ row.port || row.source }}
            </template>
          </el-table-column>
          <el-table-column prop="timestamp" label="时间" width="160" sortable>
            <template #default="{ row }">
              {{ formatTime(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag 
                :type="row.acknowledged ? 'success' : 'danger'" 
                size="small"
              >
                {{ row.acknowledged ? '已确认' : '待处理' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button 
                v-if="!row.acknowledged"
                type="success" 
                size="small" 
                @click="acknowledgeAlert(row)"
              >
                确认
              </el-button>
              <el-button 
                type="primary" 
                size="small" 
                @click="viewAlertDetail(row)"
              >
                详情
              </el-button>
              <el-button 
                type="danger" 
                size="small" 
                @click="deleteAlert(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <el-pagination
            v-model:current-page="pagination.currentPage"
            v-model:page-size="pagination.pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="filteredAlerts.length"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </div>

      <!-- 批量操作 -->
      <div class="batch-actions" v-if="selectedAlerts.length > 0">
        <el-alert
          :title="`已选择 ${selectedAlerts.length} 条告警`"
          type="info"
          show-icon
          :closable="false"
        >
          <template #default>
            <div class="batch-buttons">
              <el-button 
                type="success" 
                size="small" 
                @click="batchAcknowledge"
              >
                批量确认
              </el-button>
              <el-button 
                type="danger" 
                size="small" 
                @click="batchDelete"
              >
                批量删除
              </el-button>
              <el-button 
                type="info" 
                size="small" 
                @click="batchExport"
              >
                批量导出
              </el-button>
            </div>
          </template>
        </el-alert>
      </div>
    </el-card>

    <!-- 告警详情弹窗 -->
    <el-dialog
      v-model="showDetailDialog"
      title="告警详情"
      width="800px"
      :before-close="handleDetailClose"
    >
      <div v-if="selectedAlert" class="alert-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="告警类型">
            <el-tag :type="selectedAlert.type === 'performance' ? 'success' : 'warning'" size="small">
              {{ selectedAlert.type === 'performance' ? '性能告警' : '安全告警' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="严重程度">
            <el-tag :type="getSeverityType(selectedAlert.severity)" size="small">
              {{ getSeverityText(selectedAlert.severity) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            端口 {{ selectedAlert.port || selectedAlert.source }}
          </el-descriptions-item>
          <el-descriptions-item label="时间">
            {{ formatTime(selectedAlert.timestamp) }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedAlert.acknowledged ? 'success' : 'danger'" size="small">
              {{ selectedAlert.acknowledged ? '已确认' : '待处理' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="持续时间" v-if="selectedAlert.duration">
            {{ selectedAlert.duration }}ms
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-content">
          <h4>告警描述</h4>
          <p>{{ selectedAlert.description || selectedAlert.message }}</p>

          <div v-if="selectedAlert.impact">
            <h4>影响分析</h4>
            <p>{{ selectedAlert.impact }}</p>
          </div>

          <div v-if="selectedAlert.recommendations && selectedAlert.recommendations.length > 0">
            <h4>处理建议</h4>
            <ul>
              <li v-for="recommendation in selectedAlert.recommendations" :key="recommendation">
                {{ recommendation }}
              </li>
            </ul>
          </div>

          <div v-if="selectedAlert.evidence && selectedAlert.evidence.length > 0">
            <h4>相关证据</h4>
            <ul>
              <li v-for="evidence in selectedAlert.evidence" :key="evidence">
                {{ evidence }}
              </li>
            </ul>
          </div>
        </div>

        <div class="detail-actions">
          <el-button 
            v-if="!selectedAlert.acknowledged"
            type="success" 
            @click="acknowledgeAlert(selectedAlert)"
          >
            确认此告警
          </el-button>
          <el-button 
            type="info" 
            @click="exportAlert(selectedAlert)"
          >
            导出详情
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 告警设置弹窗 -->
    <el-dialog
      v-model="showSettingsDialog"
      title="告警设置"
      width="600px"
    >
      <el-form :model="alertSettings" label-width="120px">
        <el-form-item label="自动刷新">
          <el-switch v-model="alertSettings.autoRefresh" />
          <span class="form-help">自动刷新告警列表</span>
        </el-form-item>
        <el-form-item label="刷新间隔" v-if="alertSettings.autoRefresh">
          <el-select v-model="alertSettings.refreshInterval">
            <el-option label="10秒" :value="10000" />
            <el-option label="30秒" :value="30000" />
            <el-option label="1分钟" :value="60000" />
            <el-option label="5分钟" :value="300000" />
          </el-select>
        </el-form-item>
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="alertSettings.notificationChannels">
            <el-checkbox label="browser">浏览器通知</el-checkbox>
            <el-checkbox label="sound">声音提醒</el-checkbox>
            <el-checkbox label="email">邮件通知</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="严重告警置顶">
          <el-switch v-model="alertSettings.prioritizeCritical" />
        </el-form-item>
        <el-form-item label="历史保留时间">
          <el-select v-model="alertSettings.retentionDays">
            <el-option label="7天" :value="7" />
            <el-option label="30天" :value="30" />
            <el-option label="90天" :value="90" />
            <el-option label="永久保留" :value="0" />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存设置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { 
  Refresh, 
  Setting, 
  Search, 
  Warning, 
  InfoFilled, 
  WarningFilled, 
  Bell 
} from '@element-plus/icons-vue'
import { portPerformanceApiService, type PerformanceAlert } from '@/services/portPerformanceApi'

// 统一告警接口
interface UnifiedAlert {
  id: string
  type: 'performance' | 'security'
  title: string
  description?: string
  message: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  port?: number
  source: string
  timestamp: Date
  acknowledged: boolean
  duration?: number
  impact?: string
  recommendations?: string[]
  evidence?: string[]
  resolvedAt?: Date
}

// 告警设置
interface AlertSettings {
  autoRefresh: boolean
  refreshInterval: number
  notificationChannels: string[]
  prioritizeCritical: boolean
  retentionDays: number
}

// 响应式数据
const refreshing = ref(false)
const alerts = ref<UnifiedAlert[]>([])
const selectedAlerts = ref<UnifiedAlert[]>([])
const showDetailDialog = ref(false)
const showSettingsDialog = ref(false)
const selectedAlert = ref<UnifiedAlert | null>(null)

// 筛选条件
const filters = reactive({
  type: '',
  severity: '',
  status: '',
  search: ''
})

// 分页
const pagination = reactive({
  currentPage: 1,
  pageSize: 20
})

// 告警设置
const alertSettings = reactive<AlertSettings>({
  autoRefresh: true,
  refreshInterval: 30000,
  notificationChannels: ['browser'],
  prioritizeCritical: true,
  retentionDays: 30
})

// 自动刷新定时器
let refreshTimer: NodeJS.Timeout | null = null

// 计算属性
const criticalCount = computed(() => 
  alerts.value.filter(alert => alert.severity === 'critical' && !alert.acknowledged).length
)

const highCount = computed(() => 
  alerts.value.filter(alert => alert.severity === 'high' && !alert.acknowledged).length
)

const mediumCount = computed(() => 
  alerts.value.filter(alert => alert.severity === 'medium' && !alert.acknowledged).length
)

const totalCount = computed(() => 
  alerts.value.filter(alert => !alert.acknowledged).length
)

const unacknowledgedCount = computed(() => 
  alerts.value.filter(alert => !alert.acknowledged).length
)

const filteredAlerts = computed(() => {
  let result = alerts.value

  // 按类型筛选
  if (filters.type) {
    result = result.filter(alert => alert.type === filters.type)
  }

  // 按严重程度筛选
  if (filters.severity) {
    result = result.filter(alert => alert.severity === filters.severity)
  }

  // 按状态筛选
  if (filters.status) {
    if (filters.status === 'unacknowledged') {
      result = result.filter(alert => !alert.acknowledged)
    } else if (filters.status === 'acknowledged') {
      result = result.filter(alert => alert.acknowledged && !alert.resolvedAt)
    } else if (filters.status === 'resolved') {
      result = result.filter(alert => alert.resolvedAt)
    }
  }

  // 按搜索关键词筛选
  if (filters.search) {
    const keyword = filters.search.toLowerCase()
    result = result.filter(alert => 
      alert.title.toLowerCase().includes(keyword) ||
      alert.message.toLowerCase().includes(keyword) ||
      (alert.description && alert.description.toLowerCase().includes(keyword))
    )
  }

  // 严重告警置顶
  if (alertSettings.prioritizeCritical) {
    result.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
      if (severityDiff !== 0) return severityDiff
      return b.timestamp.getTime() - a.timestamp.getTime()
    })
  } else {
    result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  return result
})

// 方法
const refreshAlerts = async () => {
  refreshing.value = true
  try {
    await loadPerformanceAlerts()
    await loadSecurityAlerts()
    ElMessage.success('告警列表已刷新')
  } catch (error) {
    console.error('Failed to refresh alerts:', error)
    ElMessage.error('刷新告警列表失败')
  } finally {
    refreshing.value = false
  }
}

const loadPerformanceAlerts = async () => {
  try {
    const response = await portPerformanceApiService.getAllAlerts({
      acknowledged: false,
      limit: 100
    })

    if (response.success && response.data) {
      const performanceAlerts = response.data.map(alert => ({
        id: `perf-${alert.id}`,
        type: 'performance' as const,
        title: getAlertTypeText(alert.alertType),
        message: alert.message,
        severity: alert.severity,
        port: alert.port,
        source: `端口 ${alert.port}`,
        timestamp: alert.timestamp,
        acknowledged: alert.acknowledged,
        resolvedAt: alert.resolvedAt
      }))

      // 合并到总的告警列表中
      alerts.value = alerts.value.filter(alert => alert.type !== 'performance')
      alerts.value.push(...performanceAlerts)
    }
  } catch (error) {
    console.error('Failed to load performance alerts:', error)
  }
}

const loadSecurityAlerts = async () => {
  // 这里应该加载安全告警
  // 由于我们没有专门的安全告警API，这里使用模拟数据
  const securityAlerts: UnifiedAlert[] = [
    {
      id: 'sec-001',
      type: 'security',
      title: '检测到不安全的协议使用',
      message: '端口3000使用HTTP协议，存在数据泄露风险',
      description: 'HTTP协议不提供数据加密，敏感信息可能在传输过程中被截获。',
      severity: 'high',
      port: 3000,
      source: '端口 3000',
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15分钟前
      acknowledged: false,
      impact: '用户数据和会话信息可能被网络攻击者截获和篡改。',
      recommendations: [
        '配置 HTTPS 并重定向 HTTP 流量',
        '获取并安装 SSL/TLS 证书',
        '启用 HSTS（HTTP严格传输安全）'
      ],
      evidence: ['端口 3000 运行未加密的 HTTP 服务']
    }
  ]

  // 过滤掉已存在的安全告警
  const existingSecurityIds = alerts.value
    .filter(alert => alert.type === 'security')
    .map(alert => alert.id)

  const newSecurityAlerts = securityAlerts.filter(alert => 
    !existingSecurityIds.includes(alert.id)
  )

  alerts.value.push(...newSecurityAlerts)
}

const acknowledgeAlert = async (alert: UnifiedAlert) => {
  try {
    if (alert.type === 'performance') {
      const alertId = parseInt(alert.id.replace('perf-', ''))
      const response = await portPerformanceApiService.acknowledgeAlert(alertId)
      
      if (response.success) {
        alert.acknowledged = true
        ElMessage.success('告警已确认')
        
        // 发送浏览器通知
        if (alertSettings.notificationChannels.includes('browser')) {
          showBrowserNotification('告警已确认', `告警"${alert.title}"已被确认处理`)
        }
      } else {
        throw new Error(response.error || '确认失败')
      }
    } else {
      // 安全告警的确认逻辑
      alert.acknowledged = true
      ElMessage.success('安全告警已确认')
    }
  } catch (error) {
    console.error('Failed to acknowledge alert:', error)
    ElMessage.error('确认告警失败')
  }
}

const acknowledgeAll = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要确认全部 ${unacknowledgedCount.value} 个未处理告警吗？`,
      '批量确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const unacknowledgedAlerts = alerts.value.filter(alert => !alert.acknowledged)
    for (const alert of unacknowledgedAlerts) {
      await acknowledgeAlert(alert)
    }

    ElMessage.success('所有告警已确认')
  } catch {
    // 用户取消操作
  }
}

const viewAlertDetail = (alert: UnifiedAlert) => {
  selectedAlert.value = alert
  showDetailDialog.value = true
}

const deleteAlert = async (alert: UnifiedAlert) => {
  try {
    await ElMessageBox.confirm('确定要删除此告警吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    // 从列表中移除
    const index = alerts.value.findIndex(a => a.id === alert.id)
    if (index > -1) {
      alerts.value.splice(index, 1)
    }

    ElMessage.success('告警已删除')
  } catch {
    // 用户取消删除
  }
}

const handleSelectionChange = (selection: UnifiedAlert[]) => {
  selectedAlerts.value = selection
}

const batchAcknowledge = async () => {
  try {
    for (const alert of selectedAlerts.value) {
      if (!alert.acknowledged) {
        await acknowledgeAlert(alert)
      }
    }
    selectedAlerts.value = []
    ElMessage.success('批量确认完成')
  } catch (error) {
    ElMessage.error('批量确认失败')
  }
}

const batchDelete = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedAlerts.value.length} 个告警吗？`,
      '批量删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    for (const alert of selectedAlerts.value) {
      const index = alerts.value.findIndex(a => a.id === alert.id)
      if (index > -1) {
        alerts.value.splice(index, 1)
      }
    }

    selectedAlerts.value = []
    ElMessage.success('批量删除完成')
  } catch {
    // 用户取消删除
  }
}

const batchExport = () => {
  const exportData = selectedAlerts.value.map(alert => ({
    ...alert,
    timestamp: alert.timestamp.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString()
  }))

  const dataStr = JSON.stringify(exportData, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `alerts-export-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('告警数据已导出')
}

const exportAlert = (alert: UnifiedAlert) => {
  const exportData = {
    ...alert,
    timestamp: alert.timestamp.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString(),
    exportTime: new Date().toISOString()
  }

  const dataStr = JSON.stringify(exportData, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `alert-${alert.id}-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('告警详情已导出')
}

const showSettings = () => {
  showSettingsDialog.value = true
}

const saveSettings = () => {
  // 保存设置到本地存储
  localStorage.setItem('alertSettings', JSON.stringify(alertSettings))
  
  // 重新启动自动刷新
  if (alertSettings.autoRefresh) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }

  showSettingsDialog.value = false
  ElMessage.success('设置已保存')
}

const handleDetailClose = () => {
  showDetailDialog.value = false
  selectedAlert.value = null
}

const handleSizeChange = (size: number) => {
  pagination.pageSize = size
}

const handleCurrentChange = (page: number) => {
  pagination.currentPage = page
}

// 自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  if (alertSettings.autoRefresh) {
    refreshTimer = setInterval(() => {
      refreshAlerts()
    }, alertSettings.refreshInterval)
  }
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// 浏览器通知
const showBrowserNotification = (title: string, body: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico'
    })
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico'
        })
      }
    })
  }
}

// 工具方法
const getSeverityType = (severity: string) => {
  const typeMap: Record<string, string> = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return typeMap[severity] || 'info'
}

const getSeverityText = (severity: string) => {
  const textMap: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
  }
  return textMap[severity] || severity
}

const getAlertTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    high_response_time: '响应时间过高',
    low_availability: '可用性过低',
    high_error_rate: '错误率过高',
    connection_failure: '连接失败',
    resource_exhaustion: '资源耗尽'
  }
  return textMap[type] || type
}

const formatTime = (date: Date) => {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 生命周期
onMounted(async () => {
  // 加载设置
  const savedSettings = localStorage.getItem('alertSettings')
  if (savedSettings) {
    Object.assign(alertSettings, JSON.parse(savedSettings))
  }

  // 请求浏览器通知权限
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }

  // 初始加载数据
  await refreshAlerts()

  // 开始自动刷新
  if (alertSettings.autoRefresh) {
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.alert-manager {
  padding: 0;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.manager-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 告警统计卡片 */
.alert-stats {
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.3s;
}

.stat-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stat-card.critical {
  border-left: 4px solid #f56c6c;
}

.stat-card.high {
  border-left: 4px solid #e6a23c;
}

.stat-card.medium {
  border-left: 4px solid #409eff;
}

.stat-card.total {
  border-left: 4px solid #67c23a;
}

.stat-icon {
  margin-right: 16px;
  color: #666;
}

.stat-card.critical .stat-icon {
  color: #f56c6c;
}

.stat-card.high .stat-icon {
  color: #e6a23c;
}

.stat-card.medium .stat-icon {
  color: #409eff;
}

.stat-card.total .stat-icon {
  color: #67c23a;
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #333;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

/* 筛选器 */
.alert-filters {
  margin-bottom: 20px;
}

/* 告警列表 */
.alert-list {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

/* 批量操作 */
.batch-actions {
  margin-top: 16px;
}

.batch-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 告警详情 */
.alert-detail {
  padding: 16px 0;
}

.detail-content {
  margin: 20px 0;
}

.detail-content h4 {
  margin: 16px 0 8px 0;
  font-size: 16px;
  color: #333;
}

.detail-content p {
  margin: 8px 0;
  line-height: 1.6;
  color: #666;
}

.detail-content ul {
  margin: 8px 0;
  padding-left: 24px;
}

.detail-content li {
  margin-bottom: 4px;
  line-height: 1.5;
  color: #666;
}

.detail-actions {
  margin-top: 20px;
  text-align: center;
}

/* 设置表单 */
.form-help {
  margin-left: 8px;
  font-size: 12px;
  color: #999;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .manager-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .stat-card {
    padding: 16px;
  }
  
  .stat-number {
    font-size: 24px;
  }
  
  .batch-buttons {
    flex-direction: column;
    gap: 8px;
  }
  
  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}
</style>









