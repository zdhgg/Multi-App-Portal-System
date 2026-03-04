# ApplicationContract v1

## 1. 目标
统一多应用管理的数据契约，消除 `pinned` 与应用列表语义不一致问题，作为阶段0基线。

## 2. 适用范围
- 前端：`main-portal`
- 后端：`detection-api`
- 路由：`/api/v2/public/*` 与 `/api/v2/applications/*`

## 3. 规范字段（Canonical）
应用对象基于后端 `Application`：
- `id: string`
- `name: string`
- `directory: string`
- `techStack: { name, category, startCommand }`
- `network: { primaryPort, secondaryPorts, protocol }`
- `state: 'stopped' | 'running' | 'failed'`
- `metadata: { description?, icon?, color?, pinned?, createdAt, updatedAt }`
- `deploymentMode?: 'development' | 'production' | 'unknown'`

`pinned` 语义：
- `metadata.pinned = true` 表示“固定到门户首页展示集合”
- `metadata.pinned = false` 或缺省表示“不固定”
- `pinned` 不再等价“全部应用”

## 4. API 契约

### 4.1 公共接口
- `GET /api/v2/public/apps`
  - 返回：所有可公开应用
- `GET /api/v2/public/apps/pinned`
  - 返回：仅 `metadata.pinned === true` 的应用
  - 每个应用对象包含 `pinned: boolean`

### 4.2 管理接口
- `GET /api/v2/applications/pinned`
  - 返回：仅 `metadata.pinned === true` 的应用（管理视角）
- `PATCH /api/v2/applications/:id/pin`
  - 入参支持：`pinned` / `pinned_to_homepage` / `pinnedToHomepage`
  - 返回：更新后的应用对象

## 5. 兼容映射（Legacy）
- `metadata.pinned <-> pinned_to_homepage`
- `techStack.name <-> tech_stack`
- `network.primaryPort <-> frontend_port`
- `network.secondaryPorts[0] <-> backend_port`

## 6. 数据持久化约束
- 表 `application_metadata` 增加列：
  - `pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))`
- 启动时执行向后兼容迁移，确保老库自动补齐列。

## 7. 验收标准
- `/public/apps/pinned` 不再返回全量应用。
- 对任意应用执行 pin/unpin 后，重启服务状态不丢失。
- 前端门户在 pinned 为空时降级展示全部应用，避免首页空白。

## 8. 生命周期状态机（阶段2）
状态集合：`stopped` / `running` / `failed`

允许迁移：
- `stopped -> running`
- `running -> stopped`
- `failed -> running`
- `failed -> stopped`

不允许迁移将返回：`INVALID_STATE_TRANSITION (409)`

## 9. 策略闸门（阶段2）
- 启动前目录存在性检查：目录不存在返回 `APPLICATION_DIRECTORY_NOT_FOUND (422)`
- 启动前网络配置检查：端口非法返回 `INVALID_NETWORK_CONFIGURATION (422)`
- 运行态限制：运行中禁止修改 `techStack`，返回 `STATE_POLICY_VIOLATION (409)`
- 权限限制（控制器）：
  - 创建应用：`admin`
  - 删除应用：`admin`
  - 固定首页：`admin`
  - 修改技术栈：`admin`

## 10. 导入编排（阶段3）

### 10.1 导入预检查
- `POST /api/v2/applications/import/precheck`
- 请求体：
  - `candidates: Array<{ name, directory, tech_stack|techStack, icon?, color?, description?, frontend_port?, backend_port? }>`
- 返回：
  - `summary: { total, importable, blocked }`
  - `items: [{ canImport, errors[], warnings[], duplicate?, portConflicts?, candidate }]`

### 10.2 批量导入
- `POST /api/v2/applications/import/batch`
- 请求体：
  - `candidates: [...]`
  - `rollbackOnError?: boolean`（默认 true）
- 返回：
  - `created[]` / `failed[]` / `skipped[]`
  - `rolledBack: boolean`
  - `rollbackErrors[]`
  - `summary`

### 10.3 行为约束
- 导入前必须先走预检查（前端流程约束）。
- 批量导入默认启用失败回滚，保证“要么全成，要么回滚”。

## 11. 双视图管理（阶段4）
- 管理页支持两种模式：
  - `operations`（运营视图）
  - `ops`（运维视图）
- 运营视图策略：
  - 隐藏运行态与高风险入口（启动/停止/删除/构建/文件夹等）
  - 保留目录治理与基础配置能力
- 运维视图策略：
  - 显示运行态入口、端口信息、批量操作工具栏
  - 保持既有运维能力完整可用
- 视图状态持久化：
  - 本地键 `management_view_mode`

## 12. 灰度切换与遗留收口（阶段5）
- 遗留接口：`/api/apps/*`
- 目标接口：`/api/v2/applications/*`

运行模式（环境变量 `LEGACY_APPS_MODE`）：
- `enabled`：遗留接口保持可读可写（默认）
- `readonly`：遗留接口写操作返回 `403`
- `disabled`：遗留接口统一返回 `410`

统一迁移头（所有 `/api/apps/*` 响应）：
- `X-API-Deprecation-Warning`
- `X-API-Migration-Target: /api/v2/applications`

遗留流量观测接口：
- `GET /api/migration/legacy-usage`
- 返回维度：总量、方法分布、路径分布（路径会做 ID 归一化）
