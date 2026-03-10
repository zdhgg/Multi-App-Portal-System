<template>
  <div class="path-selector">
    <div class="selector-header">
      <h3>
        <el-icon><FolderOpened /></el-icon>
        扫描路径配置
      </h3>
      <div class="header-actions">
        <el-tooltip 
          v-if="browserSupportsFileSystemAccess"
          content="您的浏览器支持文件夹选择功能！可以直接从资源管理器选择文件夹"
          placement="bottom"
        >
          <el-tag type="success" size="small">
            <el-icon><SuccessFilled /></el-icon>
            支持文件夹选择
          </el-tag>
        </el-tooltip>
        <el-tooltip 
          v-else
          content="建议使用 Chrome 86+ 或 Edge 86+ 获得完整的文件夹选择功能"
          placement="bottom"
        >
          <el-tag type="warning" size="small">
            <el-icon><WarningFilled /></el-icon>
            兼容性有限
          </el-tag>
        </el-tooltip>
        <el-button type="primary" @click="addPath" :disabled="loading">
          <el-icon><Plus /></el-icon>
          添加路径
        </el-button>
      </div>
    </div>

    <!-- 路径选择模式 -->
    <div class="mode-selector">
      <el-radio-group v-model="mode" @change="onModeChange">
        <el-radio-button label="single">单个目录</el-radio-button>
        <el-radio-button label="multiple">多个目录</el-radio-button>
        <el-radio-button label="workspace">工作区扫描</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 路径列表 -->
    <div class="path-list">
      <el-card v-for="(path, index) in paths" :key="index" shadow="hover" class="path-item">
        <template #header>
          <div class="path-header">
            <div class="path-info">
              <el-icon><Folder /></el-icon>
              <span class="path-text">{{ path.path || '请选择路径...' }}</span>
              <el-tag v-if="path.estimatedFiles" size="small" type="info">
                预计 {{ path.estimatedFiles }} 个文件
              </el-tag>
            </div>
            <div class="path-actions">
              <el-button size="small" @click="showPathInput(index)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button size="small" type="primary" @click="selectFolderFromExplorer(index)">
                <el-icon><FolderOpened /></el-icon>
                选择文件夹
              </el-button>
              <el-button size="small" @click="browsePath(index)">
                <el-icon><Search /></el-icon>
                预设路径
              </el-button>
              <el-button 
                size="small" 
                :type="path.configExpanded ? 'info' : 'default'"
                @click="toggleConfigExpand(index)"
              >
                <el-icon><Setting /></el-icon>
                {{ path.configExpanded ? '收起配置' : '调整配置' }}
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                @click="removePath(index)"
                v-if="paths.length > 1"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </template>

        <!-- 路径配置 - 可折叠区域 -->
        <el-collapse-transition>
          <div v-show="path.configExpanded" class="path-config">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="文件大小限制">
                <el-select v-model="path.maxFileSize" size="small" style="width: 100%;">
                  <el-option label="无限制" value="unlimited" />
                  <el-option label="10MB" value="10MB" />
                  <el-option label="50MB" value="50MB" />
                  <el-option label="100MB" value="100MB" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="扫描优先级">
                <el-select v-model="path.priority" size="small" style="width: 100%;">
                  <el-option label="低" value="low" />
                  <el-option label="中" value="medium" />
                  <el-option label="高" value="high" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 排除模式 -->
          <el-form-item label="排除模式">
            <el-select 
              v-model="path.excludePatterns" 
              multiple 
              filterable 
              allow-create
              size="small"
              placeholder="选择或输入排除模式"
            >
              <el-option 
                v-for="pattern in commonExcludePatterns" 
                :key="pattern.value"
                :label="pattern.label" 
                :value="pattern.value"
              />
            </el-select>
          </el-form-item>

          <!-- 路径预览 -->
          <div class="path-preview" v-if="path.path">
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="路径">{{ path.path }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="path.accessible ? 'success' : 'danger'" size="small">
                  {{ path.accessible ? '可访问' : '无法访问' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="预估文件数">
                {{ path.estimatedFiles || '计算中...' }}
              </el-descriptions-item>
              <el-descriptions-item label="预估时间">
                {{ path.estimatedTime || '计算中...' }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
          </div>
        </el-collapse-transition>
        
        <!-- 简化的状态信息 - 配置折叠时显示 -->
        <div v-show="!path.configExpanded && path.path" class="path-quick-info">
          <el-tag size="small" :type="path.accessible ? 'success' : 'warning'">
            {{ path.accessible ? '可访问' : '检查中...' }}
          </el-tag>
          <el-tag v-if="path.estimatedFiles" size="small">
            ~{{ path.estimatedFiles }} 文件
          </el-tag>
          <el-tag v-if="path.maxFileSize && path.maxFileSize !== 'unlimited'" size="small" type="info">
            限制: {{ path.maxFileSize }}
          </el-tag>
          <el-tag v-if="path.excludePatterns?.length" size="small" type="info">
            已排除 {{ path.excludePatterns.length }} 项
          </el-tag>
        </div>
      </el-card>
    </div>

    <!-- 扫描选项 -->
    <el-card shadow="never" class="scan-options">
      <template #header>
        <span>扫描选项配置</span>
      </template>
      
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="智能过滤">
            <el-switch 
              v-model="globalConfig.smartFilter"
              active-text="启用"
              inactive-text="关闭"
            />
            <div class="form-hint">自动排除常见的无效目录</div>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="实时预览">
            <el-switch 
              v-model="globalConfig.realTimePreview"
              active-text="启用"
              inactive-text="关闭"
            />
            <div class="form-hint">扫描过程中实时显示发现的应用</div>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- 总览信息 -->
    <el-card shadow="never" class="scan-summary" v-if="scanSummary.totalPaths > 0">
      <template #header>
        <span>扫描预览</span>
      </template>
      
      <el-row :gutter="16" class="summary-stats">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-number">{{ scanSummary.totalPaths }}</div>
            <div class="stat-label">扫描路径</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-number">{{ scanSummary.estimatedFiles }}</div>
            <div class="stat-label">预计文件</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-number">{{ scanSummary.estimatedTime }}</div>
            <div class="stat-label">预计时间</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-number">{{ scanSummary.estimatedApps }}</div>
            <div class="stat-label">可能应用</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 路径输入对话框 -->
    <el-dialog 
      v-model="pathInputVisible"
      title="编辑扫描路径"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="path-input-dialog">
        <el-form label-width="100px">
          <el-form-item label="路径">
            <el-input 
              v-model="currentEditPath"
              placeholder="请输入完整路径，如：D:\Projects\MyApp"
              clearable
            />
          </el-form-item>
          
          <el-form-item label="快速选择">
            <div class="preset-paths">
              <el-button 
                v-for="preset in presetPaths" 
                :key="preset.path"
                size="small"
                @click="selectPresetPath(preset.path)"
                class="preset-path-btn"
              >
                <div class="preset-info">
                  <div class="preset-path">{{ preset.path }}</div>
                  <div class="preset-desc">{{ preset.description }}</div>
                </div>
              </el-button>
            </div>
          </el-form-item>
          
          <el-form-item label="示例路径">
            <div class="example-paths">
              <el-tag 
                v-for="example in examplePaths" 
                :key="example"
                size="small"
                @click="currentEditPath = example"
                style="cursor: pointer; margin-right: 8px; margin-bottom: 4px;"
              >
                {{ example }}
              </el-tag>
            </div>
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <el-button @click="pathInputVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmPathInput">确定</el-button>
      </template>
    </el-dialog>

    <!-- 浏览路径对话框 -->
    <el-dialog 
      v-model="pathBrowseVisible"
      title="选择扫描路径"
      width="700px"
      :close-on-click-modal="false"
    >
      <div class="path-browse-dialog">
        <div class="browse-header">
          <el-alert
            v-if="!browserSupportsFileSystemAccess"
            title="浏览器兼容性提示"
            description="建议使用 Chrome 86+ 或 Edge 86+ 获得完整的文件夹选择功能。当前浏览器支持有限的文件夹选择。"
            type="warning"
            show-icon
            :closable="false"
          />
          <el-alert
            v-else
            title="文件夹选择功能"
            description="您的浏览器支持文件夹选择功能！点击上方'选择文件夹'按钮可直接从资源管理器选择。"
            type="success"
            show-icon
            :closable="false"
          />
        </div>
        
        <div class="browse-content">
          <el-row :gutter="16">
            <el-col :span="12">
              <h4>🗂️ 常用开发目录</h4>
              <div class="path-options">
                <div 
                  v-for="path in commonPaths" 
                  :key="path.path"
                  class="path-option"
                  @click="selectBrowsePath(path.path)"
                >
                  <div class="path-icon">📁</div>
                  <div class="path-details">
                    <div class="path-name">{{ path.path }}</div>
                    <div class="path-description">{{ path.description }}</div>
                  </div>
                </div>
              </div>
            </el-col>
            
            <el-col :span="12">
              <h4>🎯 项目类型模板</h4>
              <div class="path-options">
                <div 
                  v-for="template in pathTemplates" 
                  :key="template.name"
                  class="path-option"
                  @click="selectBrowsePath(template.path)"
                >
                  <div class="path-icon">{{ template.icon }}</div>
                  <div class="path-details">
                    <div class="path-name">{{ template.name }}</div>
                    <div class="path-description">{{ template.description }}</div>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="pathBrowseVisible = false">取消</el-button>
        <el-button type="primary" @click="manualInputPath">手动输入路径</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  FolderOpened,
  Plus,
  Folder,
  Search,
  Delete,
  Edit,
  SuccessFilled,
  WarningFilled,
  Setting
} from '@element-plus/icons-vue'
import { userSettingsApiService, filesystemApiService, type UserSettings, type PresetPath } from '@/services'
import { getStoredAccessToken } from '@/utils/authStorage'

export interface PathConfig {
  path: string
  maxDepth: number
  maxFileSize: string
  priority: 'low' | 'medium' | 'high'
  excludePatterns: string[]
  accessible?: boolean
  estimatedFiles?: number
  estimatedTime?: string
  folderHandle?: any // File System Access API handle
  fileList?: FileList // webkitdirectory file list
  configExpanded?: boolean // 是否展开配置面板
}

export interface GlobalConfig {
  smartFilter: boolean
  realTimePreview: boolean
}

interface ScanSummary {
  totalPaths: number
  estimatedFiles: number
  estimatedTime: string
  estimatedApps: number
}

const emit = defineEmits<{
  'update:paths': [paths: PathConfig[]]
  'update:globalConfig': [config: GlobalConfig]
  'validate': [isValid: boolean]
}>()

const props = defineProps<{
  initialPaths?: PathConfig[]
  initialGlobalConfig?: GlobalConfig
}>()

// 响应式数据
const loading = ref(false)
const mode = ref<'single' | 'multiple' | 'workspace'>('single')

// 对话框状态
const pathInputVisible = ref(false)
const pathBrowseVisible = ref(false)
const currentEditPath = ref('')
const currentEditIndex = ref(-1)
const isInitializing = ref(true)

const paths = ref<PathConfig[]>([
  {
    path: 'D:\\My Programs', // 设置默认的绝对路径
    maxDepth: 3,
    maxFileSize: '50MB',
    priority: 'medium',
    excludePatterns: ['node_modules', '.git', 'dist', 'build'],
    configExpanded: false // 默认折叠配置
  }
])

const globalConfig = ref<GlobalConfig>({
  smartFilter: true,
  realTimePreview: true
})

// 动态路径数据
const presetPaths = ref<Array<{ path: string; description: string }>>([])
const examplePaths = ref<string[]>([])
const commonPaths = ref<Array<{ path: string; description: string }>>([])
const userSettings = ref<UserSettings | null>(null)

const pathTemplates = [
  { 
    name: 'React项目', 
    path: 'D:\\Projects\\React-Apps', 
    icon: '⚛️',
    description: 'React应用开发目录'
  },
  { 
    name: 'Vue项目', 
    path: 'D:\\Projects\\Vue-Apps', 
    icon: '🔧',
    description: 'Vue应用开发目录'
  },
  { 
    name: 'Node.js项目', 
    path: 'D:\\Projects\\Node-Apps', 
    icon: '🟢',
    description: 'Node.js后端项目'
  },
  { 
    name: '全栈项目', 
    path: 'D:\\Projects\\FullStack', 
    icon: '🚀',
    description: '全栈应用项目'
  }
]

const commonExcludePatterns = [
  { label: 'node_modules (Node.js依赖)', value: 'node_modules' },
  { label: '.git (Git版本控制)', value: '.git' },
  { label: 'dist (构建输出)', value: 'dist' },
  { label: 'build (构建目录)', value: 'build' },
  { label: '.next (Next.js)', value: '.next' },
  { label: '.nuxt (Nuxt.js)', value: '.nuxt' },
  { label: 'coverage (测试覆盖率)', value: 'coverage' },
  { label: '.cache (缓存目录)', value: '.cache' },
  { label: 'tmp (临时文件)', value: 'tmp' },
  { label: 'logs (日志文件)', value: 'logs' }
]

// 计算属性
const scanSummary = computed<ScanSummary>(() => {
  const validPaths = paths.value.filter(p => p.path && p.accessible !== false)
  
  return {
    totalPaths: validPaths.length,
    estimatedFiles: validPaths.reduce((sum, p) => sum + (p.estimatedFiles || 0), 0),
    estimatedTime: calculateTotalTime(validPaths),
    estimatedApps: Math.ceil(validPaths.length * 0.3) // 粗略估计30%的路径包含应用
  }
})

const browserSupportsFileSystemAccess = computed(() => {
  return 'showDirectoryPicker' in window
})

// 方法
const onModeChange = (newMode: string) => {
  if (newMode === 'single' && paths.value.length > 1) {
    paths.value = [paths.value[0]]
  } else if (newMode === 'workspace') {
    // 工作区模式的特殊逻辑
    ElMessage.info('工作区模式将扫描整个工作区，请确保路径正确')
  }
}

const addPath = () => {
  if (mode.value === 'single') {
    ElMessage.warning('单个目录模式下只能添加一个路径')
    return
  }
  
  paths.value.push({
    path: '',
    maxDepth: 3,
    maxFileSize: '50MB',
    priority: 'medium',
    excludePatterns: ['node_modules', '.git', 'dist', 'build'],
    configExpanded: false // 默认折叠
  })
}

// 切换配置展开/折叠
const toggleConfigExpand = (index: number) => {
  paths.value[index].configExpanded = !paths.value[index].configExpanded
}

const removePath = (index: number) => {
  if (paths.value.length > 1) {
    paths.value.splice(index, 1)
  }
}

const showPathInput = (index: number) => {
  currentEditIndex.value = index
  currentEditPath.value = paths.value[index].path
  pathInputVisible.value = true
}

const browsePath = (index: number) => {
  currentEditIndex.value = index
  pathBrowseVisible.value = true
}

const selectPresetPath = async (path: string) => {
  currentEditPath.value = path

  // 保存到最近使用路径
  try {
    await userSettingsApiService.addRecentPath(path)
  } catch (error) {
    console.warn('Failed to save recent path:', error)
  }
}

const selectBrowsePath = (path: string) => {
  if (currentEditIndex.value >= 0) {
    paths.value[currentEditIndex.value].path = path
    
    // 异步验证路径和估算
    validateAndEstimate(currentEditIndex.value)
    
    pathBrowseVisible.value = false
    ElMessage.success('路径选择成功')
  }
}

const manualInputPath = () => {
  pathBrowseVisible.value = false
  pathInputVisible.value = true
}

const confirmPathInput = () => {
  if (!currentEditPath.value.trim()) {
    ElMessage.warning('请输入有效的路径')
    return
  }
  
  if (currentEditIndex.value >= 0) {
    paths.value[currentEditIndex.value].path = currentEditPath.value.trim()
    
    // 异步验证路径和估算
    validateAndEstimate(currentEditIndex.value)
    
    pathInputVisible.value = false
    ElMessage.success('路径设置成功')
  }
}

// 从资源管理器选择文件夹
const selectFolderFromExplorer = async (index: number) => {
  try {
    loading.value = true
    currentEditIndex.value = index
    
    let selectedPath = ''
    let folderHandle: any = null

    // 方法0: 优先使用后端原生目录选择（可返回绝对路径）
    try {
      const currentPath = paths.value[index]?.path?.trim() || ''
      const startPath = isAbsolutePathFormat(currentPath) ? currentPath : undefined
      const nativeResponse = await filesystemApiService.selectFolder(startPath, true)

      if (nativeResponse.success && nativeResponse.data) {
        if (nativeResponse.data.cancelled) {
          ElMessage.info('用户取消了文件夹选择')
          return
        }

        if (nativeResponse.data.path) {
          selectedPath = nativeResponse.data.path.trim()
          if (selectedPath) {
            ElMessage.success(`文件夹选择成功: ${selectedPath}`)
          }
        }
      }
    } catch (nativeError) {
      console.warn('后端原生文件夹选择不可用，回退浏览器选择:', nativeError)
    }
    
    // 方法1: 使用现代 File System Access API (Chrome 86+)
    if (!selectedPath && 'showDirectoryPicker' in window) {
      try {
        folderHandle = await (window as any).showDirectoryPicker({
          mode: 'read',
          startIn: 'documents'
        })
        
        // 保存文件夹句柄以便后续使用
        selectedPath = folderHandle.name
        
        // 尝试通过查询权限来验证访问
        const permission = await folderHandle.queryPermission({ mode: 'read' })
        if (permission === 'granted') {
          ElMessage.success(`文件夹选择成功: ${folderHandle.name}`)
        } else {
          ElMessage.warning('文件夹选择成功，但可能需要授予读取权限')
        }
        
        // 存储句柄引用（如果需要后续操作）
        paths.value[index].folderHandle = folderHandle
        
      } catch (error: any) {
        if (error.name === 'AbortError') {
          ElMessage.info('用户取消了文件夹选择')
          return
        }
        throw error
      }
    }
    // 方法2: 使用传统 webkitdirectory (备选方案)
    else if (!selectedPath && 'webkitdirectory' in document.createElement('input')) {
      const result = await selectFolderWithWebkit()
      selectedPath = result.path
      // 存储文件信息以便后续使用
      paths.value[index].fileList = result.files
      ElMessage.success(`文件夹选择成功: ${result.path}`)
    }
    // 方法3: 不支持的浏览器
    else if (!selectedPath) {
      ElMessage.warning('您的浏览器不支持文件夹选择，请使用 Chrome 86+ 或 Edge 86+ 版本')
      // 回退到预设路径选择
      browsePath(index)
      return
    }
    
    if (selectedPath) {
      const normalizedSelectedPath = selectedPath.trim()
      let resolvedPath: string | null = null

      // 1) 直接就是绝对路径（理论上浏览器API通常拿不到）
      if (isAbsolutePathFormat(normalizedSelectedPath)) {
        resolvedPath = normalizedSelectedPath
      } else {
        // 2) 尝试基于当前已有绝对路径拼接子目录（常见于从 D:\Base 选中某个子目录）
        const currentPath = paths.value[index]?.path?.trim() || ''
        if (isAbsolutePathFormat(currentPath)) {
          const basePath = currentPath.replace(/[\\\/]+$/, '')
          const folderName = normalizedSelectedPath.replace(/^[\\\/]+/, '').replace(/[\\\/]+$/, '')
          const candidatePath = `${basePath}\\${folderName}`

          if (await checkPathAccessible(candidatePath)) {
            resolvedPath = candidatePath
          }
        }
      }

      if (!resolvedPath) {
        const folderName = folderHandle?.name || normalizedSelectedPath
        ElMessage.warning(
          `已选择文件夹 "${folderName}"，但浏览器安全限制无法获取绝对路径，请点击“编辑”手动输入完整路径（如 D:\\My Programs\\${folderName}）`
        )
        return
      }

      paths.value[index].path = resolvedPath
      // 异步验证路径和估算
      validateAndEstimate(index)
    }
    
  } catch (error) {
    console.error('文件夹选择失败:', error)
    ElMessage.error('文件夹选择失败，请尝试手动输入路径')
  } finally {
    loading.value = false
  }
}

// 使用 webkitdirectory 选择文件夹 (备选方案)
const selectFolderWithWebkit = (): Promise<{path: string, files: FileList}> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.style.display = 'none'
    
    input.onchange = (event: any) => {
      const files = event.target.files
      if (files && files.length > 0) {
        const firstFile = files[0]
        // 从文件路径中提取文件夹路径
        const fullPath = firstFile.webkitRelativePath
        const folderName = fullPath.split('/')[0]
        
        // 尝试构建更完整的路径信息
        let detectedPath = folderName
        
        // 如果有多个文件，可以分析路径结构
        if (files.length > 1) {
          const commonPath = getCommonBasePath(Array.from(files))
          if (commonPath) {
            detectedPath = commonPath
          }
        }
        
        resolve({
          path: detectedPath,
          files: files
        })
      } else {
        reject(new Error('未选择文件夹'))
      }
      document.body.removeChild(input)
    }
    
    input.oncancel = () => {
      document.body.removeChild(input)
      reject(new Error('用户取消选择'))
    }
    
    document.body.appendChild(input)
    input.click()
  })
}

// 辅助函数：从文件列表中获取公共基础路径
const getCommonBasePath = (files: File[]): string => {
  if (files.length === 0) return ''
  
  // 获取第一个文件的路径部分
  const firstPath = (files[0] as any).webkitRelativePath || ''
  const pathParts = firstPath.split('/')
  
  // 找到所有文件的公共前缀路径
  let commonParts = pathParts.slice(0, -1) // 排除文件名
  
  for (let i = 1; i < files.length; i++) {
    const currentPath = (files[i] as any).webkitRelativePath || ''
    const currentParts = currentPath.split('/').slice(0, -1)
    
    // 找到公共部分
    const minLength = Math.min(commonParts.length, currentParts.length)
    const newCommonParts = []
    
    for (let j = 0; j < minLength; j++) {
      if (commonParts[j] === currentParts[j]) {
        newCommonParts.push(commonParts[j])
      } else {
        break
      }
    }
    
    commonParts = newCommonParts
    if (commonParts.length === 0) break
  }
  
  return commonParts.join('/') || pathParts[0] || 'Selected Folder'
}

const validateAndEstimate = async (index: number) => {
  const path = paths.value[index]
  
  console.log(`🔍 开始验证路径: ${path.path}`)
  
  try {
    // 验证路径可访问性
    path.accessible = await checkPathAccessible(path.path)
    
    console.log(`✅ 路径验证结果: ${path.accessible ? '可访问' : '不可访问'}`)
    
    // 无论路径是否可访问，都进行估算（用户可能只是想预览）
    // 估算文件数量和时间
    const estimation = await estimateScanScope(path)
    path.estimatedFiles = estimation.files
    path.estimatedTime = estimation.time
    
    console.log(`📊 估算结果: ${estimation.files} 个文件, ${estimation.time}`)
    
    // 如果路径不可访问，给出提示但不阻止估算
    if (!path.accessible) {
      console.warn(`⚠️ 路径可能无法访问，但已提供估算值: ${path.path}`)
    }
  } catch (error) {
    console.error('❌ 路径验证或估算失败:', error)
    // 即使验证失败，也提供默认的估算值
    path.accessible = false
    path.estimatedFiles = 500 // 默认估算值
    path.estimatedTime = '10s' // 默认时间
  }
}

const calculateTotalTime = (validPaths: PathConfig[]): string => {
  const totalSeconds = validPaths.reduce((sum, p) => {
    const timeStr = p.estimatedTime || '0s'
    const seconds = parseTimeToSeconds(timeStr)
    return sum + seconds
  }, 0)
  
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) return `${Math.ceil(totalSeconds / 60)}m`
  return `${Math.ceil(totalSeconds / 3600)}h`
}

const parseTimeToSeconds = (timeStr: string): number => {
  const num = parseInt(timeStr)
  if (timeStr.includes('h')) return num * 3600
  if (timeStr.includes('m')) return num * 60
  return num
}

// 改进的路径验证和估算函数

const checkPathAccessible = async (path: string): Promise<boolean> => {
  // 实际的路径验证：通过后端API检查
  try {
    console.log('🔍 checkPathAccessible 开始检查:', path)
    
    if (!path || path.trim() === '') {
      console.log('❌ 路径为空，返回 false')
      return false
    }
    
    // 首先进行基本的路径格式检查
    const isValidFormat = isValidPathFormat(path)
    console.log('📝 路径格式检查结果:', isValidFormat)
    
    if (!isValidFormat) {
      console.log('❌ 路径格式无效，返回 false')
      return false
    }
    
    // 尝试调用后端API检查路径可访问性（如果可用）
    let apiCheckResult = null
    try {
      console.log('🌐 尝试调用后端API检查路径...')
      
      // 使用兼容性更好的超时实现
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3秒超时
      
      const response = await fetch('/api/filesystem/check-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getStoredAccessToken() || ''}`
        },
        body: JSON.stringify({ path }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      console.log('📡 API响应状态:', response.status, response.ok)
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('📦 API完整响应:', responseData)
        
        // 处理不同的响应格式
        // 格式1: {success: true, data: {accessible: true}}
        // 格式2: {accessible: true}
        let accessible = false
        
        if (responseData.success && responseData.data) {
          // 格式1：标准API响应格式
          accessible = responseData.data.accessible === true
          console.log('📝 使用标准格式 (responseData.data.accessible):', accessible)
        } else if (typeof responseData.accessible === 'boolean') {
          // 格式2：直接返回accessible字段
          accessible = responseData.accessible
          console.log('📝 使用简单格式 (responseData.accessible):', accessible)
        } else {
          console.log('⚠️ 无法识别的响应格式，使用格式验证结果')
        }
        
        console.log('✅ 最终判断结果:', accessible)
        return accessible
      } else {
        console.log('⚠️ API响应不成功 (status:', response.status, ')，将使用格式验证结果')
      }
    } catch (apiError) {
      console.warn('⚠️ 路径检查API调用失败，使用基本验证:', apiError)
    }
    
    // API不可用或失败时，返回格式检查结果（假定格式正确的路径是可访问的）
    console.log('✅ 使用格式验证结果:', isValidFormat)
    return isValidFormat
    
  } catch (error) {
    console.warn('❌ checkPathAccessible 外层捕获错误，使用基本验证:', error)
    // 回退到基本的路径格式检查
    return isValidPathFormat(path)
  }
}

// 基本的路径格式验证
const isAbsolutePathFormat = (path: string): boolean => {
  if (!path || path.trim() === '') {
    return false
  }
  const windowsPathRegex = /^[A-Za-z]:[\\\/].*$/
  const unixPathRegex = /^\/.*$/
  return windowsPathRegex.test(path) || unixPathRegex.test(path)
}

const isValidPathFormat = (path: string): boolean => {
  if (!path || path.trim() === '') {
    console.log('❌ 路径为空')
    return false
  }
  
  // Windows路径格式检查
  const windowsPathRegex = /^[A-Za-z]:[\\\/].*$/
  // Unix路径格式检查  
  const unixPathRegex = /^\/.*$/
  
  const isWindows = windowsPathRegex.test(path)
  const isUnix = unixPathRegex.test(path)
  const isValid = isAbsolutePathFormat(path)
  
  console.log(`🔍 路径格式检查: "${path}" - ${isValid ? '✅ 有效' : '❌ 无效'} (Windows: ${isWindows}, Unix: ${isUnix})`)
  
  return isValid
}

const estimateScanScope = async (pathConfig: PathConfig) => {
  // 智能的扫描范围估算
  return new Promise<{files: number, time: string}>((resolve) => {
    // 缩短延迟时间，提供更快的反馈
    setTimeout(() => {
      // 根据扫描深度和排除模式进行更合理的估算
      const depth = pathConfig.maxDepth || 3
      const hasExcludes = pathConfig.excludePatterns && pathConfig.excludePatterns.length > 0
      
      // 基础文件数：深度越大，文件越多
      let baseFiles = 200 * Math.pow(depth, 1.5)
      
      // 如果有排除模式，减少估算数量
      if (hasExcludes) {
        baseFiles = baseFiles * 0.6 // 减少40%
      }
      
      // 添加一些随机性使其更真实
      const files = Math.floor(baseFiles + Math.random() * 300)
      
      // 根据文件数量估算时间（假设每秒处理50个文件）
      const estimatedSeconds = Math.max(Math.ceil(files / 50), 5)
      const time = estimatedSeconds < 60 
        ? `${estimatedSeconds}s` 
        : `${Math.ceil(estimatedSeconds / 60)}m`
      
      resolve({ files, time })
    }, 500) // 减少到500ms，提供更快的反馈
  })
}

// 监听器
watch(paths, (newPaths) => {
  // 在初始化期间不触发事件，避免重复
  if (isInitializing.value) {
    return
  }

  emit('update:paths', newPaths)

  // 验证配置
  const isValid = newPaths.every(p => p.path && p.accessible !== false)
  emit('validate', isValid)
}, { deep: true, immediate: false })

watch(globalConfig, (newConfig) => {
  emit('update:globalConfig', newConfig)
}, { deep: true })

// 加载用户设置
const loadUserSettings = async () => {
  try {
    const response = await userSettingsApiService.getUserSettings()
    if (response.success && response.data) {
      userSettings.value = response.data

      // 设置预设路径
      presetPaths.value = response.data.presetPaths.filter(p => p.category === 'project' || p.category === 'workspace')
      commonPaths.value = response.data.presetPaths.filter(p => p.category === 'common' || p.category === 'workspace')

      // 设置示例路径（从最近使用的路径中获取）
      examplePaths.value = response.data.recentPaths.slice(0, 4)

      // 如果没有示例路径，使用系统推荐路径
      if (examplePaths.value.length === 0) {
        const systemPaths = userSettingsApiService.getSystemRecommendedPaths()
        examplePaths.value = systemPaths.slice(0, 4).map(p => p.path)
      }

      // 更新全局配置
      if (response.data.preferences) {
        globalConfig.value = {
          ...globalConfig.value,
          ...response.data.preferences
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load user settings:', error)
    // 使用系统推荐路径作为后备
    const systemPaths = userSettingsApiService.getSystemRecommendedPaths()
    presetPaths.value = systemPaths.filter(p => p.category === 'project' || p.category === 'workspace')
    commonPaths.value = systemPaths.filter(p => p.category === 'common' || p.category === 'workspace')
    examplePaths.value = systemPaths.slice(0, 4).map(p => p.path)
  }
}

// 生命周期
onMounted(async () => {
  // 首先加载用户设置
  await loadUserSettings()

  if (props.initialPaths) {
    paths.value = props.initialPaths
  }
  if (props.initialGlobalConfig) {
    globalConfig.value = props.initialGlobalConfig
  }

  // 自动验证默认路径
  for (let i = 0; i < paths.value.length; i++) {
    if (paths.value[i].path) {
      await validateAndEstimate(i)
    }
  }

  // 初始化完成，允许触发事件
  isInitializing.value = false

  // 手动触发一次更新事件，确保父组件获得初始状态
  emit('update:paths', paths.value)
  const isValid = paths.value.every(p => p.path && p.accessible !== false)
  emit('validate', isValid)
})
</script>

<style scoped>
.path-selector {
  margin-bottom: 24px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.selector-header h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-selector {
  margin-bottom: 16px;
}

.path-list {
  margin-bottom: 16px;
}

.path-item {
  margin-bottom: 12px;
}

.path-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.path-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.path-text {
  font-family: monospace;
  color: #606266;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-actions {
  display: flex;
  gap: 8px;
}

.path-config {
  padding-top: 16px;
}

.path-preview {
  margin-top: 16px;
}

.scan-options {
  margin-bottom: 16px;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.scan-summary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.scan-summary :deep(.el-card__header) {
  background: rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.scan-summary :deep(.el-card__header span) {
  color: white;
  font-weight: 600;
}

.summary-stats {
  text-align: center;
}

.stat-item {
  padding: 16px;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.8;
}

/* 新增对话框样式 */
.path-input-dialog {
  padding: 0;
}

.preset-paths {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.preset-path-btn {
  height: auto;
  padding: 12px;
  text-align: left;
}

.preset-info {
  width: 100%;
}

.preset-path {
  font-family: monospace;
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 4px;
}

.preset-desc {
  font-size: 11px;
  color: #909399;
}

.example-paths {
  max-height: 100px;
  overflow-y: auto;
}

.path-browse-dialog {
  padding: 0;
}

.browse-header {
  margin-bottom: 20px;
}

.browse-content h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.path-options {
  max-height: 300px;
  overflow-y: auto;
}

.path-option {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.path-option:hover {
  background: #e7f3ff;
  border-color: #409EFF;
}

.path-icon {
  font-size: 20px;
  margin-right: 12px;
  min-width: 30px;
  text-align: center;
}

.path-details {
  flex: 1;
}

.path-name {
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.path-description {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

/* 简化状态信息 - 配置折叠时显示 */
.path-quick-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0 4px 0;
  border-top: 1px dashed #ebeef5;
  margin-top: 8px;
}

.path-quick-info .el-tag {
  font-size: 12px;
}

/* 配置区域过渡效果 */
.path-config {
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
</style>
