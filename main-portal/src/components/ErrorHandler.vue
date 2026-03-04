<template>
  <div class="error-handler">
    <!-- 错误概览 -->
    <div class="error-overview" v-if="error">
      <el-alert
        :title="error.title"
        :type="error.severity"
        :description="error.message"
        show-icon
        :closable="false"
      >
        <template #default>
          <div class="error-content">
            <div class="error-meta">
              <p><strong>时间:</strong> {{ formatTime(error.timestamp) }}</p>
              <p><strong>类型:</strong> {{ error.type }}</p>
              <p><strong>应用:</strong> {{ error.appName || '系统' }}</p>
              <p v-if="error.code"><strong>错误代码:</strong> {{ error.code }}</p>
            </div>
            
            <div class="error-details" v-if="error.details">
              <el-collapse size="small">
                <el-collapse-item title="详细信息" name="details">
                  <pre>{{ error.details }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>

            <div class="error-stack" v-if="error.stack">
              <el-collapse size="small">
                <el-collapse-item title="堆栈跟踪" name="stack">
                  <pre>{{ error.stack }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </template>
      </el-alert>
    </div>

    <!-- 解决建议 -->
    <div class="error-suggestions" v-if="suggestions.length > 0">
      <h4>解决建议</h4>
      <div class="suggestion-list">
        <div 
          v-for="(suggestion, index) in suggestions" 
          :key="index"
          class="suggestion-item"
        >
          <div class="suggestion-header">
            <el-icon :size="16" color="#409eff">
              <InfoFilled />
            </el-icon>
            <span class="suggestion-title">{{ suggestion.title }}</span>
          </div>
          <p class="suggestion-description">{{ suggestion.description }}</p>
          <div class="suggestion-actions" v-if="suggestion.actions">
            <el-button
              v-for="action in suggestion.actions"
              :key="action.label"
              :type="action.type || 'primary'"
              :icon="action.icon"
              @click="executeAction(action)"
              size="small"
            >
              {{ action.label }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 常见问题 -->
    <div class="common-issues" v-if="showCommonIssues">
      <h4>常见问题</h4>
      <el-collapse>
        <el-collapse-item
          v-for="(issue, index) in commonIssues"
          :key="index"
          :title="issue.question"
          :name="index.toString()"
        >
          <div class="issue-answer">
            <p>{{ issue.answer }}</p>
            <div class="issue-actions" v-if="issue.actions">
              <el-button
                v-for="action in issue.actions"
                :key="action.label"
                :type="action.type || 'primary'"
                :icon="action.icon"
                @click="executeAction(action)"
                size="small"
              >
                {{ action.label }}
              </el-button>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 操作按钮 -->
    <div class="error-actions">
      <el-button-group>
        <el-button 
          :icon="Refresh" 
          @click="retryOperation"
          :loading="isRetrying"
          type="primary"
        >
          重试
        </el-button>
        <el-button 
          :icon="Download" 
          @click="exportErrorLog"
          :loading="isExporting"
        >
          导出日志
        </el-button>
        <el-button 
          :icon="ChatDotRound" 
          @click="reportIssue"
        >
          报告问题
        </el-button>
        <el-button 
          :icon="Close" 
          @click="dismissError"
        >
          忽略
        </el-button>
      </el-button-group>
    </div>

    <!-- 报告问题对话框 -->
    <el-dialog
      v-model="reportDialogVisible"
      title="报告问题"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="reportForm" label-width="80px">
        <el-form-item label="问题类型">
          <el-select v-model="reportForm.type" placeholder="请选择问题类型">
            <el-option label="启动失败" value="startup_failure" />
            <el-option label="运行错误" value="runtime_error" />
            <el-option label="配置问题" value="config_issue" />
            <el-option label="性能问题" value="performance_issue" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input
            v-model="reportForm.description"
            type="textarea"
            :rows="4"
            placeholder="请详细描述遇到的问题..."
          />
        </el-form-item>
        <el-form-item label="联系方式">
          <el-input
            v-model="reportForm.contact"
            placeholder="邮箱或其他联系方式（可选）"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="reportForm.includeErrorLog">
            包含错误日志
          </el-checkbox>
          <el-checkbox v-model="reportForm.includeSystemInfo">
            包含系统信息
          </el-checkbox>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="reportDialogVisible = false">取消</el-button>
        <el-button 
          type="primary" 
          @click="submitReport"
          :loading="isSubmittingReport"
        >
          提交报告
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  InfoFilled,
  Refresh,
  Download,
  ChatDotRound,
  Close
} from '@element-plus/icons-vue'

// 错误信息接口
interface ErrorInfo {
  id: string
  title: string
  message: string
  type: string
  severity: 'error' | 'warning' | 'info'
  timestamp: string
  appId?: string
  appName?: string
  code?: string
  details?: string
  stack?: string
  metadata?: Record<string, any>
}

// 解决建议接口
interface Suggestion {
  title: string
  description: string
  actions?: Array<{
    label: string
    type?: string
    icon?: any
    action: string
    params?: any
  }>
}

// 常见问题接口
interface CommonIssue {
  question: string
  answer: string
  actions?: Array<{
    label: string
    type?: string
    icon?: any
    action: string
    params?: any
  }>
}

// Props
interface Props {
  error: ErrorInfo | null
  showCommonIssues?: boolean
  autoSuggest?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showCommonIssues: true,
  autoSuggest: true
})

// Emits
const emit = defineEmits<{
  'retry': [errorId: string]
  'dismiss': [errorId: string]
  'action-executed': [action: string, params?: any]
}>()

// 响应式数据
const isRetrying = ref(false)
const isExporting = ref(false)
const isSubmittingReport = ref(false)
const reportDialogVisible = ref(false)
const suggestions = ref<Suggestion[]>([])
const reportForm = ref({
  type: '',
  description: '',
  contact: '',
  includeErrorLog: true,
  includeSystemInfo: true
})

// 常见问题数据
const commonIssues = ref<CommonIssue[]>([
  {
    question: '应用启动失败，提示端口被占用',
    answer: '这通常是因为指定的端口已经被其他应用使用。您可以尝试更改应用配置中的端口号，或者停止占用该端口的其他应用。',
    actions: [
      {
        label: '检查端口占用',
        action: 'check_port',
        icon: 'Search'
      },
      {
        label: '修改端口配置',
        action: 'edit_port_config',
        icon: 'Edit'
      }
    ]
  },
  {
    question: '应用启动后立即停止',
    answer: '这可能是由于应用配置错误、依赖缺失或启动命令不正确导致的。请检查应用的启动命令和配置文件。',
    actions: [
      {
        label: '查看启动日志',
        action: 'view_startup_logs',
        icon: 'Document'
      },
      {
        label: '检查配置',
        action: 'check_config',
        icon: 'Setting'
      }
    ]
  },
  {
    question: '无法连接到应用',
    answer: '请确认应用已正常启动，端口配置正确，防火墙设置允许访问该端口。',
    actions: [
      {
        label: '测试连接',
        action: 'test_connection',
        icon: 'Link'
      },
      {
        label: '检查防火墙',
        action: 'check_firewall',
        icon: 'Shield'
      }
    ]
  }
])

// 方法
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

const generateSuggestions = () => {
  if (!props.error) return

  const newSuggestions: Suggestion[] = []

  // 根据错误类型生成建议
  switch (props.error.type) {
    case 'port_occupied':
      newSuggestions.push({
        title: '端口被占用',
        description: '指定的端口已被其他应用使用，建议更改端口配置或停止占用端口的应用。',
        actions: [
          {
            label: '检查端口占用',
            action: 'check_port',
            params: { port: props.error.metadata?.port }
          },
          {
            label: '自动分配端口',
            action: 'auto_assign_port',
            type: 'primary'
          }
        ]
      })
      break

    case 'config_error':
      newSuggestions.push({
        title: '配置错误',
        description: '应用配置文件存在错误，请检查配置文件的语法和内容。',
        actions: [
          {
            label: '验证配置',
            action: 'validate_config',
            type: 'primary'
          },
          {
            label: '重置为默认配置',
            action: 'reset_config'
          }
        ]
      })
      break

    case 'dependency_missing':
      newSuggestions.push({
        title: '依赖缺失',
        description: '应用所需的依赖项未安装或版本不匹配，请安装相关依赖。',
        actions: [
          {
            label: '安装依赖',
            action: 'install_dependencies',
            type: 'primary'
          },
          {
            label: '检查依赖版本',
            action: 'check_dependencies'
          }
        ]
      })
      break

    case 'permission_denied':
      newSuggestions.push({
        title: '权限不足',
        description: '应用没有足够的权限访问所需的资源，请检查文件权限或以管理员身份运行。',
        actions: [
          {
            label: '修复权限',
            action: 'fix_permissions',
            type: 'primary'
          },
          {
            label: '以管理员运行',
            action: 'run_as_admin'
          }
        ]
      })
      break

    default:
      newSuggestions.push({
        title: '通用解决方案',
        description: '尝试重新启动应用，或检查应用日志获取更多信息。',
        actions: [
          {
            label: '重新启动',
            action: 'restart_app',
            type: 'primary'
          },
          {
            label: '查看详细日志',
            action: 'view_logs'
          }
        ]
      })
  }

  suggestions.value = newSuggestions
}

const executeAction = (action: any) => {
  emit('action-executed', action.action, action.params)
  
  // 执行特定操作
  switch (action.action) {
    case 'check_port':
      checkPortOccupation(action.params?.port)
      break
    case 'auto_assign_port':
      autoAssignPort()
      break
    case 'validate_config':
      validateConfig()
      break
    case 'install_dependencies':
      installDependencies()
      break
    case 'view_logs':
      viewDetailedLogs()
      break
    default:
      ElMessage.info(`执行操作: ${action.label}`)
  }
}

const checkPortOccupation = (port?: number) => {
  ElMessage.info(`检查端口 ${port || '未知'} 的占用情况...`)
  // 实际实现中会调用API检查端口占用
}

const autoAssignPort = () => {
  ElMessage.info('自动分配可用端口...')
  // 实际实现中会调用API自动分配端口
}

const validateConfig = () => {
  ElMessage.info('验证应用配置...')
  // 实际实现中会调用API验证配置
}

const installDependencies = () => {
  ElMessage.info('安装应用依赖...')
  // 实际实现中会调用API安装依赖
}

const viewDetailedLogs = () => {
  ElMessage.info('打开详细日志...')
  // 实际实现中会打开日志查看器
}

const retryOperation = async () => {
  if (!props.error || isRetrying.value) return
  
  isRetrying.value = true
  
  try {
    emit('retry', props.error.id)
    ElMessage.success('重试操作已启动')
  } catch (error) {
    ElMessage.error('重试操作失败')
  } finally {
    isRetrying.value = false
  }
}

const exportErrorLog = async () => {
  if (!props.error || isExporting.value) return
  
  isExporting.value = true
  
  try {
    const logData = {
      error: props.error,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }
    
    const blob = new Blob([JSON.stringify(logData, null, 2)], {
      type: 'application/json'
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-log-${props.error.id}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    ElMessage.success('错误日志导出成功')
  } catch (error) {
    ElMessage.error('导出错误日志失败')
  } finally {
    isExporting.value = false
  }
}

const reportIssue = () => {
  reportForm.value = {
    type: '',
    description: props.error?.message || '',
    contact: '',
    includeErrorLog: true,
    includeSystemInfo: true
  }
  reportDialogVisible.value = true
}

const submitReport = async () => {
  if (!reportForm.value.type || !reportForm.value.description) {
    ElMessage.warning('请填写问题类型和描述')
    return
  }
  
  isSubmittingReport.value = true
  
  try {
    const reportData: Record<string, any> = {
      ...reportForm.value,
      errorId: props.error?.id,
      timestamp: new Date().toISOString()
    }
    
    if (reportForm.value.includeErrorLog) {
      reportData.errorLog = props.error
    }
    
    if (reportForm.value.includeSystemInfo) {
      reportData.systemInfo = {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    }
    
    // 实际实现中会调用API提交报告
    console.log('提交问题报告:', reportData)
    
    ElMessage.success('问题报告提交成功')
    reportDialogVisible.value = false
  } catch (error) {
    ElMessage.error('提交问题报告失败')
  } finally {
    isSubmittingReport.value = false
  }
}

const dismissError = () => {
  if (props.error) {
    emit('dismiss', props.error.id)
  }
}

// 生命周期
onMounted(() => {
  if (props.autoSuggest && props.error) {
    generateSuggestions()
  }
})

// 监听错误变化
watch(() => props.error, () => {
  if (props.autoSuggest && props.error) {
    generateSuggestions()
  }
}, { immediate: true })
</script>

<style scoped>
.error-handler {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.error-overview {
  margin-bottom: 20px;
}

.error-content {
  margin-top: 12px;
}

.error-meta {
  margin-bottom: 12px;
}

.error-meta p {
  margin: 4px 0;
  font-size: 13px;
  color: #606266;
}

.error-details pre,
.error-stack pre {
  margin: 0;
  font-size: 11px;
  color: #606266;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}

.error-suggestions,
.common-issues {
  margin-bottom: 20px;
}

.error-suggestions h4,
.common-issues h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-item {
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafafa;
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-title {
  font-weight: 600;
  color: #303133;
}

.suggestion-description {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.4;
}

.suggestion-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.issue-answer {
  font-size: 13px;
  color: #606266;
  line-height: 1.4;
}

.issue-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.error-actions {
  padding: 16px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
  display: flex;
  justify-content: center;
}
</style>
