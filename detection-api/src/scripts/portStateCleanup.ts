#!/usr/bin/env tsx
/**
 * 端口状态清理脚本
 * 清理重复、失效和过期的端口分配记录
 * 优化端口状态管理
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PortAllocation {
  frontend?: number;
  backend?: number;
}

interface AllocationRecord {
  id: string;
  appId: string;
  appName: string;
  allocation: PortAllocation;
  allocatedAt: string;
  status: 'active' | 'released' | 'expired';
  metadata: {
    techStack: string;
    directory: string;
    processId?: number;
  };
  lastUsedAt?: string;
}

interface PortState {
  version: string;
  lastUpdated: string;
  allocations: Record<string, AllocationRecord>;
  reservedPorts: number[];
  config: {
    frontendRange: { start: number; end: number };
    backendRange: { start: number; end: number };
  };
  statistics: {
    totalAllocations: number;
    totalReleases: number;
    lastCleanup: string;
  };
}

class PortStateCleanup {
  private dataPath: string;
  private backupPath: string;

  constructor() {
    this.dataPath = path.join(process.cwd(), 'data', 'port-allocation-state.json');
    this.backupPath = path.join(process.cwd(), 'data', 'backups');
  }

  /**
   * 检查进程是否还在运行
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`tasklist /fi "PID eq ${pid}" /fo csv`);
        return stdout.includes(`"${pid}"`);
      } else {
        await execAsync(`kill -0 ${pid}`);
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * 检查端口是否被占用
   */
  private async isPortInUse(port: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        return stdout.trim().length > 0;
      } else {
        const { stdout } = await execAsync(`lsof -i :${port}`);
        return stdout.trim().length > 0;
      }
    } catch {
      return false;
    }
  }

  /**
   * 创建备份
   */
  private async createBackup(data: PortState): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `port-state-backup-${timestamp}-cleanup.json`;
    const backupFile = path.join(this.backupPath, backupFilename);
    
    await fs.mkdir(this.backupPath, { recursive: true });
    await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 备份已创建: ${backupFilename}`);
    return backupFile;
  }

  /**
   * 加载当前端口状态
   */
  private async loadPortState(): Promise<PortState> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ 无法加载端口状态文件:', error);
      throw error;
    }
  }

  /**
   * 保存端口状态
   */
  private async savePortState(state: PortState): Promise<void> {
    try {
      await fs.writeFile(this.dataPath, JSON.stringify(state, null, 2));
      console.log('✅ 端口状态已保存');
    } catch (error) {
      console.error('❌ 无法保存端口状态文件:', error);
      throw error;
    }
  }

  /**
   * 清理失效的端口分配
   */
  private async cleanupInvalidAllocations(state: PortState): Promise<{
    removed: string[];
    updated: string[];
    conflicts: Array<{ port: number; records: string[] }>;
  }> {
    const removed: string[] = [];
    const updated: string[] = [];
    const conflicts: Array<{ port: number; records: string[] }> = [];
    const portUsage = new Map<number, string[]>();

    console.log('🔍 开始检查端口分配状态...');

    // 统计端口使用情况
    for (const [id, record] of Object.entries(state.allocations)) {
      if (record.status === 'active') {
        if (record.allocation.frontend) {
          if (!portUsage.has(record.allocation.frontend)) {
            portUsage.set(record.allocation.frontend, []);
          }
          portUsage.get(record.allocation.frontend)!.push(id);
        }
        if (record.allocation.backend) {
          if (!portUsage.has(record.allocation.backend)) {
            portUsage.set(record.allocation.backend, []);
          }
          portUsage.get(record.allocation.backend)!.push(id);
        }
      }
    }

    // 检查端口冲突
    for (const [port, records] of portUsage.entries()) {
      if (records.length > 1) {
        conflicts.push({ port, records });
      }
    }

    // 处理每个分配记录
    for (const [id, record] of Object.entries(state.allocations)) {
      let shouldRemove = false;
      let shouldUpdate = false;

      // 1. 清理过期的released记录（超过7天）
      if (record.status === 'released') {
        const lastUsed = new Date(record.lastUsedAt || record.allocatedAt);
        const daysDiff = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 7) {
          shouldRemove = true;
          console.log(`🗑️  清理过期记录: ${record.appName} (${daysDiff.toFixed(1)}天前)`);
        }
      }

      // 2. 检查active记录的进程状态
      if (record.status === 'active' && record.metadata.processId) {
        const isRunning = await this.isProcessRunning(record.metadata.processId);
        if (!isRunning) {
          // 进程不存在，检查端口是否被占用
          const frontendInUse = record.allocation.frontend ? 
            await this.isPortInUse(record.allocation.frontend) : false;
          const backendInUse = record.allocation.backend ? 
            await this.isPortInUse(record.allocation.backend) : false;

          if (!frontendInUse && !backendInUse) {
            // 进程不存在且端口未被占用，标记为released
            record.status = 'released';
            record.lastUsedAt = new Date().toISOString();
            shouldUpdate = true;
            console.log(`🔄 进程已停止，标记为released: ${record.appName} (PID: ${record.metadata.processId})`);
          }
        }
      }

      // 3. 处理冲突的端口分配
      const hasConflict = conflicts.some(conflict => 
        conflict.records.includes(id) && conflict.records.length > 1
      );

      if (hasConflict && record.status === 'active') {
        // 保留最新的分配，其他标记为released
        const conflictingPorts = conflicts.filter(c => c.records.includes(id));
        for (const conflict of conflictingPorts) {
          const sortedRecords = conflict.records
            .map(rid => ({ id: rid, record: state.allocations[rid] }))
            .sort((a, b) => new Date(b.record.allocatedAt).getTime() - new Date(a.record.allocatedAt).getTime());

          if (sortedRecords[0].id !== id) {
            // 不是最新的，标记为released
            record.status = 'released';
            record.lastUsedAt = new Date().toISOString();
            shouldUpdate = true;
            console.log(`⚠️  解决端口冲突，标记为released: ${record.appName} (端口: ${conflict.port})`);
          }
        }
      }

      if (shouldRemove) {
        delete state.allocations[id];
        removed.push(id);
      } else if (shouldUpdate) {
        updated.push(id);
      }
    }

    return { removed, updated, conflicts };
  }

  /**
   * 更新统计信息
   */
  private updateStatistics(state: PortState, cleanupResult: any): void {
    const activeCount = Object.values(state.allocations).filter(r => r.status === 'active').length;
    const releasedCount = Object.values(state.allocations).filter(r => r.status === 'released').length;

    state.statistics = {
      totalAllocations: Object.keys(state.allocations).length,
      totalReleases: releasedCount,
      lastCleanup: new Date().toISOString()
    };

    state.lastUpdated = new Date().toISOString();
  }

  /**
   * 生成清理报告
   */
  private generateReport(cleanupResult: any, beforeCount: number, afterCount: number): void {
    console.log('\n📊 清理报告');
    console.log('='.repeat(50));
    console.log(`📋 清理前记录总数: ${beforeCount}`);
    console.log(`📋 清理后记录总数: ${afterCount}`);
    console.log(`🗑️  删除记录数: ${cleanupResult.removed.length}`);
    console.log(`🔄 更新记录数: ${cleanupResult.updated.length}`);
    console.log(`⚠️  解决冲突数: ${cleanupResult.conflicts.length}`);

    if (cleanupResult.conflicts.length > 0) {
      console.log('\n🔍 解决的端口冲突:');
      cleanupResult.conflicts.forEach((conflict: any) => {
        console.log(`   端口 ${conflict.port}: ${conflict.records.length} 个冲突记录`);
      });
    }

    console.log('\n✅ 清理完成！');
  }

  /**
   * 执行清理
   */
  async cleanup(): Promise<void> {
    try {
      console.log('🚀 开始端口状态清理...');
      
      // 加载当前状态
      const state = await this.loadPortState();
      const beforeCount = Object.keys(state.allocations).length;
      
      // 创建备份
      await this.createBackup(state);
      
      // 执行清理
      const cleanupResult = await this.cleanupInvalidAllocations(state);
      
      // 更新统计信息
      this.updateStatistics(state, cleanupResult);
      
      // 保存清理后的状态
      await this.savePortState(state);
      
      // 生成报告
      const afterCount = Object.keys(state.allocations).length;
      this.generateReport(cleanupResult, beforeCount, afterCount);
      
    } catch (error) {
      console.error('❌ 清理过程中发生错误:', error);
      throw error;
    }
  }
}

// 执行清理
async function main() {
  const cleanup = new PortStateCleanup();
  
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  
  if (dryRun) {
    console.log('🔍 执行试运行模式（不会实际修改文件）');
    // TODO: 实现试运行模式
    return;
  }
  
  if (!force) {
    console.log('⚠️  这将清理端口状态数据，请确认是否继续？');
    console.log('使用 --force 参数跳过确认，或 --dry-run 查看将要执行的操作');
    return;
  }
  
  await cleanup.cleanup();
}

// 执行主函数
main().catch(console.error);