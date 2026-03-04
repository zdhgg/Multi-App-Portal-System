# PM2状态自动同步功能

## 📋 问题描述

有时候会出现PM2进程管理页面显示应用已启动，但应用管理页面显示应用未启动的情况。这是因为：

1. **直接使用PM2命令行启动** - 绕过了门户系统，数据库状态未更新
2. **PM2自动重启** - 应用崩溃后PM2自动恢复，数据库状态未同步
3. **服务器重启后PM2恢复进程** - `pm2 startup`和`pm2 save`导致的开机自启
4. **并发操作** - 多人同时操作或不同页面同时操作

## 🔧 解决方案

实现了一个**PM2状态自动同步服务**，每30秒自动检查PM2进程状态并同步到数据库。

### 架构设计

```
┌─────────────────────────────────────────────┐
│          detection-api Server               │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │   PM2StateSyncService              │   │
│  │   - 定时同步（30秒）                │   │
│  │   - 手动同步 API                    │   │
│  │   - 智能状态对比                    │   │
│  └─────────┬──────────────────┬───────┘   │
│            │                  │            │
│  ┌─────────▼────────┐  ┌─────▼────────┐  │
│  │  PM2Service      │  │  Application │  │
│  │  (进程列表)       │  │  Repository  │  │
│  │                  │  │  (数据库)     │  │
│  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────┘
```

## 🎯 核心功能

### 1. 自动定时同步

**文件**: `detection-api/src/services/pm2StateSyncService.ts`

**功能**:
- 每30秒自动执行一次同步
- 遍历所有应用，对比PM2进程状态和数据库状态
- 状态不一致时自动更新数据库
- 详细的日志记录

**同步逻辑**:
```typescript
// 1. 获取所有PM2进程列表
const pm2Processes = await pm2Service.getProcessList()

// 2. 获取所有应用
const allApps = await applicationService.findAll()

// 3. 对比状态
for (const app of allApps) {
  const pm2Process = findMatchingProcess(pm2Processes, app.name)
  const isRunning = pm2Process && pm2Process.status === 'online'
  const targetState = isRunning ? 'running' : 'stopped'
  
  // 4. 状态不一致时更新
  if (app.state !== targetState) {
    await applicationService.repository.updateState(app.id, targetState)
  }
}
```

### 2. 手动同步API

**端点**: `POST /api/pm2/sync-state`

**功能**: 前端可以手动触发一次完整同步

**请求**:
```bash
curl -X POST http://localhost:8002/api/pm2/sync-state \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**响应**:
```json
{
  "success": true,
  "data": {
    "synced": 10,
    "updated": 2,
    "errors": 0,
    "message": "成功同步 2 个应用的状态"
  },
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

### 3. 单个应用同步

**端点**: `POST /api/pm2/sync-app/:appId`

**功能**: 同步指定应用的状态

**请求**:
```bash
curl -X POST http://localhost:8002/api/pm2/sync-app/app-123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📦 实现文件

### 新增文件

1. **PM2状态同步服务**
   - `detection-api/src/services/pm2StateSyncService.ts`
   - 核心同步逻辑

### 修改文件

1. **ServiceContainer.ts**
   - 注册 `PM2StateSyncService`
   - 在 `startBackgroundServices()` 中启动同步服务
   - 在 `close()` 中停止同步服务

2. **server.ts**
   - 将 `pm2StateSyncService` 绑定到 `app.locals`
   - 供路由访问

3. **pm2.ts (路由)**
   - 添加 `/api/pm2/sync-state` 端点
   - 添加 `/api/pm2/sync-app/:appId` 端点

## 🔄 服务生命周期

### 启动流程

```
Server.initialize()
  └─> ServiceContainer.startBackgroundServices()
        └─> initializePM2StateSync()
              └─> pm2StateSyncService.start()
                    ├─> 立即执行一次同步
                    └─> 启动定时器（每30秒）
```

### 停止流程

```
Server.close()
  └─> ServiceContainer.close()
        └─> pm2StateSyncService.stop()
              └─> 清除定时器
```

## 🎨 智能匹配逻辑

为了应对应用名称的不同命名方式，实现了多种匹配策略：

```typescript
// 应用名称: "Teaching-inspection-systemV1.3"
// PM2进程名: "teaching-inspection-systemv1.3"

const normalizedAppName = app.name.toLowerCase().replace(/[-_\s]/g, '')
const pm2Process = pm2ProcessMap.get(app.name) ||
                   pm2ProcessMap.get(app.name.toLowerCase()) ||
                   pm2ProcessMap.get(normalizedAppName)
```

匹配规则：
1. 精确匹配 (`app.name === pm2Process.name`)
2. 忽略大小写匹配
3. 忽略分隔符匹配（`-`, `_`, 空格）

## 📊 日志示例

### 正常同步（无变化）

```
2025-01-20 12:00:00 [DEBUG] 开始PM2状态同步
2025-01-20 12:00:01 [DEBUG] PM2状态同步完成（无变化） { synced: 10, updated: 0, errors: 0 }
```

### 检测到状态不一致

```
2025-01-20 12:00:00 [INFO] 检测到状态不一致，执行同步 {
  appId: "app-123",
  appName: "Teaching-inspection-systemV1.3",
  dbState: "stopped",
  pm2State: "running",
  targetState: "running"
}
2025-01-20 12:00:01 [INFO] 状态同步成功 {
  appId: "app-123",
  appName: "Teaching-inspection-systemV1.3",
  oldState: "stopped",
  newState: "running"
}
2025-01-20 12:00:01 [INFO] PM2状态同步完成 { synced: 10, updated: 1, errors: 0 }
```

## 🧪 测试场景

### 场景1: 直接使用PM2启动应用

```bash
# 1. 直接使用PM2启动
pm2 start teaching-inspection-systemv1.3

# 2. 此时应用管理页面显示"离线"

# 3. 等待30秒（或手动触发同步）

# 4. 刷新应用管理页面，状态已自动更新为"在线"
```

### 场景2: PM2自动重启

```bash
# 1. 应用运行中
pm2 status teaching-inspection-systemv1.3  # online

# 2. 模拟应用崩溃
pm2 stop teaching-inspection-systemv1.3
pm2 start teaching-inspection-systemv1.3

# 3. PM2自动重启，但数据库状态未更新

# 4. 30秒内自动同步完成
```

### 场景3: 服务器重启

```bash
# 1. 服务器重启前保存PM2进程列表
pm2 save

# 2. 服务器重启

# 3. PM2自动恢复进程（pm2 startup配置）

# 4. detection-api启动后，立即执行一次同步

# 5. 所有应用状态自动恢复到正确状态
```

## ⚙️ 配置选项

### 调整同步间隔

```typescript
// 在ServiceContainer中获取同步服务
const pm2StateSyncService = container.get('pm2StateSyncService')

// 设置同步间隔为60秒
pm2StateSyncService.setSyncInterval(60000)
```

**注意**: 最小间隔为5秒

### 环境变量

可以通过环境变量配置：

```bash
# .env
PM2_SYNC_INTERVAL=30000  # 同步间隔（毫秒）
PM2_SYNC_ENABLED=true    # 是否启用自动同步
```

## 🎯 最佳实践

### 1. 避免频繁手动同步

自动同步已经足够快（30秒），无需频繁手动触发。

### 2. 使用门户系统启动应用

尽量通过门户系统启动/停止应用，避免直接使用PM2命令行。

### 3. 监控同步日志

定期检查日志，确认同步服务正常运行：

```bash
tail -f logs/detection-api.log | grep "PM2状态同步"
```

### 4. 异常处理

如果发现频繁的状态不一致，检查：
- PM2进程是否频繁重启
- 应用是否存在稳定性问题
- 端口冲突或其他资源问题

## 💡 未来扩展

### 可能的增强功能

1. **WebSocket实时推送**
   - 状态变化时实时通知前端
   - 无需等待30秒

2. **PM2事件监听**
   - 监听PM2的`online`、`stop`、`restart`事件
   - 实时响应，无需轮询

3. **状态历史记录**
   - 记录每次状态变化
   - 便于追溯和分析

4. **告警机制**
   - 状态频繁变化时发出告警
   - 检测异常的应用行为

5. **批量操作优化**
   - 使用事务批量更新状态
   - 提高大规模应用的同步效率

## 📝 API文档

### POST /api/pm2/sync-state

**描述**: 手动同步所有应用的PM2状态

**认证**: 需要管理员权限

**请求**:
```
POST /api/pm2/sync-state
Authorization: Bearer <token>
```

**响应成功**:
```json
{
  "success": true,
  "data": {
    "synced": 10,      // 检查的应用总数
    "updated": 2,      // 更新的应用数量
    "errors": 0,       // 错误数量
    "message": "成功同步 2 个应用的状态"
  },
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

**响应失败**:
```json
{
  "success": false,
  "error": "状态同步失败",
  "message": "具体错误信息"
}
```

### POST /api/pm2/sync-app/:appId

**描述**: 同步指定应用的PM2状态

**认证**: 需要管理员权限

**请求**:
```
POST /api/pm2/sync-app/app-123
Authorization: Bearer <token>
```

**响应成功**:
```json
{
  "success": true,
  "data": {
    "appId": "app-123",
    "updated": true,
    "message": "应用状态已同步"
  },
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## 🐛 常见问题

### Q1: 为什么还是会有延迟？

A: 默认同步间隔是30秒。如果需要更快的响应，可以：
- 降低同步间隔（最低5秒）
- 使用手动同步API
- 未来实现WebSocket实时推送

### Q2: 同步服务会影响性能吗？

A: 不会。同步操作非常轻量：
- 只在状态不一致时才写数据库
- 使用索引优化的查询
- 异步执行，不阻塞主流程

### Q3: 如何确认同步服务在运行？

A: 查看启动日志：
```
✅ PM2状态同步服务已启动（每30秒同步一次）
```

或查看定时同步日志：
```
PM2状态同步完成 { synced: 10, updated: 0, errors: 0 }
```

---

**创建时间**: 2025-01-20  
**作者**: AI Assistant  
**版本**: v1.0.0

