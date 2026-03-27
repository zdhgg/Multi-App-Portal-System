# 安全配置指南

本文档汇总了 **智能多Web应用门户系统 v1.3.0** 的所有安全相关配置选项。

---

## 1. 环境变量配置

### 1.1 认证与授权

| 变量 | 说明 | 默认值 | 生产环境建议 |
|------|------|--------|--------------|
| `JWT_SECRET` | JWT 签名密钥 | 开发默认值 | **必须设置**，至少32位随机字符串 |
| `JWT_EXPIRES_IN` | Access Token 有效期 | `24h` | `1h` 或更短 |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 有效期 | `7d` | `7d` |
| `AUTH_ENFORCEMENT` | 认证强制开关 | `on` | `on`（仅紧急情况设为 `off`） |

**生成安全的 JWT_SECRET：**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 1.2 CORS 配置

| 变量 | 说明 | 默认值 | 生产环境建议 |
|------|------|--------|--------------|
| `CORS_MODE` | CORS 策略模式 | `lan` | `lan` 或 `strict` |
| `CORS_ORIGIN` | 允许的域名列表（逗号分隔） | 无 | 配置具体域名 |

**CORS_MODE 说明：**
- `strict`：仅允许 `CORS_ORIGIN` 中配置的域名
- `lan`：允许局域网 IP + `CORS_ORIGIN`（推荐内网部署）
- `open`：允许所有来源（仅开发环境有效）

### 1.3 文件系统安全

| 变量 | 说明 | 默认值 | 生产环境建议 |
|------|------|--------|--------------|
| `ALLOWED_PATHS` | 允许访问的文件路径（逗号分隔） | 当前目录及父目录 | 配置具体项目路径 |

### 1.4 运行环境

| 变量 | 说明 | 默认值 | 生产环境建议 |
|------|------|--------|--------------|
| `NODE_ENV` | 运行环境 | `development` | `production` |
| `PORT` | 服务端口 | `3001` | 按需配置 |

---

## 2. 角色与权限矩阵

### 2.1 角色定义

| 角色 | 说明 |
|------|------|
| `admin` | 管理员，拥有全部权限 |
| `operator` | 操作员，可读取和执行操作，不可修改配置 |
| `guest` | 访客，仅可访问公开页面 |

### 2.2 API 权限矩阵

| 模块 | 接口类型 | guest | operator | admin |
|------|----------|-------|----------|-------|
| **认证** | 登录/登出 | ✅ | ✅ | ✅ |
| **应用检测** | GET | ❌ | ✅ | ✅ |
| **应用管理** | GET | ❌ | ✅ | ✅ |
| **应用管理** | POST/PUT/DELETE | ❌ | ❌ | ✅ |
| **PM2 管理** | GET（状态/列表/日志） | ❌ | ✅ | ✅ |
| **PM2 管理** | POST/DELETE（操作） | ❌ | ❌ | ✅ |
| **端口管理** | GET | ❌ | ✅ | ✅ |
| **端口管理** | POST/PUT/DELETE | ❌ | ❌ | ✅ |
| **系统设置** | 全部 | ❌ | ❌ | ✅ |
| **文件系统** | 全部 | ❌ | ❌ | ✅ |
| **配置导出** | 全部 | ❌ | ❌ | ✅ |

---

## 3. 紧急开关

### 3.1 认证紧急关闭

当遇到认证问题无法登录时，可临时关闭认证：

```bash
# 设置环境变量
AUTH_ENFORCEMENT=off

# 或在 .env 文件中添加
AUTH_ENFORCEMENT=off
```

⚠️ **警告**：仅限内网应急使用，恢复后务必设回 `on`。

### 3.2 恢复步骤

1. 修复认证问题
2. 设置 `AUTH_ENFORCEMENT=on`
3. 重启服务
4. 检查审计日志确认无异常访问

---

## 4. 审计日志

### 4.1 日志位置

```
logs/audit/audit-YYYY-MM-DD.jsonl
```

### 4.2 日志内容

每条审计日志包含：
- `timestamp`：时间戳
- `action`：操作类型
- `userId`：用户ID
- `userRole`：用户角色
- `method`：HTTP 方法
- `path`：请求路径
- `statusCode`：响应状态码
- `duration`：响应时间（ms）
- `ip`：客户端IP
- `success`：是否成功

### 4.3 日志清理

审计日志默认保留 90 天，可通过 API 手动清理：
```bash
# 清理 90 天前的日志
curl -X POST http://localhost:3001/api/v2/audit/cleanup?retainDays=90
```

---

## 5. 生产环境部署清单

### 5.1 必须配置

- [ ] 设置 `NODE_ENV=production`
- [ ] 配置安全的 `JWT_SECRET`
- [ ] 配置 `CORS_ORIGIN` 或确认使用 `lan` 模式
- [ ] 确认管理员密码已修改（非默认 `admin123`）

### 5.2 建议配置

- [ ] 配置 `ALLOWED_PATHS` 限制文件系统访问范围
- [ ] 配置 `CORS_MODE=strict` 如果有固定的前端域名
- [ ] 启用 HTTPS（通过反向代理如 Nginx）
- [ ] 定期检查审计日志

### 5.3 示例 .env 文件

```env
# 运行环境
NODE_ENV=production
PORT=3001

# JWT 配置（必须修改）
JWT_SECRET=your-secure-random-string-at-least-32-characters-long
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# CORS 配置
CORS_MODE=lan
CORS_ORIGIN=http://192.168.1.100:5173

# 文件系统白名单
ALLOWED_PATHS=/data/projects,/home/user/apps

# 认证开关（保持 on）
AUTH_ENFORCEMENT=on
```

---

## 6. 安全更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.1 Phase 3 | 2025-01 | filesystem 硬化、CORS 收敛、审计日志 |
| v1.1 Phase 2 | 2025-01 | 会话撤销、Token 黑名单、审计日志服务 |
| v1.1 Phase 1 | 2025-01 | 统一 RBAC 中间件、JWT 生产环境强制配置 |

---

## 7. 问题反馈

如发现安全问题，请通过以下方式反馈：
- 内部报告：联系系统管理员
- 紧急情况：使用 `AUTH_ENFORCEMENT=off` 临时关闭认证后排查

