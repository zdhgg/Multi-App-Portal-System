# PM2功能架构说明

## 🎯 PM2_ENABLED 配置说明

### 配置含义

```
PM2_ENABLED=1
```

**真正含义：**
- ✅ 启用门户后端的PM2管理API功能
- ✅ 允许门户调用PM2的Node.js API
- ✅ 支持通过界面管理被部署的应用

**不是指：**
- ❌ 让门户系统自己被PM2管理
- ❌ 门户进程在PM2中运行

---

### 新增能力概览
- 持久化 PM2 进程名称（pm2ProcessName），状态同步时优先使用精准映射，避免名称模糊匹配造成的误判。
- PM2 日志读取改为真实读取 pm2 日志文件，并增加路径权限校验，门户日志面板可以直接查看最新运行日志。
- PM2 配置生成器会解析 package.json 与实际环境，自动选择合适的启动脚本并预检测端口占用。
- 启用 PM2 时自动检测守护进程状态，并提供 pm2 startup / pm2 save 等操作建议，便于快速完成生产部署。

## 🏗️ 架构层次

### 第一层：门户系统（管理者）

```
detection-api (8001端口)
├── 启动方式: npm run dev (开发) / Windows服务 (生产)
└── PM2_ENABLED=1: 赋予调用PM2 API的权限

main-portal (3000端口)
└── 启动方式: npm run dev (开发) / 静态文件服务 (生产)
```

**职责：** 提供管理界面和API，管理其他应用

### 第二层：被管理的应用（被管理者）

```
Teaching-inspection-systemV1.3
├── 前端进程 (由PM2管理)
└── 后端进程 (由PM2管理)

其他通过门户部署的应用
└── 由PM2管理其生命周期
```

**职责：** 业务应用，被门户管理

---

## 🔄 启动流程

### 开发环境

1. **启动门户系统**
   ```bash
   # 后端
   cd detection-api
   npm run dev
   
   # 前端
   cd main-portal
   npm run dev
   ```

2. **门户后端读取 PM2_ENABLED=1**
   - 初始化PM2 API连接
   - 准备好管理其他应用的能力

3. **通过门户界面部署应用**
   - 应用进程由PM2托管
   - 门户可以启动/停止/重启这些应用

### 生产环境

1. **门户系统部署**
   - 后端：Windows服务 或 独立PM2实例（不显示在管理界面）
   - 前端：Nginx/IIS 静态文件服务

2. **被部署的应用**
   - 由PM2管理
   - 通过门户界面操作

---

## ⚠️ 重要原则

### 1. 管理者与被管理者分离
```
门户系统 ≠ 被管理应用
```

### 2. 门户稳定性优先
- 门户是基础设施，应保持稳定运行
- 不应该被随意重启或停止

### 3. PM2管理范围
- ✅ 只管理通过门户部署的应用
- ❌ 不包括门户系统自己

### 4. 界面显示原则
- PM2管理界面应该**过滤掉**门户系统自己的进程
- 只显示被部署的应用

---

## 📊 实际场景示例

### 场景1：开发环境测试

```
用户启动门户:
  ├── 后端 (8001): npm run dev
  └── 前端 (3000): npm run dev

用户通过门户部署应用A:
  └── PM2启动应用A的前后端进程

PM2管理界面显示:
  ├── 应用A-frontend (PM2管理)
  └── 应用A-backend (PM2管理)
  
不显示:
  ├── detection-api (门户自己)
  └── main-portal (门户自己)
```

### 场景2：生产环境部署

```
门户系统 (Windows服务运行):
  ├── detection-api服务
  └── Nginx提供前端

被管理的应用 (PM2管理):
  ├── 应用A
  ├── 应用B
  └── 应用C

用户通过门户界面操作应用A/B/C
但不能操作门户系统本身
```

---

## 🔧 技术实现要点

### 后端过滤逻辑

```typescript
// 在PM2服务中过滤进程
async getProcessList(): Promise<PM2Process[]> {
  const allProcesses = await pm2.list()
  
  // 过滤掉门户系统自己
  const filteredProcesses = allProcesses.filter(proc => {
    const isPortalBackend = proc.name === 'detection-api'
    const isPortalFrontend = proc.name === 'main-portal'
    
    return !isPortalBackend && !isPortalFrontend
  })
  
  return filteredProcesses
}
```

### 前端显示逻辑

```typescript
// PM2管理界面只显示被管理的应用
const managedApps = processes.filter(p => 
  !p.name.includes('portal') && 
  !p.name.includes('detection-api')
)
```

---

## 📝 配置文件说明

### detection-api/.env

```env
# PM2管理功能开关
# 启用后，门户后端可以调用PM2 API来管理其他应用
PM2_ENABLED=1

# 不是让门户自己被PM2管理！
```

### ecosystem.config.js (被管理应用使用)

```javascript
module.exports = {
  apps: [
    {
      name: 'app-backend',
      script: './server.js',
      // ... 应用配置
    },
    {
      name: 'app-frontend',
      script: 'npm',
      args: 'run dev',
      // ... 应用配置
    }
  ]
}
```

---

## ✅ 最佳实践

1. **明确角色**
   - 门户 = 管理工具
   - 应用 = 被管理对象

2. **分离部署**
   - 门户独立部署和运行
   - 应用通过门户界面管理

3. **稳定优先**
   - 门户稳定性 > 功能丰富性
   - 避免循环依赖

4. **清晰文档**
   - 配置含义清楚
   - 架构层次明确

---

## 🚀 未来扩展

### 生产环境部署建议

1. **门户后端**
   - Windows服务: `nssm install portal-backend`
   - 或Docker容器
   
2. **门户前端**
   - Nginx反向代理
   - 或IIS静态托管

3. **PM2守护进程**
   - 独立运行
   - 由门户通过API控制

4. **监控告警**
   - 门户系统独立监控
   - 应用通过PM2监控
