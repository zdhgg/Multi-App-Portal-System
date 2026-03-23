<template>
  <div class="system-settings">
    <section class="settings-hero">
      <div class="settings-hero-copy">
        <span class="settings-eyebrow">System Control</span>
        <h1 class="settings-title">系统设置中心</h1>
        <p class="settings-subtitle">管理系统配置、账户权限、安全策略与日志能力，保持整个平台运行稳定且可控。</p>

        <div class="settings-meta">
          <span class="settings-chip">{{ activeTabLabel }}</span>
          <span class="settings-chip" :class="{ 'settings-chip-warning': isDirty }">{{ saveStateText }}</span>
          <span class="settings-chip settings-chip-muted">上次同步 {{ updatedAtText }}</span>
        </div>
      </div>

      <div class="settings-hero-actions">
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
          {{ isDirty ? '保存 (有更改)' : '保存' }}
        </el-button>
      </div>
    </section>

    <div class="settings-overview">
      <div class="overview-heading">
        <div>
          <span class="overview-eyebrow">Overview</span>
          <h2 class="overview-title">系统概览</h2>
        </div>
        <p class="overview-description">从账户、日志、告警与运行时长四个维度快速评估当前系统状态。</p>
      </div>

      <el-row :gutter="16">
        <el-col v-if="canManageUsers" :span="6">
          <el-tooltip content="点击查看用户管理" placement="top" :show-after="500">
            <el-card class="overview-card clickable" @click="navigateToTab('user-management')">
              <div class="card-content">
                <div class="card-icon"><el-icon size="24"><User /></el-icon></div>
                <div class="card-info">
                  <div class="card-title">管理员账号</div>
                  <div class="card-value">{{ userStats.totalAdmins }}</div>
                </div>
              </div>
            </el-card>
          </el-tooltip>
        </el-col>
        <el-col :span="6">
          <el-tooltip content="点击查看日志中心" placement="top" :show-after="500">
            <el-card class="overview-card clickable" @click="navigateToTab('logs')">
              <div class="card-content">
                <div class="card-icon"><el-icon size="24"><Document /></el-icon></div>
                <div class="card-info">
                  <div class="card-title">系统日志</div>
                  <div class="card-value">{{ logStats.totalEntries }}</div>
                </div>
              </div>
            </el-card>
          </el-tooltip>
        </el-col>
        <el-col :span="6">
          <el-tooltip content="点击查看告警详情" placement="top" :show-after="500">
            <el-card class="overview-card clickable" @click="navigateToAlerts()">
              <div class="card-content">
                <div class="card-icon"><el-icon size="24"><Bell /></el-icon></div>
                <div class="card-info">
                  <div class="card-title">活跃告警</div>
                  <div class="card-value">{{ alertStats.activeAlerts }}</div>
                </div>
              </div>
            </el-card>
          </el-tooltip>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon"><el-icon size="24"><Clock /></el-icon></div>
              <div class="card-info">
                <div class="card-title">系统运行</div>
                <div class="card-value text-sm">{{ formatUptime(systemStats.uptime) }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

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
          <BackupRestorePanel />
        </div>
      </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRouter 在其他文件中可正常导入
import { useRouter } from 'vue-router'
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
  normalizePathAccessSettings,
  type PathAccessSettingsModel
} from '@/utils/systemSettingsPayload'

// 路由管理
const router = useRouter()

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

const activeTabLabel = computed(() => {
  const labelMap: Record<string, string> = {
    'user-management': '当前页签: 用户管理',
    'logs': '当前页签: 日志中心',
    'security': '当前页签: 安全设置',
    'path-access': '当前页签: 路径访问',
    'backup-restore': '当前页签: 系统备份与恢复'
  }

  return labelMap[activeTab.value] || '当前页签: 系统设置'
})

const saveStateText = computed(() => isDirty.value ? '存在未保存变更' : '当前配置已同步')
const updatedAtText = computed(() => meta.updatedAt ? formatUpdatedAt(meta.updatedAt) : '尚未同步')

// 局部编辑对象（与 serverSettings 双向同步）
const accounts = reactive<{ users: any[] }>({ users: [] })
const securitySettings = reactive<any>({})
const pathAccessSettings = reactive<{ allowWorkspaceParent: boolean; allowedBasePaths: string[] }>({
  allowWorkspaceParent: false,
  allowedBasePaths: []
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

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}时`
  if (hours > 0) return `${hours}时${minutes}分`
  return `${minutes}分钟`
}

const formatUpdatedAt = (timeString: string) => {
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const navigateToTab = (tab: string) => { activeTab.value = tab }
const navigateToAlerts = () => { router.push('/ports/alerts') }

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
      pathAccessSettings
    })

    // 调试日志：保存前的数据
    console.log('🔍 保存前的数据检查：')
    console.log('  - accounts.users:', accounts.users)
    console.log('  - payloadSettings.accounts:', payloadSettings.accounts)
    console.log('  - 完整的 payloadSettings:', JSON.stringify(payloadSettings, null, 2))

    const resp = await systemSettingsApiService.save({ settings: payloadSettings, versionToken: meta.versionToken })

    // 调试日志：保存响应
    console.log('📥 保存响应：', resp)

    if (resp.success && resp.data) {
      const data = resp.data as SystemSettingsResponse

      // 调试日志：服务器返回的数据
      console.log('✅ 服务器返回的数据：')
      console.log('  - data.settings.accounts:', data.settings.accounts)
      console.log('  - 完整的 data.settings:', JSON.stringify(data.settings, null, 2))

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

// 变更回调（带同步期抑制）
const onSecurityChanged = () => { if (__syncing) return; isDirty.value = true }
const onPathAccessChanged = () => { if (__syncing) return; isDirty.value = true }

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
  padding: 22px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 26%),
    linear-gradient(180deg, #eef4ff 0%, #f7f9fc 48%, #eef2f8 100%);
}

.settings-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 28px 30px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.84));
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
}

.settings-hero-copy {
  flex: 1;
  min-width: 0;
}

.settings-eyebrow,
.overview-eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-title {
  margin-top: 14px;
  color: var(--text-strong);
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.settings-subtitle {
  max-width: 760px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.settings-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
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

.settings-hero-actions {
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

.settings-overview {
  margin-top: 18px;
}

.overview-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.overview-title {
  margin-top: 10px;
  color: var(--text-strong);
  font-size: 26px;
  line-height: 1.1;
}

.overview-description {
  max-width: 520px;
  color: var(--text-secondary);
  font-size: 14px;
}

.overview-card {
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.overview-card :deep(.el-card__body) {
  padding: 18px 20px;
}

.overview-card.clickable {
  cursor: pointer;
}

.overview-card.clickable:hover {
  transform: translateY(-4px);
  box-shadow: 0 22px 42px rgba(15, 23, 42, 0.08);
  border-color: rgba(37, 99, 235, 0.18);
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.card-icon {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(14, 165, 233, 0.16));
  border-radius: 16px;
  color: var(--primary-600);
}

.card-info {
  flex: 1;
}

.card-title {
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 600;
}

.card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-strong);
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.card-value.text-sm {
  font-size: 16px;
  font-weight: 700;
}

.settings-panel {
  margin-top: 18px;
  padding: 22px 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
}

.settings-tabs {
  background: transparent;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.tab-content {
  padding: 18px 0 0;
  min-height: 400px;
}

.log-center-tabs {
  margin-bottom: 16px;
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
  margin-bottom: 24px;
}

:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: rgba(148, 163, 184, 0.2);
}

:deep(.el-tabs__active-bar) {
  background: linear-gradient(90deg, #2563eb, #0ea5e9);
  height: 3px;
  border-radius: 999px;
}

:deep(.el-tabs__item.is-active) {
  color: var(--primary-600);
  font-weight: 700;
}

:deep(.el-tabs__item:hover) {
  color: var(--primary-600);
}

@media (max-width: 980px) {
  .settings-hero,
  .overview-heading {
    flex-direction: column;
  }

  .settings-hero-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .system-settings {
    padding: 16px 14px;
  }

  .settings-hero,
  .settings-panel {
    padding: 18px;
    border-radius: 24px;
  }

  .settings-hero-actions,
  .settings-action {
    width: 100%;
  }

  .overview-card {
    margin-bottom: 12px;
  }

  .tab-content {
    min-height: 0;
  }
}
</style>
