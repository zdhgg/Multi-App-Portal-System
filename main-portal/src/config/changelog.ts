/**
 * 系统更新日志
 */

export interface ChangelogItem {
  type: 'feature' | 'fix' | 'improvement' | 'breaking'
  description: string
}

export interface ChangelogEntry {
  version: string
  date: string
  title: string
  items: ChangelogItem[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.1',
    date: '2026-03-23',
    title: '发布配套与版本对齐补丁',
    items: [
      { type: 'fix', description: '补发正式 CHANGELOG，并同步 GitHub README 中的当前版本、发布链接和版本徽章' },
      { type: 'fix', description: '将项目包版本、系统配置、脚本头部、前端展示和发布文档统一对齐到 1.1.1' },
      { type: 'improvement', description: '保留 v1.1.0 发布历史不变，使用补丁版发布来纳入发布配套更新，保持语义化版本记录清晰' }
    ]
  },
  {
    version: '1.1.0',
    date: '2026-03-23',
    title: '统一路由治理 + 多应用运维增强',
    items: [
      { type: 'feature', description: '检测管道持续优化：Scanner → Analyzer → Aggregator → PortAllocator 稳定支撑全栈识别与端口分配' },
      { type: 'feature', description: '统一 API Router（Phase 4）整合 v1/v2、版本协商与迁移工具，降低双路由维护成本' },
      { type: 'feature', description: '遗留应用接口灰度收口：LEGACY_APPS_MODE 支持 enabled/readonly/disabled，并提供 legacy-usage 遥测' },
      { type: 'feature', description: '多应用管理增强：新增 pinned 查询/设置接口，门户优先展示固定应用并在为空时自动降级展示全部' },
      { type: 'feature', description: '检测页接入导入编排：导入预检查（目录/端口/字段）+ 批量导入 + 失败回滚（rollbackOnError）' },
      { type: 'feature', description: '构建能力扩展：支持构建分析、构建执行、进度跟踪与统一部署入口' },
      { type: 'feature', description: 'PM2 运维增强：诊断、自动修复、二次确认令牌校验，新增 30 秒自动状态同步与手动同步接口' },
      { type: 'improvement', description: '应用模型扩展：持久化 deployment_mode、metadata.pinned、access_path，并在门户展示运行模式徽标' },
      { type: 'improvement', description: '权限与认证增强：RBAC 权限矩阵细化，管理员登录支持 MFA 开关与会话治理' },
      { type: 'improvement', description: '系统设置增强：引入 versionToken 并发保护，避免多端覆盖写入；用户密码统一 bcrypt 加密存储' },
      { type: 'improvement', description: '日志与运维能力增强：日志管理中心（配置/归档/清理/历史）+ 后台文件清理任务' },
      { type: 'improvement', description: '安全开关体系完善：WS 认证、公共监控端点开关、文件系统白名单与工作区父目录访问控制' },
      { type: 'fix', description: '稳定性修复：EPIPE 与 PM2 EPERM 场景降级处理，避免异常导致服务进程退出' }
    ]
  },
  {
    version: '1.0.5',
    date: '2025-11-05',
    title: '智能命令注入功能',
    items: [
      { type: 'feature', description: '自动为启动命令注入端口参数' },
      { type: 'feature', description: '支持 Vite、Next.js、Angular CLI 等主流技术栈' },
      { type: 'feature', description: '智能检测自定义服务器配置' },
      { type: 'improvement', description: '完全向后兼容，无破坏性更新' },
      { type: 'improvement', description: '167个测试用例，100%通过率' }
    ]
  },
  {
    version: '1.0.0',
    date: '2025-09-20',
    title: '初始版本发布',
    items: [
      { type: 'feature', description: '智能应用检测功能' },
      { type: 'feature', description: '统一应用门户界面' },
      { type: 'feature', description: '高级应用管理功能' },
      { type: 'feature', description: '配置文件生成工具' },
      { type: 'feature', description: 'PM2 进程管理集成' }
    ]
  }
]

/**
 * 操作帮助内容
 */
export interface HelpSection {
  title: string
  icon: string
  items: string[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: '应用检测',
    icon: '🔍',
    items: [
      '选择扫描深度：浅层(1层)、快速(2层)、标准(3层)、完整(5层)',
      '系统会自动识别全栈项目结构（如 frontend/backend）',
      '支持 monorepo 项目检测，即使根目录有 package.json 也会检查子目录',
      '检测结果会显示置信度，帮助判断识别准确性'
    ]
  },
  {
    title: '应用管理',
    icon: '🧩',
    items: [
      '点击应用卡片可启动/停止应用',
      '支持批量操作：批量启动、停止、删除',
      '可编辑应用名称、描述、图标等信息',
      '全栈项目会显示前后端端口分配'
    ]
  },
  {
    title: '端口管理',
    icon: '⚙️',
    items: [
      '配置前端端口范围（默认 3001-3100）',
      '配置后端端口范围（默认 8001-8100）',
      '添加保留端口，防止被自动分配',
      '查看当前端口占用状态'
    ]
  },
  {
    title: 'PM2 管理',
    icon: '🧭',
    items: [
      '查看所有 PM2 进程状态',
      '支持启动、停止、重启、删除操作',
      '查看进程日志和错误日志',
      '监控 CPU 和内存使用情况'
    ]
  }
]
