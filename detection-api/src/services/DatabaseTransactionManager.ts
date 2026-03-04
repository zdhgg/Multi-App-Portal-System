/**
 * 数据库事务管理器
 * 提供原子性的数据库操作，确保数据一致性
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: TransactionOperation[];
  status: 'pending' | 'committed' | 'rolled_back' | 'failed';
}

export interface TransactionOperation {
  type: 'insert' | 'update' | 'delete';
  table: string;
  data: any;
  condition?: any;
  rollbackData?: any;
}

export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  transactionId: string;
  operationsCount: number;
  duration: number;
}

/**
 * 数据库事务管理器类
 */
export class DatabaseTransactionManager {
  private db: Database.Database;
  private activeTransactions = new Map<string, TransactionContext>();
  private transactionQueue: (() => Promise<any>)[] = [];
  private isProcessingQueue = false;

  constructor(database: Database.Database) {
    this.db = database;
    logger.info('数据库事务管理器已初始化');
  }

  /**
   * 生成事务ID
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 开始事务
   */
  async beginTransaction(): Promise<string> {
    const transactionId = this.generateTransactionId();
    const context: TransactionContext = {
      id: transactionId,
      startTime: new Date(),
      operations: [],
      status: 'pending'
    };

    this.activeTransactions.set(transactionId, context);
    
    // 开始SQLite事务
    this.db.exec('BEGIN TRANSACTION');
    
    logger.debug('事务已开始', { transactionId });
    return transactionId;
  }

  /**
   * 执行事务操作
   */
  async executeInTransaction<T>(
    transactionId: string,
    operations: (() => T)[]
  ): Promise<TransactionResult<T[]>> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new Error(`事务不存在: ${transactionId}`);
    }

    const startTime = Date.now();
    const results: T[] = [];

    try {
      // 执行所有操作
      for (const operation of operations) {
        const result = operation();
        results.push(result);
      }

      // 提交事务
      await this.commitTransaction(transactionId);

      const duration = Date.now() - startTime;
      logger.info('事务执行成功', { 
        transactionId, 
        operationsCount: operations.length,
        duration 
      });

      return {
        success: true,
        data: results,
        transactionId,
        operationsCount: operations.length,
        duration
      };

    } catch (error) {
      // 回滚事务
      await this.rollbackTransaction(transactionId);
      
      const duration = Date.now() - startTime;
      logger.error('事务执行失败', { 
        transactionId, 
        error: error.message,
        duration 
      });

      return {
        success: false,
        error: error.message,
        transactionId,
        operationsCount: operations.length,
        duration
      };
    }
  }

  /**
   * 提交事务
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new Error(`事务不存在: ${transactionId}`);
    }

    try {
      // 提交SQLite事务
      this.db.exec('COMMIT');
      
      context.status = 'committed';
      this.activeTransactions.delete(transactionId);
      
      logger.debug('事务已提交', { transactionId });
    } catch (error) {
      context.status = 'failed';
      logger.error('事务提交失败', { transactionId, error: error.message });
      throw error;
    }
  }

  /**
   * 回滚事务
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new Error(`事务不存在: ${transactionId}`);
    }

    try {
      // 检查是否有活跃事务再回滚
      if (context.status === 'pending') {
        this.db.exec('ROLLBACK');
      }

      context.status = 'rolled_back';
      this.activeTransactions.delete(transactionId);

      logger.debug('事务已回滚', { transactionId });
    } catch (error) {
      context.status = 'failed';
      logger.error('事务回滚失败', { transactionId, error: error.message });
      // 不抛出错误，因为这可能在清理时调用
    }
  }

  /**
   * 队列化执行事务操作（解决SQLite不支持并发事务的问题）
   */
  private async queueTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.transactionQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * 处理事务队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.transactionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.transactionQueue.length > 0) {
      const operation = this.transactionQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          logger.error('队列事务执行失败', { error: error.message });
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 执行原子性端口分配
   */
  async atomicPortAllocation(
    portData: {
      port: number;
      appId: string;
      appName: string;
      type: string;
      protocol: string;
      allocationId: string;
      confidence: number;
      source: string;
    }
  ): Promise<TransactionResult<any>> {
    return this.queueTransaction(async () => {
      const transactionId = await this.beginTransaction();

      try {
        const operations = [
          // 1. 检查端口是否已被分配
          () => {
            const checkStmt = this.db.prepare(`
              SELECT COUNT(*) as count FROM unified_port_allocations
              WHERE port = ? AND status = 'allocated'
            `);
            const result = checkStmt.get(portData.port) as any;
            if (result.count > 0) {
              throw new Error(`端口 ${portData.port} 已被分配`);
            }
            return { step: 'port_check', result: 'available' };
          },

          // 2. 插入端口分配记录
          () => {
            const insertStmt = this.db.prepare(`
              INSERT INTO unified_port_allocations (
                id, port, app_id, app_name, allocation_type, protocol,
                status, allocated_at, configuration
              ) VALUES (?, ?, ?, ?, ?, ?, 'allocated', datetime('now'), ?)
            `);

            const result = insertStmt.run(
              portData.allocationId,
              portData.port,
              portData.appId,
              portData.appName,
              portData.type,
              portData.protocol,
              JSON.stringify({
                transactionId,
                confidence: portData.confidence,
                source: portData.source
              })
            );

            return { step: 'port_allocation', result: String(result.changes) };
          },

          // 3. 记录分配历史
          () => {
            const historyStmt = this.db.prepare(`
              INSERT INTO port_usage_history (
                port, app_id, action, timestamp, details
              ) VALUES (?, ?, 'allocated', datetime('now'), ?)
            `);

            const result = historyStmt.run(
              portData.port,
              portData.appId,
              JSON.stringify({
                allocationId: portData.allocationId,
                type: portData.type,
                protocol: portData.protocol,
                transactionId
              })
            );

            return { step: 'history_record', result: String(result.changes) };
          }
        ];

        return await this.executeInTransaction(transactionId, operations as any);

      } catch (error) {
        await this.rollbackTransaction(transactionId);
        throw error;
      }
    });
  }

  /**
   * 执行原子性端口释放
   */
  async atomicPortRelease(
    port: number,
    appId: string,
    reason?: string
  ): Promise<TransactionResult<any>> {
    return this.queueTransaction(async () => {
      const transactionId = await this.beginTransaction();

      try {
        const operations = [
          // 1. 检查端口分配状态
          () => {
            const checkStmt = this.db.prepare(`
              SELECT * FROM unified_port_allocations
              WHERE port = ? AND app_id = ? AND status = 'allocated'
            `);
            const allocation = checkStmt.get(port, appId);
            if (!allocation) {
              throw new Error(`端口 ${port} 未分配给应用 ${appId}`);
            }
            return { step: 'allocation_check', result: allocation };
          },

          // 2. 更新端口状态为已释放
          () => {
            const updateStmt = this.db.prepare(`
              UPDATE unified_port_allocations
              SET status = 'released', released_at = datetime('now'),
                  metadata = json_set(COALESCE(metadata, '{}'), '$.releaseReason', ?, '$.transactionId', ?)
              WHERE port = ? AND app_id = ? AND status = 'allocated'
            `);

            const result = updateStmt.run(reason || 'manual_release', transactionId, port, appId);
            return { step: 'port_release', result: result.changes };
          },

          // 3. 记录释放历史
          () => {
            const historyStmt = this.db.prepare(`
              INSERT INTO port_usage_history (
                port, app_id, action, timestamp, details
              ) VALUES (?, ?, 'released', datetime('now'), ?)
            `);

            const result = historyStmt.run(
              port,
              appId,
              JSON.stringify({
                reason: reason || 'manual_release',
                transactionId
              })
            );

            return { step: 'history_record', result: result.changes };
          }
        ];

        return await this.executeInTransaction(transactionId, operations);

      } catch (error) {
        await this.rollbackTransaction(transactionId);
        throw error;
      }
    });
  }

  /**
   * 获取活跃事务状态
   */
  getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * 清理超时事务
   */
  async cleanupTimeoutTransactions(timeoutMs: number = 30000): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [transactionId, context] of this.activeTransactions.entries()) {
      const elapsed = now - context.startTime.getTime();
      if (elapsed > timeoutMs) {
        try {
          await this.rollbackTransaction(transactionId);
          cleanedCount++;
          logger.warn('清理超时事务', { transactionId, elapsed });
        } catch (error) {
          logger.error('清理超时事务失败', { transactionId, error: error.message });
        }
      }
    }

    return cleanedCount;
  }

  /**
   * 销毁事务管理器
   */
  destroy(): void {
    // 回滚所有活跃事务
    const activeTransactionIds = Array.from(this.activeTransactions.keys());
    for (const transactionId of activeTransactionIds) {
      try {
        this.rollbackTransaction(transactionId);
      } catch (error) {
        logger.error('销毁时回滚事务失败', { transactionId, error: error.message });
      }
    }

    this.activeTransactions.clear();
    logger.info('数据库事务管理器已销毁');
  }
}
