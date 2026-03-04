# 智能命令注入系统 - 技术栈支持文档

## 📋 概述

智能命令注入系统支持多种主流前端和后端技术栈，能够自动识别应用类型并生成相应的启动命令。本文档详细说明了各技术栈的支持情况、命令格式和特殊处理逻辑。

## 🎯 支持的技术栈

### 1. Vite 生态系统

#### 支持的框架变体
| 技术栈名称 | 匹配关键词 | 检测依赖 | 状态 |
|------------|------------|----------|------|
| Vue 3 + Vite | vite, vue-vite | vite + vue | ✅ 完全支持 |
| React + Vite | vite, react-vite | vite + react | ✅ 完全支持 |
| Vite + TypeScript | vite | vite (无框架) | ✅ 完全支持 |
| Svelte + Vite | vite, svelte-vite | vite + svelte | ✅ 完全支持 |

#### 命令格式
```bash
# 开发模式
npm run dev -- --port 3000
npm run serve -- --port 3000

# 生产模式
npm run preview -- --port 4173
```

#### 配置示例
**package.json**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^4.4.5",
    "@vitejs/plugin-vue": "^4.2.3"
  }
}
```

**vite.config.js**:
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000, // 会被命令行参数覆盖
    host: true
  }
})
```

#### 特殊处理
- 自动检测 Vite 插件类型（Vue、React、Svelte）
- 支持开发模式和生产模式的端口注入
- 兼容自定义 Vite 配置

### 2. Next.js 应用

#### 支持的应用类型
| 应用类型 | 匹配关键词 | 检测依赖 | 状态 |
|----------|------------|----------|------|
| Next.js App Router | next.js, nextjs | next | ✅ 完全支持 |
| Next.js Pages Router | next.js, nextjs | next | ✅ 完全支持 |
| Next.js 自定义服务器 | next.js, nextjs | next | ⚠️ 部分支持 |

#### 命令格式
```bash
# 标准 Next.js 应用
npm run dev -- --port 3000      # 开发模式
npm run start -- --port 3000    # 生产模式

# 自定义服务器（不支持端口注入）
npm run dev                      # 使用环境变量或配置文件
npm run start
```

#### 配置示例
**标准应用 package.json**:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.0.3",
    "react": "^18",
    "react-dom": "^18"
  }
}
```

**自定义服务器 package.json**:
```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

#### 自定义服务器检测
系统会自动检测自定义服务器配置：
- 检查 `scripts.dev` 是否以 "next" 开头
- 检查 `scripts.start` 是否以 "next" 开头
- 如果不是，则跳过端口注入

### 3. Angular 应用

#### 支持的版本
| Angular 版本 | CLI 版本 | 匹配关键词 | 状态 |
|--------------|----------|------------|------|
| Angular 15.x | 15.2.x | angular, @angular/cli | ✅ 完全支持 |
| Angular 16.x | 16.2.x | angular, @angular/cli | ✅ 完全支持 |
| Angular 17.x | 17.0.x | angular, @angular/cli | ✅ 完全支持 |

#### 命令格式
```bash
# 直接 ng 命令（支持端口注入）
ng serve --port 4200

# npm 脚本方式（不支持端口注入）
npm run start    # 实际执行 ng serve
npm run serve    # 实际执行 ng serve
```

#### 配置示例
**package.json**:
```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "test": "ng test"
  },
  "devDependencies": {
    "@angular/cli": "^17.0.0",
    "@angular/core": "^17.0.0"
  }
}
```

**angular.json**:
```json
{
  "projects": {
    "my-app": {
      "architect": {
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "options": {
            "port": 4200
          }
        }
      }
    }
  }
}
```

#### 特殊处理
- 区分 Angular 和 AngularJS（排除 angularjs 关键词）
- npm 脚本方式不注入端口参数（依赖环境变量）
- 直接 ng 命令支持端口注入

### 4. Create React App

#### 支持情况
| 应用类型 | 匹配关键词 | 检测依赖 | 状态 |
|----------|------------|----------|------|
| Create React App | react-scripts | react-scripts | ✅ 完全支持 |
| Ejected CRA | react, webpack | react + webpack | ⚠️ 部分支持 |

#### 命令格式
```bash
# 使用环境变量设置端口
PORT=3000 npm start
REACT_APP_PORT=3000 npm start

# 不支持命令行端口参数
npm start -- --port 3000  # 无效
```

#### 配置示例
**package.json**:
```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  }
}
```

#### 特殊处理
- CRA 不支持命令行端口参数
- 使用环境变量 PORT 设置端口
- 系统会跳过端口注入，返回标准命令

### 5. Node.js 后端应用

#### 支持的框架
| 框架 | 匹配关键词 | 检测依赖 | 状态 |
|------|------------|----------|------|
| Express | express | express | 🔄 计划支持 |
| Koa | koa | koa | 🔄 计划支持 |
| Fastify | fastify | fastify | 🔄 计划支持 |
| NestJS | nestjs | @nestjs/core | 🔄 计划支持 |

## 🔍 技术栈检测机制

### 自动检测流程
1. **读取 package.json**: 解析项目依赖信息
2. **匹配检测规则**: 根据关键依赖识别技术栈
3. **确定技术栈**: 返回最匹配的技术栈类型
4. **生成命令**: 使用对应的适配器生成启动命令

### 检测优先级
1. **精确匹配**: 完全匹配技术栈名称
2. **依赖检测**: 基于 package.json 依赖
3. **关键词匹配**: 模糊匹配技术栈名称
4. **默认回退**: 使用通用启动命令

### 检测规则示例
```typescript
const detectionRules = {
  // Vite 检测
  vite: {
    dependencies: ['vite'],
    variants: {
      vue: ['vue', '@vue/cli-service'],
      react: ['react', 'react-dom'],
      svelte: ['svelte']
    }
  },
  
  // Next.js 检测
  nextjs: {
    dependencies: ['next'],
    customServer: (scripts) => {
      return !scripts.dev?.startsWith('next') || 
             !scripts.start?.startsWith('next')
    }
  },
  
  // Angular 检测
  angular: {
    dependencies: ['@angular/core', '@angular/cli'],
    exclude: ['angularjs']
  }
}
```

## ⚙️ 适配器系统

### 适配器接口
```typescript
interface TechStackAdapter {
  // 技术栈匹配
  matches(techStack: string): boolean
  
  // 端口注入支持检查
  supportsPortInjection(command: string, args: string[]): boolean
  
  // 端口参数注入
  injectPort(args: string[], port: string): string[]
  
  // 自定义检测逻辑（可选）
  detectCustomConfig?(directory: string): boolean
}
```

### 适配器实现示例
```typescript
const viteAdapter: TechStackAdapter = {
  matches: (techStack: string) => {
    return techStack.toLowerCase().includes('vite')
  },
  
  supportsPortInjection: (command: string, args: string[]) => {
    return args.includes('dev') || 
           args.includes('serve') || 
           args.includes('preview')
  },
  
  injectPort: (args: string[], port: string) => {
    return [...args, '--', '--port', port]
  }
}
```

## 🔧 配置和自定义

### 环境变量配置
```env
# 启用/禁用智能命令注入
COMMAND_INJECTION_ENABLED=true

# 命令执行超时时间
COMMAND_TIMEOUT=30000

# 最大并发命令数
MAX_CONCURRENT_COMMANDS=10

# 技术栈检测缓存时间
TECH_STACK_CACHE_TTL=300000
```

### 自定义适配器
可以通过配置文件添加自定义技术栈适配器：

```json
{
  "customAdapters": [
    {
      "name": "custom-framework",
      "matchKeywords": ["custom", "framework"],
      "dependencies": ["custom-framework"],
      "commandFormat": "npm run dev -- --port {port}",
      "supportedModes": ["development", "production"]
    }
  ]
}
```

## 📊 性能特性

### 响应时间
- **Vite 应用**: 平均 0.12ms
- **Next.js 应用**: 平均 0.17ms
- **Angular 应用**: 平均 0.11ms

### 内存使用
- **每次调用**: 112 字节内存增长
- **缓存效果**: 减少 60% 重复检测时间
- **并发处理**: 支持 100 个并发调用

### 错误恢复
- **检测失败**: 自动回退到通用命令
- **端口冲突**: 智能跳过端口注入
- **配置错误**: 优雅降级处理

## 🚀 未来支持计划

### 短期计划 (v1.2)
- [ ] **Nuxt.js**: Vue.js 全栈框架
- [ ] **SvelteKit**: Svelte 全栈框架
- [ ] **Remix**: React 全栈框架
- [ ] **Astro**: 静态站点生成器

### 中期计划 (v1.3)
- [ ] **Express**: Node.js Web 框架
- [ ] **NestJS**: Node.js 企业级框架
- [ ] **Spring Boot**: Java Web 框架
- [ ] **Django**: Python Web 框架

### 长期计划 (v2.0)
- [ ] **微服务架构**: 分布式服务支持
- [ ] **云原生应用**: 云平台部署
- [ ] **移动应用**: React Native、Flutter
- [ ] **桌面应用**: Electron、Tauri

## 🔗 相关资源

### 官方文档
- [Vite 官方文档](https://vitejs.dev/)
- [Next.js 官方文档](https://nextjs.org/docs)
- [Angular 官方文档](https://angular.io/docs)
- [Create React App 文档](https://create-react-app.dev/)

### 社区资源
- [Vite 插件生态](https://github.com/vitejs/awesome-vite)
- [Next.js 示例](https://github.com/vercel/next.js/tree/canary/examples)
- [Angular 资源](https://angular.io/resources)

### 相关文档
- [API 文档](./api-documentation.md)
- [部署指南](./deployment-guide.md)
- [性能测试报告](./performance-test-report.md)

## 📞 技术支持

如果您使用的技术栈尚未支持，或者遇到兼容性问题，请：

1. 查看 [GitHub Issues](https://github.com/your-repo/issues)
2. 提交新的 [Feature Request](https://github.com/your-repo/issues/new)
3. 参考 [贡献指南](../CONTRIBUTING.md) 提交 PR
4. 联系开发团队获取技术支持

---

*持续更新中，更多技术栈支持正在开发中...*
