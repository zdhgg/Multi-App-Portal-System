<template>
  <el-dialog
    v-model="visible"
    title="手动添加应用"
    width="800px"
    class="manual-add-dialog"
    modal-class="manual-add-dialog-overlay"
    :close-on-click-modal="false"
    @closed="handleDialogClosed"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
    >
      <el-form-item label="应用名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="请输入应用名称"
        />
      </el-form-item>

      <el-form-item label="应用描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="请输入应用描述"
        />
      </el-form-item>

      <el-form-item label="项目目录" prop="directory">
        <el-input
          v-model="form.directory"
          :placeholder="isExternalExeApp ? '请输入应用工作目录（通常是exe所在目录）' : '请输入项目根目录路径'"
        >
          <template #append>
            <el-dropdown
              trigger="click"
              :teleported="false"
              @command="handleDirectoryAction"
            >
              <el-button :loading="selectingDirectory || detecting">
                <el-icon><FolderOpened /></el-icon>
                目录操作
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="pick">
                    <el-icon><FolderOpened /></el-icon>
                    选择目录
                  </el-dropdown-item>
                  <el-dropdown-item command="detect" :disabled="isExternalExeApp">
                    <el-icon><Search /></el-icon>
                    检测项目
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="项目类型" prop="techStack">
        <!-- 内联检测状态条 -->
        <transition name="detection-status-fade">
          <div v-if="detectionStatus.visible" class="detection-status-bar" :class="`detection-status-bar--${detectionStatus.type}`">
            <el-icon class="detection-status-icon" :class="{ 'is-spinning': detectionStatus.type === 'detecting' }">
              <Loading v-if="detectionStatus.type === 'detecting'" />
              <CircleCheck v-else-if="detectionStatus.type === 'success'" />
              <Warning v-else />
            </el-icon>
            <span class="detection-status-text">{{ detectionStatus.message }}</span>
            <span v-if="detectionStatus.type === 'success' && detectionStatus.confidence" class="detection-confidence-badge">
              {{ detectionStatus.confidence }}
            </span>
            <el-button
              v-if="detectionStatus.type === 'failed'"
              link
              size="small"
              class="detection-retry-btn"
              @click="detectProject({})"
            >重新检测</el-button>
          </div>
        </transition>
        <div class="techstack-select-row">
          <el-select
            v-model="form.techStack"
            placeholder="请选择应用类型"
            style="flex: 1"
            filterable
            :teleported="false"
          >
            <el-option
              v-for="option in techStackOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
      </el-form-item>

      <el-form-item v-if="isExternalExeApp" label="可执行文件" prop="executablePath">
        <div class="exe-input-wrapper">
          <el-select
            v-model="form.executablePath"
            filterable
            allow-create
            default-first-option
            :teleported="false"
            placeholder="点击选择，或手动输入完整路径"
            style="width: 100%"
            no-data-text="未扫描到 .exe 文件"
          >
            <el-option
              v-for="file in exeScanState.files"
              :key="file.path"
              :value="file.path"
            >
              <div class="exe-suggestion-item">
                <span class="exe-suggestion-name">{{ file.name }}</span>
                <span class="exe-suggestion-path">{{ file.path }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="exeScanState.loading" class="exe-scan-hint">
            <el-icon class="is-spinning"><Loading /></el-icon>
            正在扫描 .exe 文件...
          </div>
          <div v-else-if="exeScanState.files.length > 0" class="exe-scan-hint">
            已在目录中找到 {{ exeScanState.files.length }} 个 .exe 文件，可下拉选择或手动输入
          </div>
          <div v-else-if="!exeScanState.loading && form.directory && exeScanState.scanned" class="exe-scan-hint exe-scan-hint--empty">
            目录中未找到 .exe 文件，请手动输入完整路径
          </div>
        </div>
      </el-form-item>

      <el-form-item label="端口配置">
        <div class="port-config">
          <div class="port-hint">
            主端口留空时将由系统自动分配。选择全栈项目时建议同时填写辅端口。
            <span v-if="form.techStack === 'fullstack'">
              当前范围：前端 {{ frontendPortRange.start }}-{{ frontendPortRange.end }}，
              后端 {{ backendPortRange.start }}-{{ backendPortRange.end }}
            </span>
          </div>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="主端口" prop="primaryPort">
                <el-input-number
                  v-model="form.primaryPort"
                  :min="primaryPortMin"
                  :max="primaryPortMax"
                  placeholder="主端口"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="secondaryPortLabel" prop="secondaryPort">
                <el-input-number
                  v-model="form.secondaryPort"
                  :min="secondaryPortMin"
                  :max="secondaryPortMax"
                  placeholder="辅端口（可选）"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </div>
      </el-form-item>

      <el-form-item label="应用图标">
        <el-select
          v-model="form.icon"
          placeholder="选择图标"
          style="width: 200px"
          :teleported="false"
        >
          <el-option
            v-for="icon in iconOptions"
            :key="icon.value"
            :label="icon.label"
            :value="icon.value"
          >
            <span>{{ icon.value }} {{ icon.label }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="主题颜色">
        <el-color-picker v-model="form.color" :teleported="false" />
      </el-form-item>
    </el-form>

    <!-- 检测结果展示 -->
    <el-card v-if="detectionResult" class="detection-result" shadow="never">
      <template #header>
        <span>🔍 检测结果</span>
      </template>
      <div class="result-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="检测类型">
            {{ detectionResult.enhanced ? '增强检测' : '传统检测' }}
          </el-descriptions-item>
          <el-descriptions-item label="项目类型">
            {{ detectionResult.enhanced?.type || detectionResult.traditional?.techStack || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="置信度">
            {{ detectionConfidence }}
          </el-descriptions-item>
          <el-descriptions-item label="组件数量" v-if="detectionResult.enhanced">
            {{ detectionResult.enhanced.componentCount ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="detectionResult.enhanced?.fullstackInfo" class="fullstack-info">
          <h4>🎯 全栈项目信息</h4>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="检测类型">
              {{ detectionResult.enhanced.fullstackInfo.detectionType || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="前端目录">
              {{ detectionResult.enhanced.fullstackInfo.frontendDirectory || detectionResult.enhanced.fullstackInfo.frontendPath || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="后端目录">
              {{ detectionResult.enhanced.fullstackInfo.backendDirectory || detectionResult.enhanced.fullstackInfo.backendPath || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="前端技术栈">
              {{ detectionResult.enhanced.fullstackInfo.frontendTechStack || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="后端技术栈">
              {{ detectionResult.enhanced.fullstackInfo.backendTechStack || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-if="detectionResult.enhanced?.portInfo" class="port-info">
          <h4>🔌 端口分配</h4>
          <el-tag
            v-if="detectionResult.enhanced.portInfo.main"
            type="primary"
            class="port-tag"
          >
            主端口: {{ detectionResult.enhanced.portInfo.main.port }}
          </el-tag>
          <el-tag
            v-if="detectionResult.enhanced.portInfo.frontend"
            type="success"
            class="port-tag"
          >
            前端: {{ detectionResult.enhanced.portInfo.frontend.port }}
          </el-tag>
          <el-tag
            v-if="detectionResult.enhanced.portInfo.backend"
            type="warning"
            class="port-tag"
          >
            后端: {{ detectionResult.enhanced.portInfo.backend.port }}
          </el-tag>
        </div>

        <el-button
          type="primary"
          size="small"
          @click="applyDetectionResult"
          style="margin-top: 16px"
        >
          应用检测结果
        </el-button>
      </div>
    </el-card>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          添加应用
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Search, FolderOpened, ArrowDown, Loading, CircleCheck, Warning } from '@element-plus/icons-vue'
import { ApiError } from '@/services/api'
import { getNativeDirectoryPickerFailureMessage } from '@/utils/directoryPicker'
import {
  detectionApiService,
  type SingleDirectoryDetectionData
} from '@/services/detectionApi'
import { filesystemApiService, type ExeFileItem } from '@/services/filesystemApi'
import {
  appsApiService,
  type AppCreateRequest
} from '@/services/appsApi'
import { usePortConfigStore } from '@/stores/portConfig'
import { getTechStackOptions } from '@/utils/techStackUtils'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const formRef = ref<FormInstance>()
const detecting = ref(false)
const selectingDirectory = ref(false)
const submitting = ref(false)
const detectionResult = ref<SingleDirectoryDetectionData | null>(null)
const lastDetectedDirectory = ref('')
const autoFilledName = ref('')
const autoSuggestedTechStack = ref('')

// 内联检测状态
type DetectionStatusType = 'detecting' | 'success' | 'failed'
const detectionStatus = reactive<{
  visible: boolean
  type: DetectionStatusType
  message: string
  confidence: string
  hideTimer: ReturnType<typeof setTimeout> | null
}>({
  visible: false,
  type: 'detecting',
  message: '',
  confidence: '',
  hideTimer: null
})

const showDetectionStatus = (type: DetectionStatusType, message: string, confidence = '', autoDismissMs = 0) => {
  if (detectionStatus.hideTimer) {
    clearTimeout(detectionStatus.hideTimer)
    detectionStatus.hideTimer = null
  }
  detectionStatus.type = type
  detectionStatus.message = message
  detectionStatus.confidence = confidence
  detectionStatus.visible = true
  if (autoDismissMs > 0) {
    detectionStatus.hideTimer = setTimeout(() => {
      detectionStatus.visible = false
    }, autoDismissMs)
  }
}

const hideDetectionStatus = () => {
  if (detectionStatus.hideTimer) {
    clearTimeout(detectionStatus.hideTimer)
    detectionStatus.hideTimer = null
  }
  detectionStatus.visible = false
}

// ===== EXE 文件扫描状态 =====
const exeScanState = reactive<{
  loading: boolean
  scanned: boolean
  files: ExeFileItem[]
}>({
  loading: false,
  scanned: false,
  files: []
})

const scanExeFilesForDirectory = async (directory: string) => {
  const trimmed = directory.trim()
  if (!trimmed || !isExternalExeApp.value) return

  exeScanState.loading = true
  exeScanState.scanned = false
  exeScanState.files = []
  try {
    const response = await filesystemApiService.scanExeFiles(trimmed)
    if (response.success && response.data) {
      exeScanState.files = response.data.files
    }
  } catch {
    // 扫描失败时静默降级，不影响手动输入
  } finally {
    exeScanState.loading = false
    exeScanState.scanned = true
  }
}

// el-autocomplete 的建议回调
const queryExeSuggestions = (_query: string, cb: (results: ExeFileItem[]) => void) => {
  cb(exeScanState.files)
}

const form = reactive({
  name: '',
  description: '',
  directory: '',
  techStack: '',
  executablePath: '',
  primaryPort: undefined as number | undefined,
  secondaryPort: undefined as number | undefined,
  icon: '🚀',
  color: '#007bff'
})

const isExternalExeApp = computed(() => form.techStack === 'external-exe')
const portConfigStore = usePortConfigStore()
const DEFAULT_FRONTEND_PORT_RANGE = { start: 3001, end: 3100 }
const DEFAULT_BACKEND_PORT_RANGE = { start: 8001, end: 8100 }

const normalizePortRange = (
  range: { start?: number; end?: number } | undefined,
  fallback: { start: number; end: number }
) => {
  const start = Number(range?.start)
  const end = Number(range?.end)
  if (Number.isInteger(start) && Number.isInteger(end) && start < end) {
    return { start, end }
  }
  return fallback
}

const frontendPortRange = computed(() =>
  normalizePortRange(portConfigStore.portConfig?.frontendRange, DEFAULT_FRONTEND_PORT_RANGE)
)

const backendPortRange = computed(() =>
  normalizePortRange(portConfigStore.portConfig?.backendRange, DEFAULT_BACKEND_PORT_RANGE)
)

const isFullStackApp = computed(() => form.techStack === 'fullstack')

const primaryPortMin = computed(() => (isFullStackApp.value ? frontendPortRange.value.start : 1))
const primaryPortMax = computed(() => (isFullStackApp.value ? frontendPortRange.value.end : 65535))
const secondaryPortMin = computed(() => (isFullStackApp.value ? backendPortRange.value.start : 1))
const secondaryPortMax = computed(() => (isFullStackApp.value ? backendPortRange.value.end : 65535))

const isPortInRange = (port: number, range: { start: number; end: number }): boolean => {
  return port >= range.start && port <= range.end
}

const validatePrimaryPort = (_rule: unknown, value: number | undefined, callback: (error?: Error) => void) => {
  if (value === undefined || value === null || value === 0) {
    callback()
    return
  }

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    callback(new Error('主端口必须在 1-65535 范围内'))
    return
  }

  if (isFullStackApp.value && !isPortInRange(value, frontendPortRange.value)) {
    callback(new Error(`全栈项目主端口必须在 ${frontendPortRange.value.start}-${frontendPortRange.value.end} 范围内`))
    return
  }

  if (form.secondaryPort && form.secondaryPort === value) {
    callback(new Error('主端口不能与辅端口相同'))
    return
  }

  callback()
}

const validateSecondaryPort = (_rule: unknown, value: number | undefined, callback: (error?: Error) => void) => {
  if (value === undefined || value === null || value === 0) {
    callback()
    return
  }

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    callback(new Error('辅端口必须在 1-65535 范围内'))
    return
  }

  if (isFullStackApp.value && !isPortInRange(value, backendPortRange.value)) {
    callback(new Error(`全栈项目后端端口必须在 ${backendPortRange.value.start}-${backendPortRange.value.end} 范围内`))
    return
  }

  if (form.primaryPort && form.primaryPort === value) {
    callback(new Error('辅端口不能与主端口相同'))
    return
  }

  callback()
}

const validateExecutablePath = (_rule: unknown, value: string | undefined, callback: (error?: Error) => void) => {
  if (!isExternalExeApp.value) {
    callback()
    return
  }

  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    callback(new Error('请输入可执行文件路径'))
    return
  }

  if (!normalized.toLowerCase().endsWith('.exe')) {
    callback(new Error('可执行文件路径应以 .exe 结尾'))
    return
  }

  callback()
}

const rules: FormRules = {
  name: [
    { required: true, message: '请输入应用名称', trigger: 'blur' }
  ],
  directory: [
    { required: true, message: '请输入项目目录', trigger: 'blur' }
  ],
  techStack: [
    { required: true, message: '请选择项目类型', trigger: 'change' }
  ],
  primaryPort: [
    { validator: validatePrimaryPort, trigger: 'change' }
  ],
  secondaryPort: [
    { validator: validateSecondaryPort, trigger: 'change' }
  ],
  executablePath: [
    { validator: validateExecutablePath, trigger: 'blur' }
  ]
}

const iconOptions: Array<{ value: string; label: string }> = [
  { value: '🚀', label: '火箭' },
  { value: '⚡', label: '闪电' },
  { value: '🎯', label: '目标' },
  { value: '💻', label: '电脑' },
  { value: '🌐', label: '网络' },
  { value: '📱', label: '手机' },
  { value: '🔧', label: '工具' },
  { value: '⚙️', label: '齿轮' },
  { value: '🎨', label: '调色板' },
  { value: '📊', label: '图表' }
]

const techStackOptions = computed(() => {
  const excluded = new Set(['typescript', 'javascript', 'vite', 'webpack'])
  const options = getTechStackOptions().filter(option => !excluded.has(option.value))
  const withoutExternalExe = options.filter(option => option.value !== 'external-exe')
  const externalExeOption = { label: 'External EXE', value: 'external-exe' }
  const mergedOptions = [externalExeOption, ...withoutExternalExe]
  if (options.some(option => option.value === 'fullstack')) {
    return mergedOptions
  }

  return [{ label: '全栈项目 (Frontend + Backend)', value: 'fullstack' }, ...mergedOptions]
})

const secondaryPortLabel = computed(() => (form.techStack === 'fullstack' ? '后端端口' : '辅端口'))

const detectionConfidence = computed(() => {
  const confidence = detectionResult.value?.enhanced?.confidence ?? detectionResult.value?.traditional?.confidence
  if (typeof confidence !== 'number') return '-'
  return `${(confidence * 100).toFixed(1)}%`
})

const normalizeDetectedTechStack = (techStack: string | undefined): string => {
  if (!techStack) return 'fullstack'
  const normalized = techStack.toLowerCase().trim()

  if (techStackOptions.value.some(option => option.value === normalized)) {
    return normalized
  }
  if (normalized.includes('react')) return 'react'
  if (normalized.includes('vue')) return 'vue'
  if (normalized.includes('angular')) return 'angular'
  if (normalized.includes('express')) return 'express'
  if (normalized.includes('nest')) return 'nestjs'
  if (normalized.includes('node')) return 'nodejs'
  if (normalized.includes('fullstack')) return 'fullstack'
  if (normalized.includes('static')) return 'static'
  return 'fullstack'
}

const extractDirectoryLeaf = (directoryPath: string): string => {
  const trimmedPath = directoryPath.trim().replace(/[\\/]+$/g, '')
  if (!trimmedPath) return ''
  const segments = trimmedPath.split(/[\\/]+/).filter(Boolean)
  return segments[segments.length - 1] || ''
}

const PLATFORM_SUFFIX_TOKENS = new Set([
  'windows', 'window', 'linux', 'mac', 'macos', 'darwin',
  'amd64', 'arm64', 'x64', 'x86', 'win64', 'win32'
])

const VERSION_PREFIX_TOKENS = new Set(['v', 'ver', 'version'])
const PRESERVED_ACRONYMS = new Set(['api', 'cli', 'cms', 'sdk', 'http', 'https', 'ui', 'ux', 'ai', 'ml', 'llm', 'db', 'pm2'])

const isVersionToken = (token: string): boolean => {
  const normalized = token.toLowerCase()
  return /^(?:v(?:er(?:sion)?)?)?\d+(?:\.\d+){0,3}$/.test(normalized)
}

const isNumericVersionToken = (token: string): boolean => {
  return /^\d+(?:\.\d+){0,3}$/.test(token)
}

const isPrereleaseToken = (token: string): boolean => {
  return /^(?:alpha|beta|rc)\d*$/i.test(token)
}

const trimNameSuffixTokens = (tokens: string[]): string[] => {
  const result = [...tokens]
  while (result.length > 0) {
    const last = result[result.length - 1]
    const lastLower = last.toLowerCase()
    const prev = result.length > 1 ? result[result.length - 2] : ''
    const prevLower = prev.toLowerCase()

    if (PLATFORM_SUFFIX_TOKENS.has(lastLower) || isPrereleaseToken(last)) {
      result.pop()
      continue
    }

    if (isVersionToken(last)) {
      result.pop()
      if (VERSION_PREFIX_TOKENS.has(prevLower)) {
        result.pop()
      }
      continue
    }

    if (isNumericVersionToken(last) && VERSION_PREFIX_TOKENS.has(prevLower)) {
      result.pop()
      result.pop()
      continue
    }

    if (VERSION_PREFIX_TOKENS.has(lastLower)) {
      result.pop()
      continue
    }

    break
  }

  return result
}

const formatNameToken = (token: string): string => {
  if (!token) return token
  if (/^\d+(?:\.\d+){0,3}$/.test(token)) return token

  const lower = token.toLowerCase()
  if (PRESERVED_ACRONYMS.has(lower)) {
    return lower.toUpperCase()
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

const buildSuggestedNameFromDirectory = (directoryPath: string): string => {
  const leaf = extractDirectoryLeaf(directoryPath)
  if (!leaf) return ''

  const normalized = leaf
    .replace(/\.exe$/i, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return ''

  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length === 0) return ''
  const trimmedTokens = trimNameSuffixTokens(tokens)
  const finalTokens = trimmedTokens.length > 0 ? trimmedTokens : tokens

  const expandedTokens = finalTokens
    .flatMap(token => token.replace(/[.]+/g, ' ').split(/\s+/))
    .filter(Boolean)

  return expandedTokens.map(formatNameToken).join(' ')
}

const inferTechStackFromDirectory = (directoryPath: string): string | undefined => {
  const normalizedPath = directoryPath.toLowerCase()

  // ===== 最高优先级：EXE 可执行程序包目录名识别 =====
  // 匹配常见的 Windows/Linux/macOS 平台发布包目录名模式
  // 例如：CLIProxyAPI_6.8.15_windows_amd64、myapp-v1.0-win64、tool_linux_arm64
  const exePackagePatterns = [
    /_windows_/,          // *_windows_*
    /_windows$/,          // *_windows
    /_win64/,             // *_win64*
    /_win32/,             // *_win32*
    /_linux_/,            // *_linux_*（跨平台工具包，通常也有 exe）
    /_linux$/,            // *_linux
    /_darwin_/,           // *_darwin_*
    /_darwin$/,           // *_darwin
    /_amd64/,             // *_amd64*（配合版本号出现时高度可信）
    /_arm64/,             // *_arm64*
    /_x86_64/,            // *_x86_64*
    /[-_]windows[-_]/,    // -windows- 或 _windows_
  ]

  // 同时要求目录名中含有版本号特征（避免误判普通含 amd64 字样的项目）
  const hasVersionLike = /[_-]v?\d+[._-]\d/.test(normalizedPath) || /[_-]\d+\.\d+/.test(normalizedPath)
  const hasExePackagePattern = exePackagePatterns.some(pattern => pattern.test(normalizedPath))

  if (hasExePackagePattern && (hasVersionLike || /_windows/.test(normalizedPath) || /_win\d+/.test(normalizedPath))) {
    if (techStackOptions.value.some(option => option.value === 'external-exe')) {
      return 'external-exe'
    }
  }

  // 规则按优先级排列：更具体的框架名放在前面，避免被通用词覆盖
  const inferenceRules: Array<{ keyword: string; techStack: string }> = [
    // 全栈框架（最高优先级）
    { keyword: 'next', techStack: 'nextjs' },
    { keyword: 'nuxt', techStack: 'nuxtjs' },
    { keyword: 'remix', techStack: 'remix' },
    { keyword: 'gatsby', techStack: 'gatsby' },
    // 前端框架
    { keyword: 'react', techStack: 'react' },
    { keyword: 'vue', techStack: 'vue' },
    { keyword: 'angular', techStack: 'angular' },
    { keyword: 'svelte', techStack: 'svelte' },
    // 后端框架（具体框架名优先）
    { keyword: 'nestjs', techStack: 'nestjs' },
    { keyword: 'nest-', techStack: 'nestjs' },
    { keyword: 'fastify', techStack: 'express' },
    { keyword: 'koa', techStack: 'express' },
    { keyword: 'express', techStack: 'express' },
    // 通用后端关键词（放在具体框架后面）
    { keyword: 'backend', techStack: 'nodejs' },
    { keyword: 'back-end', techStack: 'nodejs' },
    { keyword: '-api', techStack: 'nodejs' },
    { keyword: '_api', techStack: 'nodejs' },
    { keyword: '-server', techStack: 'nodejs' },
    { keyword: '_server', techStack: 'nodejs' },
    { keyword: 'node', techStack: 'nodejs' },
    // 静态网站
    { keyword: 'static', techStack: 'static-html' },
    { keyword: 'html', techStack: 'static-html' }
  ]

  for (const rule of inferenceRules) {
    if (!normalizedPath.includes(rule.keyword)) continue
    if (techStackOptions.value.some(option => option.value === rule.techStack)) {
      return rule.techStack
    }
  }
  return undefined
}

const applyAutoNameSuggestion = (name: string | undefined) => {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedName) return

  const currentName = form.name.trim()
  if (!currentName || currentName === autoFilledName.value) {
    form.name = normalizedName
    autoFilledName.value = normalizedName
  }
}

const applyAutoTechStackSuggestion = (techStack: string | undefined) => {
  const normalizedInput = typeof techStack === 'string' ? techStack.trim() : ''
  if (!normalizedInput) return
  const normalizedTechStack = normalizeDetectedTechStack(normalizedInput)
  if (!normalizedTechStack) return

  const currentTechStack = form.techStack.trim()
  if (!currentTechStack || currentTechStack === autoSuggestedTechStack.value) {
    form.techStack = normalizedTechStack
    autoSuggestedTechStack.value = normalizedTechStack
  }
}

const applyAutoDirectorySuggestions = (directoryPath: string) => {
  applyAutoNameSuggestion(buildSuggestedNameFromDirectory(directoryPath))
  applyAutoTechStackSuggestion(inferTechStackFromDirectory(directoryPath))
}

const applyAutoDetectionSuggestions = (result: SingleDirectoryDetectionData) => {
  applyAutoNameSuggestion(result.enhanced?.name)
  applyAutoTechStackSuggestion(result.enhanced?.type || result.traditional?.techStack)
}

const pickFirstPort = (ports: unknown): number | undefined => {
  if (!Array.isArray(ports)) return undefined
  for (const port of ports) {
    if (typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535) {
      return port
    }
  }
  return undefined
}

watch(
  () => form.directory,
  (nextValue) => {
    if (nextValue.trim() !== lastDetectedDirectory.value) {
      detectionResult.value = null
    }
    // 当类型为 external-exe 时，目录变化后自动扫描
    if (isExternalExeApp.value && nextValue.trim()) {
      scanExeFilesForDirectory(nextValue)
    }
  }
)

// 切换到 external-exe 类型时，如果目录已填写则自动扫描
watch(
  isExternalExeApp,
  (isExe) => {
    if (isExe && form.directory.trim()) {
      scanExeFilesForDirectory(form.directory)
    } else if (!isExe) {
      exeScanState.files = []
      exeScanState.scanned = false
    }
  }
)

watch(
  () => visible.value,
  async (opened) => {
    if (!opened) return
    try {
      await portConfigStore.loadConfig()
    } catch (error) {
      console.warn('加载端口配置失败，使用默认端口范围:', error)
    }
  },
  { immediate: true }
)

const selectProjectDirectory = async () => {
  if (selectingDirectory.value) return

  selectingDirectory.value = true
  try {
    const currentPath = form.directory.trim()
    const response = await filesystemApiService.selectFolder(currentPath || undefined, true)

    if (response.success && response.data) {
      if (response.data.cancelled) {
        ElMessage.info('已取消目录选择')
        return
      }

      const selectedPath = typeof response.data.path === 'string' ? response.data.path.trim() : ''
      if (selectedPath) {
        form.directory = selectedPath
        applyAutoDirectorySuggestions(selectedPath)
        ElMessage.success(`已选择目录: ${selectedPath}`)
        // 若前端推断已识别为 external-exe，跳过后端检测
        // （external-exe 是纯手动配置类型，后端检测无意义且会产生错误结果）
        if (isExternalExeApp.value) {
          return
        }
        await detectProject({
          autoApplySuggestions: true,
          silentOnError: true
        })
        return
      }
    }

    throw new Error(response.message || '未获取到有效目录路径')
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      ElMessage.info('已取消目录选择')
      return
    }

    const message = getNativeDirectoryPickerFailureMessage(error instanceof ApiError ? error : error)
    ElMessage.error(message)
  } finally {
    selectingDirectory.value = false
  }
}

const handleDirectoryAction = async (command: 'pick' | 'detect') => {
  if (command === 'pick') {
    await selectProjectDirectory()
    return
  }

  if (command === 'detect') {
    await detectProject({})
  }
}

const detectProject = async (options?: { autoApplySuggestions?: boolean; silentOnError?: boolean }) => {
  if (isExternalExeApp.value) {
    ElMessage.info('External EXE 类型无需项目检测')
    return
  }

  const normalizedDirectory = form.directory.trim()
  if (!normalizedDirectory) {
    ElMessage.warning('请先输入项目目录')
    return
  }

  detecting.value = true
  showDetectionStatus('detecting', '正在分析项目类型...')
  try {
    const response = await detectionApiService.detectDirectory({
      directory: normalizedDirectory
    })

    if (response.success && response.data) {
      detectionResult.value = response.data
      lastDetectedDirectory.value = normalizedDirectory

      // 计算置信度文本
      const confidence = response.data.enhanced?.confidence ?? response.data.traditional?.confidence
      const confidenceText = typeof confidence === 'number'
        ? `${(confidence * 100).toFixed(0)}% 置信度`
        : ''
      const detectedType = response.data.enhanced?.type || response.data.traditional?.techStack || ''

      if (options?.autoApplySuggestions) {
        applyAutoDetectionSuggestions(response.data)
        showDetectionStatus(
          'success',
          detectedType ? `已识别为 ${detectedType}` : '检测完成',
          confidenceText,
          4000
        )
      } else {
        showDetectionStatus(
          'success',
          detectedType ? `检测完成：${detectedType}` : '检测完成',
          confidenceText,
          4000
        )
        ElMessage.success('项目检测完成！')
      }
    } else {
      const errMsg = response.message || '项目检测失败'
      showDetectionStatus('failed', errMsg)
      if (!options?.silentOnError) {
        ElMessage.error(errMsg)
      }
    }
  } catch (error) {
    console.error('检测失败:', error)
    const message = error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : '请检查目录路径是否正确'
    showDetectionStatus('failed', options?.silentOnError ? '未能自动识别，可手动选择或点击重新检测' : `检测失败：${message}`)
    if (!options?.silentOnError) {
      ElMessage.error(`检测失败: ${message}`)
    }
  } finally {
    detecting.value = false
  }
}

const applyDetectionResult = () => {
  if (!detectionResult.value) return

  const result = detectionResult.value
  let skippedOutOfRange = false

  // 应用检测结果到表单
  if (result.enhanced) {
    form.name = result.enhanced.name || form.name
    form.techStack = normalizeDetectedTechStack(result.enhanced.type)

    const frontendPort =
      result.enhanced.portInfo?.frontend?.port ??
      result.enhanced.portInfo?.main?.port ??
      pickFirstPort(result.enhanced.fullstackInfo?.originalPorts?.frontend)

    const backendPort =
      result.enhanced.portInfo?.backend?.port ??
      pickFirstPort(result.enhanced.fullstackInfo?.originalPorts?.backend)

    if (frontendPort) {
      if (!isFullStackApp.value || isPortInRange(frontendPort, frontendPortRange.value)) {
        form.primaryPort = frontendPort
      } else {
        skippedOutOfRange = true
      }
    }
    if (backendPort) {
      if (!isFullStackApp.value || isPortInRange(backendPort, backendPortRange.value)) {
        form.secondaryPort = backendPort
      } else {
        skippedOutOfRange = true
      }
    }
  } else {
    form.techStack = normalizeDetectedTechStack(result.traditional?.techStack)
  }

  autoFilledName.value = form.name.trim()
  autoSuggestedTechStack.value = form.techStack.trim()
  if (skippedOutOfRange) {
    ElMessage.warning(
      `检测到的端口超出当前范围，已跳过：前端 ${frontendPortRange.value.start}-${frontendPortRange.value.end}，后端 ${backendPortRange.value.start}-${backendPortRange.value.end}`
    )
  }
  ElMessage.success('已应用检测结果到表单')
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (isFullStackApp.value) {
      if (typeof form.primaryPort === 'number' && !isPortInRange(form.primaryPort, frontendPortRange.value)) {
        ElMessage.error(`全栈项目主端口必须在 ${frontendPortRange.value.start}-${frontendPortRange.value.end} 范围内`)
        return
      }
      if (typeof form.secondaryPort === 'number' && !isPortInRange(form.secondaryPort, backendPortRange.value)) {
        ElMessage.error(`全栈项目后端端口必须在 ${backendPortRange.value.start}-${backendPortRange.value.end} 范围内`)
        return
      }
    }

    const appData: AppCreateRequest = {
      name: form.name,
      description: form.description,
      directory: form.directory.trim(),
      tech_stack: form.techStack,
      icon: form.icon,
      color: form.color,
      primary_port: form.primaryPort,
      secondary_port: form.secondaryPort,
      build_script: isExternalExeApp.value ? form.executablePath.trim() : undefined
    }

    const response = await appsApiService.createApp(appData)

    if (response.success) {
      ElMessage.success('应用添加成功！')
      visible.value = false
      emit('success')
      resetForm()
    } else {
      ElMessage.error(`添加失败: ${response.message || '未知错误'}`)
    }
  } catch (error) {
    console.error('添加应用失败:', error)
    const message = error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : '请重试'
    ElMessage.error(`添加失败: ${message}`)
  } finally {
    submitting.value = false
  }
}

const resetForm = () => {
  Object.assign(form, {
    name: '',
    description: '',
    directory: '',
    techStack: '',
    executablePath: '',
    primaryPort: undefined,
    secondaryPort: undefined,
    icon: '🚀',
    color: '#007bff'
  })
  detectionResult.value = null
  lastDetectedDirectory.value = ''
  autoFilledName.value = ''
  autoSuggestedTechStack.value = ''
  hideDetectionStatus()
  exeScanState.loading = false
  exeScanState.scanned = false
  exeScanState.files = []
  formRef.value?.resetFields()
}

const handleDialogClosed = () => {
  resetForm()
}
</script>

<style>
.manual-add-dialog-overlay.el-overlay,
.manual-add-dialog-overlay.el-overlay.el-modal-dialog,
.manual-add-dialog-overlay.el-overlay.el-modal-dialog:not([style*="display: none"]) {
  align-items: flex-start !important;
  overflow-y: auto !important;
  padding: 24px 0 !important;
}

.manual-add-dialog-overlay .el-overlay-dialog {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: center !important;
}

.manual-add-dialog {
  margin: 0 auto !important;
  max-height: calc(100vh - 48px) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.manual-add-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
</style>

<style scoped>
.port-config {
  width: 100%;
}

.port-hint {
  margin-bottom: 10px;
  color: #606266;
  font-size: 12px;
}

.detection-result {
  margin: 16px 0;
}

.result-content {
  padding: 16px 0;
}

.fullstack-info,
.port-info {
  margin-top: 16px;
}

.port-tag {
  margin-right: 8px;
  margin-bottom: 8px;
}

.dialog-footer {
  text-align: right;
}

/* ===== 内联检测状态条 ===== */
.techstack-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.detection-status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 6px;
  line-height: 1.4;
}

.detection-status-bar--detecting {
  background: #ecf5ff;
  color: #409eff;
  border: 1px solid #d9ecff;
}

.detection-status-bar--success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.detection-status-bar--failed {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

.detection-status-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.detection-status-icon.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.detection-status-text {
  flex: 1;
}

.detection-confidence-badge {
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.detection-retry-btn {
  flex-shrink: 0;
  font-size: 12px !important;
  padding: 0 4px !important;
}

/* 状态条淡入淡出动画 */
.detection-status-fade-enter-active,
.detection-status-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease;
  max-height: 60px;
  overflow: hidden;
}

.detection-status-fade-enter-from,
.detection-status-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

/* ===== EXE 文件选择控件 ===== */
.exe-input-wrapper {
  width: 100%;
}

.exe-scan-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #67c23a;
}

.exe-scan-hint--empty {
  color: #909399;
}

.exe-suggestion-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

.exe-suggestion-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.exe-suggestion-path {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}
</style>
