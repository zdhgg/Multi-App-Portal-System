/**
 * ScannerStage - 扫描阶段
 * 
 * 负责遍历目录结构，找出所有可能的应用目录
 * 同时收集目录结构信息，供后续全栈项目检测使用
 */

import { readdir, stat, readFile } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { PipelineStage } from '../PipelineStage'
import { ScanContext, ScannedDirectory } from '../ScanContext'
import { logger } from '../../../utils/logger'

export class ScannerStage extends PipelineStage {
  readonly name = 'Scanner'
  
  /**
   * 应用目录标识文件
   */
  private readonly APP_MARKERS = ['package.json', 'composer.json', 'pom.xml', 'build.gradle']
  
  /**
   * 跳过的目录
   */
  private readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', 
    'dist', 'build', '.next', '.nuxt', 
    'coverage', '__pycache__', '.cache',
    'vendor', 'target', 'bin', 'obj'
  ])
  // 应用目录命中后，继续向下扫描的层级（用于发现嵌套前后端目录）
  private readonly APP_NESTED_SCAN_DEPTH = 3
  
  protected async process(context: ScanContext): Promise<void> {
    const { workspacePath } = context.metadata
    const { maxDepth, excludePatterns } = context.config
    
    // 合并排除模式
    const skipDirs = new Set([...this.SKIP_DIRS, ...excludePatterns])
    
    // 扫描时多扫描一层，以便检测全栈项目组件
    // 返回时会按用户设置的深度过滤
    const scanDepth = maxDepth + 1
    
    logger.info('[Scanner] 开始扫描目录', {
      workspacePath,
      userMaxDepth: maxDepth,
      scanDepth,
      excludePatterns: Array.from(skipDirs)
    })
    
    // 执行递归扫描
    await this.scanDirectory(
      workspacePath,
      context,
      skipDirs,
      0,
      scanDepth,
      null
    )
    
    logger.info('[Scanner] 目录扫描完成', {
      totalScanned: context.results.scannedDirectories.length,
      appDirectories: context.results.scannedDirectories.filter(d => d.hasPackageJson).length
    })
  }
  
  /**
   * 递归扫描目录
   */
  private async scanDirectory(
    dirPath: string,
    context: ScanContext,
    skipDirs: Set<string>,
    currentDepth: number,
    maxDepth: number,
    parentPath: string | null
  ): Promise<void> {
    // 检查目录是否存在
    if (!existsSync(dirPath)) {
      logger.debug('[Scanner] 目录不存在，跳过', { dirPath })
      return
    }
    
    try {
      // 读取目录内容
      const entries = await readdir(dirPath)
      
      // 检查是否有 package.json
      const hasPackageJson = entries.includes('package.json')
      
      // 记录扫描的目录
      const scannedDir: ScannedDirectory = {
        path: dirPath,
        depth: currentDepth,
        hasPackageJson,
        entries,
        parentPath
      }
      context.results.scannedDirectories.push(scannedDir)
      
      // 如果是应用目录（有 package.json），仍需继续下探几层
      // 用于识别 monorepo/全栈项目中的嵌套应用（如 web-admin/client）
      if (hasPackageJson) {
        logger.debug('[Scanner] 发现应用目录，继续检查子目录是否有全栈结构', { 
          dirPath, 
          depth: currentDepth,
          name: basename(dirPath)
        })
        
        await this.scanChildrenForFullStack(
          dirPath,
          context,
          skipDirs,
          currentDepth + 1,
          maxDepth,
          1
        )
        return
      }
      
      // 检查是否达到最大深度
      if (currentDepth >= maxDepth) {
        logger.debug('[Scanner] 达到最大深度，停止扫描', { 
          dirPath, 
          currentDepth, 
          maxDepth 
        })
        return
      }
      
      // 扫描子目录
      for (const entry of entries) {
        // 跳过隐藏目录和排除的目录
        if (entry.startsWith('.') || skipDirs.has(entry)) {
          continue
        }
        
        const fullPath = join(dirPath, entry)
        
        try {
          const stats = await stat(fullPath)
          
          if (stats.isDirectory()) {
            await this.scanDirectory(
              fullPath,
              context,
              skipDirs,
              currentDepth + 1,
              maxDepth,
              dirPath
            )
          }
        } catch (error) {
          // 跳过无法访问的目录
          logger.debug('[Scanner] 无法访问目录', { 
            path: fullPath, 
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      
    } catch (error) {
      logger.debug('[Scanner] 扫描目录失败', { 
        dirPath, 
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  
  
  /**
   * 扫描子目录以检测全栈/monorepo 结构
   * 在命中应用目录后继续下探有限层级，避免漏掉嵌套子应用
   */
  private async scanChildrenForFullStack(
    dirPath: string,
    context: ScanContext,
    skipDirs: Set<string>,
    childDepth: number,
    maxDepth: number,
    nestedLevel: number
  ): Promise<void> {
    if (childDepth > maxDepth || nestedLevel > this.APP_NESTED_SCAN_DEPTH) {
      return
    }

    try {
      const entries = await readdir(dirPath)
      
      for (const entry of entries) {
        // 跳过隐藏目录和排除的目录
        if (entry.startsWith('.') || skipDirs.has(entry)) {
          continue
        }
        
        const fullPath = join(dirPath, entry)
        
        try {
          const stats = await stat(fullPath)
          
          if (stats.isDirectory()) {
            const childEntries = await readdir(fullPath)
            const hasPackageJson = childEntries.includes('package.json')
            
            // 记录子目录信息（用于全栈检测）
            const scannedDir: ScannedDirectory = {
              path: fullPath,
              depth: childDepth,
              hasPackageJson,
              entries: childEntries,
              parentPath: dirPath
            }
            context.results.scannedDirectories.push(scannedDir)
            
            if (hasPackageJson) {
              logger.debug('[Scanner] 在应用目录下发现子应用', { 
                path: fullPath, 
                depth: childDepth,
                name: basename(fullPath)
              })
            }

            // 继续向下扫描有限层级，支持识别类似 web-admin/client 的结构
            if (childDepth < maxDepth && nestedLevel < this.APP_NESTED_SCAN_DEPTH) {
              await this.scanChildrenForFullStack(
                fullPath,
                context,
                skipDirs,
                childDepth + 1,
                maxDepth,
                nestedLevel + 1
              )
            }
          }
        } catch (error) {
          // 跳过无法访问的目录
        }
      }
    } catch (error) {
      logger.debug('[Scanner] 扫描子目录失败', { 
        dirPath, 
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  
  protected getStageStats(context: ScanContext): Record<string, any> {
    const dirs = context.results.scannedDirectories
    return {
      totalDirectories: dirs.length,
      appDirectories: dirs.filter(d => d.hasPackageJson).length,
      maxDepthReached: Math.max(...dirs.map(d => d.depth), 0)
    }
  }
}
