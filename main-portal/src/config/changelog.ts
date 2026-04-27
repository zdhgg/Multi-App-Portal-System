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
    version: '1.3.9',
    date: '2026-04-27',
    title: '应用运行时间显示修复补丁',
    items: [
      { type: 'fix', description: '修复门户首页和应用详情中的“运行时间”长期显示为“尚未启动”的问题，运行中应用现在会展示真实存活时长' },
      { type: 'improvement', description: '公共应用接口现在会优先读取 PM2 uptime，并在直启/开发模式下回退到进程管理器中的 startedAt 计算结果' },
      { type: 'fix', description: '前端不再把 uptime=0 的在线应用误判为未启动；刚启动或同步中的应用会按当前状态稳定展示' },
      { type: 'feature', description: '新增 PublicController uptime 映射回归测试，覆盖 PM2 托管应用和直接启动应用两条链路' },
      { type: 'improvement', description: '同步根项目、前后端包、系统配置、锁文件和主要发布文档版本到 1.3.9' }
    ]
  },
  {
    version: '1.3.8',
    date: '2026-04-27',
    title: '目录选择回填与全栈工作区识别增强补丁',
    items: [
      { type: 'fix', description: '修复系统设置 > 路径访问中的“选择目录并添加”在存在空白输入行时看起来没有生效的问题，现在会优先回填空白行并避免重复路径' },
      { type: 'improvement', description: '手动添加、检测页、备份路径和路径访问设置统一强化服务器目录模式提示，明确当前选择的是部署服务器上的路径' },
      { type: 'fix', description: '修复路径访问场景下目录选择返回路径时的过严即时校验，避免出现“手动输入可以，目录选择失败”的不一致行为' },
      { type: 'improvement', description: '增强全栈与 monorepo 工作区识别，支持 apps/web、apps/api 及 pnpm workspace 结构自动识别与配置' },
      { type: 'improvement', description: '同步根项目、前后端包、系统配置、锁文件和主要发布文档版本到 1.3.8' }
    ]
  },
  {
    version: '1.3.7',
    date: '2026-04-24',
    title: '备份设置同步与发布配置修正补丁',
    items: [
      { type: 'fix', description: '修复系统设置中的备份策略改动后，部分开关、下拉和数值项有时不会稳定标记为未保存变更的问题' },
      { type: 'improvement', description: '“创建备份”弹窗新增备份模式说明提示，并修正提示浮层层级，避免被其他高层弹窗遮挡' },
      { type: 'fix', description: '修复发布默认配置误写入本机绝对备份目录的问题，默认备份输出路径恢复为工作区相对 ./backups' },
      { type: 'improvement', description: '同步根项目、前后端包、系统配置和主要发布文档版本到 1.3.7' }
    ]
  },
  {
    version: '1.3.6',
    date: '2026-04-24',
    title: '关于系统更新记录补齐补丁',
    items: [
      { type: 'fix', description: '修复关于系统弹窗中的“更新记录”未同步纳入 1.3.4 与 1.3.5，导致界面仍停留在旧版本记录的问题' },
      { type: 'improvement', description: '前端内置更新记录现在补齐到 1.3.6，关于系统弹窗可直接展示最近几个正式版本的发布内容' },
      { type: 'improvement', description: '同步根项目、前后端包、系统配置和主要发布文档版本到 1.3.6' }
    ]
  },
  {
    version: '1.3.5',
    date: '2026-04-24',
    title: '离线恢复安全校验与启动入口整理补丁',
    items: [
      { type: 'feature', description: '新增脚本归档备份的离线恢复向导入口，并补充 Backup-Portal.bat、Restore-Portal.bat 与中文控制向导入口' },
      { type: 'improvement', description: 'Start-Portal.bat 收口为统一的中文控制向导入口，集中处理启动、重启、停机、自启和备份恢复操作' },
      { type: 'fix', description: '修复离线恢复向导先按备份 ID 选中、但真正校验和恢复时又退回按备份名执行，可能命中错误归档的问题' },
      { type: 'fix', description: '修复离线恢复在服务未完全停止时仍可能继续执行恢复的问题；现在会在恢复前确认 PM2 进程、监听端口和健康检查都已停稳' },
      { type: 'improvement', description: '同步根项目、前后端包、系统配置和主要发布文档版本到 1.3.5' }
    ]
  },
  {
    version: '1.3.4',
    date: '2026-04-19',
    title: '认证失效跳转与健康检查稳定性修复补丁',
    items: [
      { type: 'feature', description: '新增认证失效跳转回归测试与本地无头实测脚本，覆盖 401、refresh 失败和全局 auth:token-invalid 事件链路' },
      { type: 'feature', description: '为进程健康检查补充失败计数清理回归测试，覆盖手动停止、退出清扫和自动重启场景' },
      { type: 'improvement', description: '认证失效处理统一为优先清理本地状态并立即跳转，不再等待失效 token 的登出请求' },
      { type: 'fix', description: '修复认证失效后页面可能先停留一段时间、再延迟跳转回首页的问题' },
      { type: 'fix', description: '修复进程健康检查失败计数在正常停止、启动回滚、退出清理或自动重启后可能残留，导致新进程被误判为连续失败的问题' }
    ]
  },
  {
    version: '1.3.3',
    date: '2026-04-07',
    title: '目录选择兼容性与批量导入体验优化补丁',
    items: [
      { type: 'feature', description: '新增网页式服务器目录浏览器，局域网远程访问时可替代后端原生目录选择' },
      { type: 'improvement', description: '手动添加、批量导入、备份路径和路径白名单配置统一复用新的最佳努力目录选择链路' },
      { type: 'improvement', description: '检测页收口为低频批量导入工具，首页与空状态统一优先引导到“应用管理 > 添加应用”' },
      { type: 'improvement', description: '应用启动遇到端口冲突时，管理页现在会直接跳转端口管理并聚焦冲突端口' },
      { type: 'fix', description: '修复 base64url JWT 无法恢复登录态、记住我用户名回填不稳定，以及版本化 API 前缀被误改写的问题' }
    ]
  },
  {
    version: '1.3.2',
    date: '2026-03-31',
    title: '启动校验与运维诊断增强补丁',
    items: [
      { type: 'improvement', description: '生产启动脚本升级为校验式启动，要求 PM2 在线、监听 PID 匹配且 /health 连续通过后才视为成功' },
      { type: 'fix', description: '修复端口被其他进程占用或服务秒退时，启动脚本仍可能误判成功的问题' },
      { type: 'improvement', description: 'Start-Portal.bat 新增防火墙与 PM2 开机自启状态检测，并统一复用新的校验式重启入口' },
      { type: 'improvement', description: '同步前后端包、系统配置、脚本模板和主要发布文档到 1.3.2，并补充内网环境回归测试方案' }
    ]
  },
  {
    version: '1.3.1',
    date: '2026-03-30',
    title: 'UTF-8 BOM 配置兼容性修复补丁',
    items: [
      { type: 'fix', description: '修复 system-config.json 以 UTF-8 BOM 保存时，系统设置、认证和路径访问配置读取可能失败的问题' },
      { type: 'fix', description: '自动备份调度器现在可稳定读取带 BOM 的系统配置，不再因解析异常而漏载计划' },
      { type: 'improvement', description: '统一后端 system-config 解析入口，并补充 BOM 兼容回归测试，降低后续配置读取分叉风险' },
      { type: 'improvement', description: '将前后端包版本、系统配置、脚本模板和主要发布文档统一对齐到 1.3.1' }
    ]
  },
  {
    version: '1.3.0',
    date: '2026-03-27',
    title: '备份中心与运维控制台增强',
    items: [
      { type: 'feature', description: '新增系统备份与恢复中心，统一管理配置快照、文件归档备份、恢复前备份和历史清理' },
      { type: 'feature', description: '新增自动备份调度器，支持直接从系统设置动态读取周期、时间、保留天数和输出路径' },
      { type: 'improvement', description: '系统设置、应用管理、PM2 管理和端口管理进一步统一为状态页头与快照指标布局' },
      { type: 'fix', description: '修复旧配置缺少 backup 段时，保存系统设置可能误关自动备份的问题' },
      { type: 'fix', description: '修复备份文件已丢失时，配置快照仍被错误显示为可恢复的问题' }
    ]
  },
  {
    version: '1.2.2',
    date: '2026-03-26',
    title: 'PM2 进程识别与停止修复补丁',
    items: [
      { type: 'feature', description: '新增按应用 ID 停止对应 PM2 进程的路径，兼容应用名与 PM2 进程名不一致的场景' },
      { type: 'fix', description: '修复共享工作区父目录被误判为 PM2 进程命中的问题，降低误同步和误停止风险' },
      { type: 'fix', description: '管理页现在会结合进程名称与工作目录识别 PM2 应用，日志和停止操作更稳定' },
      { type: 'improvement', description: 'Windows 原生进程停止改为优先终止完整进程树，并保留信号兜底，提升端口释放稳定性' },
      { type: 'improvement', description: '将前后端包版本、系统配置、脚本模板和主要发布文档统一对齐到 1.2.2' }
    ]
  },
  {
    version: '1.2.1',
    date: '2026-03-25',
    title: '门户交互与卡片一致性修复补丁',
    items: [
      { type: 'fix', description: '修复用户资料相关弹窗在门户首页特殊布局下可能被错误定位到页面下方的问题' },
      { type: 'improvement', description: '离线应用卡片保留“查看详情”主操作，并将次级操作改为直接可点击的“刷新”按钮' },
      { type: 'improvement', description: '为单卡片刷新增加请求中禁点与 2 秒冷却，减少重复点击和重复请求' },
      { type: 'fix', description: '修复 video-cms 等单行标题卡片与同排应用卡片在标题高度和底部操作区上的视觉不一致问题' },
      { type: 'improvement', description: '将前后端包版本、系统配置、脚本模板和主要发布文档统一对齐到 1.2.1' }
    ]
  },
  {
    version: '1.2.0',
    date: '2026-03-24',
    title: '控制中心界面焕新与运维体验升级',
    items: [
      { type: 'feature', description: '门户首页、应用管理、PM2 管理、端口管理和系统设置统一升级为控制中心式布局，关键指标与快捷操作集中展示' },
      { type: 'feature', description: '应用卡片与详情面板焕新，新增访问端口、运行模式、访问入口、最近更新和更清晰的状态摘要' },
      { type: 'improvement', description: 'PM2 进程列表、端口占用列表和用户资料卡采用统一视觉风格，异常与冲突信息更易识别' },
      { type: 'improvement', description: '引入新的全局设计变量、字体与响应式间距，整体页面层级和阅读体验更一致' },
      { type: 'fix', description: '离线应用的主按钮和部分运维操作文案更符合当前状态，降低误操作概率' }
    ]
  },
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
