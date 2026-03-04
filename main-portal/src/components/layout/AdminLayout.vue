<template>
  <div class="admin-layout">
    <!-- 侧边栏 -->
    <AdminSidebar
      ref="sidebarRef"
      :mobile-open="isMobileSidebarOpen"
      @mobile-close="closeMobileSidebar"
    />

    <!-- 移动端遮罩 -->
    <div
      v-if="isMobile && isMobileSidebarOpen"
      class="mobile-overlay"
      @click="closeMobileSidebar"
    ></div>

    <!-- 内容区域容器 -->
    <div class="admin-content">
      <!-- 页眉 -->
      <header class="content-header">
        <!-- 移动端菜单按钮 -->
        <button
          v-if="isMobile"
          class="mobile-menu-btn"
          @click="toggleMobileSidebar"
          :aria-label="isMobileSidebarOpen ? '关闭菜单' : '打开菜单'"
        >
          <el-icon size="20">
            <component :is="isMobileSidebarOpen ? 'Close' : 'Menu'" />
          </el-icon>
        </button>

        <!-- 面包屑导航 -->
        <nav class="breadcrumb-nav" aria-label="面包屑导航">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>
              <router-link to="/portal" class="breadcrumb-link">
                <el-icon><House /></el-icon>
                <span>门户首页</span>
              </router-link>
            </el-breadcrumb-item>
            <el-breadcrumb-item
              v-for="(item, index) in breadcrumbItems"
              :key="index"
              :class="{ 'current': index === breadcrumbItems.length - 1 }"
            >
              <router-link
                v-if="item.path && index < breadcrumbItems.length - 1"
                :to="item.path"
                class="breadcrumb-link"
              >
                {{ item.title }}
              </router-link>
              <span v-else class="breadcrumb-current">{{ item.title }}</span>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </nav>

        <!-- 页面操作区 -->
        <div class="page-actions">
          <slot name="header-actions"></slot>

          <!-- 默认动作按钮 -->
          <el-tooltip content="刷新页面" placement="bottom">
            <el-button
              circle
              size="small"
              @click="refreshPage"
              :icon="Refresh"
            />
          </el-tooltip>

          <el-tooltip content="帮助" placement="bottom">
            <el-button
              circle
              size="small"
              @click="showHelp"
              :icon="QuestionFilled"
            />
          </el-tooltip>
        </div>
      </header>

      <!-- 页面主体容器 -->
      <main class="page-main" :class="{ 'with-footer': hasFooterSlot }">
        <!-- 页面标题区域 -->
        <div v-if="showPageTitle" class="page-title-section">
          <div class="page-title-content">
            <div class="title-main">
              <h1 class="page-title">{{ currentPageTitle }}</h1>
              <div v-if="currentPageDescription" class="page-description">
                {{ currentPageDescription }}
              </div>
            </div>
            <div class="title-actions">
              <slot name="title-actions"></slot>
            </div>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="content-container">
          <router-view v-slot="{ Component, route }">
            <transition name="page-fade" mode="out-in">
              <component
                :is="Component"
                :key="route.path"
                class="page-content"
              />
            </transition>
          </router-view>
        </div>
      </main>

      <!-- 页面底部 -->
      <footer v-if="hasFooterSlot" class="page-footer">
        <slot name="footer"></slot>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useSlots } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Menu, Close, House, Refresh, QuestionFilled } from '@element-plus/icons-vue'
import AdminSidebar from './AdminSidebar.vue'
import { usePortConfigStore } from '@/stores/portConfig'

// 面包屑项
interface BreadcrumbItem {
  title: string
  path?: string
}

// 页面配置
interface PageConfig {
  title: string
  description?: string
  hideBreadcrumb?: boolean
  hideTitle?: boolean
}

// Props
interface Props {
  showPageTitle?: boolean
  pageConfig?: PageConfig
}

const props = withDefaults(defineProps<Props>(), {
  showPageTitle: true,
  pageConfig: undefined
})

// 路由与插槽
const route = useRoute()
const router = useRouter()
const slots = useSlots()
const portConfigStore = usePortConfigStore()

// 响应式状态
const sidebarRef = ref()
const isMobileSidebarOpen = ref(false)
const isMobile = ref(false)

// 页面标题映射
const pageTitleMap: Record<string, PageConfig> = {
  '/detection': {
    title: '应用检测',
    description: '智能检测 Web 应用'
  },
  '/management': {
    title: '应用管理',
    description: '管理已检测到的 Web 应用'
  },
  '/admin': {
    title: '系统设置',
    description: '端口配置和系统设置'
  },
  '/config': {
    title: '端口配置',
    description: '配置端口分配与规则'
  }
}

// 当前页面配置
const currentPageConfig = computed(() => {
  return props.pageConfig || pageTitleMap[route.path] || {
    title: (route.meta?.title as string) || '默认页面',
    description: route.meta?.description as string
  }
})

const currentPageTitle = computed(() => currentPageConfig.value.title)
const currentPageDescription = computed(() => currentPageConfig.value.description)

// 面包屑
const breadcrumbItems = computed((): BreadcrumbItem[] => {
  const items: BreadcrumbItem[] = []
  const path = route.path

  if (path.startsWith('/detection')) {
    items.push({ title: '应用检测', path: '/detection' })
  } else if (path.startsWith('/management')) {
    items.push({ title: '应用管理', path: '/management' })
  } else if (path.startsWith('/admin') || path.startsWith('/config')) {
    items.push({ title: '系统设置', path: '/admin' })
    if (path.includes('/config')) {
      items.push({ title: '端口配置' })
    }
  }

  if (route.meta?.breadcrumb) {
    return route.meta.breadcrumb as BreadcrumbItem[]
  }
  return items
})

const hasFooterSlot = computed(() => !!slots.footer)

// 操作
const toggleMobileSidebar = () => {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}
const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false
}
const refreshPage = () => router.go(0)
const showHelp = () => ElMessage.info('该功能即将开放...')

// 设备与自适应
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) isMobileSidebarOpen.value = false
}
const handleResize = () => checkMobile()

// 配置变更监听器清理函数
let configChangeUnlisten: (() => void) | null = null

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', handleResize)
  router.afterEach(() => {
    if (isMobile.value) closeMobileSidebar()
  })
  
  // 设置配置变更监听
  configChangeUnlisten = portConfigStore.setupConfigChangeListener()
  
  // 监听配置自动重载事件，显示提示消息
  const handleConfigAutoReloaded = (event: CustomEvent) => {
    ElMessage.success({
      message: '配置已自动更新，页面数据已刷新',
      duration: 3000,
      showClose: true
    })
  }
  
  document.addEventListener('configAutoReloaded', handleConfigAutoReloaded as EventListener)
  
  // 清理函数
  const cleanup = () => {
    document.removeEventListener('configAutoReloaded', handleConfigAutoReloaded as EventListener)
    if (configChangeUnlisten) {
      configChangeUnlisten()
      configChangeUnlisten = null
    }
  }
  
  // 将清理函数存储，以便在onUnmounted中使用
  ;(window as any).__adminLayoutConfigCleanup = cleanup
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  
  // 清理配置变更监听器
  const cleanup = (window as any).__adminLayoutConfigCleanup
  if (cleanup) {
    cleanup()
    delete (window as any).__adminLayoutConfigCleanup
  }
})

// 暴露方法
defineExpose({
  toggleMobileSidebar,
  closeMobileSidebar,
  isMobileSidebarOpen: computed(() => isMobileSidebarOpen.value)
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  background: #f8fafc;
  overflow: hidden;
}

/* 移动端遮罩 */
.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  transition: opacity 0.3s ease;
}

/* 内容容器 */
.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  padding-left: 0; /* 去除多余左侧空隙，确保与侧栏对齐 */
}

/* 页眉 */
.content-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 64px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}
.mobile-menu-btn:hover { background: #f1f5f9; color: #475569; }

/* 面包屑 */
.breadcrumb-nav { flex: 1; min-width: 0; }
.breadcrumb-link { display: inline-flex; align-items: center; gap: 4px; color: #64748b; text-decoration: none; transition: color 0.2s ease; }
.breadcrumb-link:hover { color: #4f46e5; }
.breadcrumb-current { color: #1e293b; font-weight: 500; }

/* 页眉右侧动作区 */
.page-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* 主体 */
.page-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-main.with-footer { padding-bottom: 0; }

/* 标题区 */
.page-title-section { background: white; border-bottom: 1px solid #e2e8f0; padding: 20px; }
.page-title-content { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.title-main { flex: 1; min-width: 0; }
.page-title { margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #1e293b; line-height: 1.2; }
.page-description { font-size: 16px; color: #64748b; line-height: 1.5; }
.title-actions { flex-shrink: 0; display: flex; align-items: flex-start; gap: 12px; }

/* 内容滚动容器 */
.content-container { flex: 1; overflow: auto; position: relative; }
.page-content { min-height: 100%; }

/* 页脚 */
.page-footer { background: white; border-top: 1px solid #e2e8f0; padding: 16px 24px; flex-shrink: 0; }

/* 页面切换动画 */
.page-fade-enter-active, .page-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(10px); }
.page-fade-leave-to { opacity: 0; transform: translateY(-10px); }

:deep(.el-breadcrumb) { font-size: 14px; line-height: 1.5; }
:deep(.el-breadcrumb__inner) { color: inherit; font-weight: 400; }
:deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) { font-weight: 500; color: #1e293b; }

/* 响应式 */
@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; }
  .content-header { padding: 10px 12px; min-height: 56px; }
  .page-title-section { padding: 16px 12px; }
  .page-title-content { flex-direction: column; align-items: stretch; gap: 16px; }
  .page-title { font-size: 24px; }
  .page-description { font-size: 14px; }
  .title-actions { align-self: stretch; justify-content: flex-end; }
  .page-actions { gap: 4px; }
  .breadcrumb-nav { order: 1; flex-basis: 100%; margin-top: 8px; }
  .page-footer { padding: 12px 16px; }
}
@media (max-width: 480px) {
  .content-header { padding: 6px 8px; flex-wrap: wrap; }
  .page-title-section { padding: 12px 8px; }
  .page-title { font-size: 20px; }
  .breadcrumb-nav { margin-top: 4px; }
}

/* 内容滚动条美化 */
.content-container::-webkit-scrollbar { width: 6px; }
.content-container::-webkit-scrollbar-track { background: #f1f5f9; }
.content-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.content-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* 降低动效 */
@media (prefers-reduced-motion: reduce) {
  .page-fade-enter-active,
  .page-fade-leave-active,
  .mobile-menu-btn,
  .breadcrumb-link {
    transition: none;
  }
}

/* 打印样式 */
@media print {
  .content-header, .page-footer { display: none; }
  .admin-content { background: white; }
  .page-title-section { border-bottom: none; padding: 0 0 20px 0; }
}
</style>

