<template>
  <div class="test-page">
    <div class="test-header">
      <h2>构建分析模态框测试</h2>
      <p>测试优化后的构建分析模态框显示效果</p>
    </div>
    
    <div class="test-controls">
      <el-button type="primary" @click="showTestDialog">
        <el-icon><Document /></el-icon>
        显示构建分析结果
      </el-button>
      
      <el-button @click="showEmptyDialog">
        <el-icon><Check /></el-icon>
        显示无优化建议
      </el-button>
    </div>

    <!-- 构建分析结果对话框 -->
    <BuildAnalysisDialog
      v-model="dialogVisible"
      :analysis="currentAnalysis"
      @optimized-deploy="handleOptimizedDeploy"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Document, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import BuildAnalysisDialog from '@/components/BuildAnalysisDialog.vue'
import type { BuildAnalysis } from '@/services/buildApi'

const dialogVisible = ref(false)
const currentAnalysis = ref<BuildAnalysis | null>(null)

// 测试数据 - 完整的构建分析结果
const testAnalysisData: BuildAnalysis = {
  appId: 'test-app-id',
  buildTool: 'Vite',
  buildScript: 'npm run build',
  outputDir: 'dist',
  optimizations: [
    {
      type: 'caching',
      description: '优化缓存策略以提升加载性能，通过配置文件哈希和长期缓存来减少重复下载',
      priority: 'medium',
      config: {
        cacheDir: 'node_modules/.vite',
        build: {
          rollupOptions: {
            output: {
              chunkFileNames: 'assets/[name]-[hash].js',
              entryFileNames: 'assets/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash].[ext]'
            }
          }
        }
      }
    },
    {
      type: 'compression',
      description: '启用Gzip压缩以减少传输大小，可以显著提升页面加载速度',
      priority: 'high',
      config: {
        compression: {
          algorithm: 'gzip',
          threshold: 1024,
          deleteOriginalAssets: false
        }
      }
    },
    {
      type: 'code-splitting',
      description: '实现代码分割以优化首屏加载时间，按需加载模块',
      priority: 'low',
      config: {
        build: {
          rollupOptions: {
            output: {
              manualChunks: {
                vendor: ['vue', 'vue-router'],
                ui: ['element-plus']
              }
            }
          }
        }
      }
    }
  ],
  deploymentStrategy: {
    type: 'unified',
    description: '前端构建后与后端统一部署，使用单一进程提供服务。这种策略适合中小型应用，可以简化部署流程并减少资源消耗。',
    benefits: [
      '减少进程数量，节省服务器资源',
      '简化端口管理，避免跨域问题',
      '提升性能，减少网络跳转延迟',
      '统一日志和监控，便于运维管理',
      '降低部署复杂度，减少配置错误'
    ],
    requirements: [
      '后端需要支持静态文件服务功能',
      '需要配置SPA路由回退机制',
      '确保静态资源路径配置正确',
      '考虑CDN集成以优化全球访问速度'
    ]
  },
  confidence: 0.95,
  issues: [
    '未找到构建配置文件中的性能优化配置',
    '缺少生产环境的环境变量配置',
    '建议添加构建产物大小分析工具'
  ],
  analysisTime: Date.now() - 5 * 60 * 1000 // 5分钟前
}

// 空优化建议的测试数据
const emptyAnalysisData: BuildAnalysis = {
  appId: 'test-app-id-2',
  buildTool: 'Vite',
  buildScript: 'npm run build',
  outputDir: 'dist',
  optimizations: [],
  deploymentStrategy: {
    type: 'spa',
    description: '单页应用部署策略，适合纯前端项目',
    benefits: [
      '部署简单，只需静态文件服务器',
      '可以使用CDN加速全球访问'
    ],
    requirements: [
      '需要配置路由回退',
      '确保API跨域配置正确'
    ]
  },
  confidence: 1.0,
  issues: [],
  analysisTime: Date.now() - 1 * 60 * 1000 // 1分钟前
}

const showTestDialog = () => {
  currentAnalysis.value = testAnalysisData
  dialogVisible.value = true
}

const showEmptyDialog = () => {
  currentAnalysis.value = emptyAnalysisData
  dialogVisible.value = true
}

const handleOptimizedDeploy = (analysis: BuildAnalysis) => {
  ElMessage.success('部署配置优化完成')
  console.log('优化部署:', analysis)
}
</script>

<style scoped>
.test-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.test-header {
  text-align: center;
  margin-bottom: 30px;
  
  h2 {
    color: #303133;
    margin-bottom: 10px;
  }
  
  p {
    color: #606266;
    font-size: 14px;
  }
}

.test-controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}
</style>
