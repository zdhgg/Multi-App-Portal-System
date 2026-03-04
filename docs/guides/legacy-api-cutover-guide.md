# Legacy API Cutover Guide (`/api/apps/*`)

## 1. 目标
通过灰度模式平滑收口遗留应用管理接口 `/api/apps/*`，并逐步切换到 `/api/v2/applications/*`。

## 2. 开关说明
环境变量：`LEGACY_APPS_MODE`

- `enabled`（默认）：遗留接口可读可写
- `readonly`：仅允许只读请求；写请求（`POST/PUT/PATCH/DELETE`）返回 `403`
- `disabled`：遗留接口全部关闭，返回 `410`

所有 `/api/apps/*` 响应统一包含：
- `X-API-Deprecation-Warning`
- `X-API-Migration-Target: /api/v2/applications`

## 3. 推荐切换流程
1. 盘点调用：观察 `GET /api/migration/legacy-usage`，确认调用来源和高频路径。
2. 灰度只读：将 `LEGACY_APPS_MODE` 设置为 `readonly`，验证写流量是否已切到 v2。
3. 关闭遗留：写流量清零并稳定后，将 `LEGACY_APPS_MODE` 设置为 `disabled`。
4. 稳态观测：持续观察 `legacy-usage`，确认无异常流量回流。

## 4. 验证清单
1. `GET /api/apps` 在三种模式下均可得到可预期结果（`disabled` 除外为 `410`）。
2. `POST /api/apps` 在 `readonly` 模式返回 `403`。
3. 任意 `/api/apps/*` 响应均包含迁移头。
4. `GET /api/migration/legacy-usage` 可查看：
   - 总量：`usage.totalHits`
   - 方法分布：`usage.byMethod`
   - 路径分布：`usage.byPath`

## 5. 回滚方案
当出现业务阻断时：
1. 立即将 `LEGACY_APPS_MODE` 改回 `enabled`。
2. 重启后端服务使配置生效。
3. 使用 `legacy-usage` 快速定位未迁移客户端并补齐改造计划。
