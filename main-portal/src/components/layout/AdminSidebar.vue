<template>
  <div class="admin-sidebar" :class="{ 'collapsed': isCollapsed, 'mobile-open': props.mobileOpen }">
    <!-- 侧栏头部 -->
    <div class="sidebar-header">
      <div class="logo-area">
        <div class="logo-icon">🌐</div>
        <transition name="fade">
          <div v-if="!isCollapsed" class="logo-text">
            <div class="app-name">智能门户</div>
            <div class="app-version">v2.0</div>
          </div>
        </transition>
      </div>
      <button
        class="collapse-btn"
        @click="toggleCollapse"
        :title="isCollapsed ? '展开侧栏' : '收起侧栏'"
      >
        <el-icon>
          <component :is="isCollapsed ? 'Expand' : 'Fold'" />
        </el-icon>
      </button>
    </div>

    <!-- 侧栏菜单 -->
    <nav class="sidebar-nav">
      <div class="nav-section">
        <!-- 门户首页 -->
        <router-link to="/portal" class="nav-item portal-link" active-class="">
          <div class="nav-icon">🏠</div>
          <transition name="fade">
            <span v-if="!isCollapsed" class="nav-text">门户首页</span>
          </transition>
        </router-link>
      </div>

      <div class="nav-section">
        <div v-if="!isCollapsed" class="section-title">功能菜单</div>

        <!-- Phase 1 RBAC: 根据角色显示不同菜单 -->
        <!-- 管理员菜单（全部功能） -->
        <template v-if="authStore.isAdmin">
          <router-link
            v-for="item in adminMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ 'active': isActiveRoute(item.path) }"
          >
            <div class="nav-icon">{{ item.icon }}</div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
            <div v-if="item.badge && !isCollapsed" class="nav-badge">{{ item.badge }}</div>
          </router-link>
        </template>

        <!-- 操作员菜单（不含系统设置） -->
        <template v-else-if="authStore.isOperator">
          <router-link
            v-for="item in operatorMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ 'active': isActiveRoute(item.path) }"
          >
            <div class="nav-icon">{{ item.icon }}</div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
            <div v-if="item.badge && !isCollapsed" class="nav-badge">{{ item.badge }}</div>
          </router-link>
        </template>

        <!-- 普通用户菜单 -->
        <template v-else-if="authStore.isAuthenticated">
          <router-link
            v-for="item in userMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ 'active': isActiveRoute(item.path) }"
          >
            <div class="nav-icon">{{ item.icon }}</div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
          </router-link>
        </template>

        <!-- 游客显示 -->
        <div v-else class="nav-item disabled">
          <div class="nav-icon">🔒</div>
          <transition name="fade">
            <span v-if="!isCollapsed" class="nav-text">需要登录</span>
          </transition>
        </div>
      </div>

      <!-- 用户信息区域 -->
      <div class="nav-section user-section">
        <div v-if="!isCollapsed" class="section-title">用户信息</div>

        <div class="user-info">
          <div class="user-avatar">
            <el-icon size="20"><Avatar /></el-icon>
          </div>
          <transition name="fade">
            <div v-if="!isCollapsed" class="user-details">
              <div class="username">{{ authStore.userDisplayName }}</div>
              <div class="user-role" :class="roleClass">{{ roleName }}</div>
            </div>
          </transition>
        </div>

        <!-- 用户操作 -->
        <div v-if="authStore.isAuthenticated" class="user-actions">
          <el-tooltip :content="isCollapsed ? '个人资料' : ''" placement="right" :disabled="!isCollapsed">
            <button class="action-btn" @click="handleProfile">
              <el-icon><User /></el-icon>
              <transition name="fade">
                <span v-if="!isCollapsed">个人资料</span>
              </transition>
            </button>
          </el-tooltip>

          <el-tooltip :content="isCollapsed ? '关于系统' : ''" placement="right" :disabled="!isCollapsed">
            <button class="action-btn" @click="handleAbout">
              <el-icon><InfoFilled /></el-icon>
              <transition name="fade">
                <span v-if="!isCollapsed">关于系统</span>
              </transition>
            </button>
          </el-tooltip>

          <el-tooltip :content="isCollapsed ? '退出登录' : ''" placement="right" :disabled="!isCollapsed">
            <button class="action-btn logout-btn" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              <transition name="fade">
                <span v-if="!isCollapsed">退出登录</span>
              </transition>
            </button>
          </el-tooltip>
        </div>
      </div>
    </nav>

    <!-- 个人资料对话框 -->
    <UserProfile v-model="profileDialogVisible" />
    
    <!-- 关于系统对话框 -->
    <AboutDialog v-model="aboutDialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Expand, Fold, Avatar, User, SwitchButton, InfoFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import UserProfile from '@/components/UserProfile.vue'
import AboutDialog from '@/components/AboutDialog.vue'

// 类型定义
interface MenuItem {
  path: string
  title: string
  icon: string
  badge?: string
  description?: string
}

// Props
interface Props {
  mobileOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mobileOpen: false
})

// Emits（预留给移动端抽屉关闭等）
const emit = defineEmits<{ 'update:mobileOpen': [value: boolean]; 'mobile-close': [] }>()

// 基础
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 响应式状态
const isCollapsed = ref(false)
const profileDialogVisible = ref(false)
const aboutDialogVisible = ref(false)

// Phase 1 RBAC: 管理员菜单（全部功能）
const adminMenuItems: MenuItem[] = [
  { path: '/detection',  title: '应用检测', icon: '🔍', description: '智能检测 Web 应用' },
  { path: '/management', title: '应用管理', icon: '🧩', description: '管理已检测应用' },
  { path: '/ports',      title: '端口管理', icon: '⚙️', description: '端口分配、规则与配置' },
  { path: '/pm2',        title: 'PM2 管理', icon: '🧭', description: 'PM2 进程管理与可视化' },
  { path: '/admin',      title: '系统设置', icon: '🛠️', description: '系统配置与管理' }
]

// Phase 1 RBAC: 操作员菜单（不含系统设置）
const operatorMenuItems: MenuItem[] = [
  { path: '/detection',  title: '应用检测', icon: '🔍', description: '智能检测 Web 应用' },
  { path: '/management', title: '应用管理', icon: '🧩', description: '管理已检测应用（只读+操作）' },
  { path: '/ports',      title: '端口管理', icon: '⚙️', description: '端口状态查看（只读）' },
  { path: '/pm2',        title: 'PM2 管理', icon: '🧭', description: 'PM2 进程查看（只读）' }
]

// 普通用户菜单（当前为空）
const userMenuItems: MenuItem[] = []

// Phase 1 RBAC: 角色显示
const roleName = computed(() => {
  if (authStore.isAdmin) return '管理员'
  if (authStore.isOperator) return '操作员'
  if (authStore.isAuthenticated) return '用户'
  return '游客'
})

const roleClass = computed(() => {
  if (authStore.isAdmin) return 'role-admin'
  if (authStore.isOperator) return 'role-operator'
  if (authStore.isAuthenticated) return 'role-user'
  return 'role-guest'
})

// 交互
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('sidebar_collapsed', String(isCollapsed.value))
}

const isActiveRoute = (path: string): boolean => {
  // 精确匹配
  if (route.path === path) return true
  
  // 对于父路径，只有在当前路径确实是其子路径，且菜单中没有该确切路径时才激活
  if (route.path.startsWith(path + '/')) {
    // 检查菜单中是否有当前路径的精确匹配
    const hasExactMatch = adminMenuItems.some(item => item.path === route.path)
    return !hasExactMatch
  }
  
  return false
}

const handleProfile = () => {
  profileDialogVisible.value = true
}

const handleAbout = () => {
  aboutDialogVisible.value = true
}

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await authStore.logout()
    router.push('/portal')
  } catch {
    // 用户取消登出
  }
}

// 生命周期
onMounted(() => {
  const savedCollapsed = localStorage.getItem('sidebar_collapsed')
  if (savedCollapsed !== null) {
    isCollapsed.value = savedCollapsed === 'true'
  }
})
</script>

<style scoped>
.admin-sidebar {
  width: 260px;
  height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-right: none;
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 100;
  margin-right: 0;
}

.admin-sidebar.collapsed { width: 72px; }

/* 头部 */
.sidebar-header {
  padding: 20px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  position: relative;
}

.logo-area { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.logo-icon { font-size: 20px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#667eea,#764ba2); border-radius: 8px; color: white; font-weight: bold; flex-shrink: 0; }
.logo-text { min-width: 0; }
.app-name { font-size: 16px; font-weight: 600; color: #1e293b; line-height: 1.2; }
.app-version { font-size: 12px; color: #64748b; }

.collapse-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f5f9;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #64748b;
  flex-shrink: 0;
}
.collapse-btn:hover { background: #e2e8f0; color: #475569; transform: scale(1.05); }

/* 菜单列表 */
.sidebar-nav { flex: 1; padding: 16px 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; }
.nav-section { margin-bottom: 24px; }
.nav-section:last-child { margin-top: auto; margin-bottom: 0; }
.section-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; padding: 0 20px 8px; margin-bottom: 8px; }

.nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; margin: 0 12px; border-radius: 8px; transition: all 0.2s ease; cursor: pointer; text-decoration: none; color: #475569; position: relative; min-height: 44px; }
.nav-item:hover { background: rgba(99,102,241,0.08); color: #4f46e5; transform: translateX(2px); }
.nav-item.active { background: linear-gradient(135deg,#667eea,#764ba2); color: white; box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
.nav-item.portal-link { background: #f8fafc; border: 1px solid #e2e8f0; color: #6366f1; }
.nav-item.portal-link:hover { background: #f1f5f9; border-color: #c7d2fe; }
.nav-item.disabled { opacity: .5; cursor: not-allowed; }
.nav-item.disabled:hover { background: transparent; transform: none; }
.nav-icon { font-size: 18px; width: 20px; text-align: center; flex-shrink: 0; }
.nav-text { font-size: 14px; font-weight: 500; line-height: 1.2; white-space: nowrap; }
.nav-badge { background: #ef4444; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: auto; }

/* 用户信息 */
.user-section { border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 0; }
.user-info { display: flex; align-items: center; gap: 12px; padding: 12px 20px; margin: 0 12px 12px; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; }
.user-avatar { width: 36px; height: 36px; background: linear-gradient(135deg,#667eea,#764ba2); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.user-details { flex: 1; min-width: 0; }
.username { font-size: 14px; font-weight: 600; color: #1e293b; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-role { font-size: 12px; padding: 2px 8px; border-radius: 12px; display: inline-block; margin-top: 2px; }
.user-role.role-admin { background: #fef3c7; color: #92400e; }
.user-role.role-operator { background: #d1fae5; color: #065f46; }
.user-role.role-user  { background: #dbeafe; color: #1e40af; }
.user-role.role-guest { background: #f3f4f6; color: #6b7280; }

/* 用户操作按钮 */
.user-actions { display: flex; flex-direction: column; gap: 4px; padding: 0 12px; }
.action-btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; background: transparent; border-radius: 6px; cursor: pointer; transition: all 0.2s ease; color: #64748b; font-size: 13px; width: 100%; text-align: left; }
.action-btn:hover { background: #f1f5f9; color: #475569; }
.action-btn.logout-btn:hover { background: #fef2f2; color: #dc2626; }

/* 渐隐动画 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 滚动条样式 */
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-track { background: transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
.sidebar-nav::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* 移动端抽屉样式 */
@media (max-width: 768px) {
  .admin-sidebar { position: fixed; left: 0; top: 0; z-index: 1000; transform: translateX(-100%); transition: transform 0.3s ease; }
  .admin-sidebar.mobile-open { transform: translateX(0); }
  .admin-sidebar.collapsed { width: 260px; }
}

/* 高对比度支持 */
@media (prefers-contrast: high) {
  .admin-sidebar { border-right: 2px solid #000; }
  .nav-item.active { border: 2px solid #000; }
}

/* 降低动效 */
@media (prefers-reduced-motion: reduce) {
  .admin-sidebar, .nav-item, .collapse-btn, .action-btn { transition: none; }
  .fade-enter-active, .fade-leave-active { transition: none; }
}

/* 收起态样式覆盖（桌面端） */
@media (min-width: 769px) {
  .admin-sidebar.collapsed .nav-item { justify-content: center; padding: 12px 0; margin: 0; }
  .admin-sidebar.collapsed .nav-icon { width: 24px; text-align: center; }
}
</style>
