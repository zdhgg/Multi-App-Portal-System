/**
 * PM2 配置文件 - 门户系统后端
 * 
 * 使用方法：
 *   开发模式: pm2 start ecosystem.config.js
 *   生产模式: pm2 start ecosystem.config.js --env production
 */

const path = require('path')

module.exports = {
  apps: [
    {
      name: 'portal-api',
      script: path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      args: 'src/server.ts',
      cwd: __dirname,
      interpreter: 'node',

      // 运行模式
      exec_mode: 'fork',
      instances: 1,

      // Windows兼容性 - 隐藏CMD窗口
      windowsHide: true,

      // 自动重启
      autorestart: true,
      max_memory_restart: '1G',

      // 环境变量 - 开发模式
      env: {
        NODE_ENV: 'development',
        PORT: 8002,
        HOST: '0.0.0.0',
        PM2_ENABLED: '1',
        LOG_LEVEL: 'info',
        FILESYSTEM_ALLOWED_BASE_PATHS: 'D:\\;C:\\Users',
        ALLOW_WORKSPACE_PARENT: 'true'
      },

      // 环境变量 - 生产模式
      env_production: {
        NODE_ENV: 'production',
        PORT: 8002,
        HOST: '0.0.0.0',
        PM2_ENABLED: '1',
        LOG_LEVEL: 'warn',
        FILESYSTEM_ALLOWED_BASE_PATHS: 'D:\\;C:\\Users',
        ALLOW_WORKSPACE_PARENT: 'true'
      },

      // 日志
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,

      // 重启策略
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
}
