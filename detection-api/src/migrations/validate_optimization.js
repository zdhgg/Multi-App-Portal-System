/**
 * 数据库优化验证脚本
 * 验证优化后的数据库结构和性能
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class OptimizationValidator {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.results = {
      schemaValidation: { passed: 0, failed: 0, errors: [] },
      dataIntegrity: { passed: 0, failed: 0, errors: [] },
      performanceTests: { passed: 0, failed: 0, results: [] },
      compatibilityTests: { passed: 0, failed: 0, errors: [] }
    };
  }

  async validate() {
    console.log('🔍 开始数据库优化验证...\n');
    
    try {
      this.connectDatabase();
      
      await this.validateSchema();
      await this.validateDataIntegrity();
      await this.runPerformanceTests();
      await this.testCompatibility();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ 验证失败:', error.message);
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
    console.log('✓ 数据库连接成功\n');
  }

  async validateSchema() {
    console.log('🏗️ 验证数据库结构...');
    
    const tests = [
      {
        name: '检查优化表是否存在',
        test: () => {
          const tables = ['port_allocations_core', 'port_allocations_extended', 
                         'port_usage_history_current', 'port_performance_realtime'];
          
          for (const table of tables) {
            const result = this.db.prepare(`
              SELECT name FROM sqlite_master 
              WHERE type='table' AND name=?
            `).get(table);
            
            if (!result) {
              throw new Error(`优化表 ${table} 不存在`);
            }
          }
          return true;
        }
      },
      {
        name: '检查索引是否创建',
        test: () => {
          const indexes = ['idx_port_core_port', 'idx_port_core_app_status', 
                          'idx_port_core_expires', 'idx_history_current_port_time'];
          
          for (const index of indexes) {
            const result = this.db.prepare(`
              SELECT name FROM sqlite_master 
              WHERE type='index' AND name=?
            `).get(index);
            
            if (!result) {
              throw new Error(`索引 ${index} 不存在`);
            }
          }
          return true;
        }
      },
      {
        name: '检查视图是否创建',
        test: () => {
          const views = ['active_port_allocations_v2', 'port_usage_statistics_v2'];
          
          for (const view of views) {
            const result = this.db.prepare(`
              SELECT name FROM sqlite_master 
              WHERE type='view' AND name=?
            `).get(view);
            
            if (!result) {
              throw new Error(`视图 ${view} 不存在`);
            }
          }
          return true;
        }
      },
      {
        name: '检查数据类型映射',
        test: () => {
          const mappings = ['allocation_type_mapping', 'protocol_mapping', 'status_mapping'];
          
          for (const mapping of mappings) {
            const result = this.db.prepare(`
              SELECT name FROM sqlite_master 
              WHERE type='view' AND name=?
            `).get(mapping);
            
            if (!result) {
              throw new Error(`映射视图 ${mapping} 不存在`);
            }
          }
          return true;
        }
      }
    ];

    for (const test of tests) {
      try {
        test.test();
        this.results.schemaValidation.passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        this.results.schemaValidation.failed++;
        this.results.schemaValidation.errors.push(`${test.name}: ${error.message}`);
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    console.log(`✓ 结构验证完成: ${this.results.schemaValidation.passed} 通过, ${this.results.schemaValidation.failed} 失败\n`);
  }

  async validateDataIntegrity() {
    console.log('🔍 验证数据完整性...');
    
    const tests = [
      {
        name: '检查核心表数据一致性',
        test: () => {
          // 检查是否有原始表
          const originalExists = this.db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='unified_port_allocations'
          `).get();

          if (!originalExists) {
            console.log('    原始表不存在，跳过数据一致性检查');
            return true;
          }

          const originalCount = this.db.prepare('SELECT COUNT(*) as count FROM unified_port_allocations').get().count;
          const coreCount = this.db.prepare('SELECT COUNT(*) as count FROM port_allocations_core').get().count;
          
          if (originalCount !== coreCount) {
            throw new Error(`数据数量不匹配: 原始 ${originalCount}, 核心 ${coreCount}`);
          }
          
          return true;
        }
      },
      {
        name: '检查端口唯一性',
        test: () => {
          const duplicates = this.db.prepare(`
            SELECT port, COUNT(*) as count 
            FROM port_allocations_core 
            WHERE status != 4 
            GROUP BY port 
            HAVING COUNT(*) > 1
          `).all();
          
          if (duplicates.length > 0) {
            throw new Error(`发现重复端口: ${duplicates.map(d => d.port).join(', ')}`);
          }
          
          return true;
        }
      },
      {
        name: '检查外键关系',
        test: () => {
          const orphanedExtended = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM port_allocations_extended pe
            LEFT JOIN port_allocations_core pc ON pe.allocation_id = pc.id
            WHERE pc.id IS NULL
          `).get().count;
          
          if (orphanedExtended > 0) {
            throw new Error(`发现孤立的扩展记录: ${orphanedExtended} 条`);
          }
          
          return true;
        }
      },
      {
        name: '检查数据类型范围',
        test: () => {
          // 检查数值字段是否在有效范围内
          const invalidTypes = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM port_allocations_core 
            WHERE allocation_type < 0 OR allocation_type > 6
               OR protocol < 0 OR protocol > 6
               OR status < 0 OR status > 6
          `).get().count;
          
          if (invalidTypes > 0) {
            throw new Error(`发现无效的数据类型值: ${invalidTypes} 条记录`);
          }
          
          return true;
        }
      }
    ];

    for (const test of tests) {
      try {
        test.test();
        this.results.dataIntegrity.passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        this.results.dataIntegrity.failed++;
        this.results.dataIntegrity.errors.push(`${test.name}: ${error.message}`);
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    console.log(`✓ 数据完整性验证完成: ${this.results.dataIntegrity.passed} 通过, ${this.results.dataIntegrity.failed} 失败\n`);
  }

  async runPerformanceTests() {
    console.log('⚡ 运行性能测试...');
    
    // 生成测试数据
    await this.generateTestData();
    
    const tests = [
      {
        name: '端口查询性能',
        test: () => {
          const start = process.hrtime.bigint();
          for (let i = 0; i < 1000; i++) {
            this.db.prepare('SELECT * FROM port_allocations_core WHERE port = ?').get(3000 + i % 100);
          }
          const end = process.hrtime.bigint();
          return Number(end - start) / 1000000; // 转换为毫秒
        }
      },
      {
        name: '状态查询性能',
        test: () => {
          const start = process.hrtime.bigint();
          for (let i = 0; i < 100; i++) {
            this.db.prepare('SELECT * FROM port_allocations_core WHERE status IN (0, 1)').all();
          }
          const end = process.hrtime.bigint();
          return Number(end - start) / 1000000; // 转换为毫秒
        }
      },
      {
        name: '复合查询性能',
        test: () => {
          const start = process.hrtime.bigint();
          for (let i = 0; i < 100; i++) {
            this.db.prepare(`
              SELECT * FROM port_allocations_core 
              WHERE app_id = ? AND status = 0 AND expires_at IS NOT NULL
            `).all(`app-${i % 10}`);
          }
          const end = process.hrtime.bigint();
          return Number(end - start) / 1000000; // 转换为毫秒
        }
      },
      {
        name: '视图查询性能',
        test: () => {
          const start = process.hrtime.bigint();
          for (let i = 0; i < 100; i++) {
            this.db.prepare('SELECT * FROM active_port_allocations_v2 LIMIT 10').all();
          }
          const end = process.hrtime.bigint();
          return Number(end - start) / 1000000; // 转换为毫秒
        }
      }
    ];

    for (const test of tests) {
      try {
        const duration = test.test();
        this.results.performanceTests.passed++;
        this.results.performanceTests.results.push({
          name: test.name,
          duration: duration.toFixed(2)
        });
        console.log(`  ✓ ${test.name}: ${duration.toFixed(2)}ms`);
      } catch (error) {
        this.results.performanceTests.failed++;
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    console.log(`✓ 性能测试完成: ${this.results.performanceTests.passed} 通过, ${this.results.performanceTests.failed} 失败\n`);
  }

  async testCompatibility() {
    console.log('🔄 测试兼容性...');
    
    const tests = [
      {
        name: '测试视图兼容性',
        test: () => {
          // 测试视图是否能正确返回数据
          const result = this.db.prepare('SELECT * FROM active_port_allocations_v2 LIMIT 1').get();
          if (!result) {
            throw new Error('视图查询无结果');
          }
          
          // 检查必要字段是否存在
          const requiredFields = ['id', 'port', 'app_id', 'allocation_type', 'status'];
          for (const field of requiredFields) {
            if (!(field in result)) {
              throw new Error(`视图缺少字段: ${field}`);
            }
          }
          
          return true;
        }
      },
      {
        name: '测试数据类型映射',
        test: () => {
          // 测试数据类型映射是否正确
          const result = this.db.prepare(`
            SELECT 
              pc.allocation_type as type_id,
              atm.name as type_name
            FROM port_allocations_core pc
            JOIN allocation_type_mapping atm ON pc.allocation_type = atm.id
            LIMIT 1
          `).get();
          
          if (!result) {
            throw new Error('数据类型映射查询无结果');
          }
          
          if (typeof result.type_id !== 'number' || typeof result.type_name !== 'string') {
            throw new Error('数据类型映射格式错误');
          }
          
          return true;
        }
      },
      {
        name: '测试时间戳转换',
        test: () => {
          // 测试时间戳转换是否正确
          const result = this.db.prepare(`
            SELECT 
              allocated_at,
              datetime(allocated_at, 'unixepoch') as formatted_time
            FROM port_allocations_core 
            LIMIT 1
          `).get();
          
          if (!result) {
            throw new Error('时间戳转换查询无结果');
          }
          
          if (!result.formatted_time || result.formatted_time.includes('Invalid')) {
            throw new Error('时间戳转换失败');
          }
          
          return true;
        }
      }
    ];

    for (const test of tests) {
      try {
        test.test();
        this.results.compatibilityTests.passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        this.results.compatibilityTests.failed++;
        this.results.compatibilityTests.errors.push(`${test.name}: ${error.message}`);
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    console.log(`✓ 兼容性测试完成: ${this.results.compatibilityTests.passed} 通过, ${this.results.compatibilityTests.failed} 失败\n`);
  }

  async generateTestData() {
    // 检查是否已有测试数据
    const count = this.db.prepare('SELECT COUNT(*) as count FROM port_allocations_core').get().count;
    if (count > 100) {
      console.log('  测试数据已存在，跳过生成');
      return;
    }

    console.log('  生成测试数据...');
    
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO port_allocations_core (
        id, port, app_id, app_name, allocation_type, protocol, status,
        allocated_at, last_verified, expires_at, process_id, created_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        const now = Math.floor(Date.now() / 1000);
        insertStmt.run(
          `test-${i}`,
          3000 + i,
          `app-${i % 10}`,
          `Test App ${i % 10}`,
          i % 7,
          i % 7,
          i % 3,
          now - Math.floor(Math.random() * 86400),
          now,
          now + Math.floor(Math.random() * 86400),
          1000 + i,
          0,
          now
        );
      }
    });

    transaction();
    console.log('  ✓ 测试数据生成完成');
  }

  generateReport() {
    console.log('📋 验证报告');
    console.log('='.repeat(60));
    
    const totalTests = Object.values(this.results).reduce((sum, category) => sum + category.passed + category.failed, 0);
    const totalPassed = Object.values(this.results).reduce((sum, category) => sum + category.passed, 0);
    const totalFailed = Object.values(this.results).reduce((sum, category) => sum + category.failed, 0);
    
    console.log(`📊 总体结果: ${totalPassed}/${totalTests} 通过 (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
    console.log('');
    
    // 详细结果
    console.log('📋 详细结果:');
    console.log(`  🏗️  结构验证: ${this.results.schemaValidation.passed}/${this.results.schemaValidation.passed + this.results.schemaValidation.failed} 通过`);
    console.log(`  🔍 数据完整性: ${this.results.dataIntegrity.passed}/${this.results.dataIntegrity.passed + this.results.dataIntegrity.failed} 通过`);
    console.log(`  ⚡ 性能测试: ${this.results.performanceTests.passed}/${this.results.performanceTests.passed + this.results.performanceTests.failed} 通过`);
    console.log(`  🔄 兼容性测试: ${this.results.compatibilityTests.passed}/${this.results.compatibilityTests.passed + this.results.compatibilityTests.failed} 通过`);
    
    // 性能结果
    if (this.results.performanceTests.results.length > 0) {
      console.log('\n⚡ 性能测试结果:');
      this.results.performanceTests.results.forEach(result => {
        console.log(`  ${result.name}: ${result.duration}ms`);
      });
    }
    
    // 错误汇总
    const allErrors = [
      ...this.results.schemaValidation.errors,
      ...this.results.dataIntegrity.errors,
      ...this.results.compatibilityTests.errors
    ];
    
    if (allErrors.length > 0) {
      console.log('\n❌ 错误汇总:');
      allErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('='.repeat(60));
    
    if (totalFailed === 0) {
      console.log('🎉 数据库优化验证完全通过！');
    } else {
      console.log(`⚠️  验证完成，发现 ${totalFailed} 个问题需要处理`);
    }
  }
}

// 主执行函数
async function main() {
  const dbPath = process.argv[2] || path.join(__dirname, '../../database.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
  }

  const validator = new OptimizationValidator(dbPath);
  
  try {
    await validator.validate();
    process.exit(0);
  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = OptimizationValidator;
