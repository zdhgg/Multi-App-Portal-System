// PM2 生产环境配置
module.exports = {
  apps: [
    {
      // 应用基本信息
      name: 'portal-api',
      script: './detection-api/dist/server.js',
      cwd: process.cwd(),
      
      // 生产环境配置
      instances: 'max',
      exec_mode: 'cluster',
      
      // Windows兼容性 - 隐藏CMD窗口
      windowsHide: true,
      
      // 环境变量
      env_production: {
        NODE_ENV: 'production',
        PORT: 8002,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'warn',
        CLUSTER_ENABLED: true,
        METRICS_ENABLED: true,
        PERFORMANCE_MONITORING_ENABLED: true
      },
      
      // 日志配置
      log_type: 'json',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './detection-api/logs/pm2-error.log',
      out_file: './detection-api/logs/pm2-out.log',
      log_file: './detection-api/logs/pm2-combined.log',
      time: true,
      
      // 生产环境性能配置
      max_memory_restart: '1G',
      node_args: [
        '--max-old-space-size=1024',
        '--optimize-for-size'
      ],
      
      // 重启配置
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      
      // 生产环境监控
      watch: false,
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
        timeout: 10000,
        interval: 30000
      },
      max_cpu_restart: 80,
      shutdown_with_message: true,
      
      // 进程管理
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // 源码映射（生产环境关闭）
      source_map_support: false,
      
      // 实例配置
      instance_var: 'INSTANCE_ID',
      
      // 合并日志
      merge_logs: true,
      
      // 自动重启条件（每天凌晨2点重启）
      cron_restart: '0 2 * * *'
    }
  ],
  
  // 全局配置
  global: {
    // PM2 Plus 配置
    pmx: false,
    
    // 日志轮转配置
    log_rotate: {
      max_size: '10M',
      retain: 5,
      compress: true,
      dateFormat: 'YYYY-MM-DD_HH-mm-ss',
      workerInterval: 30,
      rotateInterval: '0 0 * * *'
    }
  }
}
