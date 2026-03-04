<template>
  <el-dialog
    v-model="visible"
    title="构建进度"
    width="70%"
    :before-close="handleClose"
    class="build-progress-dialog"
  >
    <div v-if="progress" class="progress-content">
      <!-- 构建概览 -->
      <el-card class="overview-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Monitor /></el-icon>
            <span>构建概览</span>
            <el-tag :type="getStatusType(progress.status)" size="small">
              {{ getStatusText(progress.status) }}
            </el-tag>
          </div>
        </template>
        
        <div class="overview-content">
          <div class="progress-info">
            <div class="progress-bar-container">
              <el-progress
                :percentage="progress.progress"
                :status="getProgressStatus(progress.status)"
                :stroke-width="8"
                class="main-progress"
              />
              <div class="progress-text">{{ progress.currentStep }}</div>
            </div>
            
            <div class="build-details">
              <div class="detail-item">
                <span class="label">应用ID:</span>
                <span class="value">{{ progress.appId }}</span>
              </div>
              <div class="detail-item">
                <span class="label">执行ID:</span>
                <span class="value">{{ progress.executionId }}</span>
              </div>
              <div class="detail-item">
                <span class="label">开始时间:</span>
                <span class="value">{{ formatTime(progress.startTime) }}</span>
              </div>
              <div v-if="progress.endTime" class="detail-item">
                <span class="label">结束时间:</span>
                <span class="value">{{ formatTime(progress.endTime) }}</span>
              </div>
              <div v-if="progress.duration" class="detail-item">
                <span class="label">耗时:</span>
                <span class="value">{{ formatDuration(progress.duration) }}</span>
              </div>
              <div v-if="progress.outputSize" class="detail-item">
                <span class="label">输出大小:</span>
                <span class="value">{{ formatFileSize(progress.outputSize) }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 构建日志 -->
      <el-card class="logs-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Document /></el-icon>
            <span>构建日志</span>
            <div class="log-controls">
              <el-button size="small" @click="scrollToBottom">
                <el-icon><ArrowDown /></el-icon>
                滚动到底部
              </el-button>
              <el-button size="small" @click="clearLogs">
                <el-icon><Delete /></el-icon>
                清空日志
              </el-button>
            </div>
          </div>
        </template>
        
        <div class="logs-container" ref="logsContainer">
          <div v-if="progress.logs.length === 0" class="empty-logs">
            <el-icon><Document /></el-icon>
            <p>暂无日志输出</p>
          </div>
          <div v-else class="logs-content">
            <div
              v-for="(log, index) in progress.logs"
              :key="index"
              :class="['log-entry', `log-${log.level}`]"
            >
              <span class="log-timestamp">{{ formatLogTime(log.timestamp) }}</span>
              <span class="log-level">{{ log.level.toUpperCase() }}</span>
              <span class="log-source">[{{ log.source }}]</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 构建产物 -->
      <el-card v-if="progress.artifacts && progress.artifacts.length > 0" class="artifacts-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Folder /></el-icon>
            <span>构建产物</span>
            <el-tag type="info" size="small">
              {{ progress.artifacts.length }} 个文件
            </el-tag>
          </div>
        </template>
        
        <div class="artifacts-list">
          <div
            v-for="(artifact, index) in progress.artifacts"
            :key="index"
            class="artifact-item"
          >
            <el-icon><Document /></el-icon>
            <span class="artifact-name">{{ artifact }}</span>
          </div>
        </div>
      </el-card>

      <!-- 错误信息 -->
      <el-card v-if="progress.error" class="error-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Warning /></el-icon>
            <span>错误信息</span>
          </div>
        </template>
        
        <div class="error-content">
          <el-alert
            :title="progress.error"
            type="error"
            :closable="false"
            show-icon
          />
        </div>
      </el-card>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button
          v-if="progress && (progress.status === 'running' || progress.status === 'queued')"
          type="danger"
          @click="handleCancel"
          :loading="cancelling"
        >
          取消构建
        </el-button>
        <el-button
          v-if="progress && progress.status === 'success'"
          type="primary"
          @click="handleViewResult"
        >
          查看结果
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Monitor, Document, ArrowDown, Delete, Folder, Warning } from '@element-plus/icons-vue'
import type { BuildProgress } from '@/services/buildApi'

interface Props {
  modelValue: boolean
  progress: BuildProgress | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'cancel', executionId: string): void
  (e: 'view-result', progress: BuildProgress): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const logsContainer = ref<HTMLElement>()
const cancelling = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 监听日志变化，自动滚动到底部
watch(
  () => props.progress?.logs.length,
  () => {
    nextTick(() => {
      scrollToBottom()
    })
  }
)

// 获取状态类型
const getStatusType = (status: string): string => {
  switch (status) {
    case 'queued': return 'info'
    case 'running': return 'warning'
    case 'success': return 'success'
    case 'failed': return 'danger'
    case 'cancelled': return 'info'
    default: return 'info'
  }
}

// 获取状态文本
const getStatusText = (status: string): string => {
  switch (status) {
    case 'queued': return '排队中'
    case 'running': return '构建中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return '未知'
  }
}

// 获取进度条状态
const getProgressStatus = (status: string): string | undefined => {
  switch (status) {
    case 'success': return 'success'
    case 'failed': return 'exception'
    default: return undefined
  }
}

// 格式化时间
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 格式化日志时间
const formatLogTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN')
}

// 格式化持续时间
const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`
  }
  return `${remainingSeconds}秒`
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 滚动到底部
const scrollToBottom = () => {
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight
  }
}

// 清空日志
const clearLogs = () => {
  if (props.progress) {
    props.progress.logs.splice(0)
  }
}

// 处理关闭
const handleClose = () => {
  visible.value = false
}

// 处理取消构建
const handleCancel = async () => {
  if (!props.progress) return
  
  cancelling.value = true
  try {
    emit('cancel', props.progress.executionId)
  } finally {
    cancelling.value = false
  }
}

// 处理查看结果
const handleViewResult = () => {
  if (props.progress) {
    emit('view-result', props.progress)
  }
}
</script>

<style scoped>
.build-progress-dialog {
  .progress-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .el-icon {
      color: #409eff;
    }
  }

  .overview-content {
    .progress-info {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .progress-bar-container {
      .main-progress {
        margin-bottom: 8px;
      }
      
      .progress-text {
        text-align: center;
        color: #606266;
        font-size: 14px;
      }
    }

    .build-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      
      .detail-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 12px;
        background: #f5f7fa;
        border-radius: 4px;
        
        .label {
          color: #909399;
          font-size: 12px;
        }
        
        .value {
          color: #303133;
          font-size: 12px;
          font-weight: 500;
        }
      }
    }
  }

  .logs-card {
    .card-header {
      justify-content: space-between;
      
      .log-controls {
        display: flex;
        gap: 8px;
      }
    }
    
    .logs-container {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e4e7ed;
      border-radius: 4px;
      background: #1e1e1e;
      
      .empty-logs {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: #909399;
        
        .el-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
      }
      
      .logs-content {
        padding: 12px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        
        .log-entry {
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
          line-height: 1.4;
          
          .log-timestamp {
            color: #909399;
            min-width: 80px;
          }
          
          .log-level {
            min-width: 50px;
            font-weight: bold;
          }
          
          .log-source {
            color: #67c23a;
            min-width: 60px;
          }
          
          .log-message {
            flex: 1;
            word-break: break-all;
          }
          
          &.log-info {
            color: #e6e6e6;
            .log-level { color: #409eff; }
          }
          
          &.log-warn {
            color: #e6a23c;
            .log-level { color: #e6a23c; }
          }
          
          &.log-error {
            color: #f56c6c;
            .log-level { color: #f56c6c; }
          }
          
          &.log-debug {
            color: #909399;
            .log-level { color: #909399; }
          }
        }
      }
    }
  }

  .artifacts-card {
    .artifacts-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
      
      .artifact-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #f5f7fa;
        border-radius: 4px;
        font-size: 12px;
        
        .el-icon {
          color: #409eff;
        }
        
        .artifact-name {
          color: #303133;
          word-break: break-all;
        }
      }
    }
  }

  .error-card {
    .error-content {
      .el-alert {
        border-radius: 4px;
      }
    }
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
}

@media (max-width: 768px) {
  .build-progress-dialog {
    .overview-content .build-details {
      grid-template-columns: 1fr;
    }
    
    .artifacts-card .artifacts-list {
      grid-template-columns: 1fr;
    }
  }
}
</style>
