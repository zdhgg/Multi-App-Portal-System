# SSL 协议错误问题解决方案

## 📋 问题描述

**应用名称：** training-system-v3.2  
**启动方式：** PM2 生产模式  
**错误信息：** `ERR_SSL_PROTOCOL_ERROR`

### 错误详情

浏览器控制台显示以下错误：
```
vendor-ui-BDQ_Ga6c.css:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
index-50i3S3zm.css:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
index-C7iXFWbb.js:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
chunk-8jeYkg-S.js:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
chunk-CR9OXOsB.js:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
:8051/default-avatar.svg:1  Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR
```

## 🔍 根本原因分析

### 问题根源

1. **资源路径问题**：应用构建后的 HTML 文件中，所有静态资源（CSS、JS、图片）使用了**绝对路径**（以 `/` 开头）

   ```html
   <!-- 修复前 -->
   <script src="/assets/index-C7iXFWbb.js"></script>
   <link rel="stylesheet" href="/assets/vendor-ui-BDQ_Ga6c.css">
   ```

2. **浏览器协议升级**：某些浏览器会自动将 HTTP 请求升级为 HTTPS（基于以下原因）：
   - HSTS（HTTP Strict Transport Security）缓存
   - 浏览器安全策略自动升级
   - 之前访问过该域名的 HTTPS 版本

3. **协议不匹配**：应用实际只支持 HTTP（端口 8051），但浏览器尝试用 HTTPS 加载资源，导致 `ERR_SSL_PROTOCOL_ERROR`

### 为什么会影响 PM2 生产模式？

PM2 生产模式使用的是**构建后的静态文件**（`frontend/dist`），而开发模式使用的是 Vite 开发服务器。构建配置的问题在生产环境才会暴露。

## ✅ 解决方案

### 修改内容

修改了 `training-system-v3.2/frontend/vite.config.ts` 两处配置：

#### 1. 添加 `base` 配置

```typescript
export default defineConfig(({ command, mode }) => {
  // ...
  return {
    // 🔧 使用相对路径，避免 HTTPS 协议错误
    base: './',
    plugins: [
      // ...
    ],
    // ...
  }
})
```

#### 2. 修改 `renderBuiltUrl` 配置

```typescript
experimental: {
  renderBuiltUrl: (filename: string) => {
    // 🔧 修复：使用相对路径，避免 HTTPS 协议错误
    return `./${filename}`;  // 原来是 `/${filename}`
  },
}
```

### 修复效果

修复后的 HTML 使用**相对路径**：

```html
<!-- 修复后 -->
<script src="./assets/index-CvpahslK.js"></script>
<link rel="stylesheet" href="./assets/vendor-ui-BDQ_Ga6c.css">
<link rel="icon" href="./default-avatar.svg">
```

## 📝 执行步骤

### 1. 修改配置文件 ✅

- 文件：`D:\My Programs\training-system-v3.2\frontend\vite.config.ts`
- 修改时间：2025-10-28 23:14

### 2. 重新构建应用 ✅

```powershell
cd "D:\My Programs\training-system-v3.2\frontend"
npm run build
```

构建结果：
- ✅ 成功生成 `dist` 目录
- ✅ 所有资源使用相对路径
- ⚠️ 部分 chunk 文件较大（正常，不影响功能）

### 3. 重启 PM2 应用 ✅

```powershell
pm2 restart training-system-v3.2
```

重启结果：
- ✅ 进程 ID: 7844
- ✅ 状态: online
- ✅ 内存使用: ~72MB
- ✅ 重启次数: 1

## 🧪 验证步骤

请按以下步骤验证修复是否成功：

### 1. 清除浏览器缓存（重要！）

- **Chrome**: `Ctrl + Shift + Delete` → 选择"缓存的图片和文件"
- 或使用**硬刷新**: `Ctrl + F5`
- 或使用**隐私模式/无痕模式**访问

### 2. 重新访问应用

访问地址：`http://192.168.101.7:8051`（或通过门户系统访问）

### 3. 检查项

- ✅ 页面正常加载，无白屏
- ✅ CSS 样式正确显示
- ✅ JavaScript 功能正常
- ✅ 浏览器控制台无 SSL 错误
- ✅ 网络面板中资源请求成功（状态码 200）

### 4. 检查资源加载路径

打开浏览器开发者工具（F12）→ Network 标签页，验证资源路径：

**正确示例：**
```
http://192.168.101.7:8051/assets/index-CvpahslK.js  ✅
http://192.168.101.7:8051/assets/vendor-ui-BDQ_Ga6c.css  ✅
```

**错误示例（不应再出现）：**
```
https://192.168.101.7:8051/assets/index-CvpahslK.js  ❌
```

## 📊 技术对比

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| 资源路径 | `/assets/...` (绝对路径) | `./assets/...` (相对路径) |
| 浏览器行为 | 可能升级为 HTTPS | 继承当前页面协议 |
| 跨协议问题 | ❌ 会发生 | ✅ 不会发生 |
| 兼容性 | 依赖浏览器策略 | 所有浏览器通用 |
| 部署灵活性 | 需要固定域名 | 支持任意路径部署 |

## 🔧 其他可选方案

如果上述修复不起作用，可以尝试以下替代方案：

### 方案 1：清除 HSTS 缓存

**Chrome 浏览器：**
1. 地址栏输入：`chrome://net-internals/#hsts`
2. 在 "Delete domain security policies" 输入：`192.168.101.7`
3. 点击 "Delete"
4. 刷新页面

**Edge 浏览器：**
1. 地址栏输入：`edge://net-internals/#hsts`
2. 同上操作

### 方案 2：使用隐私模式

使用浏览器的隐私/无痕模式访问，避免 HSTS 和缓存干扰。

### 方案 3：配置 HTTPS（生产环境推荐）

如果是正式生产环境，建议配置真正的 HTTPS：

1. 获取 SSL 证书（Let's Encrypt 免费）
2. 在 Express 后端配置 HTTPS
3. 修改端口为 443 或 8443

## 📚 技术说明

### 绝对路径 vs 相对路径

**绝对路径（`/assets/...`）：**
- 从域名根路径加载
- 浏览器会使用页面的协议+域名
- 示例：`http://192.168.101.7:8051/assets/index.js`

**相对路径（`./assets/...`）：**
- 从当前 HTML 文件的相对位置加载
- 自动继承当前页面的完整 URL
- 示例：如果 HTML 在 `http://192.168.101.7:8051/`，则资源为 `http://192.168.101.7:8051/assets/index.js`

### Vite 配置说明

```typescript
{
  // base: 资源的基础路径
  // './' = 相对路径（推荐，兼容性最好）
  // '/'  = 绝对路径（默认）
  // '/app/' = 子路径部署
  base: './',

  // experimental.renderBuiltUrl: 自定义资源 URL 生成
  experimental: {
    renderBuiltUrl: (filename) => `./${filename}`
  }
}
```

## 🎯 预防措施

为避免将来出现类似问题，建议：

### 1. 所有 Vite 项目使用相对路径

在 `vite.config.ts` 中始终设置：
```typescript
export default defineConfig({
  base: './',
  // ...
})
```

### 2. 构建后验证

每次构建后检查 `dist/index.html`，确保资源路径正确：
```bash
cat dist/index.html | grep -E "(href|src)="
```

### 3. 环境变量配置

使用环境变量区分开发/生产配置：
```typescript
base: process.env.NODE_ENV === 'production' ? './' : '/',
```

## 📞 支持信息

- **修复日期：** 2025-10-28
- **修复版本：** training-system-v3.2
- **PM2 进程 ID：** 0
- **应用端口：** 8051（后端），3051（前端，已废弃）

## ✅ 修复确认清单

- [x] 修改 vite.config.ts 配置
- [x] 重新构建前端应用
- [x] 验证构建产物使用相对路径
- [x] 重启 PM2 进程
- [ ] 清除浏览器缓存
- [ ] 重新访问应用验证
- [ ] 检查浏览器控制台无错误
- [ ] 测试所有功能正常

---

**注意：** 请务必清除浏览器缓存或使用硬刷新（Ctrl+F5），否则可能仍会看到旧的缓存资源。

