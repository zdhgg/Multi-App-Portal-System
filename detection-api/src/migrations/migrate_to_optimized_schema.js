/**
 * 数据库结构优化迁移脚本
 * 将现有数据迁移到优化后的表结构
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseOptimizationMigration {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.stats = {
      coreRecordsMigrated: 0,
      extendedRecordsMigrated: 0,
      historyRecordsMigrated: 0,
      performanceRecordsMigrated: 0,
      errors: 0,
      startTime: Date.now(),
      endTime: null
    };
    this.errors = [];
  }

  async migrate() {
    console.log('🚀 开始数据库结构优化迁移...\n');
    
    try {
      // 1. 连接数据库
      this.connectDatabase();
      
      // 2. 验证当前结构
      await this.validateCurrentSchema();
      
      // 3. 创建优化后的表结构
      await this.createOptimizedSchema();
      
      // 4. 迁移核心端口分配数据
      await this.migrateCorePortAllocations();
      
      // 5. 迁移扩展端口数据
      await this.migrateExtendedPortData();
      
      // 6. 迁移历史数据
      await this.migrateHistoryData();
      
      // 7. 迁移性能数据
      await this.migratePerformanceData();
      
      // 8. 验证迁移结果
      await this.validateMigration();
      
      // 9. 创建触发器和约束
      await this.createTriggersAndConstraints();
      
      // 10. 生成迁移报告
      this.generateMigrationReport();
      
    } catch (error) {
      console.error('❌ 迁移失败:', error.message);
      this.errors.push(`迁移失败: ${error.message}`);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  connectDatabase() {
    console.log('📊 连接数据库...');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    console.log('✓ 数据库连接成功\n');
  }

  async validateCurrentSchema() {
    console.log('🔍 验证当前数据库结构...');
    
    try {
      // 检查必要的表是否存在
      const requiredTables = ['unified_port_allocations', 'port_usage_history'];
      
      for (const table of requiredTables) {
        const result = this.db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(table);
        
        if (!result) {
          throw new Error(`必需的表 ${table} 不存在`);
        }
      }
      
      // 统计现有数据
      const allocationsCount = this.db.prepare('SELECT COUNT(*) as count FROM unified_port_allocations').get().count;
      const historyCount = this.db.prepare('SELECT COUNT(*) as count FROM port_usage_history').get().count;
      
      console.log(`  📋 现有数据统计:`);
      console.log(`     - 端口分配记录: ${allocationsCount}`);
      console.log(`     - 历史记录: ${historyCount}`);
      console.log('✓ 当前结构验证完成\n');
      
    } catch (error) {
      console.error('❌ 结构验证失败:', error.message);
      throw error;
    }
  }

  async createOptimizedSchema() {
    console.log('🏗️ 创建优化后的表结构...');
    
    try {
      // 读取并执行优化SQL脚本
      const sqlPath = path.join(__dirname, '002_database_optimization.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      
      // 分割SQL语句并执行
      const statements = sqlContent.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            this.db.exec(statement);
          } catch (error) {
            // 忽略一些预期的错误（如表已存在）
            if (!error.message.includes('already exists')) {
              console.warn(`警告: SQL执行失败: ${error.message}`);
            }
          }
        }
      }
      
      console.log('✓ 优化表结构创建完成\n');
      
    } catch (error) {
      console.error('❌ 创建优化结构失败:', error.message);
      throw error;
    }
  }

  async migrateCorePortAllocations() {
    console.log('📦 迁移核心端口分配数据...');
    
    try {
      // 映射函数
      const mapAllocationType = (type) => {
        const mapping = {
          'frontend': 0, 'backend': 1, 'api': 2, 'websocket': 3,
          'database': 4, 'system': 5, 'other': 6
        };
        return mapping[type] || 6;
      };

      const mapProtocol = (protocol) => {
        const mapping = {
          'http': 0, 'https': 1, 'ws': 2, 'wss': 3,
          'tcp': 4, 'udp': 5, 'grpc': 6
        };
        return mapping[protocol] || 0;
      };

      const mapStatus = (status) => {
        const mapping = {
          'allocated': 0, 'active': 1, 'inactive': 2, 'zombie': 3,
          'released': 4, 'reserved': 5, 'conflict': 6
        };
        return mapping[status] || 0;
      };

      const mapCreatedBy = (createdBy) => {
        const mapping = {
          'system': 0, 'user': 1, 'migration_script': 2, 'json_migration': 2, 'api': 3
        };
        return mapping[createdBy] || 0;
      };

      // 获取所有现有分配记录
      const allocations = this.db.prepare(`
        SELECT * FROM unified_port_allocations
      `).all();

      const insertCoreStmt = this.db.prepare(`
        INSERT INTO port_allocations_core (
          id, port, app_id, app_name, allocation_type, protocol, status,
          allocated_at, last_verified, expires_at, released_at, process_id,
          created_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((allocations) => {
        for (const allocation of allocations) {
          try {
            insertCoreStmt.run(
              allocation.id,
              allocation.port,
              allocation.app_id,
              allocation.app_name,
              mapAllocationType(allocation.allocation_type),
              mapProtocol(allocation.protocol),
              mapStatus(allocation.status),
              allocation.allocated_at ? Math.floor(new Date(allocation.allocated_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
              allocation.last_verified ? Math.floor(new Date(allocation.last_verified).getTime() / 1000) : Math.floor(Date.now() / 1000),
              allocation.expires_at ? Math.floor(new Date(allocation.expires_at).getTime() / 1000) : null,
              allocation.released_at ? Math.floor(new Date(allocation.released_at).getTime() / 1000) : null,
              allocation.process_id,
              mapCreatedBy(allocation.created_by),
              allocation.updated_at ? Math.floor(new Date(allocation.updated_at).getTime() / 1000) : Math.floor(Date.now() / 1000)
            );
            
            this.stats.coreRecordsMigrated++;
          } catch (error) {
            console.error(`迁移核心记录失败 ${allocation.id}:`, error.message);
            this.stats.errors++;
          }
        }
      });

      transaction(allocations);
      
      console.log(`✓ 核心端口分配数据迁移完成: ${this.stats.coreRecordsMigrated} 条记录\n`);
      
    } catch (error) {
      console.error('❌ 核心数据迁移失败:', error.message);
      throw error;
    }
  }

  async migrateExtendedPortData() {
    console.log('📋 迁移扩展端口数据...');
    
    try {
      // 获取所有现有分配记录的扩展信息
      const allocations = this.db.prepare(`
        SELECT * FROM unified_port_allocations
        WHERE process_name IS NOT NULL 
           OR process_command IS NOT NULL 
           OR tech_stack IS NOT NULL 
           OR description IS NOT NULL 
           OR tags IS NOT NULL 
           OR priority != 50
           OR configuration IS NOT NULL
      `).all();

      const insertExtendedStmt = this.db.prepare(`
        INSERT INTO port_allocations_extended (
          allocation_id, process_name, process_command, tech_stack,
          description, tags, priority, renewal_count, max_renewals, custom_config
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((allocations) => {
        for (const allocation of allocations) {
          try {
            let renewalCount = 0;
            let maxRenewals = 10;
            let customConfig = null;

            // 解析配置JSON
            if (allocation.configuration) {
              try {
                const config = JSON.parse(allocation.configuration);
                renewalCount = config.renewalCount || 0;
                maxRenewals = config.maxRenewals || 10;
                
                // 只保留非标准配置
                const standardKeys = ['renewalCount', 'maxRenewals'];
                const customKeys = Object.keys(config).filter(key => !standardKeys.includes(key));
                if (customKeys.length > 0) {
                  const customConfigObj = {};
                  customKeys.forEach(key => customConfigObj[key] = config[key]);
                  customConfig = JSON.stringify(customConfigObj);
                }
              } catch (error) {
                console.warn(`解析配置JSON失败 ${allocation.id}:`, error.message);
              }
            }

            insertExtendedStmt.run(
              allocation.id,
              allocation.process_name,
              allocation.process_command,
              allocation.tech_stack,
              allocation.description,
              allocation.tags,
              allocation.priority || 50,
              renewalCount,
              maxRenewals,
              customConfig
            );
            
            this.stats.extendedRecordsMigrated++;
          } catch (error) {
            console.error(`迁移扩展记录失败 ${allocation.id}:`, error.message);
            this.stats.errors++;
          }
        }
      });

      transaction(allocations);
      
      console.log(`✓ 扩展端口数据迁移完成: ${this.stats.extendedRecordsMigrated} 条记录\n`);
      
    } catch (error) {
      console.error('❌ 扩展数据迁移失败:', error.message);
      throw error;
    }
  }

  async migrateHistoryData() {
    console.log('📚 迁移历史数据...');
    
    try {
      const mapAction = (action) => {
        const mapping = {
          'allocated': 0, 'released': 1, 'verified': 2, 'conflict_detected': 3,
          'conflict_resolved': 4, 'expired': 5, 'force_released': 6,
          'lease_created': 7, 'lease_renewed': 8
        };
        return mapping[action] || 0;
      };

      const mapResult = (result) => {
        const mapping = { 'success': 0, 'failed': 1, 'partial': 2 };
        return mapping[result] || 0;
      };

      const mapInitiatedBy = (initiatedBy) => {
        const mapping = {
          'system': 0, 'system_trigger': 0, 'user': 1, 'api': 2, 'migration_script': 3
        };
        return mapping[initiatedBy] || 0;
      };

      // 获取最近30天的历史记录
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      
      const recentHistory = this.db.prepare(`
        SELECT * FROM port_usage_history
        WHERE strftime('%s', timestamp) > ?
        ORDER BY timestamp DESC
      `).all(thirtyDaysAgo);

      const olderHistory = this.db.prepare(`
        SELECT * FROM port_usage_history
        WHERE strftime('%s', timestamp) <= ?
        ORDER BY timestamp DESC
      `).all(thirtyDaysAgo);

      // 迁移最近的历史记录到当前表
      const insertCurrentStmt = this.db.prepare(`
        INSERT INTO port_usage_history_current (
          id, port, app_id, action, result, response_time_ms,
          initiated_by, timestamp, details, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 迁移较老的历史记录到归档表
      const insertArchiveStmt = this.db.prepare(`
        INSERT INTO port_usage_history_archive (
          id, port, app_id, action, result, response_time_ms,
          initiated_by, timestamp, details, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const migrateHistoryBatch = (records, insertStmt, type) => {
        const transaction = this.db.transaction((records) => {
          for (const record of records) {
            try {
              insertStmt.run(
                record.id,
                record.port,
                record.app_id,
                mapAction(record.action),
                mapResult(record.result),
                record.response_time_ms,
                mapInitiatedBy(record.initiated_by),
                Math.floor(new Date(record.timestamp).getTime() / 1000),
                record.details,
                record.error_message
              );
              
              this.stats.historyRecordsMigrated++;
            } catch (error) {
              console.error(`迁移${type}历史记录失败 ${record.id}:`, error.message);
              this.stats.errors++;
            }
          }
        });
        
        transaction(records);
      };

      migrateHistoryBatch(recentHistory, insertCurrentStmt, '当前');
      migrateHistoryBatch(olderHistory, insertArchiveStmt, '归档');
      
      console.log(`✓ 历史数据迁移完成: ${this.stats.historyRecordsMigrated} 条记录`);
      console.log(`  - 当前表: ${recentHistory.length} 条记录`);
      console.log(`  - 归档表: ${olderHistory.length} 条记录\n`);
      
    } catch (error) {
      console.error('❌ 历史数据迁移失败:', error.message);
      throw error;
    }
  }

  async migratePerformanceData() {
    console.log('📊 迁移性能数据...');
    
    try {
      // 检查性能表是否存在
      const perfTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='port_performance_metrics'
      `).get();

      if (!perfTableExists) {
        console.log('  ⚠️ 性能表不存在，跳过性能数据迁移\n');
        return;
      }

      // 获取最近24小时的性能数据
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      
      const recentMetrics = this.db.prepare(`
        SELECT * FROM port_performance_metrics
        WHERE strftime('%s', collected_at) > ?
        ORDER BY collected_at DESC
      `).all(oneDayAgo);

      if (recentMetrics.length === 0) {
        console.log('  📊 没有找到最近的性能数据\n');
        return;
      }

      const insertRealtimeStmt = this.db.prepare(`
        INSERT INTO port_performance_realtime (
          port, app_id, response_time_ms, throughput_kbps, concurrent_connections,
          error_rate, cpu_usage_percent, memory_usage_mb, bytes_sent, bytes_received,
          health_score, availability_percent, collection_method, collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((metrics) => {
        for (const metric of metrics) {
          try {
            insertRealtimeStmt.run(
              metric.port,
              metric.app_id,
              Math.min(metric.response_time_ms || 0, 65535),
              Math.floor((metric.throughput_mbps || 0) * 1024), // 转换为KB/s
              Math.min(metric.concurrent_connections || 0, 65535),
              Math.min(Math.floor((metric.error_rate || 0) * 1000), 1000), // 转换为千分比
              Math.min(metric.cpu_usage_percent || 0, 100),
              Math.min(metric.memory_usage_mb || 0, 65535),
              metric.bytes_sent || 0,
              metric.bytes_received || 0,
              Math.min(metric.health_score || 100, 100),
              Math.min(metric.availability_percent || 100, 100),
              0, // auto
              Math.floor(new Date(metric.collected_at).getTime() / 1000)
            );
            
            this.stats.performanceRecordsMigrated++;
          } catch (error) {
            console.error(`迁移性能记录失败:`, error.message);
            this.stats.errors++;
          }
        }
      });

      transaction(recentMetrics);
      
      console.log(`✓ 性能数据迁移完成: ${this.stats.performanceRecordsMigrated} 条记录\n`);
      
    } catch (error) {
      console.error('❌ 性能数据迁移失败:', error.message);
      // 性能数据迁移失败不应该阻止整个迁移过程
      this.errors.push(`性能数据迁移失败: ${error.message}`);
    }
  }

  async validateMigration() {
    console.log('✅ 验证迁移结果...');
    
    try {
      // 验证核心数据
      const coreCount = this.db.prepare('SELECT COUNT(*) as count FROM port_allocations_core').get().count;
      const originalCount = this.db.prepare('SELECT COUNT(*) as count FROM unified_port_allocations').get().count;
      
      if (coreCount !== originalCount) {
        throw new Error(`核心数据迁移不完整: 原始 ${originalCount}, 迁移后 ${coreCount}`);
      }

      // 验证数据完整性
      const sampleValidation = this.db.prepare(`
        SELECT 
          upa.id, upa.port, upa.app_id,
          pc.port as new_port, pc.app_id as new_app_id
        FROM unified_port_allocations upa
        JOIN port_allocations_core pc ON upa.id = pc.id
        WHERE upa.port != pc.port OR upa.app_id != pc.app_id
        LIMIT 5
      `).all();

      if (sampleValidation.length > 0) {
        throw new Error(`数据完整性验证失败: 发现 ${sampleValidation.length} 条不匹配记录`);
      }

      console.log('✓ 迁移结果验证通过\n');
      
    } catch (error) {
      console.error('❌ 迁移验证失败:', error.message);
      throw error;
    }
  }

  async createTriggersAndConstraints() {
    console.log('🔧 创建触发器和约束...');
    
    try {
      // 自动更新时间戳触发器
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_port_core_timestamp 
        AFTER UPDATE ON port_allocations_core
        BEGIN
          UPDATE port_allocations_core 
          SET updated_at = strftime('%s', 'now')
          WHERE id = NEW.id;
        END;
      `);

      // 历史记录自动归档触发器
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS auto_archive_history
        AFTER INSERT ON port_usage_history_current
        WHEN NEW.timestamp < strftime('%s', 'now', '-30 days')
        BEGIN
          INSERT INTO port_usage_history_archive 
          SELECT * FROM port_usage_history_current WHERE id = NEW.id;
          DELETE FROM port_usage_history_current WHERE id = NEW.id;
        END;
      `);

      console.log('✓ 触发器和约束创建完成\n');
      
    } catch (error) {
      console.error('❌ 创建触发器失败:', error.message);
      // 触发器创建失败不应该阻止迁移
      this.errors.push(`触发器创建失败: ${error.message}`);
    }
  }

  generateMigrationReport() {
    this.stats.endTime = Date.now();
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
    
    console.log('📋 迁移完成报告');
    console.log('='.repeat(50));
    console.log(`⏱️  总耗时: ${duration} 秒`);
    console.log(`📦 核心记录迁移: ${this.stats.coreRecordsMigrated}`);
    console.log(`📋 扩展记录迁移: ${this.stats.extendedRecordsMigrated}`);
    console.log(`📚 历史记录迁移: ${this.stats.historyRecordsMigrated}`);
    console.log(`📊 性能记录迁移: ${this.stats.performanceRecordsMigrated}`);
    console.log(`❌ 错误数量: ${this.stats.errors}`);
    
    if (this.errors.length > 0) {
      console.log('\n⚠️  警告和错误:');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🎉 数据库结构优化迁移完成!');
  }
}

// 主执行函数
async function main() {
  const dbPath = process.argv[2] || path.join(__dirname, '../../database.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
  }

  const migration = new DatabaseOptimizationMigration(dbPath);
  
  try {
    await migration.migrate();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = DatabaseOptimizationMigration;
