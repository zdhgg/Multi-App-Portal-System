// PM2 开发环境配置
module.exports = {
  apps: [
    {
      // 应用基本信息
      name: 'portal-api',
      script: './detection-api/dist/server.js',
      cwd: process.cwd(),
      
      // 开发环境配置
      instances: 1,
      exec_mode: 'fork',
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 8002,
        HOST: '0.0.0.0', // 支持局域网访问
        LOG_LEVEL: 'debug'
      },
      
      // 日志配置
      log_type: 'json',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './detection-api/logs/pm2-error.log',
      out_file: './detection-api/logs/pm2-out.log',
      log_file: './detection-api/logs/pm2-combined.log',
      time: true,
      
      // 开发环境性能配置
      max_memory_restart: '512M',
      node_args: [
        '--max-old-space-size=512'
      ],
      
      // 重启配置
      restart_delay: 1000,
      max_restarts: 50,
      min_uptime: '5s',
      autorestart: true,
      
      // 开发环境监控
      watch: false, // 使用tsx watch代替
      ignore_watch: [
        'node_modules',
        'logs',
        'data',
        'uploads',
        '.git'
      ],
      
      // 健康检查
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // 高级监控配置
      monitoring: {
        http: true,
        port: 8002,
        path: '/health',
        timeout: 5000,
        interval: 15000
      },
      max_cpu_restart: 90,
      shutdown_with_message: true,
      
      // 进程管理
      kill_timeout: 3000,
      listen_timeout: 5000,
      
      // 源码映射（调试用）
      source_map_support: true,
      
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
      max_size: '10M',
      retain: 3,
      compress: true,
      dateFormat: 'YYYY-MM-DD_HH-mm-ss',
      workerInterval: 30,
      rotateInterval: '0 0 * * *'
    }
  }
}
