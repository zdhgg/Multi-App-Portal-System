<template>
  <div class="system-settings">
    <!-- 紧凑工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-hint">管理系统配置和用户账户</span>
      </div>
      <div class="toolbar-right">
        <el-button :icon="Refresh" @click="refreshSettings" :loading="loading.refresh" size="small">刷新</el-button>
        <el-button
          :type="isDirty ? 'danger' : 'success'"
          :icon="Check"
          @click="saveAllSettings"
          :loading="loading.save"
          :disabled="!meta.versionToken || !isDirty"
          size="small"
          class="save-button"
          :class="{ 'has-changes': isDirty }"
        >
          {{ isDirty ? '保存 (有更改)' : '保存' }}
        </el-button>
      </div>
    </div>

    <div class="settings-overview">
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
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRouter 在其他文件中可正常导入
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Refresh, Check, User, Document,
  FolderOpened, Lock, Clock
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
.system-settings { padding: 16px; background: #f5f7fa; min-height: 100vh; }

/* 紧凑工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}
.toolbar-left { flex: 1; }
.toolbar-hint { font-size: 14px; color: #909399; }
.toolbar-right { display: flex; gap: 8px; }

.el-button[type='success'][disabled] { opacity: 0.6; }

/* 保存按钮样式 */
.save-button.has-changes {
  animation: pulse 2s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(245, 108, 108, 0.6);
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(245, 108, 108, 0.6);
  }
  50% {
    box-shadow: 0 0 30px rgba(245, 108, 108, 0.8);
  }
}

.overview-card { transition: transform .15s ease; }
.overview-card.clickable { cursor: pointer; }
.overview-card.clickable:hover { transform: translateY(-2px); }
.card-content { display: flex; align-items: center; gap: 16px; }
.card-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: #e0f2fe; border-radius: 12px; color: #0284c7; }
.card-info { flex: 1; }
.card-title { font-size: 14px; color: #6b7280; margin-bottom: 4px; font-weight: 500; }
.card-value { font-size: 24px; font-weight: 700; color: #111827; line-height: 1.2; }
.card-value.text-sm { font-size: 14px; font-weight: 600; }

.settings-tabs { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); margin-top: 16px; }
.tab-label { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.tab-content { padding: 20px 0; min-height: 400px; }
.log-center-tabs { margin-bottom: 16px; }

.panel-placeholder { display: flex; align-items: center; justify-content: center; min-height: 300px; background: #fafafa; border-radius: 8px; border: 2px dashed #d1d5db; }

@media (max-width: 768px) {
  .system-settings { padding: 16px; }
  .page-header { padding: 24px 20px; }
  .header-content { flex-direction: column; align-items: stretch; gap: 20px; }
  .page-title { font-size: 24px; }
  .action-buttons { justify-content: center; }
  .settings-tabs { padding: 16px; }
  .tab-content { padding: 16px 0; }
}

:deep(.el-tabs__header) { margin-bottom: 24px; }
:deep(.el-tabs__nav-wrap::after) { height: 2px; background: linear-gradient(90deg, #667eea, #764ba2); }
:deep(.el-tabs__active-bar) { background: linear-gradient(90deg, #667eea, #764ba2); height: 3px; }
:deep(.el-tabs__item.is-active) { color: #667eea; font-weight: 600; }
:deep(.el-tabs__item:hover) { color: #667eea; }
</style>
