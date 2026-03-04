<template>
  <div class="security-panel">
    <el-form :model="model" label-width="140px">
      <el-divider>密码策略</el-divider>
      <el-form-item label="最小长度">
        <el-input-number v-model="model.passwordPolicy.minLength" :min="4" :max="64" @change="emitChange" />
      </el-form-item>
      <el-form-item label="必须包含数字">
        <el-switch v-model="model.passwordPolicy.requireNumber" @change="emitChange" />
      </el-form-item>
      <el-form-item label="必须包含大写字母">
        <el-switch v-model="model.passwordPolicy.requireUppercase" @change="emitChange" />
      </el-form-item>
      <el-form-item label="必须包含特殊字符">
        <el-switch v-model="model.passwordPolicy.requireSpecial" @change="emitChange" />
      </el-form-item>

      <el-divider>会话</el-divider>
      <el-form-item label="会话超时(分钟)">
        <el-input-number v-model="model.session.timeoutMinutes" :min="5" :max="720" @change="emitChange" />
      </el-form-item>
      <el-form-item label="允许本机免登(分钟)">
        <el-input-number v-model="model.session.localTrustedMinutes" :min="0" :max="1440" @change="emitChange" />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

type SecuritySettings = {
  passwordPolicy: { minLength: number; requireNumber: boolean; requireUppercase: boolean; requireSpecial: boolean }
  session: { timeoutMinutes: number; localTrustedMinutes: number }
}

const props = defineProps<{ security: any }>()
const emit = defineEmits<{ (e: 'update:security', value: SecuritySettings): void; (e: 'security-changed', value: SecuritySettings): void }>()

const model = reactive<SecuritySettings>({
  passwordPolicy: { minLength: 8, requireNumber: true, requireUppercase: false, requireSpecial: false },
  session: { timeoutMinutes: 30, localTrustedMinutes: 0 }
})

watch(
  () => props.security,
  (v) => {
    const merged = {
      passwordPolicy: {
        minLength: v?.passwordPolicy?.minLength ?? 8,
        requireNumber: v?.passwordPolicy?.requireNumber ?? true,
        requireUppercase: v?.passwordPolicy?.requireUppercase ?? false,
        requireSpecial: v?.passwordPolicy?.requireSpecial ?? false
      },
      session: {
        timeoutMinutes: v?.session?.timeoutMinutes ?? 30,
        localTrustedMinutes: v?.session?.localTrustedMinutes ?? 0
      }
    }
    Object.assign(model, merged)
  },
  { immediate: true, deep: true }
)

function emitChange() {
  const payload = JSON.parse(JSON.stringify(model))
  emit('update:security', payload)
  emit('security-changed', payload)
}
</script>

<style scoped>
.security-panel { max-width: 640px; }
</style>

