<template>
  <div class="build-demo-page">
    <el-card class="demo-card">
      <template #header>
        <div class="card-header">
          <span>构建功能演示</span>
          <el-tag type="info" size="small">开发测试</el-tag>
        </div>
      </template>
      
      <div class="demo-content">
        <!-- 构建状态指示器演示 -->
        <div class="demo-section">
          <h3>构建状态指示器</h3>
          <div class="demo-grid">
            <div class="demo-item">
              <h4>Vite 项目 - 成功</h4>
              <BuildStatusIndicator
                build-tool="Vite"
                status="success"
                :confidence="0.95"
                :optimization-count="2"
                :last-analysis="Date.now() - 300000"
              />
            </div>
            
            <div class="demo-item">
              <h4>Next.js 项目 - 构建中</h4>
              <BuildStatusIndicator
                build-tool="Next.js"
                status="building"
                :confidence="0.88"
                :optimization-count="0"
                :last-analysis="Date.now() - 60000"
              />
            </div>
            
            <div class="demo-item">
              <h4>React 项目 - 有警告</h4>
              <BuildStatusIndicator
                build-tool="Create React App"
                status="warning"
                :confidence="0.72"
                :optimization-count="4"
                :last-analysis="Date.now() - 3600000"
              />
            </div>
            
            <div class="demo-item">
              <h4>Vue 项目 - 失败</h4>
              <BuildStatusIndicator
                build-tool="Vue CLI"
                status="failed"
                :confidence="0.45"
                :optimization-count="1"
                :last-analysis="Date.now() - 86400000"
              />
            </div>
          </div>
        </div>

        <!-- 构建优化卡片演示 -->
        <div class="demo-section">
          <h3>构建优化建议</h3>
          <div class="optimizations-demo">
            <BuildOptimizationCard
              :optimization="demoOptimizations[0]"
              @apply="handleApplyOptimization"
            />
            <BuildOptimizationCard
              :optimization="demoOptimizations[1]"
              :applied="true"
              @apply="handleApplyOptimization"
            />
            <BuildOptimizationCard
              :optimization="demoOptimizations[2]"
              @apply="handleApplyOptimization"
            />
          </div>
        </div>

        <!-- 构建分析对话框演示 -->
        <div class="demo-section">
          <h3>构建分析对话框</h3>
          <el-button type="primary" @click="showAnalysisDialog">
            查看构建分析结果
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 构建分析对话框 -->
    <BuildAnalysisDialog
      v-model="analysisDialogVisible"
      :analysis="demoAnalysis"
      @optimized-deploy="handleOptimizedDeploy"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import BuildStatusIndicator from '@/components/BuildStatusIndicator.vue'
import BuildOptimizationCard from '@/components/BuildOptimizationCard.vue'
import BuildAnalysisDialog from '@/components/BuildAnalysisDialog.vue'
import type { BuildOptimization, BuildAnalysis } from '@/services/buildApi'

const analysisDialogVisible = ref(false)

// 演示用的优化建议数据
const demoOptimizations: BuildOptimization[] = [
  {
    type: 'code-splitting',
    description: '启用智能代码分割以减少初始包大小，提升首屏加载速度',
    priority: 'high',
    config: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', 'element-plus'],
            utils: ['axios', 'lodash']
          }
        }
      }
    }
  },
  {
    type: 'minification',
    description: '启用代码压缩以减少文件大小，提升加载性能',
    priority: 'medium',
    config: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    }
  },
  {
    type: 'caching',
    description: '优化缓存策略以提升重复访问性能',
    priority: 'low',
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
  }
]

// 演示用的构建分析数据
const demoAnalysis: BuildAnalysis = {
  appId: 'demo-app-001',
  buildTool: 'Vite',
  buildScript: 'npm run build',
  outputDir: 'dist',
  confidence: 0.92,
  optimizations: demoOptimizations,
  deploymentStrategy: {
    type: 'unified',
    description: '前端构建后与后端统一部署，使用单一进程提供服务',
    benefits: [
      '减少进程数量，节省资源',
      '简化端口管理',
      '提升性能，减少网络跳转',
      '统一日志和监控'
    ],
    requirements: [
      '后端需要支持静态文件服务',
      '需要配置 SPA 路由回退'
    ]
  },
  issues: [
    '未启用代码分割，可能导致初始包过大',
    '建议启用 gzip 压缩以进一步减少传输大小'
  ],
  analysisTime: Date.now() - 2 * 60 * 1000 // 2分钟前
}

// 显示分析对话框
const showAnalysisDialog = () => {
  analysisDialogVisible.value = true
}

// 处理应用优化
const handleApplyOptimization = (optimization: BuildOptimization) => {
  ElMessage.success(`已应用优化: ${optimization.type}`)
}

// 处理优化部署
const handleOptimizedDeploy = (analysis: BuildAnalysis) => {
  ElMessage.success('部署配置优化完成')
}
</script>

<style scoped>
.build-demo-page {
  padding: 24px;
  background: #f0f2f5;
  min-height: 100vh;
}

.demo-card {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.demo-content {
  .demo-section {
    margin-bottom: 32px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    h3 {
      margin: 0 0 16px 0;
      color: #303133;
      font-size: 18px;
      font-weight: 500;
      border-bottom: 2px solid #409eff;
      padding-bottom: 8px;
    }
  }
  
  .demo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    
    .demo-item {
      padding: 16px;
      background: #fafbfc;
      border: 1px solid #e4e7ed;
      border-radius: 8px;
      
      h4 {
        margin: 0 0 12px 0;
        color: #606266;
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
  
  .optimizations-demo {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

@media (max-width: 768px) {
  .build-demo-page {
    padding: 16px;
  }
  
  .demo-content {
    .demo-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
