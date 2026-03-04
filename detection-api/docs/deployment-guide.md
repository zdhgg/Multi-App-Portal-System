# 智能多Web应用门户系统 - 部署指南

## 📋 部署概述

本指南详细说明了智能多Web应用门户系统的部署流程，包括开发环境、测试环境和生产环境的配置。

## 🔧 环境要求

### 系统要求
- **操作系统**: Windows 10/11, macOS 10.15+, Ubuntu 18.04+
- **Node.js**: >= 18.0.0 (推荐 18.17.0 LTS)
- **npm**: >= 8.0.0 (推荐 9.0.0+)
- **内存**: 最低 4GB，推荐 8GB+
- **磁盘空间**: 最低 2GB 可用空间

### 依赖要求
- **数据库**: SQLite 3.x (自动创建)
- **构建工具**: 
  - Windows: Visual Studio Build Tools 2019+
  - macOS: Xcode Command Line Tools
  - Linux: build-essential, python3

## 📦 安装步骤

### 1. 获取源代码

```bash
# 克隆项目
git clone <repository-url>
cd intelligent-multi-app-portal-system

# 或者下载并解压源代码包
wget <release-url>
unzip intelligent-multi-app-portal-system-v1.1.0.zip
cd intelligent-multi-app-portal-system-v1.1.0
```

### 2. 安装后端依赖

```bash
cd detection-api
npm install

# 验证安装
npm run build
npm test
```

### 3. 安装前端依赖

```bash
cd ../main-portal
npm install

# 构建生产版本
npm run build
```

## ⚙️ 配置文件

### 后端配置 (.env)

在 `detection-api/` 目录下创建 `.env` 文件：

```env
# 服务配置
NODE_ENV=production
PORT=8000
HOST=0.0.0.0

# 数据库配置
DB_PATH=./data/portal.db
DB_BACKUP_ENABLED=true
DB_BACKUP_INTERVAL=24h

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/app.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# WebSocket 配置
WS_PORT=8001
WS_HEARTBEAT_INTERVAL=30000

# 安全配置
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com
API_RATE_LIMIT=1000
SESSION_SECRET=your-secret-key-here

# 智能命令注入配置
COMMAND_INJECTION_ENABLED=true
COMMAND_TIMEOUT=30000
MAX_CONCURRENT_COMMANDS=10

# 监控配置
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=60000
```

### 前端配置 (.env.production)

在 `main-portal/` 目录下创建 `.env.production` 文件：

```env
# API 服务地址
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com

# 应用配置
VITE_APP_TITLE=智能多Web应用门户系统
VITE_APP_VERSION=1.1.0
VITE_APP_DESCRIPTION=智能化的Web应用管理平台

# 功能开关
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
VITE_ENABLE_PERFORMANCE_MONITORING=true

# 主题配置
VITE_DEFAULT_THEME=light
VITE_THEME_COLOR=#1976d2
```

## 🚀 部署方式

### 方式1: PM2 部署（推荐）

#### 1. 安装 PM2

```bash
npm install -g pm2
```

#### 2. 创建 PM2 配置文件

在项目根目录创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: 'portal-api',
      script: './detection-api/dist/server.js',
      cwd: './detection-api',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    }
  ]
}
```

#### 3. 部署命令

```bash
# 构建项目
cd detection-api
npm run build

# 启动服务
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save
pm2 startup

# 监控服务
pm2 monit
```

### 方式2: 系统服务部署

#### 1. 创建 systemd 服务文件

`/etc/systemd/system/portal-api.service`:

```ini
[Unit]
Description=Portal API Service
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/portal/detection-api
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

#### 2. 启用服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用服务
sudo systemctl enable portal-api

# 启动服务
sudo systemctl start portal-api

# 查看状态
sudo systemctl status portal-api
```

## 🔒 安全配置

### 1. HTTPS 配置

#### Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # 前端静态文件
    location / {
        root /var/www/portal;
        try_files $uri $uri/ /index.html;
        
        # 缓存配置
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://localhost:8002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. 防火墙配置

```bash
# Ubuntu/Debian
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 📊 监控和日志

### 1. 日志配置

系统使用 Winston 进行日志管理，支持多种日志级别和输出格式。

**日志级别**:
- `error`: 错误信息
- `warn`: 警告信息
- `info`: 一般信息
- `debug`: 调试信息

**日志文件**:
- `logs/error.log`: 错误日志
- `logs/combined.log`: 综合日志
- `logs/access.log`: 访问日志

### 2. 健康检查

系统提供健康检查端点：

```bash
# 基础健康检查
curl http://localhost:8000/health

# 详细健康检查
curl http://localhost:8000/health/detailed
```

响应示例：
```json
{
  "status": "healthy",
  "timestamp": "2025-01-19T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.1.0",
  "services": {
    "database": "healthy",
    "websocket": "healthy",
    "commandInjection": "healthy"
  },
  "metrics": {
    "memoryUsage": "45.2MB",
    "cpuUsage": "2.1%",
    "activeConnections": 12,
    "totalRequests": 1543
  }
}
```

### 3. 性能监控

使用 PM2 监控应用性能：

```bash
# 实时监控
pm2 monit

# 查看日志
pm2 logs portal-api

# 重启应用
pm2 restart portal-api

# 查看详细信息
pm2 show portal-api
```

## 🔄 备份和恢复

### 1. 数据备份

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/backups/portal"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/portal/detection-api/data/portal.db $BACKUP_DIR/portal_$DATE.db

# 备份配置文件
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
  /opt/portal/detection-api/.env \
  /opt/portal/main-portal/.env.production

# 清理旧备份（保留30天）
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 2. 自动备份

添加到 crontab：

```bash
# 每天凌晨2点备份
0 2 * * * /opt/scripts/backup.sh >> /var/log/portal-backup.log 2>&1
```

## 🚨 故障排除

### 常见问题

1. **端口占用**
   ```bash
   # 查看端口占用
   netstat -tulpn | grep :8000
   lsof -i :8000
   
   # 杀死占用进程
   kill -9 <PID>
   ```

2. **权限问题**
   ```bash
   # 设置正确权限
   sudo chown -R nodejs:nodejs /opt/portal
   sudo chmod -R 755 /opt/portal
   ```

3. **内存不足**
   ```bash
   # 增加 Node.js 内存限制
   node --max-old-space-size=2048 dist/server.js
   ```

4. **数据库锁定**
   ```bash
   # 检查数据库状态
   sqlite3 data/portal.db ".timeout 5000"
   ```

### 日志分析

```bash
# 查看错误日志
tail -f logs/error.log

# 搜索特定错误
grep "ERROR" logs/combined.log | tail -20

# 分析访问模式
awk '{print $1}' logs/access.log | sort | uniq -c | sort -nr
```

## 📈 性能优化

### 1. Node.js 优化

```bash
# 启动参数优化
node --max-old-space-size=1024 \
     --optimize-for-size \
     --gc-interval=100 \
     dist/server.js
```

### 2. 数据库优化

```sql
-- SQLite 优化设置
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;
```

### 3. 缓存配置

在 Nginx 中配置缓存：

```nginx
# 静态资源缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Vary Accept-Encoding;
    gzip_static on;
}

# API 响应缓存
location /api/apps {
    proxy_pass http://localhost:8000;
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
}
```

## 🔗 相关文档

- [API 文档](./api-documentation.md)
- [性能测试报告](./performance-test-report.md)
- [技术栈支持文档](./tech-stack-support.md)
