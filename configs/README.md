# 配置文件说明

本目录包含智能多Web应用门户系统V2版本的配置文件。

## 配置文件结构

### system.config.json
系统主配置文件，包含：
- 系统基本信息
- 服务器端口配置
- 数据库配置
- 功能开关

### development.env
开发环境变量配置：
- 端口：8002（后端）、3000（前端）
- 调试日志级别
- 开发专用JWT密钥
- 启用所有调试功能

### production.env
生产环境变量配置：
- 安全性增强
- 性能优化设置
- 禁用调试功能
- **重要**：必须修改JWT_SECRET

## 使用方法

### 开发环境
```bash
# 复制开发环境配置
cp configs/development.env detection-api/.env
```

### 生产环境
```bash
# 复制生产环境配置并修改敏感信息
cp configs/production.env detection-api/.env
# 编辑 detection-api/.env 修改JWT_SECRET等敏感配置
```

## 重要提醒

1. **JWT_SECRET**: 生产环境必须使用强密钥
2. **CORS_ORIGIN**: 生产环境必须设置正确的域名
3. **LOG_LEVEL**: 生产环境建议使用warn或error
4. **端口配置**: 所有配置已统一使用8002端口

## V2版本特性

- 基于Clean Architecture设计
- 统一配置管理
- 增强的安全性
- 更好的性能
