// PM2 开发环境配置 - 直接运行 TypeScript 源代码
module.exports = {
  apps: [
    {
      name: 'portal-api-dev',
      script: 'npm',
      args: 'run dev',
      cwd: './detection-api',
      interpreter: 'none',
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 8001,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'debug'
      },
      
      // 开发模式配置
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false, // tsx 已经有 watch 模式
      max_memory_restart: '512M',
      
      // 日志配置
      error_file: './detection-api/logs/pm2-error.log',
      out_file: './detection-api/logs/pm2-out.log',
      log_file: './detection-api/logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      
      // 重启配置
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '5s'
    }
  ]
}

