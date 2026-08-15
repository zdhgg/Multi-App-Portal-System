import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

export interface PortStatusInfo {
  pid?: number;
  state: string;
  protocol?: 'tcp';
  localAddress?: string;
}

export interface PortSnapshotMetadata {
  capturedAt: number | null;
  stale: boolean;
  error: string | null;
}

/**
 * 端口探测快照管理器 (Port Snapshot Manager)
 * 将高频并发的 netstat 查询进行短路合并，缓存 TTL 内的查询结果，
 * 将 CPU O(N) 的探测复杂度降至 O(1)。
 */
export class PortSnapshotManager {
  private static snapshotCache: Map<number, PortStatusInfo> = new Map();
  private static lastUpdateTime: number = 0;
  private static lastError: string | null = null;
  private static refreshPromise: Promise<Map<number, PortStatusInfo>> | null = null;
  
  // 缓存生命周期：2000毫秒（适用于密集并发扫描）
  private static readonly TTL: number = 2000;

  /**
   * 获取全局端口快照 (O(1) 路由查询)
   * @param force - 强制绕过缓存立刻刷新
   */
  static async getSnapshot(force: boolean = false): Promise<Map<number, PortStatusInfo>> {
    const now = Date.now();
    
    // 如果在 TTL 范围内，直接返回缓存
    if (!force && this.lastUpdateTime > 0 && (now - this.lastUpdateTime < this.TTL)) {
      return this.snapshotCache;
    }

    // 如果当前正有刷新任务在进行，加入等待队列 (Promise Coalescing)
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // 发起真实的系统调用
    this.refreshPromise = this.performSnapshot().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /**
   * 执行原生 netstat 快照采集
   */
  private static async performSnapshot(): Promise<Map<number, PortStatusInfo>> {
    const newSnapshot = new Map<number, PortStatusInfo>();
    
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('netstat -ano -p tcp', { windowsHide: true });
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          // Windows netstat TCP 输出举例：TCP    0.0.0.0:80    0.0.0.0:0   LISTENING   1234
          if (parts.length >= 5) {
            const proto = parts[0].toUpperCase();
            if (proto !== 'TCP') continue;

            const localAddr = parts[1];
            // 取最后一段为 PID
            const pidStr = parts[parts.length - 1];
            const state = parts[parts.length - 2].toUpperCase();
            if (state !== 'LISTENING') continue;
            
            // 精准切割端口号，应对 IP:Port 和 [IPv6]:Port
            const lastColonIndex = localAddr.lastIndexOf(':');
            if (lastColonIndex > 0) {
              const portStr = localAddr.substring(lastColonIndex + 1);
              const port = parseInt(portStr, 10);
              
              if (!isNaN(port) && port > 0) {
                const pid = parseInt(pidStr, 10);
                
                if (!newSnapshot.has(port)) {
                  newSnapshot.set(port, {
                    pid: isNaN(pid) ? undefined : pid,
                    state,
                    protocol: 'tcp',
                    localAddress: localAddr
                  });
                }
              }
            }
          }
        }
      } else {
        // macOS/Linux Fallback fallback (简易版)
        try {
          // 只做基础存活判定，不报错
          const { stdout } = await execAsync('ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null', { windowsHide: true });
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (!/LISTEN/i.test(line)) continue;

            const addressMatch = line.match(/(?:\[.*?\]|[^\s]+):(\d+)\s/);
            if (!addressMatch) continue;

            const port = Number.parseInt(addressMatch[1], 10);
            if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

            const localAddress = addressMatch[0].trim();
            const pidMatch = line.match(/pid=(\d+)/) || line.match(/\s(\d+)\/[^\s]+\s*$/);
            const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : undefined;

            if (!newSnapshot.has(port)) {
              newSnapshot.set(port, {
                pid: Number.isInteger(pid) ? pid : undefined,
                state: 'LISTENING',
                protocol: 'tcp',
                localAddress
              });
            }
          }
        } catch (e) {
           // ignore fallbacks
        }
      }

      this.snapshotCache = newSnapshot;
      this.lastUpdateTime = Date.now();
      this.lastError = null;
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error('获取系统端口快照失败 (Failed to take port snapshot)', { error: this.lastError });
      // 如果获取失败，仍然返回旧缓存或空 Map，防止系统直接崩溃
      if (this.lastUpdateTime === 0) {
        throw error;
      }
    }
    
    return this.snapshotCache;
  }

  /**
   * 强制失效缓存
   */
  static clearCache(): void {
    this.lastUpdateTime = 0;
    this.snapshotCache.clear();
    this.lastError = null;
  }

  static getMetadata(): PortSnapshotMetadata {
    return {
      capturedAt: this.lastUpdateTime || null,
      stale: Boolean(this.lastError && this.lastUpdateTime),
      error: this.lastError
    };
  }
}
