<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="`编辑进程 ${process?.name} 的 PM2 配置`"
    width="600px"
  >
    <el-form :model="form" label-width="120px">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="进程名称">
            <el-input v-model="form.name" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="启动脚本">
            <el-input v-model="form.script" placeholder="npm run dev" />
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-form-item label="工作目录(cwd)">
        <el-input v-model="form.cwd" placeholder="例如：D:/apps/my-app" />
      </el-form-item>
      
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="执行模式">
            <el-select v-model="form.exec_mode" style="width: 100%">
              <el-option label="Fork (单进程)" value="fork" />
              <el-option label="Cluster (集群)" value="cluster" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="实例数量">
            <el-input v-model="form.instances" type="number" />
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="监听变更">
            <el-switch v-model="form.watch" />
          </el-form-item>
        </el-col>
        <el-col :span="16">
          <el-form-item label="内存上限">
            <el-input v-model="form.max_memory_restart" placeholder="例如：500M" />
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-divider content-position="left">环境变量</el-divider>
      
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="NODE_ENV">
            <el-select v-model="envForm.NODE_ENV" style="width: 100%">
              <el-option label="development" value="development" />
              <el-option label="production" value="production" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="PORT">
            <el-input v-model="envForm.PORT" placeholder="如 8041" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pm2ApiService } from '@/services/pm2Api'
import type { PM2Process, PM2Config } from '@/services/pm2Api'

const props = defineProps<{
  modelValue: boolean
  process: PM2Process | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const saving = ref(false)

const form = ref({
  name: '',
  script: 'npm run dev',
  cwd: '',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '500M'
})

const envForm = ref({
  NODE_ENV: 'development',
  PORT: ''
})

// 监听process变化，初始化表单
watch(() => props.process, (newProcess) => {
  if (newProcess) {
    form.value = {
      name: newProcess.name,
      script: newProcess.script || 'npm run dev',
      cwd: (newProcess as any).cwd || '',
      instances: typeof newProcess.instances === 'number'
        ? newProcess.instances
        : (parseInt(String(newProcess.instances || '')) || 1),
      exec_mode: newProcess.exec_mode || 'fork',
      watch: newProcess.watch || false,
      max_memory_restart: newProcess.max_memory_restart || '500M'
    }
    envForm.value = {
      NODE_ENV: (newProcess.env?.NODE_ENV as string) || 'development',
      PORT: (newProcess.env?.PORT as string) || ''
    }
  }
}, { immediate: true })

const handleSave = async () => {
  try {
    saving.value = true
    
    const appConfig: PM2Config = {
      name: form.value.name,
      script: form.value.script,
      cwd: form.value.cwd || undefined,
      instances: form.value.instances,
      exec_mode: form.value.exec_mode as 'fork' | 'cluster',
      watch: form.value.watch,
      max_memory_restart: form.value.max_memory_restart,
      env: {},
      env_production: {
        NODE_ENV: envForm.value.NODE_ENV,
        ...(envForm.value.PORT ? { PORT: envForm.value.PORT } : {})
      }
    }
    
    await pm2ApiService.applyPM2Config({ apps: [appConfig] })
    ElMessage.success('配置已保存并应用')
    emit('update:modelValue', false)
    emit('saved')
  } catch (error) {
    console.error('保存PM2配置失败:', error)
    ElMessage.error('保存失败，请检查配置')
  } finally {
    saving.value = false
  }
}
</script>
