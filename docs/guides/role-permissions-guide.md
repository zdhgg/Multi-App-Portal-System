# 角色权限说明文档

## 📋 概述

本文档详细说明了智能多应用门户系统中各个角色的权限配置。

---

## 🔍 当前问题发现

### ⚠️ 角色定义不一致

**问题**：UI界面显示的角色与后端实际支持的角色不匹配

| 位置 | 支持的角色 | 状态 |
|------|-----------|------|
| **UI界面** | `admin`（管理员）、`operator`（运维） | ✅ 显示 |
| **后端代码** | `admin`（管理员）、`guest`（访客） | ✅ 实现 |
| **类型定义** | `'admin' \| 'guest'` | ⚠️ 不匹配 |

**影响**：
- ❌ 创建 `operator` 角色的用户后，系统会将其视为 `guest`
- ❌ `operator` 用户无法获得预期的运维权限
- ❌ 权限检查逻辑只识别 `admin` 和 `guest`

---

## 🎯 当前角色权限详情

### 1. 管理员（admin）

**角色标识**: `admin`

**权限范围**: 完全控制权限

#### 系统访问权限
- ✅ 访问所有页面和功能
- ✅ 查看所有数据和统计信息
- ✅ 修改系统配置
- ✅ 管理用户账户

#### 应用管理权限
- ✅ 启动/停止应用
- ✅ 重启应用
- ✅ 删除应用（危险操作）
- ✅ 强制停止应用（危险操作）
- ✅ 重置应用配置（危险操作）
- ✅ 修改应用配置
- ✅ 查看应用日志
- ✅ 打开应用文件夹
- ✅ 执行构建操作

#### 端口管理权限
- ✅ 查看端口状态
- ✅ 分配端口
- ✅ 释放端口
- ✅ 解决端口冲突
- ✅ 修改端口配置

#### PM2管理权限
- ✅ 查看PM2进程列表
- ✅ 重启PM2进程
- ✅ 停止PM2进程
- ✅ 删除PM2进程
- ✅ 查看PM2日志
- ✅ 修改PM2配置

#### 系统设置权限
- ✅ 管理用户账户（新增、编辑、删除）
- ✅ 修改系统配置
- ✅ 查看系统日志
- ✅ 清理系统日志
- ✅ 配置通知设置
- ✅ 配置安全设置
- ✅ 执行备份和恢复

#### 日志和监控权限
- ✅ 查看所有日志
- ✅ 下载日志
- ✅ 清理日志
- ✅ 查看实时监控数据
- ✅ 配置告警规则

---

### 2. 访客（guest）

**角色标识**: `guest`

**权限范围**: 只读访问权限

#### 系统访问权限
- ✅ 访问门户首页
- ✅ 查看应用列表
- ✅ 查看应用状态
- ❌ 无法修改任何配置
- ❌ 无法执行任何操作

#### 应用管理权限
- ✅ 查看应用信息
- ✅ 查看应用状态
- ❌ 无法启动/停止应用
- ❌ 无法修改应用配置
- ❌ 无法删除应用
- ❌ 无法执行构建操作

#### 端口管理权限
- ✅ 查看端口状态
- ❌ 无法分配/释放端口
- ❌ 无法修改端口配置

#### PM2管理权限
- ❌ 无法访问PM2管理功能

#### 系统设置权限
- ❌ 无法访问系统设置
- ❌ 无法管理用户
- ❌ 无法修改配置

#### 日志和监控权限
- ✅ 查看公开日志（如果配置允许）
- ❌ 无法下载日志
- ❌ 无法清理日志

---

### 3. 运维（operator）⚠️ 未实现

**角色标识**: `operator`

**状态**: ⚠️ **UI显示但后端未实现**

**预期权限范围**: 日常运维权限

#### 预期的系统访问权限
- ✅ 访问大部分页面和功能
- ✅ 查看所有数据和统计信息
- ✅ 修改部分系统配置
- ❌ 无法管理用户账户

#### 预期的应用管理权限
- ✅ 启动/停止应用
- ✅ 重启应用
- ❌ 无法删除应用（危险操作）
- ⚠️ 可以强制停止应用（需要确认）
- ❌ 无法重置应用配置（危险操作）
- ✅ 修改应用配置
- ✅ 查看应用日志
- ✅ 打开应用文件夹
- ✅ 执行构建操作

#### 预期的端口管理权限
- ✅ 查看端口状态
- ✅ 分配端口
- ✅ 释放端口
- ✅ 解决端口冲突
- ⚠️ 可以修改端口配置（需要限制）

#### 预期的PM2管理权限
- ✅ 查看PM2进程列表
- ✅ 重启PM2进程
- ✅ 停止PM2进程
- ❌ 无法删除PM2进程
- ✅ 查看PM2日志
- ⚠️ 可以修改PM2配置（需要限制）

#### 预期的系统设置权限
- ❌ 无法管理用户账户
- ⚠️ 可以修改部分系统配置
- ✅ 查看系统日志
- ✅ 清理系统日志
- ⚠️ 可以配置通知设置
- ❌ 无法配置安全设置
- ⚠️ 可以执行备份（需要限制）

#### 预期的日志和监控权限
- ✅ 查看所有日志
- ✅ 下载日志
- ✅ 清理日志
- ✅ 查看实时监控数据
- ⚠️ 可以配置告警规则（需要限制）

---

## 🔧 权限检查逻辑

### 当前实现

**文件**: `main-portal/src/stores/auth.ts`

```typescript
// 用户角色类型定义
export interface User {
  id: string
  username: string
  role: 'admin' | 'guest'  // ⚠️ 只支持 admin 和 guest
  is_active: boolean
  // ...
}

// 权限检查函数
const hasPermission = (requiredRole: 'admin' | 'guest' = 'guest'): boolean => {
  if (!isAuthenticated.value) {
    return requiredRole === 'guest'
  }

  if (requiredRole === 'admin') {
    return isAdmin.value  // user.role === 'admin' && user.is_active
  }

  return true
}
```

**文件**: `main-portal/src/views/Management.vue`

```typescript
// 操作权限检查
const hasOperationPermission = (operation: string): boolean => {
  const authStore = useAuthStore()
  
  // 危险操作需要管理员权限
  const dangerousOperations = ['delete', 'force-stop', 'reset-config']
  if (dangerousOperations.includes(operation)) {
    return authStore.hasPermission('admin')  // 只有 admin 可以执行
  }
  
  // 管理操作需要认证用户
  else if (['config', 'pm2-management', 'deployment-config'].includes(operation)) {
    return authStore.isAuthenticated  // admin 和 guest 都可以（如果已认证）
  }
  
  // 开发操作需要认证用户
  else if (['build-analyze', 'build-execute', 'folder'].includes(operation)) {
    return authStore.isAuthenticated
  }
  
  return true
}
```

---

## 📊 权限对比表

| 功能/操作 | 管理员 | 运维（未实现） | 访客 |
|----------|--------|---------------|------|
| **应用管理** |
| 查看应用列表 | ✅ | ✅ | ✅ |
| 启动/停止应用 | ✅ | ✅ | ❌ |
| 重启应用 | ✅ | ✅ | ❌ |
| 删除应用 | ✅ | ❌ | ❌ |
| 强制停止应用 | ✅ | ⚠️ | ❌ |
| 修改应用配置 | ✅ | ✅ | ❌ |
| 查看应用日志 | ✅ | ✅ | ⚠️ |
| 执行构建操作 | ✅ | ✅ | ❌ |
| **端口管理** |
| 查看端口状态 | ✅ | ✅ | ✅ |
| 分配/释放端口 | ✅ | ✅ | ❌ |
| 解决端口冲突 | ✅ | ✅ | ❌ |
| **PM2管理** |
| 查看PM2进程 | ✅ | ✅ | ❌ |
| 重启PM2进程 | ✅ | ✅ | ❌ |
| 停止PM2进程 | ✅ | ✅ | ❌ |
| 删除PM2进程 | ✅ | ❌ | ❌ |
| **系统设置** |
| 管理用户账户 | ✅ | ❌ | ❌ |
| 修改系统配置 | ✅ | ⚠️ | ❌ |
| 查看系统日志 | ✅ | ✅ | ❌ |
| 清理系统日志 | ✅ | ✅ | ❌ |
| 配置安全设置 | ✅ | ❌ | ❌ |
| **监控和告警** |
| 查看监控数据 | ✅ | ✅ | ⚠️ |
| 配置告警规则 | ✅ | ⚠️ | ❌ |
| 接收告警通知 | ✅ | ✅ | ❌ |

**图例**：
- ✅ 完全支持
- ⚠️ 部分支持或需要限制
- ❌ 不支持

---

## 🚨 需要修复的问题

### 1. 角色定义不一致

**问题**：UI显示 `operator` 角色，但后端只支持 `admin` 和 `guest`

**影响**：
- 创建 `operator` 用户后，系统无法正确识别其权限
- 用户体验混乱

**解决方案**：

#### 方案A：移除 operator 角色（快速修复）
- 修改 `UserManagementPanel.vue`，移除 `operator` 选项
- 只保留 `admin` 和 `guest` 两个角色
- 更新文档说明

#### 方案B：实现 operator 角色（完整方案）
1. 修改类型定义：`role: 'admin' | 'operator' | 'guest'`
2. 更新权限检查逻辑
3. 实现细粒度的权限控制
4. 更新所有相关代码

---

## 📝 建议

### 短期建议（快速修复）

1. **移除 operator 角色选项**
   - 修改 `UserManagementPanel.vue`
   - 只保留 `admin` 角色
   - 将默认角色改为 `guest`

2. **更新文档**
   - 明确说明只支持两种角色
   - 更新用户手册

### 长期建议（完整实现）

1. **实现完整的 RBAC（基于角色的访问控制）**
   - 定义清晰的角色层级
   - 实现细粒度的权限控制
   - 支持自定义角色

2. **权限配置化**
   - 将权限配置从代码中分离
   - 支持动态配置权限
   - 提供权限管理界面

3. **审计日志**
   - 记录所有权限相关操作
   - 提供审计报告
   - 支持权限变更追踪

---

## 🔗 相关文件

### 前端文件
- `main-portal/src/stores/auth.ts` - 认证状态管理
- `main-portal/src/components/settings/UserManagementPanel.vue` - 用户管理界面
- `main-portal/src/utils/routeGuards.ts` - 路由权限守卫
- `main-portal/src/views/Management.vue` - 应用管理权限检查

### 后端文件
- `detection-api/src/core/security/AuthSecurityEnhancer.ts` - 认证中间件
- `detection-api/src/core/security/PathSecurityManager.ts` - 路径安全管理
- `detection-api/config/production.config.js` - 生产环境配置

### 配置文件
- `configs/system-config.json` - 系统设置主文件
- `detection-api/configs/portal-config.json` - 端口/门户配置主文件
- `detection-api/configs/system-config.json` - 系统设置兼容镜像
- `detection-api/config/system-config.json` - 端口配置兼容镜像

---

**文档版本**: 1.0  
**创建日期**: 2025-10-29  
**最后更新**: 2025-10-29  
**维护者**: 系统开发团队
