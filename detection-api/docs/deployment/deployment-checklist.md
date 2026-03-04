# 生产环境部署检查清单

## 概述

本检查清单确保高级分析和报告系统能够安全、稳定地部署到生产环境。请按照以下步骤逐项检查并确认。

## 部署前检查

### 1. 环境准备 ✅

#### 1.1 服务器环境
- [ ] **操作系统**: Linux (Ubuntu 20.04+ 或 CentOS 8+)
- [ ] **Node.js版本**: >= 18.0.0
- [ ] **内存**: >= 4GB RAM
- [ ] **存储**: >= 50GB 可用空间
- [ ] **CPU**: >= 2 核心
- [ ] **网络**: 稳定的网络连接

#### 1.2 依赖软件
- [ ] **Node.js和npm**: 已安装并配置
- [ ] **PM2**: 已安装用于进程管理
- [ ] **Nginx**: 已安装并配置（可选，用于反向代理）
- [ ] **SSL证书**: 已获取并配置（生产环境必需）

#### 1.3 系统配置
- [ ] **防火墙**: 已配置，开放必要端口（3000, 443, 80）
- [ ] **用户权限**: 创建专用用户运行应用
- [ ] **文件权限**: 设置正确的文件和目录权限
- [ ] **系统时间**: 已同步到NTP服务器

### 2. 应用配置 ✅

#### 2.1 环境变量
- [ ] **NODE_ENV**: 设置为 'production'
- [ ] **PORT**: 设置应用端口（默认3000）
- [ ] **DB_PATH**: 设置数据库文件路径
- [ ] **LOG_PATH**: 设置日志文件路径
- [ ] **JWT_SECRET**: 设置JWT密钥
- [ ] **API_KEYS**: 设置API密钥（如果使用）

#### 2.2 数据库配置
- [ ] **数据库路径**: 确保数据库目录存在且有写权限
- [ ] **备份路径**: 确保备份目录存在且有写权限
- [ ] **数据库迁移**: 运行数据库迁移脚本
- [ ] **数据库验证**: 验证所有表和索引已创建

#### 2.3 日志配置
- [ ] **日志目录**: 创建日志目录并设置权限
- [ ] **日志轮转**: 配置日志轮转策略
- [ ] **日志级别**: 设置为 'info' 或 'warn'
- [ ] **远程日志**: 配置远程日志收集（可选）

### 3. 安全配置 ✅

#### 3.1 网络安全
- [ ] **HTTPS**: 启用HTTPS并配置SSL证书
- [ ] **HSTS**: 启用HTTP严格传输安全
- [ ] **CORS**: 配置跨域资源共享策略
- [ ] **CSP**: 配置内容安全策略

#### 3.2 认证和授权
- [ ] **JWT配置**: 配置JWT密钥和过期时间
- [ ] **API密钥**: 生成并配置API密钥
- [ ] **访问控制**: 配置用户角色和权限
- [ ] **限流配置**: 配置API请求限流

#### 3.3 数据安全
- [ ] **数据加密**: 启用敏感数据加密
- [ ] **密钥管理**: 安全存储加密密钥
- [ ] **备份加密**: 启用数据库备份加密
- [ ] **访问日志**: 启用访问日志记录

## 部署执行

### 4. 代码部署 ✅

#### 4.1 代码准备
- [ ] **代码检出**: 从版本控制系统检出最新代码
- [ ] **依赖安装**: 运行 `npm ci --production`
- [ ] **构建应用**: 运行构建脚本（如果需要）
- [ ] **文件权限**: 设置正确的文件权限

#### 4.2 配置文件
- [ ] **生产配置**: 复制生产环境配置文件
- [ ] **环境变量**: 设置所有必需的环境变量
- [ ] **配置验证**: 验证配置文件语法正确
- [ ] **敏感信息**: 确保敏感信息不在代码中

#### 4.3 数据库初始化
```bash
# 运行数据库迁移
node scripts/database-migration.js /data/analytics/primary.db --verbose

# 验证数据库结构
node scripts/verify-database.js /data/analytics/primary.db
```

### 5. 服务启动 ✅

#### 5.1 应用启动
```bash
# 使用PM2启动应用
pm2 start ecosystem.config.js --env production

# 验证应用状态
pm2 status
pm2 logs
```

#### 5.2 服务验证
- [ ] **健康检查**: 访问 `/health` 端点验证服务状态
- [ ] **API测试**: 测试关键API端点
- [ ] **日志检查**: 检查应用日志无错误
- [ ] **进程监控**: 确认进程正常运行

#### 5.3 反向代理配置（Nginx）
```nginx
# /etc/nginx/sites-available/analytics
server {
    listen 443 ssl http2;
    server_name analytics.yourdomain.com;
    
    ssl_certificate /etc/ssl/certs/analytics.crt;
    ssl_certificate_key /etc/ssl/private/analytics.key;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 部署后验证

### 6. 功能测试 ✅

#### 6.1 基础功能测试
- [ ] **系统状态**: 验证系统状态API返回正常
- [ ] **分析功能**: 测试模式分析功能
- [ ] **预测功能**: 测试预测分析功能
- [ ] **异常检测**: 测试异常检测功能
- [ ] **报告生成**: 测试报告生成功能

#### 6.2 性能测试
```bash
# 运行性能测试
npm run test:performance

# 负载测试（使用ab或wrk）
ab -n 1000 -c 10 https://analytics.yourdomain.com/api/v1/status
```

#### 6.3 集成测试
- [ ] **数据库连接**: 验证数据库连接正常
- [ ] **缓存功能**: 验证缓存系统工作正常
- [ ] **外部服务**: 验证外部服务集成正常
- [ ] **监控系统**: 验证监控数据收集正常

### 7. 监控配置 ✅

#### 7.1 应用监控
- [ ] **进程监控**: 配置PM2监控
- [ ] **性能监控**: 配置性能指标收集
- [ ] **错误监控**: 配置错误追踪
- [ ] **日志监控**: 配置日志分析

#### 7.2 系统监控
- [ ] **CPU监控**: 监控CPU使用率
- [ ] **内存监控**: 监控内存使用情况
- [ ] **磁盘监控**: 监控磁盘空间使用
- [ ] **网络监控**: 监控网络连接状态

#### 7.3 告警配置
- [ ] **邮件告警**: 配置邮件告警通知
- [ ] **短信告警**: 配置短信告警（可选）
- [ ] **Webhook告警**: 配置Webhook通知
- [ ] **告警规则**: 设置合理的告警阈值

### 8. 备份和恢复 ✅

#### 8.1 数据备份
```bash
# 配置自动备份
crontab -e
# 添加：0 2 * * * /path/to/backup-script.sh
```

#### 8.2 备份验证
- [ ] **备份文件**: 验证备份文件生成正常
- [ ] **备份完整性**: 验证备份文件完整性
- [ ] **恢复测试**: 测试数据恢复流程
- [ ] **备份存储**: 确保备份文件安全存储

## 部署后运维

### 9. 日常维护 ✅

#### 9.1 定期检查
- [ ] **日志检查**: 每日检查应用日志
- [ ] **性能监控**: 监控系统性能指标
- [ ] **磁盘空间**: 监控磁盘空间使用
- [ ] **备份验证**: 验证备份任务执行

#### 9.2 定期维护
- [ ] **日志清理**: 定期清理旧日志文件
- [ ] **数据清理**: 清理过期分析数据
- [ ] **缓存清理**: 定期清理缓存数据
- [ ] **系统更新**: 定期更新系统和依赖

#### 9.3 安全维护
- [ ] **安全补丁**: 及时安装安全补丁
- [ ] **密钥轮换**: 定期轮换加密密钥
- [ ] **访问审计**: 定期审计访问日志
- [ ] **权限检查**: 检查用户权限配置

### 10. 应急响应 ✅

#### 10.1 故障处理
- [ ] **故障检测**: 建立故障检测机制
- [ ] **应急预案**: 制定应急响应预案
- [ ] **联系方式**: 维护应急联系人列表
- [ ] **恢复流程**: 建立服务恢复流程

#### 10.2 回滚计划
- [ ] **版本管理**: 维护版本发布记录
- [ ] **回滚脚本**: 准备快速回滚脚本
- [ ] **数据回滚**: 制定数据回滚策略
- [ ] **回滚测试**: 定期测试回滚流程

## 验证脚本

### 部署验证脚本
```bash
#!/bin/bash
# deployment-verification.sh

echo "🔍 开始部署验证..."

# 检查服务状态
echo "检查服务状态..."
curl -f http://localhost:3000/health || exit 1

# 检查数据库
echo "检查数据库连接..."
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || './analytics.db');
const result = db.prepare('SELECT 1').get();
console.log('数据库连接正常');
db.close();
" || exit 1

# 检查日志目录
echo "检查日志目录..."
[ -d "${LOG_PATH:-/var/log/analytics}" ] || exit 1

# 检查进程
echo "检查应用进程..."
pm2 describe analytics > /dev/null || exit 1

echo "✅ 部署验证完成"
```

### 健康检查脚本
```bash
#!/bin/bash
# health-check.sh

# 检查HTTP响应
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$HTTP_STATUS" != "200" ]; then
    echo "❌ 健康检查失败: HTTP $HTTP_STATUS"
    exit 1
fi

# 检查内存使用
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ "$MEMORY_USAGE" -gt 90 ]; then
    echo "⚠️  内存使用过高: ${MEMORY_USAGE}%"
fi

# 检查磁盘空间
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "⚠️  磁盘空间不足: ${DISK_USAGE}%"
fi

echo "✅ 系统健康检查通过"
```

## 检查清单总结

### 必需项目 (Critical)
- [ ] 所有环境变量已正确设置
- [ ] 数据库迁移已成功执行
- [ ] HTTPS已启用并配置
- [ ] 应用服务正常启动
- [ ] 健康检查端点返回正常
- [ ] 监控和告警已配置
- [ ] 备份策略已实施

### 推荐项目 (Recommended)
- [ ] 反向代理已配置
- [ ] 日志轮转已设置
- [ ] 性能监控已启用
- [ ] 错误追踪已配置
- [ ] 自动化部署已设置

### 可选项目 (Optional)
- [ ] 容器化部署
- [ ] 负载均衡配置
- [ ] CDN配置
- [ ] 多环境部署

---

**检查清单版本**: v1.0  
**最后更新**: 2025年9月27日  
**维护者**: 部署运维团队

**注意**: 请在每次部署时使用此检查清单，确保所有项目都已完成并验证。
