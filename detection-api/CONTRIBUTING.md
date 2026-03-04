# 开发者贡献指南

感谢您对智能多应用端口管理系统的关注！我们欢迎所有形式的贡献，包括但不限于代码提交、问题报告、功能建议、文档改进等。

## 🤝 贡献方式

### 代码贡献
- 修复Bug
- 新功能开发
- 性能优化
- 代码重构
- 测试用例编写

### 非代码贡献
- 文档改进
- 问题报告
- 功能建议
- 用户体验反馈
- 翻译工作

## 📋 开发环境设置

### 前置要求

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Git**: 最新版本
- **编辑器**: 推荐 VS Code

### 环境配置

1. **Fork 项目**
   ```bash
   # 在 GitHub 上 Fork 项目到您的账户
   # 然后克隆您的 Fork
   git clone https://github.com/YOUR_USERNAME/intelligent-port-management.git
   cd intelligent-port-management/detection-api
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置开发环境**
   ```bash
   # 复制环境配置文件
   cp .env.example .env.development
   
   # 编辑配置文件
   nano .env.development
   ```

4. **初始化数据库**
   ```bash
   # 运行数据库迁移
   node scripts/database-migration.js ./test.db --verbose
   ```

5. **运行测试**
   ```bash
   # 确保所有测试通过
   npm test
   ```

6. **启动开发服务器**
   ```bash
   npm run dev
   ```

## 🔄 开发流程

### 1. 创建功能分支

```bash
# 从主分支创建新的功能分支
git checkout main
git pull origin main
git checkout -b feature/your-feature-name

# 或者修复Bug
git checkout -b fix/bug-description
```

### 2. 分支命名规范

- **功能开发**: `feature/feature-name`
- **Bug修复**: `fix/bug-description`
- **文档更新**: `docs/update-description`
- **性能优化**: `perf/optimization-description`
- **重构代码**: `refactor/refactor-description`
- **测试相关**: `test/test-description`

### 3. 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
# 功能添加
git commit -m "feat: add advanced analytics caching mechanism"

# Bug修复
git commit -m "fix: resolve memory leak in analysis engine"

# 文档更新
git commit -m "docs: update API documentation for new endpoints"

# 性能优化
git commit -m "perf: optimize database query performance"

# 重构
git commit -m "refactor: restructure analytics module architecture"

# 测试
git commit -m "test: add unit tests for port conflict resolver"
```

**提交类型说明**：
- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

## 🧪 测试要求

### 测试类型

1. **单元测试**: 测试单个函数或类
2. **集成测试**: 测试组件间的交互
3. **性能测试**: 验证性能指标
4. **端到端测试**: 完整功能流程测试

### 测试命令

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- src/tests/AdvancedAnalytics.test.ts

# 运行性能测试
npm run test:performance

# 生成测试覆盖率报告
npm run test:coverage

# 监视模式运行测试
npm run test:watch
```

### 测试要求

- **新功能必须包含测试用例**
- **测试覆盖率不低于90%**
- **所有测试必须通过**
- **性能测试必须满足指标要求**

### 编写测试示例

```typescript
// src/tests/YourFeature.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YourFeature } from '../services/YourFeature';

describe('YourFeature', () => {
  let feature: YourFeature;

  beforeEach(async () => {
    feature = new YourFeature();
    await feature.initialize();
  });

  afterEach(async () => {
    await feature.cleanup();
  });

  it('should perform expected functionality', async () => {
    // Arrange
    const input = { test: 'data' };
    
    // Act
    const result = await feature.process(input);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle error cases gracefully', async () => {
    // Test error handling
    await expect(feature.process(null)).rejects.toThrow();
  });
});
```

## 📝 代码规范

### TypeScript 规范

1. **类型安全**
   ```typescript
   // 好的做法
   interface UserData {
     id: string;
     name: string;
     email: string;
   }
   
   function processUser(user: UserData): Promise<void> {
     // 实现
   }
   
   // 避免使用 any
   // 不好的做法
   function processUser(user: any): Promise<any> {
     // 实现
   }
   ```

2. **命名规范**
   ```typescript
   // 类名使用 PascalCase
   class AdvancedAnalytics {}
   
   // 函数和变量使用 camelCase
   const analysisResult = await performAnalysis();
   
   // 常量使用 UPPER_SNAKE_CASE
   const MAX_RETRY_ATTEMPTS = 3;
   
   // 接口使用 I 前缀或描述性名称
   interface IAnalysisEngine {}
   interface AnalysisConfig {}
   ```

3. **函数设计**
   ```typescript
   // 函数应该单一职责
   async function validatePortRequest(request: PortRequest): Promise<boolean> {
     // 只负责验证
   }
   
   async function allocatePort(request: PortRequest): Promise<PortResult> {
     // 只负责分配
   }
   ```

### 代码格式

我们使用 ESLint 和 Prettier 进行代码格式化：

```bash
# 检查代码格式
npm run lint

# 自动修复格式问题
npm run lint:fix

# 格式化代码
npm run format
```

### 注释规范

```typescript
/**
 * 执行高级端口分析
 * @param options 分析选项配置
 * @returns 分析结果，包含洞察和建议
 * @throws {AnalyticsError} 当分析失败时抛出
 * @example
 * ```typescript
 * const result = await performAdvancedAnalysis({
 *   timeRange: { start: startDate, end: endDate },
 *   analysisType: 'pattern'
 * });
 * ```
 */
async function performAdvancedAnalysis(
  options: AnalysisOptions
): Promise<AnalysisResult> {
  // 实现细节
}
```

## 🐛 问题报告

### 报告Bug

使用 [GitHub Issues](https://github.com/your-repo/issues) 报告问题，请包含：

1. **问题描述**: 清晰描述遇到的问题
2. **复现步骤**: 详细的复现步骤
3. **预期行为**: 期望的正确行为
4. **实际行为**: 实际发生的行为
5. **环境信息**: 操作系统、Node.js版本等
6. **错误日志**: 相关的错误信息和堆栈跟踪

### Bug报告模板

```markdown
## Bug描述
简要描述遇到的问题

## 复现步骤
1. 执行操作A
2. 执行操作B
3. 观察到问题

## 预期行为
描述期望的正确行为

## 实际行为
描述实际发生的行为

## 环境信息
- OS: [例如 Windows 11]
- Node.js: [例如 18.17.0]
- 系统版本: [例如 v1.0.0]

## 错误日志
```
粘贴相关的错误信息
```

## 附加信息
其他可能有用的信息
```

## 💡 功能建议

### 提交功能请求

1. **搜索现有Issues**: 确保功能请求未被提出
2. **详细描述**: 清晰描述建议的功能
3. **使用场景**: 说明功能的使用场景和价值
4. **实现建议**: 如果有想法，可以提供实现建议

### 功能请求模板

```markdown
## 功能描述
简要描述建议的功能

## 问题背景
描述当前存在的问题或需求

## 解决方案
描述建议的解决方案

## 替代方案
描述考虑过的其他解决方案

## 附加信息
其他相关信息或参考资料
```

## 📖 文档贡献

### 文档类型

- **API文档**: 接口说明和使用示例
- **用户指南**: 功能使用说明
- **开发文档**: 架构设计和开发指南
- **部署文档**: 安装和部署说明

### 文档规范

1. **使用Markdown格式**
2. **包含代码示例**
3. **提供清晰的步骤说明**
4. **保持内容更新**

## 🔍 代码审查

### 审查流程

1. **自我审查**: 提交前自己检查代码
2. **自动检查**: CI/CD流水线自动检查
3. **同行审查**: 其他开发者审查代码
4. **维护者审查**: 项目维护者最终审查

### 审查要点

- **功能正确性**: 代码是否实现了预期功能
- **代码质量**: 代码是否清晰、可维护
- **性能影响**: 是否对性能有负面影响
- **安全性**: 是否存在安全隐患
- **测试覆盖**: 是否有足够的测试覆盖

## 🚀 发布流程

### 版本号规范

我们使用 [Semantic Versioning](https://semver.org/)：

- **主版本号**: 不兼容的API修改
- **次版本号**: 向下兼容的功能性新增
- **修订号**: 向下兼容的问题修正

### 发布检查清单

- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] 变更日志已更新
- [ ] 版本号已更新
- [ ] 性能测试通过
- [ ] 安全检查通过

## 📞 获取帮助

### 联系方式

- **GitHub Discussions**: 技术讨论和问答
- **GitHub Issues**: 问题报告和功能请求
- **邮件**: dev-team@yourcompany.com
- **文档**: https://docs.yourcompany.com

### 社区资源

- **开发者社区**: https://community.yourcompany.com
- **技术博客**: https://blog.yourcompany.com
- **视频教程**: https://tutorials.yourcompany.com

## 🙏 致谢

感谢所有为项目做出贡献的开发者！您的贡献让这个项目变得更好。

### 贡献者列表

- 查看 [Contributors](https://github.com/your-repo/graphs/contributors) 页面
- 特别感谢核心维护团队
- 感谢所有提供反馈和建议的用户

## 📄 许可证

通过贡献代码，您同意您的贡献将在与项目相同的 [MIT License](LICENSE) 下授权。

---

**指南版本**: v1.0  
**最后更新**: 2025年9月27日  
**维护者**: 开发团队
