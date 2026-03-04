<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="`${process?.name} 进程日志`"
    width="80%"
  >
    <el-input
      v-model="logs"
      type="textarea"
      :rows="20"
      readonly
      placeholder="日志内容将在这里显示..."
      class="log-textarea"
    />
    
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <el-button type="primary" @click="refreshLogs" :loading="loading">
        刷新日志
      </el-button>
      <el-button 
        v-if="isError"
        type="success" 
        @click="$emit('diagnose', process!)"
        :loading="diagnosing"
      >
        <el-icon><Tools /></el-icon>
        一键智能诊断
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Tools } from '@element-plus/icons-vue'
import { pm2ApiService } from '@/services/pm2Api'
import type { PM2Process } from '@/services/pm2Api'

const props = defineProps<{
  modelValue: boolean
  process: PM2Process | null
  diagnosing?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'diagnose', process: PM2Process): void
}>()

const logs = ref('')
const loading = ref(false)

const isError = computed(() => {
  const s = props.process?.status as any
  return s === 'error' || s === 'errored'
})

// 获取日志
const fetchLogs = async () => {
  if (!props.process) return
  
  loading.value = true
  try {
    const response = await pm2ApiService.getProcessLogs(props.process.name)
    
    // 调试日志
    console.log('PM2 日志响应:', response)
    
    if (isError.value) {
      // 错误状态时提供更详细的提示
      logs.value = `⚠️ 进程状态：错误

📋 日志内容：
${response.logs || '（日志为空）'}

${!response.logs?.trim() ? `
❌ 日志为空的可能原因：
1. 进程启动太快就失败了
2. 启动脚本路径错误
3. 依赖缺失（node_modules未安装）
4. 端口被占用

🔍 建议使用"一键智能诊断"功能自动检测问题
` : ''}`
    } else if (!response.logs?.trim()) {
      logs.value = `ℹ️ 暂无日志输出

可能原因：
1. 应用刚刚启动
2. 应用没有 console.log 输出
3. 日志被重定向到其他位置`
    } else {
      logs.value = response.logs
    }
  } catch (error: any) {
    console.error('获取日志失败:', error)
    // 显示更详细的错误信息
    const errorMsg = error?.message || error?.details?.message || '未知错误'
    logs.value = `❌ 获取日志失败

错误信息: ${errorMsg}

可能原因：
1. 认证已过期，请刷新页面重新登录
2. 后端服务未正常运行
3. PM2 进程不存在

请检查浏览器控制台获取更多信息`
    ElMessage.error('获取日志失败: ' + errorMsg)
  } finally {
    loading.value = false
  }
}

const refreshLogs = () => {
  fetchLogs()
}

// 对话框打开时获取日志
watch(() => props.modelValue, (visible) => {
  if (visible && props.process) {
    fetchLogs()
  }
})
</script>

<style scoped>
.log-textarea :deep(.el-textarea__inner) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: #1e1e1e;
  color: #d4d4d4;
}
</style>
