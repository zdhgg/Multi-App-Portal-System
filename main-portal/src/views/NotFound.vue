<template>
  <div class="not-found-page">
    <div class="container">
      <div class="error-content">
        <!-- 错误图标 -->
        <div class="error-icon">
          <el-icon :size="120" color="#409eff">
            <QuestionFilled />
          </el-icon>
        </div>

        <!-- 错误信息 -->
        <div class="error-info">
          <h1 class="error-code">404</h1>
          <h2 class="error-title">页面未找到</h2>
          <p class="error-description">
            抱歉，您访问的页面不存在或已被移除。请检查网址是否正确，或返回首页浏览其他内容。
          </p>
          
          <!-- 请求的URL信息 -->
          <div class="requested-url">
            <el-alert
              :title="`请求的地址: ${currentPath}`"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="error-actions">
          <el-space :size="16" wrap>
            <el-button
              type="primary"
              size="large"
              @click="goHome"
            >
              <el-icon><House /></el-icon>
              返回首页
            </el-button>

            <el-button
              size="large"
              @click="goBack"
            >
              <el-icon><ArrowLeft /></el-icon>
              返回上一页
            </el-button>

            <el-button
              type="success"
              size="large"
              @click="refreshPage"
            >
              <el-icon><Refresh /></el-icon>
              刷新页面
            </el-button>
          </el-space>
        </div>

        <!-- 推荐链接 -->
        <div class="suggested-links">
          <h3>您可能在寻找：</h3>
          <el-space direction="vertical" :size="8" style="width: 100%">
            <el-button
              link
              type="primary"
              @click="$router.push('/portal')"
            >
              <el-icon><Grid /></el-icon>
              应用门户 - 查看和访问应用
            </el-button>

            <template v-if="authStore.isAdmin">
              <el-button
                link
                type="primary"
                @click="$router.push('/admin')"
              >
                <el-icon><Setting /></el-icon>
                管理后台 - 系统管理
              </el-button>

              <el-button
                link
                type="primary"
                @click="$router.push({ path: '/management', query: { action: 'add' } })"
              >
                <el-icon><Search /></el-icon>
                添加应用 - 手动接入新应用
              </el-button>

              <el-button
                link
                type="primary"
                @click="$router.push('/management')"
              >
                <el-icon><Operation /></el-icon>
                应用管理 - 管理现有应用
              </el-button>
            </template>
          </el-space>
        </div>

        <!-- 搜索建议 -->
        <div class="search-section">
          <h3>或者搜索内容：</h3>
          <el-input
            v-model="searchQuery"
            size="large"
            placeholder="搜索应用或功能..."
            @keyup.enter="handleSearch"
          >
            <template #append>
              <el-button 
                type="primary" 
                @click="handleSearch"
                :disabled="!searchQuery.trim()"
              >
                <el-icon><Search /></el-icon>
              </el-button>
            </template>
          </el-input>
        </div>

        <!-- 联系信息 -->
        <div class="contact-info">
          <el-alert
            title="需要帮助？"
            type="info"
            :closable="false"
          >
            <template #default>
              <p>如果您认为这是一个错误，或需要技术支持，请联系系统管理员。</p>
              <p>错误时间: {{ errorTime }}</p>
            </template>
          </el-alert>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRouter/useRoute 在其他文件中可正常导入
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  QuestionFilled,
  House,
  ArrowLeft,
  Refresh,
  Grid,
  Setting,
  Search,
  Operation
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

// 响应式数据
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const searchQuery = ref('')

// 计算属性
const currentPath = computed(() => {
  return route.fullPath
})

const errorTime = computed(() => {
  return new Date().toLocaleString('zh-CN')
})

// 方法
const goHome = () => {
  router.push('/portal')
}

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    goHome()
  }
}

const refreshPage = () => {
  window.location.reload()
}

const handleSearch = () => {
  if (!searchQuery.value.trim()) {
    ElMessage.warning('请输入搜索内容')
    return
  }

  // 跳转到门户页面并传递搜索参数
  router.push({
    name: 'portal',
    query: {
      search: searchQuery.value.trim()
    }
  })
}

// 生命周期
onMounted(() => {
  // 记录404错误日志
  console.warn('404 Error:', {
    path: currentPath.value,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  })

  // 自动建议修正
  suggestCorrection()
})

// 路径修正建议
const suggestCorrection = () => {
  const path = currentPath.value.toLowerCase()
  
  // 常见的拼写错误修正
  const corrections: Record<string, string> = {
    '/portol': '/portal',
    '/protal': '/portal',
    '/admin/': '/admin',
    '/config/': '/config',
    '/detection/': '/detection',
    '/management/': '/management',
    '/mange': '/management',
    '/detect': '/detection'
  }

  for (const [wrong, correct] of Object.entries(corrections)) {
    if (path.includes(wrong)) {
      ElMessage.info({
        message: `您是否想访问 "${correct}"？`,
        duration: 5000,
        showClose: true
      })
      break
    }
  }
}
</script>

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
  padding: 2rem;
}

.container {
  max-width: 700px;
  width: 100%;
}

.error-content {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
}

.error-icon {
  margin-bottom: 2rem;
}

.error-info {
  margin-bottom: 3rem;
}

.error-code {
  font-size: 4rem;
  font-weight: 700;
  color: #409eff;
  margin: 0 0 1rem 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.error-title {
  font-size: 2rem;
  font-weight: 600;
  color: #303133;
  margin: 0 0 1rem 0;
}

.error-description {
  font-size: 1.1rem;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.requested-url {
  margin-top: 1.5rem;
}

.error-actions {
  margin-bottom: 3rem;
}

.suggested-links {
  margin-bottom: 3rem;
  text-align: left;
}

.suggested-links h3 {
  color: #303133;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  text-align: center;
}

.search-section {
  margin-bottom: 3rem;
}

.search-section h3 {
  color: #303133;
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

.contact-info {
  margin-top: 2rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .not-found-page {
    padding: 1rem;
  }

  .error-content {
    padding: 2rem 1.5rem;
  }

  .error-code {
    font-size: 3rem;
  }

  .error-title {
    font-size: 1.5rem;
  }

  .error-description {
    font-size: 1rem;
  }
}

/* 动画效果 */
.error-content {
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-icon {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* Element Plus 样式覆盖 */
:deep(.el-button--large) {
  padding: 12px 24px;
  font-size: 1rem;
}

:deep(.el-input--large .el-input__inner) {
  font-size: 1rem;
}

:deep(.el-alert) {
  border-radius: 8px;
  text-align: left;
}

:deep(.el-button.is-link) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
  transition: all 0.2s ease;
}

:deep(.el-button.is-link:hover) {
  background-color: #f0f9ff;
  transform: translateX(5px);
}
</style>
