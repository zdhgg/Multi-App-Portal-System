# 智能多Web应用门户系统 (Multi-App Portal System)

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)
![Release](https://img.shields.io/badge/release-v1.2.0-success.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

一个面向多应用工作区的智能 Web 应用检测、管理与统一控制中心系统，能够自动识别各种技术栈应用，并提供一致的管理与运维体验。

## 📌 当前发布

- **当前版本**: `1.2.0`
- **GitHub Release**: [v1.2.0: 控制中心界面焕新与运维体验升级](https://github.com/zdhgg/Multi-App-Portal-System/releases/tag/v1.2.0)
- **完整更新日志**: [CHANGELOG.md](./CHANGELOG.md)

## ✨ 新特性

- **控制中心界面焕新**: 门户首页、应用管理、PM2 管理、端口管理和系统设置升级为统一的指标总览 + 快捷操作布局
- **应用信息表达增强**: 应用卡片与详情弹窗新增运行模式、访问端口、访问入口、最近更新和更清晰的状态摘要
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

### 🖧 高级智能端口治理
- **高速全局探测**: $O(1)$ 内存级快照查询，彻底告别数百个端口扫描导致的界面卡顿与 CPU 浪涌
- **L4/L7 混合探活**: 原生 `ECONNREFUSED` 毫秒级防假死探测机制
- **无损生命周期管理**: 端口释放实施 "SIGTERM (软关闭) → 智能监测倒计时 → SIGKILL (强杀兜底)" 的优雅降级管线，保护数据库与文件锁安全
- **高危防火墙 UX**: 面向核心系统级架构的物理按键隔离锁定，以及聚合折叠式拓扑渲染，极大降低操作白噪

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

## 📦 快速部署

### 环境要求
- Node.js >= 18.0.0 (推荐 v20)
- npm >= 8.0.0

### 本地极速启动
您只需分别在后端与前端目录下安装依赖并启动即可：

```bash
# 1. 启动后端守卫 API (默认占用 8002)
cd detection-api && npm install && npm run dev

# 2. 启动前端可视化门户 (默认占用 3000)
cd main-portal && npm install && npm run dev
```

### ⚡ Windows 生产级一键启停
在项目根目录，我们为您备好了企业级的批处理自动化脚本：
- **`Setup-Portal.bat`**: 首次自动化环境初始化（安全检查、防火墙策略一键放行、PM2 开机守护配置）
- **`Start-Portal.bat`**: 一键静默启动整个生产集群
*(备注：如遇 Windows 下的特权凭据报错，详见 [PM2 排障手册](docs/troubleshooting/如何解决PM2权限问题.md)）*

## 🔧 核心配置

后端与前端分别使用 `.env` 文件独立管理环境与安全策略：

### 配置文件地图

- `configs/system-config.json`
  系统设置主文件，保存用户账号、安全策略、路径白名单等运行时系统设置。
- `detection-api/configs/portal-config.json`
  端口与门户配置主文件，保存端口范围、保留端口、应用启动相关的运行时配置。
- `detection-api/configs/system-config.json`
  系统设置兼容镜像，由后端自动同步，不建议手工维护。
- `detection-api/config/system-config.json`
  端口配置兼容镜像，由后端自动同步，不建议手工维护。

### 后端配置 (`detection-api/.env`)
```env
PORT=8002
DB_PATH=./data/portal.db
# 🛡️ 生产环境必填：用于核心校验和签发的安全密钥，否则将拒绝启动
JWT_SECRET=your-secure-random-string-at-least-32-characters
# 选填安全项：CORS_MODE (lan/strict), ALLOWED_PATHS 等
```

### 前端门户配置 (`main-portal/.env`)
```env
# API 服务与 WebSocket 寻址地址
# (强烈推荐开发环境与局域网均留空，系统底层将使用自适应网络探测降级策略)
VITE_API_BASE_URL=
VITE_WS_BASE=
```

## 📖 核心使用指南

该智能系统基于完全“无需指导即插即用”的设计原则，为您化繁为简：

- **🔎 智能全栈探测 (Smart Pipeline)**
  在“应用检测”页面输入目标工作区后，后台的 **4级检测流水线** 会潜入目录深处，自动帮您挖掘出所有包裹在一起的 React、Vue 组件、甚至 NestJS 和 Angular 服务端，无惧 `Monorepo` 复杂结构。

- **🧙‍♀️ 影子挂载指令注入 (Ghost Injection)**
  启动接管应用时，系统自动拦截原生生命周期，根据识别到的不同技术栈暗中注入类似 `npm run dev -- --port xxx` 或者 `ng serve` 参数，所有外部程序皆由本产品统一调度指挥。

- **🏰 L7无损端口护城河 (Collision Proxy & Defense)**
  无需再纠结 `3000` 或 `8080` 经常互相冲突引发报错！本系统会自动计算全局 `Node` 和系统空闲池流转分配，且在关闭进程时依托其独有的“**退避探活强杀 (Graceful Stop)**”管线，将“端口占用”这种开发者的噩梦彻底抹除。



##  贡献指南

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

完整版本历史请查看 [CHANGELOG.md](./CHANGELOG.md)。

### v1.2.0 (2026-03-24) — 控制中心界面焕新与运维体验升级
- 🖥️ **控制中心式界面升级**
  - 门户首页、应用管理、PM2 管理、端口管理、系统设置统一升级为 Hero + Metrics + Content 的信息架构
  - 强化快捷操作、筛选摘要、实时状态和空状态引导，核心信息更集中
- 📋 **应用与运维信息表达增强**
  - 应用卡片和详情弹窗新增访问端口、运行模式、访问入口、最近更新和状态摘要
  - PM2 进程列表与端口列表补充异常计数、状态说明和更清晰的操作入口
- 🎨 **视觉系统统一**
  - 引入新的全局设计变量、字体、状态色、面板层级和响应式节奏
  - 前端“关于系统”中的更新记录同步到 `1.2.0`

### v1.1.1 (2026-03-23) — 发布配套与版本对齐补丁
- 📝 **发布资料补齐**
  - 新增正式 `CHANGELOG.md`
  - 更新 GitHub 首页 README 的当前版本、Release 链接和版本徽章
- 🔢 **版本再次统一**
  - 将项目包版本、系统配置、脚本头部、前端页面展示和主要发布文档统一到 `1.1.1`
  - 保持 `v1.1.0` 发布历史不变，采用补丁版纳入发布配套更新

### v1.1.0 (2026-03-23) — 门户管理与运行态修复更新
- 🧭 **运行态识别修复**
  - 修复 `video-cms` 等应用在直启与 PM2 切换后，首页错误显示“生产(PM2)”的问题
  - 直启应用现在会明确写入 `development` 模式，并清理遗留 `pm2ProcessName`
  - 门户公共接口新增运行态兜底逻辑，避免数据库残留模式误导前端展示
- ⚙️ **系统设置与路径访问增强**
  - 补充系统设置 payload 工具与目录选择逻辑
  - 优化文件系统路径访问控制与相关配置读写行为
- 🧪 **测试与维护性提升**
  - 补充 PM2 状态同步、网络服务、路径工具与系统设置相关测试
  - 统一项目、配置、脚本、前端页面和文档中的版本号到 `1.1.0`

### v1.0.0 (2026-03-10) — 初始里程碑发布 (Initial Milestone)
- 🖧 **智能全链路端口治理架构上线**
  - **极速探测引擎**: 引入 `PortSnapshotManager`，拦截高频 `netstat` 查询请求并聚合成 $O(1)$ 的内存映射，将刷新扫描速度从 3-5 秒极致压缩至 100ms 内，大幅优化中大型微服务集群下的宿主机 CPU 带宽。
  - **基于 `Connect` 的超轻量探活**: 弃用传统笨重的 `Bind` 和 CLI 正则匹配方案，改用纯血 Socket `ECONNREFUSED` 毫秒级探测，极大降低了由于端口阻塞引发的“假阳性”。
  - **Graceful Termination (无损退出管线)**: 重构原有的系统强杀逻辑。执行端口释放时，注入了“软关闭通知 → 智能存活侦测与退避 → 2 秒内无休强杀保底”的优雅降级链路，彻底告别 `EBUSY` 文件句柄死锁与写库撕裂事故。
  - **降噪式拓扑 UX**: 前台 `PortManager.vue` 引入树形应用域拓扑聚类，辅饰以仿生呼吸动效 (`pulse-dot`) 和核心级端口的红外警报器（禁止强杀隔离区）。
- 🏗️ **底层检测管道架构重构**
  - 全新四阶段智能检测管道：Scanner(目录发现) → Analyzer(技术栈识别) → Aggregator(聚合关联) → PortAllocator(冲突隔离排他避让)
  - 高精度全栈 monorepo 和非标准目录结构探测支持
- 🛡️ **深层内核与容器化加固**
  - **Phase 3**: 文件访问全栈级路径收敛 (Spawn 安全拦截)
  - 角色鉴权收紧 (RBAC 核心控制流) 与 JWT Token 黑名单联动防穿透。

- 🚀 **智能命令容器注入**
  - 根据子应用技术栈智能挂载启动参数 (如 Vue、Next.js、Angular CLI)
  - 自适应无头服务器拦截，完全向后兼容，无破坏性更新
- 📏 **精确全栈架构支持**
  - 自动识别 monorepo 和全栈项目结构（即使子目录结构非标准如 client/server）
  - 扫描时使用 maxDepth + 1 检测关联系统，返回时自动剔除隔离层确保应用纯净度
- � **纵深安全体系增强**
  - 全面支持 admin/operator/guest 三重角色的细粒度 RBAC 权限控制
  - 强制引入 JWT 生产安全密钥，实现 Token 签发与黑名单撤销联动
  - 文件系统级指令收敛 (使用 spawn 取代底层 exec) 以及绝对访问白名单限制

_这是一个经过全链路压力沉淀与重构的完整企业级起航版。_

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🆘 技术支持

如需技术支持或反馈问题：

1. 查看 [文档](docs/) 目录下的详细文档
2. 在 [Issues](issues/) 中搜索已知问题
3. 创建新的 Issue 描述问题或建议
4. 联系开发团队获取技术支持




*智能多Web应用门户系统 v1.2.0 - 让应用管理更简单、更智能！*
