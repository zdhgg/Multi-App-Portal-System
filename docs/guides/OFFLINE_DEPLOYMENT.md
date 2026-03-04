# 离线部署指南

## 内网电脑必备软件
1. Node.js v18+ (推荐 v22.x)
   - 安装包：请从本目录的 installers 文件夹获取
   - 或从 https://nodejs.org 下载

2. PM2（Node.js 安装后执行）
   - 在本目录执行: npm install -g pm2

## 部署步骤

### 方法一：使用一键启动脚本（推荐）
1. 解压本文件夹到任意位置
2. 打开 PowerShell，进入项目目录
3. 执行: .\start-production.ps1
4. 浏览器访问: http://localhost:8002

### 方法二：手动启动
1. 解压本文件夹
2. 打开 PowerShell
3. cd 到项目目录
4. 执行: pm2 start ecosystem-prod-tsx.config.js --env production
5. 查看状态: pm2 status

## 验证安装

运行以下命令检查环境：
```powershell
# 检查 Node.js
node --version  # 应该显示 v18+ 或更高

# 检查 npm
npm --version

# 检查 PM2
pm2 --version
```

## 常用命令

- 查看状态: pm2 status
- 查看日志: pm2 logs portal-api
- 重启服务: pm2 restart portal-api
- 停止服务: pm2 stop portal-api

## 故障排查

1. 端口被占用
   - 检查 8001 端口: netstat -ano | findstr :8001
   - 修改端口: 编辑 ecosystem-prod-tsx.config.js

2. 服务启动失败
   - 查看日志: pm2 logs portal-api --lines 50
   - 检查依赖: 确保 node_modules 文件夹完整

3. 页面无法访问
   - 检查防火墙设置
   - 确认服务已启动: pm2 status

## 技术支持

项目版本: v1.0.0
生成时间: 2025-11-10 11:21:31
