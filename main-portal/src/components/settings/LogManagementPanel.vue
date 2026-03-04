<template>
  <div class="log-management-panel">
    <!-- 存储统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><Document /></el-icon>
              <span>日志文件数</span>
            </div>
          </template>
          <div class="stat-value">{{ stats.totalFiles || 0 }}</div>
          <div class="stat-label">个文件</div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><FolderOpened /></el-icon>
              <span>总占用空间</span>
            </div>
          </template>
          <div class="stat-value">{{ stats.totalSizeFormatted || '0 B' }}</div>
          <div class="stat-label">{{ getSizePercent() }}% 已使用</div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><Calendar /></el-icon>
              <span>日志时间范围</span>
            </div>
          </template>
          <div class="stat-value">{{ getTimeRange() }}</div>
          <div class="stat-label">{{ getDaysCount() }} 天</div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><Setting /></el-icon>
              <span>保留策略</span>
            </div>
          </template>
          <div class="stat-value">{{ config.retentionDays || 7 }}</div>
          <div class="stat-label">天自动清理</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 操作工具栏 -->
    <el-card shadow="never" class="action-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button type="primary" @click="refreshData" :loading="loading">
            <el-icon><Refresh /></el-icon> 刷新数据
          </el-button>
          <el-button type="warning" @click="showCleanupDialog" :loading="cleaningUp">
            <el-icon><Delete /></el-icon> 清理日志
          </el-button>
          <el-button type="success" @click="showArchiveDialog" :loading="archiving">
            <el-icon><Box /></el-icon> 归档日志
          </el-button>
          <el-button @click="showConfigDialog">
            <el-icon><Setting /></el-icon> 配置策略
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 日志文件列表 -->
    <el-card shadow="never" class="files-card">
      <template #header>
        <div class="card-header-row">
          <span>日志文件列表</span>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索文件名..."
            style="width: 200px"
            clearable
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </template>

      <el-table :data="filteredFiles" v-loading="loading" border>
        <el-table-column prop="name" label="文件名" min-width="200" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sizeFormatted" label="大小" width="120" />
        <el-table-column prop="lastModified" label="最后修改时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.lastModified) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="deleteFile(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 清理对话框 -->
    <el-dialog v-model="cleanupDialogVisible" title="清理日志" width="500px">
      <el-form :model="cleanupForm" label-width="120px">
        <el-form-item label="清理策略">
          <el-radio-group v-model="cleanupForm.strategy">
            <el-radio value="age">按时间清理</el-radio>
            <el-radio value="type">按类型清理</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="清理日志" v-if="cleanupForm.strategy === 'age'">
          <el-input-number v-model="cleanupForm.olderThanDays" :min="1" :max="365" />
          <span class="input-suffix">天前</span>
        </el-form-item>

        <el-form-item label="日志类型" v-if="cleanupForm.strategy === 'type'">
          <el-select v-model="cleanupForm.type" placeholder="选择类型">
            <el-option label="全部" value="" />
            <el-option label="Winston日志" value="winston" />
            <el-option label="PM2日志" value="pm2" />
            <el-option label="系统日志" value="system" />
          </el-select>
        </el-form-item>

        <el-form-item label="模拟运行">
          <el-switch v-model="cleanupForm.dryRun" />
          <span class="form-hint">（不会真正删除文件）</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="cleanupDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="executeCleanup" :loading="cleaningUp">
          {{ cleanupForm.dryRun ? '模拟清理' : '确认清理' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 归档对话框 -->
    <el-dialog v-model="archiveDialogVisible" title="归档日志" width="500px">
      <el-form :model="archiveForm" label-width="120px">
        <el-form-item label="归档日志">
          <el-input-number v-model="archiveForm.olderThanDays" :min="1" :max="365" />
          <span class="input-suffix">天前</span>
        </el-form-item>

        <el-form-item label="日志类型">
          <el-select v-model="archiveForm.type" placeholder="选择类型">
            <el-option label="全部" value="" />
            <el-option label="Winston日志" value="winston" />
            <el-option label="PM2日志" value="pm2" />
            <el-option label="系统日志" value="system" />
          </el-select>
        </el-form-item>

        <el-alert
          title="归档后原文件将被删除，并压缩保存到归档目录"
          type="info"
          :closable="false"
          style="margin-bottom: 12px"
        />
      </el-form>

      <template #footer>
        <el-button @click="archiveDialogVisible = false">取消</el-button>
        <el-button type="success" @click="executeArchive" :loading="archiving">
          确认归档
        </el-button>
      </template>
    </el-dialog>

    <!-- 配置对话框 -->
    <el-dialog v-model="configDialogVisible" title="日志管理配置" width="600px">
      <el-form :model="configForm" label-width="140px">
        <el-form-item label="自动保留天数">
          <el-input-number v-model="configForm.retentionDays" :min="1" :max="365" />
          <span class="input-suffix">天</span>
        </el-form-item>

        <el-form-item label="最大总容量">
          <el-input-number v-model="configForm.maxTotalSize" :min="10" :max="10000" />
          <span class="input-suffix">MB</span>
        </el-form-item>

        <el-form-item label="启用自动清理">
          <el-switch v-model="configForm.autoCleanup" />
        </el-form-item>

        <el-form-item label="启用自动归档">
          <el-switch v-model="configForm.enableArchive" />
        </el-form-item>

        <el-form-item label="归档触发天数" v-if="configForm.enableArchive">
          <el-input-number v-model="configForm.archiveAfterDays" :min="1" :max="365" />
          <span class="input-suffix">天</span>
        </el-form-item>

        <el-form-item label="单文件大小限制">
          <el-input-number v-model="configForm.maxFileSize" :min="1" :max="100" />
          <span class="input-suffix">MB</span>
        </el-form-item>

        <el-form-item label="最大文件数量">
          <el-input-number v-model="configForm.maxFiles" :min="1" :max="100" />
          <span class="input-suffix">个</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="savingConfig">
          保存配置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document,
  FolderOpened,
  Calendar,
  Setting,
  Refresh,
  Delete,
  Box,
  Search
} from '@element-plus/icons-vue'
import { apiService } from '@/services/api'

interface LogFile {
  name: string
  path: string
  size: number
  sizeFormatted: string
  lastModified: string
  type: 'winston' | 'pm2' | 'system'
  isArchived: boolean
}

interface Stats {
  totalFiles: number
  totalSize: number
  totalSizeFormatted: string
  oldestLog: string | null
  newestLog: string | null
}

interface Config {
  retentionDays: number
  maxTotalSize: number
  autoCleanup: boolean
  cleanupSchedule: string
  enableArchive: boolean
  archiveAfterDays: number
  archivePath: string
  maxFileSize: number
  maxFiles: number
}

const loading = ref(false)
const cleaningUp = ref(false)
const archiving = ref(false)
const savingConfig = ref(false)
const searchKeyword = ref('')

const files = ref<LogFile[]>([])
const stats = ref<Stats>({
  totalFiles: 0,
  totalSize: 0,
  totalSizeFormatted: '0 B',
  oldestLog: null,
  newestLog: null
})

const config = ref<Config>({
  retentionDays: 7,
  maxTotalSize: 100,
  autoCleanup: true,
  cleanupSchedule: '0 2 * * *',
  enableArchive: true,
  archiveAfterDays: 3,
  archivePath: '',
  maxFileSize: 10,
  maxFiles: 10
})

// 对话框
const cleanupDialogVisible = ref(false)
const archiveDialogVisible = ref(false)
const configDialogVisible = ref(false)

// 表单
const cleanupForm = ref({
  strategy: 'age',
  olderThanDays: 7,
  type: '',
  dryRun: true
})

const archiveForm = ref({
  olderThanDays: 3,
  type: ''
})

const configForm = ref({...config.value})

// 计算属性
const filteredFiles = computed(() => {
  if (!searchKeyword.value) return files.value
  return files.value.filter(f => 
    f.name.toLowerCase().includes(searchKeyword.value.toLowerCase())
  )
})

// 方法
const refreshData = async () => {
  loading.value = true
  try {
    await Promise.all([loadFiles(), loadStats(), loadConfig()])
    ElMessage.success('数据刷新成功')
  } catch (error) {
    ElMessage.error('刷新数据失败')
  } finally {
    loading.value = false
  }
}

const loadFiles = async () => {
  const resp = await apiService.get('/log-management/files')
  if (resp.success) {
    files.value = resp.data || []
  }
}

const loadStats = async () => {
  const resp = await apiService.get('/log-management/stats')
  if (resp.success) {
    stats.value = resp.data || stats.value
  }
}

const loadConfig = async () => {
  const resp = await apiService.get('/log-management/config')
  if (resp.success) {
    config.value = resp.data || config.value
    configForm.value = {...config.value}
  }
}

const showCleanupDialog = () => {
  cleanupForm.value.olderThanDays = config.value.retentionDays
  cleanupDialogVisible.value = true
}

const showArchiveDialog = () => {
  archiveForm.value.olderThanDays = config.value.archiveAfterDays
  archiveDialogVisible.value = true
}

const showConfigDialog = () => {
  configForm.value = {...config.value}
  configDialogVisible.value = true
}

const executeCleanup = async () => {
  cleaningUp.value = true
  try {
    const resp = await apiService.post('/log-management/cleanup', {
      olderThanDays: cleanupForm.value.olderThanDays,
      type: cleanupForm.value.type || undefined,
      dryRun: cleanupForm.value.dryRun
    })
    
    if (resp.success) {
      ElMessage.success(resp.message || '清理成功')
      cleanupDialogVisible.value = false
      await refreshData()
    } else {
      ElMessage.error(resp.error || '清理失败')
    }
  } catch (error) {
    ElMessage.error('清理操作失败')
  } finally {
    cleaningUp.value = false
  }
}

const executeArchive = async () => {
  try {
    await ElMessageBox.confirm('确认要归档日志吗？归档后原文件将被删除。', '归档确认', {
      type: 'warning'
    })
  } catch {
    return
  }

  archiving.value = true
  try {
    const resp = await apiService.post('/log-management/archive', {
      olderThanDays: archiveForm.value.olderThanDays,
      type: archiveForm.value.type || undefined
    })
    
    if (resp.success) {
      ElMessage.success(resp.message || '归档成功')
      archiveDialogVisible.value = false
      await refreshData()
    } else {
      ElMessage.error(resp.error || '归档失败')
    }
  } catch (error) {
    ElMessage.error('归档操作失败')
  } finally {
    archiving.value = false
  }
}

const saveConfig = async () => {
  savingConfig.value = true
  try {
    const resp = await apiService.put('/log-management/config', configForm.value)
    
    if (resp.success) {
      ElMessage.success('配置保存成功')
      config.value = resp.data
      configDialogVisible.value = false
    } else {
      ElMessage.error(resp.error || '配置保存失败')
    }
  } catch (error) {
    ElMessage.error('配置保存失败')
  } finally {
    savingConfig.value = false
  }
}

const deleteFile = async (file: LogFile) => {
  try {
    await ElMessageBox.confirm(`确认要删除文件 "${file.name}" 吗？此操作不可恢复。`, '删除确认', {
      type: 'warning'
    })
    
    // TODO: 实现单个文件删除API
    ElMessage.info('此功能正在开发中')
  } catch {
    // 用户取消
  }
}

const getSizePercent = () => {
  if (!config.value.maxTotalSize) return 0
  const maxBytes = config.value.maxTotalSize * 1024 * 1024
  return Math.min(100, Math.round((stats.value.totalSize / maxBytes) * 100))
}

const getTimeRange = () => {
  if (!stats.value.oldestLog || !stats.value.newestLog) return '无数据'
  return `${stats.value.oldestLog.split('T')[0]} 至今`
}

const getDaysCount = () => {
  if (!stats.value.oldestLog || !stats.value.newestLog) return 0
  const oldest = new Date(stats.value.oldestLog)
  const newest = new Date(stats.value.newestLog)
  return Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
}

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    winston: 'primary',
    pm2: 'success',
    system: 'warning'
  }
  return colors[type] || 'info'
}

const formatTime = (time: string) => {
  return new Date(time).toLocaleString('zh-CN')
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.log-management-panel {
  padding: 20px;
}

.stats-row {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 13px;
  color: #909399;
}

.action-card {
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.files-card {
  margin-bottom: 16px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-suffix {
  margin-left: 8px;
  color: #909399;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
</style>

