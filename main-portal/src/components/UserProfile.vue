<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="个人资料"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
    class="user-profile-dialog"
  >
    <div class="user-profile">
      <!-- 用户信息卡片 -->
      <div class="profile-card">
        <div class="avatar-section">
          <div class="avatar" :style="{ backgroundColor: avatarColor }">
            {{ avatarText }}
          </div>
          <div class="role-badge" :class="roleClass">
            {{ roleDisplayName }}
          </div>
        </div>
        <div class="info-section">
          <h3 class="username">{{ user?.username || '未登录' }}</h3>
          <div class="info-grid">
            <div class="info-item">
              <el-icon><Calendar /></el-icon>
              <span class="label">创建时间</span>
              <span class="value">{{ formatDate(user?.created_at) }}</span>
            </div>
            <div class="info-item">
              <el-icon><Clock /></el-icon>
              <span class="label">最后登录</span>
              <span class="value">{{ formatDate(user?.last_login) || '首次登录' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 功能区域 -->
      <el-tabs v-model="activeTab" class="profile-tabs">
        <!-- 修改密码 -->
        <el-tab-pane label="修改密码" name="password">
          <div class="tab-content">
            <el-form
              ref="passwordFormRef"
              :model="passwordForm"
              :rules="passwordRules"
              label-width="100px"
              class="password-form"
            >
              <el-form-item label="当前密码" prop="currentPassword">
                <el-input
                  v-model="passwordForm.currentPassword"
                  type="password"
                  placeholder="请输入当前密码"
                  show-password
                />
              </el-form-item>
              
              <el-form-item label="新密码" prop="newPassword">
                <el-input
                  v-model="passwordForm.newPassword"
                  type="password"
                  placeholder="请输入新密码（至少6位）"
                  show-password
                />
                <div class="password-strength" v-if="passwordForm.newPassword">
                  <span class="strength-label">密码强度：</span>
                  <el-progress
                    :percentage="passwordStrength.score"
                    :color="passwordStrength.color"
                    :stroke-width="6"
                    :show-text="false"
                    style="width: 100px;"
                  />
                  <span class="strength-text" :style="{ color: passwordStrength.color }">
                    {{ passwordStrength.text }}
                  </span>
                </div>
              </el-form-item>
              
              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  placeholder="请再次输入新密码"
                  show-password
                />
              </el-form-item>
              
              <el-form-item>
                <el-button
                  type="primary"
                  @click="handleChangePassword"
                  :loading="changingPassword"
                >
                  确认修改
                </el-button>
                <el-button @click="resetPasswordForm">重置</el-button>
              </el-form-item>
            </el-form>
            
            <el-alert
              title="密码修改成功后需要重新登录"
              type="info"
              :closable="false"
              show-icon
              class="password-tip"
            />
          </div>
        </el-tab-pane>

        <!-- 会话管理 -->
        <el-tab-pane label="会话管理" name="sessions">
          <div class="tab-content">
            <div class="sessions-header">
              <span class="sessions-title">当前登录的设备</span>
              <el-button
                size="small"
                type="danger"
                plain
                @click="handleRevokeAllOthers"
                :loading="revokingAll"
                :disabled="sessions.filter(s => !s.current).length === 0"
              >
                退出其他设备
              </el-button>
            </div>
            
            <div class="sessions-list" v-loading="loadingSessions">
              <div
                v-for="session in sessions"
                :key="session.id"
                class="session-item"
                :class="{ current: session.current }"
              >
                <div class="session-icon">
                  <el-icon :size="24">
                    <Monitor v-if="session.current" />
                    <Iphone v-else />
                  </el-icon>
                </div>
                <div class="session-info">
                  <div class="device-name">
                    {{ session.deviceName }}
                    <el-tag v-if="session.current" size="small" type="success">当前</el-tag>
                  </div>
                  <div class="last-active">
                    最后活跃：{{ formatRelativeTime(session.lastActive) }}
                  </div>
                </div>
                <div class="session-actions" v-if="!session.current">
                  <el-button
                    size="small"
                    type="danger"
                    plain
                    @click="handleRevokeSession(session.id)"
                    :loading="revokingSession === session.id"
                  >
                    退出
                  </el-button>
                </div>
              </div>
              
              <el-empty v-if="sessions.length === 0 && !loadingSessions" description="暂无会话数据" />
            </div>
          </div>
        </el-tab-pane>

        <!-- 账号信息 -->
        <el-tab-pane label="账号信息" name="account">
          <div class="tab-content">
            <el-descriptions :column="1" border class="account-info">
              <el-descriptions-item label="用户ID">
                <code>{{ user?.id || '-' }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="用户名">
                {{ user?.username || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="角色">
                <el-tag :type="roleTagType" size="small">{{ roleDisplayName }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="账号状态">
                <el-tag :type="user?.is_active ? 'success' : 'danger'" size="small">
                  {{ user?.is_active ? '正常' : '已禁用' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDate(user?.created_at) }}
              </el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ formatDate(user?.updated_at) }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Calendar, Clock, Monitor, Iphone } from '@element-plus/icons-vue'
import { useAuthStore, type User } from '@/stores/auth'
import { authApiService } from '@/services/authApi'
// @ts-ignore
import { useRouter } from 'vue-router'

// Props
interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Store & Router
const authStore = useAuthStore()
const router = useRouter()

// 响应式数据
const activeTab = ref('password')
const passwordFormRef = ref<FormInstance>()
const changingPassword = ref(false)
const loadingSessions = ref(false)
const revokingSession = ref<string | null>(null)
const revokingAll = ref(false)

// 用户信息
const user = computed(() => authStore.user as User | null)

// 密码表单
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 会话列表
const sessions = ref<Array<{
  id: string
  deviceName: string
  lastActive: string
  current: boolean
}>>([])

// 密码验证规则
const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.value.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 计算属性
const avatarText = computed(() => {
  const name = user.value?.username || 'U'
  return name.charAt(0).toUpperCase()
})

const avatarColor = computed(() => {
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
  const name = user.value?.username || ''
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
})

const roleDisplayName = computed(() => {
  const roleMap: Record<string, string> = {
    admin: '管理员',
    operator: '操作员',
    guest: '访客'
  }
  return roleMap[user.value?.role || 'guest'] || '未知'
})

const roleClass = computed(() => {
  return `role-${user.value?.role || 'guest'}`
})

const roleTagType = computed(() => {
  const typeMap: Record<string, string> = {
    admin: 'danger',
    operator: 'warning',
    guest: 'info'
  }
  return typeMap[user.value?.role || 'guest'] || 'info'
})

const passwordStrength = computed(() => {
  const password = passwordForm.value.newPassword
  if (!password) return { score: 0, text: '', color: '' }
  
  let score = 0
  if (password.length >= 6) score += 20
  if (password.length >= 8) score += 20
  if (/[a-z]/.test(password)) score += 15
  if (/[A-Z]/.test(password)) score += 15
  if (/[0-9]/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 15
  
  if (score < 40) return { score, text: '弱', color: '#f56c6c' }
  if (score < 70) return { score, text: '中', color: '#e6a23c' }
  return { score, text: '强', color: '#67c23a' }
})

// 方法
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
}

const resetPasswordForm = () => {
  passwordForm.value = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
  passwordFormRef.value?.resetFields()
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return
  
  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }
  
  changingPassword.value = true
  try {
    const success = await authStore.changePassword(
      passwordForm.value.currentPassword,
      passwordForm.value.newPassword,
      passwordForm.value.confirmPassword
    )
    
    if (success) {
      emit('update:modelValue', false)
      // 跳转到登录页
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    }
  } finally {
    changingPassword.value = false
  }
}

const loadSessions = async () => {
  loadingSessions.value = true
  try {
    const response = await authApiService.getUserSessions()
    if (response.success && response.data) {
      sessions.value = response.data
    }
  } catch (error) {
    console.error('加载会话列表失败:', error)
  } finally {
    loadingSessions.value = false
  }
}

const handleRevokeSession = async (sessionId: string) => {
  try {
    await ElMessageBox.confirm('确定要退出该设备的登录吗？', '确认操作', {
      type: 'warning'
    })
    
    revokingSession.value = sessionId
    const response = await authApiService.revokeSession(sessionId)
    if (response.success) {
      ElMessage.success('已退出该设备')
      sessions.value = sessions.value.filter(s => s.id !== sessionId)
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  } finally {
    revokingSession.value = null
  }
}

const handleRevokeAllOthers = async () => {
  try {
    await ElMessageBox.confirm('确定要退出所有其他设备的登录吗？', '确认操作', {
      type: 'warning'
    })
    
    revokingAll.value = true
    const response = await authApiService.revokeAllOtherSessions()
    if (response.success) {
      ElMessage.success('已退出所有其他设备')
      sessions.value = sessions.value.filter(s => s.current)
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  } finally {
    revokingAll.value = false
  }
}

// 监听对话框打开
watch(() => props.modelValue, (visible) => {
  if (visible) {
    activeTab.value = 'password'
    resetPasswordForm()
    loadSessions()
  }
})
</script>

<style scoped>
.user-profile {
  padding: 0;
}

.profile-card {
  display: flex;
  gap: 24px;
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  margin-bottom: 20px;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.role-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.role-badge.role-admin {
  background: rgba(245, 108, 108, 0.9);
}

.role-badge.role-operator {
  background: rgba(230, 162, 60, 0.9);
}

.role-badge.role-guest {
  background: rgba(144, 147, 153, 0.9);
}

.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.username {
  margin: 0 0 12px 0;
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
}

.info-item .label {
  color: rgba(255, 255, 255, 0.7);
}

.info-item .value {
  color: white;
}

.profile-tabs {
  margin-top: 8px;
}

.tab-content {
  padding: 16px 0;
}

.password-form {
  max-width: 400px;
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}

.strength-label {
  color: #909399;
}

.strength-text {
  font-weight: 500;
}

.password-tip {
  margin-top: 16px;
}

.sessions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sessions-title {
  font-weight: 500;
  color: #303133;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  transition: all 0.2s;
}

.session-item.current {
  background: #e8f4ff;
  border: 1px solid #b3d8ff;
}

.session-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
  color: #409eff;
}

.session-info {
  flex: 1;
}

.device-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.last-active {
  font-size: 12px;
  color: #909399;
}

.account-info {
  margin-top: 8px;
}

.account-info code {
  padding: 2px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}
</style>

<style>
/* 全局样式 */
.user-profile-dialog .el-dialog__header {
  border-bottom: 1px solid #ebeef5;
  margin-right: 0;
  padding: 16px 20px;
}

.user-profile-dialog .el-dialog__body {
  padding: 20px;
}

.user-profile-dialog .el-dialog__footer {
  border-top: 1px solid #ebeef5;
  padding: 12px 20px;
}

.user-profile-dialog .el-tabs__header {
  margin-bottom: 0;
}
</style>
