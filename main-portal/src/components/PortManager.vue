<template>
  <section class="inventory-panel" aria-labelledby="inventory-title">
    <div class="inventory-toolbar">
      <div class="toolbar-title">
        <h2 id="inventory-title">监听端口</h2>
        <span>{{ filteredRows.length }} / {{ allRows.length }}</span>
      </div>

      <div class="toolbar-controls">
        <el-input
          v-model="search"
          clearable
          :prefix-icon="Search"
          placeholder="搜索端口、进程或应用"
          aria-label="搜索端口、进程或应用"
          class="search-input"
        />
        <el-select v-model="ownershipFilter" aria-label="按归属状态筛选" class="ownership-select">
          <el-option label="全部归属" value="all" />
          <el-option
            v-for="option in ownershipOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-checkbox v-model="issuesOnly">仅看异常</el-checkbox>
        <el-button
          :icon="Refresh"
          :loading="portStore.loadingStates.refresh"
          title="刷新端口清单"
          @click="refreshPortStatus"
        >
          刷新
        </el-button>
      </div>
    </div>

    <div v-if="portStore.isInitialLoading" class="inventory-loading" aria-live="polite">
      <el-skeleton :rows="6" animated />
    </div>

    <el-empty
      v-else-if="portStore.dataState === 'error' && !portStore.hasUsableData"
      description="端口清单暂时不可用"
      class="inventory-empty"
    >
      <el-button type="primary" :icon="Refresh" @click="refreshPortStatus">重新连接</el-button>
    </el-empty>

    <el-empty
      v-else-if="filteredRows.length === 0"
      :description="allRows.length === 0 ? '当前监控范围内没有 TCP 监听端口' : '没有符合筛选条件的端口'"
      class="inventory-empty"
    />

    <template v-else>
      <el-table
        ref="tableRef"
        :data="filteredRows"
        row-key="port"
        class="port-table desktop-table"
        :row-class-name="getRowClassName"
      >
        <el-table-column label="端口" width="96">
          <template #default="{ row }">
            <div class="port-cell">
              <strong>{{ row.port }}</strong>
              <span v-if="isFocusedPort(row)" class="focus-mark">焦点</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="监听地址" min-width="160">
          <template #default="{ row }">
            <div class="primary-secondary">
              <span>{{ formatAddress(row) }}</span>
              <small>{{ row.protocol.toUpperCase() }} · {{ row.state === 'listening' ? '监听中' : row.state }}</small>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="实际进程" min-width="170">
          <template #default="{ row }">
            <div class="primary-secondary">
              <span>{{ row.observed.processName || '未知进程' }}</span>
              <small>{{ row.observed.pid ? `PID ${row.observed.pid}` : 'PID 不可见' }}</small>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="配置应用" min-width="210">
          <template #default="{ row }">
            <div v-if="row.expectedApps.length" class="expected-apps">
              <span v-for="app in row.expectedApps" :key="app.id">
                {{ app.name }}
                <small>{{ roleLabel(app.role) }}</small>
              </span>
            </div>
            <div v-else-if="row.reserved" class="primary-secondary">
              <span>{{ row.reserved.description }}</span>
              <small>保留端口</small>
            </div>
            <span v-else class="muted">未配置</span>
          </template>
        </el-table-column>

        <el-table-column label="归属" width="132">
          <template #default="{ row }">
            <el-tag :type="ownershipTone(row.ownership)" effect="plain" size="small">
              {{ ownershipLabel(row.ownership) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="核验时间" width="136">
          <template #default="{ row }">
            <span class="checked-time">{{ formatCheckedTime(row.checkedAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="184" fixed="right" align="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button text :icon="View" @click="showDetails(row)">查看</el-button>
              <el-popconfirm
                v-if="row.capabilities.stopManagedApp"
                :title="`确定停止应用 ${row.expectedApps[0]?.name || ''}？`"
                confirm-button-text="停止"
                cancel-button-text="取消"
                @confirm="stopManagedApp(row)"
              >
                <template #reference>
                  <el-button
                    text
                    type="warning"
                    :loading="Boolean(actionLoading[row.port])"
                  >停止</el-button>
                </template>
              </el-popconfirm>
              <el-tooltip v-else-if="row.protected" content="系统或门户保留端口禁止释放">
                <el-icon class="locked-action"><Lock /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mobile-list">
        <article
          v-for="row in filteredRows"
          :key="row.port"
          :class="['mobile-port', { focused: isFocusedPort(row) }]"
        >
          <div class="mobile-port-head">
            <div>
              <strong>{{ row.port }}</strong>
              <span>{{ formatAddress(row) }}</span>
            </div>
            <el-tag :type="ownershipTone(row.ownership)" effect="plain" size="small">
              {{ ownershipLabel(row.ownership) }}
            </el-tag>
          </div>
          <dl>
            <div><dt>实际进程</dt><dd>{{ row.observed.processName || '未知进程' }} · {{ row.observed.pid || 'PID 不可见' }}</dd></div>
            <div><dt>配置应用</dt><dd>{{ expectedAppText(row) }}</dd></div>
            <div><dt>核验时间</dt><dd>{{ formatCheckedTime(row.checkedAt) }}</dd></div>
          </dl>
          <div class="mobile-actions">
            <el-button :icon="View" @click="showDetails(row)">查看</el-button>
            <el-button
              v-if="row.capabilities.stopManagedApp"
              type="warning"
              :loading="Boolean(actionLoading[row.port])"
              @click="confirmMobileStop(row)"
            >停止应用</el-button>
          </div>
        </article>
      </div>
    </template>

    <el-drawer
      v-model="detailVisible"
      title="端口详情"
      size="min(460px, 94vw)"
      append-to-body
    >
      <template v-if="selectedRow">
        <div class="detail-port">{{ selectedRow.port }}</div>
        <el-alert
          v-if="selectedRow.conflictReason"
          type="error"
          :closable="false"
          show-icon
          :title="selectedRow.conflictReason"
        />
        <el-descriptions :column="1" border class="detail-descriptions">
          <el-descriptions-item label="监听地址">{{ formatAddress(selectedRow) }}</el-descriptions-item>
          <el-descriptions-item label="协议">{{ selectedRow.protocol.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item label="实际进程">
            {{ selectedRow.observed.processName || '未知进程' }}
          </el-descriptions-item>
          <el-descriptions-item label="进程 PID">{{ selectedRow.observed.pid || '不可见' }}</el-descriptions-item>
          <el-descriptions-item label="配置应用">{{ expectedAppText(selectedRow) }}</el-descriptions-item>
          <el-descriptions-item label="归属判断">{{ ownershipLabel(selectedRow.ownership) }}</el-descriptions-item>
          <el-descriptions-item label="保护状态">{{ selectedRow.protected ? '受保护' : '普通端口' }}</el-descriptions-item>
          <el-descriptions-item label="快照编号">{{ portStore.snapshot?.snapshotId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="核验时间">{{ new Date(selectedRow.checkedAt).toLocaleString('zh-CN') }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="isAdmin && selectedRow.capabilities.forceRelease" class="detail-actions">
          <el-button
            type="danger"
            plain
            :loading="Boolean(actionLoading[selectedRow.port])"
            @click="confirmDetailForceRelease"
          >强制释放当前 PID</el-button>
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Refresh, Search, View } from '@element-plus/icons-vue'
import { appsApiService } from '@/services/appsApi'
import { portInventoryApi, type PortInventoryRow, type PortOwnership } from '@/services/portInventoryApi'
import { useAuthStore } from '@/stores/auth'
import { usePortMonitoringStore } from '@/stores/portMonitoring'

const props = defineProps<{ focusPort?: number | null }>()
const portStore = usePortMonitoringStore()
const authStore = useAuthStore()
const tableRef = ref<{ $el?: HTMLElement } | null>(null)
const search = ref('')
const ownershipFilter = ref<PortOwnership | 'all'>('all')
const issuesOnly = ref(false)
const selectedRow = ref<PortInventoryRow | null>(null)
const detailVisible = ref(false)
const actionLoading = reactive<Record<number, boolean>>({})

const isAdmin = computed(() => authStore.isAdmin)
const allRows = computed(() => portStore.snapshot?.ports || [])
const filteredRows = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return allRows.value.filter(row => {
    if (ownershipFilter.value !== 'all' && row.ownership !== ownershipFilter.value) return false
    if (issuesOnly.value && !row.conflict && !['mismatch', 'duplicate-config', 'unmanaged', 'unverified'].includes(row.ownership)) return false
    if (!needle) return true
    return [
      row.port,
      row.address,
      row.observed.pid,
      row.observed.processName,
      row.reserved?.description,
      ...row.expectedApps.flatMap(app => [app.name, app.id])
    ].some(value => String(value || '').toLowerCase().includes(needle))
  })
})

const ownershipOptions: Array<{ value: PortOwnership; label: string }> = [
  { value: 'verified', label: '已核验' },
  { value: 'mismatch', label: '归属不符' },
  { value: 'duplicate-config', label: '重复配置' },
  { value: 'unmanaged', label: '未纳管' },
  { value: 'unverified', label: '待核验' },
  { value: 'reserved', label: '保留端口' }
]

const ownershipLabel = (ownership: PortOwnership) => ownershipOptions.find(item => item.value === ownership)?.label || ownership
const ownershipTone = (ownership: PortOwnership): 'success' | 'warning' | 'danger' | 'info' => {
  if (ownership === 'verified') return 'success'
  if (ownership === 'mismatch' || ownership === 'duplicate-config') return 'danger'
  if (ownership === 'unmanaged' || ownership === 'unverified') return 'warning'
  return 'info'
}
const roleLabel = (role: string) => ({ frontend: '前端', backend: '后端', other: '其他' }[role] || role)
const formatAddress = (row: PortInventoryRow) => row.address.includes(`:${row.port}`) ? row.address : `${row.address}:${row.port}`
const formatCheckedTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const expectedAppText = (row: PortInventoryRow) => {
  if (row.expectedApps.length) return row.expectedApps.map(app => app.name).join('、')
  return row.reserved?.description || '未配置'
}
const isFocusedPort = (row: PortInventoryRow) => Boolean(props.focusPort && row.port === props.focusPort)
const getRowClassName = ({ row }: { row: PortInventoryRow }) => isFocusedPort(row) ? 'port-row-focused' : ''

const refreshPortStatus = async () => {
  try {
    await portStore.refreshAll(true)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '端口清单刷新失败')
  }
}

const verifyReleased = (row: PortInventoryRow) => {
  const current = portStore.snapshot?.ports.find(item => item.port === row.port)
  if (current) {
    ElMessage.warning(`操作已执行，但端口 ${row.port} 仍在监听，请查看新的进程信息`)
    return false
  }
  return true
}

const stopManagedApp = async (row: PortInventoryRow) => {
  const app = row.expectedApps[0]
  if (!app || !row.capabilities.stopManagedApp) return

  actionLoading[row.port] = true
  try {
    const result = await appsApiService.stopApp(app.id, { showErrorMessage: false })
    if (!result.success) throw new Error(result.message || String(result.error || '停止应用失败'))
    await portStore.refreshAll(true)
    if (verifyReleased(row)) ElMessage.success(`应用 ${app.name} 已停止，端口 ${row.port} 已释放`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '停止应用失败')
  } finally {
    actionLoading[row.port] = false
  }
}

const forceRelease = async (row: PortInventoryRow) => {
  const snapshotId = portStore.snapshot?.snapshotId
  if (!isAdmin.value || !row.capabilities.forceRelease || !row.observed.pid || !snapshotId) return

  actionLoading[row.port] = true
  try {
    await portInventoryApi.forceRelease(row.port, row.observed.pid, snapshotId)
    await portStore.refreshAll(true)
    if (verifyReleased(row)) ElMessage.success(`端口 ${row.port} 已释放`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '强制释放失败')
  } finally {
    actionLoading[row.port] = false
  }
}

const confirmDetailForceRelease = async () => {
  const row = selectedRow.value
  if (!row) return
  try {
    await ElMessageBox.confirm(
      `仅终止当前观察到的 PID ${row.observed.pid}。若进程发生变化，服务端会拒绝操作。`,
      `强制释放端口 ${row.port}`,
      { type: 'warning', confirmButtonText: '强制释放', cancelButtonText: '取消' }
    )
    await forceRelease(row)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '操作未完成')
    }
  }
}

const confirmMobileStop = async (row: PortInventoryRow) => {
  const app = row.expectedApps[0]
  if (!app) return
  try {
    await ElMessageBox.confirm(
      `停止应用后将重新核验端口 ${row.port}。`,
      `停止应用 ${app.name}`,
      { type: 'warning', confirmButtonText: '停止', cancelButtonText: '取消' }
    )
    await stopManagedApp(row)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '操作未完成')
    }
  }
}

const showDetails = (row: PortInventoryRow) => {
  selectedRow.value = row
  detailVisible.value = true
}

const scrollToFocusedPort = async () => {
  if (!props.focusPort) return
  await nextTick()
  const row = tableRef.value?.$el?.querySelector('.port-row-focused') as HTMLElement | null
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

watch(
  () => `${props.focusPort || ''}|${filteredRows.value.map(row => row.port).join(',')}`,
  () => void scrollToFocusedPort(),
  { flush: 'post', immediate: true }
)

defineExpose({ refreshPortStatus })
</script>

<style scoped>
.inventory-panel {
  overflow: hidden;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  background: #ffffff;
}

.inventory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e9f0;
}

.toolbar-title,
.toolbar-controls,
.row-actions,
.port-cell,
.mobile-port-head,
.mobile-actions {
  display: flex;
  align-items: center;
}

.toolbar-title { gap: 10px; }
.toolbar-title h2 { margin: 0; color: #1f2937; font-size: 17px; letter-spacing: 0; }
.toolbar-title span { color: #7a8495; font-size: 12px; }
.toolbar-controls { justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.search-input { width: 250px; }
.ownership-select { width: 142px; }

.inventory-loading { padding: 24px; }
.inventory-empty { min-height: 360px; }
.port-table { width: 100%; }
.port-table :deep(th.el-table__cell) { height: 42px; background: #f7f8fa; color: #596579; font-size: 12px; font-weight: 600; }
.port-table :deep(td.el-table__cell) { padding: 12px 0; }
.port-table :deep(.el-table__body tr.port-row-focused > td.el-table__cell) { background: #fff8e8; }
.port-table :deep(.el-tag) { border-radius: 4px; }

.port-cell { gap: 7px; }
.port-cell strong, .detail-port { color: #1769aa; font-family: var(--font-number); }
.focus-mark { padding: 2px 5px; border-radius: 4px; background: #fff0c2; color: #8a5b00; font-size: 10px; }
.primary-secondary, .expected-apps, .expected-apps > span { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.primary-secondary > span, .expected-apps > span { overflow: hidden; color: #273244; text-overflow: ellipsis; white-space: nowrap; }
.primary-secondary small, .expected-apps small, .checked-time { color: #7a8495; font-size: 12px; }
.expected-apps { gap: 7px; }
.muted { color: #98a1af; }
.row-actions { justify-content: flex-end; gap: 2px; min-height: 32px; }
.locked-action { margin: 0 12px; color: #8b95a5; }

.mobile-list { display: none; }
.detail-port { margin: 0 0 16px; font-size: 30px; font-weight: 700; letter-spacing: 0; }
.detail-descriptions { margin-top: 16px; }
.detail-actions { display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e9f0; }

@media (max-width: 900px) {
  .inventory-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-controls { justify-content: flex-start; width: 100%; }
  .search-input { flex: 1 1 220px; width: auto; }
}

@media (max-width: 720px) {
  .desktop-table { display: none; }
  .mobile-list { display: block; }
  .toolbar-controls { display: grid; grid-template-columns: 1fr 1fr; }
  .search-input { grid-column: 1 / -1; width: 100%; }
  .ownership-select { width: 100%; }
  .mobile-port { padding: 16px; border-bottom: 1px solid #e5e9f0; }
  .mobile-port:last-child { border-bottom: 0; }
  .mobile-port.focused { box-shadow: inset 3px 0 #d89b18; background: #fffaf0; }
  .mobile-port-head { justify-content: space-between; gap: 12px; }
  .mobile-port-head > div { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .mobile-port-head strong { color: #1769aa; font-size: 20px; }
  .mobile-port-head span { overflow: hidden; color: #7a8495; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-port dl { display: grid; gap: 8px; margin: 14px 0; }
  .mobile-port dl div { display: grid; grid-template-columns: 76px 1fr; gap: 8px; }
  .mobile-port dt { color: #7a8495; font-size: 12px; }
  .mobile-port dd { margin: 0; color: #273244; font-size: 13px; word-break: break-word; }
  .mobile-actions { justify-content: flex-end; gap: 8px; }
}
</style>
