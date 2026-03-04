# 🔍 API 请求问题分析和解决方案

## 问题描述

前端应用在加载固定应用列表时出现错误：

```
portal.ts:74 加载固定应用失败，降级到完整应用列表: Error: 获取固定应用列表失败
```

但同时，测试请求却成功返回数据：

```javascript
Portal.vue:509 代理API请求结果: 200 true
Portal.vue:512 代理API请求数据: {success: true, data: Array(2)}
```

## 根本原因

### 1. 环境配置冲突

从日志可以看到异常的环境变量组合：

```javascript
Environment variables: {
  BASE_URL: '/',
  DEV: true,        // ❌ 开发模式标志
  MODE: 'production', // ⚠️ 生产模式
  PROD: false,      // ❌ 生产标志为 false
  SSR: false
}
```

**问题**：`MODE: 'production'` 和 `DEV: true` 的组合是不正常的。

### 2. API URL 构建逻辑问题

在 `main-portal/src/services/api.ts` 的 `getOptimalBaseUrl` 方法中：

```typescript
private getOptimalBaseUrl(): string {
  // 在开发环境下，优先使用代理（相对路径）
  if (import.meta.env.DEV) {
    return '' // 使用相对路径，通过Vite代理
  }

  // 生产环境或明确指定时使用环境变量
  return (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002').replace(/\/+$/, '')
}
```

**问题**：因为 `DEV: true`，方法返回空字符串，期望通过 Vite 开发服务器的代理转发请求。但如果：
- 运行的是生产构建（从 dist 目录）
- Vite 开发服务器未运行
- 代理配置有问题

相对路径请求 `/api/v2/public/apps/pinned` 就会失败。

### 3. 测试请求 vs 实际请求

**测试请求**（Portal.vue:505-513）：
```javascript
const testUrl = `http://localhost:8002/api/v2/public/apps/pinned`
const testResponse = await fetch(testUrl)  // ✅ 直接请求后端，成功
```

**实际请求**（通过 apiService）：
```javascript
// 因为 DEV: true，使用相对路径
url = `/api/v2/public/apps/pinned`  // ❌ 期望代理但代理可能不可用
```

## 解决方案

### ✅ 方案1：修复 API 服务逻辑（已应用）

修改 `getOptimalBaseUrl` 方法，优先使用明确配置的环境变量：

```typescript
private getOptimalBaseUrl(): string {
  // 🔧 优先使用明确配置的环境变量
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
  }

  // 在开发环境下，使用代理（相对路径）
  if (import.meta.env.DEV) {
    return '' // 使用相对路径，通过Vite代理
  }

  // 降级到默认值
  return 'http://localhost:8002'
}
```

**优势**：
- ✅ 明确配置优先
- ✅ 保留代理功能作为降级选项
- ✅ 兼容各种部署场景

### 📝 方案2：创建环境配置文件

在 `main-portal/` 目录创建以下文件：

**`.env.development`**（开发环境）：
```env
# 开发环境配置

# API基础URL - 留空使用Vite代理
VITE_API_BASE_URL=

# WebSocket URL
VITE_WS_URL=ws://localhost:3000/ws
```

**`.env.production`**（生产环境）：
```env
# 生产环境配置

# API基础URL - 指向后端服务器
VITE_API_BASE_URL=http://localhost:8002

# WebSocket URL
VITE_WS_URL=ws://localhost:8002/ws
```

### 🚀 方案3：使用正确的启动命令

**开发模式**（使用 Vite 代理）：
```bash
cd main-portal
npm run dev
```

**生产预览**（使用明确的 API URL）：
```bash
cd main-portal
npm run build
npm run preview
```

**生产部署**（需要配置环境变量）：
```bash
# 设置环境变量
export VITE_API_BASE_URL=http://your-api-server:8002

# 或在 .env.production 中配置
cd main-portal
npm run build
```

## 验证步骤

### 1. 检查当前环境

打开浏览器控制台，运行：

```javascript
console.log('环境变量:', {
  DEV: import.meta.env.DEV,
  MODE: import.meta.env.MODE,
  PROD: import.meta.env.PROD,
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL
})
```

**期望结果**：
- 开发模式：`DEV: true, MODE: 'development', PROD: false`
- 生产模式：`DEV: false, MODE: 'production', PROD: true`

### 2. 测试 API 请求

在控制台运行：

```javascript
// 测试 API 服务
const testPinnedApps = async () => {
  const response = await fetch('/api/v2/public/apps/pinned')
  const data = await response.json()
  console.log('固定应用数据:', data)
}

testPinnedApps()
```

**期望结果**：
```javascript
{
  success: true,
  data: [...]  // 应用列表
}
```

### 3. 检查网络请求

1. 打开浏览器开发者工具
2. 切换到 Network 标签
3. 刷新页面
4. 查找 `apps/pinned` 请求
5. 检查：
   - ✅ 状态码：200
   - ✅ 响应格式：`{success: true, data: [...]}`
   - ✅ 请求 URL 正确

## 常见问题

### Q1: 为什么测试请求成功但实际请求失败？

**A**: 测试请求使用绝对 URL（`http://localhost:8002/...`）直接访问后端，而实际请求使用相对 URL（`/api/...`）期望通过代理或相同域名访问，如果代理未配置或不可用就会失败。

### Q2: 如何确定使用哪种启动方式？

**A**: 
- **开发调试**：使用 `npm run dev`（端口 3000，支持热重载和代理）
- **生产预览**：使用 `npm run build && npm run preview`（构建后预览）
- **生产部署**：构建后用 nginx 或其他 Web 服务器托管 `dist/` 目录

### Q3: CORS 错误怎么办？

**A**: 如果看到 CORS 错误，确保：
1. 后端已启动（`http://localhost:8002`）
2. 前端使用正确的 API URL
3. 如果跨域访问，后端需要配置 CORS 头

### Q4: 后端 API 正常但前端一直报错？

**A**: 清除浏览器缓存和 localStorage：

```javascript
// 在浏览器控制台运行
localStorage.clear()
location.reload()
```

## 技术细节

### API 服务架构

```
前端应用 (main-portal)
    ↓
apiService.get('/v2/public/apps/pinned')
    ↓
URL 构建逻辑
    ├─ 有 VITE_API_BASE_URL → http://localhost:8002/api/v2/public/apps/pinned
    ├─ DEV 模式无配置 → /api/v2/public/apps/pinned (通过 Vite 代理)
    └─ 降级 → http://localhost:8002/api/v2/public/apps/pinned
    ↓
后端 API (detection-api)
    ↓
/api/v2/public/apps/pinned
    ↓
PublicController.handleGetPinnedApps()
    ↓
返回: { success: true, data: [...] }
```

### Vite 代理配置

在 `main-portal/vite.config.ts` 中：

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8002',
      changeOrigin: false,
      configure: (proxy, options) => {
        proxy.on('proxyReq', (proxyReq, req, res) => {
          // 处理局域网访问的 Host 头
          const originalHost = req.headers.host
          if (originalHost && !originalHost.includes('localhost')) {
            proxyReq.setHeader('x-forwarded-host', originalHost)
          }
        })
      }
    }
  }
}
```

## 总结

**问题根源**：环境配置和 API URL 构建逻辑不匹配

**核心修复**：优先使用明确配置的 `VITE_API_BASE_URL` 环境变量

**建议实践**：
1. ✅ 开发时使用 `npm run dev` 并依赖 Vite 代理
2. ✅ 生产时明确配置 `VITE_API_BASE_URL`
3. ✅ 使用 `.env.development` 和 `.env.production` 分离配置
4. ✅ 部署前测试环境变量是否正确

**相关文件**：
- `main-portal/src/services/api.ts` - API 服务核心逻辑
- `main-portal/vite.config.ts` - Vite 配置和代理
- `detection-api/src/api/controllers/PublicController.ts` - 后端 API 控制器
- `detection-api/src/core/ServiceContainer.ts` - 路由注册

