# 智能多Web应用门户系统 (Multi-App Portal System)

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

一个智能化的Web应用检测、管理和统一门户系统，能够自动识别工作区内的各种技术栈应用，并提供统一的管理界面。

## ✨ 新特性

- **管道架构重构**: 全新的检测管道架构（Scanner → Analyzer → Aggregator → PortAllocator）
- **智能全栈项目识别**: 自动识别 monorepo 和全栈项目结构，支持非标准命名（如 main-portal/detection-api）
- **精确扫描深度控制**: 扫描时多扫描一层，返回时按用户设置深度过滤
- **智能端口分配**: 读取用户配置的保留端口和端口范围，避免冲突
- **安全增强 (Phase 3)**: RBAC 角色权限控制、JWT 认证硬化、审计日志、会话管理



## 🚀 核心功能

### 🔍 智能应用检测
- **管道架构检测**: 采用四阶段管道架构（Scanner → Analyzer → Aggregator → PortAllocator）
- **多技术栈识别**: 支持 Vue+Vite、React+Vite、Next.js、Angular、Node.js+Express 等主流技术栈
- **智能全栈识别**: 自动识别全栈项目结构，支持 frontend/backend、main-portal/detection-api 等多种命名
- **精确深度控制**: 扫描深度+1 确保检测全面，返回时按用户设置深度过滤
- **智能端口分配**: 读取用户配置的保留端口，避免与系统端口冲突
- **实时进度跟踪**: WebSocket 实时更新扫描进度和状态

### ⚡ 智能命令注入
- **智能端口注入**: 自动为启动命令注入端口参数，支持不同技术栈的端口配置语法
- **技术栈适配**: 针对 Vite、Next.js、Angular CLI 等框架提供专门的命令适配器
- **向后兼容**: 完全兼容现有启动方式，无端口参数时保持原有行为
- **自定义服务器检测**: 智能识别自定义服务器配置，避免不兼容的端口注入
- **高性能处理**: 平均响应时间 0.12ms，支持每秒 9000+ 次调用

### 📱 统一应用门户
- **可视化管理**: 直观的应用卡片界面，支持网格和列表布局
- **状态监控**: 实时显示应用运行状态（在线/离线/错误/维护中）
- **快速启动**: 一键启动、停止和访问应用
- **外部应用接入**: 支持 Windows 外部独立 EXE 程序的直接接入与启停管理
- **主题定制**: 支持浅色/深色模式和自定义主题色

### ⚙️ 高级应用管理
- **批量操作**: 支持批量启动、停止、检测和删除应用
- **详细配置**: 完整的应用信息编辑和端口配置
- **搜索过滤**: 按名称、技术栈、状态等多维度筛选
- **导入导出**: 应用配置的导入导出功能

### 🛡️ 安全特性 (Phase 3)
- **RBAC 角色权限**: 支持 admin/operator/guest 三种角色，细粒度权限控制
- **JWT 认证硬化**: 生产环境强制配置安全密钥，Token 黑名单机制
- **会话管理**: 支持查看、撤销会话，管理员可管理所有用户会话
- **审计日志**: 记录敏感操作，支持文件持久化和查询
- **文件系统硬化**: 使用 spawn 替代 exec，路径白名单限制
- **CORS 收敛**: 生产环境严格来源控制
- **紧急开关**: 支持临时关闭认证（仅内网应急）

### 🛠️ 配置文件生成
- **多种配置模板**: Nginx、PM2、systemd、VS Code 等配置模板
- **智能模板填充**: 根据应用特征自动填充配置参数
- **批量配置生成**: 为多个应用同时生成配置文件
- **配置验证**: 自动验证生成的配置文件是否正确

## 🏗️ 系统架构

```
智能多Web应用门户系统/
├── main-portal/          # Vue 3 前端门户
│   ├── src/
│   │   ├── components/   # 各类功能组件
│   │   ├── views/        # 页面视图组件
│   │   ├── stores/       # Pinia 状态管理
│   │   ├── composables/  # 组合式函数
│   │   ├── services/     # API 服务封装
│   │   └── types/        # TypeScript 类型定义
│   └── package.json
├── detection-api/        # Node.js 后端服务 (Clean Architecture)
│   ├── src/
│   │   ├── api/          # 统一 API 路由定义 (UnifiedApiRouter)
│   │   ├── controllers/  # 控制器层 (业务流转)
│   │   ├── middleware/   # API 中间件 (认证、日志等)
│   │   ├── core/         # 核心业务服务引擎
│   │   │   ├── ServiceContainer.ts   # 服务依赖注入容器
│   │   │   ├── pipeline/             # 检测管道架构
│   │   │   │   ├── stages/           # Scanner/Analyzer/Aggregator/PortAllocator
│   │   │   │   └── DetectionPipeline.ts
│   │   │   └── DetectionService.ts   # 应用扫描核心服务
│   │   ├── routes/       # 传统系统路由 (保持向下兼容)
│   │   ├── services/     # 基础底层服务及业务逻辑
│   │   └── utils/        # 通用工具函数
│   └── package.json
├── configs/              # 配置文件模板 (Nginx/PM2等)
├── scripts/              # 快速部署、备份、启停脚本
├── docs/                 # 系统架构、排错文档
│   └── troubleshooting/  # PM2 及常见故障排查手册
└── README.md
```

### 🔄 检测管道架构

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Scanner    │ -> │  Analyzer   │ -> │ Aggregator  │ -> │PortAllocator│
│  扫描阶段    │    │  分析阶段    │    │  聚合阶段    │    │ 端口分配    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     │                   │                  │                  │
     v                   v                  v                  v
  目录扫描           技术栈识别         全栈项目聚合        智能端口分配
  深度控制           组件分类           深度过滤           排除保留端口
```

**管道特点**：
- **ScannerStage**: 递归扫描目录，支持 monorepo 结构检测，扫描深度 +1 确保全栈组件被发现
- **AnalyzerStage**: 分析 package.json，识别技术栈，分类前端/后端组件
- **AggregatorStage**: 聚合全栈项目，按用户设置的深度过滤结果
- **PortAllocatorStage**: 智能分配端口，读取用户配置的保留端口和端口范围

### 技术栈

**前端框架**
- Vue 3 + Composition API
- TypeScript
- Vite (构建工具)
- Pinia (状态管理)
- Vue Router (路由管理)

**后端框架**
- Node.js + Express
- TypeScript
- SQLite (数据库) - 使用 better-sqlite3  包
- WebSocket (实时通信)

**开发工具**
- ESLint + Prettier (代码规范)
- fast-glob (文件扫描)
- joi (数据验证)
- Vitest (测试框架)

**支持的应用技术栈**
- **Vite 应用**: Vue 3 + Vite、React + Vite、Vite + TypeScript
- **Next.js 应用**: App Router、Pages Router、自定义服务器
- **Angular 应用**: Angular CLI 15.x、16.x、17.x
- **Create React App**: 标准 CRA 应用
- **Node.js 应用**: Express、Koa、Fastify 等

## 📦 安装与部署

### 环境要求
- Node.js >= 18.0.0
- npm >= 8.0.0
- Windows: Visual Studio Build Tools (如需编译原生模块)

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd intelligent-multi-app-portal-system
   ```

2. **安装后端依赖**
   ```bash
   cd detection-api
   npm install
   ```


3. **安装前端依赖**
   ```bash
   cd main-portal
   npm install
   ```

4. **构建前端应用**
   ```bash
   npm run build
   ```

### 开发环境启动

1. **启动后端服务**
   ```bash
   cd detection-api
   npm run dev
   ```
   后端服务将在 `http://localhost:8000` 启动

2. **启动前端开发服务**
   ```bash
   cd main-portal
   npm run dev
   ```
   前端门户将在 `http://localhost:3000` 启动

### 生产环境部署

1. **使用 PM2 部署后端**
   ```bash
   cd detection-api
   npm run build
   pm2 start ecosystem.config.js
   ```

2. **使用 Nginx 部署前端**
   ```bash
   cd main-portal
   npm run build
   # 将 dist/ 目录部署到 Nginx
   ```

### ⚡ Windows 快速启停指令

对于 Windows 用户，系统根目录提供了一键脚本：
- `Start-Portal.bat`：一键启动生产服务（底层调用 `start-production.ps1`，智能修复执行权限）
- `Setup-Portal.bat`：首次部署初始化（包含环境检查 + 防火墙规则 + PM2 开机自启配置）

#### PM2 权限问题预案
在 Windows 使用 PM2 运行后台进程时，常遇到权限报错。若自动恢复失败，您可以参考我们整理的[快速解决方案](docs/troubleshooting/如何解决PM2权限问题.md)，或直接右键点击 `scripts\startup\start-backend-admin.ps1` 选择 "使用 PowerShell 运行"。

## 🔧 配置说明

### 后端配置
在 `detection-api/` 目录下创建 `.env` 文件：

```env
# 服务端口
PORT=8002

# 数据库配置
DB_PATH=./data/portal.db

# 日志级别
LOG_LEVEL=info

# ============ 安全配置 (v2.0 Phase 3) ============

# JWT 配置（生产环境必须设置）
JWT_SECRET=your-secure-random-string-at-least-32-characters
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# CORS 配置
CORS_MODE=lan                    # strict | lan | open
CORS_ORIGIN=                     # 允许的域名列表（逗号分隔）

# 文件系统白名单
ALLOWED_PATHS=                   # 允许访问的路径（逗号分隔）

# 认证紧急开关（仅内网应急）
AUTH_ENFORCEMENT=on              # on | off
```

> ⚠️ **安全提示**: 生产环境必须设置 `JWT_SECRET`，否则服务将拒绝启动。详见 [SECURITY.md](SECURITY.md)。

### 前端配置
在 `main-portal/` 目录下创建 `.env` 文件：

```env
# API 服务地址（留空时沿用当前访问主机）
VITE_API_BASE_URL=

# WebSocket 地址（留空时自动推导）
VITE_WS_BASE=
```

> 提示：开发模式下留空可确保通过任意局域网 IP 访问门户时，前端会自动使用当前页面所在主机的 API/WS 地址；若部署环境需要固定后端地址，可填入完整 URL，例如 `http://192.168.1.100:8002`。

## 📖 使用指南

### 1. 应用检测流程

1. 访问门户主页，点击"应用检测"
2. 输入要扫描的工作区路径（如：`D:\Projects`）
3. 配置扫描参数：
   - 最大扫描深度：控制目录遍历层级
   - 工作区深度：应用检测的深度
   - 自动分配端口：是否自动为应用分配端口
4. 点击"开始扫描"，系统将：
   - 扫描指定目录下的所有子目录
   - 识别各种技术栈的应用
   - 分析应用的依赖和配置
   - 为应用分配合适的端口
5. 扫描完成后，查看检测结果
6. 选择要添加的应用，批量或单独创建

### 2. 应用管理操作

**主要功能**
- **启动/停止应用**: 点击应用卡片上的播放/暂停按钮
- **访问应用**: 点击应用卡片直接打开应用页面
- **编辑应用**: 修改应用名称、描述、图标、端口等信息
- **删除应用**: 从系统中移除应用记录

**批量管理**
1. 进入应用管理页面
2. 使用复选框选择多个应用
3. 点击"批量操作"执行：
   - 批量启动/停止
   - 批量检测
   - 批量删除
   - 导出配置

### 3. 配置文件生成

1. 选择要生成配置的应用
2. 选择配置模板类型：
   - **Nginx**: 反向代理配置
   - **PM2**: 进程管理配置
   - **systemd**: 系统服务配置
   - **VS Code**: 开发环境配置
   - **Scripts**: 启动和停止脚本
   - **Env**: 环境变量配置
3. 预览生成的配置文件
4. 应用配置到应用目录或导出为文件

### 4. 智能命令注入使用

**支持的技术栈和命令格式**
- **Vite 应用**: `npm run dev -- --port 3000`
- **Next.js 应用**: `npm run dev -- --port 3000` (标准应用)
- **Angular CLI**: `ng serve --port 4200` (直接命令)
- **自定义服务器**: 自动检测并跳过端口注入

**使用方式**
1. 系统自动检测应用的技术栈类型
2. 根据技术栈选择合适的端口注入策略
3. 启动应用时自动注入端口参数
4. 如果检测失败，回退到标准启动命令

**性能特点**
- 平均响应时间：0.12ms
- 支持并发调用：100%数据一致性
- 内存效率：每次调用仅增长 112 字节
- 错误恢复：100%成功率

### 5. 系统设置

**界面设置**
- 主题模式：浅色/深色/跟随系统
- 主题颜色：自定义主色调
- 应用布局：网格/列表布局
- 显示密度：紧凑/舒适/宽松

**端口配置**
- 门户端口：前端门户访问端口
- API端口：后端API服务端口
- 前端端口范围：前端应用的端口分配范围
- 后端端口范围：后端应用的端口分配范围

**扫描设置**
- 最大扫描深度：目录扫描的最大层级
- 扫描超时：单次扫描的最大等待时间
- 最大并发扫描数：同时进行的扫描任务数量
- 默认工作区：应用检测时的默认路径



## 🧪 测试

### 运行测试
```bash
# 后端测试
cd detection-api
npm test

# 运行特定测试
npm test getStartCommand.test.ts          # 单元测试
npm test smartPortInjection.test.ts       # 集成测试
npm test vitePortInjection.test.ts        # Vite应用测试
npm test nextjsPortInjection.test.ts      # Next.js应用测试
npm test angularPortInjection.test.ts     # Angular应用测试
npm test performanceAndStability.test.ts  # 性能测试

# 前端测试
cd main-portal
npm test
```

### 测试覆盖
- **单元测试**: 核心业务逻辑测试 (16个测试用例)
- **适配器测试**: 技术栈适配器测试 (26个测试用例)
- **集成测试**: API 接口测试 (14个测试用例)
- **真实应用测试**: Vite、Next.js、Angular应用测试 (75个测试用例)
- **向后兼容性测试**: 错误处理和兼容性测试 (25个测试用例)
- **性能测试**: 性能和稳定性测试 (11个测试用例)
- **总计**: 167个测试用例，100%通过率

### 性能测试结果
- **响应时间**: 平均 0.12ms (目标 < 100ms)
- **吞吐量**: 9,311 次/秒 (目标 > 1,000 次/秒)
- **内存效率**: 每次调用增长 112 字节 (目标 < 1KB)
- **并发安全**: 100% 数据一致性
- **错误恢复**: 100% 成功率

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

### 代码规范
- 使用 ESLint 和 Prettier 保持代码风格一致
- 编写有意义的提交信息
- 为新功能添加相应的测试用例
- 更新相关文档

## 📝 更新日志

### v2.0.0 (2025-12-12)
- 🏗️ **检测管道架构重构**
  - 全新四阶段管道架构：Scanner → Analyzer → Aggregator → PortAllocator
  - 每个阶段职责单一，可独立测试和扩展
  - 支持特性开关 `USE_DETECTION_PIPELINE` 切换新旧架构
- 🔍 **智能全栈项目识别**
  - 自动识别 monorepo 和全栈项目结构
  - 支持非标准命名（main-portal/detection-api、client/server 等）
  - 即使根目录有 package.json，也会检查子目录的全栈结构
- 📏 **精确扫描深度控制**
  - 扫描时使用 maxDepth + 1，确保全栈组件被发现
  - 返回时按项目根目录深度过滤，严格遵守用户设置
  - 移除关键词排除逻辑，采用更通用的深度过滤
- 🔌 **智能端口分配优化**
  - 从用户配置读取保留端口列表
  - 从用户配置读取端口范围（前端/后端）
  - 自动排除已分配的端口，避免冲突
  - 已添加应用在重新扫描时保持原有端口
- 🛡️ **安全增强 (Phase 1-3)**
  - **Phase 1**: 统一 RBAC 中间件，JWT 生产环境强制配置
  - **Phase 2**: Token 撤销、会话管理、审计日志服务
  - **Phase 3**: Filesystem 硬化（spawn + 路径白名单）、CORS 收敛
  - 支持 admin/operator/guest 三种角色的细粒度权限控制
  - 详见 [SECURITY.md](SECURITY.md) 安全配置指南

### v1.1.0 (2025-11-05)
- ⚡ **新增智能命令注入功能**
  - 自动为启动命令注入端口参数
  - 支持 Vite、Next.js、Angular CLI 等主流技术栈
  - 智能检测自定义服务器配置
  - 完全向后兼容，无破坏性更新
- 🧪 **全面测试覆盖**
  - 167个测试用例，100%通过率
  - 包含单元测试、集成测试、性能测试
  - 验证多技术栈兼容性和系统稳定性
- 🚀 **卓越性能表现**
  - 平均响应时间 0.12ms，超越目标 416 倍
  - 支持每秒 9,311 次调用，超越目标 9.3 倍
  - 100% 并发安全和错误恢复能力
- 📚 **完善文档系统**
  - 详细的 API 文档和使用指南
  - 性能测试报告和部署指南
  - 技术栈支持文档

### v1.0.0 (2025-09-20)
- ✨ 初始版本发布
- 🔍 实现智能应用检测功能
- 📱 完成统一应用门户界面
- ⚙️ 添加高级应用管理功能
- 🛠️ 集成配置文件生成工具
- 📚 完善文档和使用指南

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🆘 技术支持

如需技术支持或反馈问题：

1. 查看 [文档](docs/) 目录下的详细文档
2. 在 [Issues](issues/) 中搜索已知问题
3. 创建新的 Issue 描述问题或建议
4. 联系开发团队获取技术支持




*智能多Web应用门户系统 v2.0 - 让应用管理更简单、更智能！*
