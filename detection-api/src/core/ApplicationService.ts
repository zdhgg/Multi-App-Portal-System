/**
 * Application Service - Clean Implementation
 * 
 * This service replaces the messy v1 application management.
 * Every function is under 20 lines, does one thing well.
 * 
 * Linus's principle: "Functions should be short and sweet, 
 * and do just one thing."
 */

import { v4 as uuidv4 } from 'uuid'
import { existsSync, statSync } from 'fs'
import { normalize, resolve } from 'path'
import type {
  Application,
  ApplicationService as IApplicationService,
  ApplicationRepository,
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationState,
  NetworkConfiguration
} from '../core/types'
import { ApplicationError } from '../core/types'
import { logger } from '../utils/logger'
import type { ConfigManager, PortConfiguration } from '../services/configManager'

export class ApplicationService implements IApplicationService {
  constructor(
    private repository: ApplicationRepository,
    private networkService: NetworkService,
    private processManager: ProcessManager,
    private configManager?: ConfigManager
  ) {}

  async create(input: CreateApplicationInput): Promise<Application> {
    logger.info('Creating application', { name: input.name })

    const normalizedDirectory = this.normalizeDirectoryPath(input.directory)
    this.assertDirectoryPathUsable(normalizedDirectory)
    const normalizedBuildScript = this.normalizeExecutablePath(input.buildScript ?? input.build_script)
    const normalizedTechStack = (input.techStack || '').trim().toLowerCase()
    const shouldAutoAllocateSecondary = await this.shouldAutoAllocateSecondaryPort(normalizedDirectory, normalizedTechStack)
    const hasSecondaryInput = Array.isArray(input.secondaryPorts) && input.secondaryPorts.length > 0
    const usesSplitPortRanges = shouldAutoAllocateSecondary || hasSecondaryInput

    if (usesSplitPortRanges) {
      this.assertFullStackPortRanges(input.primaryPort, input.secondaryPorts)
    }

    if (normalizedTechStack === 'external-exe') {
      if (!normalizedBuildScript) {
        throw new ApplicationError(
          'External executable applications require buildScript',
          'VALIDATION_ERROR',
          { field: 'buildScript' }
        )
      }
      this.assertExecutablePathUsable(normalizedBuildScript)
    }
     
    // Check if directory already exists
    const existing = await this.repository.findByDirectory(normalizedDirectory)
    if (existing) {
      throw new ApplicationError(
        'Application already exists at this directory',
        'DIRECTORY_ALREADY_EXISTS',
        { directory: normalizedDirectory }
      )
    }
    
    const allocatedPortsForRollback: number[] = []

    try {
      // Handle port allocation
      let primaryPort: number
      let secondaryPorts: number[] = []

      if (input.primaryPort) {
        // Use provided primary port
        primaryPort = input.primaryPort
      } else {
        // 全栈应用主端口固定从前端范围分配，其他应用保持原有逻辑
        const primaryScope: PortAllocationScope = usesSplitPortRanges ? 'frontend' : 'unified'
        primaryPort = await this.networkService.allocatePort(primaryScope)
        allocatedPortsForRollback.push(primaryPort)
      }

      if (hasSecondaryInput) {
        // Use provided secondary ports
        secondaryPorts = [...(input.secondaryPorts as readonly number[])]
      } else if (shouldAutoAllocateSecondary) {
        const secondaryPort = await this.allocatePortExcluding(new Set([primaryPort]), 'backend')
        secondaryPorts = [secondaryPort]
        allocatedPortsForRollback.push(secondaryPort)

        logger.info('Auto-allocated secondary port for fullstack application', {
          name: input.name,
          primaryPort,
          secondaryPort
        })
      }

      // 检测全栈项目配置
      const fullStackConfig = await this.detectFullStackConfiguration(normalizedDirectory, primaryPort, secondaryPorts)

      // Build application object
      const app: Application = {
        id: uuidv4(),
        name: input.name,
        directory: normalizedDirectory,
        techStack: this.parseTechStack(input.techStack),
        network: {
          primaryPort,
          secondaryPorts,
          protocol: (input.protocol as 'http' | 'https') || 'http'
        },
        state: 'stopped',
        metadata: {
          description: input.description,
          icon: input.icon || '🚀',
          color: input.color || '#007bff',
          accessPath: input.accessPath,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000)
        },
        fullStack: fullStackConfig,
        deploymentMode: 'unknown',
        pm2ProcessName: null,
        buildScript: normalizedBuildScript,
        build_script: normalizedBuildScript
      }
      
      await this.repository.save(app)
      logger.info('Application created', { id: app.id, name: app.name })
      
      return app
    } catch (error) {
      await this.releaseAllocatedPortsOnFailure(allocatedPortsForRollback)
      throw error
    }
  }

  async findById(id: string): Promise<Application> {
    const app = await this.repository.findById(id)
    if (!app) {
      throw new ApplicationError(
        'Application not found',
        'APPLICATION_NOT_FOUND',
        { id }
      )
    }

    const appWithSecondaryPort = await this.autoFixMissingFullStackSecondaryPort(app)

    // 重新检测全栈配置（因为数据库中没有存储）
    const fullStackConfig = await this.detectFullStackConfiguration(
      appWithSecondaryPort.directory,
      appWithSecondaryPort.network.primaryPort,
      appWithSecondaryPort.network.secondaryPorts
    )

    // 返回包含全栈配置的应用对象
    return {
      ...appWithSecondaryPort,
      fullStack: fullStackConfig
    }
  }

  async findAll(): Promise<readonly Application[]> {
    const apps = await this.repository.findAll()
    const hydrated: Application[] = []

    for (const app of apps) {
      hydrated.push(await this.autoFixMissingFullStackSecondaryPort(app))
    }

    return hydrated
  }

  async update(id: string, input: UpdateApplicationInput): Promise<Application> {
    const app = await this.findById(id)
    this.enforceUpdatePolicy(app, input)
    const nextAccessPath = input.accessPath === null
      ? undefined
      : (input.accessPath !== undefined ? input.accessPath : app.metadata.accessPath)
    
    // Create updated application
    const updatedApp: Application = {
      ...app,
      name: input.name ?? app.name,
      techStack: input.techStack ? this.parseTechStack(input.techStack) : app.techStack,
      metadata: {
        ...app.metadata,
        description: input.description ?? app.metadata.description,
        icon: input.icon ?? app.metadata.icon,
        color: input.color ?? app.metadata.color,
        pinned: input.pinned ?? app.metadata.pinned,
        accessPath: nextAccessPath,
        updatedAt: Math.floor(Date.now() / 1000)
      }
    }
    
    await this.repository.save(updatedApp)
    logger.info('Application updated', { id, changes: Object.keys(input) })
    
    return updatedApp
  }

  async delete(id: string): Promise<void> {
    try {
      const app = await this.findById(id)
      
      // Stop if running
      if (app.state === 'running') {
        try {
          await this.stop(id)
        } catch (stopError) {
          logger.warn('Failed to stop application before delete, continuing...', { 
            id, 
            error: stopError instanceof Error ? stopError.message : String(stopError) 
          })
        }
      }
      
      // Release allocated ports (with null checks)
      try {
        if (app.network?.primaryPort) {
          await this.networkService.releasePort(app.network.primaryPort)
        }
        if (Array.isArray(app.network?.secondaryPorts)) {
          for (const port of app.network.secondaryPorts) {
            if (port) {
              await this.networkService.releasePort(port)
            }
          }
        }
      } catch (portError) {
        logger.warn('Failed to release ports during delete, continuing...', { 
          id, 
          error: portError instanceof Error ? portError.message : String(portError) 
        })
      }
      
      await this.repository.delete(id)
      logger.info('Application deleted', { id, name: app.name })
    } catch (error) {
      logger.error('Failed to delete application', { 
        id, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw error
    }
  }

  async start(id: string): Promise<void> {
    const app = await this.findById(id)
    
    if (app.state === 'running') {
      logger.warn('Application already running', { id })
      return
    }

    this.enforceStartPolicy(app)
    
    // Enhanced port conflict detection
    try {
      // First check using NetworkService
      const conflicts = await this.networkService.checkConflicts([
        app.network.primaryPort,
        ...app.network.secondaryPorts
      ])
      
      if (conflicts.length > 0) {
        const conflictPorts = conflicts.map(c => c.port).join(', ')
        logger.warn('Port conflicts detected before starting application', { 
          id, 
          name: app.name, 
          conflicts: conflictPorts 
        })
        throw new ApplicationError(
          `端口冲突：端口 ${conflictPorts} 已被占用`,
          'PORT_CONFLICTS',
          { conflicts: conflicts.map(c => ({ port: c.port, pid: (c as any).pid || 0 })) }
        )
      }

      // Additional real-time port check using system commands
      const portInUse = await this.checkPortRealTime(app.network.primaryPort)
      if (portInUse.isInUse) {
        logger.warn('Real-time port check detected conflict', { 
          id, 
          name: app.name, 
          port: app.network.primaryPort,
          pid: portInUse.pid 
        })
        throw new ApplicationError(
          `端口 ${app.network.primaryPort} 已被进程 ${portInUse.pid} 占用`,
          'PORT_CONFLICTS',
          { conflicts: [{ port: app.network.primaryPort, pid: portInUse.pid }] }
        )
      }
      
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error
      }
      logger.error('Error during port conflict detection', { id, error: error.message })
      // Continue with startup attempt but log the detection error
    }
    
    // Start the process with enhanced error handling
    try {
      await this.processManager.start(app)
      await this.repository.updateState(id, 'running')
      
      logger.info('Application started successfully', { id, name: app.name, port: app.network.primaryPort })
    } catch (processError) {
      // Enhanced process start error handling
      await this.repository.updateState(id, 'failed').catch(() => {})
      
      // Check if it's a port-related error from the process
      if (processError.message && (
        processError.message.includes('EADDRINUSE') ||
        processError.message.includes('address already in use') ||
        processError.message.includes('Port') && processError.message.includes('already in use')
      )) {
        throw new ApplicationError(
          `应用启动失败：端口 ${app.network.primaryPort} 已被占用`,
          'PORT_CONFLICTS',
          { port: app.network.primaryPort, originalError: processError.message }
        )
      }
      
      throw processError
    }
  }

  async stop(id: string): Promise<void> {
    const app = await this.findById(id)

    if (app.state === 'stopped') {
      logger.warn('Application already stopped', { id })
      return
    }

    this.enforceStopPolicy(app)

    // 传递应用ID而不是整个应用对象
    await this.processManager.stop(id as any)

    // 释放端口 (with null checks)
    try {
      if (app.network?.primaryPort) {
        await this.networkService.releasePort(app.network.primaryPort)
        logger.info('Released primary port', { port: app.network.primaryPort, appId: id })
      }

      if (Array.isArray(app.network?.secondaryPorts)) {
        for (const port of app.network.secondaryPorts) {
          if (port) {
            await this.networkService.releasePort(port)
            logger.info('Released secondary port', { port, appId: id })
          }
        }
      }
    } catch (error) {
      logger.error('Failed to release ports', {
        appId: id,
        error: error instanceof Error ? error.message : String(error)
      })
      // 不抛出错误,继续更新状态
    }

    await this.repository.updateState(id, 'stopped')

    logger.info('Application stopped', { id, name: app.name })
  }

  async setPM2ProcessName(id: string, pm2ProcessName: string | null): Promise<void> {
    await this.repository.updatePM2ProcessName(id, pm2ProcessName)
    logger.info('Application PM2 process name updated', { id, pm2ProcessName })
  }

  async updateNetworkPorts(
    id: string,
    primaryPort: number,
    secondaryPorts: readonly number[] = []
  ): Promise<Application> {
    const app = await this.findById(id)

    if (!Number.isInteger(primaryPort) || primaryPort < 1 || primaryPort > 65535) {
      throw new ApplicationError(
        'primaryPort must be a valid TCP port',
        'VALIDATION_ERROR',
        { primaryPort }
      )
    }

    const normalizedSecondaryPorts = Array.from(new Set(
      (Array.isArray(secondaryPorts) ? secondaryPorts : [])
        .map((port) => Number(port))
        .filter((port) =>
          Number.isInteger(port) &&
          port > 0 &&
          port <= 65535 &&
          port !== primaryPort
        )
    ))

    const updatedApp: Application = {
      ...app,
      network: {
        ...app.network,
        primaryPort,
        secondaryPorts: normalizedSecondaryPorts
      },
      metadata: {
        ...app.metadata,
        updatedAt: Math.floor(Date.now() / 1000)
      }
    }

    await this.repository.save(updatedApp)
    logger.info('Application network ports updated', {
      id,
      appName: app.name,
      oldPrimaryPort: app.network.primaryPort,
      newPrimaryPort: primaryPort,
      secondaryPorts: normalizedSecondaryPorts
    })

    return updatedApp
  }

  /**
   * Real-time port availability check using system commands
   */
  private async checkPortRealTime(port: number): Promise<{ isInUse: boolean; pid?: number }> {
    const { spawn } = await import('child_process')
    
    return new Promise((resolve) => {
      // Use netstat to check if port is in use
      const netstat = spawn('netstat', ['-ano'], { shell: true, windowsHide: true })
      let output = ''
      
      netstat.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })
      
      netstat.on('close', () => {
        const lines = output.split('\n')
        for (const line of lines) {
          if (line.includes(`:${port} `) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/)
            const pid = parseInt(parts[parts.length - 1])
            logger.info('Port in use detected by real-time check', { port, pid, line: line.trim() })
            resolve({ isInUse: true, pid })
            return
          }
        }
        resolve({ isInUse: false })
      })
      
      netstat.on('error', (error) => {
        logger.warn('Failed to run real-time port check', { port, error: error.message })
        resolve({ isInUse: false })
      })
      
      // Timeout after 2 seconds
      setTimeout(() => {
        netstat.kill()
        resolve({ isInUse: false })
      }, 2000)
    })
  }

  /**
   * Parse tech stack string into structured type
   */
  private parseTechStack(techStackStr: string): TechStackType {
    // Simple tech stack parsing - can be extended
    const category = this.inferCategory(techStackStr)
    
    return {
      name: techStackStr,
      category,
      startCommand: this.getDefaultStartCommand(techStackStr)
    }
  }

  private inferCategory(techStack: string): 'frontend' | 'backend' | 'fullstack' {
    if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
      return 'frontend'
    }
    if (techStack.includes('express') || techStack.includes('fastify') || techStack.includes('koa')) {
      return 'backend'
    }
    return 'fullstack'
  }

  private getDefaultStartCommand(techStack: string): string {
    if (techStack.includes('vite')) return 'npm run dev'
    if (techStack.includes('next')) return 'npm run dev'
    if (techStack.includes('angular')) return 'ng serve'
    return 'npm start'
  }

  private normalizeDirectoryPath(directory: string): string {
    const trimmed = typeof directory === 'string' ? directory.trim() : ''
    if (!trimmed) return ''

    try {
      const resolvedPath = normalize(resolve(trimmed))
      const strippedPath = resolvedPath.replace(/[\\/]+$/, '')
      const safePath = strippedPath.length === 0 || /^[A-Za-z]:$/.test(strippedPath)
        ? resolvedPath
        : strippedPath
      return process.platform === 'win32' ? safePath.toLowerCase() : safePath
    } catch {
      const fallback = trimmed.replace(/[\\/]+$/, '').replace(/\\/g, '/')
      return process.platform === 'win32' ? fallback.toLowerCase() : fallback
    }
  }

  private normalizeExecutablePath(rawPath?: string): string | undefined {
    if (typeof rawPath !== 'string') return undefined
    const trimmed = rawPath.trim()
    if (!trimmed) return undefined

    try {
      return normalize(resolve(trimmed))
    } catch {
      return undefined
    }
  }

  private assertExecutablePathUsable(executablePath: string): void {
    if (!existsSync(executablePath)) {
      throw new ApplicationError(
        `Executable path does not exist: ${executablePath}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        { executablePath }
      )
    }

    let fileStat
    try {
      fileStat = statSync(executablePath)
    } catch (error) {
      throw new ApplicationError(
        `Executable path is not accessible: ${executablePath}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        {
          executablePath,
          reason: error instanceof Error ? error.message : String(error)
        }
      )
    }

    if (!fileStat.isFile()) {
      throw new ApplicationError(
        `Executable path is not a file: ${executablePath}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        { executablePath }
      )
    }
  }

  private assertDirectoryPathUsable(directory: string): void {
    if (!directory || !existsSync(directory)) {
      throw new ApplicationError(
        `Application directory does not exist: ${directory}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        { directory }
      )
    }

    let directoryStat
    try {
      directoryStat = statSync(directory)
    } catch (error) {
      throw new ApplicationError(
        `Application directory is not accessible: ${directory}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        {
          directory,
          reason: error instanceof Error ? error.message : String(error)
        }
      )
    }

    if (!directoryStat.isDirectory()) {
      throw new ApplicationError(
        `Application directory is not a folder: ${directory}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        { directory }
      )
    }
  }

  private enforceUpdatePolicy(app: Application, input: UpdateApplicationInput): void {
    const changingTechStack =
      typeof input.techStack === 'string' &&
      input.techStack.trim().length > 0 &&
      input.techStack.trim() !== app.techStack.name

    if (app.state === 'running' && changingTechStack) {
      throw new ApplicationError(
        'Cannot change tech stack while application is running',
        'STATE_POLICY_VIOLATION',
        {
          appId: app.id,
          currentState: app.state,
          requestedChange: 'techStack',
          currentTechStack: app.techStack.name,
          targetTechStack: input.techStack
        }
      )
    }
  }

  private enforceStartPolicy(app: Application): void {
    this.assertStateTransition(app.state, 'running', 'start', { appId: app.id, appName: app.name })
    this.assertDirectoryExists(app)
    this.assertNetworkConfigurationValid(app)
  }

  private enforceStopPolicy(app: Application): void {
    this.assertStateTransition(app.state, 'stopped', 'stop', { appId: app.id, appName: app.name })
  }

  private assertStateTransition(
    current: ApplicationState,
    target: ApplicationState,
    action: 'start' | 'stop',
    context: Record<string, unknown>
  ): void {
    const allowedTargets = ALLOWED_STATE_TRANSITIONS[current] || []
    if (allowedTargets.includes(target)) {
      return
    }

    throw new ApplicationError(
      `Invalid state transition: ${current} -> ${target}`,
      'INVALID_STATE_TRANSITION',
      {
        ...context,
        action,
        currentState: current,
        targetState: target,
        allowedTargets
      }
    )
  }

  private assertDirectoryExists(app: Application): void {
    if (!app.directory || !existsSync(app.directory)) {
      throw new ApplicationError(
        `Application directory does not exist: ${app.directory}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        {
          appId: app.id,
          appName: app.name,
          directory: app.directory
        }
      )
    }

    try {
      const directoryStat = statSync(app.directory)
      if (!directoryStat.isDirectory()) {
        throw new ApplicationError(
          `Application directory is not a folder: ${app.directory}`,
          'APPLICATION_DIRECTORY_NOT_FOUND',
          {
            appId: app.id,
            appName: app.name,
            directory: app.directory
          }
        )
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error
      }

      throw new ApplicationError(
        `Application directory is not accessible: ${app.directory}`,
        'APPLICATION_DIRECTORY_NOT_FOUND',
        {
          appId: app.id,
          appName: app.name,
          directory: app.directory,
          reason: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  private assertNetworkConfigurationValid(app: Application): void {
    const ports = [app.network.primaryPort, ...app.network.secondaryPorts]
    const hasInvalidPort = ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)

    if (hasInvalidPort) {
      throw new ApplicationError(
        'Invalid network configuration detected',
        'INVALID_NETWORK_CONFIGURATION',
        {
          appId: app.id,
          appName: app.name,
          ports
        }
      )
    }
  }

  private getConfiguredPortRanges(): {
    frontend: { start: number; end: number }
    backend: { start: number; end: number }
  } {
    const defaults = {
      frontend: { start: 3001, end: 3100 },
      backend: { start: 8001, end: 8100 }
    }

    const config = this.configManager?.getPortConfig?.()
    if (!config) {
      return defaults
    }

    const normalizeRange = (
      rawRange: PortConfiguration['frontendRange'] | PortConfiguration['backendRange'] | undefined,
      fallback: { start: number; end: number }
    ) => {
      const start = Number(rawRange?.start)
      const end = Number(rawRange?.end)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
        return fallback
      }

      return { start, end }
    }

    return {
      frontend: normalizeRange(config.frontendRange, defaults.frontend),
      backend: normalizeRange(config.backendRange, defaults.backend)
    }
  }

  private isPortInRange(port: number, range: { start: number; end: number }): boolean {
    return Number.isInteger(port) && port >= range.start && port <= range.end
  }

  private assertFullStackPortRanges(
    primaryPort: number | undefined,
    secondaryPorts: readonly number[] | undefined
  ): void {
    const { frontend, backend } = this.getConfiguredPortRanges()
    const errors: string[] = []

    if (typeof primaryPort === 'number' && !this.isPortInRange(primaryPort, frontend)) {
      errors.push(`主端口必须在前端端口范围 ${frontend.start}-${frontend.end} 内`)
    }

    if (Array.isArray(secondaryPorts)) {
      for (const port of secondaryPorts) {
        if (!this.isPortInRange(port, backend)) {
          errors.push(`后端端口必须在后端端口范围 ${backend.start}-${backend.end} 内`)
          break
        }
      }
    }

    if (errors.length > 0) {
      throw new ApplicationError(errors.join('; '), 'VALIDATION_ERROR', {
        primaryPort,
        secondaryPorts,
        portRanges: { frontend, backend },
        errors
      })
    }
  }

  private async shouldAutoAllocateSecondaryPort(
    directory: string,
    normalizedTechStack: string
  ): Promise<boolean> {
    if (normalizedTechStack === 'external-exe') {
      return false
    }

    if (normalizedTechStack === 'fullstack') {
      return true
    }

    return this.isSeparatedFullStackDirectory(directory)
  }

  private isSeparatedFullStackDirectory(directory: string): boolean {
    const frontendDir = resolve(directory, 'frontend')
    const backendDir = resolve(directory, 'backend')
    return existsSync(frontendDir) && existsSync(backendDir)
  }

  private async allocatePortExcluding(
    excludedPorts: ReadonlySet<number>,
    scope: PortAllocationScope = 'unified'
  ): Promise<number> {
    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const port = await this.networkService.allocatePort(scope)
      if (!excludedPorts.has(port)) {
        return port
      }

      await this.networkService.releasePort(port)
    }

    throw new ApplicationError(
      'Failed to allocate a unique secondary port',
      'PORT_CONFLICTS',
      { excludedPorts: Array.from(excludedPorts) }
    )
  }

  private async releaseAllocatedPortsOnFailure(ports: readonly number[]): Promise<void> {
    for (const port of ports) {
      try {
        await this.networkService.releasePort(port)
      } catch (releaseError) {
        logger.warn('Failed to rollback allocated port', {
          port,
          error: releaseError instanceof Error ? releaseError.message : String(releaseError)
        })
      }
    }
  }

  private async autoFixMissingFullStackSecondaryPort(app: Application): Promise<Application> {
    let allocatedSecondaryPort: number | null = null

    try {
      if (app.state === 'running') {
        return app
      }

      if (Array.isArray(app.network?.secondaryPorts) && app.network.secondaryPorts.length > 0) {
        return app
      }

      const normalizedTechStack = String(app.techStack?.name || '').trim().toLowerCase()
      const shouldAutoAllocate = await this.shouldAutoAllocateSecondaryPort(app.directory, normalizedTechStack)
      if (!shouldAutoAllocate) {
        return app
      }

      const secondaryPort = await this.allocatePortExcluding(new Set([app.network.primaryPort]), 'backend')
      allocatedSecondaryPort = secondaryPort
      const updatedApp: Application = {
        ...app,
        network: {
          ...app.network,
          secondaryPorts: [secondaryPort]
        },
        metadata: {
          ...app.metadata,
          updatedAt: Math.floor(Date.now() / 1000)
        }
      }

      await this.repository.save(updatedApp)
      logger.info('Auto-healed missing fullstack secondary port', {
        appId: app.id,
        appName: app.name,
        primaryPort: app.network.primaryPort,
        secondaryPort
      })

      return updatedApp
    } catch (error) {
      if (allocatedSecondaryPort) {
        try {
          await this.networkService.releasePort(allocatedSecondaryPort)
        } catch (releaseError) {
          logger.warn('Failed to release auto-heal secondary port after error', {
            appId: app.id,
            port: allocatedSecondaryPort,
            error: releaseError instanceof Error ? releaseError.message : String(releaseError)
          })
        }
      }

      logger.warn('Failed to auto-heal fullstack secondary port', {
        appId: app.id,
        appName: app.name,
        error: error instanceof Error ? error.message : String(error)
      })
      return app
    }
  }

  /**
   * 检测全栈项目配置
   */
  private async detectFullStackConfiguration(
    directory: string,
    primaryPort: number,
    secondaryPorts: readonly number[]
  ): Promise<import('./types').FullStackConfiguration> {
    const { existsSync, readFileSync } = await import('fs')
    const { join } = await import('path')

    const frontendDir = join(directory, 'frontend')
    const backendDir = join(directory, 'backend')

    const hasFrontend = existsSync(frontendDir)
    const hasBackend = existsSync(backendDir)
    const isFullStack = hasFrontend && hasBackend

    if (!isFullStack) {
      return { isFullStack: false }
    }

    logger.info('Detected fullstack project', {
      directory,
      frontendDir,
      backendDir
    })

    // 配置前端
    let frontendConfig: import('./types').ProcessConfiguration | undefined
    if (hasFrontend) {
      const frontendPackageJson = join(frontendDir, 'package.json')
      let frontendStartCommand = 'npm run dev'

      if (existsSync(frontendPackageJson)) {
        try {
          const packageJson = JSON.parse(readFileSync(frontendPackageJson, 'utf-8'))
          const scripts = packageJson.scripts || {}
          if (scripts.dev) {
            frontendStartCommand = 'npm run dev'
          } else if (scripts.serve) {
            frontendStartCommand = 'npm run serve'
          }
        } catch (error) {
          logger.warn('Failed to parse frontend package.json', { error })
        }
      }

      frontendConfig = {
        workingDirectory: frontendDir,
        startCommand: frontendStartCommand,
        port: primaryPort, // 前端使用主端口
        environmentVariables: {
          NODE_ENV: 'development',
          VITE_PORT: primaryPort.toString()
        }
      }
    }

    // 配置后端
    let backendConfig: import('./types').ProcessConfiguration | undefined
    if (hasBackend) {
      const backendPackageJson = join(backendDir, 'package.json')
      let backendStartCommand = 'npm run dev'
      const backendPort = secondaryPorts[0] || 4076 // 使用第一个辅助端口或默认4076

      if (existsSync(backendPackageJson)) {
        try {
          const packageJson = JSON.parse(readFileSync(backendPackageJson, 'utf-8'))
          const scripts = packageJson.scripts || {}
          if (scripts.dev) {
            backendStartCommand = 'npm run dev'
          } else if (scripts['dev:simple']) {
            backendStartCommand = 'npm run dev:simple'
          } else if (scripts.start) {
            backendStartCommand = 'npm start'
          }
        } catch (error) {
          logger.warn('Failed to parse backend package.json', { error })
        }
      }

      backendConfig = {
        workingDirectory: backendDir,
        startCommand: backendStartCommand,
        port: backendPort,
        environmentVariables: {
          NODE_ENV: 'development',
          PORT: backendPort.toString()
        }
      }
    }

    return {
      isFullStack: true,
      frontendConfig,
      backendConfig
    }
  }
}

// =============================================================================
// SUPPORTING INTERFACES (to be implemented separately)
// =============================================================================

type PortAllocationScope = 'frontend' | 'backend' | 'unified'

interface NetworkService {
  allocatePort(scope?: PortAllocationScope): Promise<number>
  releasePort(port: number): Promise<void>
  checkConflicts(ports: readonly number[]): Promise<readonly PortConflict[]>
}

interface PortConflict {
  readonly port: number
  readonly currentOwner: string
  readonly requestedBy: string
}

interface ProcessManager {
  start(app: Application): Promise<void>
  stop(app: Application): Promise<void>
}

interface TechStackType {
  readonly name: string
  readonly category: 'frontend' | 'backend' | 'fullstack'
  readonly startCommand: string
}

const ALLOWED_STATE_TRANSITIONS: Record<ApplicationState, readonly ApplicationState[]> = {
  stopped: ['running'],
  running: ['stopped'],
  failed: ['running', 'stopped']
}
