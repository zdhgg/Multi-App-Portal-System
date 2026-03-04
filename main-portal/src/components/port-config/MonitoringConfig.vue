<template>
  <div class="monitoring-config">
    <div class="config-header">
      <h3>端口监控设置</h3>
      <div class="header-actions">
        <el-button @click="testConnection" :loading="testing" :icon="Connection">
          连接测试
        </el-button>
        <el-button type="primary" @click="saveMonitoring" :loading="saving">
          保存设置
        </el-button>
      </div>
    </div>

    <!-- 监控状态概览 -->
    <div class="monitoring-status">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="status-card">
            <div class="status-content">
              <div class="status-icon active">
                <el-icon><View /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-value">{{ monitoredPorts }}</div>
                <div class="status-label">监控端口数</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="status-card">
            <div class="status-content">
              <div class="status-icon warning">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-value">{{ alertCount }}</div>
                <div class="status-label">活跃告警</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="status-card">
            <div class="status-content">
              <div class="status-icon success">
                <el-icon><CircleCheckFilled /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-value">{{ formatUptime(systemUptime) }}</div>
                <div class="status-label">系统运行时间</div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="6">
          <el-card class="status-card">
            <div class="status-content">
              <div class="status-icon info">
                <el-icon><DataAnalysis /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-value">{{ utilizationRate }}%</div>
                <div class="status-label">端口利用率</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div class="config-content">
      <el-row :gutter="24">
        <!-- 基本监控设置 -->
        <el-col :span="12">
          <el-card shadow="hover" class="config-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Monitor /></el-icon>
                <span>基本监控设置</span>
              </div>
            </template>

            <el-form :model="localMonitoring" label-width="140px">
              <el-form-item label="启用实时监控">
                <el-switch
                  v-model="localMonitoring.enableRealTimeMonitoring"
                  active-text="启用"
                  inactive-text="禁用"
                />
                <div class="field-hint">
                  启用后将实时监控端口状态，消耗更多系统资源
                </div>
              </el-form-item>

              <el-form-item label="健康检查间隔">
                <div class="input-with-unit">
                  <el-input-number
                    v-model="healthCheckIntervalSeconds"
                    :min="10"
                    :max="300"
                    :step="10"
                  />
                  <span class="unit">秒</span>
                </div>
                <div class="field-hint">
                  定期检查端口健康状态的时间间隔
                </div>
              </el-form-item>

              <el-form-item label="失效端口检查">
                <div class="input-with-unit">
                  <el-input-number
                    v-model="stalePortCheckIntervalMinutes"
                    :min="1"
                    :max="60"
                    :step="1"
                  />
                  <span class="unit">分钟</span>
                </div>
                <div class="field-hint">
                  检查长时间未响应端口的时间间隔
                </div>
              </el-form-item>

              <el-form-item label="连接超时">
                <div class="input-with-unit">
                  <el-input-number
                    v-model="localMonitoring.connectionTimeoutMs"
                    :min="1000"
                    :max="30000"
                    :step="1000"
                  />
                  <span class="unit">毫秒</span>
                </div>
                <div class="field-hint">
                  端口连接测试的超时时间
                </div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <!-- 告警设置 -->
        <el-col :span="12">
          <el-card shadow="hover" class="config-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Bell /></el-icon>
                <span>告警设置</span>
              </div>
            </template>

            <el-form :model="localMonitoring" label-width="140px">
              <el-form-item label="警告阈值">
                <div class="threshold-setting">
                  <el-slider
                    v-model="localMonitoring.portUtilizationWarningThreshold"
                    :min="50"
                    :max="95"
                    show-tooltip
                    :format-tooltip="(val: number) => `${val}%`"
                  />
                  <span class="threshold-value">{{ localMonitoring.portUtilizationWarningThreshold }}%</span>
                </div>
                <div class="field-hint">
                  端口利用率达到此值时发送警告
                </div>
              </el-form-item>

              <el-form-item label="危险阈值">
                <div class="threshold-setting">
                  <el-slider
                    v-model="localMonitoring.portUtilizationCriticalThreshold"
                    :min="80"
                    :max="100"
                    show-tooltip
                    :format-tooltip="(val: number) => `${val}%`"
                  />
                  <span class="threshold-value">{{ localMonitoring.portUtilizationCriticalThreshold }}%</span>
                </div>
                <div class="field-hint">
                  端口利用率达到此值时发送危险告警
                </div>
              </el-form-item>

              <el-form-item label="告警频率限制">
                <el-select v-model="localMonitoring.alertRateLimit" placeholder="选择频率">
                  <el-option label="无限制" :value="0" />
                  <el-option label="每分钟最多1次" :value="60" />
                  <el-option label="每5分钟最多1次" :value="300" />
                  <el-option label="每15分钟最多1次" :value="900" />
                  <el-option label="每小时最多1次" :value="3600" />
                </el-select>
                <div class="field-hint">
                  限制相同告警的发送频率，避免告警风暴
                </div>
              </el-form-item>

              <el-form-item label="告警通道">
                <el-checkbox-group v-model="localMonitoring.alertChannels">
                  <el-checkbox label="log">日志记录</el-checkbox>
                  <el-checkbox label="email">邮件通知</el-checkbox>
                  <el-checkbox label="webhook">Webhook</el-checkbox>
                  <el-checkbox label="ui">界面提醒</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <!-- 高级监控功能 -->
      <el-row :gutter="24" style="margin-top: 24px;">
        <el-col :span="24">
          <el-card shadow="hover" class="config-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><TrendCharts /></el-icon>
                <span>高级监控功能</span>
              </div>
            </template>

            <div class="advanced-monitoring">
              <el-row :gutter="24">
                <el-col :span="8">
                  <div class="feature-section">
                    <h4>性能监控</h4>
                    <el-form label-width="120px">
                      <el-form-item label="启用性能指标">
                        <el-switch v-model="localMonitoring.enablePerformanceMetrics" />
                      </el-form-item>
                      <el-form-item label="响应时间监控">
                        <el-switch v-model="localMonitoring.trackResponseTime" />
                      </el-form-item>
                      <el-form-item label="吞吐量监控">
                        <el-switch v-model="localMonitoring.trackThroughput" />
                      </el-form-item>
                    </el-form>
                  </div>
                </el-col>

                <el-col :span="8">
                  <div class="feature-section">
                    <h4>数据收集</h4>
                    <el-form label-width="120px">
                      <el-form-item label="历史数据保留">
                        <el-select v-model="localMonitoring.dataRetentionDays">
                          <el-option label="7天" :value="7" />
                          <el-option label="30天" :value="30" />
                          <el-option label="90天" :value="90" />
                          <el-option label="1年" :value="365" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="数据压缩">
                        <el-switch v-model="localMonitoring.enableDataCompression" />
                      </el-form-item>
                      <el-form-item label="导出格式">
                        <el-select v-model="localMonitoring.exportFormat">
                          <el-option label="JSON" value="json" />
                          <el-option label="CSV" value="csv" />
                          <el-option label="Excel" value="xlsx" />
                        </el-select>
                      </el-form-item>
                    </el-form>
                  </div>
                </el-col>

                <el-col :span="8">
                  <div class="feature-section">
                    <h4>集成设置</h4>
                    <el-form label-width="120px">
                      <el-form-item label="Prometheus">
                        <el-switch v-model="localMonitoring.enablePrometheus" />
                      </el-form-item>
                      <el-form-item label="Grafana集成">
                        <el-switch v-model="localMonitoring.enableGrafana" />
                      </el-form-item>
                      <el-form-item label="日志级别">
                        <el-select v-model="localMonitoring.logLevel">
                          <el-option label="ERROR" value="error" />
                          <el-option label="WARN" value="warn" />
                          <el-option label="INFO" value="info" />
                          <el-option label="DEBUG" value="debug" />
                        </el-select>
                      </el-form-item>
                    </el-form>
                  </div>
                </el-col>
              </el-row>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 实时监控面板 -->
      <el-row :gutter="24" style="margin-top: 24px;">
        <el-col :span="24">
          <el-card shadow="hover" class="config-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><TrendCharts /></el-icon>
                <span>实时监控面板</span>
                <el-button 
                  size="small" 
                  @click="toggleLiveMonitoring" 
                  :type="liveMonitoring ? 'danger' : 'primary'"
                >
                  {{ liveMonitoring ? '停止监控' : '开始监控' }}
                </el-button>
              </div>
            </template>

            <div class="live-monitoring-panel" v-if="liveMonitoring">
              <!-- 端口状态图表 -->
              <div class="monitoring-charts">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <div class="chart-container">
                      <h4>端口利用率趋势</h4>
                      <div class="chart-placeholder">
                        <!-- 这里可以集成Chart.js或ECharts -->
                        <div class="chart-mock">
                          <div class="chart-line" style="animation: pulse 2s infinite;">
                            📈 实时图表数据
                          </div>
                        </div>
                      </div>
                    </div>
                  </el-col>
                  
                  <el-col :span="12">
                    <div class="chart-container">
                      <h4>响应时间分布</h4>
                      <div class="chart-placeholder">
                        <div class="chart-mock">
                          <div class="chart-bar" style="animation: slideUp 1.5s infinite;">
                            📊 响应时间统计
                          </div>
                        </div>
                      </div>
                    </div>
                  </el-col>
                </el-row>
              </div>

              <!-- 实时日志 -->
              <div class="live-logs">
                <h4>实时监控日志</h4>
                <div class="log-container">
                  <div 
                    v-for="log in recentLogs"
                    :key="log.id"
                    :class="['log-entry', log.level]"
                  >
                    <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
                    <span class="log-level">{{ log.level.toUpperCase() }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="monitoring-placeholder">
              <el-empty description="点击开始监控按钮启动实时监控" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Monitor, Bell, Connection, TrendCharts,
  View, Warning, CircleCheckFilled, DataAnalysis
} from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'

const portConfigStore = usePortConfigStore()

const emit = defineEmits<{
  update: [monitoring: any]
}>()

// 响应式数据
const saving = ref(false)
const testing = ref(false)
const liveMonitoring = ref(false)
const monitoringInterval = ref<NodeJS.Timeout | null>(null)

const localMonitoring = reactive({
  healthCheckIntervalMs: 60000,
  stalePortCheckIntervalMs: 300000,
  portUtilizationWarningThreshold: 80,
  portUtilizationCriticalThreshold: 95,
  enableRealTimeMonitoring: true,
  connectionTimeoutMs: 5000,
  alertRateLimit: 300,
  alertChannels: ['log', 'ui'],
  enablePerformanceMetrics: true,
  trackResponseTime: true,
  trackThroughput: false,
  dataRetentionDays: 30,
  enableDataCompression: true,
  exportFormat: 'json',
  enablePrometheus: false,
  enableGrafana: false,
  logLevel: 'info'
})

// 监控状态数据
const monitoredPorts = ref(25)
const alertCount = ref(2)
const systemUptime = ref(123456789) // 毫秒
const utilizationRate = ref(67)

const recentLogs = ref([
  { id: 1, timestamp: Date.now() - 5000, level: 'info', message: '端口3001健康检查通过' },
  { id: 2, timestamp: Date.now() - 8000, level: 'warn', message: '端口4005响应时间超过阈值' },
  { id: 3, timestamp: Date.now() - 12000, level: 'error', message: '端口3020连接超时' },
  { id: 4, timestamp: Date.now() - 15000, level: 'info', message: '端口分配策略已更新' }
])

// 计算属性
const healthCheckIntervalSeconds = computed({
  get: () => Math.floor(localMonitoring.healthCheckIntervalMs / 1000),
  set: (value) => { localMonitoring.healthCheckIntervalMs = value * 1000 }
})

const stalePortCheckIntervalMinutes = computed({
  get: () => Math.floor(localMonitoring.stalePortCheckIntervalMs / 60000),
  set: (value) => { localMonitoring.stalePortCheckIntervalMs = value * 60000 }
})

// 初始化
onMounted(() => {
  const config = portConfigStore.portConfig
  if (config?.monitoring) {
    Object.assign(localMonitoring, config.monitoring)
  }
})

onUnmounted(() => {
  if (monitoringInterval.value) {
    clearInterval(monitoringInterval.value)
  }
})

// 工具函数
const formatUptime = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}天${hours % 24}小时`
  if (hours > 0) return `${hours}小时${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}

const formatLogTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 事件处理函数
const saveMonitoring = async () => {
  saving.value = true
  try {
    emit('update', { ...localMonitoring })
    ElMessage.success('监控设置保存成功')
  } catch (error) {
    ElMessage.error('保存监控设置失败')
  } finally {
    saving.value = false
  }
}

const testConnection = async () => {
  testing.value = true
  try {
    // 模拟连接测试
    await new Promise(resolve => setTimeout(resolve, 1500))
    ElMessage.success('监控系统连接测试成功')
  } catch (error) {
    ElMessage.error('监控系统连接测试失败')
  } finally {
    testing.value = false
  }
}

const toggleLiveMonitoring = () => {
  if (liveMonitoring.value) {
    // 停止监控
    if (monitoringInterval.value) {
      clearInterval(monitoringInterval.value)
      monitoringInterval.value = null
    }
    liveMonitoring.value = false
    ElMessage.info('实时监控已停止')
  } else {
    // 开始监控
    liveMonitoring.value = true
    monitoringInterval.value = setInterval(() => {
      // 模拟实时数据更新
      utilizationRate.value = Math.floor(Math.random() * 30) + 50
      
      // 添加新的日志条目
      const logLevels = ['info', 'warn', 'error']
      const messages = [
        '端口健康检查完成',
        '发现新的端口分配',
        '端口连接异常',
        '系统性能正常',
        '告警阈值检查'
      ]
      
      recentLogs.value.unshift({
        id: Date.now(),
        timestamp: Date.now(),
        level: logLevels[Math.floor(Math.random() * logLevels.length)],
        message: messages[Math.floor(Math.random() * messages.length)]
      })
      
      // 保持日志数量在10条以内
      if (recentLogs.value.length > 10) {
        recentLogs.value = recentLogs.value.slice(0, 10)
      }
    }, 3000)
    
    ElMessage.success('实时监控已启动')
  }
}
</script>

<style scoped>
.monitoring-config {
  padding: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.config-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.monitoring-status {
  margin-bottom: 24px;
}

.status-card {
  height: 100%;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
}

.status-icon.active {
  background: linear-gradient(45deg, #3b82f6, #1d4ed8);
}

.status-icon.warning {
  background: linear-gradient(45deg, #f59e0b, #d97706);
}

.status-icon.success {
  background: linear-gradient(45deg, #10b981, #059669);
}

.status-icon.info {
  background: linear-gradient(45deg, #8b5cf6, #7c3aed);
}

.status-info {
  flex: 1;
}

.status-value {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 4px;
}

.status-label {
  font-size: 14px;
  color: #6b7280;
}

.config-card {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  line-height: 1.4;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.unit {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.threshold-setting {
  display: flex;
  align-items: center;
  gap: 16px;
}

.threshold-value {
  font-weight: 600;
  color: #1f2937;
  min-width: 40px;
}

.advanced-monitoring {
  padding: 16px;
}

.feature-section h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.live-monitoring-panel {
  padding: 16px;
}

.monitoring-charts {
  margin-bottom: 24px;
}

.chart-container h4 {
  margin: 0 0 12px 0;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.chart-placeholder {
  height: 200px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-mock {
  font-size: 16px;
  color: #6b7280;
  text-align: center;
}

.live-logs h4 {
  margin: 0 0 12px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
  background: #1f2937;
  border-radius: 8px;
  padding: 12px;
  font-family: 'Courier New', monospace;
}

.log-entry {
  display: flex;
  gap: 12px;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.log-time {
  color: #9ca3af;
  min-width: 80px;
}

.log-level {
  min-width: 50px;
  font-weight: 600;
}

.log-entry.info .log-level {
  color: #60a5fa;
}

.log-entry.warn .log-level {
  color: #fbbf24;
}

.log-entry.error .log-level {
  color: #f87171;
}

.log-message {
  color: #e5e7eb;
  flex: 1;
}

.monitoring-placeholder {
  padding: 40px;
  text-align: center;
}

/* 动画效果 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes slideUp {
  0% { transform: translateY(10px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .threshold-setting {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>