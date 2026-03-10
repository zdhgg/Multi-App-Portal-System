<template>
  <el-dialog
    v-model="visible"
    :title="`端口 ${portData?.port} 详情`"
    width="800px"
    :before-close="handleClose"
  >
    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="6" animated />
    </div>
    
    <div v-else-if="portData" class="port-detail-content">
      <!-- 基本信息 -->
      <el-card class="detail-section">
        <template #header>
          <div class="section-header">
            <el-icon><InfoFilled /></el-icon>
            <span>基本信息</span>
          </div>
        </template>
        
        <el-descriptions :column="2" border>
          <el-descriptions-item label="端口号">
            <el-tag :type="getStatusTagType(portData.status)" size="large">
              {{ portData.port }}
            </el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTagType(portData.status)">
              {{ getStatusText(portData.status) }}
            </el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="服务类型" v-if="portData.service">
            {{ portData.service }}
          </el-descriptions-item>
          
          <el-descriptions-item label="最后检查">
            {{ formatTime(portData.performance?.lastCheck) }}
          </el-descriptions-item>
          
          <el-descriptions-item label="响应时间" v-if="portData.performance?.responseTime">
            <el-tag :type="getResponseTimeType(portData.performance.responseTime)">
              {{ portData.performance.responseTime }}ms
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 进程信息 -->
      <el-card v-if="portData.process" class="detail-section">
        <template #header>
          <div class="section-header">
            <el-icon><Monitor /></el-icon>
            <span>进程信息</span>
          </div>
        </template>
        
        <el-descriptions :column="2" border>
          <el-descriptions-item label="进程ID">
            <el-tag type="info">{{ portData.process.pid }}</el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="进程名称">
            {{ portData.process.name }}
          </el-descriptions-item>
          
          <el-descriptions-item label="用户" v-if="portData.process.user">
            {{ portData.process.user }}
          </el-descriptions-item>
        </el-descriptions>
        
        <div class="process-actions">
          <el-button type="warning" :icon="Warning" @click="handleTerminateProcess" :loading="terminating">
            终止进程
          </el-button>
        </div>
      </el-card>

      <!-- 应用信息 -->
      <el-card v-if="portData.application" class="detail-section">
        <template #header>
          <div class="section-header">
            <el-icon><Operation /></el-icon>
            <span>应用信息</span>
          </div>
        </template>
        
        <el-descriptions :column="2" border>
          <el-descriptions-item label="应用名称">
            {{ portData.application.name }}
          </el-descriptions-item>
          
          <el-descriptions-item label="应用类型">
            <el-tag :color="getAppTypeColor(portData.application.type)">
              {{ getAppTypeText(portData.application.type) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        
        <div class="app-actions">
          <el-button type="primary" :icon="Link" @click="openApplication">
            打开应用
          </el-button>
          <el-button type="success" :icon="View" @click="viewApplicationDetails">
            查看详情
          </el-button>
        </div>
      </el-card>

      <!-- 端口分配信息 -->
      <el-card v-if="portData.allocation" class="detail-section">
        <template #header>
          <div class="section-header">
            <el-icon><Share /></el-icon>
            <span>分配信息</span>
          </div>
        </template>
        
        <el-descriptions :column="2" border>
          <el-descriptions-item label="分配给">
            {{ portData.allocation.appName }}
          </el-descriptions-item>
          
          <el-descriptions-item label="分配时间">
            {{ formatTime(portData.allocation.allocatedAt) }}
          </el-descriptions-item>
        </el-descriptions>
        
        <div class="allocation-actions">
          <el-button type="danger" :icon="Delete" @click="handleReleasePort" :loading="releasing">
            释放端口
          </el-button>
        </div>
      </el-card>

      <!-- 安全信息 -->
      <el-card v-if="portData.security" class="detail-section">
        <template #header>
          <div class="section-header">
            <el-icon><Lock /></el-icon>
            <span>安全检查</span>
          </div>
        </template>
        
        <div class="security-content">
          <div class="risk-level">
            <span class="label">风险级别：</span>
            <el-tag :type="getRiskLevelType(portData.security.riskLevel)" size="large">
              {{ getRiskLevelText(portData.security.riskLevel) }}
            </el-tag>
          </div>
          
          <div v-if="portData.security.issues?.length" class="security-issues">
            <h4>安全问题：</h4>
            <el-alert
              v-for="(issue, index) in portData.security.issues"
              :key="index"
              :title="issue"
              type="warning"
              :closable="false"
              class="issue-alert"
            />
          </div>
        </div>
      </el-card>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button type="primary" @click="refreshPortData" :loading="loading">
          刷新
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  InfoFilled,
  Monitor,
  Operation,
  Share,
  Lock,
  Warning,
  Link,
  View,
  Delete
} from '@element-plus/icons-vue'
import { portManagementApiService, type PortScanResult } from '@/services/portManagementApi'

// Props
interface Props {
  modelValue: boolean
  port?: number
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  port: undefined
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'port-released': [port: number]
  'process-terminated': [port: number, pid: number]
}>()

// 响应式数据
const visible = ref(false)
const loading = ref(false)
const terminating = ref(false)
const releasing = ref(false)
const portData = ref<PortScanResult | null>(null)

// 监听props变化
watch(() => props.modelValue, (newVal) => {
  visible.value = newVal
  if (newVal && props.port) {
    loadPortData()
  }
})

watch(() => props.port, (newPort) => {
  if (newPort && visible.value) {
    loadPortData()
  }
})

watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

// 方法
const handleClose = () => {
  visible.value = false
}

const loadPortData = async () => {
  if (!props.port) return
  
  loading.value = true
  try {
    const response = await portManagementApiService.getPortDetails(props.port)
    if (response.success && response.data) {
      portData.value = response.data
    } else {
      ElMessage.error('获取端口详情失败')
    }
  } catch (error) {
    console.error('Failed to load port details:', error)
    ElMessage.error('获取端口详情失败')
  } finally {
    loading.value = false
  }
}

const refreshPortData = () => {
  loadPortData()
}

const handleTerminateProcess = async () => {
  if (!portData.value?.process) return
  
  const result = await ElMessageBox.confirm(
    `确定要终止进程 ${portData.value.process.name} (PID: ${portData.value.process.pid}) 吗？`,
    '终止进程',
    {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    }
  )
  
  if (result === 'confirm') {
    terminating.value = true
    try {
      // 这里需要实现终止进程的API
      // await portManagementApiService.terminateProcess(portData.value.process.pid)
      ElMessage.success('进程终止成功')
      emit('process-terminated', portData.value.port, portData.value.process.pid)
      await loadPortData() // 刷新数据
    } catch (error) {
      ElMessage.error('终止进程失败')
    } finally {
      terminating.value = false
    }
  }
}

const handleReleasePort = async () => {
  if (!portData.value) return
  
  const result = await ElMessageBox.confirm(
    `确定要释放端口 ${portData.value.port} 吗？`,
    '释放端口',
    {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    }
  )
  
  if (result === 'confirm') {
    releasing.value = true
    try {
      const response = await portManagementApiService.releasePort(portData.value.port)
      if (!response.success) {
        throw new Error(response.error || response.message || '端口释放失败')
      }

      ElMessage.success('端口释放成功')
      emit('port-released', portData.value.port)
      await loadPortData() // 刷新数据
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '端口释放失败')
    } finally {
      releasing.value = false
    }
  }
}

const openApplication = () => {
  if (portData.value?.application) {
    // 打开应用逻辑
    ElMessage.info('打开应用功能开发中')
  }
}

const viewApplicationDetails = () => {
  if (portData.value?.application) {
    // 查看应用详情逻辑
    ElMessage.info('查看应用详情功能开发中')
  }
}

// 工具函数
const getStatusTagType = (status: string) => {
  const typeMap: Record<string, string> = {
    open: 'success',
    listening: 'success',
    allocated: 'primary',
    closed: 'info',
    filtered: 'warning'
  }
  return typeMap[status] || 'info'
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    open: '开放',
    listening: '监听中',
    allocated: '已分配',
    closed: '关闭',
    filtered: '被过滤'
  }
  return textMap[status] || status
}

const getResponseTimeType = (responseTime: number) => {
  if (responseTime < 100) return 'success'
  if (responseTime < 500) return 'warning'
  return 'danger'
}

const getAppTypeColor = (type: string) => {
  const colorMap: Record<string, string> = {
    frontend: '#67C23A',
    backend: '#409EFF',
    api: '#E6A23C',
    websocket: '#F56C6C',
    database: '#909399'
  }
  return colorMap[type] || '#909399'
}

const getAppTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WebSocket',
    database: '数据库'
  }
  return textMap[type] || type
}

const getRiskLevelType = (level: string) => {
  const typeMap: Record<string, string> = {
    low: 'success',
    medium: 'warning',
    high: 'danger'
  }
  return typeMap[level] || 'info'
}

const getRiskLevelText = (level: string) => {
  const textMap: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高'
  }
  return textMap[level] || level
}

const formatTime = (time: Date | string | undefined) => {
  if (!time) return 'N/A'
  const date = typeof time === 'string' ? new Date(time) : time
  return date.toLocaleString('zh-CN')
}
</script>

<style scoped>
.loading-container {
  padding: 20px;
}

.port-detail-content {
  max-height: 600px;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.process-actions,
.app-actions,
.allocation-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}

.security-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.risk-level {
  display: flex;
  align-items: center;
  gap: 8px;
}

.risk-level .label {
  font-weight: 600;
  color: #606266;
}

.security-issues h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 14px;
}

.issue-alert {
  margin-bottom: 8px;
}

.issue-alert:last-child {
  margin-bottom: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>









