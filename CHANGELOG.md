# Changelog

本项目遵循语义化版本（Semantic Versioning）。

## [1.1.0] - 2026-03-23

### Added

- 新增系统设置 payload 组装工具与目录选择工具，提升系统设置与路径访问配置的可靠性。
- 新增 `filesystemPicker`、PM2 状态同步、网络服务与路径配置解析的测试覆盖。
- 新增正式的 GitHub 发布配套信息，包括统一版本展示、脚本文档版本同步和独立 changelog 文件。

### Changed

- 将根项目、前端、后端、系统配置、脚本头部、前端页面和主要文档的版本号统一升级到 `1.1.0`。
- 优化门户公共应用数据返回逻辑，在前端展示前增加运行态兜底判断。
- 调整部分系统脚本入口说明，移除损坏的旧配置管理入口并统一引导到当前配置文件和系统设置页面。

### Fixed

- 修复应用在“直启/开发模式”和 “PM2/生产模式”之间切换后，首页模式标签与真实运行状态不一致的问题。
- 修复 `deploymentMode=production` 残留导致的错误展示问题，避免 `pm2ProcessName` 为空时继续误判为 PM2 运行。
- 修复 `video-cms` 等全栈应用在门户首页、关于系统和版本展示中的状态/版本错位问题。

## [1.0.0] - 2026-03-10

### Added

- 发布智能多 Web 应用门户系统初始里程碑版本。
- 上线四阶段检测管道：`Scanner -> Analyzer -> Aggregator -> PortAllocator`。
- 支持智能端口分配、统一应用门户、RBAC、安全加固和 PM2 集成。

### Changed

- 重构底层检测与端口治理架构，面向多应用和全栈项目场景优化运行效率。

### Fixed

- 初始版本已合并若干端口治理、命令注入和安全控制相关修复。

[1.1.0]: https://github.com/zdhgg/Multi-App-Portal-System/releases/tag/v1.1.0
[1.0.0]: https://github.com/zdhgg/Multi-App-Portal-System/releases/tag/v1.0.0
