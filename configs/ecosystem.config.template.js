// 智能多Web应用门户系统 - PM2 配置模板
// 版本: v1.2.1
// 复制此文件为 ecosystem.config.js 并根据实际环境修改配置

module.exports = {
  apps: [
    {
      // 应用基本信息
      name: 'portal-api',
      script: './detection-api/dist/server.js',
      cwd: '/opt/portal',
      
      // 集群配置
      instances: 'max',  // 或者指定具体数量，如 4
      exec_mode: 'cluster',
      
      // 环境变量
      env: {
        NODE_ENV: 'production',
        PORT: 8000,
        HOST: '0.0.0.0'
      },
      
      // 开发环境配置
      env_development: {
        NODE_ENV: 'development',
        PORT: 8000,
        LOG_LEVEL: 'debug'
      },
      
      // 测试环境配置
      env_test: {
        NODE_ENV: 'test',
        PORT: 8002,
        DB_PATH: './data/test.db'
      },
      
      // 日志配置
      log_type: 'json',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/portal/logs/pm2-error.log',
      out_file: '/opt/portal/logs/pm2-out.log',
      log_file: '/opt/portal/logs/pm2-combined.log',
      time: true,
      
      // 性能配置
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
      
      // 监控配置
      watch: false,  // 生产环境建议关闭
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
      
      // 进程管理
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // 源码映射（调试用）
      source_map_support: true,
      
      // 实例配置
      instance_var: 'INSTANCE_ID',
      
      // 合并日志
      merge_logs: true,
      
      // 自动重启条件
      cron_restart: '0 2 * * *',  // 每天凌晨2点重启
      
      // 环境特定配置
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
        LOG_LEVEL: 'info',
        CLUSTER_ENABLED: true,
        METRICS_ENABLED: true,
        PERFORMANCE_MONITORING_ENABLED: true
      }
    }
  ],
  
  // 部署配置
  deploy: {
    // 生产环境部署
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/your-repo.git',
      path: '/opt/portal',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    },
    
    // 测试环境部署
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/your-repo.git',
      path: '/opt/portal-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env test',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  },
  
  // 全局配置
  global: {
    // PM2 Plus 配置（如果使用）
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

// 高级配置示例
const advancedConfig = {
  apps: [
    {
      name: 'portal-api-advanced',
      script: './detection-api/dist/server.js',
      
      // 高级集群配置
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: 'cluster',
      
      // 动态环境变量
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: 8000,
        INSTANCE_ID: process.env.pm_id || 0
      },
      
      // 高级重启策略
      exp_backoff_restart_delay: 100,
      max_restarts: 15,
      min_uptime: '30s',
      
      // 内存监控
      max_memory_restart: '1G',
      memory_limit: '1.5G',
      
      // CPU 监控
      max_cpu_restart: 90,
      
      // 自定义监控脚本
      monitoring: {
        http: true,
        https: false,
        port: 8000,
        path: '/health'
      },
      
      // 错误处理
      error_file: '/opt/portal/logs/error.log',
      out_file: '/opt/portal/logs/out.log',
      log_file: '/opt/portal/logs/combined.log',
      
      // 进程间通信
      ipc: true,
      
      // 优雅关闭
      kill_timeout: 10000,
      shutdown_with_message: true,
      
      // 自定义启动脚本
      interpreter: 'node',
      interpreter_args: [
        '--harmony',
        '--max-old-space-size=1024'
      ],
      
      // 环境检测
      node_version: '>=18.0.0',
      
      // 自动化配置
      automation: {
        enabled: true,
        restart_on_file_change: false,
        restart_on_memory_limit: true,
        restart_on_cpu_limit: true
      }
    }
  ]
}

// 开发环境配置
const developmentConfig = {
  apps: [
    {
      name: 'portal-api-dev',
      script: './detection-api/src/server.ts',
      interpreter: 'ts-node',
      
      // 开发模式配置
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
        PORT: 8000,
        LOG_LEVEL: 'debug'
      },
      
      // 开发模式监控
      watch: true,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        'data',
        'dist'
      ],
      
      // 快速重启
      restart_delay: 1000,
      max_restarts: 50,
      min_uptime: '2s',
      
      // 开发日志
      log_type: 'raw',
      merge_logs: false,
      
      // TypeScript 支持
      interpreter_args: [
        '--transpile-only',
        '--files'
      ]
    }
  ]
}

// 根据环境导出不同配置
if (process.env.NODE_ENV === 'development') {
  module.exports = developmentConfig
} else if (process.env.ADVANCED_CONFIG === 'true') {
  module.exports = advancedConfig
}

// 配置验证函数
function validateConfig(config) {
  const requiredFields = ['name', 'script']
  
  config.apps.forEach(app => {
    requiredFields.forEach(field => {
      if (!app[field]) {
        throw new Error(`Missing required field: ${field} in app configuration`)
      }
    })
  })
  
  return true
}

// 导出前验证配置
try {
  validateConfig(module.exports)
  console.log('PM2 configuration validated successfully')
} catch (error) {
  console.error('PM2 configuration validation failed:', error.message)
  process.exit(1)
}
