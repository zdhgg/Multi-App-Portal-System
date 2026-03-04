# 批量扫描使用指南

## 🎯 快速开始

### 基本用法

1. **打开应用检测页面**
   - 导航到 `应用检测` 模块
   - 进入 `扫描路径配置` 步骤

2. **选择扫描模式**
   ```
   🎯 单个目录     → 深度扫描单个项目（深度5-10层）
   📁 多个目录     → 批量扫描独立项目（深度3-5层，3并发）
   🗂️ 工作区扫描   → 扫描整个开发环境（深度2-3层，5并发）
   ```

3. **添加扫描路径**
   - 点击"添加路径"按钮
   - 选择文件夹或手动输入路径
   - 配置扫描深度和排除模式

4. **配置检测策略**
   - 选择预设模式（性能优先/精确检测/平衡模式）
   - 或自定义并发数和内存限制

5. **开始扫描**
   - 点击"开始智能检测"
   - 系统自动选择最优扫描方式

---

## 📚 详细说明

### 一、三种扫描模式对比

#### 🎯 单个目录模式

**适用场景**:
- 深度分析单个复杂项目
- 需要详细的依赖关系图
- 全栈项目的完整扫描

**特点**:
- **扫描深度**: 5-10层（可自定义）
- **并发数**: 1个（顺序扫描）
- **速度**: 较慢，但结果最详细
- **资源占用**: 低

**示例**:
```
扫描路径: D:\Projects\MyFullStackApp
扫描深度: 8层
预计耗时: 2-3分钟
发现项目: 1个（包含前端+后端）
```

#### 📁 多个目录模式

**适用场景**:
- 批量扫描多个独立项目
- 快速发现所有可用应用
- 定期项目清单更新

**特点**:
- **扫描深度**: 3-5层（推荐4层）
- **并发数**: 3个（并行扫描）
- **速度**: 中等，平衡效率和准确性
- **资源占用**: 中等

**示例**:
```
扫描路径: 
  - D:\Projects\ReactApp1
  - D:\Projects\ReactApp2
  - D:\Projects\VueApp
  - D:\Projects\NodeBackend
扫描深度: 4层
预计耗时: 1.5-2分钟
发现项目: 4个
```

**优势**:
- ✅ 70-80%速度提升（vs 单个目录循环）
- ✅ 自动错误容错（单个失败不影响整体）
- ✅ 实时进度反馈

#### 🗂️ 工作区扫描模式

**适用场景**:
- 扫描整个开发目录
- 首次使用系统时发现所有项目
- 定期全面检查

**特点**:
- **扫描深度**: 2-3层（智能过滤）
- **并发数**: 5个（高并发）
- **速度**: 最快
- **资源占用**: 较高

**示例**:
```
扫描路径: D:\Projects (包含20个子项目)
扫描深度: 3层
自动排除: node_modules, .git, dist, backups
预计耗时: 3-5分钟
发现项目: 15个（自动过滤5个备份/无效目录）
```

**智能特性** (计划中):
- 🔍 自动发现package.json、pom.xml等项目标识
- 🚫 智能排除备份、缓存、构建目录
- 🔗 分析项目间依赖关系

---

### 二、API使用示例

#### 后端API调用

**启动批量扫描**:
```bash
curl -X POST http://localhost:3000/api/v2/detection/batch-scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "paths": [
      "D:/Projects/App1",
      "D:/Projects/App2",
      "D:/Projects/App3"
    ],
    "mode": "multiple",
    "maxConcurrency": 3,
    "commonConfig": {
      "maxDepth": 4,
      "excludePatterns": ["node_modules", ".git", "dist"],
      "timeoutMs": 60000
    }
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "batchId": "batch-uuid-xxxx",
    "sessionIds": ["session-1", "session-2", "session-3"],
    "mode": "multiple",
    "totalPaths": 3
  },
  "message": "批量扫描已启动，共 3 个路径"
}
```

**查询批次状态**:
```bash
curl http://localhost:3000/api/v2/detection/batch/batch-uuid-xxxx \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "batch-uuid-xxxx",
    "mode": "multiple",
    "sessionIds": ["session-1", "session-2", "session-3"],
    "totalPaths": 3,
    "status": "running",
    "summary": {
      "completedSessions": 2,
      "failedSessions": 0,
      "totalProjectsFound": 5
    }
  }
}
```

#### 前端集成示例

```typescript
// 使用批量扫描
const startBatchScan = async () => {
  const response = await fetch('/api/v2/detection/batch-scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      paths: selectedPaths,
      mode: 'multiple',
      maxConcurrency: 3,
      commonConfig: {
        maxDepth: 4,
        excludePatterns: ['node_modules', '.git']
      }
    })
  })

  const { batchId, sessionIds } = await response.json()

  // 轮询批次状态
  const pollStatus = setInterval(async () => {
    const statusRes = await fetch(`/api/v2/detection/batch/${batchId}`)
    const batch = await statusRes.json()

    if (batch.status === 'completed' || batch.status === 'failed') {
      clearInterval(pollStatus)
      // 处理结果
      handleBatchComplete(batch)
    }
  }, 5000)
}
```

---

### 三、最佳实践

#### ✅ 推荐做法

1. **合理设置扫描深度**
   - 小型项目: 6-8层
   - 中型项目: 4-5层
   - 大型工作区: 2-3层

2. **配置排除模式**
   ```javascript
   excludePatterns: [
     'node_modules',  // Node.js依赖
     '.git',          // Git版本控制
     'dist',          // 构建输出
     'build',         // 构建目录
     '.next',         // Next.js缓存
     'coverage',      // 测试覆盖率
     'backups',       // 备份目录
     'tmp'            // 临时文件
   ]
   ```

3. **根据时段选择并发数**
   - 高峰时段: 2-3并发
   - 空闲时段: 5-10并发

4. **定期清理扫描历史**
   - 保留近7天的扫描记录
   - 导出重要扫描结果

#### ❌ 避免的错误

1. **扫描系统目录**
   ```
   ❌ C:\Windows
   ❌ C:\Program Files
   ✅ D:\Projects
   ```

2. **过深的扫描深度**
   ```
   ❌ maxDepth: 15  (扫描时间过长)
   ✅ maxDepth: 4-6 (平衡速度和准确性)
   ```

3. **同时扫描过多路径**
   ```
   ❌ paths: [50个路径]  (资源耗尽)
   ✅ paths: [5-10个路径] (分批扫描)
   ```

---

### 四、故障排除

#### 问题1: 扫描超时

**症状**: 批次状态一直为"running"，超过5分钟未完成

**原因**:
- 路径过大，文件数量过多
- 扫描深度设置过高
- 网络或后端服务不稳定

**解决方案**:
1. 减小扫描深度 (从6改为4)
2. 添加更多排除模式
3. 分批扫描大型目录
4. 检查后端服务日志

#### 问题2: 发现项目数量为0

**症状**: 扫描完成但未发现任何项目

**原因**:
- 路径不包含有效项目
- 排除模式过于严格
- 项目类型不被识别

**解决方案**:
1. 确认路径包含package.json等项目文件
2. 检查excludePatterns配置
3. 增加扫描深度
4. 查看详细日志分析原因

#### 问题3: 部分路径扫描失败

**症状**: summary显示failedSessions > 0

**原因**:
- 路径不存在或无访问权限
- 路径格式错误（Windows路径使用反斜杠）
- 后端服务资源不足

**解决方案**:
1. 验证路径是否存在
2. 统一使用正斜杠 (D:/Projects)
3. 检查后端资源使用情况
4. 查看失败会话的详细错误信息

---

### 五、性能优化建议

#### 针对不同规模的扫描

**小规模 (1-3个项目)**:
```json
{
  "mode": "single",
  "maxConcurrency": 1,
  "commonConfig": {
    "maxDepth": 6,
    "timeoutMs": 30000
  }
}
```

**中等规模 (5-10个项目)**:
```json
{
  "mode": "multiple",
  "maxConcurrency": 3,
  "commonConfig": {
    "maxDepth": 4,
    "timeoutMs": 60000
  }
}
```

**大规模 (10+个项目)**:
```json
{
  "mode": "workspace",
  "maxConcurrency": 5,
  "commonConfig": {
    "maxDepth": 3,
    "timeoutMs": 120000
  }
}
```

#### 资源占用估算

| 并发数 | 内存占用 | CPU占用 | 适用场景 |
|--------|----------|---------|----------|
| 1      | ~200MB   | 20-30%  | 低配置机器 |
| 3      | ~500MB   | 40-60%  | 一般开发机 |
| 5      | ~800MB   | 60-80%  | 高配置机器 |
| 10     | ~1.5GB   | 80-100% | 服务器环境 |

---

### 六、后续功能预告

#### v1.2.0 - 工作区智能扫描

- 🔍 自动发现子项目（无需手动添加路径）
- 🚫 智能过滤备份和无关目录
- 🔗 项目依赖关系可视化
- 📊 扫描性能分析报告

#### v1.3.0 - 高级扫描特性

- ⏸️ 断点续扫（暂停/恢复）
- 📈 增量扫描（只扫描变更）
- 📜 扫描历史对比
- 🤖 AI辅助项目分类

---

## 🙋 常见问题

**Q: 批量扫描会影响其他功能吗？**  
A: 不会。批量扫描在后台异步执行，不阻塞UI和其他操作。

**Q: 可以同时运行多个批次扫描吗？**  
A: 可以，但建议一次只运行一个批次以保证性能。

**Q: 扫描结果会保存多久？**  
A: 默认保存30天，可在设置中调整。

**Q: 支持远程路径吗？**  
A: 当前仅支持本地路径，网络路径支持计划在v1.2.0中添加。

---

## 📞 获取帮助

- 📖 查看完整文档: `/docs`
- 🐛 报告问题: GitHub Issues
- 💬 社区讨论: Discord/Slack

**文档版本**: v1.1.0  
**最后更新**: 2025年09月30日
