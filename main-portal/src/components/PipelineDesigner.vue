<template>
  <div class="pipeline-designer">
    <!-- 工具栏 -->
    <div class="designer-toolbar">
      <div class="toolbar-left">
        <el-button type="primary" @click="savePipeline" :disabled="!hasChanges">
          <el-icon><DocumentAdd /></el-icon>
          保存流水线
        </el-button>
        <el-button @click="loadTemplate">
          <el-icon><Folder /></el-icon>
          加载模板
        </el-button>
        <el-button @click="executePipeline" :disabled="!currentPipeline">
          <el-icon><VideoPlay /></el-icon>
          执行流水线
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-button @click="zoomIn">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button @click="zoomOut">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-button @click="resetZoom">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 主要设计区域 -->
    <div class="designer-main">
      <!-- 节点面板 -->
      <div class="node-panel">
        <h4>节点类型</h4>
        <div class="node-types">
          <div 
            v-for="nodeType in nodeTypes" 
            :key="nodeType.type"
            class="node-type-item"
            draggable="true"
            @dragstart="onNodeDragStart($event, nodeType)"
          >
            <div class="node-icon" :style="{ backgroundColor: nodeType.color }">
              <i :class="nodeType.icon"></i>
            </div>
            <span>{{ nodeType.name }}</span>
          </div>
        </div>
      </div>

      <!-- 画布区域 -->
      <div class="canvas-container">
        <div 
          ref="canvas"
          class="pipeline-canvas"
          :style="{ transform: `scale(${zoomLevel})` }"
          @drop="onCanvasDrop"
          @dragover.prevent
          @click="onCanvasClick"
        >
          <!-- 网格背景 -->
          <div class="grid-background"></div>

          <!-- 连接线 -->
          <svg class="connections-layer" :width="canvasSize.width" :height="canvasSize.height">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                      refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
              </marker>
            </defs>
            <path
              v-for="edge in currentPipeline?.edges || []"
              :key="edge.id"
              :d="getEdgePath(edge)"
              stroke="#666"
              stroke-width="2"
              fill="none"
              marker-end="url(#arrowhead)"
              class="pipeline-edge"
              @click="selectEdge(edge)"
            />
          </svg>

          <!-- 节点 -->
          <div
            v-for="node in currentPipeline?.nodes || []"
            :key="node.id"
            class="pipeline-node"
            :class="{ 
              'selected': selectedNode?.id === node.id,
              'running': node.status === 'running',
              'success': node.status === 'success',
              'failed': node.status === 'failed'
            }"
            :style="{ 
              left: node.position.x + 'px', 
              top: node.position.y + 'px',
              backgroundColor: getNodeColor(node.type)
            }"
            @click="selectNode(node)"
            @mousedown="startNodeDrag(node, $event)"
          >
            <div class="node-header">
              <i :class="getNodeIcon(node.type)"></i>
              <span class="node-title">{{ node.name }}</span>
            </div>
            <div class="node-status" v-if="node.status">
              <el-tag :type="getStatusType(node.status)" size="small">
                {{ getStatusText(node.status) }}
              </el-tag>
            </div>
            
            <!-- 连接点 -->
            <div class="connection-points">
              <div 
                v-if="node.inputs.length > 0"
                class="input-point"
                @click.stop="startConnection(node, 'input')"
              ></div>
              <div 
                v-if="node.outputs.length > 0"
                class="output-point"
                @click.stop="startConnection(node, 'output')"
              ></div>
            </div>
          </div>

          <!-- 临时连接线 -->
          <svg v-if="tempConnection" class="temp-connection" :width="canvasSize.width" :height="canvasSize.height">
            <path
              :d="getTempConnectionPath()"
              stroke="#409eff"
              stroke-width="2"
              stroke-dasharray="5,5"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <!-- 属性面板 -->
      <div class="properties-panel">
        <h4>属性配置</h4>
        <div v-if="selectedNode" class="node-properties">
          <el-form :model="selectedNode" label-width="80px" size="small">
            <el-form-item label="节点名称">
              <el-input v-model="selectedNode.name" @input="markChanged" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input 
                v-model="selectedNode.description" 
                type="textarea" 
                :rows="2"
                @input="markChanged"
              />
            </el-form-item>
            <el-form-item label="配置">
              <el-input 
                v-model="nodeConfigText" 
                type="textarea" 
                :rows="4"
                placeholder="JSON配置"
                @input="updateNodeConfig"
              />
            </el-form-item>
          </el-form>
        </div>
        <div v-else-if="selectedEdge" class="edge-properties">
          <el-form :model="selectedEdge" label-width="80px" size="small">
            <el-form-item label="标签">
              <el-input v-model="selectedEdge.label" @input="markChanged" />
            </el-form-item>
            <el-form-item label="条件">
              <el-input 
                v-model="selectedEdge.condition" 
                placeholder="执行条件"
                @input="markChanged"
              />
            </el-form-item>
          </el-form>
        </div>
        <div v-else class="pipeline-properties">
          <el-form v-if="currentPipeline" :model="currentPipeline" label-width="80px" size="small">
            <el-form-item label="流水线名称">
              <el-input v-model="currentPipeline.name" @input="markChanged" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input 
                v-model="currentPipeline.description" 
                type="textarea" 
                :rows="2"
                @input="markChanged"
              />
            </el-form-item>
            <el-form-item label="版本">
              <el-input v-model="currentPipeline.version" @input="markChanged" />
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <!-- 模板选择对话框 -->
    <el-dialog v-model="templateDialogVisible" title="选择流水线模板" width="60%">
      <div class="template-grid">
        <el-card 
          v-for="template in templates" 
          :key="template.id"
          class="template-card"
          @click="selectTemplate(template)"
        >
          <template #header>
            <div class="template-header">
              <span>{{ template.name }}</span>
              <el-tag v-if="template.isBuiltIn" type="success" size="small">内置</el-tag>
            </div>
          </template>
          <p>{{ template.description }}</p>
          <div class="template-tags">
            <el-tag v-for="tag in template.tags" :key="tag" size="small">{{ tag }}</el-tag>
          </div>
        </el-card>
      </div>
    </el-dialog>

    <!-- 执行对话框 -->
    <el-dialog v-model="executeDialogVisible" title="执行流水线" width="50%">
      <el-form :model="executeForm" label-width="100px">
        <el-form-item label="触发方式">
          <el-select v-model="executeForm.triggerType">
            <el-option label="手动触发" value="manual" />
            <el-option label="定时触发" value="schedule" />
            <el-option label="Webhook" value="webhook" />
          </el-select>
        </el-form-item>
        <el-form-item label="环境变量">
          <el-input 
            v-model="executeForm.variables" 
            type="textarea" 
            :rows="4"
            placeholder="JSON格式的环境变量"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="executeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmExecute">执行</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, Folder, VideoPlay, ZoomIn, ZoomOut, Refresh } from '@element-plus/icons-vue'

// 响应式数据
const canvas = ref<HTMLElement>()
const currentPipeline = ref<any>(null)
const selectedNode = ref<any>(null)
const selectedEdge = ref<any>(null)
const hasChanges = ref(false)
const zoomLevel = ref(1)
const templateDialogVisible = ref(false)
const executeDialogVisible = ref(false)
const templates = ref<any[]>([])

// 画布相关
const canvasSize = reactive({
  width: 1200,
  height: 800
})

// 拖拽相关
const dragState = reactive({
  isDragging: false,
  dragNode: null as any,
  startPos: { x: 0, y: 0 },
  offset: { x: 0, y: 0 }
})

// 连接相关
const tempConnection = ref<any>(null)
const connectionState = reactive({
  isConnecting: false,
  sourceNode: null as any,
  sourceType: '' as 'input' | 'output',
  mousePos: { x: 0, y: 0 }
})

// 执行表单
const executeForm = reactive({
  triggerType: 'manual',
  variables: '{}'
})

// 节点类型定义
const nodeTypes = [
  { type: 'start', name: '开始', icon: 'el-icon-video-play', color: '#67c23a' },
  { type: 'build', name: '构建', icon: 'el-icon-setting', color: '#409eff' },
  { type: 'test', name: '测试', icon: 'el-icon-check', color: '#e6a23c' },
  { type: 'deploy', name: '部署', icon: 'el-icon-upload', color: '#f56c6c' },
  { type: 'notify', name: '通知', icon: 'el-icon-message', color: '#909399' },
  { type: 'condition', name: '条件', icon: 'el-icon-question', color: '#b37feb' },
  { type: 'parallel', name: '并行', icon: 'el-icon-copy-document', color: '#13c2c2' },
  { type: 'end', name: '结束', icon: 'el-icon-circle-check', color: '#52c41a' }
]

// 计算属性
const nodeConfigText = computed({
  get: () => selectedNode.value ? JSON.stringify(selectedNode.value.config, null, 2) : '',
  set: (value) => {
    if (selectedNode.value) {
      try {
        selectedNode.value.config = JSON.parse(value)
        markChanged()
      } catch (e) {
        // 忽略JSON解析错误
      }
    }
  }
})

// 方法
const markChanged = () => {
  hasChanges.value = true
}

const onNodeDragStart = (event: DragEvent, nodeType: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(nodeType))
  }
}

const onCanvasDrop = (event: DragEvent) => {
  event.preventDefault()
  if (!event.dataTransfer) return

  try {
    const nodeType = JSON.parse(event.dataTransfer.getData('application/json'))
    const rect = canvas.value!.getBoundingClientRect()
    const x = (event.clientX - rect.left) / zoomLevel.value
    const y = (event.clientY - rect.top) / zoomLevel.value

    addNode(nodeType, { x, y })
  } catch (e) {
    console.error('Failed to parse dropped data:', e)
  }
}

const addNode = (nodeType: any, position: { x: number, y: number }) => {
  if (!currentPipeline.value) {
    currentPipeline.value = {
      name: '新建流水线',
      version: '1.0.0',
      nodes: [],
      edges: [],
      variables: {},
      triggers: [],
      notifications: []
    }
  }

  const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const newNode = {
    id: nodeId,
    type: nodeType.type,
    name: nodeType.name,
    config: {},
    position,
    inputs: nodeType.type === 'start' ? [] : ['input'],
    outputs: nodeType.type === 'end' ? [] : ['output']
  }

  currentPipeline.value.nodes.push(newNode)
  markChanged()
}

const selectNode = (node: any) => {
  selectedNode.value = node
  selectedEdge.value = null
}

const selectEdge = (edge: any) => {
  selectedEdge.value = edge
  selectedNode.value = null
}

const onCanvasClick = (event: MouseEvent) => {
  if (event.target === canvas.value) {
    selectedNode.value = null
    selectedEdge.value = null
  }
}

const startNodeDrag = (node: any, event: MouseEvent) => {
  dragState.isDragging = true
  dragState.dragNode = node
  dragState.startPos = { x: event.clientX, y: event.clientY }
  dragState.offset = {
    x: event.clientX - node.position.x * zoomLevel.value,
    y: event.clientY - node.position.y * zoomLevel.value
  }

  document.addEventListener('mousemove', onNodeDrag)
  document.addEventListener('mouseup', stopNodeDrag)
}

const onNodeDrag = (event: MouseEvent) => {
  if (!dragState.isDragging || !dragState.dragNode) return

  dragState.dragNode.position.x = (event.clientX - dragState.offset.x) / zoomLevel.value
  dragState.dragNode.position.y = (event.clientY - dragState.offset.y) / zoomLevel.value
  markChanged()
}

const stopNodeDrag = () => {
  dragState.isDragging = false
  dragState.dragNode = null
  document.removeEventListener('mousemove', onNodeDrag)
  document.removeEventListener('mouseup', stopNodeDrag)
}

const startConnection = (node: any, type: 'input' | 'output') => {
  connectionState.isConnecting = true
  connectionState.sourceNode = node
  connectionState.sourceType = type

  document.addEventListener('mousemove', onConnectionMove)
  document.addEventListener('mouseup', stopConnection)
}

const onConnectionMove = (event: MouseEvent) => {
  if (!connectionState.isConnecting) return

  const rect = canvas.value!.getBoundingClientRect()
  connectionState.mousePos = {
    x: (event.clientX - rect.left) / zoomLevel.value,
    y: (event.clientY - rect.top) / zoomLevel.value
  }

  tempConnection.value = {
    source: connectionState.sourceNode,
    target: connectionState.mousePos
  }
}

const stopConnection = () => {
  connectionState.isConnecting = false
  tempConnection.value = null
  document.removeEventListener('mousemove', onConnectionMove)
  document.removeEventListener('mouseup', stopConnection)
}

const getNodeColor = (type: string) => {
  const nodeType = nodeTypes.find(nt => nt.type === type)
  return nodeType?.color || '#909399'
}

const getNodeIcon = (type: string) => {
  const nodeType = nodeTypes.find(nt => nt.type === type)
  return nodeType?.icon || 'el-icon-setting'
}

const getStatusType = (status: string) => {
  switch (status) {
    case 'success': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'primary'
    default: return 'info'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '等待中'
    case 'running': return '运行中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '跳过'
    default: return status
  }
}

const getEdgePath = (edge: any) => {
  const sourceNode = currentPipeline.value?.nodes.find((n: any) => n.id === edge.source)
  const targetNode = currentPipeline.value?.nodes.find((n: any) => n.id === edge.target)
  
  if (!sourceNode || !targetNode) return ''

  const x1 = sourceNode.position.x + 100
  const y1 = sourceNode.position.y + 30
  const x2 = targetNode.position.x
  const y2 = targetNode.position.y + 30

  return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1} ${x2} ${y2}`
}

const getTempConnectionPath = () => {
  if (!tempConnection.value) return ''

  const source = tempConnection.value.source
  const target = tempConnection.value.target

  const x1 = source.position.x + 100
  const y1 = source.position.y + 30
  const x2 = target.x
  const y2 = target.y

  return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1} ${x2} ${y2}`
}

const zoomIn = () => {
  zoomLevel.value = Math.min(zoomLevel.value * 1.2, 3)
}

const zoomOut = () => {
  zoomLevel.value = Math.max(zoomLevel.value / 1.2, 0.3)
}

const resetZoom = () => {
  zoomLevel.value = 1
}

const savePipeline = async () => {
  if (!currentPipeline.value) return

  try {
    // 这里应该调用API保存流水线
    ElMessage.success('流水线保存成功')
    hasChanges.value = false
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const loadTemplate = () => {
  templateDialogVisible.value = true
  // 加载模板列表
  templates.value = [
    {
      id: 'frontend-ci-cd',
      name: '前端CI/CD流水线',
      description: '完整的前端应用CI/CD流水线',
      tags: ['frontend', 'ci-cd'],
      isBuiltIn: true
    },
    {
      id: 'simple-build',
      name: '简单构建流水线',
      description: '基础的构建流水线',
      tags: ['basic'],
      isBuiltIn: true
    }
  ]
}

const selectTemplate = (template: any) => {
  // 加载模板到当前流水线
  ElMessage.success(`已加载模板：${template.name}`)
  templateDialogVisible.value = false
}

const executePipeline = () => {
  if (!currentPipeline.value) return
  executeDialogVisible.value = true
}

const confirmExecute = async () => {
  try {
    // 这里应该调用API执行流水线
    ElMessage.success('流水线执行已启动')
    executeDialogVisible.value = false
  } catch (error) {
    ElMessage.error('执行失败')
  }
}

const updateNodeConfig = (value: string) => {
  nodeConfigText.value = value
}

// 生命周期
onMounted(() => {
  // 初始化画布
  nextTick(() => {
    if (canvas.value) {
      const rect = canvas.value.getBoundingClientRect()
      canvasSize.width = rect.width
      canvasSize.height = rect.height
    }
  })
})
</script>

<style scoped>
.pipeline-designer {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.designer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 10px;
}

.designer-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.node-panel {
  width: 200px;
  background: white;
  border-right: 1px solid #e4e7ed;
  padding: 20px;
  overflow-y: auto;
}

.node-types {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.node-type-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: grab;
  transition: all 0.3s;
}

.node-type-item:hover {
  border-color: #409eff;
  background: #f0f9ff;
}

.node-type-item:active {
  cursor: grabbing;
}

.node-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: auto;
  background: #fafafa;
}

.pipeline-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 1200px;
  min-height: 800px;
  transform-origin: 0 0;
  transition: transform 0.3s;
}

.grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(to right, #e4e7ed 1px, transparent 1px),
    linear-gradient(to bottom, #e4e7ed 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.5;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.pipeline-edge {
  pointer-events: stroke;
  cursor: pointer;
}

.pipeline-edge:hover {
  stroke: #409eff;
  stroke-width: 3;
}

.temp-connection {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.pipeline-node {
  position: absolute;
  width: 120px;
  min-height: 60px;
  background: white;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.pipeline-node:hover {
  border-color: #409eff;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.pipeline-node.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.pipeline-node.running {
  border-color: #409eff;
  animation: pulse 2s infinite;
}

.pipeline-node.success {
  border-color: #67c23a;
}

.pipeline-node.failed {
  border-color: #f56c6c;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(64, 158, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0); }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
}

.node-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-status {
  padding: 0 12px 8px;
}

.connection-points {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.input-point {
  position: absolute;
  left: -6px;
  width: 12px;
  height: 12px;
  background: #409eff;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
}

.output-point {
  position: absolute;
  right: -6px;
  width: 12px;
  height: 12px;
  background: #67c23a;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
}

.properties-panel {
  width: 300px;
  background: white;
  border-left: 1px solid #e4e7ed;
  padding: 20px;
  overflow-y: auto;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.template-card {
  cursor: pointer;
  transition: all 0.3s;
}

.template-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-tags {
  margin-top: 10px;
}

.template-tags .el-tag {
  margin-right: 5px;
}
</style>
