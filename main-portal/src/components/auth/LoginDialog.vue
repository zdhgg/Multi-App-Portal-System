
<template>
  <el-dialog
    v-model="visible"
    title="管理员登录"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    center
    :z-index="9999"
    :modal-style="{ zIndex: 9998 }"
    @closed="handleDialogClosed"
  >
    <div class="login-content">
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        label-width="0"
        size="large"
        @submit.prevent="handleLogin"
      >
        <div class="login-header">
          <div class="login-icon">
            <el-icon :size="48" color="#409eff">
              <User />
            </el-icon>
          </div>
          <h3>欢迎登录</h3>
          <p>请输入管理员账户信息</p>
        </div>

        <el-form-item prop="username">
          <div class="username-field">
            <el-autocomplete
              v-model="loginForm.username"
              class="username-autocomplete"
              :fetch-suggestions="queryUsernameSuggestions"
              placeholder="用户名"
              clearable
              autocomplete="username"
              :trigger-on-focus="recentUsernameSuggestions.length > 0"
              @select="handleUsernameSelect"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-autocomplete>
          </div>
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            clearable
            autocomplete="current-password"
          />
        </el-form-item>

        <el-form-item class="preference-form-item">
          <div class="login-preferences">
            <div class="login-preferences__header">
              <span class="login-preferences__title">登录偏好</span>
              <span v-if="recentUsernameSuggestions.length > 0" class="login-preferences__meta">
                最近用户名 {{ recentUsernameSuggestions.length }} 条
              </span>
            </div>
            <div class="login-preferences__row">
              <el-checkbox v-model="loginForm.rememberMe">
                记住我
              </el-checkbox>
              <el-button
                v-if="recentUsernameSuggestions.length > 0"
                link
                type="primary"
                @click="handleClearUsernameHistory"
              >
                清空历史用户名
              </el-button>
            </div>
            <p class="login-preferences__hint">
              仅记录成功登录的用户名，并记住你上次的勾选选择。
            </p>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="authStore.isLoading || isSubmitting"
          :disabled="!isFormValid || isSubmitting"
          @click="handleLogin"
        >
          <span v-if="authStore.isLoading || isSubmitting">登录中...</span>
          <span v-else>登录</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { logLoginError, logLoginStart, logLoginSuccess } from '@/utils/loginDebug'
import {
  clearRecentLoginUsernames,
  readRecentLoginUserSuggestions,
  saveRecentLoginUsername,
  type RecentLoginUserSuggestion
} from '@/utils/recentLoginUsers'
import { readRememberMePreference, saveRememberMePreference } from '@/utils/rememberMePreference'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'login-success'): void
  (e: 'login-cancel'): void
}

const emit = defineEmits<Emits>()
const authStore = useAuthStore()

const loginFormRef = ref<FormInstance>()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loginForm = reactive({
  username: '',
  password: '',
  rememberMe: readRememberMePreference()
})

const recentUsernameSuggestions = ref<RecentLoginUserSuggestion[]>(readRecentLoginUserSuggestions())

const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 50, message: '用户名长度应为3-50个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6个字符', trigger: 'blur' }
  ]
}

const isFormValid = computed(() => {
  return loginForm.username.trim().length >= 3 && loginForm.password.length >= 6
})

const isSubmitting = ref(false)


const syncRememberMePreference = () => {
  loginForm.rememberMe = readRememberMePreference()
}

const refreshRecentUsernameSuggestions = () => {
  recentUsernameSuggestions.value = readRecentLoginUserSuggestions()
}

const queryUsernameSuggestions = (
  queryString: string,
  cb: (results: RecentLoginUserSuggestion[]) => void
) => {
  const normalizedQuery = queryString.trim().toLowerCase()

  if (!normalizedQuery) {
    cb(recentUsernameSuggestions.value)
    return
  }

  cb(
    recentUsernameSuggestions.value.filter(item =>
      item.value.toLowerCase().includes(normalizedQuery)
    )
  )
}

const handleUsernameSelect = (item: RecentLoginUserSuggestion) => {
  loginForm.username = item.value
}

const handleClearUsernameHistory = () => {
  clearRecentLoginUsernames()
  refreshRecentUsernameSuggestions()
}


const handleLogin = async () => {
  if (!loginFormRef.value) return

  if (isSubmitting.value || authStore.isLoading) {
    console.warn('登录请求正在处理中，忽略重复请求')
    return
  }

  try {
    isSubmitting.value = true

    const isValid = await loginFormRef.value.validate().catch(() => false)
    if (!isValid) return

    const credentials = {
      username: loginForm.username.trim(),
      password: loginForm.password,
      rememberMe: loginForm.rememberMe
    }

    logLoginStart(credentials, 'LoginDialog')
    const success = await authStore.login(credentials, false)

    if (success) {
      saveRecentLoginUsername(credentials.username, credentials.rememberMe === true)
      refreshRecentUsernameSuggestions()
      logLoginSuccess('LoginDialog')
      visible.value = false
      emit('login-success')
      resetForm()
    }
  } catch (error: any) {
    console.error('登录失败:', error)
    logLoginError(error.message || '登录失败', 'LoginDialog')
    ElMessage.error(error.message || '登录失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}

const handleCancel = () => {
  visible.value = false
  emit('login-cancel')
  resetForm()
}

const handleDialogClosed = () => {
  resetForm()
}

const resetForm = () => {
  if (loginFormRef.value) {
    loginFormRef.value.resetFields()
  }

  Object.assign(loginForm, {
    username: '',
    password: '',
    rememberMe: readRememberMePreference()
  })
}

watch(
  () => loginForm.rememberMe,
  (rememberMe) => {
    saveRememberMePreference(rememberMe)
  }
)

watch(visible, (newValue) => {
  if (newValue) {
    refreshRecentUsernameSuggestions()
    syncRememberMePreference()

    setTimeout(() => {
      const usernameInput = document.querySelector('.el-input__inner[placeholder="用户名"]') as HTMLInputElement | null
      usernameInput?.focus()
    }, 100)
  }
})
</script>

<style scoped>
.login-content {
  padding: 0;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-icon {
  margin-bottom: 1rem;
}

.login-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #303133;
}

.login-header p {
  margin: 0;
  color: #909399;
  font-size: 0.9rem;
}

.login-options {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preference-form-item :deep(.el-form-item__content) {
  display: block;
}

.login-preferences {
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  box-sizing: border-box;
}

.login-preferences__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.login-preferences__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #303133;
}

.login-preferences__meta {
  font-size: 0.8rem;
  color: #909399;
}

.login-preferences__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.login-preferences__hint {
  margin: 0.6rem 0 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #909399;
}

.username-field {
  width: 100%;
}

.username-autocomplete {
  width: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

@media (max-width: 768px) {
  .login-content {
    padding: 0 1rem;
  }

  .login-header h3 {
    font-size: 1.3rem;
  }
}

:deep(.el-overlay.el-modal-dialog:not([style*="display: none"])) {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 99999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:deep(.el-overlay-dialog) {
  position: relative !important;
  margin: 0 !important;
}
</style>
