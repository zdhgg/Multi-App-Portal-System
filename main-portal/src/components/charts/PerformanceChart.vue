<template>
  <div class="performance-chart">
    <div class="chart-header" v-if="showHeader">
      <h4>{{ title }}</h4>
      <div class="chart-controls" v-if="showControls">
        <el-radio-group v-model="currentTimeRange" size="small" @change="handleTimeRangeChange">
          <el-radio-button label="1h">1小时</el-radio-button>
          <el-radio-button label="6h">6小时</el-radio-button>
          <el-radio-button label="24h">24小时</el-radio-button>
          <el-radio-button label="7d">7天</el-radio-button>
        </el-radio-group>
        <el-button 
          type="text" 
          size="small" 
          :icon="Refresh"
          @click="handleRefresh"
          :loading="loading"
        >
          刷新
        </el-button>
      </div>
    </div>
    
    <div class="chart-content">
      <v-chart
        :option="chartOption"
        :style="chartStyle"
        :loading="loading"
        :loading-options="loadingOptions"
        @click="handleChartClick"
        @brush-selected="handleBrushSelected"
        @data-zoom="handleDataZoom"
        autoresize
      />
      
      <!-- 数据为空时的提示 -->
      <div v-if="isEmpty" class="empty-chart">
        <el-empty :description="emptyDescription" />
      </div>
    </div>

    <!-- 图表说明 -->
    <div class="chart-legend" v-if="showLegend && legendData.length > 0">
      <div class="legend-items">
        <div 
          v-for="item in legendData" 
          :key="item.name"
          class="legend-item"
          :class="{ active: item.selected }"
          @click="toggleLegendItem(item)"
        >
          <div class="legend-color" :style="{ backgroundColor: item.color }"></div>
          <span class="legend-name">{{ item.name }}</span>
          <span class="legend-value">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart, ScatterChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  BrushComponent,
  GraphicComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { Refresh } from '@element-plus/icons-vue'
import type { PerformanceMetric } from '@/services/portPerformanceApi'

// 注册ECharts组件
use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  BrushComponent,
  GraphicComponent
])

// 图表类型定义
export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'radar'
export type MetricType = 'responseTime' | 'availability' | 'errorRate' | 'throughput' | 'cpu' | 'memory'

// Props 定义
interface Props {
  title?: string
  type?: ChartType
  metricType?: MetricType
  data?: PerformanceMetric[]
  timeRange?: string
  height?: string
  showHeader?: boolean
  showControls?: boolean
  showLegend?: boolean
  loading?: boolean
  thresholds?: Record<string, number>
  colors?: string[]
  emptyDescription?: string
  animationEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '性能图表',
  type: 'line',
  metricType: 'responseTime',
  timeRange: '24h',
  height: '300px',
  showHeader: true,
  showControls: true,
  showLegend: false,
  loading: false,
  emptyDescription: '暂无数据',
  animationEnabled: true,
  colors: () => ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399']
})

// Emits 定义
const emit = defineEmits<{
  timeRangeChange: [timeRange: string]
  refresh: []
  chartClick: [params: any]
  brushSelected: [params: any]
  dataZoom: [params: any]
}>()

// 响应式数据
const currentTimeRange = ref(props.timeRange)
const selectedLegendItems = ref<string[]>([])

// 计算属性
const chartStyle = computed(() => ({
  height: props.height,
  width: '100%'
}))

const isEmpty = computed(() => !props.data || props.data.length === 0)

const loadingOptions = computed(() => ({
  text: '加载中...',
  color: '#409EFF',
  textColor: '#409EFF',
  maskColor: 'rgba(255, 255, 255, 0.8)',
  zlevel: 0,
  fontSize: 12,
  showSpinner: true,
  spinnerRadius: 10,
  lineWidth: 2
}))

// 图表配置
const chartOption = computed(() => {
  if (isEmpty.value) {
    return {}
  }

  const baseOption = {
    animation: props.animationEnabled,
    animationDuration: 1000,
    animationEasing: 'cubicOut',
    color: props.colors,
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: 'Microsoft YaHei, sans-serif'
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.9)',
      borderColor: '#333',
      borderWidth: 1,
      textStyle: {
        color: '#fff',
        fontSize: 12
      },
      formatter: getTooltipFormatter()
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    toolbox: {
      show: true,
      feature: {
        dataZoom: {
          yAxisIndex: 'none',
          title: { zoom: '缩放', back: '还原' }
        },
        restore: { title: '还原' },
        saveAsImage: { title: '保存图片' }
      },
      right: '2%',
      top: '2%'
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        start: 0,
        end: 100,
        handleIcon: 'M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
        handleSize: '80%',
        handleStyle: {
          color: '#fff',
          shadowBlur: 3,
          shadowColor: 'rgba(0, 0, 0, 0.6)',
          shadowOffsetX: 2,
          shadowOffsetY: 2
        }
      }
    ]
  }

  // 根据图表类型和指标类型生成具体配置
  switch (props.type) {
    case 'line':
      return { ...baseOption, ...getLineChartOption() }
    case 'bar':
      return { ...baseOption, ...getBarChartOption() }
    case 'pie':
      return { ...baseOption, ...getPieChartOption() }
    case 'scatter':
      return { ...baseOption, ...getScatterChartOption() }
    case 'radar':
      return { ...baseOption, ...getRadarChartOption() }
    default:
      return { ...baseOption, ...getLineChartOption() }
  }
})

// 图例数据
const legendData = computed(() => {
  if (!props.data || props.data.length === 0) return []

  const latestData = props.data[props.data.length - 1]
  if (!latestData) return []

  const items = []
  
  switch (props.metricType) {
    case 'responseTime':
      items.push({
        name: '响应时间',
        color: props.colors[0],
        value: `${latestData.responseTime.toFixed(0)}ms`,
        selected: true
      })
      break
    case 'availability':
      items.push({
        name: '可用性',
        color: props.colors[1],
        value: `${latestData.availability.toFixed(1)}%`,
        selected: true
      })
      break
    case 'errorRate':
      items.push({
        name: '错误率',
        color: props.colors[3],
        value: `${latestData.errorRate.toFixed(1)}%`,
        selected: true
      })
      break
    default:
      items.push({
        name: props.metricType,
        color: props.colors[0],
        value: '---',
        selected: true
      })
  }

  return items
})

// 图表配置生成函数
function getLineChartOption() {
  const timeData = props.data?.map(item => item.timestamp.toLocaleTimeString()) || []
  const valueData = props.data?.map(item => getMetricValue(item)) || []

  return {
    xAxis: {
      type: 'category',
      data: timeData,
      axisLine: { lineStyle: { color: '#E4E7ED' } },
      axisTick: { lineStyle: { color: '#E4E7ED' } },
      axisLabel: { color: '#606266', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: getMetricUnit(),
      axisLine: { lineStyle: { color: '#E4E7ED' } },
      axisTick: { lineStyle: { color: '#E4E7ED' } },
      axisLabel: { color: '#606266', fontSize: 12 },
      splitLine: { lineStyle: { color: '#F2F6FC', type: 'dashed' } }
    },
    series: [{
      name: getMetricName(),
      type: 'line',
      data: valueData,
      smooth: true,
      lineStyle: { width: 2 },
      itemStyle: { borderWidth: 2 },
      areaStyle: {
        opacity: 0.1
      },
      markLine: getMarkLines(),
      markPoint: getMarkPoints()
    }]
  }
}

function getBarChartOption() {
  const timeData = props.data?.map(item => item.timestamp.toLocaleTimeString()) || []
  const valueData = props.data?.map(item => getMetricValue(item)) || []

  return {
    xAxis: {
      type: 'category',
      data: timeData,
      axisLine: { lineStyle: { color: '#E4E7ED' } },
      axisTick: { lineStyle: { color: '#E4E7ED' } },
      axisLabel: { color: '#606266', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: getMetricUnit(),
      axisLine: { lineStyle: { color: '#E4E7ED' } },
      axisTick: { lineStyle: { color: '#E4E7ED' } },
      axisLabel: { color: '#606266', fontSize: 12 },
      splitLine: { lineStyle: { color: '#F2F6FC', type: 'dashed' } }
    },
    series: [{
      name: getMetricName(),
      type: 'bar',
      data: valueData,
      itemStyle: {
        borderRadius: [2, 2, 0, 0]
      }
    }]
  }
}

function getPieChartOption() {
  if (!props.data || props.data.length === 0) return {}

  // 计算最新数据的各项指标占比
  const latestData = props.data[props.data.length - 1]
  const pieData = [
    { name: '正常响应', value: 100 - latestData.errorRate },
    { name: '错误响应', value: latestData.errorRate }
  ]

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c}% ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: pieData.map(item => item.name)
    },
    series: [{
      name: '响应分布',
      type: 'pie',
      radius: '50%',
      data: pieData,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }
}

function getScatterChartOption() {
  const scatterData = props.data?.map(item => [
    item.responseTime,
    item.availability,
    item.timestamp.toLocaleString()
  ]) || []

  return {
    xAxis: {
      type: 'value',
      name: '响应时间 (ms)',
      axisLabel: { color: '#606266', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: '可用性 (%)',
      axisLabel: { color: '#606266', fontSize: 12 }
    },
    series: [{
      name: '性能分布',
      type: 'scatter',
      data: scatterData,
      symbolSize: 8,
      itemStyle: {
        opacity: 0.7
      },
      emphasis: {
        itemStyle: {
          opacity: 1
        }
      }
    }]
  }
}

function getRadarChartOption() {
  if (!props.data || props.data.length === 0) return {}

  const latestData = props.data[props.data.length - 1]
  const radarData = [{
    value: [
      latestData.availability,
      100 - latestData.errorRate,
      Math.max(0, 100 - latestData.responseTime / 10),
      latestData.cpuUsage ? 100 - latestData.cpuUsage : 80,
      latestData.memoryUsage ? 100 - latestData.memoryUsage / 10 : 80
    ],
    name: '性能指标'
  }]

  return {
    radar: {
      indicator: [
        { name: '可用性', max: 100 },
        { name: '稳定性', max: 100 },
        { name: '响应速度', max: 100 },
        { name: 'CPU性能', max: 100 },
        { name: '内存性能', max: 100 }
      ],
      radius: 80
    },
    series: [{
      name: '性能雷达图',
      type: 'radar',
      data: radarData,
      itemStyle: {
        opacity: 0.7
      },
      areaStyle: {
        opacity: 0.3
      }
    }]
  }
}

// 工具函数
function getMetricValue(item: PerformanceMetric): number {
  switch (props.metricType) {
    case 'responseTime':
      return item.responseTime
    case 'availability':
      return item.availability
    case 'errorRate':
      return item.errorRate
    case 'throughput':
      return item.throughput || 0
    case 'cpu':
      return item.cpuUsage || 0
    case 'memory':
      return item.memoryUsage || 0
    default:
      return 0
  }
}

function getMetricName(): string {
  const nameMap: Record<MetricType, string> = {
    responseTime: '响应时间',
    availability: '可用性',
    errorRate: '错误率',
    throughput: '吞吐量',
    cpu: 'CPU使用率',
    memory: '内存使用量'
  }
  return nameMap[props.metricType] || props.metricType
}

function getMetricUnit(): string {
  const unitMap: Record<MetricType, string> = {
    responseTime: '毫秒(ms)',
    availability: '百分比(%)',
    errorRate: '百分比(%)',
    throughput: '请求/秒',
    cpu: '百分比(%)',
    memory: 'MB'
  }
  return unitMap[props.metricType] || ''
}

function getTooltipFormatter() {
  return function(params: any) {
    if (Array.isArray(params) && params.length > 0) {
      const param = params[0]
      const unit = getMetricUnit()
      return `
        <div style="padding: 8px;">
          <div style="margin-bottom: 4px; font-weight: bold;">${param.axisValue}</div>
          <div style="display: flex; align-items: center;">
            <span style="display: inline-block; width: 10px; height: 10px; background-color: ${param.color}; margin-right: 8px; border-radius: 50%;"></span>
            <span>${param.seriesName}: ${param.value}${unit}</span>
          </div>
        </div>
      `
    }
    return ''
  }
}

function getMarkLines() {
  if (!props.thresholds) return undefined

  const lines = []
  const threshold = props.thresholds[props.metricType]
  if (threshold !== undefined) {
    lines.push({
      name: '告警阈值',
      yAxis: threshold,
      lineStyle: { color: '#F56C6C', type: 'dashed', width: 2 },
      label: { 
        show: true, 
        position: 'end',
        formatter: `阈值: ${threshold}${getMetricUnit()}`
      }
    })
  }

  return lines.length > 0 ? { data: lines } : undefined
}

function getMarkPoints() {
  if (!props.data || props.data.length === 0) return undefined

  const values = props.data.map(item => getMetricValue(item))
  const maxValue = Math.max(...values)
  const minValue = Math.min(...values)
  const maxIndex = values.indexOf(maxValue)
  const minIndex = values.indexOf(minValue)

  return {
    data: [
      {
        type: 'max',
        name: '最大值',
        symbol: 'pin',
        symbolSize: 50,
        itemStyle: { color: '#F56C6C' }
      },
      {
        type: 'min',
        name: '最小值',
        symbol: 'pin',
        symbolSize: 50,
        itemStyle: { color: '#67C23A' }
      }
    ]
  }
}

// 事件处理
const handleTimeRangeChange = (timeRange: string) => {
  currentTimeRange.value = timeRange
  emit('timeRangeChange', timeRange)
}

const handleRefresh = () => {
  emit('refresh')
}

const handleChartClick = (params: any) => {
  emit('chartClick', params)
}

const handleBrushSelected = (params: any) => {
  emit('brushSelected', params)
}

const handleDataZoom = (params: any) => {
  emit('dataZoom', params)
}

const toggleLegendItem = (item: any) => {
  item.selected = !item.selected
  // 这里可以添加图表系列显示/隐藏逻辑
}

// 监听
watch(() => props.timeRange, (newTimeRange) => {
  currentTimeRange.value = newTimeRange
})

// 生命周期
onMounted(() => {
  // 初始化时可以做一些额外配置
})
</script>

<style scoped>
.performance-chart {
  width: 100%;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 0;
}

.chart-header h4 {
  margin: 0;
  font-size: 16px;
  color: #333;
  font-weight: 600;
}

.chart-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chart-content {
  position: relative;
  padding: 16px;
}

.empty-chart {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.chart-legend {
  padding: 0 20px 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 16px;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.legend-item:hover {
  background-color: #f5f7fa;
}

.legend-item.active {
  background-color: #ecf5ff;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
}

.legend-name {
  font-size: 14px;
  color: #333;
  margin-right: 8px;
}

.legend-value {
  font-size: 14px;
  color: #666;
  font-weight: 600;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .chart-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .chart-controls {
    width: 100%;
    justify-content: space-between;
  }
  
  .legend-items {
    flex-direction: column;
    gap: 8px;
  }
}
</style>









