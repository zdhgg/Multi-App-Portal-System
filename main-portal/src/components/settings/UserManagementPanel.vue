<template>
  <div class="user-panel">
    <div class="toolbar">
      <el-button type="primary" @click="openAdd">新增用户</el-button>
    </div>
    <el-table :data="internalUsers" style="width: 100%" size="small" border>
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="row.role==='admin' ? 'danger' : 'info'">
            {{ row.role === 'admin' ? '管理员' : '运维' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="enabled" label="状态" width="100">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="handleStatusChange" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row, $index }">
          <el-button size="small" @click="openEdit(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="removeUser($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑用户' : '新增用户'" width="520px">
      <el-form :model="dialog.form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input 
            v-model="dialog.form.username" 
            :disabled="dialog.isEdit"
            placeholder="请输入用户名（字母、数字、下划线）"
            clearable
          />
        </el-form-item>
        
        <el-form-item 
          :label="dialog.isEdit ? '新密码' : '初始密码'" 
          prop="password"
        >
          <div style="width: 100%">
            <el-input 
              v-model="dialog.form.password" 
              :type="showPassword ? 'text' : 'password'"
              :placeholder="dialog.isEdit ? '留空则不修改密码' : '请输入初始密码（至少8位）'"
              clearable
            >
              <template #suffix>
                <el-button 
                  link 
                  type="primary" 
                  @click="showPassword = !showPassword"
                  style="padding: 0"
                >
                  {{ showPassword ? '隐藏' : '显示' }}
                </el-button>
              </template>
            </el-input>
            
            <!-- 密码强度指示器 -->
            <div v-if="dialog.form.password && passwordStrength.level > 0" 
                 class="password-strength" 
                 :style="{ marginTop: '8px' }">
              <div class="strength-bar">
                <div 
                  class="strength-fill" 
                  :style="{ 
                    width: (passwordStrength.level * 33.33) + '%', 
                    backgroundColor: passwordStrength.color 
                  }"
                ></div>
              </div>
              <span class="strength-text" :style="{ color: passwordStrength.color }">
                密码强度：{{ passwordStrength.text }}
              </span>
            </div>
            
            <!-- 自动生成密码按钮 -->
            <el-button 
              v-if="!dialog.isEdit"
              type="primary" 
              link 
              @click="generatePassword"
              style="margin-top: 8px"
            >
              🎲 自动生成强密码
            </el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="角色" prop="role">
          <el-select v-model="dialog.form.role" style="width: 100%">
            <el-option label="管理员" value="admin">
              <span>管理员</span>
              <span style="float: right; color: #8492a6; font-size: 12px">完全控制权限</span>
            </el-option>
            <el-option label="运维" value="operator">
              <span>运维</span>
              <span style="float: right; color: #8492a6; font-size: 12px">日常运维权限</span>
            </el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item label="账户状态">
          <el-switch 
            v-model="dialog.form.enabled"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
        
        <el-form-item v-if="!dialog.isEdit" label="首次登录">
          <el-checkbox v-model="dialog.form.mustChangePassword">
            强制首次登录修改密码
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible=false">取消</el-button>
        <el-button type="primary" @click="submit">
          {{ dialog.isEdit ? '保存修改' : '创建用户' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, reactive, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

type User = { 
  id?: string;
  username: string; 
  password?: string; 
  role: 'admin' | 'operator'; 
  enabled: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
  createdBy?: string;
}

const props = defineProps<{ users: User[] }>()
const emit = defineEmits<{ (e: 'update:users', users: User[]): void; (e: 'user-updated'): void }>()

const internalUsers = ref<User[]>([])
watch(
  () => props.users,
  (v) => { internalUsers.value = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : [] },
  { immediate: true }
)

const dialog = reactive({ 
  visible: false, 
  isEdit: false, 
  index: -1, 
  form: { 
    username: '', 
    password: '',
    role: 'operator', 
    enabled: true,
    mustChangePassword: true 
  } as User 
})
const showPassword = ref(false)
const formRef = ref<FormInstance>()
const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 32, message: '2-32 个字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和连字符', trigger: 'blur' },
    {
      validator: (_r: any, v: string, cb: any) => {
        const exists = internalUsers.value.some(u => u.username === v)
        if (!dialog.isEdit && exists) cb(new Error('用户名已存在'))
        else cb()
      }, trigger: 'blur'
    }
  ],
  password: [
    { 
      validator: (_r: any, v: string, cb: any) => {
        if (!dialog.isEdit && !v) {
          cb(new Error('请输入密码'))
        } else if (v && v.length < 8) {
          cb(new Error('密码至少8个字符'))
        } else {
          cb()
        }
      }, 
      trigger: 'blur' 
    }
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

function openAdd() {
  dialog.isEdit = false; dialog.index = -1
  dialog.form = { 
    username: '', 
    password: '',
    role: 'operator', 
    enabled: true,
    mustChangePassword: true
  }
  dialog.visible = true
  showPassword.value = false
  nextTick(() => formRef.value?.clearValidate())
}

function openEdit(row: User, index: number) {
  dialog.isEdit = true; dialog.index = index
  dialog.form = { ...row, password: '' }  // 编辑时不显示原密码
  dialog.visible = true
  showPassword.value = false
  nextTick(() => formRef.value?.clearValidate())
}

function submit() {
  formRef.value?.validate((ok) => {
    if (!ok) return

    const userData = { ...dialog.form }
    const isEdit = dialog.isEdit

    if (isEdit && dialog.index >= 0) {
      // 编辑时，如果没填密码就保留原密码
      if (!userData.password) {
        delete userData.password
      }
      internalUsers.value.splice(dialog.index, 1, {
        ...internalUsers.value[dialog.index],
        ...userData
      })
    } else {
      // 新增时必须有密码
      if (!userData.password) {
        ElMessage.error('请设置初始密码')
        return
      }
      userData.id = `user-${Date.now()}`
      userData.createdAt = new Date().toISOString()
      internalUsers.value.push({ ...userData })
    }

    dialog.visible = false

    // 使用 nextTick 避免循环更新
    nextTick(() => {
      emitChange()
      emit('user-updated')
      // 延迟显示消息，避免与表格更新冲突
      setTimeout(() => {
        ElMessage.success({
          message: isEdit ? '用户已更新，请点击右上角"保存设置"按钮保存到服务器' : '用户已创建，请点击右上角"保存设置"按钮保存到服务器',
          duration: 5000,
          showClose: true
        })
      }, 100)
    })
  })
}

function removeUser(index: number) {
  const user = internalUsers.value[index]
  ElMessageBox.confirm(
    `确定要删除用户 "${user.username}" 吗？此操作不可恢复。`,
    '确认删除',
    {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    }
  ).then(() => {
    internalUsers.value.splice(index, 1)

    // 使用 nextTick 避免循环更新
    nextTick(() => {
      emitChange()
      // 延迟显示消息，避免与表格更新冲突
      setTimeout(() => {
        ElMessage.success({
          message: '用户已删除，请点击右上角"保存设置"按钮保存到服务器',
          duration: 5000,
          showClose: true
        })
      }, 100)
    })
  }).catch(() => {
    // 用户取消删除
  })
}

function emitChange() {
  emit('update:users', JSON.parse(JSON.stringify(internalUsers.value)))
}

function handleStatusChange() {
  // 使用 nextTick 避免循环更新
  nextTick(() => {
    emitChange()
  })
}

// 生成随机密码
function generatePassword() {
  const length = 12
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  
  // 确保至少包含一个大写字母、小写字母、数字和特殊字符
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
  password += '0123456789'[Math.floor(Math.random() * 10)]
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]
  
  // 填充剩余字符
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)]
  }
  
  // 打乱顺序
  password = password.split('').sort(() => Math.random() - 0.5).join('')
  
  dialog.form.password = password
  showPassword.value = true
  ElMessage.success('密码已自动生成，请复制保存')
}

// 计算密码强度
const passwordStrength = computed(() => {
  const pwd = dialog.form.password || ''
  if (pwd.length === 0) return { level: 0, text: '', color: '' }
  
  let strength = 0
  if (pwd.length >= 8) strength++
  if (pwd.length >= 12) strength++
  if (/[a-z]/.test(pwd)) strength++
  if (/[A-Z]/.test(pwd)) strength++
  if (/[0-9]/.test(pwd)) strength++
  if (/[^a-zA-Z0-9]/.test(pwd)) strength++
  
  if (strength <= 2) return { level: 1, text: '弱', color: '#f56c6c' }
  if (strength <= 4) return { level: 2, text: '中', color: '#e6a23c' }
  return { level: 3, text: '强', color: '#67c23a' }
})
</script>

<style scoped>
.toolbar { margin-bottom: 12px; }

.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  background-color: #e4e7ed;
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  transition: all 0.3s ease;
  border-radius: 2px;
}

.strength-text {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
</style>

