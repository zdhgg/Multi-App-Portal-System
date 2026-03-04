# 智能命令注入系统 - API 文档

## 📖 概述

智能命令注入系统提供了一套完整的API接口，用于生成和管理应用启动命令。系统能够智能识别不同技术栈，并为启动命令自动注入端口参数。

## 🎯 核心功能

### getStartCommand 方法

智能命令注入系统的核心方法，用于生成应用启动命令。

#### 方法签名

```typescript
getStartCommand(
  directory: string,
  techStack: string,
  mode: 'development' | 'production' = 'development',
  port?: number
): CommandInfo | null

interface CommandInfo {
  command: string
  args: string[]
}
```

#### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| directory | string | ✅ | - | 应用目录的绝对路径 |
| techStack | string | ✅ | - | 技术栈名称（如 'Vite', 'Next.js', 'Angular'） |
| mode | string | ❌ | 'development' | 运行模式：'development' 或 'production' |
| port | number | ❌ | undefined | 端口号，如果提供则会注入到启动命令中 |

#### 返回值

- **成功**: 返回 `CommandInfo` 对象，包含 `command` 和 `args`
- **失败**: 返回 `null`

#### 使用示例

```typescript
import { AppManager } from './services/appManager'

const appManager = new AppManager()

// 基础使用
const result = appManager.getStartCommand(
  '/path/to/vite-app',
  'Vite',
  'development',
  3000
)
// 返回: { command: 'npm', args: ['run', 'dev', '--', '--port', '3000'] }

// 不指定端口
const result2 = appManager.getStartCommand(
  '/path/to/nextjs-app',
  'Next.js',
  'development'
)
// 返回: { command: 'npm', args: ['run', 'dev'] }

// 生产模式
const result3 = appManager.getStartCommand(
  '/path/to/angular-app',
  'Angular',
  'production',
  4200
)
// 返回: { command: 'ng', args: ['serve', '--port', '4200'] }
```

## 🔧 技术栈适配器

### 支持的技术栈

#### 1. Vite 适配器

**匹配规则**: 技术栈名称包含 'vite'（不区分大小写）

**支持的变体**:
- Vue 3 + Vite
- React + Vite  
- Vite + TypeScript
- vue-vite
- react-vite

**端口注入格式**:
```bash
npm run dev -- --port 3000
npm run serve -- --port 3000
npm run preview -- --port 3000  # 生产模式
```

**示例**:
```typescript
// 开发模式
getStartCommand('/path/to/vite-app', 'Vue 3 + Vite', 'development', 3000)
// 返回: { command: 'npm', args: ['run', 'dev', '--', '--port', '3000'] }

// 生产模式
getStartCommand('/path/to/vite-app', 'React + Vite', 'production', 4173)
// 返回: { command: 'npm', args: ['run', 'preview', '--', '--port', '4173'] }
```

#### 2. Next.js 适配器

**匹配规则**: 技术栈名称包含 'next'（不区分大小写）

**支持的变体**:
- Next.js
- nextjs
- next.js
- Next

**端口注入格式**:
```bash
npm run dev -- --port 3000      # 开发模式
npm run start -- --port 3000    # 生产模式
```

**自定义服务器检测**:
系统会自动检测自定义服务器配置，如果检测到以下情况会跳过端口注入：
- `scripts.dev` 不以 "next" 开头
- `scripts.start` 不以 "next" 开头

**示例**:
```typescript
// 标准 Next.js 应用
getStartCommand('/path/to/nextjs-app', 'Next.js', 'development', 3000)
// 返回: { command: 'npm', args: ['run', 'dev', '--', '--port', '3000'] }

// 自定义服务器（package.json 中 "start": "node server.js"）
getStartCommand('/path/to/custom-server', 'Next.js', 'development', 3000)
// 返回: { command: 'npm', args: ['run', 'dev'] } // 不注入端口
```

#### 3. Angular 适配器

**匹配规则**: 技术栈名称包含 'angular'，但排除 'angularjs'

**支持的变体**:
- Angular
- angular
- Angular CLI
- @angular/cli
- ng

**端口注入格式**:
```bash
ng serve --port 4200
```

**特殊处理**:
- 只有直接使用 `ng` 命令时才注入端口参数
- 通过 npm 脚本启动时不注入端口参数（依赖环境变量）

**示例**:
```typescript
// 直接 ng 命令（备用情况）
getStartCommand('/nonexistent/angular-app', 'Angular', 'development', 4200)
// 返回: { command: 'ng', args: ['serve', '--port', '4200'] }

// npm 脚本方式（常见情况）
getStartCommand('/path/to/angular-app', 'Angular', 'development', 4200)
// 返回: { command: 'npm', args: ['run', 'serve'] } // 不注入端口
```

## 🚀 REST API 接口

### 1. 生成启动命令

**接口**: `POST /api/command/generate`

**请求体**:
```json
{
  "directory": "/path/to/app",
  "techStack": "Vite",
  "mode": "development",
  "port": 3000
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "command": "npm",
    "args": ["run", "dev", "--", "--port", "3000"],
    "techStack": "Vite",
    "portInjected": true,
    "detectedTechStack": "Vue 3 + Vite"
  }
}
```

### 2. 获取支持的技术栈

**接口**: `GET /api/command/tech-stacks`

**响应**:
```json
{
  "success": true,
  "data": {
    "supported": [
      {
        "name": "Vite",
        "variants": ["Vue 3 + Vite", "React + Vite", "Vite + TypeScript"],
        "supportsPortInjection": true,
        "commandFormat": "npm run dev -- --port {port}",
        "modes": ["development", "production"]
      },
      {
        "name": "Next.js",
        "variants": ["Next.js", "nextjs", "next.js"],
        "supportsPortInjection": true,
        "commandFormat": "npm run dev -- --port {port}",
        "modes": ["development", "production"],
        "notes": "自动检测自定义服务器"
      },
      {
        "name": "Angular",
        "variants": ["Angular", "Angular CLI", "@angular/cli"],
        "supportsPortInjection": true,
        "commandFormat": "ng serve --port {port}",
        "modes": ["development", "production"],
        "notes": "仅直接ng命令支持端口注入"
      }
    ]
  }
}
```

### 3. 测试命令生成

**接口**: `POST /api/command/test`

**请求体**:
```json
{
  "directory": "/path/to/app",
  "techStack": "Vite",
  "port": 3000
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "command": {
      "command": "npm",
      "args": ["run", "dev", "--", "--port", "3000"]
    },
    "executionTime": 0.12,
    "detectedTechStack": "Vue 3 + Vite",
    "portInjected": true
  }
}
```

## 🔍 智能检测机制

### 技术栈自动检测

当传入的技术栈为 `'未知技术栈'` 或无效值时，系统会自动检测：

1. **读取 package.json**: 解析依赖信息
2. **匹配技术栈**: 根据关键依赖识别技术栈
3. **返回结果**: 使用检测到的技术栈生成命令

**检测规则**:
```typescript
// Vite 检测
if (dependencies.vite || dependencies['@vitejs/plugin-vue'] || dependencies['@vitejs/plugin-react']) {
  if (dependencies.vue) return 'Vue 3 + Vite'
  if (dependencies.react) return 'React + Vite'
  return 'Vite + TypeScript'
}

// Next.js 检测
if (dependencies.next) return 'Next.js'

// Angular 检测
if (dependencies['@angular/core'] || dependencies['@angular/cli']) return 'Angular'
```

### 脚本优先级

系统按以下优先级选择启动脚本：

**开发模式**:
1. `scripts.dev`
2. `scripts.serve`
3. `scripts.start`

**生产模式**:
1. `scripts.start`
2. `scripts.preview` (Vite)
3. `scripts.build`

## ⚡ 性能特性

### 响应时间
- **单次调用**: 平均 0.76ms
- **批量调用**: 平均 0.12ms (1000次)
- **极限压力**: 平均 0.11ms (20000次)

### 吞吐量
- **每秒调用数**: 9,311 次
- **并发处理**: 支持 100 个并发调用
- **数据一致性**: 100%

### 内存效率
- **每次调用内存增长**: 112 字节
- **长期运行内存增长率**: 8.87%
- **无内存泄漏**: 经过 43,150 次调用验证

## 🛡️ 错误处理

### 错误类型

1. **文件系统错误**: 目录不存在、权限不足、文件损坏
2. **参数错误**: 无效端口号、技术栈名称、模式参数
3. **解析错误**: package.json 格式错误、依赖信息缺失

### 错误恢复机制

1. **多层回退**: package.json → 技术栈检测 → 备用命令 → null
2. **参数过滤**: 自动过滤无效的端口号和参数
3. **优雅降级**: 错误情况下返回基础启动命令

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "INVALID_DIRECTORY",
    "message": "指定的目录不存在或无法访问",
    "details": {
      "directory": "/invalid/path",
      "techStack": "Vite"
    }
  }
}
```

## 📋 最佳实践

### 1. 技术栈命名
- 使用标准的技术栈名称（如 'Vite', 'Next.js', 'Angular'）
- 支持大小写不敏感匹配
- 可以使用变体名称（如 'vue-vite', 'nextjs'）

### 2. 端口管理
- 使用有效的端口范围（1-65535）
- 避免使用系统保留端口（0-1023）
- 考虑端口冲突检测

### 3. 错误处理
- 始终检查返回值是否为 null
- 实现适当的错误恢复逻辑
- 记录错误信息用于调试

### 4. 性能优化
- 缓存技术栈检测结果
- 批量处理多个应用
- 使用异步调用避免阻塞

## 🔗 相关文档

- [性能测试报告](./performance-test-report.md)
- [部署指南](./deployment-guide.md)
- [技术栈支持文档](./tech-stack-support.md)
