<template>
  <div class="historical-analysis">
    <el-card>
      <template #header>
        <div class="analysis-header">
          <h3>历史数据对比分析</h3>
          <div class="header-actions">
            <el-button 
              type="primary" 
              :icon="DataLine"
              @click="startAnalysis"
              :loading="analyzing"
              size="small"
            >
              {{ analyzing ? '分析中...' : '开始分析' }}
            </el-button>
            <el-button 
              type="success" 
              :icon="Download"
              @click="exportAnalysis"
              :disabled="!analysisResult"
              size="small"
            >
              导出分析
            </el-button>
          </div>
        </div>
      </template>

      <!-- 分析配置 -->
      <div class="analysis-config">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-card shadow="never">
              <template #header>
                <span class="config-title">时间范围设置</span>
              </template>
              <el-form :model="config" label-width="80px" size="small">
                <el-form-item label="对比类型">
                  <el-select v-model="config.compareType" @change="handleCompareTypeChange">
                    <el-option label="同期对比" value="same-period">
                      <template #default>
                        <div>
                          <div>同期对比</div>
                          <div style="font-size: 12px; color: #999;">昨天vs今天，上周vs本周</div>
                        </div>
                      </template>
                    </el-option>
                    <el-option label="时段对比" value="time-segment">
                      <template #default>
                        <div>
                          <div>时段对比</div>
                          <div style="font-size: 12px; color: #999;">不同时段的性能对比</div>
                        </div>
                      </template>
                    </el-option>
                    <el-option label="自定义对比" value="custom">
                      <template #default>
                        <div>
                          <div>自定义对比</div>
                          <div style="font-size: 12px; color: #999;">选择任意时间段对比</div>
                        </div>
                      </template>
                    </el-option>
                  </el-select>
                </el-form-item>

                <!-- 同期对比配置 -->
                <div v-if="config.compareType === 'same-period'">
                  <el-form-item label="对比周期">
                    <el-select v-model="config.samePeriod.type">
                      <el-option label="日对比" value="day" />
                      <el-option label="周对比" value="week" />
                      <el-option label="月对比" value="month" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="基准时间">
                    <el-date-picker
                      v-model="config.samePeriod.baseDate"
                      type="date"
                      placeholder="选择基准日期"
                      style="width: 100%"
                    />
                  </el-form-item>
                </div>

                <!-- 时段对比配置 -->
                <div v-if="config.compareType === 'time-segment'">
                  <el-form-item label="时段1">
                    <el-time-picker
                      v-model="config.timeSegment.segment1"
                      is-range
                      range-separator="-"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      style="width: 100%"
                    />
                  </el-form-item>
                  <el-form-item label="时段2">
                    <el-time-picker
                      v-model="config.timeSegment.segment2"
                      is-range
                      range-separator="-"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      style="width: 100%"
                    />
                  </el-form-item>
                  <el-form-item label="分析日期">
                    <el-date-picker
                      v-model="config.timeSegment.date"
                      type="date"
                      placeholder="选择分析日期"
                      style="width: 100%"
                    />
                  </el-form-item>
                </div>

                <!-- 自定义对比配置 -->
                <div v-if="config.compareType === 'custom'">
                  <el-form-item label="时间段1">
                    <el-date-picker
                      v-model="config.custom.period1"
                      type="datetimerange"
                      range-separator="-"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      style="width: 100%"
                    />
                  </el-form-item>
                  <el-form-item label="时间段2">
                    <el-date-picker
                      v-model="config.custom.period2"
                      type="datetimerange"
                      range-separator="-"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      style="width: 100%"
                    />
                  </el-form-item>
                </div>
              </el-form>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card shadow="never">
              <template #header>
                <span class="config-title">端口和指标选择</span>
              </template>
              <el-form :model="config" label-width="80px" size="small">
                <el-form-item label="监控端口">
                  <el-select 
                    v-model="config.selectedPorts" 
                    multiple 
                    placeholder="选择要分析的端口"
                    style="width: 100%"
                    :max-collapse-tags="3"
                  >
                    <el-option
                      v-for="port in availablePorts"
                      :key="port"
                      :label="`端口 ${port}`"
                      :value="port"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="分析指标">
                  <el-checkbox-group v-model="config.selectedMetrics">
                    <el-checkbox label="responseTime">响应时间</el-checkbox>
                    <el-checkbox label="availability">可用性</el-checkbox>
                    <el-checkbox label="errorRate">错误率</el-checkbox>
                    <el-checkbox label="throughput">吞吐量</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item label="统计方法">
                  <el-select v-model="config.aggregation">
                    <el-option label="平均值" value="avg" />
                    <el-option label="最大值" value="max" />
                    <el-option label="最小值" value="min" />
                    <el-option label="95百分位" value="p95" />
                    <el-option label="99百分位" value="p99" />
                  </el-select>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card shadow="never">
              <template #header>
                <span class="config-title">分析设置</span>
              </template>
              <el-form :model="config" label-width="80px" size="small">
                <el-form-item label="基线检测">
                  <el-switch v-model="config.enableBaseline" />
                  <div class="form-help">自动识别性能基线</div>
                </el-form-item>
                <el-form-item label="异常检测">
                  <el-switch v-model="config.enableAnomalyDetection" />
                  <div class="form-help">检测异常数据点</div>
                </el-form-item>
                <el-form-item label="趋势分析">
                  <el-switch v-model="config.enableTrendAnalysis" />
                  <div class="form-help">分析变化趋势</div>
                </el-form-item>
                <el-form-item label="置信区间">
                  <el-select v-model="config.confidenceLevel">
                    <el-option label="90%" value="0.9" />
                    <el-option label="95%" value="0.95" />
                    <el-option label="99%" value="0.99" />
                  </el-select>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- 分析结果 -->
      <div v-if="analysisResult" class="analysis-results">
        <!-- 结果概览 -->
        <el-card style="margin: 20px 0;">
          <template #header>
            <div class="result-header">
              <span>分析概览</span>
              <el-tag :type="getOverallTrendType(analysisResult.overallTrend)">
                {{ getOverallTrendText(analysisResult.overallTrend) }}
              </el-tag>
            </div>
          </template>
          
          <el-row :gutter="16">
            <el-col :span="6" v-for="summary in analysisResult.summary" :key="summary.metric">
              <div class="summary-card">
                <div class="summary-metric">{{ getMetricName(summary.metric) }}</div>
                <div class="summary-change" :class="getChangeClass(summary.change)">
                  <el-icon><TrendCharts /></el-icon>
                  {{ formatChange(summary.change) }}
                </div>
                <div class="summary-values">
                  <span class="period1">{{ summary.period1Value }}</span>
                  <el-icon><Right /></el-icon>
                  <span class="period2">{{ summary.period2Value }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 对比图表 -->
        <el-card style="margin: 20px 0;">
          <template #header>
            <div class="chart-header">
              <span>对比分析图表</span>
              <el-radio-group v-model="chartViewMode" size="small">
                <el-radio-button label="overlay">重叠显示</el-radio-button>
                <el-radio-button label="side-by-side">并排显示</el-radio-button>
                <el-radio-button label="difference">差值显示</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          
          <div class="comparison-charts">
            <div v-for="metric in config.selectedMetrics" :key="metric" class="metric-chart">
              <PerformanceChart
                :title="getMetricName(metric)"
                type="line"
                :metric-type="metric"
                :data="getChartData(metric)"
                height="300px"
                :show-controls="false"
                :colors="getComparisonColors()"
                :animation-enabled="true"
              />
            </div>
          </div>
        </el-card>

        <!-- 详细分析报告 -->
        <el-card style="margin: 20px 0;">
          <template #header>
            <span>详细分析报告</span>
          </template>
          
          <el-collapse>
            <el-collapse-item title="统计分析" name="statistics">
              <el-table :data="analysisResult.statistics" style="width: 100%">
                <el-table-column prop="metric" label="指标" width="100">
                  <template #default="{ row }">
                    {{ getMetricName(row.metric) }}
                  </template>
                </el-table-column>
                <el-table-column prop="period1" label="时期1">
                  <template #default="{ row }">
                    <div class="stats-cell">
                      <div>平均: {{ row.period1.avg }}</div>
                      <div>最大: {{ row.period1.max }}</div>
                      <div>最小: {{ row.period1.min }}</div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="period2" label="时期2">
                  <template #default="{ row }">
                    <div class="stats-cell">
                      <div>平均: {{ row.period2.avg }}</div>
                      <div>最大: {{ row.period2.max }}</div>
                      <div>最小: {{ row.period2.min }}</div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="significance" label="显著性">
                  <template #default="{ row }">
                    <el-tag 
                      :type="row.significance.pValue < 0.05 ? 'danger' : 'success'"
                      size="small"
                    >
                      {{ row.significance.pValue < 0.05 ? '显著差异' : '无显著差异' }}
                    </el-tag>
                    <div style="font-size: 12px; color: #999; margin-top: 4px;">
                      p-value: {{ row.significance.pValue.toFixed(4) }}
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>

            <el-collapse-item title="异常检测结果" name="anomalies" v-if="config.enableAnomalyDetection">
              <div v-if="analysisResult.anomalies && analysisResult.anomalies.length > 0">
                <div v-for="anomaly in analysisResult.anomalies" :key="anomaly.id" class="anomaly-item">
                  <div class="anomaly-header">
                    <el-tag :type="getSeverityType(anomaly.severity)" size="small">
                      {{ getSeverityText(anomaly.severity) }}
                    </el-tag>
                    <span class="anomaly-time">{{ anomaly.timestamp.toLocaleString() }}</span>
                  </div>
                  <div class="anomaly-description">
                    {{ anomaly.description }}
                  </div>
                  <div class="anomaly-details">
                    <span>指标: {{ getMetricName(anomaly.metric) }}</span>
                    <span>异常值: {{ anomaly.value }}</span>
                    <span>期望值: {{ anomaly.expected }}</span>
                    <span>偏差: {{ anomaly.deviation }}σ</span>
                  </div>
                </div>
              </div>
              <el-empty v-else description="未检测到异常数据点" />
            </el-collapse-item>

            <el-collapse-item title="趋势分析" name="trends" v-if="config.enableTrendAnalysis">
              <div class="trend-analysis">
                <div v-for="trend in analysisResult.trends" :key="trend.metric" class="trend-item">
                  <div class="trend-header">
                    <h4>{{ getMetricName(trend.metric) }}</h4>
                    <el-tag :type="getTrendType(trend.direction)">
                      {{ getTrendText(trend.direction) }}
                    </el-tag>
                  </div>
                  <div class="trend-details">
                    <div>变化幅度: {{ trend.magnitude }}%</div>
                    <div>置信度: {{ (trend.confidence * 100).toFixed(1) }}%</div>
                    <div>R²: {{ trend.rSquared.toFixed(3) }}</div>
                  </div>
                  <div class="trend-description">
                    {{ trend.description }}
                  </div>
                </div>
              </div>
            </el-collapse-item>

            <el-collapse-item title="建议和见解" name="insights">
              <div class="insights-list">
                <div v-for="insight in analysisResult.insights" :key="insight.id" class="insight-item">
                  <div class="insight-icon">
                    <el-icon size="20"><InfoFilled /></el-icon>
                  </div>
                  <div class="insight-content">
                    <h5>{{ insight.title }}</h5>
                    <p>{{ insight.description }}</p>
                    <div v-if="insight.recommendations && insight.recommendations.length > 0" class="recommendations">
                      <strong>建议操作：</strong>
                      <ul>
                        <li v-for="rec in insight.recommendations" :key="rec">
                          {{ rec }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </div>

      <!-- 分析进度 -->
      <div v-if="analyzing" class="analysis-progress">
        <el-card>
          <div class="progress-content">
            <el-progress :percentage="analysisProgress" :status="analysisStatus" />
            <div class="progress-text">{{ analysisProgressText }}</div>
          </div>
        </el-card>
      </div>

      <!-- 空状态 -->
      <div v-if="!analysisResult && !analyzing" class="empty-state">
        <el-empty description="配置分析参数后点击【开始分析】来生成历史数据对比报告" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataLine,
  Download,
  TrendCharts,
  Right, 
  InfoFilled
} from '@element-plus/icons-vue'
import PerformanceChart from '../charts/PerformanceChart.vue'
import type { PerformanceMetric } from '@/services/portPerformanceApi'
import type { MetricType } from '../charts/PerformanceChart.vue'

type HistoricalMetric = Extract<MetricType, 'responseTime' | 'availability' | 'errorRate' | 'throughput'>

// 分析配置接口
interface AnalysisConfig {
  compareType: 'same-period' | 'time-segment' | 'custom'
  selectedPorts: number[]
  selectedMetrics: HistoricalMetric[]
  aggregation: 'avg' | 'max' | 'min' | 'p95' | 'p99'
  enableBaseline: boolean
  enableAnomalyDetection: boolean
  enableTrendAnalysis: boolean
  confidenceLevel: string
  samePeriod: {
    type: 'day' | 'week' | 'month'
    baseDate: Date | null
  }
  timeSegment: {
    segment1: [Date, Date] | null
    segment2: [Date, Date] | null
    date: Date | null
  }
  custom: {
    period1: [Date, Date] | null
    period2: [Date, Date] | null
  }
}

// 分析结果接口
interface AnalysisResult {
  overallTrend: 'improving' | 'degrading' | 'stable'
  summary: {
    metric: HistoricalMetric
    period1Value: string
    period2Value: string
    change: number
  }[]
  statistics: {
    metric: HistoricalMetric
    period1: { avg: number; max: number; min: number }
    period2: { avg: number; max: number; min: number }
    significance: { pValue: number; significant: boolean }
  }[]
  anomalies?: {
    id: string
    timestamp: Date
    metric: HistoricalMetric
    value: number
    expected: number
    deviation: number
    severity: 'low' | 'medium' | 'high'
    description: string
  }[]
  trends?: {
    metric: HistoricalMetric
    direction: 'up' | 'down' | 'stable'
    magnitude: number
    confidence: number
    rSquared: number
    description: string
  }[]
  insights: {
    id: string
    title: string
    description: string
    recommendations?: string[]
  }[]
}

// 响应式数据
const analyzing = ref(false)
const analysisProgress = ref(0)
const analysisStatus = ref<'success' | 'warning' | 'exception'>('success')
const analysisProgressText = ref('')
const analysisResult = ref<AnalysisResult | null>(null)
const chartViewMode = ref<'overlay' | 'side-by-side' | 'difference'>('overlay')

// 可用端口列表
const availablePorts = ref([3000, 3001, 8001, 8080, 9000])

// 分析配置
const config = reactive<AnalysisConfig>({
  compareType: 'same-period',
  selectedPorts: [3000],
  selectedMetrics: ['responseTime', 'availability', 'errorRate'],
  aggregation: 'avg',
  enableBaseline: true,
  enableAnomalyDetection: true,
  enableTrendAnalysis: true,
  confidenceLevel: '0.95',
  samePeriod: {
    type: 'day',
    baseDate: new Date(Date.now() - 24 * 60 * 60 * 1000) // 昨天
  },
  timeSegment: {
    segment1: null,
    segment2: null,
    date: new Date()
  },
  custom: {
    period1: null,
    period2: null
  }
})

// 方法
const startAnalysis = async () => {
  if (config.selectedPorts.length === 0) {
    ElMessage.warning('请至少选择一个端口进行分析')
    return
  }

  if (config.selectedMetrics.length === 0) {
    ElMessage.warning('请至少选择一个分析指标')
    return
  }

  analyzing.value = true
  analysisProgress.value = 0
  analysisResult.value = null

  try {
    // 模拟分析过程
    const steps = [
      '正在收集历史数据...',
      '正在进行数据预处理...',
      '正在执行统计分析...',
      '正在进行异常检测...',
      '正在分析趋势变化...',
      '正在生成分析报告...'
    ]

    for (let i = 0; i < steps.length; i++) {
      analysisProgressText.value = steps[i]
      analysisProgress.value = Math.round((i + 1) / steps.length * 100)
      await new Promise(resolve => setTimeout(resolve, 800))
    }

    // 生成分析结果
    analysisResult.value = await generateAnalysisResult()
    ElMessage.success('历史数据对比分析完成')

  } catch (error) {
    console.error('Analysis failed:', error)
    analysisStatus.value = 'exception'
    ElMessage.error('分析失败，请重试')
  } finally {
    analyzing.value = false
  }
}

const generateAnalysisResult = async (): Promise<AnalysisResult> => {
  // 模拟生成分析结果
  const result: AnalysisResult = {
    overallTrend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'degrading',
    summary: config.selectedMetrics.map(metric => ({
      metric,
      period1Value: getRandomValue(metric, 1),
      period2Value: getRandomValue(metric, 2),
      change: (Math.random() - 0.5) * 40 // -20% to +20%
    })),
    statistics: config.selectedMetrics.map(metric => ({
      metric,
      period1: {
        avg: Math.random() * 1000,
        max: Math.random() * 1500,
        min: Math.random() * 100
      },
      period2: {
        avg: Math.random() * 1000,
        max: Math.random() * 1500,
        min: Math.random() * 100
      },
      significance: {
        pValue: Math.random(),
        significant: Math.random() > 0.5
      }
    })),
    insights: generateInsights()
  }

  if (config.enableAnomalyDetection) {
    result.anomalies = generateAnomalies()
  }

  if (config.enableTrendAnalysis) {
    result.trends = generateTrends()
  }

  return result
}

const generateInsights = () => {
  const insights = [
    {
      id: '1',
      title: '性能基线分析',
      description: '根据历史数据分析，系统在工作日14:00-16:00期间负载最高，建议在此时段增加资源监控。',
      recommendations: ['增加监控频率', '设置预警阈值', '准备扩容方案']
    },
    {
      id: '2',
      title: '异常模式识别',
      description: '检测到周末期间错误率显著降低，可能与用户访问模式变化有关。',
      recommendations: ['分析用户行为模式', '调整资源分配策略']
    },
    {
      id: '3',
      title: '趋势预测',
      description: '响应时间呈现轻微上升趋势，建议关注系统容量规划。',
      recommendations: ['进行容量评估', '优化系统性能', '制定扩容计划']
    }
  ]

  return insights.slice(0, Math.floor(Math.random() * 3) + 1)
}

const generateAnomalies = () => {
  const anomalies: Array<{
    id: string
    timestamp: Date
    metric: HistoricalMetric
    value: number
    expected: number
    deviation: number
    severity: 'low' | 'medium' | 'high'
    description: string
  }> = []
  for (let i = 0; i < Math.floor(Math.random() * 5); i++) {
    const randomMetric = config.selectedMetrics[Math.floor(Math.random() * config.selectedMetrics.length)] || 'responseTime'
    anomalies.push({
      id: `anomaly-${i}`,
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      metric: randomMetric,
      value: Math.random() * 2000,
      expected: Math.random() * 1000,
      deviation: Math.random() * 5 + 2,
      severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as 'low' | 'medium' | 'high',
      description: '检测到异常数据点，超出正常范围'
    })
  }
  return anomalies
}

const generateTrends = () => {
  return config.selectedMetrics.map(metric => ({
    metric,
    direction: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable',
    magnitude: Math.random() * 50,
    confidence: 0.7 + Math.random() * 0.3,
    rSquared: Math.random(),
    description: `${getMetricName(metric)}呈现${Math.random() > 0.5 ? '上升' : '下降'}趋势`
  }))
}

const exportAnalysis = async () => {
  if (!analysisResult.value) return

  try {
    const exportData = {
      config,
      result: analysisResult.value,
      exportTime: new Date().toISOString()
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `historical-analysis-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success('分析报告已导出')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

// 工具方法
const handleCompareTypeChange = (type: string) => {
  // 重置相关配置
  if (type === 'same-period') {
    config.samePeriod.baseDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
  }
}

const getRandomValue = (metric: string, period: number) => {
  const base = period === 1 ? 1 : 1.1
  switch (metric) {
    case 'responseTime':
      return `${Math.round(Math.random() * 1000 * base)}ms`
    case 'availability':
      return `${(95 + Math.random() * 5 * base).toFixed(1)}%`
    case 'errorRate':
      return `${(Math.random() * 5 * base).toFixed(1)}%`
    case 'throughput':
      return `${Math.round(50 + Math.random() * 100 * base)}req/s`
    default:
      return '---'
  }
}

const getMetricName = (metric: string) => {
  const names: Record<string, string> = {
    responseTime: '响应时间',
    availability: '可用性',
    errorRate: '错误率',
    throughput: '吞吐量'
  }
  return names[metric] || metric
}

const getOverallTrendType = (trend: string) => {
  const types: Record<string, string> = {
    improving: 'success',
    stable: 'info',
    degrading: 'warning'
  }
  return types[trend] || 'info'
}

const getOverallTrendText = (trend: string) => {
  const texts: Record<string, string> = {
    improving: '性能改善',
    stable: '性能稳定',
    degrading: '性能下降'
  }
  return texts[trend] || trend
}

const getChangeClass = (change: number) => {
  if (change > 0) return 'positive'
  if (change < 0) return 'negative'
  return 'neutral'
}

const formatChange = (change: number) => {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

const getSeverityType = (severity: string) => {
  const types: Record<string, string> = {
    low: 'info',
    medium: 'warning',
    high: 'danger'
  }
  return types[severity] || 'info'
}

const getSeverityText = (severity: string) => {
  const texts: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高'
  }
  return texts[severity] || severity
}

const getTrendType = (direction: string) => {
  const types: Record<string, string> = {
    up: 'warning',
    down: 'success',
    stable: 'info'
  }
  return types[direction] || 'info'
}

const getTrendText = (direction: string) => {
  const texts: Record<string, string> = {
    up: '上升趋势',
    down: '下降趋势',
    stable: '稳定趋势'
  }
  return texts[direction] || direction
}

const getChartData = (metric: string): PerformanceMetric[] => {
  // 这里应该根据分析结果生成对应的图表数据
  // 暂时返回空数组，实际应用中需要处理真实数据
  return []
}

const getComparisonColors = () => {
  return ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C']
}

// 生命周期
onMounted(() => {
  // 初始化时可以加载一些默认配置
})
</script>

<style scoped>
.historical-analysis {
  padding: 0;
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.analysis-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.analysis-config {
  margin-bottom: 20px;
}

.config-title {
  font-weight: 600;
  color: #333;
}

.form-help {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.analysis-results {
  margin-top: 20px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.summary-card {
  text-align: center;
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
}

.summary-metric {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.summary-change {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.summary-change.positive {
  color: #67c23a;
}

.summary-change.negative {
  color: #f56c6c;
}

.summary-change.neutral {
  color: #909399;
}

.summary-values {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.comparison-charts {
  display: grid;
  gap: 20px;
}

.metric-chart {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px;
}

.stats-cell div {
  margin-bottom: 2px;
  font-size: 12px;
}

.anomaly-item {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #fafafa;
}

.anomaly-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.anomaly-time {
  font-size: 12px;
  color: #999;
}

.anomaly-description {
  margin-bottom: 8px;
  color: #666;
}

.anomaly-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
}

.trend-analysis {
  display: grid;
  gap: 16px;
}

.trend-item {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.trend-header h4 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.trend-details {
  display: flex;
  gap: 24px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #666;
}

.trend-description {
  font-size: 14px;
  color: #666;
}

.insights-list {
  display: grid;
  gap: 16px;
}

.insight-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
}

.insight-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background: #409eff;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.insight-content h5 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.insight-content p {
  margin: 0 0 12px 0;
  color: #666;
  line-height: 1.6;
}

.recommendations ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.recommendations li {
  margin-bottom: 4px;
  color: #666;
}

.analysis-progress {
  margin: 40px 0;
}

.progress-content {
  text-align: center;
  padding: 40px;
}

.progress-text {
  margin-top: 16px;
  color: #666;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .analysis-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .summary-card {
    padding: 16px;
  }
  
  .chart-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .anomaly-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  
  .anomaly-details {
    flex-direction: column;
    gap: 4px;
  }
  
  .trend-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  
  .trend-details {
    flex-direction: column;
    gap: 8px;
  }
}
</style>









