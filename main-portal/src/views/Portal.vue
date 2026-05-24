<template>
  <div class="portal-container">
    <div class="portal-shell">
      <header class="portal-header">
        <section class="hero-panel">
          <div class="hero-copy">
            <div class="hero-title-row">
              <h1 class="portal-title">智能应用门户</h1>
              <div class="hero-meta">
                <div class="system-status" :class="systemStatusClass">
                  <span class="status-indicator"></span>
                  <span class="status-text">{{ systemStatusText }}</span>
                </div>
                <span class="meta-chip" :class="{ connected: wsConnected }">
                  {{ connectionStatusText }}
                </span>
                <span class="meta-chip meta-chip-muted">
                  更新于 {{ formatTime(lastUpdateTime) }}
                </span>
              </div>
            </div>
            <p class="portal-subtitle">集中访问、筛选并管理接入门户的核心应用服务。</p>
          </div>

          <div class="hero-side">
            <div class="user-panel">
              <span class="panel-label">当前账户</span>
              <UserProfile />
            </div>
          </div>
        </section>
      </header>

      <main class="portal-main">
        <section class="toolbar-panel">
          <div class="toolbar-top">
            <div class="search-box">
              <el-input
                v-model="searchQuery"
                placeholder="搜索应用、描述或技术栈"
                :prefix-icon="Search"
                clearable
                @input="handleSearch"
              />
            </div>

            <div class="toolbar-actions">
              <template v-if="authStore.isAdmin">
                <router-link to="/management" class="admin-link" style="margin-right: 10px;">
                  <el-button class="toolbar-action toolbar-action-secondary" :icon="Grid">
                    应用管理
                  </el-button>
                </router-link>

                <el-button
                  type="primary"
                  class="toolbar-action toolbar-action-primary"
                  :icon="Plus"
                  @click="openAddApp"
                >
                  添加应用
                </el-button>

                <el-dropdown trigger="click" @command="handleAdminCommand">
                  <el-button class="toolbar-action-more" :icon="MoreFilled" circle />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="refresh" :icon="Refresh">
                        同步应用状态
                      </el-dropdown-item>
                      <el-dropdown-item divided command="admin" :icon="Monitor">
                        系统全局设置
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>

              <el-button
                v-else
                :icon="Refresh"
                @click="refreshApps"
                :loading="loading.refresh"
                class="toolbar-action"
              >
                刷新视图
              </el-button>
            </div>
          </div>

          <div class="toolbar-bottom">
            <div class="filter-buttons">
              <el-button
                :type="activeFilter === 'all' ? 'primary' : 'default'"
                @click="setFilter('all')"
                class="toolbar-filter"
                :class="{ 'is-active': activeFilter === 'all' }"
              >
                全部
                <span class="filter-count">{{ stats.total }}</span>
              </el-button>
              <el-button
                :type="activeFilter === 'running' ? 'primary' : 'default'"
                @click="setFilter('running')"
                class="toolbar-filter"
                :class="{ 'is-active': activeFilter === 'running' }"
              >
                运行中
                <span class="filter-count">{{ stats.running }}</span>
              </el-button>
              <el-button
                :type="activeFilter === 'offline' ? 'primary' : 'default'"
                @click="setFilter('offline')"
                class="toolbar-filter"
                :class="{ 'is-active': activeFilter === 'offline' }"
              >
                离线
                <span class="filter-count">{{ stats.offline }}</span>
              </el-button>
            </div>

            <div class="toolbar-summary">
              <span class="summary-pill">{{ activeFilterLabel }}</span>
              <span class="summary-text">当前显示 {{ filteredApps.length }} / {{ stats.total }} 个应用</span>
            </div>
          </div>

          <div v-if="authStore.isGuest && showGuestHint" class="guest-hint">
            <el-alert
              title="管理提示"
              type="info"
              :closable="true"
              @close="dismissGuestHint"
              show-icon
            >
              <template #default>
                <span>{{ guestNeedsLoginForPortalData ? '当前环境已关闭匿名公共数据访问，请先登录查看应用列表' : '需要管理员权限才能添加和管理应用' }}</span>
              </template>
            </el-alert>
          </div>
        </section>

        <section class="content-panel">
          <div class="content-heading">
            <div>
              <span class="content-eyebrow">Pinned Applications</span>
              <h2 class="content-title">{{ activeFilterLabel }}视图</h2>
            </div>
            <p class="content-note">{{ activeFilterDescription }}</p>
          </div>

          <div v-if="loading.initial || !authStore.isInitialized" class="state-panel loading-container">
            <el-skeleton :rows="4" animated />
            <p class="loading-text">
              {{ !authStore.isInitialized ? '正在初始化认证状态...' : '正在加载应用...' }}
            </p>
          </div>

          <div v-else-if="filteredApps.length === 0" class="state-panel empty-state">
            <div class="empty-ornament" aria-hidden="true"></div>
            <h3 class="empty-title">
              {{ getEmptyStateTitle }}
            </h3>
            <p class="empty-description">
              {{ getEmptyStateDescription }}
            </p>

            <div v-if="authStore.isAdmin && !searchQuery" class="empty-actions">
              <el-button type="primary" class="empty-action-primary" @click="openAddApp">
                立即添加应用
              </el-button>
              <router-link to="/admin">
                <el-button class="empty-action-secondary">
                  前往系统设置
                </el-button>
              </router-link>
            </div>
          </div>

          <div v-else class="apps-grid">
            <AppCard
              v-for="app in filteredApps"
              :key="app.id"
              :app="app"
              :refreshing="Boolean(refreshingAppIds[String(app.id)])"
              :refresh-cooling-down="Boolean(refreshCooldownIds[String(app.id)])"
              @access="handleAppAccess"
              @refresh="handleAppRefresh"
              @details="handleAppDetails"
            />
          </div>
        </section>
      </main>

      <footer class="portal-footer">
        <div class="footer-content">
          <div class="footer-left">
            <span class="copyright">© 2025 智能应用门户系统</span>
            <span class="version-badge">{{ portalVersion }}</span>
          </div>
          <div class="footer-right">
            <span class="footer-note">最后更新 {{ formatTime(lastUpdateTime) }}</span>
            <span class="meta-chip footer-connection" :class="{ connected: wsConnected }">
              {{ connectionStatusText }}
            </span>
          </div>
        </div>
      </footer>

      <AppDetailDialog
        v-model:visible="showDetailDialog"
        :app="selectedApp"
        @access="handleAppAccess"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Plus, Setting, Grid, Monitor, MoreFilled } from '@element-plus/icons-vue'
import AppCard from '@/components/portal/AppCard.vue'
import AppDetailDialog from '@/components/portal/AppDetailDialog.vue'
import UserProfile from '@/components/auth/UserProfile.vue'
import { usePortalStore } from '@/stores/portal'
import { useAuthStore } from '@/stores/auth'
import { publicApiService } from '@/services/publicApi'
import { useWebSocket } from '@/composables/useWebSocket'
import { getAppAccessUrl, resolveAppProtocol } from '@/types/app'
import { generateAppAccessUrl } from '@/utils/networkUtils'
import { debugLog, debugWarn } from '@/utils/debugControl'
import { getVersionString } from '@/config/version'

const portalStore = usePortalStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const { connect, disconnect, isConnected } = useWebSocket()
const portalVersion = getVersionString()

const searchQuery = ref('')
const activeFilter = ref('all')
const showDetailDialog = ref(false)
const selectedApp = ref<any | null>(null)
const lastUpdateTime = ref(new Date())
const showGuestHint = ref(true)
const refreshingAppIds = reactive<Record<string, boolean>>({})
const refreshCooldownIds = reactive<Record<string, boolean>>({})
const REFRESH_COOLDOWN_MS = 2000

const loading = reactive({
  initial: true,
  refresh: false
})

const apps = computed(() => portalStore.apps)
const stats = computed(() => portalStore.stats)
const wsConnected = computed(() => isConnected.value)
const guestNeedsLoginForPortalData = computed(() => authStore.isGuest && portalStore.guestAccessRestricted)
const connectionStatusText = computed(() => {
  if (authStore.isGuest) {
    return guestNeedsLoginForPortalData.value ? '登录后可实时更新' : '访客模式'
  }

  return wsConnected.value ? '实时连接' : '连接断开'
})

const systemStatusClass = computed(() => {
  if (stats.value.running === 0) return 'status-error'
  if (stats.value.running < stats.value.total / 2) return 'status-warning'
  return 'status-success'
})

const systemStatusText = computed(() => {
  if (stats.value.total === 0) return '暂无应用'
  if (stats.value.running === 0) return '系统离线'
  if (stats.value.running < stats.value.total / 2) return '部分在线'
  return '系统正常'
})

const filteredApps = computed(() => {
  let result = [...apps.value]

  if (activeFilter.value === 'running') {
    result = result.filter(app => app.isRunning)
  } else if (activeFilter.value === 'offline') {
    result = result.filter(app => !app.isRunning)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(app =>
      app.name.toLowerCase().includes(query) ||
      app.description?.toLowerCase().includes(query) ||
      app.techStack.toLowerCase().includes(query)
    )
  }

  if (activeFilter.value === 'all') {
    result.sort((a, b) => Number(b.isRunning) - Number(a.isRunning))
  }

  return result
})

const activeFilterLabel = computed(() => {
  switch (activeFilter.value) {
    case 'running':
      return '运行中'
    case 'offline':
      return '离线'
    default:
      return '全部应用'
  }
})

const activeFilterDescription = computed(() => {
  if (guestNeedsLoginForPortalData.value) {
    return '当前环境关闭了匿名公共数据访问，登录后可查看完整列表。'
  }

  if (searchQuery.value) {
    return `已根据“${searchQuery.value}”筛选当前应用结果。`
  }

  switch (activeFilter.value) {
    case 'running':
      return '聚焦当前可直接访问的在线服务。'
    case 'offline':
      return '集中查看待启动或离线中的应用。'
    default:
      return '浏览全部固定到首页的应用资产。'
  }
})

const systemHealthNote = computed(() => {
  if (stats.value.total === 0) return '等待应用接入门户后显示'
  if (stats.value.running === stats.value.total) return '所有应用均可直接访问'
  if (stats.value.running === 0) return '当前没有可直接访问的应用'
  return `${stats.value.running} 个应用处于可访问状态`
})

const getEmptyStateTitle = computed(() => {
  if (guestNeedsLoginForPortalData.value) {
    return '登录后可查看应用'
  }

  if (searchQuery.value) {
    return '未找到匹配的应用'
  }

  if (authStore.isAdmin) {
    return '还没有固定到首页的应用'
  }

  return '暂无固定应用'
})

const getEmptyStateDescription = computed(() => {
  if (guestNeedsLoginForPortalData.value) {
    return '当前门户已关闭匿名公共数据访问，请先登录后再查看应用列表'
  }

  if (searchQuery.value) {
    return '尝试调整搜索条件、切换筛选状态或返回全部应用视图。'
  }

  if (authStore.isAdmin) {
    return '您可以在管理页面中将应用固定到首页展示，形成更清晰的访问入口。'
  }

  return '管理员还未设置固定到首页的应用'
})

const refreshApps = async () => {
  if (authStore.isGuest && !publicApiService.canCurrentUserAccessPublicApi()) {
    showGuestHint.value = true
    ElMessage.info('当前环境需要登录后才能查看应用列表')
    return
  }

  loading.refresh = true
  try {
    await portalStore.loadApps()
    lastUpdateTime.value = new Date()
    ElMessage.success('应用列表已更新')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`刷新失败: ${errorMessage}`)
  } finally {
    loading.refresh = false
  }
}

const handleSearch = () => {
  // 搜索逻辑由计算属性处理
}

const handleAdminCommand = (command: string) => {
  switch (command) {
    case 'refresh':
      refreshApps()
      break
    case 'management':
      router.push('/management')
      break
    case 'admin':
      router.push('/admin')
      break
  }
}

const openAddApp = async () => {
  const targetRoute = {
    path: '/management',
    query: { action: 'add' }
  }

  try {
    const navigationResult = await router.push(targetRoute)
    if (navigationResult) {
      throw navigationResult
    }
  } catch (error) {
    console.warn('Router navigation to add app failed, falling back to location.assign', error)
    window.location.assign(router.resolve(targetRoute).href)
  }
}

const setFilter = (filter: string) => {
  activeFilter.value = filter
}

const handleAppAccess = (app: any) => {
  if (!app.isRunning) {
    ElMessage.warning('应用当前未运行')
    return
  }

  let targetPort: number | null = null

  if (app.backend_port && app.frontend_port) {
    if (app.deploymentMode === 'production') {
      targetPort = app.backend_port
      debugLog('🎯 访问应用-生产模式:', { name: app.name, port: targetPort, mode: 'PM2' })
    } else if (app.deploymentMode === 'development') {
      targetPort = app.frontend_port
      debugLog('🎯 访问应用-开发模式:', { name: app.name, port: targetPort, mode: 'DEV' })
    } else {
      targetPort = app.frontend_port
      debugLog('🎯 访问应用-未知模式:', { name: app.name, port: targetPort })
    }
  }

  let url: string | null = null
  if (targetPort) {
    const preferredProtocol = resolveAppProtocol(app)

    url = generateAppAccessUrl(targetPort, {
      protocol: preferredProtocol,
      hostname: app.accessHost || undefined,
      fallbackToLocalhost: true,
      validateUrl: true
    })
    debugLog('🌐 生成访问URL:', { port: targetPort, protocol: preferredProtocol, url })
  } else {
    url = getAppAccessUrl(app)
  }

  if (!url) {
    ElMessage.error('应用访问地址不可用')
    return
  }

  window.open(url, '_blank')
}

const handleAppRefresh = async (app: any) => {
  const refreshKey = String(app.id)
  if (refreshingAppIds[refreshKey] || refreshCooldownIds[refreshKey]) {
    return
  }

  refreshCooldownIds[refreshKey] = true
  setTimeout(() => {
    delete refreshCooldownIds[refreshKey]
  }, REFRESH_COOLDOWN_MS)

  refreshingAppIds[refreshKey] = true
  try {
    await portalStore.refreshAppStatus(app.id)
    lastUpdateTime.value = new Date()
    ElMessage.success(`${app.name} 状态已刷新`)
  } catch (error) {
    console.error('刷新单个应用失败:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`刷新 ${app.name} 失败: ${errorMessage}`)
  } finally {
    refreshingAppIds[refreshKey] = false
  }
}

const handleAppDetails = (app: any) => {
  selectedApp.value = app
  showDetailDialog.value = true
}

const formatTime = (time: Date) => {
  return time.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const dismissGuestHint = () => {
  showGuestHint.value = false
  localStorage.setItem('guest_hint_dismissed', 'true')
}

const handleQueryParams = () => {
  const query = route.query

  if (query.authRequired === 'true') {
    ElMessage.info('该页面需要登录权限，请先登录')
    showGuestHint.value = true
  }

  if (query.message) {
    const messages: Record<string, string> = {
      'account_disabled': '您的账户已被禁用，请联系管理员',
      'token_expired': '登录已过期，请重新登录',
      'permission_denied': '权限不足，无法访问请求的页面'
    }

    const message = messages[query.message as string]
    if (message) {
      ElMessage.warning(message)
    }
  }

  if (query.search) {
    searchQuery.value = query.search as string
  }

  if (query.loginSuccess === 'true') {
    ElMessage.success('登录成功！欢迎回来')
  }
}

const setupWebSocket = () => {
  connect({
    onConnect: () => {
      debugLog('门户WebSocket连接成功')
    },
    onMessage: message => {
      if (message.type === 'portal_app_status') {
        portalStore.updateAppStatus(message.payload)
        lastUpdateTime.value = new Date()
      } else if (message.type === 'apps_status') {
        portalStore.updateAppsStatus(message.payload.apps)
        lastUpdateTime.value = new Date()
      } else if (message.type === 'app_status_changed') {
        debugLog('收到应用状态变更通知:', message.payload)

        const payload = message.payload
        portalStore.updateAppStatus({
          appId: payload.appId,
          isRunning: payload.isRunning,
          state: payload.state,
          deploymentMode: payload.deploymentMode,
          status: payload.isRunning ? 'online' : 'offline'
        })

        portalStore.loadApps()

        lastUpdateTime.value = new Date()
        ElMessage.success(`应用 ${payload.appName} 状态已更新`)
      }
    },
    onError: error => {
      console.error('门户WebSocket错误:', error)
      ElMessage.error('实时连接异常')
    }
  })

  setTimeout(() => {
    if (isConnected.value) {
      const ws = (window as any).__portalWebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'portal_subscribe'
        }))
      }
    }
  }, 1000)
}

const reloadPortalForAuthChange = async (isAuthenticated: boolean) => {
  if (loading.initial || !authStore.isInitialized) {
    return
  }

  loading.refresh = true

  try {
    if (!isAuthenticated) {
      disconnect()
    }

    await portalStore.loadApps()
    lastUpdateTime.value = new Date()

    if (isAuthenticated) {
      setupWebSocket()
    }
  } catch (error) {
    console.error('认证状态变更后刷新门户数据失败:', error)
  } finally {
    loading.refresh = false
  }
}

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated, previousAuthenticated) => {
    if (previousAuthenticated === undefined || previousAuthenticated === isAuthenticated) {
      return
    }

    await reloadPortalForAuthChange(isAuthenticated)
  }
)

onMounted(async () => {
  try {
    if (!authStore.isInitialized) {
      debugLog('等待认证状态初始化完成...')
      let retryCount = 0
      while (!authStore.isInitialized && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retryCount++
      }

      if (!authStore.isInitialized) {
        debugWarn('认证状态初始化超时，继续执行')
      } else {
        debugLog('认证状态初始化完成')
      }
    }

    handleQueryParams()

    const guestHintDismissed = localStorage.getItem('guest_hint_dismissed')
    if (guestHintDismissed === 'true') {
      showGuestHint.value = false
    }

    await portalStore.loadApps()

    if (authStore.isAuthenticated) {
      setupWebSocket()
    }

    lastUpdateTime.value = new Date()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`初始化失败: ${errorMessage}`)
  } finally {
    loading.initial = false
  }
})

onUnmounted(() => {
  disconnect()
})
</script>

<style scoped>
.portal-container {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding: 22px 24px 18px;
  background: #f8fafc;
}

.portal-container::before,
.portal-container::after {
  display: none;
}


.portal-shell {
  max-width: 1380px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

.portal-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 18px;
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: relative;
  animation: fadeUp 0.55s ease both;
}

.hero-panel::after {
  display: none;
}

.hero-copy {
  flex: 1 1 auto;
  max-width: 800px;
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.portal-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #1e293b;
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.portal-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
}

.system-status,
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}

.system-status.status-success {
  background: #f0fdf4;
  color: #16a34a;
}

.system-status.status-warning {
  background: #fefce8;
  color: #ca8a04;
}

.system-status.status-error {
  background: #fef2f2;
  color: #dc2626;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.6);
  animation: pulse 2.6s ease-in-out infinite;
}

.meta-chip {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
}

.meta-chip.connected {
  color: var(--success-500);
  border-color: rgba(5, 150, 105, 0.14);
  background: rgba(236, 253, 245, 0.82);
}

.meta-chip-muted {
  color: var(--text-tertiary);
}

.hero-side {
  display: contents; 
}

.user-panel {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  order: 2; /* 排列在右侧 */
  flex: 0 0 auto;
}


.panel-label {
  display: none;
}


.portal-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar-panel {
  padding: 8px 6px;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  animation: fadeUp 0.68s ease both;
}

.toolbar-top,
.toolbar-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-bottom {
  margin-top: 14px;
  padding-top: 14px;
  /* 移除生硬的分界线，改用软性的留白对齐 */
  border: none;
}

.search-box {
  flex: 1;
  min-width: 280px;
  max-width: 520px;
}

.filter-buttons {
  display: inline-flex;
  padding: 4px;
  background: rgba(148, 163, 184, 0.12);
  border-radius: 14px;
  gap: 2px;
  position: relative;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-action,
.toolbar-filter,
.empty-action-primary,
.empty-action-secondary {
  min-height: 32px;
  border-radius: 6px;
  font-weight: 600;
}

.toolbar-action {
  padding: 0 16px;
}

.toolbar-action-refresh {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.78);
}

.toolbar-action-secondary {
  border-color: rgba(148, 163, 184, 0.24);
  color: var(--text-primary);
  background: rgba(248, 250, 252, 0.86);
}

.toolbar-filter {
  min-height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  border: none !important;
  background: transparent !important;
  color: var(--text-secondary) !important;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 激活态滑块效果 */
.toolbar-filter.is-active {
  background: #fff !important;
  color: var(--primary-600) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.toolbar-filter:hover:not(.is-active) {
  background: rgba(255, 255, 255, 0.6) !important;
  color: var(--text-primary) !important;
}

.filter-count {
  margin-left: 8px;
  font-family: var(--font-number);
  font-size: 12px;
  color: currentColor;
  opacity: 0.8;
}

.toolbar-action-more {
  border-color: rgba(148, 163, 184, 0.18) !important;
  background: white !important;
  color: var(--text-secondary) !important;
  border-radius: 6px !important;
}

.toolbar-action-more:hover {
  background: #f8fafc !important;
  color: var(--primary-600) !important;
}

.toolbar-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-text {
  color: var(--text-secondary);
  font-size: 13px;
}

.guest-hint {
  margin-top: 12px;
}

.content-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.content-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.content-eyebrow {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.content-title {
  font-size: 24px;
  line-height: 1.1;
  color: var(--text-strong);
}

.content-note {
  max-width: 480px;
  color: var(--text-secondary);
  font-size: 13px;
}

.state-panel {
  padding: 40px 28px;
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  border: 1px solid var(--surface-border);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
}

.loading-container {
  text-align: center;
}

.loading-text {
  margin-top: 22px;
  color: var(--text-secondary);
  font-size: 15px;
}

.empty-state {
  text-align: center;
}

.empty-ornament {
  width: 84px;
  height: 84px;
  margin: 0 auto 22px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.18), rgba(37, 99, 235, 0.02) 65%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(219, 234, 254, 0.7));
  border: 1px solid rgba(37, 99, 235, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 18px 36px rgba(37, 99, 235, 0.1);
  position: relative;
}

.empty-ornament::before,
.empty-ornament::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: 999px;
}

.empty-ornament::before {
  width: 34px;
  height: 34px;
  border: 2px solid rgba(37, 99, 235, 0.38);
}

.empty-ornament::after {
  width: 10px;
  height: 10px;
  background: rgba(37, 99, 235, 0.62);
}

.empty-title {
  font-size: 28px;
  line-height: 1.15;
  color: var(--text-strong);
}

.empty-description {
  max-width: 520px;
  margin: 14px auto 0;
  color: var(--text-secondary);
  font-size: 15px;
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 28px;
}

.empty-action-primary {
  padding: 0 22px;
}

.empty-action-secondary {
  padding: 0 22px;
  border-color: rgba(148, 163, 184, 0.24);
  color: var(--text-primary);
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.portal-footer {
  margin-top: 28px;
  padding: 14px 6px 4px;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 14px;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  font-family: var(--font-number);
  font-size: 12px;
  color: var(--text-secondary);
}

.footer-note {
  color: var(--text-secondary);
}

.footer-connection {
  min-height: 32px;
  font-size: 12px;
}

.admin-link {
  text-decoration: none;
}

.search-box :deep(.el-input__wrapper) {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
}

.search-box :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.42),
    0 0 0 4px rgba(37, 99, 235, 0.08);
}

.search-box :deep(.el-input__inner) {
  color: var(--text-primary);
  font-size: 14px;
}

:deep(.toolbar-panel .el-alert) {
  border-radius: 18px;
  border: 1px solid rgba(59, 130, 246, 0.12);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(0.92);
  }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .hero-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .hero-copy {
    width: 100%;
    max-width: none;
    order: unset; /* 取消顺序 */
  }

  .hero-side {
    display: flex; /* 回归普通包裹器 */
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .hero-stats {
    order: unset;
    margin: 0; /* 取消居中吸收 */
    width: 100%;
    max-width: none;
  }

  .user-panel {
    order: unset;
    align-self: flex-end; /* 在窄屏下对齐到右边 */
    width: 100%;
  }
}

@media (max-width: 768px) {
  .portal-container {
    padding: 18px 14px 16px;
  }

  .hero-panel,
  .toolbar-panel,
  .state-panel {
    padding: 18px;
    border-radius: 24px;
  }

  .hero-copy {
    width: 100%;
  }

  .hero-meta,
  .toolbar-actions,
  .filter-buttons {
    width: 100%;
  }

  .toolbar-actions > * {
    flex: 1 1 180px;
  }

  .hero-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-card {
    row-gap: 6px;
    padding: 16px 20px;
  }

  .metric-card::before,
  .metric-card::after {
    display: none; /* 移动端平铺模式下隐藏分割线 */
  }

  .content-heading,
  .footer-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .apps-grid {
    grid-template-columns: 1fr;
  }

  .empty-actions {
    width: 100%;
  }
}

@media (max-width: 540px) {
  .portal-title {
    font-size: 30px;
  }

  .portal-subtitle {
    font-size: 15px;
  }

  .hero-stats {
    grid-template-columns: 1fr;
  }

  .toolbar-filter,
  .toolbar-action,
  .empty-action-primary,
  .empty-action-secondary {
    width: 100%;
  }

  .toolbar-summary {
    width: 100%;
    justify-content: flex-start;
  }

  .empty-actions {
    flex-direction: column;
  }
}
</style>
