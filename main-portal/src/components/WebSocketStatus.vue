<template>
  <div class="websocket-status">
    <!-- 简洁状态指示器 -->
    <el-tooltip :content="statusTooltip" placement="bottom">
      <div class="status-indicator" :class="statusClass">
        <el-icon :size="16">
          <component :is="statusIcon" />
        </el-icon>
        <span v-if="showLabel" class="status-label">{{ statusText }}</span>
      </div>
    </el-tooltip>

    <!-- 重连进度（仅在重连时显示） -->
    <div v-if="isReconnecting" class="reconnect-progress">
      <el-progress
        :percentage="reconnectProgress"
        :status="reconnectAttempts >= maxAttempts ? 'exception' : 'warning'"
        :show-text="false"
        :stroke-width="3"
      />
      <div class="reconnect-info">
        <span class="reconnect-text">
          重连中 ({{ reconnectAttempts }}/{{ maxAttempts }})
        </span>
        <span class="reconnect-delay">{{ nextDelayText }}</span>
      </div>
    </div>

    <!-- 详细状态面板（可选） -->
    <el-dialog
      v-model="showDetails"
      title="WebSocket连接状态"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="status-details">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="连接状态">
            <el-tag :type="statusTagType">{{ statusText }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="连接地址">
            {{ wsUrl }}
          </el-descriptions-item>
          <el-descriptions-item label="重连次数">
            {{ reconnectAttempts }} / {{ maxAttempts }}
          </el-descriptions-item>
          <el-descriptions-item label="下次重连延迟">
            {{ nextDelayText }}
          </el-descriptions-item>
          <el-descriptions-item v-if="error" label="错误信息">
            <el-text type="danger">{{ error }}</el-text>
          </el-descriptions-item>
        </el-descriptions>

        <div class="status-actions">
          <el-button
            v-if="!isConnected && !isConnecting"
            type="primary"
            @click="handleReconnect"
          >
            手动重连
          </el-button>
          <el-button
            v-if="isConnected"
            type="danger"
            @click="handleDisconnect"
          >
            断开连接
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Connection, Loading, WarningFilled, CircleClose } from '@element-plus/icons-vue'

interface Props {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  reconnectAttempts: number
  nextReconnectDelay: number
  maxAttempts?: number
  wsUrl?: string
  showLabel?: boolean
  showDetailsButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxAttempts: 10,
  wsUrl: '',
  showLabel: true,
  showDetailsButton: false
})

const emit = defineEmits<{
  reconnect: []
  disconnect: []
}>()

const showDetails = ref(false)

// 是否正在重连
const isReconnecting = computed(() => {
  return !props.isConnected && !props.isConnecting && props.reconnectAttempts > 0
})

// 状态文本
const statusText = computed(() => {
  if (props.isConnected) return '已连接'
  if (props.isConnecting) return '连接中'
  if (isReconnecting.value) return '重连中'
  if (props.error) return '连接失败'
  return '未连接'
})

// 状态图标
const statusIcon = computed(() => {
  if (props.isConnected) return Connection
  if (props.isConnecting) return Loading
  if (isReconnecting.value) return WarningFilled
  return CircleClose
})

// 状态样式类
const statusClass = computed(() => {
  if (props.isConnected) return 'status-connected'
  if (props.isConnecting) return 'status-connecting'
  if (isReconnecting.value) return 'status-reconnecting'
  return 'status-disconnected'
})

// 状态标签类型
const statusTagType = computed(() => {
  if (props.isConnected) return 'success'
  if (props.isConnecting) return 'info'
  if (isReconnecting.value) return 'warning'
  return 'danger'
})

// 状态提示
const statusTooltip = computed(() => {
  if (props.isConnected) return 'WebSocket已连接'
  if (props.isConnecting) return 'WebSocket连接中...'
  if (isReconnecting.value) {
    return `正在尝试重连 (${props.reconnectAttempts}/${props.maxAttempts})，${nextDelayText.value}后重试`
  }
  if (props.error) return `连接失败: ${props.error}`
  return 'WebSocket未连接'
})

// 重连进度
const reconnectProgress = computed(() => {
  return Math.round((props.reconnectAttempts / props.maxAttempts) * 100)
})

// 下次重连延迟文本
const nextDelayText = computed(() => {
  if (props.nextReconnectDelay === 0) return '无'
  if (props.nextReconnectDelay < 1000) return `${props.nextReconnectDelay}ms`
  return `${(props.nextReconnectDelay / 1000).toFixed(1)}s`
})

// 手动重连
const handleReconnect = () => {
  emit('reconnect')
  showDetails.value = false
}

// 断开连接
const handleDisconnect = () => {
  emit('disconnect')
  showDetails.value = false
}

// 显示详情
const openDetails = () => {
  showDetails.value = true
}

defineExpose({
  openDetails
})
</script>

<style scoped lang="scss">
.websocket-status {
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    opacity: 0.8;
  }

  &.status-connected {
    color: #67c23a;
    background-color: #f0f9ff;
    border: 1px solid #67c23a;

    .el-icon {
      animation: pulse 2s infinite;
    }
  }

  &.status-connecting {
    color: #409eff;
    background-color: #ecf5ff;
    border: 1px solid #409eff;

    .el-icon {
      animation: spin 1s linear infinite;
    }
  }

  &.status-reconnecting {
    color: #e6a23c;
    background-color: #fdf6ec;
    border: 1px solid #e6a23c;

    .el-icon {
      animation: blink 1s infinite;
    }
  }

  &.status-disconnected {
    color: #f56c6c;
    background-color: #fef0f0;
    border: 1px solid #f56c6c;
  }
}

.status-label {
  font-weight: 500;
}

.reconnect-progress {
  min-width: 200px;
  padding: 8px 12px;
  background-color: #fdf6ec;
  border-radius: 4px;
  border: 1px solid #e6a23c;
}

.reconnect-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
  color: #e6a23c;
}

.reconnect-text {
  font-weight: 500;
}

.reconnect-delay {
  opacity: 0.8;
}

.status-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>

