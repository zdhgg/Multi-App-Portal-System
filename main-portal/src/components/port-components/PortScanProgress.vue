<template>
  <div class="port-scan-progress">
    <el-card class="progress-card">
      <template #header>
        <div class="progress-header">
          <div class="header-left">
            <el-icon class="scan-icon" :class="{ spinning: !progress.percentage || progress.percentage < 100 }">
              <Search />
            </el-icon>
            <div class="header-text">
              <h4>端口扫描进行中</h4>
              <p class="scan-range">扫描范围: {{ progress.currentRange }}</p>
            </div>
          </div>
          <div class="header-right">
            <el-button 
              v-if="canCancel"
              type="danger" 
              size="small" 
              @click="$emit('cancel')"
              :icon="Close"
            >
              取消扫描
            </el-button>
          </div>
        </div>
      </template>

      <!-- 主进度条 -->
      <div class="main-progress">
        <div class="progress-info">
          <span class="progress-text">
            {{ progress.current }} / {{ progress.total }} 端口
          </span>
          <span class="progress-percentage">
            {{ Math.round(progress.percentage) }}%
          </span>
        </div>
        
        <el-progress 
          :percentage="progress.percentage"
          :stroke-width="8"
          :show-text="false"
          :color="progressColor"
          class="main-progress-bar"
        />
      </div>

      <!-- 详细信息 -->
      <div class="progress-details">
        <div class="detail-row">
          <div class="detail-item">
            <el-icon><Timer /></el-icon>
            <span>预计剩余: {{ formatTime(progress.estimatedTimeRemaining) }}</span>
          </div>
          <div class="detail-item">
            <el-icon><TrendCharts /></el-icon>
            <span>扫描速度: {{ scanSpeed }} 端口/秒</span>
          </div>
        </div>
        
        <!-- 实时统计 -->
        <div class="real-time-stats">
          <div class="stat-item">
            <span class="stat-label">已发现</span>
            <span class="stat-value active">{{ realtimeStats.found }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">活跃</span>
            <span class="stat-value listening">{{ realtimeStats.listening }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">冲突</span>
            <span class="stat-value conflict">{{ realtimeStats.conflicts }}</span>
          </div>
        </div>
      </div>

      <!-- 阶段指示器 -->
      <div class="stage-indicators">
        <div 
          v-for="stage in scanStages" 
          :key="stage.name"
          class="stage-item"
          :class="{ 
            active: stage.name === currentStage,
            completed: stage.completed 
          }"
        >
          <div class="stage-icon">
            <el-icon v-if="stage.completed"><Check /></el-icon>
            <el-icon v-else-if="stage.name === currentStage" class="spinning"><Loading /></el-icon>
            <el-icon v-else><Clock /></el-icon>
          </div>
          <span class="stage-name">{{ stage.label }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Search, Close, Timer, TrendCharts, Check, Loading, Clock } from '@element-plus/icons-vue'

interface ScanProgress {
  current: number
  total: number
  percentage: number
  estimatedTimeRemaining: number
  currentRange: string
}

interface Props {
  progress: ScanProgress
  canCancel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canCancel: true
})

const emit = defineEmits<{
  cancel: []
}>()

// 实时统计（模拟）
const realtimeStats = ref({
  found: 0,
  listening: 0,
  conflicts: 0
})

// 扫描阶段
const scanStages = ref([
  { name: 'init', label: '初始化', completed: true },
  { name: 'scan', label: '端口扫描', completed: false },
  { name: 'analyze', label: '结果分析', completed: false },
  { name: 'complete', label: '完成', completed: false }
])

// 当前阶段
const currentStage = computed(() => {
  if (props.progress.percentage < 10) return 'init'
  if (props.progress.percentage < 90) return 'scan'
  if (props.progress.percentage < 100) return 'analyze'
  return 'complete'
})

// 进度条颜色
const progressColor = computed(() => {
  const percentage = props.progress.percentage
  if (percentage < 30) return '#409eff'
  if (percentage < 70) return '#e6a23c'
  return '#67c23a'
})

// 扫描速度计算
const scanSpeed = computed(() => {
  if (props.progress.current === 0) return '0'
  const elapsed = (props.progress.total - props.progress.estimatedTimeRemaining) || 1
  const speed = props.progress.current / elapsed
  return speed.toFixed(1)
})

// 时间格式化
const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  return `${Math.round(seconds / 3600)}小时`
}

// 监听进度变化，更新阶段状态
watch(() => props.progress.percentage, (newPercentage) => {
  scanStages.value.forEach(stage => {
    if (stage.name === 'init') stage.completed = true
    if (stage.name === 'scan') stage.completed = newPercentage >= 90
    if (stage.name === 'analyze') stage.completed = newPercentage >= 100
    if (stage.name === 'complete') stage.completed = newPercentage >= 100
  })
  
  // 模拟实时统计更新
  realtimeStats.value.found = Math.round(props.progress.current * 0.1)
  realtimeStats.value.listening = Math.round(props.progress.current * 0.05)
  realtimeStats.value.conflicts = Math.round(props.progress.current * 0.01)
})
</script>

<style scoped>
.port-scan-progress {
  margin: 16px 0;
}

.progress-card {
  border: 1px solid #e4e7ed;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-icon {
  font-size: 24px;
  color: #409eff;
}

.scan-icon.spinning {
  animation: spin 2s linear infinite;
}

.header-text h4 {
  margin: 0 0 4px 0;
  color: #303133;
  font-size: 16px;
}

.scan-range {
  margin: 0;
  color: #909399;
  font-size: 12px;
}

.main-progress {
  margin: 16px 0;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-text {
  color: #606266;
  font-size: 14px;
}

.progress-percentage {
  color: #409eff;
  font-weight: 600;
  font-size: 16px;
}

.main-progress-bar {
  margin-bottom: 16px;
}

.progress-details {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  font-size: 13px;
}

.real-time-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  color: #909399;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
}

.stat-value.active { color: #67c23a; }
.stat-value.listening { color: #409eff; }
.stat-value.conflict { color: #f56c6c; }

.stage-indicators {
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  position: relative;
}

.stage-indicators::before {
  content: '';
  position: absolute;
  top: 16px;
  left: 20px;
  right: 20px;
  height: 2px;
  background: #e4e7ed;
  z-index: 1;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 2;
}

.stage-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f5f7fa;
  border: 2px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.stage-item.active .stage-icon {
  background: #409eff;
  border-color: #409eff;
  color: white;
}

.stage-item.completed .stage-icon {
  background: #67c23a;
  border-color: #67c23a;
  color: white;
}

.stage-name {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.stage-item.active .stage-name {
  color: #409eff;
  font-weight: 600;
}

.stage-item.completed .stage-name {
  color: #67c23a;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .progress-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .detail-row {
    flex-direction: column;
    gap: 8px;
  }
  
  .real-time-stats {
    justify-content: space-around;
  }
  
  .stage-indicators {
    padding: 0 10px;
  }
  
  .stage-name {
    font-size: 10px;
  }
}
</style>
