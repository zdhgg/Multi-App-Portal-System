# 多应用管理模式实施看板（V1）

## 阶段状态
- 阶段0（基线与契约冻结）：`已完成（本次提交）`
- 阶段1（Pinned语义修正）：`已完成核心开发，待联调验收`
- 阶段2（生命周期状态机+策略闸门）：`已完成核心开发，待联调验收`
- 阶段3（接入流程产品化）：`已完成核心开发，待联调验收`
- 阶段4（双视图管理）：`已完成核心开发，待联调验收`
- 阶段5（灰度切换与遗留收口）：`已完成核心开发，待联调验收`

## 阶段0交付清单
- 新增 `docs/architecture/ApplicationContract-v1.md`
- 明确 `pinned` 的单一业务语义与接口契约
- 明确 legacy 映射规则

## 阶段1交付清单（本次）
- 后端 `public pinned` 接口改为真实过滤
- 新增 v2 管理接口：
  - `GET /api/v2/applications/pinned`
  - `PATCH /api/v2/applications/:id/pin`
- 数据库持久化增加 `application_metadata.pinned`
- 前端门户在 pinned 为空时降级展示全部应用

## 阶段1验收点
- `GET /api/v2/public/apps/pinned` 仅返回固定应用
- 应用 pin/unpin 后重启服务仍保持状态
- 首页无固定应用时仍可展示全部应用（降级策略生效）

## 阶段2交付清单（本次）
- 在 `ApplicationService` 引入生命周期状态迁移校验（state transition gate）
- 启动前策略闸门：目录存在性 + 网络端口配置合法性 + 端口冲突检测
- 运行中策略闸门：禁止运行态修改 `techStack`
- 启动失败时状态落到 `failed`（提升可观测性）
- 控制器补充高风险权限闸门：
  - 创建应用 `admin` only
  - 删除应用 `admin` only
  - 固定首页 `admin` only
  - 修改 `techStack` `admin` only
- 生命周期审计事件（create/update/pin/delete/start/stop）写入审计日志服务

## 阶段2验收点
- 非法状态迁移返回 `409 INVALID_STATE_TRANSITION`
- 启动前目录缺失返回 `422 APPLICATION_DIRECTORY_NOT_FOUND`
- 运行中修改技术栈返回 `409 STATE_POLICY_VIOLATION`
- 高风险操作在非 `admin` 角色下返回 `403 FORBIDDEN_OPERATION`

## 阶段3交付清单（本次）
- 新增导入编排接口：
  - `POST /api/v2/applications/import/precheck`
  - `POST /api/v2/applications/import/batch`
- 导入预检查能力：
  - 字段合法性校验（名称/目录/技术栈/端口）
  - 目录重复检查（已存在应用 + 本批重复）
  - 端口冲突检查（通过端口管理服务）
- 一键导入能力：
  - 支持批量导入与统一结果汇总（created/failed/skipped）
  - 失败自动回滚（`rollbackOnError=true`）
- Detection 页面接入新流程：
  - 批量导入先预检查，再导入
  - 单应用导入复用同一导入管道
  - 导入结果回写到本地“已添加”状态统计

## 阶段3验收点
- 检测页触发导入时，先得到可导入/阻止的预检查结果
- 批量导入部分失败时，默认触发自动回滚
- 导入完成后，结果页“已添加/未添加”统计与状态一致

## 阶段4交付清单（本次）
- 管理页新增双视图切换：
  - `运营视图`：聚焦目录治理与基础配置
  - `运维视图`：聚焦运行态与批量运维操作
- 视图驱动的信息架构裁剪：
  - 运维视图显示端口列、选择列、批量工具栏、运行态按钮
  - 运营视图隐藏运维密集入口，降低认知负担
- 视图状态持久化（localStorage）与权限缓存隔离（按视图维度）

## 阶段4验收点
- 在管理页可一键切换运营/运维视图且状态持久化
- 运营视图不暴露运行态高风险入口（启动/停止/删除/构建等）
- 运维视图保留完整运行态能力与批量操作

## 阶段5交付清单（本次）
- 新增遗留 API 灰度模式开关（环境变量）：
  - `LEGACY_APPS_MODE=enabled`：保留 `/api/apps/*` 全量能力（默认）
  - `LEGACY_APPS_MODE=readonly`：阻断写操作（`POST/PUT/PATCH/DELETE`）
  - `LEGACY_APPS_MODE=disabled`：关闭遗留接口并返回 `410`
- `/api/apps/*` 统一增加弃用响应头：
  - `X-API-Deprecation-Warning`
  - `X-API-Migration-Target: /api/v2/applications`
- 在统一路由层新增 `/api/apps/*` 兼容桥（对 legacy apps 路由进行统一接入）
- 新增遗留调用遥测端点：
  - `GET /api/migration/legacy-usage`
  - 提供总请求量、按方法统计、按路径归一化统计（用于灰度收口决策）
- 新增切换与回滚手册：`docs/guides/legacy-api-cutover-guide.md`

## 阶段5验收点
- 在 `readonly` 模式下，`/api/apps/*` 的写请求返回 `403` 且包含迁移目标头
- 在 `disabled` 模式下，`/api/apps/*` 任意请求返回 `410` 且包含迁移目标头
- `GET /api/migration/legacy-usage` 可返回遗留调用统计数据
- 切换 `enabled -> readonly -> disabled` 可通过环境变量完成，并可快速回退到 `enabled`
