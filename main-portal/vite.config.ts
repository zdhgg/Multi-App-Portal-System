import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version?: string }
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '1.1.1'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom'
  },
  define: {
    // 在开发环境中明确定义WebSocket URL，确保使用代理
    'import.meta.env.VITE_WS_URL': JSON.stringify(
      process.env.NODE_ENV === 'production' ? undefined : 'ws://localhost:3000/ws'
    ),
    // 定义应用版本号
    '__APP_VERSION__': JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@views': resolve(__dirname, 'src/views'),
      '@stores': resolve(__dirname, 'src/stores'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types')
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: false, // 保留原始Host头
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const originalHost = req.headers.host
            if (originalHost && !originalHost.includes('localhost') && !originalHost.includes('127.0.0.1')) {
              // 为局域网访问设置正确的Host头
              const hostWithoutPort = originalHost.split(':')[0]
              proxyReq.setHeader('host', `${hostWithoutPort}:8002`)
              proxyReq.setHeader('x-forwarded-host', originalHost)
              proxyReq.setHeader('x-original-host', originalHost)
            }
          })
        }
      },
      '/ws': {
        target: 'ws://localhost:8002',
        ws: true,
        changeOrigin: false, // 保持一致
        configure: (proxy, options) => {
          // 静默处理连接错误（后端未就绪时的瞬时错误）
          proxy.on('error', (err, req, res) => {
            // 不打印 ECONNREFUSED 错误，前端会自动重连
          })
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            const originalHost = req.headers.host
            if (originalHost && !originalHost.includes('localhost') && !originalHost.includes('127.0.0.1')) {
              const hostWithoutPort = originalHost.split(':')[0]
              proxyReq.setHeader('host', `${hostWithoutPort}:8002`)
              proxyReq.setHeader('x-forwarded-host', originalHost)
            }
          })
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 增加 chunk 大小警告限制（适应大型 UI 库）
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 核心库
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          // Element Plus UI 组件库（体积较大，独立加载）
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          // ECharts 图表库（独立拆分，按需加载）
          'echarts': ['echarts', 'vue-echarts']
        }
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 使用现代 Sass API
        api: 'modern-compiler'
      }
    }
  }
})
