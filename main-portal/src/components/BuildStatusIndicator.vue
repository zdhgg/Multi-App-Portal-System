<template>
  <div class="build-status-indicator">
    <!-- 构建工具标签 -->
    <el-tag
      v-if="buildTool"
      :type="getBuildToolType(buildTool)"
      size="mini"
      effect="plain"
      class="build-tool-tag"
    >
      <span class="tool-icon">{{ getBuildToolIcon(buildTool) }}</span>
      {{ buildTool }}
    </el-tag>
    
    <!-- 构建状态标签 -->
    <el-tag
      v-if="status"
      :type="getStatusType(status)"
      size="mini"
      effect="plain"
      class="build-status-tag"
    >
      <el-icon class="status-icon">
        <Loading v-if="status === 'building'" />
        <Check v-else-if="status === 'success'" />
        <Close v-else-if="status === 'failed'" />
        <Warning v-else-if="status === 'warning'" />
        <QuestionFilled v-else />
      </el-icon>
      {{ getStatusText(status) }}
    </el-tag>
    
    <!-- 置信度标签 -->
    <el-tag
      v-if="confidence !== null && confidence !== undefined"
      :type="getConfidenceType(confidence)"
      size="mini"
      effect="plain"
      class="confidence-tag"
    >
      {{ formatConfidence(confidence) }}
    </el-tag>
    
    <!-- 优化建议数量 -->
    <el-tag
      v-if="optimizationCount > 0"
      :type="getOptimizationCountType(optimizationCount)"
      size="mini"
      effect="plain"
      class="optimization-count-tag"
    >
      <el-icon><Tools /></el-icon>
      {{ optimizationCount }}
    </el-tag>
    
    <!-- 最后分析时间 -->
    <span v-if="lastAnalysis" class="last-analysis" :title="formatFullTime(lastAnalysis)">
      {{ formatRelativeTime(lastAnalysis) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Check, Close, Warning, QuestionFilled, Tools } from '@element-plus/icons-vue'

interface Props {
  buildTool?: string | null
  status?: 'building' | 'success' | 'failed' | 'warning' | 'unknown' | null
  confidence?: number | null
  optimizationCount?: number
  lastAnalysis?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  buildTool: null,
  status: null,
  confidence: null,
  optimizationCount: 0,
  lastAnalysis: null
})

// 获取构建工具图标
const getBuildToolIcon = (tool: string): string => {
  const icons: Record<string, string> = {
    'Next.js': '⚡',
    'Nuxt.js': '💚',
    'Vite': '⚡',
    'Create React App': '⚛️',
    'Vue CLI': '💚',
    'Angular CLI': '🅰️',
    'Webpack': '📦',
    'Rollup': '📦',
    'Parcel': '📦'
  }
  return icons[tool] || '🔧'
}

// 获取构建工具类型
const getBuildToolType = (tool: string): string => {
  const frameworks = ['Next.js', 'Nuxt.js', 'Create React App', 'Vue CLI', 'Angular CLI']
  return frameworks.includes(tool) ? 'primary' : 'info'
}

// 获取状态类型
const getStatusType = (status: string): string => {
  switch (status) {
    case 'building': return 'warning'
    case 'success': return 'success'
    case 'failed': return 'danger'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

// 获取状态文本
const getStatusText = (status: string): string => {
  switch (status) {
    case 'building': return '构建中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'warning': return '警告'
    default: return '未知'
  }
}

// 获取置信度类型
const getConfidenceType = (confidence: number): string => {
  if (confidence >= 0.9) return 'success'
  if (confidence >= 0.75) return 'primary'
  if (confidence >= 0.6) return 'warning'
  return 'danger'
}

// 格式化置信度
const formatConfidence = (confidence: number): string => {
  return `${Math.round(confidence * 100)}%`
}

// 获取优化建议数量类型
const getOptimizationCountType = (count: number): string => {
  if (count >= 3) return 'danger'
  if (count >= 1) return 'warning'
  return 'success'
}

// 格式化相对时间
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  
  return formatFullTime(timestamp)
}

// 格式化完整时间
const formatFullTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped>
.build-status-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  
  .build-tool-tag,
  .build-status-tag,
  .confidence-tag,
  .optimization-count-tag {
    font-size: 11px !important;
    height: 18px !important;
    line-height: 16px !important;
    padding: 0 4px !important;
    border-radius: 2px !important;
    
    .tool-icon {
      margin-right: 2px;
    }
    
    .status-icon {
      margin-right: 2px;
      font-size: 10px;
    }
    
    .el-icon {
      font-size: 10px;
      margin-right: 2px;
    }
  }
  
  .build-tool-tag {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    
    .tool-icon {
      filter: brightness(1.2);
    }
  }
  
  .build-status-tag {
    &.el-tag--warning {
      background: #fdf6ec;
      border-color: #faecd8;
      color: #e6a23c;
      
      .status-icon {
        animation: spin 1s linear infinite;
      }
    }
    
    &.el-tag--success {
      background: #f0f9ff;
      border-color: #d1f2eb;
      color: #67c23a;
    }
    
    &.el-tag--danger {
      background: #fef0f0;
      border-color: #fde2e2;
      color: #f56c6c;
    }
  }
  
  .confidence-tag {
    font-weight: 500;
    
    &.el-tag--success {
      background: #f0f9ff;
      border-color: #d1f2eb;
      color: #67c23a;
    }
    
    &.el-tag--primary {
      background: #ecf5ff;
      border-color: #d9ecff;
      color: #409eff;
    }
    
    &.el-tag--warning {
      background: #fdf6ec;
      border-color: #faecd8;
      color: #e6a23c;
    }
    
    &.el-tag--danger {
      background: #fef0f0;
      border-color: #fde2e2;
      color: #f56c6c;
    }
  }
  
  .optimization-count-tag {
    &.el-tag--danger {
      background: #fef0f0;
      border-color: #fde2e2;
      color: #f56c6c;
    }
    
    &.el-tag--warning {
      background: #fdf6ec;
      border-color: #faecd8;
      color: #e6a23c;
    }
    
    &.el-tag--success {
      background: #f0f9ff;
      border-color: #d1f2eb;
      color: #67c23a;
    }
  }
  
  .last-analysis {
    font-size: 11px;
    color: #909399;
    white-space: nowrap;
    cursor: help;
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

/* 响应式设计 */
@media (max-width: 768px) {
  .build-status-indicator {
    .build-tool-tag,
    .build-status-tag,
    .confidence-tag,
    .optimization-count-tag {
      font-size: 10px !important;
      height: 16px !important;
      line-height: 14px !important;
      padding: 0 3px !important;
    }
    
    .last-analysis {
      font-size: 10px;
    }
  }
}
</style>
