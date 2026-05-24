import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from './logger.js'

const execAsync = promisify(exec)

/**
 * 端口清理工具（增强版：精确匹配 + 杀进程树）
 * - 精确匹配端口号（避免误匹配 38010、80100 等）
 * - 使用 /T 参数同时杀死进程树（避免子进程漏杀）
 */
export class SimplePortCleaner {

  /**
   * 检查端口是否被占用（精确检测）
   */
  static async isPortOccupied(port: number): Promise<boolean> {
    try {
      // Windows: 精确匹配端口号（:8010 结尾或后跟空格）
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          `netstat -ano | findstr /R /C:":${port}$" /C:":${port} "`,
          { windowsHide: true }
        )
        // 必须有 LISTENING 状态
        const lines = stdout.trim().split('\n').filter(l => l.trim())
        return lines.some(l => l.includes('LISTENING'))
      } else {
        // Unix/Linux
        const { stdout } = await execAsync(`lsof -i :${port}`, { windowsHide: true })
        return stdout.trim().length > 0
      }
    } catch {
      return false
    }
  }

  /**
   * 强制释放端口（增强：杀进程树 + 多级重试）
   */
  static async forceReleasePort(port: number): Promise<boolean> {
    try {
      logger.info(`尝试释放端口: ${port}`)

      if (process.platform === 'win32') {
        // Windows: 精确查找所有占用端口的 PID
        const { stdout } = await execAsync(
          `netstat -ano | findstr /R /C:":${port}$" /C:":${port} "`,
          { windowsHide: true }
        )
        const lines = stdout.trim().split('\n').filter(l => l.trim())
        const pids = new Set<number>()

        for (const line of lines) {
          // 必须有 LISTENING 状态才提取 PID
          if (!line.includes('LISTENING')) continue
          const parts = line.trim().split(/\s+/)
          const pid = parseInt(parts[parts.length - 1])
          if (!isNaN(pid) && pid > 0) {
            pids.add(pid)
          }
        }

        if (pids.size === 0) {
          logger.info(`端口 ${port} 未检测到 LISTENING 进程，视为已释放`)
          return true
        }

        for (const pid of pids) {
          try {
            // 软杀进程树
            await execAsync(`taskkill /T /PID ${pid}`, { windowsHide: true })
            await new Promise(resolve => setTimeout(resolve, 500))
          } catch {
            // 软杀失败，继续硬杀
          }

          // 硬杀进程树（/F 强制 /T 含子进程）
          try {
            await execAsync(`taskkill /F /T /PID ${pid}`, { windowsHide: true })
            logger.info(`成功杀死进程树 PID=${pid} (端口 ${port})`)
          } catch (killError) {
            logger.warn(`杀死进程 ${pid} 失败:`, killError)
          }
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      } else {
        // Unix/Linux: lsof + kill -9
        try {
          const { stdout } = await execAsync(`lsof -ti:${port}`)
          const pids = stdout.trim().split('\n').filter(Boolean)

          for (const pid of pids) {
            const numericPid = parseInt(pid)
            if (isNaN(numericPid) || numericPid <= 0) continue

            try {
              // 先尝试优雅退出
              try {
                process.kill(numericPid, 'SIGTERM')
                await new Promise(r => setTimeout(r, 500))
              } catch { }

              // 强制杀死
              await execAsync(`kill -9 ${numericPid}`)
              logger.info(`成功杀死进程 ${pid} (端口 ${port})`)
            } catch (killError) {
              logger.warn(`杀死进程 ${pid} 失败:`, killError)
            }
          }
        } catch (error) {
          // 可能端口没有被占用
        }
      }

      // 等待并验证端口已释放
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 600))
        if (!(await this.isPortOccupied(port))) {
          logger.info(`✅ 端口 ${port} 已成功释放`)
          return true
        }
      }

      const stillOccupied = await this.isPortOccupied(port)
      if (!stillOccupied) {
        logger.info(`✅ 端口 ${port} 已成功释放`)
        return true
      } else {
        logger.warn(`❌ 端口 ${port} 仍被占用`)
        return false
      }

    } catch (error) {
      logger.error(`释放端口 ${port} 失败:`, error)
      return false
    }
  }

  /**
   * 批量清理端口
   */
  static async batchReleaseports(ports: number[]): Promise<{ port: number; success: boolean }[]> {
    logger.info(`批量清理端口:`, ports)

    const results = []
    for (const port of ports) {
      const success = await this.forceReleasePort(port)
      results.push({ port, success })
    }

    return results
  }

  /**
   * 清理常用开发端口
   */
  static async cleanupDevelopmentPorts(): Promise<{ port: number; success: boolean }[]> {
    const commonPorts = [3000, 3001, 3021, 4000, 4001, 4016, 5173, 8080]
    logger.info('清理常用开发端口...')

    const occupiedPorts = []
    for (const port of commonPorts) {
      if (await this.isPortOccupied(port)) {
        occupiedPorts.push(port)
      }
    }

    if (occupiedPorts.length === 0) {
      logger.info('没有发现被占用的开发端口')
      return []
    }

    logger.info(`发现被占用的端口: ${occupiedPorts.join(', ')}`)
    return await this.batchReleaseports(occupiedPorts)
  }
}

export default SimplePortCleaner