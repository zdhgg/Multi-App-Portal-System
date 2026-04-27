/**
 * 文件系统控制器
 * 处理文件系统相关操作
 */

import { Router, Request, Response } from 'express'
import { existsSync, accessSync, constants, statSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { normalize, join, extname, basename, dirname } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { logger } from '../../utils/logger.js'
import { pathSecurityManager } from '../../core/security/PathSecurityManager.js'
import { parseWindowsFolderPickerOutput, sanitizePickerText } from './filesystemPicker.js'

export class FilesystemController {
  private router = Router()

  constructor() {
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // 检查路径可访问性
    this.router.post('/check-path', this.checkPath.bind(this))
    this.router.post('/validate', this.validatePath.bind(this))

    // 浏览目录
    this.router.get('/home', this.getHomeDirectory.bind(this))
    this.router.get('/browse', this.browseDirectory.bind(this))
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
        "Add-Type -AssemblyName System.Drawing",
        "$owner = New-Object System.Windows.Forms.Form",
        "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
        "$owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
        "$owner.Size = New-Object System.Drawing.Size(1, 1)",
        "$owner.ShowInTaskbar = $false",
        "$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow",
        "$owner.TopMost = $true",
        "$owner.Opacity = 0",
        "$owner.Show()",
        "$owner.Activate()",
        "[System.Windows.Forms.Application]::DoEvents()",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$dialog.Description = '请选择扫描目录'",
        '$dialog.ShowNewFolderButton = $false',
        "$dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer",
        `$initialPath = '${escapedStartPath}'`,
        "if ($initialPath -and (Test-Path -LiteralPath $initialPath)) { $dialog.SelectedPath = $initialPath }",
        "$result = $dialog.ShowDialog($owner)",
        "$owner.Close()",
        "$owner.Dispose()",
        "if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {",
        "  (@{ cancelled = $false; path = $dialog.SelectedPath } | ConvertTo-Json -Compress) | Write-Output",
        "} else {",
        "  (@{ cancelled = $true; path = $null } | ConvertTo-Json -Compress) | Write-Output",
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

        const output = sanitizePickerText(stdout)
        const parsedResult = parseWindowsFolderPickerOutput(output)

        if (parsedResult.cancelled) {
          resolve({ cancelled: true })
          return
        }

        if (parsedResult.path) {
          resolve({ cancelled: false, path: parsedResult.path })
          return
        }

        if (code === 0 && output) {
          resolve({ cancelled: false, path: output })
          return
        }

        reject(new Error(sanitizePickerText(stderr) || `PowerShell exited with code ${code ?? 'unknown'}`))
      })
    })
  }

  private buildAccessRequest(
    req: Request,
    path: string,
    operation: 'read' | 'write' | 'execute' | 'list',
    requestId: string
  ) {
    return {
      path,
      operation,
      user: {
        id: 'filesystem-controller',
        role: 'system',
        permissions: ['file:read', 'file:write', 'file:execute', 'file:list'] as string[]
      },
      context: {
        requestId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }
    }
  }

  private getDefaultBrowsePath(): string {
    const candidates = [
      process.env.DEFAULT_WORKSPACE_PATH?.trim(),
      process.cwd(),
      homedir()
    ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

    for (const candidate of candidates) {
      const normalizedCandidate = normalize(candidate)
      if (existsSync(normalizedCandidate)) {
        return normalizedCandidate
      }
    }

    return process.cwd()
  }

  private async evaluatePathState(
    req: Request,
    rawPath: string | undefined,
    operation: 'read' | 'write' | 'execute' | 'list',
    requestId: string
  ): Promise<{
    normalizedPath: string
    exists: boolean
    isDirectory: boolean
    isFile: boolean
    accessible: boolean
    policyAllowed: boolean
    policyReason?: string
    errorMessage?: string
  }> {
    const normalizedPath = normalize((rawPath || '').trim())

    if (!normalizedPath) {
      return {
        normalizedPath: '',
        exists: false,
        isDirectory: false,
        isFile: false,
        accessible: false,
        policyAllowed: false,
        errorMessage: '路径参数不能为空'
      }
    }

    const exists = existsSync(normalizedPath)
    if (!exists) {
      return {
        normalizedPath,
        exists: false,
        isDirectory: false,
        isFile: false,
        accessible: false,
        policyAllowed: false,
        errorMessage: '路径不存在'
      }
    }

    let isDirectory = false
    let isFile = false
    let fsAccessible = false

    try {
      const stats = statSync(normalizedPath)
      isDirectory = stats.isDirectory()
      isFile = stats.isFile()
      accessSync(normalizedPath, constants.R_OK)
      fsAccessible = true
    } catch (error) {
      logger.warn('路径无法访问:', { path: normalizedPath, error })
    }

    const policyCheck = await pathSecurityManager.checkAccess(
      this.buildAccessRequest(req, normalizedPath, operation, requestId)
    )

    const accessible = fsAccessible && policyCheck.allowed

    return {
      normalizedPath,
      exists: true,
      isDirectory,
      isFile,
      accessible,
      policyAllowed: policyCheck.allowed,
      policyReason: policyCheck.reason
    }
  }

  async getHomeDirectory(req: Request, res: Response): Promise<void> {
    try {
      const directory = this.getDefaultBrowsePath()
      const pathState = await this.evaluatePathState(req, directory, 'list', 'filesystem-home')

      if (!pathState.exists || !pathState.policyAllowed || !pathState.accessible) {
        res.status(403).json({
          success: false,
          error: pathState.policyReason || '默认目录不可访问'
        })
        return
      }

      res.json({
        success: true,
        data: {
          path: pathState.normalizedPath,
          name: basename(pathState.normalizedPath) || pathState.normalizedPath
        }
      })
    } catch (error) {
      logger.error('获取默认浏览目录失败:', error)
      res.status(500).json({
        success: false,
        error: '获取默认目录失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 检查路径是否可访问
   */
  async checkPath(req: Request, res: Response): Promise<void> {
    try {
      const path = typeof req.body?.path === 'string' ? req.body.path.trim() : ''

      if (!path) {
        res.status(400).json({
          success: false,
          error: '路径参数不能为空'
        })
        return
      }

      const pathState = await this.evaluatePathState(req, path, 'execute', 'filesystem-check-path')

      if (!pathState.exists) {
        res.json({
          success: false,
          data: {
            accessible: false,
            exists: false,
            path: pathState.normalizedPath,
            reason: pathState.errorMessage || '路径不存在'
          }
        })
        return
      }

      res.json({
        success: true,
        data: {
          accessible: pathState.accessible,
          exists: true,
          isDirectory: pathState.isDirectory,
          isFile: pathState.isFile,
          path: pathState.normalizedPath,
          policyAllowed: pathState.policyAllowed,
          policyReason: pathState.policyAllowed ? undefined : pathState.policyReason
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

  async validatePath(req: Request, res: Response): Promise<void> {
    try {
      const path = typeof req.body?.path === 'string' ? req.body.path.trim() : ''

      if (!path) {
        res.status(400).json({
          success: false,
          error: '路径参数不能为空'
        })
        return
      }

      const pathState = await this.evaluatePathState(req, path, 'list', 'filesystem-validate')

      res.json({
        success: true,
        data: {
          path: pathState.normalizedPath,
          exists: pathState.exists,
          isDirectory: pathState.isDirectory,
          isAccessible: pathState.accessible,
          isValid: pathState.exists && pathState.isDirectory && pathState.accessible,
          errorMessage: pathState.errorMessage || (!pathState.policyAllowed ? pathState.policyReason : undefined)
        }
      })
    } catch (error) {
      logger.error('验证路径失败:', error)
      res.status(500).json({
        success: false,
        error: '验证路径失败',
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
      const validateSelectedPath = req.body?.validateSelectedPath !== false

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

      if (validateSelectedPath && !existsSync(selectedPath)) {
        logger.warn('原生目录选择返回的路径在当前进程中不存在', {
          startPath,
          selectedPath,
          cwd: process.cwd(),
          platform: process.platform
        })
        res.status(404).json({
          success: false,
          error: '所选目录不存在'
        })
        return
      }

      if (validateSelectedPath) {
        const stats = statSync(selectedPath)
        if (!stats.isDirectory()) {
          res.status(400).json({
            success: false,
            error: '所选路径不是目录'
          })
          return
        }
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
      const rawPath =
        typeof req.query?.path === 'string' ? req.query.path :
        typeof req.body?.path === 'string' ? req.body.path :
        ''
      const showHiddenRaw =
        typeof req.query?.showHidden === 'string' ? req.query.showHidden :
        typeof req.body?.showHidden === 'string' ? req.body.showHidden :
        typeof req.body?.showHidden === 'boolean' ? String(req.body.showHidden) :
        'false'
      const showHidden = ['1', 'true', 'on', 'yes'].includes(showHiddenRaw.trim().toLowerCase())

      const targetPath = rawPath.trim() || this.getDefaultBrowsePath()
      const pathState = await this.evaluatePathState(req, targetPath, 'list', 'filesystem-browse')

      if (!pathState.exists) {
        res.status(404).json({
          success: false,
          error: pathState.errorMessage || '目录不存在'
        })
        return
      }

      if (!pathState.policyAllowed || !pathState.accessible) {
        res.status(403).json({
          success: false,
          error: pathState.policyReason || '目录不可访问'
        })
        return
      }

      if (!pathState.isDirectory) {
        res.status(400).json({
          success: false,
          error: '指定路径不是目录'
        })
        return
      }

      const directoryEntries = await readdir(pathState.normalizedPath, { withFileTypes: true })
      const items: Array<{
        name: string
        path: string
        type: 'file' | 'directory'
        size?: number
        lastModified?: string
        isHidden: boolean
        hasPermission: boolean
      }> = []

      for (const entry of directoryEntries) {
        const itemPath = normalize(join(pathState.normalizedPath, entry.name))
        const isHidden = entry.name.startsWith('.')

        if (!showHidden && isHidden) {
          continue
        }

        let entryStat
        try {
          entryStat = await stat(itemPath)
        } catch {
          continue
        }

        let hasPermission = true
        try {
          accessSync(itemPath, constants.R_OK)
        } catch {
          hasPermission = false
        }

        if (hasPermission) {
          const policyCheck = await pathSecurityManager.checkAccess(
            this.buildAccessRequest(
              req,
              itemPath,
              entry.isDirectory() ? 'list' : 'read',
              'filesystem-browse-item'
            )
          )
          hasPermission = policyCheck.allowed
        }

        items.push({
          name: entry.name,
          path: itemPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? entryStat.size : undefined,
          lastModified: entryStat.mtime.toISOString(),
          isHidden,
          hasPermission
        })
      }

      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name, 'zh-CN')
      })

      const parentCandidate = dirname(pathState.normalizedPath)
      let parentPath: string | null = null
      if (parentCandidate && parentCandidate !== pathState.normalizedPath) {
        const parentState = await this.evaluatePathState(req, parentCandidate, 'list', 'filesystem-browse-parent')
        if (parentState.exists && parentState.policyAllowed && parentState.isDirectory) {
          parentPath = parentState.normalizedPath
        }
      }

      res.json({
        success: true,
        data: {
          currentPath: pathState.normalizedPath,
          parentPath,
          items
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
