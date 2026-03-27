<template>
  <div class="system-settings">
    <section class="settings-toolbar">
      <div class="settings-toolbar-copy">
        <span class="settings-toolbar-label">配置状态</span>
        <div class="settings-meta">
          <span class="settings-chip" :class="{ 'settings-chip-warning': isDirty }">{{ saveStateText }}</span>
          <span class="settings-chip settings-chip-muted">上次同步 {{ updatedAtText }}</span>
        </div>
      </div>

      <div class="settings-toolbar-actions">
        <el-button :icon="Refresh" @click="refreshSettings" :loading="loading.refresh" class="settings-action settings-action-secondary">
          刷新设置
        </el-button>
        <el-button
          :type="isDirty ? 'danger' : 'success'"
          :icon="Check"
          @click="saveAllSettings"
          :loading="loading.save"
          :disabled="!meta.versionToken || !isDirty"
          class="settings-action save-button"
          :class="{ 'has-changes': isDirty }"
        >
          {{ isDirty ? '保存更改' : '保存' }}
        </el-button>
      </div>
    </section>

    <section class="settings-snapshot" aria-label="系统快照">
      <div v-if="canManageUsers" class="snapshot-pill">
        <div class="snapshot-icon"><el-icon size="18"><User /></el-icon></div>
        <span class="snapshot-label">管理员</span>
        <strong class="snapshot-value">{{ formatCount(userStats.totalAdmins) }}</strong>
      </div>

      <div class="snapshot-pill">
        <div class="snapshot-icon"><el-icon size="18"><Document /></el-icon></div>
        <span class="snapshot-label">累计日志</span>
        <strong class="snapshot-value">{{ formatCount(logStats.totalEntries) }}</strong>
      </div>

      <div class="snapshot-pill" :class="{ 'snapshot-pill-warning': alertStats.activeAlerts > 0 }">
        <div class="snapshot-icon"><el-icon size="18"><Bell /></el-icon></div>
        <span class="snapshot-label">活跃告警</span>
        <strong class="snapshot-value">{{ formatCount(alertStats.activeAlerts) }}</strong>
      </div>

      <div class="snapshot-pill snapshot-pill-runtime">
        <div class="snapshot-icon"><el-icon size="18"><Clock /></el-icon></div>
        <span class="snapshot-label">已运行</span>
        <strong class="snapshot-value snapshot-value-sm">{{ formatUptime(systemStats.uptime) }}</strong>
      </div>
    </section>

    <div class="settings-panel">
      <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane v-if="canManageUsers" label="用户管理" name="user-management">
        <template #label><div class="tab-label"><el-icon><User /></el-icon><span>用户管理</span></div></template>
        <div class="tab-content">
          <UserManagementPanel :users="accounts.users" @update:users="handleUsersUpdate" @user-updated="handleUserUpdate" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="日志中心" name="logs">
        <template #label><div class="tab-label"><el-icon><Document /></el-icon><span>日志中心</span></div></template>
        <div class="tab-content">
          <div class="log-center-tabs">
            <el-radio-group v-model="logCenterView" size="small">
              <el-radio-button value="logs">查看日志</el-radio-button>
              <el-radio-button value="management">日志管理</el-radio-button>
            </el-radio-group>
          </div>
          <SystemLogsPanel v-if="logCenterView === 'logs'" />
          <LogManagementPanel v-else />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="canManageSecurity" label="安全设置" name="security">
        <template #label><div class="tab-label"><el-icon><Lock /></el-icon><span>安全设置</span></div></template>
        <div class="tab-content">
          <SecuritySettingsPanel :security="securitySettings" @update:security="val => { Object.assign(securitySettings, val); isDirty = true }" @security-changed="onSecurityChanged" />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="canManageSecurity" label="路径访问" name="path-access">
        <template #label><div class="tab-label"><el-icon><FolderOpened /></el-icon><span>路径访问</span></div></template>
        <div class="tab-content">
          <PathAccessSettingsPanel
            :path-access="pathAccessSettings"
            @update:path-access="handlePathAccessUpdate"
            @path-access-changed="onPathAccessChanged"
            @picker-selected="handlePathAccessPickerSelected"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="canManageBackup" label="系统备份与恢复" name="backup-restore">
        <template #label><div class="tab-label"><el-icon><FolderOpened /></el-icon><span>系统备份与恢复</span></div></template>
        <div class="tab-content">
          <BackupRestorePanel
            :backup-settings="backupSettings"
            @update:backup-settings="handleBackupSettingsUpdate"
            @backup-settings-changed="onBackupSettingsChanged"
          />
        </div>
      </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Refresh, Check, User, Document,
  FolderOpened, Lock, Clock, Bell
} from '@element-plus/icons-vue'
import { systemSettingsApiService, type SystemSettingsResponse, type SystemStatistics } from '@/services'
import { useAuthStore } from '@/stores/auth'
import UserManagementPanel from '@/components/settings/UserManagementPanel.vue'
import SecuritySettingsPanel from '@/components/settings/SecuritySettingsPanel.vue'
import PathAccessSettingsPanel from '@/components/settings/PathAccessSettingsPanel.vue'
import SystemLogsPanel from '@/components/settings/SystemLogsPanel.vue'
import BackupRestorePanel from '@/components/settings/BackupRestorePanel.vue'
import LogManagementPanel from '@/components/settings/LogManagementPanel.vue'
import {
  buildSystemSettingsPayload,
  normalizeBackupSettings,
  normalizePathAccessSettings,
  type BackupSettingsModel,
  type PathAccessSettingsModel
} from '@/utils/systemSettingsPayload'

// 认证状态
const authStore = useAuthStore()

// 权限检查
const canManageUsers = computed(() => authStore.isAdmin)
const canManageSecurity = computed(() => authStore.isAdmin)
const canManageBackup = computed(() => authStore.isAdmin)

// 标签页状态
const activeTab = ref('user-management')
const logCenterView = ref<'logs' | 'management'>('logs')  // 日志中心子视图

// 加载状态
const loading = reactive({
  refresh: false,
  save: false
})

// 统计数据
const userStats = reactive({
  totalAdmins: 0
})

const logStats = reactive({
  totalEntries: 0
})

const alertStats = reactive({
  activeAlerts: 0
})

const systemStats = reactive({
  uptime: 0
})

// 设置数据与版本信息
const serverSettings = ref<any>({})
const meta = reactive<{ versionToken: string | null; updatedAt: string | null }>({ versionToken: null, updatedAt: null })
let isDirty = ref(false)
let __syncing = false

const saveStateText = computed(() => isDirty.value ? '存在未保存变更' : '当前配置已同步')
const updatedAtText = computed(() => meta.updatedAt ? formatUpdatedAt(meta.updatedAt) : '尚未同步')

// 局部编辑对象（与 serverSettings 双向同步）
const accounts = reactive<{ users: any[] }>({ users: [] })
const securitySettings = reactive<any>({})
const pathAccessSettings = reactive<{ allowWorkspaceParent: boolean; allowedBasePaths: string[] }>({
  allowWorkspaceParent: false,
  allowedBasePaths: []
})
const backupSettings = reactive<BackupSettingsModel>({
  enableAutoBackup: true,
  backupInterval: 'daily',
  backupTime: '02:00',
  retentionDays: 30,
  includeUserData: true,
  includeLogs: false,
  compressionEnabled: true,
  backupPath: './backups'
})

const arePathAccessSettingsEqual = (a: PathAccessSettingsModel, b: PathAccessSettingsModel): boolean => {
  if (a.allowWorkspaceParent !== b.allowWorkspaceParent) return false
  if (a.allowedBasePaths.length !== b.allowedBasePaths.length) return false
  return a.allowedBasePaths.every((item, index) => item === b.allowedBasePaths[index])
}

const syncFromServer = () => {
  const s = serverSettings.value || {}
  accounts.users = Array.isArray(s?.accounts?.users) ? [...s.accounts.users] : []
  const sec = s?.security || {}
  Object.assign(securitySettings, {
    passwordPolicy: {
      minLength: sec?.passwordPolicy?.minLength ?? 8,
      requireNumber: sec?.passwordPolicy?.requireNumber ?? true,
      requireUppercase: sec?.passwordPolicy?.requireUppercase ?? false,
      requireSpecial: sec?.passwordPolicy?.requireSpecial ?? false
    },
    session: {
      timeoutMinutes: sec?.session?.timeoutMinutes ?? 30,
      localTrustedMinutes: sec?.session?.localTrustedMinutes ?? 0
    }
  })

  Object.assign(pathAccessSettings, {
    allowWorkspaceParent: sec?.pathAccess?.allowWorkspaceParent ?? false,
    allowedBasePaths: Array.isArray(sec?.pathAccess?.allowedBasePaths)
      ? [...sec.pathAccess.allowedBasePaths]
      : []
  })

  Object.assign(backupSettings, normalizeBackupSettings(s?.backup))
}

watch(serverSettings, () => {
  if (__syncing) return  // 防止在同步期间重复触发
  __syncing = true
  try { syncFromServer() } finally { __syncing = false }
}, { deep: true, immediate: true, flush: 'post' })

watch(() => accounts.users, (v) => {
  if (__syncing) return
  serverSettings.value.accounts = { ...(serverSettings.value.accounts || {}), users: [...v] }
}, { deep: true, flush: 'post' })
watch(securitySettings, (v) => {
  if (__syncing) return
  serverSettings.value.security = { ...(serverSettings.value.security || {}), ...JSON.parse(JSON.stringify(v)) }
}, { deep: true, flush: 'post' })

watch(pathAccessSettings, (v) => {
  if (__syncing) return
  const nextPathAccess = normalizePathAccessSettings(v)
  const currentPathAccess = normalizePathAccessSettings(serverSettings.value?.security?.pathAccess)
  if (arePathAccessSettingsEqual(nextPathAccess, currentPathAccess)) return

  serverSettings.value.security = {
    ...(serverSettings.value.security || {}),
    pathAccess: nextPathAccess
  }
}, { deep: true, flush: 'post' })

watch(backupSettings, (v) => {
  if (__syncing) return
  const nextBackup = normalizeBackupSettings(v)
  const currentBackup = normalizeBackupSettings(serverSettings.value?.backup)
  if (JSON.stringify(nextBackup) === JSON.stringify(currentBackup)) return

  serverSettings.value.backup = nextBackup
}, { deep: true, flush: 'post' })

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}时`
  if (hours > 0) return `${hours}时${minutes}分`
  return `${minutes}分钟`
}

const formatCount = (value: number) => Number(value || 0).toLocaleString('zh-CN')

const formatUpdatedAt = (timeString: string) => {
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 统一的刷新函数，silent=true 时不显示成功提示
const refreshSettings = async (silent = false) => {
  loading.refresh = true
  try {
    const resp = await systemSettingsApiService.get()
    if (resp.success && resp.data) {
      const data = resp.data as SystemSettingsResponse
      
      // 使用__syncing标志防止watch触发导致的递归更新
      __syncing = true
      try {
        serverSettings.value = data.settings || {}
        meta.versionToken = data.versionToken
        meta.updatedAt = data.updatedAt
        isDirty.value = false
        
        // 手动同步到局部编辑对象（因为 watch 被 __syncing 抑制）
        syncFromServer()
        
        // 获取真实的统计数据
        await loadStatistics()
      } finally {
        setTimeout(() => { __syncing = false }, 0)
      }
      
      if (!silent) ElMessage.success('系统设置刷新成功')
    } else {
      throw new Error((resp as any)?.error || '获取失败')
    }
  } catch {
    ElMessage.error('刷新设置失败')
  } finally {
    loading.refresh = false
  }
}

const saveAllSettings = async () => {
  if (!meta.versionToken) { ElMessage.warning('请先刷新获取最新配置'); return }
  loading.save = true
  try {
    const payloadSettings = buildSystemSettingsPayload({
      serverSettings: serverSettings.value,
      accountsUsers: accounts.users,
      securitySettings,
      pathAccessSettings,
      backupSettings
    })

    const resp = await systemSettingsApiService.save({ settings: payloadSettings, versionToken: meta.versionToken })

    if (resp.success && resp.data) {
      const data = resp.data as SystemSettingsResponse

      // 使用__syncing标志防止watch触发导致的递归更新
      __syncing = true
      try {
        serverSettings.value = data.settings
        meta.versionToken = data.versionToken
        meta.updatedAt = data.updatedAt
        syncFromServer()
        isDirty.value = false
      } finally {
        // 延迟重置标志，确保所有watch回调都已执行
        setTimeout(() => { __syncing = false }, 0)
      }

      ElMessage.success('系统设置保存成功')
    } else {
      throw new Error((resp as any)?.error || '保存失败')
    }
  } catch (error) {
    console.error('❌ 保存设置失败：', error)
    ElMessage.error('保存设置失败')
  } finally { loading.save = false }
}

const handleUsersUpdate = (val: any[]) => {
  const nextUsers = Array.isArray(val) ? JSON.parse(JSON.stringify(val)) : []
  __syncing = true
  try {
    accounts.users = nextUsers
    serverSettings.value.accounts = { ...(serverSettings.value.accounts || {}), users: [...nextUsers] }
    isDirty.value = true
  } finally {
    setTimeout(() => { __syncing = false }, 0)
  }
}
const handleUserUpdate = () => { isDirty.value = true }

const handlePathAccessUpdate = (val: any) => {
  const nextPathAccess = normalizePathAccessSettings(val)
  const currentPathAccess = normalizePathAccessSettings(pathAccessSettings)
  if (!arePathAccessSettingsEqual(nextPathAccess, currentPathAccess)) {
    pathAccessSettings.allowWorkspaceParent = nextPathAccess.allowWorkspaceParent
    pathAccessSettings.allowedBasePaths = [...nextPathAccess.allowedBasePaths]
  }
  if (!__syncing) {
    isDirty.value = true
  }
}

const handlePathAccessPickerSelected = async () => {
  if (__syncing || loading.save) return
  if (!meta.versionToken) {
    isDirty.value = true
    return
  }
  await saveAllSettings()
}

const handleBackupSettingsUpdate = (val: any) => {
  const nextBackup = normalizeBackupSettings(val)
  const currentBackup = normalizeBackupSettings(backupSettings)
  if (JSON.stringify(nextBackup) !== JSON.stringify(currentBackup)) {
    Object.assign(backupSettings, nextBackup)
  }
  if (!__syncing) {
    isDirty.value = true
  }
}

// 变更回调（带同步期抑制）
const onSecurityChanged = () => { if (__syncing) return; isDirty.value = true }
const onPathAccessChanged = () => { if (__syncing) return; isDirty.value = true }
const onBackupSettingsChanged = () => { if (__syncing) return; isDirty.value = true }

// 加载统计数据
const loadStatistics = async () => {
  try {
    const statsResp = await systemSettingsApiService.getStatistics()
    if (statsResp.success && statsResp.data) {
      const stats = statsResp.data as SystemStatistics
      userStats.totalAdmins = stats.adminCount
      logStats.totalEntries = stats.logTotal
      alertStats.activeAlerts = stats.activeAlerts
      systemStats.uptime = stats.systemUptime
    }
  } catch (error) {
    console.warn('获取统计数据失败，使用默认值', error)
    // 如果统计接口失败，保持当前值或设为0
    userStats.totalAdmins = userStats.totalAdmins || 0
    logStats.totalEntries = logStats.totalEntries || 0
    alertStats.activeAlerts = alertStats.activeAlerts || 0
    systemStats.uptime = systemStats.uptime || 0
  }
}

onMounted(async () => { await refreshSettings(true); window.addEventListener('beforeunload', beforeUnloadGuard) })
const beforeUnloadGuard = (e: BeforeUnloadEvent) => { if (isDirty.value) { e.preventDefault(); e.returnValue = '' } }
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnloadGuard) })
</script>

<style scoped>
.system-settings {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 26%),
    linear-gradient(180deg, #eef4ff 0%, #f7f9fc 48%, #eef2f8 100%);
}

.settings-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.settings-toolbar-copy {
  flex: 1;
  min-width: 0;
}

.settings-toolbar-label {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.settings-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.settings-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.settings-chip-muted {
  color: var(--text-tertiary);
}

.settings-chip-warning {
  color: var(--danger-500);
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.12);
}

.settings-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.settings-action {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-weight: 700;
}

.settings-action-secondary {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.8);
}

.save-button.has-changes {
  animation: savePulse 2.2s ease-in-out infinite;
  box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.08);
}

@keyframes savePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.08);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(220, 38, 38, 0.14);
  }
}

.settings-panel {
  padding: 22px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.07);
}

.settings-snapshot {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}

.snapshot-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
}

.snapshot-pill-warning {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(255, 251, 235, 0.9);
}

.snapshot-pill-runtime {
  padding-right: 16px;
}

.snapshot-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(14, 165, 233, 0.16));
  border-radius: 10px;
  color: var(--primary-600);
  flex-shrink: 0;
}

.snapshot-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-right: 4px;
}

.snapshot-value {
  margin-left: auto;
  color: var(--text-strong);
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.snapshot-value-sm {
  font-size: 15px;
  letter-spacing: 0;
}

.settings-tabs {
  background: transparent;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.tab-content {
  padding: 16px 0 0;
  min-height: 340px;
}

.log-center-tabs {
  margin-bottom: 12px;
}

.panel-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background: rgba(248, 250, 252, 0.82);
  border-radius: 18px;
  border: 1px dashed rgba(148, 163, 184, 0.32);
}

:deep(.el-tabs__header) {
  margin-bottom: 20px;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__nav-wrap) {
  padding: 0;
}

:deep(.el-tabs__nav) {
  display: inline-flex;
  gap: 10px;
  padding: 5px;
  border-radius: 18px;
  background: rgba(148, 163, 184, 0.1);
}

:deep(.el-tabs__active-bar) {
  display: none;
}

:deep(.el-tabs__item) {
  height: 42px;
  padding: 0 14px;
  border-radius: 14px;
  color: var(--text-secondary);
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

:deep(.el-tabs__item.is-active) {
  color: var(--primary-600);
  font-weight: 700;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

:deep(.el-tabs__item:hover) {
  color: var(--primary-600);
}

@media (max-width: 980px) {
  .settings-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .settings-toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .system-settings {
    padding: 16px 14px;
    gap: 18px;
  }

  .settings-toolbar,
  .settings-panel {
    padding: 18px;
    border-radius: 24px;
  }

  .settings-snapshot {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  :deep(.el-tabs__nav) {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  :deep(.el-tabs__nav::-webkit-scrollbar) {
    display: none;
  }

  .settings-toolbar-actions,
  .settings-action {
    width: 100%;
  }

  .tab-content {
    min-height: 0;
  }
}
</style>
