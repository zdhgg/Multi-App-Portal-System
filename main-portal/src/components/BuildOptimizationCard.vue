<template>
  <el-card class="optimization-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <el-tag
            :type="getPriorityType(optimization.priority)"
            size="small"
            class="priority-tag"
          >
            {{ getPriorityText(optimization.priority) }}
          </el-tag>
          <span class="optimization-type">{{ optimization.type }}</span>
        </div>
        <div class="header-right">
          <el-button
            v-if="!applied"
            type="primary"
            size="small"
            @click="handleApply"
            :loading="applying"
          >
            应用优化
          </el-button>
          <el-tag v-else type="success" size="small">
            <el-icon><Check /></el-icon>
            已应用
          </el-tag>
        </div>
      </div>
    </template>
    
    <div class="optimization-content">
      <div class="description">
        {{ optimization.description }}
      </div>
      
      <div v-if="showDetails" class="details">
        <div class="config-section">
          <h4>配置详情</h4>
          <div class="config-preview">
            <pre class="config-code">{{ formatConfig(optimization.config) }}</pre>
          </div>
        </div>
        
        <div v-if="benefits.length > 0" class="benefits-section">
          <h4>预期收益</h4>
          <ul class="benefits-list">
            <li v-for="benefit in benefits" :key="benefit">
              <el-icon><TrendCharts /></el-icon>
              {{ benefit }}
            </li>
          </ul>
        </div>
      </div>
      
      <div class="actions">
        <el-button
          type="text"
          size="small"
          @click="toggleDetails"
          class="toggle-btn"
        >
          {{ showDetails ? '收起详情' : '查看详情' }}
          <el-icon>
            <ArrowDown v-if="!showDetails" />
            <ArrowUp v-else />
          </el-icon>
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, TrendCharts, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { BuildOptimization } from '@/services/buildApi'

interface Props {
  optimization: BuildOptimization
  applied?: boolean
}

interface Emits {
  (e: 'apply', optimization: BuildOptimization): void
}

const props = withDefaults(defineProps<Props>(), {
  applied: false
})

const emit = defineEmits<Emits>()

const showDetails = ref(false)
const applying = ref(false)

// 获取优先级类型
const getPriorityType = (priority: string): string => {
  switch (priority) {
    case 'high': return 'danger'
    case 'medium': return 'warning'
    case 'low': return 'info'
    default: return 'info'
  }
}

// 获取优先级文本
const getPriorityText = (priority: string): string => {
  switch (priority) {
    case 'high': return '高优先级'
    case 'medium': return '中优先级'
    case 'low': return '低优先级'
    default: return '未知'
  }
}

// 格式化配置
const formatConfig = (config: any): string => {
  try {
    return JSON.stringify(config, null, 2)
  } catch {
    return String(config)
  }
}

// 预期收益
const benefits = computed(() => {
  const benefitMap: Record<string, string[]> = {
    'code-splitting': [
      '减少初始包大小 20-40%',
      '提升首屏加载速度',
      '改善用户体验'
    ],
    'minification': [
      '减少文件大小 30-50%',
      '降低网络传输时间',
      '节省带宽成本'
    ],
    'sourcemap': [
      '便于生产环境调试',
      '提升开发效率',
      '快速定位问题'
    ],
    'caching': [
      '提升重复访问速度',
      '减少服务器负载',
      '改善用户体验'
    ]
  }
  
  return benefitMap[props.optimization.type] || []
})

// 切换详情显示
const toggleDetails = () => {
  showDetails.value = !showDetails.value
}

// 应用优化
const handleApply = async () => {
  applying.value = true
  try {
    // 模拟应用优化的过程
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    emit('apply', props.optimization)
    ElMessage.success('优化配置已应用')
  } catch (error) {
    console.error('应用优化失败:', error)
    ElMessage.error('应用优化失败')
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.optimization-card {
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
  transition: all 0.3s ease;
  
  &:hover {
    border-color: #409eff;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .optimization-type {
        font-weight: 500;
        color: #303133;
        font-size: 14px;
      }
    }
    
    .header-right {
      display: flex;
      align-items: center;
    }
  }
  
  .optimization-content {
    .description {
      color: #606266;
      line-height: 1.6;
      margin-bottom: 16px;
      font-size: 14px;
    }
    
    .details {
      margin-bottom: 16px;
      
      .config-section,
      .benefits-section {
        margin-bottom: 16px;
        
        h4 {
          margin: 0 0 8px 0;
          color: #303133;
          font-size: 13px;
          font-weight: 500;
        }
      }
      
      .config-preview {
        background: #f5f7fa;
        border: 1px solid #e4e7ed;
        border-radius: 4px;
        padding: 12px;
        
        .config-code {
          margin: 0;
          font-size: 12px;
          color: #606266;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 200px;
          overflow-y: auto;
        }
      }
      
      .benefits-list {
        margin: 0;
        padding: 0;
        list-style: none;
        
        li {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
          color: #606266;
          font-size: 13px;
          
          .el-icon {
            color: #67c23a;
            font-size: 14px;
          }
        }
      }
    }
    
    .actions {
      display: flex;
      justify-content: center;
      
      .toggle-btn {
        color: #409eff;
        font-size: 12px;
        
        .el-icon {
          margin-left: 4px;
          font-size: 12px;
        }
      }
    }
  }
}

/* 优先级标签样式 */
.priority-tag {
  font-weight: 500;
  
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
  
  &.el-tag--info {
    background: #f4f4f5;
    border-color: #e9e9eb;
    color: #909399;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .optimization-card {
    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      
      .header-left,
      .header-right {
        width: 100%;
      }
      
      .header-right {
        display: flex;
        justify-content: flex-end;
      }
    }
    
    .optimization-content {
      .config-preview .config-code {
        font-size: 11px;
      }
    }
  }
}
</style>
