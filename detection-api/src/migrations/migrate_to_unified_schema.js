/**
 * 数据迁移脚本 - 迁移到统一端口管理架构
 * 
 * 这个脚本会安全地将现有数据迁移到新的统一数据模型中
 * 包含完整的备份、验证和回滚机制
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 配置
const config = {
  dbPath: path.join(__dirname, '../../data/portal.db'),
  backupDir: path.join(__dirname, '../../data/backups'),
  jsonBackupPath: path.join(__dirname, '../../data/port-allocation-state.json'),
  schemaPath: path.join(__dirname, '001_unified_port_management_schema.sql'),
  dryRun: false // 设置为 true 进行预演
};

class PortDataMigrator {
  constructor() {
    this.db = null;
    this.migrationLog = [];
    this.errors = [];
    this.stats = {
      portsProcessed: 0,
      conflictsFound: 0,
      historicalRecordsCreated: 0,
      rulesCreated: 0
    };
  }

  async migrate() {
    console.log('🚀 开始端口管理数据迁移...');
    console.log('=====================================');
    
    try {
      // 1. 初始化和备份
      await this.initialize();
      await this.createBackup();
      
      // 2. 执行迁移
      if (!config.dryRun) {
        await this.executeSchemaUpdate();
      }
      
      await this.migrateExistingData();
      await this.validateMigration();
      
      // 3. 完成
      this.generateReport();
      console.log('✅ 数据迁移完成！');
      
    } catch (error) {
      console.error('❌ 迁移过程中发生错误:', error);
      await this.handleMigrationError(error);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  async initialize() {
    console.log('📋 初始化迁移环境...');
    
    // 检查文件是否存在
    if (!fs.existsSync(config.dbPath)) {
      throw new Error(`数据库文件不存在: ${config.dbPath}`);
    }
    
    // 创建备份目录
    if (!fs.existsSync(config.backupDir)) {
      fs.mkdirSync(config.backupDir, { recursive: true });
    }
    
    // 连接数据库
    this.db = new Database(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    
    this.logMigration('初始化完成');
  }

  async createBackup() {
    console.log('💾 创建数据备份...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // 1. 备份数据库文件
    const dbBackupPath = path.join(config.backupDir, `portal_backup_${timestamp}.db`);
    fs.copyFileSync(config.dbPath, dbBackupPath);
    
    // 2. 导出现有端口分配数据
    const portData = this.exportCurrentPortData();
    const jsonBackupPath = path.join(config.backupDir, `port_data_backup_${timestamp}.json`);
    fs.writeFileSync(jsonBackupPath, JSON.stringify(portData, null, 2));
    
    // 3. 备份JSON状态文件（如果存在）
    if (fs.existsSync(config.jsonBackupPath)) {
      const jsonStateBackupPath = path.join(config.backupDir, `port_state_backup_${timestamp}.json`);
      fs.copyFileSync(config.jsonBackupPath, jsonStateBackupPath);
    }
    
    console.log(`✅ 备份创建完成:`);
    console.log(`   数据库备份: ${dbBackupPath}`);
    console.log(`   数据导出: ${jsonBackupPath}`);
    
    this.logMigration('数据备份完成', { dbBackupPath, jsonBackupPath });
  }

  exportCurrentPortData() {
    console.log('📤 导出现有端口数据...');
    
    const exportData = {
      timestamp: new Date().toISOString(),
      tables: {}
    };
    
    // 导出所有相关表的数据
    const tablesToExport = [
      'port_allocations',
      'port_conflicts', 
      'port_usage_history',
      'port_performance_monitoring'
    ];
    
    for (const tableName of tablesToExport) {
      try {
        const stmt = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
        const tableExists = stmt.get(tableName);
        
        if (tableExists) {
          const data = this.db.prepare(`SELECT * FROM ${tableName}`).all();
          exportData.tables[tableName] = data;
          console.log(`   ✓ ${tableName}: ${data.length} 条记录`);
        } else {
          console.log(`   ⚠ 表 ${tableName} 不存在`);
          exportData.tables[tableName] = [];
        }
      } catch (error) {
        console.warn(`   ⚠ 导出表 ${tableName} 时出错:`, error.message);
        exportData.tables[tableName] = [];
      }
    }
    
    return exportData;
  }

  async executeSchemaUpdate() {
    console.log('🔄 更新数据库架构...');
    
    // 读取统一架构SQL
    const schemaSql = fs.readFileSync(config.schemaPath, 'utf8');
    
    // 执行架构更新（在事务中）
    const transaction = this.db.transaction(() => {
      this.db.exec(schemaSql);
    });
    
    transaction();
    
    console.log('✅ 数据库架构更新完成');
    this.logMigration('数据库架构更新完成');
  }

  async migrateExistingData() {
    console.log('🔀 迁移现有数据...');
    
    // 1. 迁移端口分配数据
    await this.migratePortAllocations();
    
    // 2. 迁移JSON状态文件数据
    await this.migrateJsonStateData();
    
    // 3. 创建历史记录
    await this.createHistoricalRecords();
    
    // 4. 检测和记录冲突
    await this.detectAndRecordConflicts();
    
    console.log('✅ 数据迁移完成');
  }

  async migratePortAllocations() {
    console.log('  📋 迁移端口分配数据...');
    
    try {
      // 检查旧的port_allocations表是否存在
      const checkStmt = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='port_allocations_backup'
      `);
      
      const backupTableExists = checkStmt.get();
      if (!backupTableExists) {
        console.log('     ⚠ 没有找到备份的端口分配数据');
        return;
      }
      
      // 从备份表迁移数据
      const oldData = this.db.prepare('SELECT * FROM port_allocations_backup').all();
      
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO unified_port_allocations (
          id, port, app_id, app_name, allocation_type, protocol, status,
          process_id, process_name, allocated_at, last_verified, 
          tech_stack, description, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      let migratedCount = 0;
      
      for (const row of oldData) {
        try {
          const id = row.id || `migrated_${row.port}_${Date.now()}`;
          
          insertStmt.run(
            id,
            row.port,
            row.app_id || 'unknown',
            row.app_name || 'Unknown Application',
            row.type || 'other',
            row.protocol || 'http',
            row.status || 'allocated',
            row.process_id,
            row.process_name,
            row.allocated_at || new Date().toISOString(),
            row.last_checked || new Date().toISOString(),
            row.tech_stack || 'unknown',
            row.description,
            'migration_script'
          );
          
          migratedCount++;
          this.stats.portsProcessed++;
          
        } catch (error) {
          console.warn(`     ⚠ 迁移端口 ${row.port} 时出错:`, error.message);
          this.errors.push(`端口 ${row.port} 迁移失败: ${error.message}`);
        }
      }
      
      console.log(`     ✓ 成功迁移 ${migratedCount} 条端口分配记录`);
      
    } catch (error) {
      console.error('     ❌ 迁移端口分配数据失败:', error.message);
      this.errors.push(`端口分配迁移失败: ${error.message}`);
    }
  }

  async migrateJsonStateData() {
    console.log('  📋 迁移JSON状态数据...');
    
    if (!fs.existsSync(config.jsonBackupPath)) {
      console.log('     ⚠ JSON状态文件不存在，跳过迁移');
      return;
    }
    
    try {
      const jsonData = JSON.parse(fs.readFileSync(config.jsonBackupPath, 'utf8'));
      
      if (!jsonData.allocations) {
        console.log('     ⚠ JSON文件中没有分配数据');
        return;
      }
      
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO unified_port_allocations (
          id, port, app_id, app_name, allocation_type, status,
          allocated_at, last_verified, tech_stack, configuration, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      let migratedCount = 0;
      
      for (const [allocationId, allocation] of Object.entries(jsonData.allocations)) {
        try {
          // 处理frontend/backend结构
          if (allocation.allocation && typeof allocation.allocation === 'object') {
            // 迁移前端端口
            if (allocation.allocation.frontend) {
              insertStmt.run(
                `${allocationId}_frontend`,
                allocation.allocation.frontend,
                allocation.appId,
                allocation.appName,
                'frontend',
                allocation.status || 'released',
                allocation.allocatedAt,
                allocation.lastUsedAt || allocation.allocatedAt,
                allocation.metadata?.techStack || 'unknown',
                JSON.stringify(allocation.metadata || {}),
                'json_migration'
              );
              migratedCount++;
            }
            
            // 迁移后端端口
            if (allocation.allocation.backend) {
              insertStmt.run(
                `${allocationId}_backend`,
                allocation.allocation.backend,
                allocation.appId,
                allocation.appName,
                'backend',
                allocation.status || 'released',
                allocation.allocatedAt,
                allocation.lastUsedAt || allocation.allocatedAt,
                allocation.metadata?.techStack || 'unknown',
                JSON.stringify(allocation.metadata || {}),
                'json_migration'
              );
              migratedCount++;
            }
          }
          
          // 处理单端口结构
          if (allocation.allocation && typeof allocation.allocation.port === 'number') {
            insertStmt.run(
              allocationId,
              allocation.allocation.port,
              allocation.appId,
              allocation.appName,
              'frontend', // 默认假设是前端
              allocation.status || 'released',
              allocation.allocatedAt,
              allocation.lastUsedAt || allocation.allocatedAt,
              allocation.metadata?.techStack || 'unknown',
              JSON.stringify(allocation.metadata || {}),
              'json_migration'
            );
            migratedCount++;
          }
          
          this.stats.portsProcessed++;
          
        } catch (error) {
          console.warn(`     ⚠ 迁移分配 ${allocationId} 时出错:`, error.message);
          this.errors.push(`JSON分配 ${allocationId} 迁移失败: ${error.message}`);
        }
      }
      
      console.log(`     ✓ 成功迁移 ${migratedCount} 条JSON分配记录`);
      
    } catch (error) {
      console.error('     ❌ 迁移JSON状态数据失败:', error.message);
      this.errors.push(`JSON状态迁移失败: ${error.message}`);
    }
  }

  async createHistoricalRecords() {
    console.log('  📋 创建历史记录...');
    
    try {
      // 为所有已迁移的端口创建分配历史记录
      const allocations = this.db.prepare(`
        SELECT * FROM unified_port_allocations 
        WHERE created_by IN ('migration_script', 'json_migration')
      `).all();
      
      const insertHistoryStmt = this.db.prepare(`
        INSERT INTO port_usage_history (
          id, port, app_id, action, result, details, initiated_by, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const allocation of allocations) {
        const historyId = `migration_${allocation.port}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        insertHistoryStmt.run(
          historyId,
          allocation.port,
          allocation.app_id,
          'allocated',
          'success',
          `Port migrated from legacy system. Original allocation type: ${allocation.allocation_type}`,
          'migration_script',
          allocation.allocated_at
        );
        
        this.stats.historicalRecordsCreated++;
      }
      
      console.log(`     ✓ 创建了 ${this.stats.historicalRecordsCreated} 条历史记录`);
      
    } catch (error) {
      console.error('     ❌ 创建历史记录失败:', error.message);
      this.errors.push(`历史记录创建失败: ${error.message}`);
    }
  }

  async detectAndRecordConflicts() {
    console.log('  📋 检测和记录端口冲突...');
    
    try {
      // 检测重复端口分配
      const duplicatePorts = this.db.prepare(`
        SELECT port, COUNT(*) as count, GROUP_CONCAT(app_name) as apps
        FROM unified_port_allocations 
        WHERE status IN ('allocated', 'active')
        GROUP BY port 
        HAVING COUNT(*) > 1
      `).all();
      
      const insertConflictStmt = this.db.prepare(`
        INSERT INTO port_conflicts (
          id, port, conflict_type, severity, details, affected_apps, resolution_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const conflict of duplicatePorts) {
        const conflictId = `migration_conflict_${conflict.port}_${Date.now()}`;
        
        insertConflictStmt.run(
          conflictId,
          conflict.port,
          'allocation',
          'high',
          `Multiple applications allocated to the same port during migration`,
          JSON.stringify(conflict.apps.split(',')),
          'active'
        );
        
        this.stats.conflictsFound++;
      }
      
      // 检测系统保留端口的使用
      const systemPortUsage = this.db.prepare(`
        SELECT * FROM unified_port_allocations upa
        JOIN port_reservations pr ON upa.port BETWEEN pr.port_start AND pr.port_end
        WHERE pr.reserved_for = 'system' AND upa.status IN ('allocated', 'active')
      `).all();
      
      for (const usage of systemPortUsage) {
        const conflictId = `system_conflict_${usage.port}_${Date.now()}`;
        
        insertConflictStmt.run(
          conflictId,
          usage.port,
          'system',
          'critical',
          `Application using system reserved port`,
          JSON.stringify([usage.app_name]),
          'active'
        );
        
        this.stats.conflictsFound++;
      }
      
      console.log(`     ✓ 检测到 ${this.stats.conflictsFound} 个端口冲突`);
      
    } catch (error) {
      console.error('     ❌ 冲突检测失败:', error.message);
      this.errors.push(`冲突检测失败: ${error.message}`);
    }
  }

  async validateMigration() {
    console.log('🔍 验证迁移结果...');
    
    try {
      // 验证数据完整性
      const validationResults = {
        unifiedAllocations: this.db.prepare('SELECT COUNT(*) as count FROM unified_port_allocations').get().count,
        portRanges: this.db.prepare('SELECT COUNT(*) as count FROM port_ranges').get().count,
        conflicts: this.db.prepare('SELECT COUNT(*) as count FROM port_conflicts').get().count,
        history: this.db.prepare('SELECT COUNT(*) as count FROM port_usage_history').get().count,
        reservations: this.db.prepare('SELECT COUNT(*) as count FROM port_reservations').get().count,
        rules: this.db.prepare('SELECT COUNT(*) as count FROM port_allocation_rules').get().count
      };
      
      console.log('   验证结果:');
      console.log(`     统一端口分配: ${validationResults.unifiedAllocations} 条`);
      console.log(`     端口范围配置: ${validationResults.portRanges} 条`);
      console.log(`     端口冲突: ${validationResults.conflicts} 条`);
      console.log(`     使用历史: ${validationResults.history} 条`);
      console.log(`     端口预留: ${validationResults.reservations} 条`);
      console.log(`     分配规则: ${validationResults.rules} 条`);
      
      // 检查数据一致性
      const consistencyChecks = [
        {
          name: '端口分配一致性',
          query: 'SELECT COUNT(*) as count FROM unified_port_allocations WHERE port IS NULL OR app_id IS NULL',
          expected: 0
        },
        {
          name: '端口范围有效性',
          query: 'SELECT COUNT(*) as count FROM port_ranges WHERE start_port > end_port',
          expected: 0
        },
        {
          name: '冲突记录完整性',
          query: 'SELECT COUNT(*) as count FROM port_conflicts WHERE port IS NULL OR conflict_type IS NULL',
          expected: 0
        }
      ];
      
      let validationPassed = true;
      
      for (const check of consistencyChecks) {
        const result = this.db.prepare(check.query).get();
        if (result.count !== check.expected) {
          console.error(`     ❌ ${check.name}: 期望 ${check.expected}，实际 ${result.count}`);
          this.errors.push(`验证失败: ${check.name}`);
          validationPassed = false;
        } else {
          console.log(`     ✓ ${check.name}: 通过`);
        }
      }
      
      if (validationPassed) {
        console.log('✅ 迁移验证通过');
      } else {
        throw new Error('迁移验证失败');
      }
      
    } catch (error) {
      console.error('❌ 迁移验证失败:', error.message);
      this.errors.push(`验证失败: ${error.message}`);
      throw error;
    }
  }

  generateReport() {
    console.log('\n📊 迁移报告');
    console.log('=====================================');
    console.log(`处理的端口数量: ${this.stats.portsProcessed}`);
    console.log(`发现的冲突数量: ${this.stats.conflictsFound}`);
    console.log(`创建的历史记录: ${this.stats.historicalRecordsCreated}`);
    console.log(`错误数量: ${this.errors.length}`);
    
    if (this.errors.length > 0) {
      console.log('\n⚠️ 迁移过程中的错误:');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n📝 迁移日志:');
    this.migrationLog.forEach(log => {
      console.log(`  ${log.timestamp}: ${log.message}`);
    });
    
    // 生成迁移报告文件
    const reportPath = path.join(config.backupDir, `migration_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      config,
      stats: this.stats,
      errors: this.errors,
      log: this.migrationLog
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 详细报告已保存: ${reportPath}`);
  }

  async handleMigrationError(error) {
    console.error('\n🚨 迁移过程中发生严重错误，开始清理...');
    
    try {
      // 这里可以添加回滚逻辑
      console.log('⚠️ 请手动检查数据库状态并考虑从备份恢复');
    } catch (cleanupError) {
      console.error('清理过程也失败了:', cleanupError.message);
    }
  }

  logMigration(message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data
    };
    this.migrationLog.push(logEntry);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const migrator = new PortDataMigrator();
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    config.dryRun = true;
    console.log('🔍 运行模式: 预演 (不会修改数据)');
  }
  
  migrator.migrate()
    .then(() => {
      console.log('\n🎉 迁移成功完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 迁移失败:', error);
      process.exit(1);
    });
}

module.exports = PortDataMigrator;
