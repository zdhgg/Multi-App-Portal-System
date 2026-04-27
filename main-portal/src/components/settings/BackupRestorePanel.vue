<template>
  <div class="backup-panel">
    <el-alert
      title="当前页面统一展示配置快照和文件归档备份。配置快照支持在线恢复；脚本归档会拉起本机离线恢复向导，以便安全回滚数据库和项目文件。"
      type="info"
      show-icon
      :closable="false"
      class="backup-alert"
    />

    <div class="control-card">
      <div class="control-card__header">
        <div>
          <div class="control-card__title">备份策略</div>
          <div class="control-card__subtitle">这里调整自动备份计划、保留周期和存储路径，修改后使用页面顶部保存按钮生效。</div>
        </div>
        <el-tag size="small" :type="policySettings.enableAutoBackup ? 'success' : 'info'">
          {{ policySettings.enableAutoBackup ? '自动备份已启用' : '自动备份已关闭' }}
        </el-tag>
      </div>

      <el-form label-width="96px" class="control-form">
        <div class="control-grid">
          <el-form-item label="自动备份">
            <el-switch v-model="policySettings.enableAutoBackup" @change="emitPolicySettingsChange" />
          </el-form-item>

          <el-form-item label="执行周期">
            <el-select
              v-model="policySettings.backupInterval"
              :disabled="!policySettings.enableAutoBackup"
              @change="emitPolicySettingsChange"
            >
              <el-option label="每小时" value="hourly" />
              <el-option label="每天" value="daily" />
              <el-option label="每周" value="weekly" />
              <el-option label="每月" value="monthly" />
            </el-select>
          </el-form-item>

          <el-form-item label="执行时间">
            <el-time-select
              v-model="policySettings.backupTime"
              start="00:00"
              step="00:30"
              end="23:30"
              format="HH:mm"
              placeholder="选择时间"
              :disabled="!policySettings.enableAutoBackup"
              @change="emitPolicySettingsChange"
            />
          </el-form-item>

          <el-form-item label="保留天数">
            <el-input-number
              v-model="policySettings.retentionDays"
              :min="1"
              :max="365"
              @change="emitPolicySettingsChange"
            />
          </el-form-item>

          <el-form-item label="存储路径" class="control-grid__path">
            <el-input
              v-model="policySettings.backupPath"
              placeholder="./backups"
              readonly
              @click="pickBackupPath"
            >
              <template #append>
                <el-button :loading="pickingBackupPath" @click.stop="pickBackupPath">{{ directoryPickerActionLabel }}</el-button>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="用户数据">
            <el-switch v-model="policySettings.includeUserData" @change="emitPolicySettingsChange" />
          </el-form-item>

          <el-form-item label="归档日志">
            <el-switch v-model="policySettings.includeLogs" @change="emitPolicySettingsChange" />
          </el-form-item>

          <el-form-item label="压缩输出">
            <el-switch v-model="policySettings.compressionEnabled" @change="emitPolicySettingsChange" />
          </el-form-item>
        </div>
      </el-form>
    </div>

    <div class="toolbar">
      <el-button type="primary" :loading="creating" @click="openCreateBackupDialog">创建备份</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".json" @change="onUpload">
        <el-button>从文件导入</el-button>
      </el-upload>
      <div class="spacer" />
      <el-input v-model="keyword" placeholder="搜索备份名称/ID" style="width: 220px" clearable />
    </div>

    <el-table :data="pagedBackups" border size="small" v-loading="loading">
      <el-table-column prop="name" label="名称" min-width="200" />
      <el-table-column label="来源" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.source === 'configuration-export' ? 'primary' : 'success'">
            {{ row.source === 'configuration-export' ? '配置快照' : '脚本归档' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ formatBackupType(row) }}</template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="240" />
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="大小" width="100">
        <template #default="{ row }">{{ formatSize(row.size) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.available === false ? 'danger' : 'info'">
            {{ row.available === false ? '文件缺失' : '可用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            @click.stop="restore(row)"
            :loading="restoringId===row.id"
            :disabled="row.available === false"
          >
            {{ getRestoreActionLabel(row) }}
          </el-button>
          <el-popconfirm
            :title="getDeleteConfirmText(row)"
            width="300"
            confirm-button-text="确定删除"
            cancel-button-text="取消"
            confirm-button-type="danger"
            @confirm="deleteBackupRecord(row)"
          >
            <template #reference>
              <el-button
                size="small"
                type="danger"
                @click.stop
                :loading="deletingId===row.id"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
          <el-button size="small" @click.stop="view(row)">查看</el-button>
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

    <el-dialog v-model="createDialogVisible" title="创建备份" width="520px">
      <el-form label-width="96px">
        <el-form-item>
          <template #label>
            <span class="mode-label">
              备份模式
              <el-tooltip
                placement="right-start"
                effect="light"
                popper-class="backup-mode-tooltip-popper"
              >
                <template #content>
                  <div class="mode-tooltip">
                    <div><strong>配置快照</strong>：备份应用配置、环境配置和模板定义，支持页面内直接恢复。</div>
                    <div><strong>文件归档</strong>：备份配置文件、日志、数据和脚本等工作区文件，恢复时会启动离线恢复向导。</div>
                  </div>
                </template>
                <el-icon class="mode-help" aria-label="查看备份模式说明">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-radio-group v-model="createForm.mode">
            <el-radio-button label="configuration">配置快照</el-radio-button>
            <el-radio-button label="archive">文件归档</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="备份名称">
          <el-input v-model="createForm.backupName" placeholder="留空时自动生成" clearable />
        </el-form-item>

        <el-form-item label="输出目录">
          <el-input
            v-model="createForm.outputDirectory"
            placeholder="默认沿用当前备份策略里的存储路径"
            readonly
            @click="pickCreateOutputDirectory"
          >
            <template #append>
              <el-button :loading="pickingCreateOutputDirectory" @click.stop="pickCreateOutputDirectory">{{ directoryPickerActionLabel }}</el-button>
            </template>
          </el-input>
        </el-form-item>

        <template v-if="createForm.mode === 'configuration'">
          <el-form-item label="备份内容">
            <el-checkbox v-model="createForm.includeEnvironments">环境配置</el-checkbox>
            <el-checkbox v-model="createForm.includeTemplates">模板定义</el-checkbox>
            <el-checkbox v-model="createForm.includeSensitiveData">敏感数据</el-checkbox>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="归档类型">
            <el-select v-model="createForm.archiveType" style="width: 100%">
              <el-option label="完整归档" value="full" />
              <el-option label="配置归档" value="config" />
              <el-option label="日志归档" value="logs" />
              <el-option label="API归档" value="api" />
            </el-select>
          </el-form-item>

          <el-form-item label="压缩输出">
            <el-switch v-model="createForm.compress" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createBackup">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detail.visible" title="备份详情" width="560px">
      <pre class="json">{{ JSON.stringify(detail.data, null, 2) }}</pre>
      <template #footer><el-button @click="detail.visible=false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { configExportApiService, type BackupInfo } from '@/services/configExportApi'
import { ApiError } from '@/services/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  formatDirectoryPickerSelectionMessage,
  getDirectoryPickerActionLabel,
  getDirectoryPickerCancelMessage,
  isServerDirectoryPickerContext,
  getNativeDirectoryPickerFailureMessage,
  selectDirectoryWithBestEffort
} from '@/utils/directoryPicker'
import {
  normalizeBackupSettings,
  type BackupSettingsModel
} from '@/utils/systemSettingsPayload'

const props = defineProps<{
  backupSettings: BackupSettingsModel
}>()

const emit = defineEmits<{
  (e: 'update:backup-settings', value: BackupSettingsModel): void
  (e: 'backup-settings-changed'): void
}>()

const backups = ref<BackupInfo[]>([])
const loading = ref(false)
const creating = ref(false)
const restoringId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const keyword = ref('')
const page = ref(1)
const pageSize = 10

const detail = ref<{ visible: boolean; data: any }>({ visible: false, data: null })
const createDialogVisible = ref(false)
const pickingBackupPath = ref(false)
const pickingCreateOutputDirectory = ref(false)
const directoryPickerActionLabel = getDirectoryPickerActionLabel()
const usesServerDirectoryBrowser = isServerDirectoryPickerContext()
const policySettings = reactive<BackupSettingsModel>(normalizeBackupSettings(props.backupSettings))
const createForm = reactive({
  mode: 'configuration' as 'configuration' | 'archive',
  backupName: '',
  outputDirectory: '',
  archiveType: 'full' as 'full' | 'config' | 'logs' | 'api',
  compress: true,
  includeEnvironments: true,
  includeTemplates: true,
  includeSensitiveData: false
})

const handlePageChange = (p: number) => {
  page.value = p
}

const loadBackups = async () => {
  loading.value = true
  try {
    const resp = await configExportApiService.listBackups()
    backups.value = resp.data || []
    const maxPage = Math.max(1, Math.ceil(filteredBackups.value.length / pageSize))
    if (page.value > maxPage) {
      page.value = maxPage
    }
  } catch {
    ElMessage.error('获取备份列表失败')
  } finally { loading.value = false }
}

const filteredBackups = computed(() => {
  const search = keyword.value.trim()
  return backups.value.filter(b => !search || b.name.includes(search) || b.id.includes(search))
})

const pagedBackups = computed(() => {
  const list = filteredBackups.value
  const start = (page.value - 1) * pageSize
  return list.slice(start, start + pageSize)
})

watch(keyword, () => {
  page.value = 1
})

watch(() => props.backupSettings, (value) => {
  const normalized = normalizeBackupSettings(value)
  if (areBackupSettingsEqual(normalized, policySettings)) return

  Object.assign(policySettings, normalized)
}, { deep: true, immediate: true })

function areBackupSettingsEqual(a: BackupSettingsModel, b: BackupSettingsModel) {
  return JSON.stringify(normalizeBackupSettings(a)) === JSON.stringify(normalizeBackupSettings(b))
}

function emitPolicySettingsChange() {
  const normalized = normalizeBackupSettings(policySettings)
  if (areBackupSettingsEqual(normalized, props.backupSettings)) return

  Object.assign(policySettings, normalized)
  emit('update:backup-settings', normalized)
  emit('backup-settings-changed')
}

function formatSize(size: number) {
  if (size > 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
  if (size > 1024) return (size / 1024).toFixed(1) + ' KB'
  return size + ' B'
}
function formatTime(s: string | Date) { return new Date(s).toLocaleString() }
function formatBackupType(backup: BackupInfo) {
  const mapping: Record<string, string> = {
    'config-export': '配置',
    'config': '配置',
    'full': '完整',
    'incremental': '增量',
    'logs': '日志',
    'api': 'API',
    'custom': '自定义'
  }

  return mapping[backup.backupType] || backup.backupType || '未知'
}

function isOfflineRestoreBackup(backup: BackupInfo) {
  return backup.source === 'script-registry'
}

function getRestoreActionLabel(backup: BackupInfo) {
  return isOfflineRestoreBackup(backup) ? '离线恢复' : '恢复'
}

function openCreateBackupDialog() {
  createForm.compress = policySettings.compressionEnabled
  createForm.outputDirectory = policySettings.backupPath?.trim() || './backups'
  createDialogVisible.value = true
}

async function selectDirectory(startPath?: string) {
  try {
    const selection = await selectDirectoryWithBestEffort(startPath, true)

    if (selection.cancelled) {
      return undefined
    }

    const selectedPath = typeof selection.path === 'string' ? selection.path.trim() : ''
    if (!selectedPath) {
      throw new Error('未获取到有效目录路径')
    }

    return selectedPath
  } catch (error: any) {
    const message = getNativeDirectoryPickerFailureMessage(error instanceof ApiError ? error : error)
    ElMessage.error(message)
    return null
  }
}

async function pickBackupPath() {
  if (pickingBackupPath.value) return

  pickingBackupPath.value = true
  try {
    const selectedPath = await selectDirectory(policySettings.backupPath?.trim() || undefined)
    if (selectedPath === undefined) {
      ElMessage.info(getDirectoryPickerCancelMessage())
      return
    }
    if (selectedPath === null) return
    if (selectedPath === policySettings.backupPath) {
      ElMessage.info('备份目录未变化')
      return
    }

    policySettings.backupPath = selectedPath
    emitPolicySettingsChange()
    ElMessage.success(formatDirectoryPickerSelectionMessage(selectedPath))
  } finally {
    pickingBackupPath.value = false
  }
}

async function pickCreateOutputDirectory() {
  if (pickingCreateOutputDirectory.value) return

  pickingCreateOutputDirectory.value = true
  try {
    const selectedPath = await selectDirectory(
      createForm.outputDirectory?.trim() || policySettings.backupPath?.trim() || undefined
    )
    if (selectedPath === undefined) {
      ElMessage.info(getDirectoryPickerCancelMessage())
      return
    }
    if (selectedPath === null) return

    createForm.outputDirectory = selectedPath
    ElMessage.success(
      usesServerDirectoryBrowser
        ? `已选择服务器输出目录: ${selectedPath}`
        : `已选择输出目录: ${selectedPath}`
    )
  } finally {
    pickingCreateOutputDirectory.value = false
  }
}

async function createBackup() {
  creating.value = true
  try {
    const backupName = createForm.backupName.trim() || undefined
    const outputDirectory = createForm.outputDirectory.trim() || undefined
    const payload = createForm.mode === 'configuration'
      ? {
          mode: 'configuration' as const,
          backupName,
          outputDirectory,
          includeEnvironments: createForm.includeEnvironments,
          includeTemplates: createForm.includeTemplates,
          includeSensitiveData: createForm.includeSensitiveData
        }
      : {
          mode: 'archive' as const,
          backupName,
          outputDirectory,
          archiveType: createForm.archiveType,
          compress: createForm.compress
        }

    const resp = await configExportApiService.createBackup(payload)
    if (resp.success) {
      ElMessage.success(resp.message || '备份创建成功')
      createDialogVisible.value = false
      await loadBackups()
    } else { throw new Error() }
  } catch (error: any) { ElMessage.error(error?.message || '创建备份失败') } finally { creating.value = false }
}

async function restore(row: BackupInfo) {
  if (row.available === false) {
    ElMessage.warning('该备份文件当前不可用，无法恢复')
    return
  }

  const offlineRestore = isOfflineRestoreBackup(row)
  const restoreMessage = offlineRestore
    ? `确认启动备份“${row.name}”的离线恢复向导吗？系统会打开新的本机窗口，在那里先校验备份，再停止服务并执行恢复。`
    : `确认从备份“${row.name}”恢复吗？当前配置将被覆盖（已自动创建恢复前备份）。`

  try {
    await ElMessageBox.confirm(restoreMessage, offlineRestore ? '启动离线恢复向导' : '恢复确认', { type: 'warning' })
  } catch { return }
  restoringId.value = row.id
  try {
    if (offlineRestore) {
      const resp = await configExportApiService.launchOfflineRestoreAssistant(row.id)
      if (resp.success) {
        ElMessage.success(resp.message || '离线恢复向导已启动，请在新窗口继续操作')
      } else {
        ElMessage.warning(resp.message || resp.error || '离线恢复向导启动后返回了警告')
      }
      return
    }

    const resp = await configExportApiService.restoreBackup(row.id, { overwriteExisting: true, createBackup: true })
    if (resp.success) ElMessage.success(resp.message || '恢复完成')
    else ElMessage.warning(resp.message || resp.error || '恢复完成但存在警告')
    await loadBackups()
  } catch (error: any) {
    ElMessage.error(error?.message || (offlineRestore ? '离线恢复向导启动失败' : '恢复失败'))
  } finally { restoringId.value = null }
}

function getDeleteConfirmText(row: BackupInfo) {
  return row.available === false
    ? `确认移除备份记录“${row.name}”？当前备份文件已缺失，将只清理记录。`
    : `确认删除备份“${row.name}”？`
}

async function deleteBackupRecord(row: BackupInfo) {
  deletingId.value = row.id
  try {
    await configExportApiService.deleteBackup(row.id)
    ElMessage.success('已删除')
    await loadBackups()
  } catch (error: any) {
    ElMessage.error(error?.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}

function view(row: BackupInfo) { detail.value = { visible: true, data: row } }

async function onUpload(fileEvent: any) {
  const raw: File | undefined = fileEvent?.raw
  if (!raw) return
  try { 
    const resp = await configExportApiService.importFromFile(raw, { overwriteExisting: true, createBackup: true })
    if (resp.success) ElMessage.success(resp.message || '导入成功')
    else ElMessage.warning(resp.message || resp.error || '导入完成但存在警告')
    await loadBackups()
  } catch (error: any) { ElMessage.error(error?.message || '导入失败') }
}

onMounted(loadBackups)
</script>

<style scoped>
.backup-alert { margin-bottom: 12px; }
.control-card {
  margin-bottom: 14px;
  padding: 18px 18px 6px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
}
.control-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.control-card__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.control-card__subtitle {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.control-form {
  width: 100%;
}
.control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.control-grid__path {
  grid-column: 1 / -1;
}
.mode-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mode-help {
  color: var(--el-color-info);
  cursor: help;
  font-size: 14px;
}
.mode-tooltip {
  max-width: 320px;
  line-height: 1.6;
}
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.spacer { flex: 1 }
.json { background: #0b1020; color: #d8e0ff; padding: 12px; border-radius: 8px; max-height: 420px; overflow: auto }
.pager { display: flex; justify-content: flex-end; margin-top: 12px }

@media (max-width: 900px) {
  .control-card__header {
    flex-direction: column;
  }

  .control-grid {
    grid-template-columns: 1fr;
  }
}
</style>
