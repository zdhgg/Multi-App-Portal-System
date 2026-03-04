/**
 * 数据迁移验证工具
 * 
 * 用于验证端口管理数据迁移的完整性和正确性
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class MigrationValidator {
  constructor(dbPath = path.join(__dirname, '../../data/portal.db')) {
    this.dbPath = dbPath;
    this.db = null;
    this.validationResults = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  async validate() {
    console.log('🔍 开始验证端口管理数据迁移...');
    console.log('=====================================');
    
    try {
      this.connectDatabase();
      
      // 执行所有验证测试
      await this.validateSchema();
      await this.validateDataIntegrity();
      await this.validateBusinessLogic();
      await this.validatePerformance();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ 验证过程中发生错误:', error);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  connectDatabase() {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`数据库文件不存在: ${this.dbPath}`);
    }
    
    this.db = new Database(this.dbPath, { readonly: true });
    console.log('✅ 数据库连接成功');
  }

  async validateSchema() {
    console.log('\n📋 验证数据库架构...');
    
    // 验证必需的表是否存在
    const requiredTables = [
      'unified_port_allocations',
      'port_ranges',
      'port_conflicts',
      'port_usage_history',
      'port_performance_metrics',
      'port_reservations',
      'port_allocation_rules'
    ];
    
    for (const tableName of requiredTables) {
      this.validateTable(tableName);
    }
    
    // 验证视图是否存在
    const requiredViews = [
      'active_port_allocations',
      'port_usage_statistics',
      'port_conflict_summary'
    ];
    
    for (const viewName of requiredViews) {
      this.validateView(viewName);
    }
    
    // 验证索引是否存在
    this.validateIndexes();
    
    console.log('✅ 数据库架构验证完成');
  }

  validateTable(tableName) {
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
      
      if (tableInfo.length === 0) {
        this.addFailure(`表 ${tableName} 不存在`);
        return;
      }
      
      this.addSuccess(`表 ${tableName} 存在，包含 ${tableInfo.length} 个字段`);
      
      // 验证特定表的关键字段
      this.validateTableColumns(tableName, tableInfo);
      
    } catch (error) {
      this.addFailure(`验证表 ${tableName} 失败: ${error.message}`);
    }
  }

  validateTableColumns(tableName, columns) {
    const columnNames = columns.map(col => col.name);
    
    const requiredColumns = {
      'unified_port_allocations': ['id', 'port', 'app_id', 'app_name', 'allocation_type', 'status'],
      'port_ranges': ['id', 'name', 'type', 'start_port', 'end_port'],
      'port_conflicts': ['id', 'port', 'conflict_type', 'severity'],
      'port_usage_history': ['id', 'port', 'action', 'timestamp'],
      'port_reservations': ['id', 'port_start', 'port_end', 'reserved_for']
    };
    
    if (requiredColumns[tableName]) {
      for (const requiredCol of requiredColumns[tableName]) {
        if (!columnNames.includes(requiredCol)) {
          this.addFailure(`表 ${tableName} 缺少必需字段: ${requiredCol}`);
        }
      }
    }
  }

  validateView(viewName) {
    try {
      const viewExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='view' AND name=?
      `).get(viewName);
      
      if (!viewExists) {
        this.addFailure(`视图 ${viewName} 不存在`);
        return;
      }
      
      // 尝试查询视图以确保它可以正常工作
      const sampleData = this.db.prepare(`SELECT * FROM ${viewName} LIMIT 1`).all();
      this.addSuccess(`视图 ${viewName} 存在且可查询`);
      
    } catch (error) {
      this.addFailure(`验证视图 ${viewName} 失败: ${error.message}`);
    }
  }

  validateIndexes() {
    try {
      // 获取所有索引
      const indexes = this.db.prepare(`
        SELECT name, tbl_name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const expectedIndexes = [
        'idx_unified_port_allocations_port',
        'idx_unified_port_allocations_app_id',
        'idx_port_conflicts_port',
        'idx_port_ranges_type'
      ];
      
      const existingIndexNames = indexes.map(idx => idx.name);
      
      for (const expectedIndex of expectedIndexes) {
        if (existingIndexNames.includes(expectedIndex)) {
          this.addSuccess(`索引 ${expectedIndex} 存在`);
        } else {
          this.addWarning(`索引 ${expectedIndex} 不存在，可能影响查询性能`);
        }
      }
      
    } catch (error) {
      this.addFailure(`验证索引失败: ${error.message}`);
    }
  }

  async validateDataIntegrity() {
    console.log('\n🔍 验证数据完整性...');
    
    // 1. 验证端口分配数据
    this.validatePortAllocations();
    
    // 2. 验证外键约束
    this.validateForeignKeys();
    
    // 3. 验证数据一致性
    this.validateDataConsistency();
    
    // 4. 验证端口范围
    this.validatePortRanges();
    
    console.log('✅ 数据完整性验证完成');
  }

  validatePortAllocations() {
    try {
      // 检查端口分配表的基本数据质量
      const checks = [
        {
          name: '端口号有效性',
          query: 'SELECT COUNT(*) as count FROM unified_port_allocations WHERE port <= 0 OR port > 65535',
          expected: 0
        },
        {
          name: '必需字段完整性',
          query: 'SELECT COUNT(*) as count FROM unified_port_allocations WHERE port IS NULL OR app_id IS NULL OR status IS NULL',
          expected: 0
        },
        {
          name: '状态值有效性',
          query: `SELECT COUNT(*) as count FROM unified_port_allocations 
                  WHERE status NOT IN ('allocated', 'active', 'inactive', 'zombie', 'released', 'reserved', 'conflict')`,
          expected: 0
        },
        {
          name: '分配类型有效性',
          query: `SELECT COUNT(*) as count FROM unified_port_allocations 
                  WHERE allocation_type NOT IN ('frontend', 'backend', 'api', 'websocket', 'database', 'system', 'other')`,
          expected: 0
        }
      ];
      
      for (const check of checks) {
        const result = this.db.prepare(check.query).get();
        if (result.count === check.expected) {
          this.addSuccess(`${check.name}: 通过`);
        } else {
          this.addFailure(`${check.name}: 期望 ${check.expected}，实际 ${result.count}`);
        }
      }
      
    } catch (error) {
      this.addFailure(`验证端口分配数据失败: ${error.message}`);
    }
  }

  validateForeignKeys() {
    try {
      // 检查外键约束
      const foreignKeyChecks = [
        {
          name: '端口分配 -> 应用',
          query: `SELECT COUNT(*) as count FROM unified_port_allocations upa 
                  LEFT JOIN applications a ON upa.app_id = a.id 
                  WHERE a.id IS NULL AND upa.app_id != 'unknown'`,
          expected: 0
        },
        {
          name: '端口冲突数据完整性',
          query: 'SELECT COUNT(*) as count FROM port_conflicts WHERE port IS NULL',
          expected: 0
        }
      ];
      
      for (const check of foreignKeyChecks) {
        const result = this.db.prepare(check.query).get();
        if (result.count === check.expected) {
          this.addSuccess(`外键约束 - ${check.name}: 通过`);
        } else {
          this.addWarning(`外键约束 - ${check.name}: 发现 ${result.count} 条孤立记录`);
        }
      }
      
    } catch (error) {
      this.addFailure(`验证外键约束失败: ${error.message}`);
    }
  }

  validateDataConsistency() {
    try {
      // 检查数据一致性
      const consistencyChecks = [
        {
          name: '端口重复分配检查',
          query: `SELECT port, COUNT(*) as count FROM unified_port_allocations 
                  WHERE status IN ('allocated', 'active') 
                  GROUP BY port HAVING COUNT(*) > 1`,
          shouldBeEmpty: true
        },
        {
          name: '时间戳逻辑检查',
          query: `SELECT COUNT(*) as count FROM unified_port_allocations 
                  WHERE released_at IS NOT NULL AND released_at < allocated_at`,
          expected: 0
        },
        {
          name: '过期端口状态检查',
          query: `SELECT COUNT(*) as count FROM unified_port_allocations 
                  WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND status NOT IN ('released', 'zombie')`,
          expected: 0
        }
      ];
      
      for (const check of consistencyChecks) {
        if (check.shouldBeEmpty) {
          const conflicts = this.db.prepare(check.query).all();
          if (conflicts.length === 0) {
            this.addSuccess(`${check.name}: 无冲突`);
          } else {
            this.addFailure(`${check.name}: 发现 ${conflicts.length} 个端口重复分配`);
            conflicts.forEach(conflict => {
              this.addFailure(`  端口 ${conflict.port} 被分配了 ${conflict.count} 次`);
            });
          }
        } else {
          const result = this.db.prepare(check.query).get();
          if (result.count === check.expected) {
            this.addSuccess(`${check.name}: 通过`);
          } else {
            this.addFailure(`${check.name}: 期望 ${check.expected}，实际 ${result.count}`);
          }
        }
      }
      
    } catch (error) {
      this.addFailure(`验证数据一致性失败: ${error.message}`);
    }
  }

  validatePortRanges() {
    try {
      // 验证端口范围配置
      const ranges = this.db.prepare('SELECT * FROM port_ranges').all();
      
      if (ranges.length === 0) {
        this.addFailure('没有配置任何端口范围');
        return;
      }
      
      // 检查范围重叠
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          const range1 = ranges[i];
          const range2 = ranges[j];
          
          if (this.rangesOverlap(range1, range2)) {
            this.addWarning(`端口范围重叠: ${range1.name} (${range1.start_port}-${range1.end_port}) 与 ${range2.name} (${range2.start_port}-${range2.end_port})`);
          }
        }
      }
      
      this.addSuccess(`端口范围配置: 共 ${ranges.length} 个范围`);
      
    } catch (error) {
      this.addFailure(`验证端口范围失败: ${error.message}`);
    }
  }

  rangesOverlap(range1, range2) {
    return range1.start_port <= range2.end_port && range2.start_port <= range1.end_port;
  }

  async validateBusinessLogic() {
    console.log('\n💼 验证业务逻辑...');
    
    try {
      // 1. 验证端口分配策略
      this.validateAllocationStrategies();
      
      // 2. 验证冲突检测逻辑
      this.validateConflictDetection();
      
      // 3. 验证历史记录完整性
      this.validateHistoryRecords();
      
      console.log('✅ 业务逻辑验证完成');
      
    } catch (error) {
      this.addFailure(`业务逻辑验证失败: ${error.message}`);
    }
  }

  validateAllocationStrategies() {
    try {
      // 检查分配规则的合理性
      const rules = this.db.prepare('SELECT * FROM port_allocation_rules WHERE enabled = 1').all();
      
      for (const rule of rules) {
        // 验证规则引用的端口范围是否存在
        if (rule.preferred_range_id) {
          const range = this.db.prepare('SELECT * FROM port_ranges WHERE id = ?').get(rule.preferred_range_id);
          if (!range) {
            this.addFailure(`分配规则 "${rule.name}" 引用了不存在的端口范围: ${rule.preferred_range_id}`);
          } else {
            this.addSuccess(`分配规则 "${rule.name}" 配置正确`);
          }
        }
      }
      
    } catch (error) {
      this.addFailure(`验证分配策略失败: ${error.message}`);
    }
  }

  validateConflictDetection() {
    try {
      // 验证冲突记录的完整性
      const activeConflicts = this.db.prepare(`
        SELECT * FROM port_conflicts 
        WHERE resolution_status = 'active'
      `).all();
      
      for (const conflict of activeConflicts) {
        // 验证冲突端口是否确实存在问题
        const allocations = this.db.prepare(`
          SELECT COUNT(*) as count FROM unified_port_allocations 
          WHERE port = ? AND status IN ('allocated', 'active')
        `).get(conflict.port);
        
        if (conflict.conflict_type === 'allocation' && allocations.count <= 1) {
          this.addWarning(`端口 ${conflict.port} 标记为分配冲突，但只有 ${allocations.count} 个活跃分配`);
        }
      }
      
      this.addSuccess(`冲突检测: 发现 ${activeConflicts.length} 个活跃冲突`);
      
    } catch (error) {
      this.addFailure(`验证冲突检测失败: ${error.message}`);
    }
  }

  validateHistoryRecords() {
    try {
      // 验证历史记录的完整性
      const historyCount = this.db.prepare('SELECT COUNT(*) as count FROM port_usage_history').get().count;
      const allocationCount = this.db.prepare('SELECT COUNT(*) as count FROM unified_port_allocations').get().count;
      
      // 每个端口分配至少应该有一条历史记录
      if (historyCount < allocationCount) {
        this.addWarning(`历史记录数量 (${historyCount}) 少于端口分配数量 (${allocationCount})`);
      } else {
        this.addSuccess(`历史记录完整性: ${historyCount} 条历史记录`);
      }
      
    } catch (error) {
      this.addFailure(`验证历史记录失败: ${error.message}`);
    }
  }

  async validatePerformance() {
    console.log('\n⚡ 验证查询性能...');
    
    try {
      const performanceTests = [
        {
          name: '端口查询性能',
          query: 'SELECT * FROM unified_port_allocations WHERE port = 3000',
          maxTime: 10 // 毫秒
        },
        {
          name: '应用端口查询性能',
          query: 'SELECT * FROM unified_port_allocations WHERE app_id = \'test\'',
          maxTime: 20
        },
        {
          name: '状态查询性能',
          query: 'SELECT * FROM unified_port_allocations WHERE status = \'active\'',
          maxTime: 50
        },
        {
          name: '视图查询性能',
          query: 'SELECT * FROM active_port_allocations LIMIT 10',
          maxTime: 100
        }
      ];
      
      for (const test of performanceTests) {
        const startTime = Date.now();
        this.db.prepare(test.query).all();
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (duration <= test.maxTime) {
          this.addSuccess(`${test.name}: ${duration}ms (良好)`);
        } else {
          this.addWarning(`${test.name}: ${duration}ms (超过预期的 ${test.maxTime}ms)`);
        }
      }
      
      console.log('✅ 性能验证完成');
      
    } catch (error) {
      this.addFailure(`性能验证失败: ${error.message}`);
    }
  }

  generateReport() {
    console.log('\n📊 验证报告');
    console.log('=====================================');
    console.log(`✅ 通过: ${this.validationResults.passed.length}`);
    console.log(`❌ 失败: ${this.validationResults.failed.length}`);
    console.log(`⚠️  警告: ${this.validationResults.warnings.length}`);
    
    if (this.validationResults.failed.length > 0) {
      console.log('\n❌ 失败的验证:');
      this.validationResults.failed.forEach((failure, index) => {
        console.log(`  ${index + 1}. ${failure}`);
      });
    }
    
    if (this.validationResults.warnings.length > 0) {
      console.log('\n⚠️ 警告:');
      this.validationResults.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    if (this.validationResults.passed.length > 0) {
      console.log('\n✅ 通过的验证:');
      this.validationResults.passed.forEach((success, index) => {
        console.log(`  ${index + 1}. ${success}`);
      });
    }
    
    const overallResult = this.validationResults.failed.length === 0 ? '通过' : '失败';
    console.log(`\n🎯 总体验证结果: ${overallResult}`);
    
    // 保存验证报告
    const reportPath = path.join(__dirname, '../../data/backups', `validation_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.validationResults,
      summary: {
        passed: this.validationResults.passed.length,
        failed: this.validationResults.failed.length,
        warnings: this.validationResults.warnings.length,
        overallResult
      }
    }, null, 2));
    
    console.log(`\n📄 详细验证报告已保存: ${reportPath}`);
  }

  addSuccess(message) {
    this.validationResults.passed.push(message);
  }

  addFailure(message) {
    this.validationResults.failed.push(message);
  }

  addWarning(message) {
    this.validationResults.warnings.push(message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const validator = new MigrationValidator();
  
  validator.validate()
    .then(() => {
      const hasFailures = validator.validationResults.failed.length > 0;
      if (hasFailures) {
        console.log('\n⚠️ 验证发现问题，请检查报告并修复');
        process.exit(1);
      } else {
        console.log('\n🎉 验证通过！');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('\n💥 验证过程失败:', error);
      process.exit(1);
    });
}

module.exports = MigrationValidator;
