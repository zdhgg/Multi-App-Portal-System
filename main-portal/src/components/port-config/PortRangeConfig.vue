<template>
  <div class="port-range-config">
    <div class="config-header">
      <h3>端口范围配置</h3>
      <el-button 
        type="primary" 
        @click="saveRanges" 
        :loading="saving"
        :disabled="!hasChanges"
      >
        保存配置
      </el-button>
    </div>

    <div class="config-content">
      <el-row :gutter="24">
        <!-- 前端端口范围 -->
        <el-col :span="12">
          <el-card shadow="hover" class="range-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Connection /></el-icon>
                <span>前端端口范围</span>
              </div>
            </template>
            
            <el-form :model="localConfig.frontend" label-width="100px">
              <el-form-item label="起始端口">
                <el-input-number 
                  v-model="localConfig.frontend.start"
                  :min="1024"
                  :max="65535"
                  :step="1"
                  @change="validateRanges"
                  placeholder="起始端口"
                />
                <div class="field-hint">推荐范围: 3001-3999</div>
              </el-form-item>
              
              <el-form-item label="结束端口">
                <el-input-number 
                  v-model="localConfig.frontend.end"
                  :min="1024"
                  :max="65535"
                  :step="1"
                  @change="validateRanges"
                  placeholder="结束端口"
                />
                <div class="field-hint">确保与起始端口间距至少10个端口</div>
              </el-form-item>
              
              <el-form-item label="描述">
                <el-input 
                  v-model="localConfig.frontend.description"
                  placeholder="前端端口范围描述"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
              
              <div class="range-info">
                <div class="info-item">
                  <span class="label">可用端口数:</span>
                  <span class="value">{{ frontendPortCount }}</span>
                </div>
                <div class="info-item">
                  <span class="label">范围状态:</span>
                  <el-tag :type="frontendRangeStatus.type" size="small">
                    {{ frontendRangeStatus.text }}
                  </el-tag>
                </div>
              </div>
            </el-form>
          </el-card>
        </el-col>

        <!-- 后端端口范围 -->
        <el-col :span="12">
          <el-card shadow="hover" class="range-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Monitor /></el-icon>
                <span>后端端口范围</span>
              </div>
            </template>
            
            <el-form :model="localConfig.backend" label-width="100px">
              <el-form-item label="起始端口">
                <el-input-number 
                  v-model="localConfig.backend.start"
                  :min="1024"
                  :max="65535"
                  :step="1"
                  @change="validateRanges"
                  placeholder="起始端口"
                />
                <div class="field-hint">推荐范围: 8001-8999</div>
              </el-form-item>
              
              <el-form-item label="结束端口">
                <el-input-number 
                  v-model="localConfig.backend.end"
                  :min="1024"
                  :max="65535"
                  :step="1"
                  @change="validateRanges"
                  placeholder="结束端口"
                />
                <div class="field-hint">确保与起始端口间距至少10个端口</div>
              </el-form-item>
              
              <el-form-item label="描述">
                <el-input 
                  v-model="localConfig.backend.description"
                  placeholder="后端端口范围描述"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
              
              <div class="range-info">
                <div class="info-item">
                  <span class="label">可用端口数:</span>
                  <span class="value">{{ backendPortCount }}</span>
                </div>
                <div class="info-item">
                  <span class="label">范围状态:</span>
                  <el-tag :type="backendRangeStatus.type" size="small">
                    {{ backendRangeStatus.text }}
                  </el-tag>
                </div>
              </div>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <!-- 验证错误显示 -->
      <div v-if="validationErrors.length > 0" class="validation-errors">
        <el-alert
          v-for="error in validationErrors"
          :key="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
        />
      </div>

      <!-- 范围重叠警告 -->
      <div v-if="hasOverlap" class="overlap-warning">
        <el-alert
          title="端口范围重叠警告"
          description="前端和后端端口范围存在重叠，这可能导致端口冲突。建议调整端口范围避免重叠。"
          type="warning"
          show-icon
          :closable="false"
        />
      </div>

      <!-- 端口分布图表 -->
      <div class="port-visualization">
        <h4>端口分布可视化</h4>
        <div class="port-timeline">
          <div class="timeline-axis">
            <div 
              v-for="range in portRanges"
              :key="range.name"
              :class="['timeline-segment', range.type]"
              :style="{ 
                left: `${(range.start - 1024) / (65535 - 1024) * 100}%`,
                width: `${(range.end - range.start) / (65535 - 1024) * 100}%`
              }"
            >
              <div class="segment-label">
                {{ range.name }}
                <br>
                <small>{{ range.start }}-{{ range.end }}</small>
              </div>
            </div>
          </div>
          <div class="axis-labels">
            <span>1024</span>
            <span>32768</span>
            <span>65535</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, Monitor } from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'

const portConfigStore = usePortConfigStore()

const emit = defineEmits<{
  update: [update: {
    frontendRange?: { start: number; end: number }
    backendRange?: { start: number; end: number }
  }]
}>()

// 本地配置状态
const localConfig = ref({
  frontend: {
    start: 3001,
    end: 3100,
    description: '前端应用端口范围'
  },
  backend: {
    start: 8001,
    end: 8100,
    description: '后端应用端口范围'
  }
})

const saving = ref(false)
const validationErrors = ref<string[]>([])

// 初始化配置
onMounted(() => {
  const config = portConfigStore.portConfig
  if (config) {
    localConfig.value.frontend = { ...config.frontendRange }
    localConfig.value.backend = { ...config.backendRange }
  }
})

// 监听store中的配置变化
watch(() => portConfigStore.portConfig, (config) => {
  if (config) {
    localConfig.value.frontend = { ...config.frontendRange }
    localConfig.value.backend = { ...config.backendRange }
  }
}, { immediate: true })

// 计算属性
const frontendPortCount = computed(() => {
  const { start, end } = localConfig.value.frontend
  return Math.max(0, end - start + 1)
})

const backendPortCount = computed(() => {
  const { start, end } = localConfig.value.backend
  return Math.max(0, end - start + 1)
})

const hasChanges = computed(() => {
  const config = portConfigStore.portConfig
  if (!config) return false
  
  return (
    localConfig.value.frontend.start !== config.frontendRange.start ||
    localConfig.value.frontend.end !== config.frontendRange.end ||
    localConfig.value.frontend.description !== config.frontendRange.description ||
    localConfig.value.backend.start !== config.backendRange.start ||
    localConfig.value.backend.end !== config.backendRange.end ||
    localConfig.value.backend.description !== config.backendRange.description
  )
})

const hasOverlap = computed(() => {
  const { frontend, backend } = localConfig.value
  return !(frontend.end < backend.start || backend.end < frontend.start)
})

const frontendRangeStatus = computed(() => {
  const count = frontendPortCount.value
  if (count < 10) return { type: 'danger', text: '端口数量不足' }
  if (count < 50) return { type: 'warning', text: '端口数量较少' }
  return { type: 'success', text: '端口数量充足' }
})

const backendRangeStatus = computed(() => {
  const count = backendPortCount.value
  if (count < 10) return { type: 'danger', text: '端口数量不足' }
  if (count < 50) return { type: 'warning', text: '端口数量较少' }
  return { type: 'success', text: '端口数量充足' }
})

const portRanges = computed(() => [
  {
    name: '前端',
    type: 'frontend',
    start: localConfig.value.frontend.start,
    end: localConfig.value.frontend.end
  },
  {
    name: '后端',
    type: 'backend',
    start: localConfig.value.backend.start,
    end: localConfig.value.backend.end
  }
])

// 验证端口范围
const validateRanges = () => {
  const errors: string[] = []
  const { frontend, backend } = localConfig.value

  // 验证前端范围
  if (frontend.start >= frontend.end) {
    errors.push('前端起始端口必须小于结束端口')
  }
  if (frontend.start < 1024) {
    errors.push('前端起始端口不能小于1024')
  }
  if (frontend.end > 65535) {
    errors.push('前端结束端口不能大于65535')
  }
  if (frontend.end - frontend.start < 9) {
    errors.push('前端端口范围至少需要10个端口')
  }

  // 验证后端范围
  if (backend.start >= backend.end) {
    errors.push('后端起始端口必须小于结束端口')
  }
  if (backend.start < 1024) {
    errors.push('后端起始端口不能小于1024')
  }
  if (backend.end > 65535) {
    errors.push('后端结束端口不能大于65535')
  }
  if (backend.end - backend.start < 9) {
    errors.push('后端端口范围至少需要10个端口')
  }

  validationErrors.value = errors
  return errors.length === 0
}

// 保存端口范围配置
const saveRanges = async () => {
  if (!validateRanges()) {
    ElMessage.error('配置验证失败，请检查输入')
    return
  }

  saving.value = true
  try {
    const update = {
      frontendRange: {
        start: localConfig.value.frontend.start,
        end: localConfig.value.frontend.end
      },
      backendRange: {
        start: localConfig.value.backend.start,
        end: localConfig.value.backend.end
      }
    }

    emit('update', update)
  } catch (error) {
    console.error('保存端口范围失败:', error)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.port-range-config {
  padding: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.config-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
}

.range-card {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1f2937;
}

.header-icon {
  color: #3b82f6;
  font-size: 18px;
}

.field-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.range-info {
  margin-top: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item .label {
  font-size: 14px;
  color: #6b7280;
}

.info-item .value {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.validation-errors {
  margin: 24px 0;
}

.validation-errors .el-alert {
  margin-bottom: 8px;
}

.overlap-warning {
  margin: 24px 0;
}

.port-visualization {
  margin-top: 32px;
  padding: 20px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.port-visualization h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.port-timeline {
  position: relative;
  height: 60px;
  background: linear-gradient(90deg, #fee2e2, #fef3c7, #dcfce7);
  border-radius: 4px;
  margin-bottom: 12px;
}

.timeline-axis {
  position: relative;
  height: 100%;
}

.timeline-segment {
  position: absolute;
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  opacity: 0.9;
}

.timeline-segment.frontend {
  background: linear-gradient(45deg, #3b82f6, #1d4ed8);
  border: 2px solid #1e40af;
}

.timeline-segment.backend {
  background: linear-gradient(45deg, #10b981, #059669);
  border: 2px solid #047857;
}

.segment-label {
  line-height: 1.2;
}

.axis-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .port-timeline {
    height: 40px;
  }
  
  .timeline-segment {
    font-size: 10px;
  }
}
</style>
