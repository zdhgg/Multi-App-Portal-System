// PM2 生产环境配置 - 使用 tsx 运行 TypeScript
module.exports = {
  apps: [
    {
      // 应用基本信息
      name: 'portal-api',
      script: './start-prod.cjs',
      cwd: './detection-api',
      
      // 生产环境配置
      instances: 1,
      exec_mode: 'fork',
      
      // 环境变量（默认加载，无需 --env 参数）
      env: {
        NODE_ENV: 'production',
        PORT: 8002,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        PM2_ENABLED: '1',  // 启用 PM2 管理功能
        // JWT_SECRET 不在此处硬编码，必须通过部署环境注入
        ...(process.env.JWT_SECRET ? { JWT_SECRET: process.env.JWT_SECRET } : {})
      },
      
      // 日志配置
      log_type: 'json',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      
      // 生产环境性能配置
      max_memory_restart: '1G',
      node_args: [
        '--max-old-space-size=1024'
      ],
      
      // 重启配置
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      
      // 监控
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'data',
        'uploads',
        '.git'
      ],
      
      // 健康检查
      health_check_grace_period: 5000,
      health_check_fatal_exceptions: true,
      
      // 高级监控配置
      monitoring: {
        http: true,
        port: 8002,
        path: '/health',
        timeout: 10000,
        interval: 30000
      },
      max_cpu_restart: 90,
      shutdown_with_message: true,
      
      // 进程管理
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // 实例配置
      instance_var: 'INSTANCE_ID',
      
      // 合并日志
      merge_logs: true
    }
  ],
  
  // 全局配置
  global: {
    // PM2 Plus 配置
    pmx: false,
    
    // 日志轮转配置
    log_rotate: {
      max_size: '50M',
      retain: 7,
      compress: true,
      dateFormat: 'YYYY-MM-DD_HH-mm-ss',
      workerInterval: 30,
      rotateInterval: '0 0 * * *'
    }
  }
}

