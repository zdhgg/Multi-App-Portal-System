/**
 * PM2 守护配置 - 门户系统自我管理
 * 
 * 这个配置文件将门户系统的后端服务本身也通过PM2管理
 * 实现自动重启、崩溃恢复等功能
 */
const path = require('path')

module.exports = {
  apps: [
    {
      // 门户系统后端服务
      name: 'portal-api',
      script: path.join(__dirname, 'detection-api', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      args: 'watch src/server.ts',
      cwd: path.join(__dirname, 'detection-api'),
      interpreter: 'node',  //明确使用node执行
      windowsHide: true,
      
      // 运行配置
      exec_mode: 'fork',
      instances: 1,
      
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',  // 最小运行时间（防止快速重启循环）
      max_restarts: 10,   // 最大重启次数
      restart_delay: 2000, // 重启延迟（毫秒）
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 8002,
        HOST: '0.0.0.0',
        PM2_ENABLED: '1',
        LOG_LEVEL: 'info'
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 8002,
        HOST: '0.0.0.0',
        PM2_ENABLED: '1',
        LOG_LEVEL: 'warn'
      },
      
      // 日志配置
      error_file: path.join(__dirname, 'detection-api', 'logs', 'pm2-guardian-error.log'),
      out_file: path.join(__dirname, 'detection-api', 'logs', 'pm2-guardian-out.log'),
      log_file: path.join(__dirname, 'detection-api', 'logs', 'pm2-guardian-combined.log'),
      time: true,
      merge_logs: true,
      
      // 健康检查（如果PM2版本支持）
      // wait_ready: true,
      // listen_timeout: 10000,
      
      // 异常处理
      kill_timeout: 5000,
      shutdown_with_message: false
    }
  ],
  
  // 部署配置（可选）
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo.git',
      path: '/var/www/portal',
      'post-deploy': 'npm install && pm2 reload portal-api --env production'
    }
  }
}

