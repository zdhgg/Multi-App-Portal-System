<template>
  <el-dialog
    v-model="visible"
    title="构建分析结果"
    width="680px"
    :before-close="handleClose"
    class="build-analysis-dialog"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    destroy-on-close
    :modal="true"
    :lock-scroll="true"
    append-to-body
  >
    <!-- Loading状态 -->
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="8" animated />
    </div>

    <div v-else-if="analysis" class="analysis-content">
      <!-- 分析概览 -->
      <el-card class="overview-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Document /></el-icon>
            <span>构建分析概览</span>
            <el-tag :type="getConfidenceType(analysis.confidence)" size="small">
              置信度: {{ formatConfidence(analysis.confidence) }}
            </el-tag>
          </div>
        </template>
        
        <div class="overview-grid">
          <div class="overview-item">
            <div class="item-label">构建工具</div>
            <div class="item-value">
              <el-tag type="primary" size="large">
                {{ getBuildToolIcon(analysis.buildTool) }} {{ formatBuildTool(analysis.buildTool) }}
              </el-tag>
            </div>
          </div>

          <div class="overview-item">
            <div class="item-label">构建脚本</div>
            <div class="item-value">
              <div class="value-with-action">
                <el-tag type="info" effect="plain">{{ formatCopyValue(analysis.buildScript) }}</el-tag>
                <el-button
                  size="small"
                  type="primary"
                  text
                  @click="copyToClipboard(analysis.buildScript, '构建脚本')"
                  :icon="DocumentCopy"
                >
                  复制命令
                </el-button>
              </div>
            </div>
          </div>

          <div class="overview-item">
            <div class="item-label">输出目录</div>
            <div class="item-value">
              <div class="value-with-action">
                <el-tag type="info" effect="plain">{{ formatCopyValue(analysis.outputDir) || 'dist' }}</el-tag>
                <el-button
                  size="small"
                  type="primary"
                  text
                  @click="copyToClipboard(analysis.outputDir, '输出目录路径')"
                  :icon="DocumentCopy"
                >
                  复制路径
                </el-button>
              </div>
            </div>
          </div>

          <div class="overview-item">
            <div class="item-label">分析时间</div>
            <div class="item-value">
              <span class="timestamp">{{ formatTimestamp(analysis.analysisTime) }}</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 构建状态 -->
      <el-card v-if="analysis.buildStatus" class="build-status-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Folder /></el-icon>
            <span>构建状态</span>
            <el-tag 
              :type="getBuildStatusType(analysis.buildStatus)" 
              size="small"
            >
              {{ getBuildStatusText(analysis.buildStatus) }}
            </el-tag>
          </div>
        </template>
        
        <div class="build-status-content">
          <!-- 已构建 -->
          <template v-if="analysis.buildStatus.hasBuilt">
            <el-alert
              :type="analysis.buildStatus.isStale ? 'warning' : 'success'"
              :closable="false"
              show-icon
            >
              <template #title>
                <span v-if="analysis.buildStatus.isStale">
                  ⚠️ 构建产物已过时，建议重新构建
                </span>
                <span v-else>
                  ✅ 已有有效的构建产物，无需重复构建
                </span>
              </template>
              <template #default v-if="analysis.buildStatus.isStale">
                <div class="stale-reason">{{ analysis.buildStatus.staleReason }}</div>
              </template>
            </el-alert>

            <div class="build-info-grid">
              <div class="build-info-item">
                <span class="info-label">上次构建时间</span>
                <span class="info-value">{{ analysis.buildStatus.lastBuildTimeFormatted || '未知' }}</span>
              </div>
              <div class="build-info-item">
                <span class="info-label">文件数量</span>
                <span class="info-value">{{ analysis.buildStatus.filesCount || 0 }} 个文件</span>
              </div>
              <div class="build-info-item">
                <span class="info-label">构建产物大小</span>
                <span class="info-value">{{ analysis.buildStatus.totalSizeFormatted || '0 B' }}</span>
              </div>
              <div class="build-info-item">
                <span class="info-label">输出目录</span>
                <span class="info-value path">{{ analysis.buildStatus.outputDir }}</span>
              </div>
            </div>
          </template>

          <!-- 未构建 -->
          <template v-else>
            <el-alert
              type="info"
              :closable="false"
              show-icon
            >
              <template #title>
                📦 尚未构建，点击"执行构建"开始构建
              </template>
            </el-alert>
          </template>
        </div>
      </el-card>

      <!-- 优化建议 -->
      <el-card class="optimizations-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Tools /></el-icon>
            <span>优化建议</span>
            <el-tag :type="getOptimizationSummaryType()" size="small">
              {{ analysis.optimizations?.length || 0 }} 项建议
            </el-tag>
            <div class="header-actions">
              <el-button
                v-if="analysis.optimizations?.length > 0"
                size="small"
                type="primary"
                text
                @click="toggleAllOptimizations"
              >
                {{ allOptimizationsExpanded ? '全部收起' : '全部展开' }}
              </el-button>
            </div>
          </div>
        </template>
        
        <div v-if="!analysis.optimizations?.length" class="empty-state">
          <el-icon><Check /></el-icon>
          <p>当前构建配置已经很好，暂无优化建议</p>
        </div>
        
        <div v-else class="optimizations-list">
          <div
            v-for="(optimization, index) in sortedOptimizations"
            :key="index"
            class="optimization-item"
          >
            <div class="optimization-header">
              <el-tag
                :type="getPriorityType(optimization.priority)"
                size="small"
                class="priority-tag"
              >
                {{ getPriorityText(optimization.priority) }}
              </el-tag>
              <span class="optimization-type">{{ getOptimizationTypeText(optimization.type) }}</span>
            </div>
            <div class="optimization-description">
              {{ optimization.description }}
            </div>
            <div v-if="optimization.config" class="optimization-config">
              <el-collapse v-model="expandedOptimizations">
                <el-collapse-item :title="`查看配置详情`" :name="String(index)">
                  <template #title>
                    <div class="config-title">
                      <span>查看配置详情</span>
                      <el-button
                        size="small"
                        type="primary"
                        text
                        @click.stop="copyToClipboard(JSON.stringify(optimization.config, null, 2), '配置详情')"
                        :icon="DocumentCopy"
                      >
                        复制配置
                      </el-button>
                    </div>
                  </template>
                  <div class="config-content">
                    <VueJsonPretty
                      :data="optimization.config"
                      :show-length="true"
                      :show-line="false"
                      :show-icon="true"
                      :editable="false"
                      :show-select-controller="true"
                      :highlight-mouseover-node="true"
                      :highlight-selected-node="true"
                      :select-on-click-node="true"
                      :collapsed-on-click-brackets="true"
                      :show-double-quotes="true"
                      :virtual="false"
                      theme="light"
                    />
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 部署策略 -->
      <el-card v-if="analysis.deploymentStrategy" class="deployment-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Upload /></el-icon>
            <span>推荐部署策略</span>
            <el-tag :type="getDeploymentType(analysis.deploymentStrategy?.type)" size="small">
              {{ getDeploymentTypeText(analysis.deploymentStrategy?.type) }}
            </el-tag>
          </div>
        </template>
        
        <div class="deployment-content">
          <div class="deployment-description">
            <p>{{ analysis.deploymentStrategy.description }}</p>
          </div>
          
          <div class="deployment-benefits">
            <h4>优势</h4>
            <ul>
              <li v-for="benefit in analysis.deploymentStrategy.benefits" :key="benefit">
                <el-icon><Check /></el-icon>
                {{ benefit }}
              </li>
            </ul>
          </div>
          
          <div v-if="analysis.deploymentStrategy.requirements" class="deployment-requirements">
            <h4>要求</h4>
            <ul>
              <li v-for="requirement in analysis.deploymentStrategy.requirements" :key="requirement">
                <el-icon><Warning /></el-icon>
                {{ requirement }}
              </li>
            </ul>
          </div>
        </div>
      </el-card>

      <!-- 问题和警告 -->
      <el-card v-if="analysis.issues?.length > 0" class="issues-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Warning /></el-icon>
            <span>发现的问题</span>
            <el-tag type="warning" size="small">
              {{ analysis.issues?.length || 0 }} 个问题
            </el-tag>
          </div>
        </template>
        
        <div class="issues-list">
          <div v-for="(issue, index) in analysis.issues" :key="index" class="issue-item">
            <el-icon><Warning /></el-icon>
            <span>{{ issue }}</span>
          </div>
        </div>
      </el-card>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-dropdown 
            @command="handleExport" 
            trigger="click" 
            :teleported="false"
            placement="top-start"
          >
            <el-button type="info" plain>
              <el-icon><Download /></el-icon>
              导出报告
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="json">
                  <el-icon><Document /></el-icon>
                  导出为 JSON
                </el-dropdown-item>
                <el-dropdown-item command="markdown">
                  <el-icon><Document /></el-icon>
                  导出为 Markdown
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="footer-right">
          <el-button @click="handleClose">关闭</el-button>
          <el-button
            type="success"
            @click="handleExecuteBuild"
            :loading="buildLoading"
            :disabled="buildLoading"
          >
            <el-icon v-if="!buildLoading"><VideoPlay /></el-icon>
            {{ buildLoading ? '构建中...' : '执行构建' }}
          </el-button>
          <el-button
            type="primary"
            @click="handleOptimizedDeploy"
            :loading="deployLoading"
            :disabled="deployLoading"
          >
            <el-icon v-if="!deployLoading"><Upload /></el-icon>
            {{ deployLoading ? '部署中...' : '应用优化部署' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Tools, Check, Warning, Upload, DocumentCopy, Download, ArrowDown, VideoPlay, Folder } from '@element-plus/icons-vue'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'
import type { BuildAnalysis } from '@/services/buildApi'

interface Props {
  modelValue: boolean
  analysis: BuildAnalysis | null
  loading?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'optimized-deploy', analysis: BuildAnalysis): void
  (e: 'execute-build', analysis: BuildAnalysis): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 响应式状态
const deployLoading = ref(false)
const buildLoading = ref(false)
const expandedOptimizations = ref<string[]>([])
const allOptimizationsExpanded = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 按优先级排序的优化建议
const sortedOptimizations = computed(() => {
  if (!props.analysis?.optimizations) return []

  const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 }
  return [...props.analysis.optimizations].sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
})

// 优化类型中文映射
const optimizationTypeMap: Record<string, string> = {
  'caching': '缓存策略',
  'compression': '压缩优化',
  'code-splitting': '代码分割',
  'tree-shaking': '摇树优化',
  'minification': '代码压缩',
  'bundling': '打包优化',
  'lazy-loading': '懒加载',
  'preloading': '预加载',
  'prefetching': '预获取',
  'cdn': 'CDN优化',
  'http2': 'HTTP/2优化',
  'gzip': 'Gzip压缩',
  'brotli': 'Brotli压缩',
  'image-optimization': '图片优化',
  'font-optimization': '字体优化',
  'css-optimization': 'CSS优化',
  'js-optimization': 'JavaScript优化',
  'html-optimization': 'HTML优化',
  'service-worker': 'Service Worker',
  'pwa': 'PWA优化',
  'performance': '性能优化',
  'seo': 'SEO优化',
  'accessibility': '可访问性优化',
  'security': '安全优化'
}

// 格式化构建工具名称
const formatBuildTool = (tool: string | undefined): string => {
  if (!tool || tool === 'unknown' || tool === 'undefined') return '未检测'
  return tool
}

// 格式化可复制的值
const formatCopyValue = (value: string | undefined): string => {
  if (!value || value === 'undefined' || value === 'unknown') return '未配置'
  return value
}

// 获取构建工具图标
const getBuildToolIcon = (tool: string | undefined): string => {
  if (!tool || tool === 'unknown') return '🔧'
  const icons: Record<string, string> = {
    'Vite': '⚡',
    'Vue CLI': '💚',
    'Angular CLI': '🅰️',
    'Webpack': '📦',
    'Rollup': '📦',
    'Parcel': '📦'
  }
  return icons[tool] || '🔧'
}

// 获取置信度类型
const getConfidenceType = (confidence: number | undefined): string => {
  if (!confidence && confidence !== 0) return 'info'
  if (confidence >= 0.9) return 'success'
  if (confidence >= 0.75) return 'primary'
  if (confidence >= 0.6) return 'warning'
  return 'danger'
}

// 格式化置信度
const formatConfidence = (confidence: number | undefined): string => {
  if (!confidence && confidence !== 0) return '--'
  return `${Math.round(confidence * 100)}%`
}

// 获取优化建议摘要类型
const getOptimizationSummaryType = (): string => {
  if (!props.analysis?.optimizations?.length) return 'success'
  const highPriority = props.analysis.optimizations.filter(opt => opt.priority === 'high').length
  if (highPriority > 0) return 'danger'
  if (props.analysis.optimizations.length > 0) return 'warning'
  return 'success'
}

// 获取构建状态类型
const getBuildStatusType = (status: any): string => {
  if (!status) return 'info'
  if (!status.hasBuilt) return 'info'
  if (status.isStale) return 'warning'
  return 'success'
}

// 获取构建状态文本
const getBuildStatusText = (status: any): string => {
  if (!status) return '未知'
  if (!status.hasBuilt) return '未构建'
  if (status.isStale) return '需要更新'
  return '已构建'
}

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

// 获取优化类型中文文本
const getOptimizationTypeText = (type: string): string => {
  return optimizationTypeMap[type] || type
}

// 获取部署策略类型
const getDeploymentType = (type: string): string => {
  switch (type) {
    case 'unified': return 'success'
    case 'ssr': return 'primary'
    case 'spa': return 'info'
    case 'static': return 'warning'
    default: return 'info'
  }
}

// 获取部署策略中文名称
const getDeploymentTypeText = (type: string): string => {
  switch (type) {
    case 'unified': return '统一部署'
    case 'ssr': return '服务端渲染'
    case 'spa': return '单页应用'
    case 'static': return '静态部署'
    default: return '未知策略'
  }
}

// 格式化时间戳
const formatTimestamp = (timestamp: number | string | undefined): string => {
  if (!timestamp) return '刚刚'
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return '刚刚'
  return date.toLocaleString('zh-CN')
}

// 处理关闭
const handleClose = () => {
  visible.value = false
}

// 处理执行构建
const handleExecuteBuild = async () => {
  if (props.analysis) {
    buildLoading.value = true
    try {
      emit('execute-build', props.analysis)
    } finally {
      // 注意：实际的 loading 状态应该由父组件根据构建进度来控制
      // 这里只是简单地关闭对话框
      buildLoading.value = false
    }
  }
}

// 处理优化部署
const handleOptimizedDeploy = async () => {
  if (props.analysis) {
    deployLoading.value = true
    try {
      emit('optimized-deploy', props.analysis)
      // 模拟部署过程
      await new Promise(resolve => setTimeout(resolve, 2000))
    } finally {
      deployLoading.value = false
    }
  }
}

// 复制到剪贴板
const copyToClipboard = async (text: string | undefined, label: string) => {
  if (!text || text === 'undefined' || text === 'unknown') {
    ElMessage.warning(`${label}为空，无法复制`)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label}已复制到剪贴板`)
  } catch (err) {
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    ElMessage.success(`${label}已复制到剪贴板`)
  }
}

// 切换所有优化建议的展开状态
const toggleAllOptimizations = () => {
  if (allOptimizationsExpanded.value) {
    expandedOptimizations.value = []
  } else {
    expandedOptimizations.value = sortedOptimizations.value.map((_, index) => index.toString())
  }
  allOptimizationsExpanded.value = !allOptimizationsExpanded.value
}

// 导出报告
const handleExport = (format: string) => {
  if (!props.analysis) return

  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const filename = `build-analysis-${timestamp}`

  if (format === 'json') {
    exportAsJson(filename)
  } else if (format === 'markdown') {
    exportAsMarkdown(filename)
  }
}

// 导出为JSON
const exportAsJson = (filename: string) => {
  const data = JSON.stringify(props.analysis, null, 2)
  downloadFile(data, `${filename}.json`, 'application/json')
  ElMessage.success('JSON报告已导出')
}

// 导出为Markdown
const exportAsMarkdown = (filename: string) => {
  if (!props.analysis) return

  const md = generateMarkdownReport(props.analysis)
  downloadFile(md, `${filename}.md`, 'text/markdown')
  ElMessage.success('Markdown报告已导出')
}

// 生成Markdown报告
const generateMarkdownReport = (analysis: BuildAnalysis): string => {
  const lines = [
    '# 构建分析报告',
    '',
    `**分析时间**: ${formatTimestamp(analysis.analysisTime)}`,
    `**置信度**: ${formatConfidence(analysis.confidence)}`,
    '',
    '## 构建概览',
    '',
    `- **构建工具**: ${analysis.buildTool}`,
    `- **构建脚本**: \`${analysis.buildScript}\``,
    `- **输出目录**: \`${analysis.outputDir}\``,
    '',
    '## 优化建议',
    ''
  ]

  if (analysis.optimizations.length === 0) {
    lines.push('当前构建配置已经很好，暂无优化建议。')
  } else {
    analysis.optimizations.forEach((opt, index) => {
      lines.push(`### ${index + 1}. ${getOptimizationTypeText(opt.type)} (${getPriorityText(opt.priority)})`)
      lines.push('')
      lines.push(opt.description)
      lines.push('')
      if (opt.config) {
        lines.push('**配置详情**:')
        lines.push('```json')
        lines.push(JSON.stringify(opt.config, null, 2))
        lines.push('```')
        lines.push('')
      }
    })
  }

  lines.push('## 部署策略')
  lines.push('')
  lines.push(`**策略类型**: ${getDeploymentTypeText(analysis.deploymentStrategy.type)}`)
  lines.push('')
  lines.push(analysis.deploymentStrategy.description)
  lines.push('')

  if (analysis.deploymentStrategy.benefits.length > 0) {
    lines.push('**优势**:')
    analysis.deploymentStrategy.benefits.forEach(benefit => {
      lines.push(`- ${benefit}`)
    })
    lines.push('')
  }

  if (analysis.deploymentStrategy.requirements && analysis.deploymentStrategy.requirements.length > 0) {
    lines.push('**要求**:')
    analysis.deploymentStrategy.requirements.forEach(req => {
      lines.push(`- ${req}`)
    })
    lines.push('')
  }

  if (analysis.issues.length > 0) {
    lines.push('## 发现的问题')
    lines.push('')
    analysis.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`)
    })
    lines.push('')
  }

  lines.push('---')
  lines.push('*此报告由智能多Web应用门户系统自动生成*')

  return lines.join('\n')
}

// 下载文件
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.analysis-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.card-header :deep(.el-icon) {
  color: #409eff;
  font-size: 18px;
}

.card-header .header-actions {
  margin-left: auto;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.overview-item .item-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
  font-weight: 500;
}

.overview-item .item-value {
  font-weight: 600;
  font-size: 13px;
}

.overview-item .item-value .timestamp {
  color: #606266;
  font-size: 15px;
}

.overview-item .item-value .value-with-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 构建状态样式 */
.build-status-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.build-status-content .stale-reason {
  margin-top: 2px;
  font-size: 12px;
  color: #e6a23c;
}

.build-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 6px;
}

.build-info-item {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.build-info-item .info-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
}

.build-info-item .info-value {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.build-info-item .info-value.path {
  font-size: 11px;
  font-family: monospace;
  word-break: break-all;
  color: #606266;
}

/* 卡片样式优化 */
:deep(.el-card) {
  margin-bottom: 10px;
  border: 1px solid #e4e7ed;
}

:deep(.el-card .el-card__header) {
  padding: 10px 14px;
  background: #f5f7fa;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
}

:deep(.el-card .el-card__body) {
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
  background: #fff;
}

.optimizations-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.optimization-item {
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafbfc;
}

.optimization-item .optimization-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.optimization-item .optimization-type {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

.optimization-item .optimization-description {
  color: #606266;
  line-height: 1.5;
  margin-bottom: 8px;
  font-size: 13px;
}

.optimization-item .config-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.optimization-item .config-content {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.deployment-content .deployment-description {
  margin-bottom: 10px;
}

.deployment-content .deployment-description p {
  color: #606266;
  line-height: 1.4;
  margin: 0;
  font-size: 13px;
}

.deployment-benefits,
.deployment-requirements {
  margin-bottom: 10px;
}

.deployment-benefits h4,
.deployment-requirements h4 {
  margin: 0 0 6px 0;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.deployment-benefits ul,
.deployment-requirements ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.deployment-benefits li,
.deployment-requirements li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 2px;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.deployment-benefits li :deep(.el-icon) {
  color: #67c23a;
  margin-top: 2px;
  flex-shrink: 0;
}

.deployment-requirements li :deep(.el-icon) {
  color: #e6a23c;
  margin-top: 2px;
  flex-shrink: 0;
}

.issues-list .issue-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 14px;
  line-height: 1.6;
}

.issues-list .issue-item :deep(.el-icon) {
  color: #f56c6c;
  margin-top: 2px;
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.empty-state :deep(.el-icon) {
  font-size: 48px;
  color: #67c23a;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 15px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.dialog-footer .footer-left {
  display: flex;
  gap: 8px;
}

.dialog-footer .footer-right {
  display: flex;
  gap: 12px;
}

.loading-state {
  padding: 20px;
}
</style>

<!-- 全局对话框样式 -->
<style>
.build-analysis-dialog.el-dialog__wrapper {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 5vh;
  padding-bottom: 5vh;
  overflow: auto;
}

.build-analysis-dialog .el-dialog {
  margin: 0 !important;
  max-height: 90vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.build-analysis-dialog .el-dialog__header {
  padding: 16px 20px !important;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.build-analysis-dialog .el-dialog__title {
  font-size: 17px;
  font-weight: 600;
}

.build-analysis-dialog .el-dialog__body {
  flex: 1 !important;
  min-height: 0 !important;
  max-height: calc(90vh - 140px) !important;
  overflow-y: auto !important;
  padding: 16px 20px !important;
}

.build-analysis-dialog .el-dialog__body::-webkit-scrollbar {
  width: 8px;
}

.build-analysis-dialog .el-dialog__body::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.build-analysis-dialog .el-dialog__body::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.build-analysis-dialog .el-dialog__body::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.build-analysis-dialog .el-dialog__footer {
  padding: 14px 20px !important;
  border-top: 1px solid #ebeef5;
  flex-shrink: 0 !important;
}

/* 紧凑卡片样式 */
.build-analysis-dialog .el-card {
  margin-bottom: 12px !important;
}

.build-analysis-dialog .el-card__header {
  padding: 10px 16px !important;
}

.build-analysis-dialog .el-card__body {
  padding: 14px 16px !important;
}

.build-analysis-dialog .el-alert {
  padding: 8px 12px !important;
}

.build-analysis-dialog .el-alert__title {
  font-size: 13px !important;
}
</style>
