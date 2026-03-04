<template>
  <div class="notify-panel">
    <el-form :model="model" label-width="140px">
      <el-form-item label="启用通知">
        <el-switch v-model="model.enabled" @change="emitChange" />
      </el-form-item>

      <el-form-item label="事件类型" v-if="model.enabled">
        <el-checkbox-group v-model="eventKeys" @change="syncEvents">
          <el-checkbox label="recovery">恢复</el-checkbox>
          <el-checkbox label="startup">启动</el-checkbox>
          <el-checkbox label="shutdown">关闭</el-checkbox>
          <el-checkbox label="error">错误</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-divider>通知渠道</el-divider>
      <el-form-item label="写入日志">
        <el-switch v-model="model.channels.log.enabled" @change="emitChange" />
      </el-form-item>
      <el-form-item label="控制台输出">
        <el-switch v-model="model.channels.console.enabled" @change="emitChange" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="testNotify">测试通知</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, ref } from 'vue'
import { ElMessage } from 'element-plus'

type Notifications = {
  enabled: boolean
  events: Record<string, boolean>
  channels: { log: { enabled: boolean }; console: { enabled: boolean } }
}

const props = defineProps<{ notifications: Notifications }>()
const emit = defineEmits<{ (e: 'update:notifications', value: Notifications): void; (e: 'settings-changed', value: Notifications): void }>()

const model = reactive<Notifications>({ enabled: true, events: { recovery: true, startup: true, shutdown: true, error: true }, channels: { log: { enabled: true }, console: { enabled: true } } })
watch(
  () => props.notifications,
  v => { Object.assign(model, normalize(v)) },
  { immediate: true, deep: true }
)

const eventKeys = ref<string[]>([])
watch(
  () => model.events,
  (v) => {
    eventKeys.value = Object.entries(v).filter(([, val]) => !!val).map(([k]) => k)
  },
  { immediate: true, deep: true }
)

function normalize(v?: any): Notifications {
  return {
    enabled: v?.enabled ?? true,
    events: { recovery: !!v?.events?.recovery, startup: !!v?.events?.startup, shutdown: !!v?.events?.shutdown, error: v?.events?.error ?? true },
    channels: { log: { enabled: v?.channels?.log?.enabled ?? true }, console: { enabled: v?.channels?.console?.enabled ?? true } }
  }
}

function syncEvents() {
  const e: any = { recovery: false, startup: false, shutdown: false, error: false }
  for (const k of eventKeys.value) e[k] = true
  model.events = e
  emitChange()
}

function emitChange() {
  const payload = JSON.parse(JSON.stringify(model))
  emit('update:notifications', payload)
  emit('settings-changed', payload)
}

function testNotify() { ElMessage.success('测试通知已发送（示例）') }
</script>

<style scoped>
.notify-panel { max-width: 640px; }
</style>

