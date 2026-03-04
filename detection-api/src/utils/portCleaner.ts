import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from './logger.js'

const execAsync = promisify(exec)

/**
 * 简单的端口清理工具
 */
export class SimplePortCleaner {
  
  /**
   * 检查端口是否被占用
   */
  static async isPortOccupied(port: number): Promise<boolean> {
    try {
      const command = process.platform === 'win32' 
        ? `netstat -ano | findstr :${port}`
        : `lsof -i :${port}`

      const { stdout } = await execAsync(command)
      return stdout.trim().length > 0
    } catch (error) {
      return false // 没有找到占用进程，认为端口空闲
    }
  }

  /**
   * 强制释放端口
   */
  static async forceReleasePort(port: number): Promise<boolean> {
    try {
      logger.info(`尝试释放端口: ${port}`)
      
      if (process.platform === 'win32') {
        // Windows: 查找并杀死占用端口的进程
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)
        const lines = stdout.trim().split('\n')
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          
          if (pid && !isNaN(parseInt(pid))) {
            try {
              await execAsync(`taskkill /pid ${pid} /t /f`)
              logger.info(`成功杀死进程 ${pid} (端口 ${port})`)
            } catch (killError) {
              logger.warn(`杀死进程 ${pid} 失败:`, killError)
            }
          }
        }
      } else {
        // Unix/Linux: 使用 lsof + kill
        try {
          const { stdout } = await execAsync(`lsof -ti:${port}`)
          const pids = stdout.trim().split('\n').filter(Boolean)
          
          for (const pid of pids) {
            await execAsync(`kill -9 ${pid}`)
            logger.info(`成功杀死进程 ${pid} (端口 ${port})`)
          }
        } catch (error) {
          // 可能端口没有被占用
        }
      }
      
      // 等待一秒后检查端口是否已释放
      await new Promise(resolve => setTimeout(resolve, 1000))
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