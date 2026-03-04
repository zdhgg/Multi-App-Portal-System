<template>
  <div class="portal-container">
    <!-- 门户头部 -->
    <header class="portal-header">
      <div class="header-content">
        <div class="header-left">
          <h1 class="portal-title">
            <span class="title-icon">🌐</span>
            智能应用门户
          </h1>
          <p class="portal-subtitle">访问您的所有应用服务</p>
        </div>
        <div class="header-right">
          <div class="system-status" :class="systemStatusClass">
            <span class="status-indicator"></span>
            <span class="status-text">{{ systemStatusText }}</span>
          </div>
          <div class="header-stats">
            <div class="stat-item">
              <span class="stat-label">在线应用</span>
              <span class="stat-value">{{ stats.running }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">总计</span>
              <span class="stat-value">{{ stats.total }}</span>
            </div>
          </div>
          
          <!-- 用户认证组件 -->
          <div class="user-section">
            <UserProfile />
          </div>
        </div>
      </div>
    </header>

    <!-- 应用网格区域 -->
    <main class="portal-main">
      <div class="apps-container">
        <!-- 搜索和筛选 -->
        <div class="toolbar">
          <div class="search-box">
            <el-input
              v-model="searchQuery"
              placeholder="搜索应用..."
              :prefix-icon="Search"
              clearable
              @input="handleSearch"
            />
          </div>
          <div class="filter-buttons">
            <el-button
              :type="activeFilter === 'all' ? 'primary' : 'default'"
              @click="setFilter('all')"
              size="small"
            >
              全部 ({{ stats.total }})
            </el-button>
            <el-button
              :type="activeFilter === 'running' ? 'success' : 'default'"
              @click="setFilter('running')"
              size="small"
            >
              运行中 ({{ stats.running }})
            </el-button>
            <el-button
              :type="activeFilter === 'offline' ? 'info' : 'default'"
              @click="setFilter('offline')"
              size="small"
            >
              离线 ({{ stats.offline }})
            </el-button>
          </div>
          <el-button
            :icon="Refresh"
            @click="refreshApps"
            :loading="loading.refresh"
            size="small"
            type="primary"
            style="background-color: #409eff; border-color: #409eff; color: white;"
          >
            刷新
          </el-button>
          
          <!-- 管理员功能按钮 -->
          <template v-if="authStore.isAdmin">
            <router-link to="/detection" class="admin-link">
              <el-button type="primary" size="small">
                ➕ 添加应用
              </el-button>
            </router-link>
            <router-link to="/management" class="admin-link">
              <el-button type="info" size="small">
                ⚙️ 管理
              </el-button>
            </router-link>
            <router-link to="/admin" class="admin-link">
              <el-button type="warning" size="small">
                🔧 系统设置
              </el-button>
            </router-link>
          </template>
          
          <!-- 访客提示 -->
          <div v-else-if="authStore.isGuest && showGuestHint" class="guest-hint">
            <el-alert
              title="管理提示"
              type="info"
              :closable="true"
              @close="dismissGuestHint"
              show-icon
            >
              <template #default>
                <span>需要管理员权限才能添加和管理应用</span>
              </template>
            </el-alert>
          </div>
        </div>

        <!-- 应用网格 -->
        <div v-if="loading.initial || !authStore.isInitialized" class="loading-container">
          <el-skeleton :rows="3" animated />
          <p class="loading-text">
            {{ !authStore.isInitialized ? '正在初始化认证状态...' : '正在加载应用...' }}
          </p>
        </div>
        
        <div v-else-if="filteredApps.length === 0" class="empty-state">
          <div class="empty-icon">📱</div>
          <h3 class="empty-title">
            {{ getEmptyStateTitle }}
          </h3>
          <p class="empty-description">
            {{ getEmptyStateDescription }}
          </p>
          
          <!-- 管理员快速操作 -->
          <div v-if="authStore.isAdmin && !searchQuery" class="empty-actions">
            <el-space :size="16">
              <router-link to="/detection">
                <el-button type="primary" size="large">
                  ➕ 立即添加应用
                </el-button>
              </router-link>
              <router-link to="/admin">
                <el-button type="default" size="large">
                  🔧 系统设置
                </el-button>
              </router-link>
            </el-space>
          </div>
        </div>
        
        <div v-else class="apps-grid">
          <AppCard
            v-for="app in filteredApps"
            :key="app.id"
            :app="app"
            @access="handleAppAccess"
            @refresh="handleAppRefresh"
            @details="handleAppDetails"
          />
        </div>
      </div>
    </main>

    <!-- 底部信息 -->
    <footer class="portal-footer">
      <div class="footer-content">
        <div class="footer-left">
          <span class="copyright">© 2025 智能应用门户系统</span>
          <span class="version">v2.0</span>
        </div>
        <div class="footer-right">
          <span class="last-update">
            最后更新: {{ formatTime(lastUpdateTime) }}
          </span>
          <span class="connection-status" :class="{ connected: wsConnected }">
            {{ wsConnected ? '实时连接' : '连接断开' }}
          </span>
        </div>
      </div>
    </footer>

    <!-- 应用详情对话框 -->
    <AppDetailDialog
      v-model:visible="showDetailDialog"
      :app="selectedApp"
      @access="handleAppAccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRoute 在其他文件中可正常导入
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import AppCard from '@/components/portal/AppCard.vue'
import AppDetailDialog from '@/components/portal/AppDetailDialog.vue'
import UserProfile from '@/components/auth/UserProfile.vue'
import { usePortalStore } from '@/stores/portal'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/composables/useWebSocket'
import { getAppAccessUrl, resolveAppProtocol } from '@/types/app'
import { generateAppAccessUrl } from '@/utils/networkUtils'

const portalStore = usePortalStore()
const authStore = useAuthStore()
const route = useRoute()
const { connect, disconnect, isConnected } = useWebSocket()

// 响应式数据
const searchQuery = ref('')
const activeFilter = ref('all')
const showDetailDialog = ref(false)
const selectedApp = ref(null)
const lastUpdateTime = ref(new Date())
const showGuestHint = ref(true)

// 加载状态
const loading = reactive({
  initial: true,
  refresh: false
})

// 计算属性
const apps = computed(() => portalStore.apps)
const stats = computed(() => portalStore.stats)
const wsConnected = computed(() => isConnected.value)

const systemStatusClass = computed(() => {
  if (stats.value.running === 0) return 'status-error'
  if (stats.value.running < stats.value.total / 2) return 'status-warning'
  return 'status-success'
})

const systemStatusText = computed(() => {
  if (stats.value.running === 0) return '系统离线'
  if (stats.value.running < stats.value.total / 2) return '部分在线'
  return '系统正常'
})

const filteredApps = computed(() => {
  let result = apps.value

  // 状态筛选
  if (activeFilter.value === 'running') {
    result = result.filter(app => app.isRunning)
  } else if (activeFilter.value === 'offline') {
    result = result.filter(app => !app.isRunning)
  }

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(app => 
      app.name.toLowerCase().includes(query) ||
      app.description?.toLowerCase().includes(query) ||
      app.techStack.toLowerCase().includes(query)
    )
  }

  return result
})

// 空状态标题
const getEmptyStateTitle = computed(() => {
  if (searchQuery.value) {
    return '未找到匹配的应用'
  }
  
  if (authStore.isAdmin) {
    return '还没有固定到首页的应用'
  }
  
  return '暂无固定应用'
})

// 空状态描述
const getEmptyStateDescription = computed(() => {
  if (searchQuery.value) {
    return '尝试调整搜索条件或查看全部应用'
  }
  
  if (authStore.isAdmin) {
    return '您可以在管理页面中将应用固定到首页显示'
  }
  
  return '管理员还未设置固定到首页的应用'
})

// 方法
const refreshApps = async () => {
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

const setFilter = (filter: string) => {
  activeFilter.value = filter
}

const handleAppAccess = (app: any) => {
  if (!app.isRunning) {
    ElMessage.warning('应用当前未运行')
    return
  }

  // 🎯 直接根据 deploymentMode 动态选择端口
  let targetPort: number | null = null
  
  // 1️⃣ 全栈应用：根据部署模式选择端口
  if (app.backend_port && app.frontend_port) {
    if (app.deploymentMode === 'production') {
      // 生产模式 → 后端端口
      targetPort = app.backend_port
      console.log('🎯 访问应用-生产模式:', { name: app.name, port: targetPort, mode: 'PM2' })
    } else if (app.deploymentMode === 'development') {
      // 开发模式 → 前端端口
      targetPort = app.frontend_port
      console.log('🎯 访问应用-开发模式:', { name: app.name, port: targetPort, mode: 'DEV' })
    } else {
      // 运行中但模式未知 → 使用前端端口
      targetPort = app.frontend_port
      console.log('🎯 访问应用-未知模式:', { name: app.name, port: targetPort })
    }
  }
  
  // 2️⃣ 生成访问URL - 🌐 支持局域网访问
  let url: string | null = null
  if (targetPort) {
    const preferredProtocol = resolveAppProtocol(app)

    url = generateAppAccessUrl(targetPort, {
      protocol: preferredProtocol,
      hostname: app.accessHost || undefined,
      fallbackToLocalhost: true,
      validateUrl: true
    })
    console.log('🌐 生成访问URL:', { port: targetPort, protocol: preferredProtocol, url })
  } else {
    // 降级：使用统一的URL获取逻辑
    url = getAppAccessUrl(app)
  }
  
  if (!url) {
    ElMessage.error('应用访问地址不可用')
    return
  }

  // 打开应用
  window.open(url, '_blank')
}

const handleAppRefresh = (app: any) => {
  portalStore.refreshAppStatus(app.id)
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

// 关闭访客提示
const dismissGuestHint = () => {
  showGuestHint.value = false
  // 保存到本地存储，避免每次都显示
  localStorage.setItem('guest_hint_dismissed', 'true')
}

// 处理URL查询参数
const handleQueryParams = () => {
  const query = route.query
  
  // 处理认证相关的查询参数
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
  
  // 处理搜索参数
  if (query.search) {
    searchQuery.value = query.search as string
  }
  
  // 处理重定向后的成功登录
  if (query.loginSuccess === 'true') {
    ElMessage.success('登录成功！欢迎回来')
  }
}

// 初始化WebSocket连接
const setupWebSocket = () => {
  connect({
    onConnect: () => {
      console.log('门户WebSocket连接成功')
    },
    onMessage: (message) => {
      if (message.type === 'portal_app_status') {
        portalStore.updateAppStatus(message.payload)
        lastUpdateTime.value = new Date()
      } else if (message.type === 'apps_status') {
        portalStore.updateAppsStatus(message.payload.apps)
        lastUpdateTime.value = new Date()
      } else if (message.type === 'app_status_changed') {
        // 🔔 处理PM2启动/停止的实时状态更新
        console.log('收到应用状态变更通知:', message.payload)
        
        // 🎯 立即更新应用状态（包括 deploymentMode）
        const payload = message.payload
        portalStore.updateAppStatus({
          appId: payload.appId,
          isRunning: payload.isRunning,
          state: payload.state,
          deploymentMode: payload.deploymentMode,
          status: payload.isRunning ? 'online' : 'offline'
        })
        
        // 🔄 异步重新加载应用列表以获取完整信息（如 accessUrl）
        portalStore.loadApps()
        
        lastUpdateTime.value = new Date()
        ElMessage.success(`应用 ${payload.appName} 状态已更新`)
      }
    },
    onError: (error) => {
      console.error('门户WebSocket错误:', error)
      ElMessage.error('实时连接异常')
    }
  })

  // 发送门户订阅消息
  setTimeout(() => {
    if (isConnected.value) {
      // WebSocket连接成功后订阅门户状态
      const ws = (window as any).__portalWebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'portal_subscribe'
        }))
      }
    }
  }, 1000)
}

// 生命周期
onMounted(async () => {
  try {
    // **关键修复：等待认证状态初始化完成**
    if (!authStore.isInitialized) {
      console.log('等待认证状态初始化完成...')
      // 等待认证初始化完成
      let retryCount = 0
      while (!authStore.isInitialized && retryCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retryCount++
      }
      
      if (!authStore.isInitialized) {
        console.warn('认证状态初始化超时，继续执行')
      } else {
        console.log('认证状态初始化完成')
      }
    }
    
    // 处理URL查询参数
    handleQueryParams()
    
    // 检查访客提示是否已被关闭
    const guestHintDismissed = localStorage.getItem('guest_hint_dismissed')
    if (guestHintDismissed === 'true') {
      showGuestHint.value = false
    }
    
    // 加载应用数据
    await portalStore.loadApps()
    
    // 建立WebSocket连接
    setupWebSocket()
    
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
}

.portal-header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  padding: 20px 0;
  position: relative;
  z-index: 10; /* 设置较低的z-index，确保不会遮挡模态框 */
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  flex: 1;
}

.portal-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  font-size: 36px;
}

.portal-subtitle {
  margin: 8px 0 0 0;
  color: #7f8c8d;
  font-size: 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.system-status.status-success {
  background: #d4edda;
  color: #155724;
}

.system-status.status-warning {
  background: #fff3cd;
  color: #856404;
}

.system-status.status-error {
  background: #f8d7da;
  color: #721c24;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

.header-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #7f8c8d;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
}

.portal-main {
  flex: 1;
  padding: 40px 20px;
}

.apps-container {
  max-width: 1200px;
  margin: 0 auto;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.search-box {
  flex: 1;
  max-width: 300px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
}

.loading-container {
  text-align: center;
  padding: 60px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
}

.loading-text {
  margin-top: 20px;
  color: #7f8c8d;
  font-size: 16px;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-title {
  margin: 0 0 12px 0;
  font-size: 24px;
  color: #2c3e50;
}

.empty-description {
  color: #7f8c8d;
  font-size: 16px;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.portal-footer {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 20px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #7f8c8d;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 16px;
  align-items: center;
}

.connection-status {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  background: #f8d7da;
  color: #721c24;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.admin-link {
  text-decoration: none;
}

.user-section {
  margin-left: 16px;
}

.guest-hint {
  width: 100%;
  margin-top: 16px;
}

.empty-actions {
  margin-top: 32px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 20px;
    text-align: center;
  }

  .header-right {
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .header-stats {
    justify-content: center;
  }

  .user-section {
    margin-left: 0;
    display: flex;
    justify-content: center;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-buttons {
    justify-content: center;
    flex-wrap: wrap;
  }

  .guest-hint {
    order: 1;
  }

  .apps-grid {
    grid-template-columns: 1fr;
  }

  .empty-actions {
    margin-top: 24px;
  }

  .footer-content {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }

  /* 管理员按钮在移动端的排列 */
  .toolbar template {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
}

/* 中等屏幕适配 */
@media (max-width: 1024px) and (min-width: 769px) {
  .header-stats {
    gap: 16px;
  }

  .user-section {
    margin-left: 12px;
  }

  .toolbar {
    gap: 12px;
  }
}
</style>
