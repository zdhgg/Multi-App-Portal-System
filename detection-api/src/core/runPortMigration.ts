/**
 * Port Table Migration Runner
 * 端口表迁移执行器
 */

import { Database } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

export async function runPortTableMigration(db: Database): Promise<MigrationResult> {
  try {
    logger.info('开始端口表结构迁移...');

    // 检查是否需要迁移 port_allocations 表
    const tableInfo = db.prepare("PRAGMA table_info(port_allocations)").all() as any[];
    const hasNewStructure = tableInfo.some(col => col.name === 'type');

    if (!hasNewStructure) {
      // 读取迁移SQL
      const migrationPath = join(__dirname, 'migrations', '001_enhance_port_allocations.sql');
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      // 执行迁移
      db.exec(migrationSQL);
      logger.info('✅ port_allocations 表结构迁移成功完成');
    } else {
      logger.info('port_allocations 表结构已是最新版本，跳过迁移');
    }

    // 检查并修复 port_usage_history 表结构
    await migratePortUsageHistoryTable(db);

    logger.info('✅ 端口表结构迁移全部完成');
    return {
      success: true,
      message: '端口表结构迁移成功完成'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    logger.error('❌ 端口表结构迁移失败', { error: errorMessage });
    
    return {
      success: false,
      message: '端口表结构迁移失败',
      error: errorMessage
    };
  }
}

/**
 * 迁移和修复 port_usage_history 表结构
 */
async function migratePortUsageHistoryTable(db: Database): Promise<void> {
  try {
    // 检查 port_usage_history 表是否存在
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='port_usage_history'
    `).get();

    if (!tableExists) {
      logger.info('port_usage_history 表不存在，将创建完整表结构');
      // 创建完整的 port_usage_history 表
      db.exec(`
        CREATE TABLE port_usage_history (
          id TEXT PRIMARY KEY,
          port INTEGER NOT NULL,
          app_id TEXT,
          action TEXT NOT NULL,
          result TEXT NOT NULL DEFAULT 'success',
          details TEXT,
          error_message TEXT,
          response_time_ms INTEGER,
          verification_method TEXT,
          initiated_by TEXT DEFAULT 'system',
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_port_history_port ON port_usage_history(port);
        CREATE INDEX IF NOT EXISTS idx_port_history_app_id ON port_usage_history(app_id);
        CREATE INDEX IF NOT EXISTS idx_port_history_action ON port_usage_history(action);
        CREATE INDEX IF NOT EXISTS idx_port_history_timestamp ON port_usage_history(timestamp);
      `);
      logger.info('✅ port_usage_history 表创建成功');
      return;
    }

    // 检查是否缺少 result 列
    const usageHistoryInfo = db.prepare("PRAGMA table_info(port_usage_history)").all() as any[];
    const hasResultColumn = usageHistoryInfo.some(col => col.name === 'result');

    if (!hasResultColumn) {
      logger.info('检测到 port_usage_history 表缺少 result 列，正在添加...');
      
      // 添加 result 列
      db.exec(`ALTER TABLE port_usage_history ADD COLUMN result TEXT NOT NULL DEFAULT 'success'`);
      
      // 回填现有记录的 result 值
      const updateCount = db.prepare(`
        UPDATE port_usage_history 
        SET result = CASE 
          WHEN action IN ('allocated', 'verified', 'conflict_resolved') THEN 'success'
          WHEN action IN ('conflict_detected', 'expired', 'force_released') THEN 'failed'
          ELSE 'success'
        END
        WHERE result = 'success'
      `).run();

      logger.info(`✅ result 列添加成功，已回填 ${updateCount.changes} 条记录`);
    }

    // 检查并添加其他可能缺少的列
    const missingColumns = [];
    const expectedColumns = [
      { name: 'error_message', type: 'TEXT', default: null },
      { name: 'response_time_ms', type: 'INTEGER', default: null },
      { name: 'verification_method', type: 'TEXT', default: null },
      { name: 'initiated_by', type: 'TEXT', default: "'system'" }
    ];

    for (const expectedCol of expectedColumns) {
      const hasColumn = usageHistoryInfo.some(col => col.name === expectedCol.name);
      if (!hasColumn) {
        missingColumns.push(expectedCol);
      }
    }

    if (missingColumns.length > 0) {
      logger.info(`正在添加缺少的列: ${missingColumns.map(c => c.name).join(', ')}`);
      
      for (const col of missingColumns) {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        db.exec(`ALTER TABLE port_usage_history ADD COLUMN ${col.name} ${col.type}${defaultClause}`);
      }
      
      logger.info(`✅ 已添加 ${missingColumns.length} 个缺少的列`);
    }

    logger.info('✅ port_usage_history 表结构检查和修复完成');

  } catch (error) {
    logger.error('port_usage_history 表迁移失败', { error: error.message });
    throw error;
  }
}

export default runPortTableMigration;
