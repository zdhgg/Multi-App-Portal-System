<template>
  <div class="app-configuration">
    <!-- 配置头部 -->
    <div class="config-header">
      <div class="header-info">
        <h2>
          <el-icon><Setting /></el-icon>
          {{ appName }} - 应用配置
        </h2>
        <p class="config-description">
          配置应用的运行参数、环境变量、端口设置等
        </p>
      </div>
      <div class="header-actions">
        <el-button @click="loadTemplate" :loading="loadingTemplate">
          <el-icon><Document /></el-icon>
          加载模板
        </el-button>
        <el-button @click="validateConfig" :loading="validating">
          <el-icon><CircleCheck /></el-icon>
          验证配置
        </el-button>
        <el-button type="primary" @click="saveConfiguration" :loading="saving">
          <el-icon><Check /></el-icon>
          保存配置
        </el-button>
      </div>
    </div>

    <!-- 配置表单 -->
    <el-form
      ref="configFormRef"
      :model="configuration"
      :rules="formRules"
      label-width="120px"
      class="config-form"
    >
      <!-- 基础信息 -->
      <el-card class="config-section">
        <template #header>
          <div class="section-header">
            <el-icon><InfoFilled /></el-icon>
            <span>基础信息</span>
          </div>
        </template>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="配置名称" prop="name">
              <el-input v-model="configuration.name" placeholder="输入配置名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="版本" prop="version">
              <el-input v-model="configuration.version" placeholder="1.0.0" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="configuration.description"
            type="textarea"
            :rows="2"
            placeholder="配置描述（可选）"
          />
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="工作目录" prop="workingDirectory">
              <el-input v-model="configuration.workingDirectory" placeholder="应用工作目录" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启动命令" prop="startCommand">
              <el-input v-model="configuration.startCommand" placeholder="npm start" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="停止命令" prop="stopCommand">
          <el-input v-model="configuration.stopCommand" placeholder="停止命令（可选）" />
        </el-form-item>

        <el-form-item label="前端绑定路径" prop="accessPath">
          <el-input
            v-model="configuration.accessPath"
            placeholder="/management.html（留空则自动探测）"
            clearable
          />
          <div class="form-help-text">
            仅填写路径部分，例如 <code>/management.html</code> 或 <code>/index.html</code>，不需要填写域名和端口。
          </div>
        </el-form-item>
      </el-card>

      <!-- 端口配置迁移提示 -->
      <el-card class="config-section port-migration-card">
        <template #header>
          <div class="section-header">
            <el-icon><Connection /></el-icon>
            <span>端口配置</span>
            <el-tag type="info" size="small">已迁移</el-tag>
          </div>
        </template>

        <div class="port-migration-compact">
          <span class="port-migration-text">端口分配与冲突管理已迁移到端口管理中心。</span>
          <el-button type="primary" @click="navigateToPortManagement">前往端口管理中心</el-button>
        </div>
      </el-card>

      <!-- 环境变量 -->
      <el-card class="config-section">
        <template #header>
          <div class="section-header">
            <el-icon><Key /></el-icon>
            <span>环境变量</span>
            <el-button size="small" @click="addEnvironmentVariable" class="add-btn">
              <el-icon><Plus /></el-icon>
              添加变量
            </el-button>
          </div>
        </template>
        
        <div class="env-vars-list">
          <el-row class="env-vars-header" :gutter="16">
            <el-col :span="5">变量名</el-col>
            <el-col :span="6">值</el-col>
            <el-col :span="7">描述</el-col>
            <el-col :span="2" class="env-vars-switch-col">必需</el-col>
            <el-col :span="2" class="env-vars-switch-col">敏感</el-col>
            <el-col :span="2" class="env-vars-action-col">操作</el-col>
          </el-row>

          <div
            v-for="(envVar, index) in configuration.environmentVariables"
            :key="index"
            class="env-var-item"
          >
            <el-row :gutter="16" class="env-var-row">
              <el-col :span="5">
                <el-input v-model="envVar.key" :placeholder="`变量 ${index + 1}`" />
              </el-col>
              <el-col :span="6">
                <el-input
                  v-model="envVar.value"
                  :type="envVar.sensitive ? 'password' : 'text'"
                  placeholder="变量值"
                  show-password
                />
              </el-col>
              <el-col :span="7">
                <el-input v-model="envVar.description" placeholder="变量描述（可选）" />
              </el-col>
              <el-col :span="2" class="env-vars-switch-col">
                <el-switch v-model="envVar.required" />
              </el-col>
              <el-col :span="2" class="env-vars-switch-col">
                <el-switch v-model="envVar.sensitive" />
              </el-col>
              <el-col :span="2" class="env-vars-action-col">
                <el-button
                  type="danger"
                  size="small"
                  @click="removeEnvironmentVariable(index)"
                  :icon="Delete"
                  circle
                />
              </el-col>
            </el-row>
          </div>
          
          <el-empty v-if="configuration.environmentVariables.length === 0" description="暂无环境变量">
            <el-button @click="addEnvironmentVariable">添加第一个环境变量</el-button>
          </el-empty>
        </div>
      </el-card>

      <!-- 运行时配置 -->
      <el-card class="config-section">
        <template #header>
          <div class="section-header">
            <el-icon><Timer /></el-icon>
            <span>运行时配置</span>
          </div>
        </template>

        <div class="runtime-grid">
          <div class="runtime-field">
            <div class="runtime-label">默认启动模式</div>
            <el-select
              v-model="configuration.runtimeConfig.launchMethod"
              class="runtime-control"
              placeholder="选择启动模式"
            >
              <el-option label="开发模式（直接启动）" value="development" />
              <el-option label="生产模式（PM2守护）" value="production" />
            </el-select>
          </div>

          <div class="runtime-field">
            <div class="runtime-label">包管理器</div>
            <el-select
              v-model="configuration.runtimeConfig.packageManager"
              class="runtime-control"
              placeholder="选择包管理器"
            >
              <el-option label="npm" value="npm" />
              <el-option label="yarn" value="yarn" />
              <el-option label="pnpm" value="pnpm" />
            </el-select>
          </div>

          <div class="runtime-field">
            <div class="runtime-label">启动超时 (ms)</div>
            <el-input-number
              v-model="configuration.runtimeConfig.startupTimeout"
              class="runtime-control"
              :min="5000"
              :max="300000"
              :step="5000"
            />
          </div>

          <div class="runtime-field">
            <div class="runtime-label">健康检查间隔 (ms)</div>
            <el-input-number
              v-model="configuration.runtimeConfig.healthCheckInterval"
              class="runtime-control"
              :min="1000"
              :max="60000"
              :step="1000"
            />
          </div>

          <div class="runtime-field">
            <div class="runtime-label">健康检查 URL</div>
            <el-input
              v-model="configuration.runtimeConfig.healthCheckUrl"
              class="runtime-control"
              placeholder="/health"
            />
          </div>

          <div class="runtime-field runtime-switch-field">
            <div class="runtime-label">失败重启</div>
            <div class="runtime-switch-wrap">
              <el-switch v-model="configuration.runtimeConfig.restartOnFailure" />
            </div>
          </div>

          <div class="runtime-field">
            <div class="runtime-label">最大重试次数</div>
            <el-input-number
              v-model="configuration.runtimeConfig.maxRestartAttempts"
              class="runtime-control"
              :min="0"
              :max="10"
            />
          </div>
        </div>
      </el-card>
    </el-form>

    <!-- 模板选择对话框 -->
    <el-dialog
      v-model="templateDialogVisible"
      title="选择配置模板"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="template-selection">
        <div class="template-filters">
          <el-select v-model="selectedTechStack" placeholder="筛选技术栈" clearable @change="loadTemplates">
            <el-option
              v-for="stack in techStacks"
              :key="stack"
              :label="stack"
              :value="stack"
            />
          </el-select>
        </div>
        
        <div class="templates-grid">
          <div
            v-for="template in filteredTemplates"
            :key="template.id"
            class="template-card"
            :class="{ active: selectedTemplate?.id === template.id }"
            @click="selectTemplate(template)"
          >
            <div class="template-header">
              <h4>{{ template.name }}</h4>
              <el-tag :type="getCategoryTagType(template.category)">
                {{ getCategoryDisplayName(template.category) }}
              </el-tag>
            </div>
            <p class="template-description">{{ template.description }}</p>
            <div class="template-meta">
              <span class="tech-stack">{{ template.techStack }}</span>
              <span class="builtin" v-if="template.isBuiltin">内置模板</span>
            </div>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyTemplate" :disabled="!selectedTemplate">
          应用模板
        </el-button>
      </template>
    </el-dialog>

    <!-- 验证结果对话框 -->
    <el-dialog
      v-model="validationDialogVisible"
      title="配置验证结果"
      width="600px"
    >
      <div class="validation-results">
        <div v-if="validationResult?.isValid" class="validation-success">
          <el-icon class="success-icon"><CircleCheck /></el-icon>
          <h3>配置验证通过</h3>
          <p>所有配置项都符合要求，可以安全保存和应用。</p>
        </div>
        
        <div v-else class="validation-errors">
          <el-icon class="error-icon"><CircleClose /></el-icon>
          <h3>配置验证失败</h3>
          
          <div v-if="validationResult?.errors?.length" class="errors-list">
            <h4>错误列表：</h4>
            <ul>
              <li v-for="error in validationResult.errors" :key="error.field" class="error-item">
                <strong>{{ error.field }}:</strong> {{ error.message }}
              </li>
            </ul>
          </div>
          
          <div v-if="validationResult?.warnings?.length" class="warnings-list">
            <h4>警告列表：</h4>
            <ul>
              <li v-for="warning in validationResult.warnings" :key="warning.field" class="warning-item">
                <strong>{{ warning.field }}:</strong> {{ warning.message }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="validationDialogVisible = false">关闭</el-button>
        <el-button
          v-if="validationResult?.isValid"
          type="primary"
          @click="saveConfiguration"
        >
          保存配置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  Setting,
  Document,
  CircleCheck,
  Check,
  InfoFilled,
  Connection,
  Plus,
  Delete,
  Key,
  Timer,
  CircleClose
} from '@element-plus/icons-vue'
import {
  appsApiService,
  appConfigApiService,
  type AppConfiguration,
  type ConfigurationTemplate,
  type ValidationResult
} from '@/services'

// Props
interface Props {
  appId: string
  appName: string
  techStack?: string
  workingDirectory?: string
  initialAccessPath?: string
  visible: boolean
}

const props = withDefaults(defineProps<Props>(), {
  techStack: '',
  workingDirectory: '',
  initialAccessPath: '',
  visible: false
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'saved': [config: AppConfiguration]
  'close': []
}>()

// 响应式数据
const configFormRef = ref<FormInstance>()
const configuration = reactive<AppConfiguration>({
  appId: props.appId,
  name: `${props.appName} 配置`,
  description: '',
  version: '1.0.0',
  workingDirectory: props.workingDirectory || '',
  startCommand: '',
  stopCommand: '',
  accessPath: props.initialAccessPath || '',
  ports: [],
  environmentVariables: [],
  startupParameters: [],
  buildConfig: {},
  runtimeConfig: {
    launchMethod: 'development',
    packageManager: 'npm',
    startupTimeout: 30000,
    healthCheckInterval: 10000,
    restartOnFailure: true,
    maxRestartAttempts: 3
  },
  tags: [],
  isActive: true
})

// 状态管理
const saving = ref(false)
const validating = ref(false)
const loadingTemplate = ref(false)
const templateDialogVisible = ref(false)
const validationDialogVisible = ref(false)

// 模板相关
const templates = ref<ConfigurationTemplate[]>([])
const selectedTemplate = ref<ConfigurationTemplate | null>(null)
const selectedTechStack = ref('')
const techStacks = ref<string[]>([])

// 验证结果
const validationResult = ref<ValidationResult | null>(null)

const normalizeAccessPath = (pathValue?: string | null): string => {
  if (typeof pathValue !== 'string') return ''
  const trimmed = pathValue.trim()
  if (!trimmed || trimmed === '/') return ''
  const normalized = trimmed.replace(/\\/g, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

const validateAccessPath = (
  _rule: unknown,
  value: string | undefined,
  callback: (error?: Error) => void
) => {
  const rawValue = typeof value === 'string' ? value.trim() : ''
  if (!rawValue || rawValue === '/') {
    callback()
    return
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawValue) || rawValue.includes('://')) {
    callback(new Error('前端绑定路径不能是完整URL，请仅填写路径'))
    return
  }

  const normalized = normalizeAccessPath(rawValue)
  const pathOnly = normalized.split('?')[0]?.split('#')[0] || normalized
  if (pathOnly.includes('..')) {
    callback(new Error('前端绑定路径不能包含 ..'))
    return
  }

  callback()
}

// 表单验证规则
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入配置名称', trigger: 'blur' }
  ],
  version: [
    { required: true, message: '请输入版本号', trigger: 'blur' }
  ],
  workingDirectory: [
    { required: true, message: '请输入工作目录', trigger: 'blur' }
  ],
  startCommand: [
    { required: true, message: '请输入启动命令', trigger: 'blur' }
  ],
  accessPath: [
    { validator: validateAccessPath, trigger: 'blur' },
    { validator: validateAccessPath, trigger: 'change' }
  ]
}

// 计算属性
const filteredTemplates = computed(() => {
  if (!selectedTechStack.value) {
    return templates.value
  }
  return templates.value.filter(t => t.techStack === selectedTechStack.value)
})

// 监听器
watch(() => props.visible, (newVal) => {
  if (newVal) {
    initializeConfiguration()
  }
})

watch(() => props.techStack, (newVal) => {
  if (newVal && configuration.ports.length === 0) {
    // 根据技术栈设置默认配置
    const defaultConfig = appConfigApiService.getDefaultConfiguration(
      newVal,
      props.appName,
      props.workingDirectory || ''
    )
    Object.assign(configuration, defaultConfig)
    applyInitialAccessPathFallback()
  }
})

// 生命周期
onMounted(() => {
  if (props.visible) {
    initializeConfiguration()
  }
})

// 方法
const applyInitialAccessPathFallback = () => {
  if (typeof configuration.accessPath === 'string' && configuration.accessPath.trim() !== '') {
    configuration.accessPath = normalizeAccessPath(configuration.accessPath)
    return
  }

  const normalizedInitialPath = normalizeAccessPath(props.initialAccessPath)
  if (normalizedInitialPath) {
    configuration.accessPath = normalizedInitialPath
  }
}

const initializeConfiguration = async () => {
  try {
    configuration.appId = props.appId
    // 尝试加载现有配置
    const response = await appConfigApiService.getAppConfiguration(props.appId)
    if (response.success && response.data) {
      Object.assign(configuration, response.data)
      applyInitialAccessPathFallback()
    } else if (props.techStack) {
      // 使用默认配置
      const defaultConfig = appConfigApiService.getDefaultConfiguration(
        props.techStack,
        props.appName,
        props.workingDirectory || ''
      )
      Object.assign(configuration, defaultConfig)
      applyInitialAccessPathFallback()
    }
  } catch (error) {
    console.warn('Failed to load existing configuration, using defaults:', error)
    if (props.techStack) {
      const defaultConfig = appConfigApiService.getDefaultConfiguration(
        props.techStack,
        props.appName,
        props.workingDirectory || ''
      )
      Object.assign(configuration, defaultConfig)
      applyInitialAccessPathFallback()
    }
  }

  applyInitialAccessPathFallback()
}

// 端口配置方法已迁移到端口管理中心

const addEnvironmentVariable = () => {
  configuration.environmentVariables.push({
    key: '',
    value: '',
    description: '',
    required: false,
    sensitive: false
  })
}

const removeEnvironmentVariable = (index: number) => {
  configuration.environmentVariables.splice(index, 1)
}

const loadTemplate = async () => {
  loadingTemplate.value = true
  try {
    await loadTemplates()
    templateDialogVisible.value = true
  } catch (error) {
    ElMessage.error('加载模板失败')
  } finally {
    loadingTemplate.value = false
  }
}

const loadTemplates = async () => {
  try {
    const response = await appConfigApiService.getConfigurationTemplates(selectedTechStack.value)
    if (response.success) {
      templates.value = response.data || []
      // 提取技术栈列表
      const stacks = [...new Set(templates.value.map(t => t.techStack))]
      techStacks.value = stacks
    }
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

const selectTemplate = (template: ConfigurationTemplate) => {
  selectedTemplate.value = template
}

const applyTemplate = () => {
  if (!selectedTemplate.value) return
  
  // 应用模板配置
  const template = selectedTemplate.value.template
  if (template.ports) configuration.ports = [...template.ports]
  if (template.environmentVariables) configuration.environmentVariables = [...template.environmentVariables]
  if (template.startCommand) configuration.startCommand = template.startCommand
  if (template.stopCommand) configuration.stopCommand = template.stopCommand
  if (template.accessPath !== undefined) configuration.accessPath = normalizeAccessPath(template.accessPath)
  if (template.buildConfig) configuration.buildConfig = { ...template.buildConfig }
  if (template.runtimeConfig) configuration.runtimeConfig = { ...configuration.runtimeConfig, ...template.runtimeConfig }
  
  templateDialogVisible.value = false
  selectedTemplate.value = null
  ElMessage.success('模板应用成功')
}

const validateConfig = async () => {
  validating.value = true
  try {
    const response = await appConfigApiService.validateConfiguration(configuration)
    if (response.success) {
      validationResult.value = response.data ?? null
      validationDialogVisible.value = true
    } else {
      ElMessage.error('验证请求失败')
    }
  } catch (error) {
    ElMessage.error('配置验证失败')
  } finally {
    validating.value = false
  }
}

const syncAccessPathToApplication = async () => {
  const normalizedPath = normalizeAccessPath(configuration.accessPath)
  configuration.accessPath = normalizedPath

  const response = await appsApiService.updateApp(props.appId, {
    access_path: normalizedPath || ''
  })

  if (!response.success) {
    throw new Error(response.message || '前端绑定路径同步失败')
  }
}

const saveConfiguration = async () => {
  if (!configFormRef.value) return
  
  try {
    await configFormRef.value.validate()
  } catch {
    ElMessage.error('请检查表单填写')
    return
  }
  
  saving.value = true
  try {
    let response
    if (configuration.id) {
      // 更新现有配置
      response = await appConfigApiService.updateConfiguration(configuration.id, configuration)
    } else {
      // 创建新配置
      response = await appConfigApiService.createConfiguration(configuration)
    }
    
    if (response.success) {
      if (!configuration.id && response.data && typeof (response.data as any).id === 'string') {
        configuration.id = (response.data as any).id
      }

      try {
        await syncAccessPathToApplication()
      } catch (syncError) {
        console.warn('Failed to sync accessPath to application metadata:', syncError)
        ElMessage.warning('配置已保存，但前端绑定路径同步失败，请稍后重试')
      }

      ElMessage.success('配置保存成功')
      emit('saved', configuration)
      emit('update:visible', false)
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
    validationDialogVisible.value = false
  }
}

const getCategoryTagType = (category: string) => {
  const types: Record<string, string> = {
    frontend: 'primary',
    backend: 'success',
    fullstack: 'warning',
    static: 'info',
    api: 'danger'
  }
  return types[category] || 'info'
}

const getCategoryDisplayName = (category: string) => {
  const names: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    fullstack: '全栈',
    static: '静态',
    api: 'API'
  }
  return names[category] || category
}

// 端口配置迁移方法
const navigateToPortManagement = () => {
  if (typeof window !== 'undefined') {
    window.open('/ports', '_blank')
  }
}
</script>

<style scoped>
.app-configuration {
  padding: 0;
  background: #f5f7fa;
  height: 100%;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding: 16px 20px;
  background: white;
  border-radius: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.header-info h2 {
  margin: 0 0 8px 0;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-description {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.config-form {
  max-width: 1200px;
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px 20px;
}

.config-section {
  margin-bottom: 16px;
}

.form-help-text {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  position: relative;
}

.add-btn {
  margin-left: auto;
}

.port-item,
.env-var-item {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  margin-bottom: 12px;
  background: #fafafa;
}

.port-item:last-child,
.env-var-item:last-child {
  margin-bottom: 0;
}

.ports-list,
.env-vars-list {
  max-height: 400px;
  overflow-y: auto;
}

.env-vars-header {
  margin-bottom: 10px;
  padding: 0 4px;
  color: #909399;
  font-size: 12px;
  font-weight: 600;
}

.env-var-row {
  align-items: center;
}

.env-vars-switch-col {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}

.env-vars-action-col {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}

.template-selection {
  padding: 16px 0;
}

.template-filters {
  margin-bottom: 20px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.template-card {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  background: white;
}

.template-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.template-card.active {
  border-color: #409eff;
  background: #f0f9ff;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.template-header h4 {
  margin: 0;
  color: #303133;
}

.template-description {
  margin: 8px 0;
  color: #606266;
  font-size: 14px;
  line-height: 1.4;
}

.template-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.tech-stack {
  font-weight: 500;
}

.builtin {
  color: #67c23a;
}

.validation-results {
  padding: 16px 0;
}

.validation-success {
  text-align: center;
  color: #67c23a;
}

.validation-success .success-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.validation-success h3 {
  margin: 0 0 8px 0;
  color: #67c23a;
}

.validation-errors {
  color: #f56c6c;
}

.validation-errors .error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
  text-align: center;
}

.validation-errors h3 {
  margin: 0 0 16px 0;
  color: #f56c6c;
  text-align: center;
}

.errors-list,
.warnings-list {
  margin: 16px 0;
}

.errors-list h4,
.warnings-list h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.errors-list ul,
.warnings-list ul {
  margin: 0;
  padding-left: 20px;
}

.error-item {
  color: #f56c6c;
  margin-bottom: 4px;
}

.warning-item {
  color: #e6a23c;
  margin-bottom: 4px;
}

/* 端口迁移卡片样式 */
.port-migration-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border: 1px dashed #c0c4cc;
  border-radius: 8px;
}

.port-migration-text {
  color: #606266;
  font-size: 14px;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 14px;
}

.runtime-field {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.runtime-label {
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
  font-weight: 600;
}

.runtime-control {
  width: 100%;
}

.runtime-field :deep(.el-input-number) {
  width: 100%;
}

.runtime-field :deep(.el-select),
.runtime-field :deep(.el-input) {
  width: 100%;
}

.runtime-switch-field {
  display: flex;
  flex-direction: column;
}

.runtime-switch-wrap {
  min-height: 32px;
  display: flex;
  align-items: center;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .runtime-grid {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
}

@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .templates-grid {
    grid-template-columns: 1fr;
  }

  .port-migration-compact {
    flex-direction: column;
    align-items: flex-start;
  }

  .runtime-grid {
    grid-template-columns: 1fr;
  }
}
</style>
