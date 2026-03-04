<template>
  <div class="logs-panel">
    <el-form :inline="true" class="toolbar" @submit.prevent>
      <el-form-item label="等级">
        <el-select v-model="filters.level" placeholder="全部" style="width: 120px">
          <el-option label="全部" :value="''" />
          <el-option label="DEBUG" value="debug" />
          <el-option label="INFO" value="info" />
          <el-option label="WARN" value="warn" />
          <el-option label="ERROR" value="error" />
        </el-select>
      </el-form-item>

      <el-form-item label="时间范围">
        <el-date-picker
          v-model="filters.range"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          :shortcuts="dateShortcuts"
        />
      </el-form-item>

      <el-form-item label="关键词">
        <el-input v-model="filters.search" placeholder="消息/来源" style="width: 200px" clearable />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="loading" @click="loadLogs(1)">查询</el-button>
        <el-button @click="resetFilters">清空</el-button>
      </el-form-item>

      <div class="flex-spacer" />

      <el-form-item>
        <el-button type="warning" :icon="Delete" @click="showCleanupDialog = true">
          清理日志
        </el-button>
      </el-form-item>

      <el-form-item>
        <el-dropdown @command="exportLogs">
          <el-button :loading="exporting">
            导出 <el-icon class="el-icon--right"><Download /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">JSON</el-dropdown-item>
              <el-dropdown-item command="csv">CSV</el-dropdown-item>
              <el-dropdown-item command="txt">TXT</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-form-item>
    </el-form>

    <!-- 日志清理对话框 -->
    <el-dialog
      v-model="showCleanupDialog"
      title="清理过期日志"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-alert
        title="注意"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px"
      >
        <p>清理操作将永久删除过期的日志记录，无法恢复！</p>
        <p>当前日志总数：<strong>{{ total.toLocaleString() }}</strong> 条</p>
      </el-alert>

      <el-form label-width="120px">
        <el-form-item label="保留天数">
          <el-radio-group v-model="cleanupRetentionDays">
            <el-radio :label="1">最近1天</el-radio>
            <el-radio :label="7">最近7天（推荐）</el-radio>
            <el-radio :label="30">最近30天</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="预计删除">
          <el-text type="danger" size="large" v-if="!estimating">
            约 {{ estimatedDeleteCount.toLocaleString() }} 条记录
          </el-text>
          <el-text v-else>计算中...</el-text>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCleanupDialog = false">取消</el-button>
        <el-button
          type="danger"
          :loading="cleaning"
          @click="confirmCleanup"
        >
          确认清理
        </el-button>
      </template>
    </el-dialog>

    <el-table :data="logs" border size="small" v-loading="loading" class="log-table">
      <el-table-column prop="timestamp" label="时间" width="180" />
      <el-table-column prop="level" label="等级" width="90">
        <template #default="{ row }">
          <el-tag :type="levelTagType(row.level)" size="small">{{ row.level.toUpperCase() }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="140" />
      <el-table-column prop="message" label="消息" min-width="400">
        <template #default="{ row }">
          <span class="log-message">{{ row.message }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :current-page="page"
        :page-sizes="[50, 100, 200, 500]"
        :page-size="pageSize"
        :total="total"
        @size-change="handlePageSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { logService, type LogEntry } from '@/services/logService'
import { Download, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const logs = ref<LogEntry[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(100)
const loading = ref(false)
const exporting = ref(false)
const cleaning = ref(false)
const showCleanupDialog = ref(false)
const cleanupRetentionDays = ref(7)
const estimatedDeleteCount = ref(0)
const estimating = ref(false)

const dateShortcuts = [
  {
    text: '最近1小时',
    value: () => {
      const end = new Date(); const start = new Date(end.getTime() - 3600_000); return [start, end]
    }
  },
  {
    text: '今天',
    value: () => {
      const end = new Date(); const start = new Date(); start.setHours(0,0,0,0); return [start, end]
    }
  }
]

const filters = reactive<{ level: string; range: [string, string] | null; search: string }>({ level: '', range: null, search: '' })

function toIso(s: string) {
  // s like 'YYYY-MM-DD HH:mm:ss' -> ISO
  if (!s) return ''
  const ds = s.replace(' ', 'T')
  const d = new Date(ds)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

const handlePageSizeChange = (size: number) => {
  pageSize.value = size
  void loadLogs(1)
}

const handlePageChange = (p: number) => {
  void loadLogs(p)
}

async function loadLogs(p = 1) {
  loading.value = true
  try {
    page.value = p
    const query: any = { limit: pageSize.value, offset: (page.value - 1) * pageSize.value }
    if (filters.level) query.level = filters.level
    if (filters.search) query.search = filters.search
    if (filters.range && filters.range.length === 2) {
      query.startTime = toIso(filters.range[0])
      query.endTime = toIso(filters.range[1])
    }
    const resp = await logService.getSystemLogs(query)
    logs.value = resp.logs
    total.value = resp.total
  } catch (e) {
    ElMessage.error('日志加载失败')
  } finally {
    loading.value = false
  }
}

function levelTagType(lvl: string) {
  switch (lvl) {
    case 'error': return 'danger'
    case 'warn': return 'warning'
    case 'info': return 'success'
    default: return ''
  }
}

function resetFilters() {
  filters.level = ''
  filters.search = ''
  filters.range = null as any
  loadLogs(1)
}

async function exportLogs(format: 'json' | 'csv' | 'txt') {
  exporting.value = true
  try {
    const query: any = {}
    if (filters.level) query.level = filters.level
    if (filters.search) query.search = filters.search
    if (filters.range && filters.range.length === 2) {
      query.startTime = toIso(filters.range[0])
      query.endTime = toIso(filters.range[1])
    }
    const blob = await logService.exportLogs(query, format)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-logs.${format}`
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function fetchEstimate() {
  estimating.value = true
  try {
    const result = await logService.estimateCleanup(cleanupRetentionDays.value)
    estimatedDeleteCount.value = result.deleteCount
    total.value = result.totalCount  // 更新总数为准确值
  } catch (e) {
    console.error('获取预估数据失败', e)
    estimatedDeleteCount.value = 0
  } finally {
    estimating.value = false
  }
}

async function confirmCleanup() {
  cleaning.value = true
  try {
    const response = await logService.cleanupLogs(cleanupRetentionDays.value)
    ElMessage.success(`清理完成！删除了 ${response.deletedCount.toLocaleString()} 条日志`)
    // 重新加载日志列表
    await loadLogs(1)
  } catch (error: any) {
    ElMessage.error('清理失败：' + (error.message || '未知错误'))
  } finally {
    cleaning.value = false
    showCleanupDialog.value = false  // 无论成功失败都关闭对话框
  }
}

onMounted(() => { loadLogs(1) })
watch(() => [filters.level, filters.search], () => loadLogs(1))

// 对话框打开时获取预估数据
watch(showCleanupDialog, (visible) => {
  if (visible) fetchEstimate()
})

// 保留天数变化时重新获取预估
watch(cleanupRetentionDays, () => {
  if (showCleanupDialog.value) fetchEstimate()
})
</script>

<style scoped>
.toolbar { margin-bottom: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.flex-spacer { flex: 1 }
.log-table { min-height: 300px }
.log-message { white-space: pre-wrap; word-break: break-word }
.pager { display: flex; justify-content: flex-end; margin-top: 12px }
</style>
