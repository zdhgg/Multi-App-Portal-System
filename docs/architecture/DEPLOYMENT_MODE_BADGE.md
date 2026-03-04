# 运行模式标识功能

## 📋 功能概述

在门户管理系统首页的应用卡片上添加**运行模式标识**，让管理员能够一眼识别应用是通过**生产模式(PM2)**还是**开发模式(DEV)**运行。

## 🎯 功能价值

### 为什么需要这个功能？

1. **运维可见性** - 管理员可以快速识别应用的运行环境
2. **避免误操作** - 生产环境不应该使用开发模式运行
3. **性能差异提醒** - PM2提供进程守护、自动重启等生产级特性
4. **资源监控** - 开发模式通常占用更多资源（热重载、source maps等）
5. **安全性提醒** - 开发模式可能暴露调试信息

## 🎨 UI展示效果

### 应用卡片布局

```
┌─────────────────────────────────┐
│ 🟢 在线    🔵 生产(PM2)          │  ← 状态 + 运行模式双标签
│                                 │
│ Teaching-inspection-systemV1.3  │
│ 全栈项目：Vue + Express         │
│ 📍 3041  📍 8041                │
│                                 │
│ [访问应用]  [•••]                │
└─────────────────────────────────┘
```

### 标签颜色方案

| 运行模式 | 徽章类型 | 颜色 | 显示文本 |
|---------|---------|------|---------|
| 生产模式 | `primary` | 🔵 蓝色 | `生产(PM2)` |
| 开发模式 | `warning` | 🟠 橙色 | `开发(DEV)` |
| 未知/离线 | `info` | ⚪ 灰色 | 不显示 |

## 🔧 技术实现

### 1. 后端API增强

**文件**: `detection-api/src/api/controllers/PublicController.ts`

**修改内容**:
- 在 `toPublicApp` 方法的返回对象中添加 `deploymentMode` 字段
- 在 `toPublicApp` 方法的返回对象中添加 `isFullStack` 字段

**判断逻辑**:
```typescript
// 检查应用是否通过PM2运行
const isPM2Running = await this.checkIfPM2Running(app.name)

if (isPM2Running) {
  deploymentMode = 'production'  // 生产模式
} else if (app.state === 'running') {
  deploymentMode = 'development' // 开发模式
} else {
  deploymentMode = 'unknown'     // 未知
}
```

**返回数据结构**:
```json
{
  "id": "xxx",
  "name": "Teaching-inspection-systemV1.3",
  "deploymentMode": "production",    // ✅ 新增
  "isFullStack": true,                // ✅ 新增
  "isRunning": true,
  "ports": [...],
  ...
}
```

### 2. 前端组件增强

**文件**: `main-portal/src/components/portal/AppCard.vue`

**修改内容**:

1. **模板部分** - 添加运行模式标签：
```vue
<div class="header-badges">
  <div class="app-status" :class="statusClass">
    <span class="status-dot"></span>
    <span class="status-text">{{ statusText }}</span>
  </div>
  <!-- 🎯 运行模式标签 -->
  <el-tag
    v-if="app.isRunning && app.deploymentMode"
    :type="deploymentModeType"
    size="small"
    effect="light"
    class="deployment-mode-tag"
  >
    {{ deploymentModeText }}
  </el-tag>
</div>
```

2. **脚本部分** - 添加计算属性：
```typescript
// 运行模式徽章类型
const deploymentModeType = computed(() => {
  switch (props.app.deploymentMode) {
    case 'production': return 'primary'  // 蓝色
    case 'development': return 'warning' // 橙色
    default: return 'info'               // 灰色
  }
})

// 运行模式显示文本
const deploymentModeText = computed(() => {
  switch (props.app.deploymentMode) {
    case 'production': return '生产(PM2)'
    case 'development': return '开发(DEV)'
    default: return '未知'
  }
})
```

3. **样式部分** - 美化标签样式：
```css
.header-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.deployment-mode-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}
```

### 3. TypeScript类型定义

**文件**: `main-portal/src/types/app.ts`

**修改内容**:
```typescript
export interface App {
  // ... 其他字段
  
  // 🎯 运行模式信息
  deploymentMode?: 'production' | 'development' | 'unknown'
  isFullStack?: boolean
}
```

## 📊 判断逻辑

### 如何识别运行模式？

1. **检查PM2进程列表**
   - 调用 `pm2Service.getProcessList()`
   - 查找应用名称匹配的进程
   - 如果找到且状态为 `online` → **生产模式(PM2)**

2. **应用正在运行但不在PM2中**
   - 应用状态为 `running`
   - 但PM2进程列表中没有该应用
   - → **开发模式(DEV)**

3. **应用离线**
   - 应用状态为 `stopped` 或 `offline`
   - → 不显示运行模式标签

### 特殊处理：全栈应用

对于全栈应用（`isFullStack: true`），运行模式判断更重要：
- **生产模式(PM2)**: 后端提供前端静态文件，访问后端端口（8041）
- **开发模式(DEV)**: 前后端分离，访问前端端口（3041）

## 🧪 测试验证

### 测试步骤

1. **刷新门户首页**
   ```
   访问: http://localhost:8002
   按 Ctrl+F5 强制刷新
   ```

2. **检查应用卡片**
   - 查看 `Teaching-inspection-systemV1.3` 应用
   - 确认显示两个标签：
     - 🟢 在线（状态标签）
     - 🔵 生产(PM2)（运行模式标签）

3. **切换运行模式测试**
   ```bash
   # 停止PM2进程
   pm2 stop teaching-inspection-systemv1.3
   
   # 开发模式启动
   cd "Teaching-inspection-systemV1.3/frontend"
   npm run dev
   
   # 刷新门户首页，应该看到：
   # 🟢 在线 + 🟠 开发(DEV)
   ```

### 预期结果

| 场景 | 状态标签 | 运行模式标签 | 访问端口 |
|------|---------|-------------|---------|
| PM2生产模式 | 🟢 在线 | 🔵 生产(PM2) | 8041 (后端) |
| 开发模式 | 🟢 在线 | 🟠 开发(DEV) | 3041 (前端) |
| 离线 | ⚪ 离线 | 不显示 | - |

## 📝 相关文件清单

### 修改的文件

1. **后端**
   - `detection-api/src/api/controllers/PublicController.ts`
     - 添加 `deploymentMode` 和 `isFullStack` 到返回数据

2. **前端**
   - `main-portal/src/components/portal/AppCard.vue`
     - 添加运行模式标签显示
     - 添加计算属性和样式
   - `main-portal/src/types/app.ts`
     - 更新 `App` 接口类型定义

### 无需修改

- PM2服务逻辑（已在之前实现）
- 端口选择逻辑（已在之前实现）
- 状态管理逻辑（复用现有）

## 🎉 功能优势

### 对比之前

| 项目 | 之前 | 现在 |
|------|------|------|
| 运行模式可见性 | ❌ 无法识别 | ✅ 一眼识别 |
| 端口选择提示 | ❌ 需要查文档 | ✅ 自动显示 |
| 运维决策 | ⚠️ 需要登录服务器查看 | ✅ 门户直接显示 |
| 新手友好度 | ⚠️ 容易混淆 | ✅ 清晰明确 |

### 实际价值

1. **提升运维效率** - 减少登录服务器查看PM2状态的次数
2. **避免生产事故** - 防止生产环境误用开发模式
3. **改善用户体验** - 管理员一眼看懂应用状态
4. **增强系统专业度** - 展现系统的完善性和细节把控

## 💡 未来扩展

可以考虑添加的功能：

1. **点击标签查看详情**
   - 显示PM2进程ID
   - 显示启动时间
   - 显示内存占用等

2. **一键切换模式**
   - 在卡片上添加"切换为生产模式"按钮
   - 自动构建前端并启动PM2

3. **运行模式统计**
   - 在首页顶部显示：
     - X个应用运行在生产模式
     - Y个应用运行在开发模式

4. **告警提醒**
   - 生产环境检测到开发模式时发出警告

## 📖 参考资料

- [PM2 Official Documentation](https://pm2.keymetrics.io/)
- [Element Plus Tag Component](https://element-plus.org/zh-CN/component/tag.html)
- [Vue 3 Computed Properties](https://vuejs.org/guide/essentials/computed.html)

---

**创建时间**: 2025-01-20  
**作者**: AI Assistant  
**版本**: v1.0.0

