<template>
  <div class="backup-panel">
    <div class="toolbar">
      <el-button type="primary" :loading="creating" @click="createBackup">创建备份</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".json" @change="onUpload">
        <el-button>从文件导入</el-button>
      </el-upload>
      <div class="spacer" />
      <el-input v-model="keyword" placeholder="搜索备份名称/ID" style="width: 220px" clearable />
    </div>

    <el-table :data="filteredBackups" border size="small" v-loading="loading">
      <el-table-column prop="name" label="名称" min-width="200" />
      <el-table-column prop="id" label="ID" width="240" />
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="大小" width="100">
        <template #default="{ row }">{{ formatSize(row.size) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="restore(row)" :loading="restoringId===row.id">恢复</el-button>
          <el-button size="small" type="danger" @click="remove(row)" :loading="deletingId===row.id">删除</el-button>
          <el-button size="small" @click="view(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="filteredBackups.length"
        @current-change="handlePageChange"
      />
    </div>

    <el-dialog v-model="detail.visible" title="备份详情" width="560px">
      <pre class="json">{{ JSON.stringify(detail.data, null, 2) }}</pre>
      <template #footer><el-button @click="detail.visible=false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { configExportApiService, type BackupInfo } from '@/services/configExportApi'
import { ElMessage, ElMessageBox } from 'element-plus'

const backups = ref<BackupInfo[]>([])
const loading = ref(false)
const creating = ref(false)
const restoringId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const keyword = ref('')
const page = ref(1)
const pageSize = 10

const detail = ref<{ visible: boolean; data: any }>({ visible: false, data: null })

const handlePageChange = (p: number) => {
  page.value = p
}

const loadBackups = async () => {
  loading.value = true
  try {
    const resp = await configExportApiService.listBackups()
    backups.value = resp.data || []
  } catch {
    ElMessage.error('获取备份列表失败')
  } finally { loading.value = false }
}

const filteredBackups = computed(() => {
  const list = backups.value.filter(b => !keyword.value || b.name.includes(keyword.value) || b.id.includes(keyword.value))
  const start = (page.value - 1) * pageSize
  return list.slice(start, start + pageSize)
})

function formatSize(size: number) {
  if (size > 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
  if (size > 1024) return (size / 1024).toFixed(1) + ' KB'
  return size + ' B'
}
function formatTime(s: string | Date) { return new Date(s).toLocaleString() }

async function createBackup() {
  creating.value = true
  try {
    const resp = await configExportApiService.createBackup({ includeEnvironments: true, includeTemplates: true })
    if (resp.success) {
      ElMessage.success('备份创建成功')
      await loadBackups()
    } else { throw new Error() }
  } catch { ElMessage.error('创建备份失败') } finally { creating.value = false }
}

async function restore(row: BackupInfo) {
  try {
    await ElMessageBox.confirm(`确认从备份“${row.name}”恢复吗？当前配置将被覆盖（已自动创建恢复前备份）。`, '恢复确认', { type: 'warning' })
  } catch { return }
  restoringId.value = row.id
  try {
    const resp = await configExportApiService.restoreBackup(row.id, { overwriteExisting: true, createBackup: true })
    if (resp.success) ElMessage.success('恢复完成')
    else ElMessage.warning(resp.error || '恢复完成但存在警告')
  } catch { ElMessage.error('恢复失败') } finally { restoringId.value = null }
}

async function remove(row: BackupInfo) {
  try { await ElMessageBox.confirm(`确认删除备份“${row.name}”？`, '删除确认', { type: 'warning' }) } catch { return }
  deletingId.value = row.id
  try { await configExportApiService.deleteBackup(row.id); ElMessage.success('已删除'); await loadBackups() } catch { ElMessage.error('删除失败') } finally { deletingId.value = null }
}

function view(row: BackupInfo) { detail.value = { visible: true, data: row } }

async function onUpload(fileEvent: any) {
  const raw: File | undefined = fileEvent?.raw
  if (!raw) return
  try { 
    await configExportApiService.importFromFile(raw, { overwriteExisting: true, createBackup: true })
    ElMessage.success('导入成功'); await loadBackups() 
  } catch { ElMessage.error('导入失败') }
}

onMounted(loadBackups)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.spacer { flex: 1 }
.json { background: #0b1020; color: #d8e0ff; padding: 12px; border-radius: 8px; max-height: 420px; overflow: auto }
.pager { display: flex; justify-content: flex-end; margin-top: 12px }
</style>
