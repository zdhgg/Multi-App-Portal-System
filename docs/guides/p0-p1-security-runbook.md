# P0 + P1 安全加固运行手册

## 1) 生成生产密钥

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\management\generate-security-secrets.ps1
```

将输出值填入：

- `configs/production.env`
- `main-portal/.env.production`

关键要求：

- `PM2_CONFIRMATION_TOKEN` / `VITE_PM2_CONFIRM_TOKEN` 必须使用随机值，禁止保留默认 `CONFIRM`

## 2) 建议的生产安全开关

后端（`configs/production.env`）：

- `AUTH_ENFORCEMENT=on`
- `HELMET_ENABLED=true`
- `RATE_LIMIT_ENABLED=true`
- `WS_AUTH_REQUIRED=true`
- `WS_ALLOW_QUERY_TOKEN=false`
- `PM2_CONFIRMATION_REQUIRED=true`
- `ENABLE_PUBLIC_MONITORING=false`
- `ENABLE_PUBLIC_SYSTEM_ENDPOINTS=false`
- `ENABLE_V2_PUBLIC_ANONYMOUS=false`
- `ADMIN_MFA_REQUIRED=true`
- `ALLOW_WORKSPACE_PARENT=false`

前端（`main-portal/.env.production`）：

- `VITE_PUBLIC_API_ANONYMOUS=false`
- `VITE_PM2_CONFIRM_TOKEN=<与后端 PM2_CONFIRMATION_TOKEN 一致>`

## 3) 部署前检查

后端：

```powershell
npm --prefix detection-api run build:check
```

前端：

```powershell
npm --prefix main-portal run build
```

快速校验（应无输出）：

```powershell
rg -n "^PM2_CONFIRMATION_TOKEN=CONFIRM$|^VITE_PM2_CONFIRM_TOKEN=CONFIRM$" configs/production.env main-portal/.env.production
```
