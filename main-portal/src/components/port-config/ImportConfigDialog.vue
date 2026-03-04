<template>
  <el-dialog
    v-model="visible"
    title="导入端口配置"
    width="600px"
    :before-close="handleClose"
    @opened="handleDialogOpened"
  >
    <div class="import-dialog-content">
      <!-- 导入方式选择 -->
      <div class="import-method">
        <h4>选择导入方式</h4>
        <el-radio-group v-model="importMethod" @change="handleMethodChange">
          <el-radio label="file">上传文件</el-radio>
          <el-radio label="text">粘贴配置</el-radio>
          <el-radio label="url">从URL导入</el-radio>
        </el-radio-group>
      </div>

      <!-- 文件上传 -->
      <div v-if="importMethod === 'file'" class="import-section">
        <el-upload
          ref="uploadRef"
          class="config-upload"
          drag
          :auto-upload="false"
          :limit="1"
          accept=".json"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          :on-exceed="handleExceed"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            将配置文件拖到此处，或<em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              只能上传 JSON 格式的配置文件，且不超过 10MB
            </div>
          </template>
        </el-upload>
      </div>

      <!-- 文本输入 -->
      <div v-if="importMethod === 'text'" class="import-section">
        <el-input
          v-model="configText"
          type="textarea"
          :rows="12"
          placeholder="请粘贴端口配置的 JSON 内容..."
          maxlength="50000"
          show-word-limit
        />
        
        <div class="text-actions">
          <el-button size="small" @click="formatJson" :disabled="!configText">
            格式化 JSON
          </el-button>
          <el-button size="small" @click="validateJson" :disabled="!configText">
            验证格式
          </el-button>
          <el-button size="small" @click="clearText">
            清空
          </el-button>
        </div>
      </div>

      <!-- URL导入 -->
      <div v-if="importMethod === 'url'" class="import-section">
        <el-input
          v-model="configUrl"
          placeholder="请输入配置文件的URL地址"
          :prefix-icon="Link"
        />
        <div class="url-hint">
          支持 HTTP/HTTPS 协议的 JSON 配置文件
        </div>
        
        <div class="url-actions">
          <el-button 
            @click="fetchFromUrl" 
            :loading="fetchingUrl"
            :disabled="!configUrl"
            :icon="Download"
          >
            获取配置
          </el-button>
        </div>
      </div>

      <!-- 配置预览 -->
      <div v-if="previewConfig" class="config-preview">
        <h4>配置预览</h4>
        <div class="preview-content">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="配置版本">
              {{ previewConfig.version || 'N/A' }}
            </el-descriptions-item>
            <el-descriptions-item label="最后更新">
              {{ formatDate(previewConfig.lastUpdated) }}
            </el-descriptions-item>
            <el-descriptions-item label="前端端口范围">
              {{ getPortRangeText(previewConfig.portConfiguration?.frontendRange) }}
            </el-descriptions-item>
            <el-descriptions-item label="后端端口范围">
              {{ getPortRangeText(previewConfig.portConfiguration?.backendRange) }}
            </el-descriptions-item>
            <el-descriptions-item label="保留端口数">
              {{ previewConfig.portConfiguration?.reservedPorts?.length || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="实时监控">
              {{ previewConfig.portConfiguration?.monitoring?.enableRealTimeMonitoring ? '启用' : '禁用' }}
            </el-descriptions-item>
          </el-descriptions>
          
          <!-- 保留端口列表 -->
          <div v-if="previewConfig.portConfiguration?.reservedPorts?.length" class="reserved-ports-preview">
            <h5>保留端口列表</h5>
            <div class="ports-list">
              <el-tag
                v-for="port in previewConfig.portConfiguration.reservedPorts.slice(0, 10)"
                :key="port.port"
                :type="getPortTagType(port.category)"
                size="small"
                class="port-tag"
              >
                {{ port.port }} - {{ port.description }}
              </el-tag>
              <span v-if="previewConfig.portConfiguration.reservedPorts.length > 10" class="more-ports">
                还有 {{ previewConfig.portConfiguration.reservedPorts.length - 10 }} 个端口...
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 导入选项 -->
      <div v-if="previewConfig" class="import-options">
        <h4>导入选项</h4>
        <el-checkbox-group v-model="importOptions">
          <el-checkbox label="portRanges">端口范围配置</el-checkbox>
          <el-checkbox label="reservedPorts">保留端口列表</el-checkbox>
          <el-checkbox label="allocationPolicy">分配策略</el-checkbox>
          <el-checkbox label="monitoring">监控设置</el-checkbox>
          <el-checkbox label="backup">导入前创建备份</el-checkbox>
        </el-checkbox-group>
      </div>

      <!-- 错误信息 -->
      <div v-if="errorMessage" class="error-message">
        <el-alert
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
        />
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button 
          type="primary" 
          @click="confirmImport" 
          :loading="importing"
          :disabled="!previewConfig"
        >
          确认导入
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Link, Download } from '@element-plus/icons-vue'

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'import-config': [config: string]
}>()

const props = defineProps<{
  visible: boolean
}>()

// 响应式数据
const importMethod = ref('file')
const configText = ref('')
const configUrl = ref('')
interface ImportedPortConfig {
  version?: string
  lastUpdated?: string
  portConfiguration: {
    frontendRange?: { start: number; end: number }
    backendRange?: { start: number; end: number }
    reservedPorts?: Array<{ port: number; description: string; category: 'system' | 'portal' | 'custom' }>
    allocationPolicy?: Record<string, any>
    monitoring?: { enableRealTimeMonitoring?: boolean }
  }
}

const previewConfig = ref<ImportedPortConfig | null>(null)
const errorMessage = ref('')
const importing = ref(false)
const fetchingUrl = ref(false)
const uploadRef = ref()

const importOptions = ref(['portRanges', 'reservedPorts', 'allocationPolicy', 'monitoring', 'backup'])

// 计算属性
const visible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// 监听配置文本变化
watch(configText, (newText) => {
  if (newText) {
    parseConfig(newText)
  } else {
    previewConfig.value = null
    errorMessage.value = ''
  }
})

// 事件处理函数
const handleDialogOpened = () => {
  // 重置状态
  resetDialog()
}

const handleClose = () => {
  visible.value = false
  resetDialog()
}

const resetDialog = () => {
  importMethod.value = 'file'
  configText.value = ''
  configUrl.value = ''
  previewConfig.value = null
  errorMessage.value = ''
  importing.value = false
  fetchingUrl.value = false
  importOptions.value = ['portRanges', 'reservedPorts', 'allocationPolicy', 'monitoring', 'backup']
  
  if (uploadRef.value) {
    uploadRef.value.clearFiles()
  }
}

const handleMethodChange = () => {
  previewConfig.value = null
  errorMessage.value = ''
}

const handleFileChange = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    configText.value = content
    parseConfig(content)
  }
  reader.readAsText(file.raw)
}

const handleFileRemove = () => {
  configText.value = ''
  previewConfig.value = null
  errorMessage.value = ''
}

const handleExceed = () => {
  ElMessage.warning('只能选择一个配置文件')
}

const fetchFromUrl = async () => {
  if (!configUrl.value) {
    return
  }

  fetchingUrl.value = true
  try {
    const response = await fetch(configUrl.value)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const content = await response.text()
    configText.value = content
    parseConfig(content)
    
    ElMessage.success('配置获取成功')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errorMessage.value = `获取配置失败: ${msg}`
    ElMessage.error('获取配置失败')
  } finally {
    fetchingUrl.value = false
  }
}

const parseConfig = (content: string) => {
  try {
    const config = JSON.parse(content)
    
    // 验证配置结构
    if (!validateConfig(config)) {
      throw new Error('配置格式不正确')
    }
    
    previewConfig.value = config
    errorMessage.value = ''
  } catch (error) {
    previewConfig.value = null
    const msg = error instanceof Error ? error.message : String(error)
    errorMessage.value = `配置解析失败: ${msg}`
  }
}

const validateConfig = (config: any): boolean => {
  // 基本结构验证
  if (!config || typeof config !== 'object') {
    return false
  }
  
  // 检查必要字段
  if (!config.portConfiguration) {
    throw new Error('缺少端口配置 (portConfiguration)')
  }
  
  const portConfig = config.portConfiguration
  
  if (!portConfig.frontendRange || !portConfig.backendRange) {
    throw new Error('缺少端口范围配置')
  }
  
  if (!Array.isArray(portConfig.reservedPorts)) {
    throw new Error('保留端口配置格式错误')
  }
  
  return true
}

const formatJson = () => {
  try {
    const parsed = JSON.parse(configText.value)
    configText.value = JSON.stringify(parsed, null, 2)
    ElMessage.success('JSON 格式化成功')
  } catch (error) {
    ElMessage.error('JSON 格式错误，无法格式化')
  }
}

const validateJson = () => {
  try {
    JSON.parse(configText.value)
    ElMessage.success('JSON 格式正确')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`JSON 格式错误: ${msg}`)
  }
}

const clearText = () => {
  configText.value = ''
  previewConfig.value = null
  errorMessage.value = ''
}

const confirmImport = async () => {
  if (!previewConfig.value) {
    return
  }

  importing.value = true
  try {
    // 根据选择的选项过滤配置
    const configToImport = filterConfigByOptions(previewConfig.value, importOptions.value)
    
    emit('import-config', JSON.stringify(configToImport))
    
    ElMessage.success('配置导入成功')
    visible.value = false
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入配置失败: ${msg}`)
  } finally {
    importing.value = false
  }
}

const filterConfigByOptions = (config: any, options: string[]) => {
  const filtered = { ...config }
  
  if (!options.includes('portRanges')) {
    delete filtered.portConfiguration?.frontendRange
    delete filtered.portConfiguration?.backendRange
  }
  
  if (!options.includes('reservedPorts')) {
    delete filtered.portConfiguration?.reservedPorts
  }
  
  if (!options.includes('allocationPolicy')) {
    delete filtered.portConfiguration?.allocationPolicy
  }
  
  if (!options.includes('monitoring')) {
    delete filtered.portConfiguration?.monitoring
  }
  
  return filtered
}

// 工具函数
const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('zh-CN')
}

const getPortRangeText = (range?: { start: number; end: number }) => {
  if (!range) return 'N/A'
  return `${range.start} - ${range.end} (共 ${range.end - range.start + 1} 个端口)`
}

const getPortTagType = (category: string) => {
  const types: Record<string, string> = {
    system: 'danger',
    portal: 'warning',
    custom: 'success'
  }
  return types[category] || 'info'
}
</script>

<style scoped>
.import-dialog-content {
  padding: 16px 0;
}

.import-method {
  margin-bottom: 24px;
}

.import-method h4 {
  margin: 0 0 12px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.import-section {
  margin-bottom: 24px;
}

.config-upload {
  width: 100%;
}

.text-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.url-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
  margin-bottom: 12px;
}

.url-actions {
  margin-top: 12px;
}

.config-preview {
  margin-bottom: 24px;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.config-preview h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.reserved-ports-preview {
  margin-top: 16px;
}

.reserved-ports-preview h5 {
  margin: 0 0 8px 0;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.ports-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.port-tag {
  margin: 0;
}

.more-ports {
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

.import-options {
  margin-bottom: 24px;
}

.import-options h4 {
  margin: 0 0 12px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.error-message {
  margin-bottom: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .text-actions {
    flex-direction: column;
  }
  
  .ports-list {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>