/**
 * 文件系统控制器
 * 处理文件系统相关操作
 */

import { Router, Request, Response } from 'express'
import { existsSync, accessSync, constants, statSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { normalize, join, extname, basename } from 'path'
import { spawn } from 'child_process'
import { logger } from '../../utils/logger.js'
import { pathSecurityManager } from '../../core/security/PathSecurityManager.js'

export class FilesystemController {
  private router = Router()

  constructor() {
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // 检查路径可访问性
    this.router.post('/check-path', this.checkPath.bind(this))

    // 浏览目录
    this.router.post('/browse', this.browseDirectory.bind(this))

    // 原生目录选择（Windows）
    this.router.post('/select-folder', this.selectFolder.bind(this))

    // 扫描目录下的 .exe 文件
    this.router.get('/scan-exe-files', this.scanExeFiles.bind(this))
  }

  private async showWindowsFolderPicker(startPath?: string): Promise<{ cancelled: boolean; path?: string }> {
    return new Promise((resolve, reject) => {
      const escapedStartPath = (startPath || '').replace(/'/g, "''")
      const script = [
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$dialog.Description = '请选择扫描目录'",
        '$dialog.ShowNewFolderButton = $false',
        "$dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer",
        `$initialPath = '${escapedStartPath}'`,
        "if ($initialPath -and (Test-Path -LiteralPath $initialPath)) { $dialog.SelectedPath = $initialPath }",
        "$result = $dialog.ShowDialog()",
        "if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {",
        "  Write-Output ('__FOLDER_PICKER_SELECTED__' + $dialog.SelectedPath)",
        "} else {",
        "  Write-Output '__FOLDER_PICKER_CANCELLED__'",
        "}"
      ].join('; ')

      const ps = spawn(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-Command', script],
        { windowsHide: true }
      )

      let stdout = ''
      let stderr = ''

      const timeout = setTimeout(() => {
        ps.kill()
        reject(new Error('目录选择超时'))
      }, 2 * 60 * 1000)

      ps.stdout.on('data', chunk => {
        stdout += chunk.toString()
      })

      ps.stderr.on('data', chunk => {
        stderr += chunk.toString()
      })

      ps.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      ps.on('close', (code) => {
        clearTimeout(timeout)

        const output = stdout.trim()

        if (output.includes('__FOLDER_PICKER_CANCELLED__')) {
          resolve({ cancelled: true })
          return
        }

        if (output.includes('__FOLDER_PICKER_SELECTED__')) {
          const selectedPath = output.replace('__FOLDER_PICKER_SELECTED__', '').trim()
          resolve({ cancelled: false, path: selectedPath })
          return
        }

        if (code === 0 && output) {
          resolve({ cancelled: false, path: output })
          return
        }

        reject(new Error(stderr.trim() || `PowerShell exited with code ${code ?? 'unknown'}`))
      })
    })
  }

  /**
   * 检查路径是否可访问
   */
  async checkPath(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body

      if (!path) {
        res.status(400).json({
          success: false,
          error: '路径参数不能为空'
        })
        return
      }

      // 规范化路径
      const normalizedPath = normalize(path)

      // 检查路径是否存在
      const exists = existsSync(normalizedPath)

      if (!exists) {
        res.json({
          success: false,
          data: {
            accessible: false,
            exists: false,
            path: normalizedPath,
            reason: '路径不存在'
          }
        })
        return
      }

      // 检查是否可访问
      let accessible = false
      let isDirectory = false
      let isFile = false
      let policyAllowed = true
      let policyReason = ''

      try {
        accessSync(normalizedPath, constants.R_OK)
        accessible = true

        const stats = statSync(normalizedPath)
        isDirectory = stats.isDirectory()
        isFile = stats.isFile()
      } catch (error) {
        logger.warn('路径无法访问:', { path: normalizedPath, error })
      }

      // 与 PM2 相同的路径白名单策略，避免“检测可访问但启动失败”的体验
      if (accessible) {
        const policyCheck = await pathSecurityManager.checkAccess({
          path: normalizedPath,
          operation: 'execute',
          user: {
            id: 'filesystem-controller',
            role: 'system',
            permissions: ['file:read', 'file:write', 'file:execute']
          },
          context: { requestId: 'filesystem-check-path', ip: req.ip, userAgent: req.headers['user-agent'] }
        })

        policyAllowed = policyCheck.allowed
        policyReason = policyCheck.reason || ''
        accessible = accessible && policyAllowed
      }

      res.json({
        success: true,
        data: {
          accessible,
          exists: true,
          isDirectory,
          isFile,
          path: normalizedPath,
          policyAllowed,
          policyReason: policyAllowed ? undefined : policyReason
        }
      })
    } catch (error) {
      logger.error('检查路径失败:', error)
      res.status(500).json({
        success: false,
        error: '检查路径失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 打开系统原生目录选择器并返回绝对路径
   */
  async selectFolder(req: Request, res: Response): Promise<void> {
    try {
      if (process.platform !== 'win32') {
        res.status(501).json({
          success: false,
          error: '当前系统不支持原生目录选择，请手动输入绝对路径'
        })
        return
      }

      const rawStartPath = typeof req.body?.startPath === 'string' ? req.body.startPath.trim() : ''
      const startPath = rawStartPath ? normalize(rawStartPath) : undefined

      const result = await this.showWindowsFolderPicker(startPath)

      if (result.cancelled) {
        res.json({
          success: true,
          data: {
            cancelled: true
          }
        })
        return
      }

      const selectedPath = result.path ? normalize(result.path) : ''
      if (!selectedPath) {
        res.status(500).json({
          success: false,
          error: '未获取到有效的目录路径'
        })
        return
      }

      if (!existsSync(selectedPath)) {
        res.status(404).json({
          success: false,
          error: '所选目录不存在'
        })
        return
      }

      const stats = statSync(selectedPath)
      if (!stats.isDirectory()) {
        res.status(400).json({
          success: false,
          error: '所选路径不是目录'
        })
        return
      }

      res.json({
        success: true,
        data: {
          cancelled: false,
          path: selectedPath,
          source: 'native'
        }
      })
    } catch (error) {
      logger.error('原生目录选择失败:', error)
      res.status(500).json({
        success: false,
        error: '原生目录选择失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 浏览目录
   */
  async browseDirectory(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body

      if (!path) {
        res.status(400).json({
          success: false,
          error: '路径参数不能为空'
        })
        return
      }

      // 规范化路径
      const normalizedPath = normalize(path)

      // 检查路径是否存在且为目录
      if (!existsSync(normalizedPath)) {
        res.status(404).json({
          success: false,
          error: '目录不存在'
        })
        return
      }

      const stats = statSync(normalizedPath)
      if (!stats.isDirectory()) {
        res.status(400).json({
          success: false,
          error: '指定路径不是目录'
        })
        return
      }

      // TODO: 实现目录内容读取和返回

      res.json({
        success: true,
        data: {
          path: normalizedPath,
          items: []
        }
      })
    } catch (error) {
      logger.error('浏览目录失败:', error)
      res.status(500).json({
        success: false,
        error: '浏览目录失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 扫描目录下的 .exe 文件（最多 2 层深度）
   * GET /filesystem/scan-exe-files?path=<directory>
   */
  async scanExeFiles(req: Request, res: Response): Promise<void> {
    try {
      const inputPath = typeof req.query.path === 'string' ? req.query.path.trim() : ''

      if (!inputPath) {
        res.status(400).json({ success: false, error: '缺少 path 参数' })
        return
      }

      const normalizedPath = normalize(inputPath)

      if (!existsSync(normalizedPath)) {
        res.status(404).json({ success: false, error: '目录不存在' })
        return
      }

      const dirStat = statSync(normalizedPath)
      if (!dirStat.isDirectory()) {
        res.status(400).json({ success: false, error: '指定路径不是目录' })
        return
      }

      const exeFiles = await this.collectExeFiles(normalizedPath, 2)

      logger.info('EXE 文件扫描完成', {
        directory: normalizedPath,
        found: exeFiles.length
      })

      res.json({
        success: true,
        data: {
          directory: normalizedPath,
          files: exeFiles
        }
      })
    } catch (error) {
      logger.error('扫描 EXE 文件失败:', error)
      res.status(500).json({
        success: false,
        error: '扫描失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 递归收集 .exe 文件（限制深度，跳过常见无关目录）
   */
  private async collectExeFiles(
    directory: string,
    maxDepth: number
  ): Promise<Array<{ name: string; path: string }>> {
    const results: Array<{ name: string; path: string }> = []

    if (maxDepth < 0) return results

    // 跳过这些目录（避免扫描到无关的系统/依赖目录）
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv'])

    let entries: string[]
    try {
      entries = await readdir(directory)
    } catch {
      return results
    }

    for (const entry of entries) {
      const fullPath = join(directory, entry)
      let entryStat
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }

      if (entryStat.isFile() && extname(entry).toLowerCase() === '.exe') {
        results.push({ name: basename(entry), path: fullPath })
      } else if (entryStat.isDirectory() && !skipDirs.has(entry) && maxDepth > 0) {
        const nested = await this.collectExeFiles(fullPath, maxDepth - 1)
        results.push(...nested)
      }
    }

    // 按文件名排序，方便用户查找
    results.sort((a, b) => a.name.localeCompare(b.name))
    return results
  }

  getRouter(): Router {
    return this.router
  }
}
