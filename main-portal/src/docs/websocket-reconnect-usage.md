# WebSocket重连优化使用指南

## 概述

优化后的WebSocket重连逻辑实现了以下特性：
- ✅ **指数退避算法**：重连延迟随次数指数增长
- ✅ **随机抖动（Jitter）**：避免多个客户端同时重连
- ✅ **最大重连次数限制**：防止无限重连
- ✅ **连接状态可视化**：实时显示连接状态和重连进度
- ✅ **重连事件通知**：支持自定义重连回调

---

## 使用方法

### 1. 基础使用

```typescript
import { useWebSocket } from '@/composables/useWebSocket'

const {
  isConnected,
  isConnecting,
  error,
  reconnectAttempts,
  nextReconnectDelay,
  connect,
  disconnect,
  sendMessage
} = useWebSocket()

// 连接WebSocket
connect({
  onConnect: () => {
    console.log('连接成功')
  },
  onDisconnect: () => {
    console.log('连接断开')
  },
  onMessage: (message) => {
    console.log('收到消息:', message)
  },
  onReconnecting: (attempt, delay) => {
    console.log(`正在重连 (${attempt}次)，延迟 ${delay}ms`)
  }
})
```

### 2. 自定义重连配置

```typescript
connect({
  // 启用自动重连（默认：true）
  reconnect: true,
  
  // 基础重连间隔（默认：3000ms）
  reconnectInterval: 5000,
  
  // 最大重连次数（默认：10）
  maxReconnectAttempts: 15,
  
  // 指数退避倍数（默认：2）
  reconnectBackoffMultiplier: 1.5,
  
  // 最大重连间隔（默认：30000ms）
  maxReconnectInterval: 60000,
  
  // 启用随机抖动（默认：true）
  enableJitter: true,
  
  // 事件回调
  onReconnecting: (attempt, delay) => {
    console.log(`第${attempt}次重连，延迟${delay}ms`)
  }
})
```

### 3. 使用状态可视化组件

```vue
<template>
  <div>
    <!-- 简洁模式 -->
    <WebSocketStatus
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :error="error"
      :reconnect-attempts="reconnectAttempts"
      :next-reconnect-delay="nextReconnectDelay"
      @reconnect="handleReconnect"
      @disconnect="handleDisconnect"
    />
    
    <!-- 完整模式（带详情按钮） -->
    <WebSocketStatus
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :error="error"
      :reconnect-attempts="reconnectAttempts"
      :next-reconnect-delay="nextReconnectDelay"
      :ws-url="wsUrl"
      :show-label="true"
      :show-details-button="true"
      @reconnect="handleReconnect"
      @disconnect="handleDisconnect"
    />
  </div>
</template>

<script setup lang="ts">
import { useWebSocket } from '@/composables/useWebSocket'
import WebSocketStatus from '@/components/WebSocketStatus.vue'

const {
  isConnected,
  isConnecting,
  error,
  reconnectAttempts,
  nextReconnectDelay,
  connect,
  disconnect,
  reconnect
} = useWebSocket()

const handleReconnect = () => {
  reconnect()
}

const handleDisconnect = () => {
  disconnect()
}
</script>
```

---

## 重连策略详解

### 指数退避算法

重连延迟按照以下公式计算：

```
delay = baseInterval × (backoffMultiplier ^ (attempt - 1))
```

**示例**（baseInterval=3000ms, backoffMultiplier=2）：

| 重连次数 | 计算公式 | 延迟时间 |
|---------|---------|---------|
| 1 | 3000 × 2^0 | 3秒 |
| 2 | 3000 × 2^1 | 6秒 |
| 3 | 3000 × 2^2 | 12秒 |
| 4 | 3000 × 2^3 | 24秒 |
| 5 | 3000 × 2^4 | 30秒（达到上限） |
| 6+ | 限制为maxInterval | 30秒 |

### 随机抖动（Jitter）

为了避免多个客户端同时断线后同时重连（雷鸣群效应），在延迟基础上添加±25%的随机抖动：

```
jitter = delay × 0.25 × (random(-1, 1))
finalDelay = delay + jitter
```

**示例**（delay=12000ms）：
- 最小延迟：9000ms（12000 - 3000）
- 最大延迟：15000ms（12000 + 3000）
- 实际延迟：在9000-15000ms之间随机

### 最大重连次数

达到最大重连次数后，停止自动重连，用户可以：
1. 手动点击"重连"按钮
2. 刷新页面
3. 等待网络恢复后自动重连

---

## 配置建议

### 场景1：内网环境（稳定网络）

```typescript
{
  reconnectInterval: 2000,        // 2秒
  maxReconnectAttempts: 5,        // 5次
  reconnectBackoffMultiplier: 1.5,// 较小的倍数
  maxReconnectInterval: 10000,    // 10秒
  enableJitter: false             // 内网可禁用抖动
}
```

### 场景2：公网环境（不稳定网络）

```typescript
{
  reconnectInterval: 5000,        // 5秒
  maxReconnectAttempts: 15,       // 15次
  reconnectBackoffMultiplier: 2,  // 标准倍数
  maxReconnectInterval: 60000,    // 60秒
  enableJitter: true              // 启用抖动
}
```

### 场景3：移动网络（频繁切换）

```typescript
{
  reconnectInterval: 3000,        // 3秒
  maxReconnectAttempts: 20,       // 20次
  reconnectBackoffMultiplier: 1.5,// 较小的倍数
  maxReconnectInterval: 30000,    // 30秒
  enableJitter: true              // 启用抖动
}
```

---

## 事件监听

### onReconnecting 回调

在每次重连尝试前触发：

```typescript
connect({
  onReconnecting: (attempt, delay) => {
    // 显示通知
    ElNotification({
      title: '连接断开',
      message: `正在尝试重连 (${attempt}次)，${delay}ms后重试`,
      type: 'warning',
      duration: delay
    })
    
    // 记录日志
    console.log(`[WebSocket] 重连尝试 ${attempt}，延迟 ${delay}ms`)
    
    // 更新UI状态
    updateConnectionStatus('reconnecting', attempt, delay)
  }
})
```

### 完整事件示例

```typescript
connect({
  onConnect: () => {
    ElMessage.success('WebSocket连接成功')
    // 订阅数据
    subscribePortal()
  },
  
  onDisconnect: () => {
    ElMessage.warning('WebSocket连接断开')
    // 清理订阅
    unsubscribeAll()
  },
  
  onMessage: (message) => {
    // 处理消息
    handleMessage(message)
  },
  
  onError: (error) => {
    console.error('WebSocket错误:', error)
  },
  
  onReconnecting: (attempt, delay) => {
    if (attempt === 1) {
      ElNotification({
        title: '连接断开',
        message: '正在尝试重新连接...',
        type: 'warning'
      })
    }
  }
})
```

---

## 状态管理

### 响应式状态

```typescript
const {
  isConnected,        // 是否已连接
  isConnecting,       // 是否正在连接
  error,              // 错误信息
  reconnectAttempts,  // 当前重连次数
  nextReconnectDelay  // 下次重连延迟（ms）
} = useWebSocket()

// 监听状态变化
watch(isConnected, (connected) => {
  if (connected) {
    console.log('连接已建立')
  } else {
    console.log('连接已断开')
  }
})

watch(reconnectAttempts, (attempts) => {
  console.log(`重连次数: ${attempts}`)
})
```

### 计算属性

```typescript
// 是否正在重连
const isReconnecting = computed(() => {
  return !isConnected.value && 
         !isConnecting.value && 
         reconnectAttempts.value > 0
})

// 重连进度百分比
const reconnectProgress = computed(() => {
  const maxAttempts = 10
  return Math.round((reconnectAttempts.value / maxAttempts) * 100)
})

// 连接状态文本
const statusText = computed(() => {
  if (isConnected.value) return '已连接'
  if (isConnecting.value) return '连接中'
  if (isReconnecting.value) return '重连中'
  return '未连接'
})
```

---

## 最佳实践

### 1. 连接生命周期管理

```typescript
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  // 组件挂载时连接
  connect()
})

onUnmounted(() => {
  // 组件卸载时断开（自动处理）
  // useWebSocket内部已实现onUnmounted钩子
})
```

### 2. 手动重连

```typescript
// 提供手动重连按钮
const handleManualReconnect = () => {
  // 重置重连计数并重新连接
  reconnect()
}
```

### 3. 网络状态监听

```typescript
// 监听网络状态变化
window.addEventListener('online', () => {
  console.log('网络已恢复')
  if (!isConnected.value) {
    reconnect()
  }
})

window.addEventListener('offline', () => {
  console.log('网络已断开')
  disconnect()
})
```

### 4. 心跳保活

```typescript
let heartbeatTimer: number | null = null

watch(isConnected, (connected) => {
  if (connected) {
    // 启动心跳
    heartbeatTimer = window.setInterval(() => {
      ping()
    }, 30000) // 每30秒发送一次心跳
  } else {
    // 停止心跳
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }
})
```

---

## 故障排查

### 问题1：重连次数过多

**原因**：服务器不可用或网络问题  
**解决**：
- 检查服务器状态
- 增加`maxReconnectAttempts`
- 增加`maxReconnectInterval`

### 问题2：重连延迟过长

**原因**：指数退避导致延迟过大  
**解决**：
- 减小`reconnectBackoffMultiplier`
- 减小`maxReconnectInterval`
- 提供手动重连按钮

### 问题3：多个客户端同时重连

**原因**：未启用随机抖动  
**解决**：
- 设置`enableJitter: true`
- 增加抖动范围（修改源码）

---

## 测试

运行测试：

```bash
npm run test:run -- websocket-reconnect.test.ts
```

测试覆盖：
- ✅ 指数退避算法计算
- ✅ 随机抖动范围验证
- ✅ 最大重连次数限制
- ✅ 重连延迟计算
- ✅ 配置选项验证
- ✅ 事件回调触发
- ✅ 边界条件处理

---

## 更新日志

### v1.1.0 (2026-03-23)

**新增**：
- ✅ 指数退避算法
- ✅ 随机抖动（Jitter）
- ✅ 重连事件通知
- ✅ 连接状态可视化组件
- ✅ 响应式重连状态

**优化**：
- ✅ 最大重连次数从5次增加到10次
- ✅ 最大重连间隔限制为30秒
- ✅ 重连计数改为响应式

**修复**：
- ✅ 手动重连不重置计数的问题
- ✅ 连接成功后未清除重连状态的问题
