#!/usr/bin/env node

/**
 * 数据库迁移脚本
 * 用于生产环境部署时的数据库初始化和迁移
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DatabaseMigration {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.options = {
      verbose: options.verbose || false,
      backup: options.backup !== false,
      ...options
    };
    this.db = null;
    this.migrations = [];
  }

  async initialize() {
    console.log('🚀 开始数据库迁移...');
    
    try {
      // 创建数据库目录
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ 创建数据库目录: ${dbDir}`);
      }

      // 备份现有数据库
      if (this.options.backup && fs.existsSync(this.dbPath)) {
        await this.backupDatabase();
      }

      // 连接数据库
      this.db = new Database(this.dbPath, {
        verbose: this.options.verbose ? console.log : null
      });

      console.log(`✅ 连接数据库: ${this.dbPath}`);

      // 启用外键约束
      this.db.pragma('foreign_keys = ON');
      
      // 设置WAL模式以提高并发性能
      this.db.pragma('journal_mode = WAL');
      
      // 设置同步模式
      this.db.pragma('synchronous = NORMAL');
      
      // 设置缓存大小
      this.db.pragma('cache_size = 10000');

      // 创建迁移历史表
      await this.createMigrationTable();

      // 加载迁移文件
      await this.loadMigrations();

      // 执行迁移
      await this.runMigrations();

      // 创建索引
      await this.createIndexes();

      // 验证数据库结构
      await this.validateDatabase();

      console.log('✅ 数据库迁移完成');

    } catch (error) {
      console.error('❌ 数据库迁移失败:', error);
      throw error;
    }
  }

  async backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.dbPath}.backup.${timestamp}`;
    
    try {
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`✅ 数据库备份完成: ${backupPath}`);
    } catch (error) {
      console.error('❌ 数据库备份失败:', error);
      throw error;
    }
  }

  async createMigrationTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS migration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        execution_time INTEGER NOT NULL
      )
    `;
    
    this.db.exec(sql);
    console.log('✅ 创建迁移历史表');
  }

  async loadMigrations() {
    this.migrations = [
      {
        version: '001',
        name: 'create_analytics_tables',
        sql: this.getAnalyticsTablesSql()
      },
      {
        version: '002',
        name: 'create_performance_tables',
        sql: this.getPerformanceTablesSql()
      },
      {
        version: '003',
        name: 'create_cache_tables',
        sql: this.getCacheTablesSql()
      },
      {
        version: '004',
        name: 'create_dashboard_tables',
        sql: this.getDashboardTablesSql()
      },
      {
        version: '005',
        name: 'create_ml_model_tables',
        sql: this.getMLModelTablesSql()
      }
    ];

    console.log(`✅ 加载 ${this.migrations.length} 个迁移文件`);
  }

  async runMigrations() {
    const executedMigrations = this.getExecutedMigrations();
    
    for (const migration of this.migrations) {
      if (executedMigrations.includes(migration.version)) {
        console.log(`⏭️  跳过已执行的迁移: ${migration.version} - ${migration.name}`);
        continue;
      }

      console.log(`🔄 执行迁移: ${migration.version} - ${migration.name}`);
      
      const startTime = Date.now();
      const checksum = this.calculateChecksum(migration.sql);
      
      try {
        // 在事务中执行迁移
        this.db.transaction(() => {
          this.db.exec(migration.sql);
          
          // 记录迁移历史
          const stmt = this.db.prepare(`
            INSERT INTO migration_history (version, name, checksum, execution_time)
            VALUES (?, ?, ?, ?)
          `);
          
          stmt.run(
            migration.version,
            migration.name,
            checksum,
            Date.now() - startTime
          );
        })();
        
        console.log(`✅ 迁移完成: ${migration.version} - ${migration.name} (${Date.now() - startTime}ms)`);
        
      } catch (error) {
        console.error(`❌ 迁移失败: ${migration.version} - ${migration.name}`, error);
        throw error;
      }
    }
  }

  getExecutedMigrations() {
    try {
      const stmt = this.db.prepare('SELECT version FROM migration_history ORDER BY id');
      return stmt.all().map(row => row.version);
    } catch (error) {
      return [];
    }
  }

  calculateChecksum(sql) {
    return crypto.createHash('md5').update(sql).digest('hex');
  }

  getAnalyticsTablesSql() {
    return `
      -- 分析结果表
      CREATE TABLE IF NOT EXISTS analytics_results (
        id TEXT PRIMARY KEY,
        analysis_type TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        data_points INTEGER NOT NULL DEFAULT 0,
        accuracy REAL NOT NULL DEFAULT 0,
        confidence REAL,
        insights TEXT, -- JSON格式
        recommendations TEXT, -- JSON格式
        metadata TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 分析洞察表
      CREATE TABLE IF NOT EXISTS analysis_insights (
        id TEXT PRIMARY KEY,
        analysis_result_id TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL,
        impact TEXT NOT NULL,
        recommendations TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (analysis_result_id) REFERENCES analytics_results(id) ON DELETE CASCADE
      );

      -- 预测结果表
      CREATE TABLE IF NOT EXISTS prediction_results (
        id TEXT PRIMARY KEY,
        analysis_result_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metric TEXT NOT NULL,
        predicted_value REAL NOT NULL,
        confidence REAL NOT NULL,
        trend TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (analysis_result_id) REFERENCES analytics_results(id) ON DELETE CASCADE
      );

      -- 异常检测结果表
      CREATE TABLE IF NOT EXISTS anomaly_detections (
        id TEXT PRIMARY KEY,
        analysis_result_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        expected_value REAL NOT NULL,
        severity TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (analysis_result_id) REFERENCES analytics_results(id) ON DELETE CASCADE
      );
    `;
  }

  getPerformanceTablesSql() {
    return `
      -- 性能指标表
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        unit TEXT,
        tags TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 系统资源使用表
      CREATE TABLE IF NOT EXISTS system_resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        cpu_usage REAL NOT NULL,
        memory_usage REAL NOT NULL,
        disk_usage REAL,
        network_io REAL,
        active_connections INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 分析执行日志表
      CREATE TABLE IF NOT EXISTS analysis_execution_log (
        id TEXT PRIMARY KEY,
        analysis_type TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        execution_time INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        input_parameters TEXT, -- JSON格式
        result_summary TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }

  getCacheTablesSql() {
    return `
      -- 缓存统计表
      CREATE TABLE IF NOT EXISTS cache_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        cache_size INTEGER NOT NULL,
        hit_rate REAL NOT NULL,
        miss_rate REAL NOT NULL,
        evictions INTEGER NOT NULL,
        total_requests INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 缓存条目表（可选，用于持久化缓存）
      CREATE TABLE IF NOT EXISTS cache_entries (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }

  getDashboardTablesSql() {
    return `
      -- 仪表板配置表
      CREATE TABLE IF NOT EXISTS dashboard_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        config TEXT NOT NULL, -- JSON格式
        layout TEXT NOT NULL, -- JSON格式
        refresh_interval INTEGER,
        real_time_settings TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 仪表板数据表
      CREATE TABLE IF NOT EXISTS dashboard_data (
        id TEXT PRIMARY KEY,
        dashboard_id TEXT NOT NULL,
        widget_id TEXT NOT NULL,
        data TEXT NOT NULL, -- JSON格式
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dashboard_id) REFERENCES dashboard_configs(id) ON DELETE CASCADE
      );

      -- 报告模板表
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        format TEXT NOT NULL,
        template_content TEXT NOT NULL,
        parameters TEXT, -- JSON格式
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 生成的报告表
      CREATE TABLE IF NOT EXISTS generated_reports (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        format TEXT NOT NULL,
        file_path TEXT,
        metadata TEXT, -- JSON格式
        generated_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES report_templates(id)
      );
    `;
  }

  getMLModelTablesSql() {
    return `
      -- 机器学习模型表
      CREATE TABLE IF NOT EXISTS ml_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        version TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        parameters TEXT NOT NULL, -- JSON格式
        training_data_hash TEXT,
        accuracy REAL,
        model_data TEXT, -- 序列化的模型数据
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 模型训练历史表
      CREATE TABLE IF NOT EXISTS model_training_history (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        training_start DATETIME NOT NULL,
        training_end DATETIME,
        training_samples INTEGER,
        validation_samples INTEGER,
        accuracy REAL,
        loss REAL,
        parameters TEXT, -- JSON格式
        status TEXT NOT NULL,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES ml_models(id) ON DELETE CASCADE
      );

      -- 模型预测历史表
      CREATE TABLE IF NOT EXISTS model_predictions (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        input_data TEXT NOT NULL, -- JSON格式
        prediction TEXT NOT NULL, -- JSON格式
        confidence REAL,
        actual_value TEXT, -- JSON格式（用于后续验证）
        prediction_time DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES ml_models(id) ON DELETE CASCADE
      );
    `;
  }

  async createIndexes() {
    console.log('🔄 创建数据库索引...');
    
    const indexes = [
      // 分析结果索引
      'CREATE INDEX IF NOT EXISTS idx_analytics_results_type_timestamp ON analytics_results(analysis_type, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_results_timestamp ON analytics_results(timestamp)',
      
      // 分析洞察索引
      'CREATE INDEX IF NOT EXISTS idx_analysis_insights_result_id ON analysis_insights(analysis_result_id)',
      'CREATE INDEX IF NOT EXISTS idx_analysis_insights_type ON analysis_insights(type)',
      
      // 预测结果索引
      'CREATE INDEX IF NOT EXISTS idx_prediction_results_timestamp ON prediction_results(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_prediction_results_metric ON prediction_results(metric)',
      
      // 异常检测索引
      'CREATE INDEX IF NOT EXISTS idx_anomaly_detections_timestamp ON anomaly_detections(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_anomaly_detections_severity ON anomaly_detections(severity)',
      
      // 性能指标索引
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name)',
      
      // 系统资源索引
      'CREATE INDEX IF NOT EXISTS idx_system_resources_timestamp ON system_resources(timestamp)',
      
      // 分析执行日志索引
      'CREATE INDEX IF NOT EXISTS idx_analysis_execution_log_type ON analysis_execution_log(analysis_type)',
      'CREATE INDEX IF NOT EXISTS idx_analysis_execution_log_start_time ON analysis_execution_log(start_time)',
      
      // 缓存统计索引
      'CREATE INDEX IF NOT EXISTS idx_cache_statistics_timestamp ON cache_statistics(timestamp)',
      
      // 缓存条目索引
      'CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at)',
      
      // 仪表板数据索引
      'CREATE INDEX IF NOT EXISTS idx_dashboard_data_dashboard_id ON dashboard_data(dashboard_id)',
      'CREATE INDEX IF NOT EXISTS idx_dashboard_data_timestamp ON dashboard_data(timestamp)',
      
      // 生成报告索引
      'CREATE INDEX IF NOT EXISTS idx_generated_reports_template_id ON generated_reports(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at ON generated_reports(generated_at)',
      
      // ML模型索引
      'CREATE INDEX IF NOT EXISTS idx_ml_models_type ON ml_models(type)',
      'CREATE INDEX IF NOT EXISTS idx_ml_models_updated_at ON ml_models(updated_at)',
      
      // 模型训练历史索引
      'CREATE INDEX IF NOT EXISTS idx_model_training_history_model_id ON model_training_history(model_id)',
      'CREATE INDEX IF NOT EXISTS idx_model_training_history_start ON model_training_history(training_start)',
      
      // 模型预测历史索引
      'CREATE INDEX IF NOT EXISTS idx_model_predictions_model_id ON model_predictions(model_id)',
      'CREATE INDEX IF NOT EXISTS idx_model_predictions_time ON model_predictions(prediction_time)'
    ];

    for (const indexSql of indexes) {
      try {
        this.db.exec(indexSql);
      } catch (error) {
        console.warn(`⚠️  索引创建警告: ${error.message}`);
      }
    }

    console.log(`✅ 创建 ${indexes.length} 个数据库索引`);
  }

  async validateDatabase() {
    console.log('🔄 验证数据库结构...');
    
    const requiredTables = [
      'analytics_results',
      'analysis_insights',
      'prediction_results',
      'anomaly_detections',
      'performance_metrics',
      'system_resources',
      'analysis_execution_log',
      'cache_statistics',
      'cache_entries',
      'dashboard_configs',
      'dashboard_data',
      'report_templates',
      'generated_reports',
      'ml_models',
      'model_training_history',
      'model_predictions',
      'migration_history'
    ];

    const existingTables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all().map(row => row.name);

    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`缺少必需的表: ${missingTables.join(', ')}`);
    }

    console.log(`✅ 数据库结构验证通过 (${existingTables.length} 个表)`);
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('✅ 数据库连接已关闭');
    }
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  const dbPath = args[0] || './analytics.db';
  const options = {
    verbose: args.includes('--verbose'),
    backup: !args.includes('--no-backup')
  };

  const migration = new DatabaseMigration(dbPath, options);
  
  migration.initialize()
    .then(() => {
      console.log('🎉 数据库迁移成功完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 数据库迁移失败:', error);
      process.exit(1);
    })
    .finally(() => {
      migration.close();
    });
}

module.exports = DatabaseMigration;
