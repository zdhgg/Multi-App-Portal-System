/**
 * Network Service - Unified Port Management
 * 
 * This single service replaces:
 * - PortManager.ts
 * - EnhancedPortManager.ts  
 * - PortAllocator.ts
 * - PortMonitoringService.ts
 * - PortPersistence.ts
 * 
 * "One problem, one solution." - Linus
 */

import { spawn, exec } from 'child_process'
import { PortSnapshotManager } from '../utils/portSnapshot'
import { promisify } from 'util'
import type { NetworkService as INetworkService, PortConflict } from '../core/types'
import { logger } from '../utils/logger'
import { ConfigManager } from '../services/configManager'
import type { Database } from 'better-sqlite3'

const execAsync = promisify(exec)
type PortAllocationScope = 'frontend' | 'backend' | 'unified'

export class NetworkService implements INetworkService {
  private readonly allocatedPorts = new Set<number>()
  private configManager: ConfigManager
  private db?: Database

  constructor(configManager: ConfigManager, database?: Database) {
    this.configManager = configManager
    this.db = database

    // 监听配置变更
    this.configManager.on('configChanged', (event) => {
      logger.info('Port configuration updated, clearing allocated ports cache')
    })
  }

  /**
   * 从配置文件动态获取保留端口列表
   */
  private getReservedPorts(): Set<number> {
    const portConfig = this.configManager.getPortConfig()
    const reservedPorts = new Set<number>([80, 443]) // 默认保留端口

    if (portConfig?.reservedPorts) {
      for (const rp of portConfig.reservedPorts) {
        reservedPorts.add(rp.port)
      }
    }

    return reservedPorts
  }

  /**
   * 获取当前端口范围配置
   */
  private getPortRange(scope: PortAllocationScope = 'unified'): { start: number; end: number } {
    const portConfig = this.configManager.getPortConfig()
    if (portConfig) {
      if (scope === 'frontend') {
        return {
          start: portConfig.frontendRange.start,
          end: portConfig.frontendRange.end
        }
      }

      if (scope === 'backend') {
        return {
          start: portConfig.backendRange.start,
          end: portConfig.backendRange.end
        }
      }

      // unified: 合并前后端范围，兼容历史行为
      return {
        start: Math.min(portConfig.frontendRange.start, portConfig.backendRange.start),
        end: Math.max(portConfig.frontendRange.end, portConfig.backendRange.end)
      }
    }

    // 降级方案：使用默认范围
    logger.warn('Port configuration not available, using default range')
    if (scope === 'frontend') {
      return { start: 3001, end: 3100 }
    }
    if (scope === 'backend') {
      return { start: 8001, end: 8100 }
    }
    return { start: 3001, end: 9999 }
  }

  async allocatePort(scope: PortAllocationScope = 'unified'): Promise<number> {
    const portRange = this.getPortRange(scope)
    for (let port = portRange.start; port <= portRange.end; port++) {
      if (this.isPortAvailable(port, scope)) {
        this.allocatedPorts.add(port)
        logger.debug('Port allocated', { port, range: portRange, scope })
        return port
      }
    }
    throw new Error(`No free ports available in ${scope} range ${portRange.start}-${portRange.end}`)
  }

  async releasePort(port: number): Promise<void> {
    try {
      // 1. 先尝试杀死占用端口的进程
      await this.killProcessOnPort(port)

      // 2. 从内存中删除端口分配记录
      this.allocatedPorts.delete(port)

      logger.info('Port released successfully', { port })
    } catch (error) {
      logger.error('Failed to release port', {
        port,
        error: error instanceof Error ? error.message : String(error)
      })
      // 即使杀进程失败,也要从内存中删除记录
      this.allocatedPorts.delete(port)
      throw error
    }
  }

  /**
   * 杀死占用指定端口的进程 (无损优雅退出版)
   */
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      // 优化：从强制刷新快照中查询，避免漏查
      const snapshot = await PortSnapshotManager.getSnapshot(true);
      const portInfo = snapshot.get(port);

      if (!portInfo || !portInfo.pid) {
        logger.debug('No process found on port from snapshot', { port });
        return;
      }

      const pid = portInfo.pid;
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // 阶段一：软关闭通知 (Soft Stop, 不带 /F)
      try {
        await execAsync(`taskkill /PID ${pid}`, { windowsHide: true });
        logger.info('Sent termination signal to process', { port, pid });
      } catch (err) {
        // 大多由于权限或进程不响应软关闭导致，跳过警告，交由最后防线处理
        logger.debug('Soft kill attempt failed or denied', { pid, error: (err as Error).message });
      }

      // 阶段二：静默观察期 (Grace Period, Max 2s)
      let isDead = false;
      for (let i = 0; i < 4; i++) {
        await sleep(500);
        const currentSnap = await PortSnapshotManager.getSnapshot(true);
        const currentInfo = currentSnap.get(port);

        // 如果端口状态发生变动，或者PID不一样了，说明原来的进程已经挂了退出
        if (!currentInfo || currentInfo.pid !== pid) {
          isDead = true;
          logger.info('Process gracefully terminated', { port, pid });
          break;
        }
      }

      // 阶段三：雷霆强杀 (Hard Kill / 兜底防线)
      if (!isDead) {
        logger.warn('Process unresponsive to soft kill, executing hard kill fallback', { port, pid });
        try {
          await execAsync(`taskkill /F /PID ${pid}`, { windowsHide: true });
          logger.info('Force killed process on port', { port, pid });
          // 等待系统释放端口句柄
          await sleep(500);
        } catch (hardErr) {
          logger.warn('Hard kill trigger failed', { port, pid, error: (hardErr as Error).message });
        }
      }

    } catch (error) {
      logger.error('Error during graceful shutdown pipeline', {
        port,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async isPortFree(port: number): Promise<boolean> {
    const reservedPorts = this.getReservedPorts()
    if (this.allocatedPorts.has(port) || reservedPorts.has(port)) {
      return false
    }

    // Check if port is actually free on the system
    return await this.checkSystemPort(port)
  }

  async checkConflicts(ports: readonly number[]): Promise<readonly PortConflict[]> {
    const conflicts: PortConflict[] = []

    for (const port of ports) {
      // Enhanced conflict detection with PID information
      const portStatus = await this.getDetailedPortStatus(port)

      if (!portStatus.isFree) {
        conflicts.push({
          port,
          currentOwner: portStatus.owner || 'system',
          requestedBy: 'application',
          pid: portStatus.pid
        })
      }
    }

    return conflicts
  }

  /**
   * Get detailed port status with PID information
   * Refactored: Fast O(1) query with TTL cache
   */
  private async getDetailedPortStatus(port: number): Promise<{
    isFree: boolean;
    owner?: string;
    pid?: number;
  }> {
    try {
      // 1. O(1) 短路查表 (Fast path)
      const snapshot = await PortSnapshotManager.getSnapshot();
      const portInfo = snapshot.get(port);

      if (portInfo && this.isListeningSnapshotState(portInfo.state)) {
        // 仅将真实监听态视为冲突，避免 TIME_WAIT 等瞬时状态误判
        return {
          isFree: false,
          owner: 'system',
          pid: portInfo.pid
        };
      }

      if (portInfo) {
        // 对于 TIME_WAIT / CLOSE_WAIT 等非监听态，再用 TCP 探测确认一次
        const isReallyFree = await this.checkSystemPort(port);
        return {
          isFree: isReallyFree,
          owner: isReallyFree ? undefined : 'system',
          pid: isReallyFree ? undefined : portInfo.pid
        };
      }

      // 2. 如果快照没查到，为了 100% 准确，进行轻量级应用层试探
      const isReallyFree = await this.checkSystemPort(port);
      return {
        isFree: isReallyFree,
        owner: isReallyFree ? undefined : 'system'
      };

    } catch (error) {
      logger.warn('Failed to get detailed port status', { port, error: (error as Error).message });
      // 降维打击失败，优雅回落到系统层查询作为冗余
      return { isFree: await this.checkSystemPort(port), owner: 'system' };
    }
  }

  private isListeningSnapshotState(state?: string): boolean {
    if (!state) {
      return false
    }

    const normalized = state.trim().toUpperCase()
    return normalized === 'LISTENING' || normalized === 'LISTEN'
  }

  /**
   * Check if port is available for allocation
   */
  private isPortAvailable(port: number, scope: PortAllocationScope = 'unified'): boolean {
    const portRange = this.getPortRange(scope)
    const reservedPorts = this.getReservedPorts()

    // 基本检查
    if (this.allocatedPorts.has(port) || reservedPorts.has(port)) {
      return false
    }

    // 检查端口范围
    if (port < portRange.start || port > portRange.end) {
      return false
    }

    // 检查已添加应用的端口
    if (this.isPortUsedByExistingApp(port)) {
      return false
    }

    return true
  }

  /**
   * 检查端口是否已被已添加的应用使用
   * 查询 applications 表中的 network_config JSON 字段
   */
  private isPortUsedByExistingApp(port: number): boolean {
    if (!this.db) {
      return false // 没有数据库连接时跳过检查
    }

    try {
      const apps = this.db.prepare('SELECT id, name, network_config FROM applications').all() as any[]

      for (const app of apps) {
        if (!app.network_config) continue

        try {
          const networkConfig = JSON.parse(app.network_config)

          // 检查主端口
          if (networkConfig.primaryPort === port) {
            logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为主端口`)
            return true
          }

          // 检查次要端口
          if (Array.isArray(networkConfig.secondaryPorts) &&
            networkConfig.secondaryPorts.includes(port)) {
            logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为次要端口`)
            return true
          }
        } catch (parseError) {
          logger.warn(`解析应用 ${app.id} 的网络配置失败`, parseError)
        }
      }

      return false
    } catch (error) {
      logger.warn('检查已有应用端口时出错，跳过此检查', error)
      return false
    }
  }

  /**
   * Check if port is free on the system (Connect Over Bind approach)
   * 速度极客优化：放弃 bind，改为 createConnection 的 ECONNREFUSED 短路测试
   */
  private async checkSystemPort(port: number): Promise<boolean> {
    return new Promise(async (resolve) => {
      const { createConnection } = await import('net')

      const socket = createConnection({ port, host: '127.0.0.1' }, () => {
        // 如果能够 connect 成功，证明端口有人在听，立刻销毁并返回占用
        socket.destroy();
        resolve(false);
      });

      socket.on('error', (err: any) => {
        // TCP 握手被强行拒绝，证明没人监听，端口空闲！(速度通常 < 1ms)
        if (err.code === 'ECONNREFUSED') {
          resolve(true);
        } else {
          // 遇到如 EACCES 等权限或其他问题，保守认为被占用
          resolve(false);
        }
      });

      // 并发安全锁：500ms(极限)内未反应则当做未响应的僵尸占用
      setTimeout(() => {
        try {
          socket.destroy();
        } catch (e) { }
        resolve(false);
      }, 500);
    });
  }

  /**
   * Force kill process using a specific port (Windows only for now)
   */
  async forceReleasePort(port: number): Promise<boolean> {
    if (process.platform !== 'win32') {
      logger.warn('Force port release only supported on Windows', { port })
      return false
    }

    try {
      // 将直接强拉 /F 改为走刚刚升级后的无损退出降级管线 (Graceful Termination)
      await this.killProcessOnPort(port);

      // 执行完毕后验证一下端口是否已经彻底空闲
      const isFree = await this.isPortFree(port);
      return isFree;

    } catch (e) {
      logger.error('Failed to force release port in Pipeline', { port, error: (e as Error).message });
      return false;
    }
  }

  /**
   * Get allocation statistics
   */
  getStats(): { allocated: number; available: number; range: string } {
    const portRange = this.getPortRange('unified')
    const rangeSize = portRange.end - portRange.start + 1
    const reservedPorts = this.getReservedPorts()
    const reservedCount = reservedPorts.size
    const allocatedCount = this.allocatedPorts.size

    return {
      allocated: allocatedCount,
      available: rangeSize - reservedCount - allocatedCount,
      range: `${portRange.start}-${portRange.end}`
    }
  }

  /**
   * Reset all allocations (for testing)
   */
  reset(): void {
    this.allocatedPorts.clear()
    logger.info('All port allocations cleared')
  }
}
