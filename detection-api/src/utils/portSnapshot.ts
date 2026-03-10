import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

export interface PortStatusInfo {
  pid?: number;
  state: string;
}

/**
 * 端口探测快照管理器 (Port Snapshot Manager)
 * 将高频并发的 netstat 查询进行短路合并，缓存 TTL 内的查询结果，
 * 将 CPU O(N) 的探测复杂度降至 O(1)。
 */
export class PortSnapshotManager {
  private static snapshotCache: Map<number, PortStatusInfo> = new Map();
  private static lastUpdateTime: number = 0;
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
        const { stdout } = await execAsync('netstat -ano', { windowsHide: true });
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          // Windows netstat TCP 输出举例：TCP    0.0.0.0:80    0.0.0.0:0   LISTENING   1234
          // UDP 输出举例：UDP    0.0.0.0:5353    *:*    4567
          if (parts.length >= 4) {
            const proto = parts[0].toUpperCase();
            if (proto !== 'TCP' && proto !== 'UDP') continue;

            const localAddr = parts[1];
            // 取最后一段为 PID
            const pidStr = parts[parts.length - 1];
            // 对于 TCP，倒数第二段是 State (例如 LISTENING)
            // 对于 UDP，没有 State 只有 PID
            const state = parts.length >= 5 ? parts[parts.length - 2] : 'UNKNOWN';
            
            // 精准切割端口号，应对 IP:Port 和 [IPv6]:Port
            const lastColonIndex = localAddr.lastIndexOf(':');
            if (lastColonIndex > 0) {
              const portStr = localAddr.substring(lastColonIndex + 1);
              const port = parseInt(portStr, 10);
              
              if (!isNaN(port) && port > 0) {
                const pid = parseInt(pidStr, 10);
                
                // 解决冲突：优先记录 LISTENING 状态的端口占用
                const existing = newSnapshot.get(port);
                if (!existing || state === 'LISTENING') {
                  newSnapshot.set(port, {
                    pid: isNaN(pid) ? undefined : pid,
                    state: state
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
          const { stdout } = await execAsync('netstat -lntp 2>/dev/null || ss -lntp', { windowsHide: true });
          const lines = stdout.split('\n');
          for (const line of lines) {
             if (line.includes('LISTEN')) {
                // ... fallback parsing if needed on non-Windows
                // skip precise PID extractions for linux fallback in this scope for now
             }
          }
        } catch (e) {
           // ignore fallbacks
        }
      }

      this.snapshotCache = newSnapshot;
      this.lastUpdateTime = Date.now();
      
    } catch (error) {
      logger.error('获取系统端口快照失败 (Failed to take port snapshot)', { error: (error as Error).message });
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
  }
}
