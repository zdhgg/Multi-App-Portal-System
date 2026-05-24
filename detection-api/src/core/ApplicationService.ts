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
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join, normalize, resolve } from 'path'
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

const FRONTEND_DIRECTORY_CANDIDATES = [
  'frontend',
  'client',
  'web',
  'ui',
  'app-ui',
  'portal'
] as const

const BACKEND_DIRECTORY_CANDIDATES = [
  'backend',
  'server',
  'api',
  'services',
  'app-server'
] as const

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
    const hasPrimaryInput = typeof input.primaryPort === 'number'
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

      if (usesSplitPortRanges && (!hasPrimaryInput || !hasSecondaryInput)) {
        const pairedAllocation = await this.allocateSplitPortConfiguration(
          input.primaryPort,
          input.secondaryPorts
        )
        primaryPort = pairedAllocation.primaryPort
        secondaryPorts = pairedAllocation.secondaryPorts
        allocatedPortsForRollback.push(...pairedAllocation.allocatedPorts)
      } else {
        if (hasPrimaryInput) {
          primaryPort = input.primaryPort as number
        } else {
          // 全栈应用主端口固定从前端范围分配，其他应用保持原有逻辑
          const primaryScope: PortAllocationScope = usesSplitPortRanges ? 'frontend' : 'unified'
          primaryPort = await this.networkService.allocatePort(primaryScope)
          allocatedPortsForRollback.push(primaryPort)
        }

        if (hasSecondaryInput) {
          secondaryPorts = [...(input.secondaryPorts as readonly number[])]
        }
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
      const appWithSecondaryPort = await this.autoFixMissingFullStackSecondaryPort(app)
      const fullStackConfig = await this.detectFullStackConfiguration(
        appWithSecondaryPort.directory,
        appWithSecondaryPort.network.primaryPort,
        appWithSecondaryPort.network.secondaryPorts
      )
      hydrated.push({
        ...appWithSecondaryPort,
        fullStack: fullStackConfig
      })
    }

    return hydrated
  }

  async update(id: string, input: UpdateApplicationInput): Promise<Application> {
    const app = await this.findById(id)
    this.enforceUpdatePolicy(app, input)
    const nextAccessPath = input.accessPath === null
      ? undefined
      : (input.accessPath !== undefined ? input.accessPath : app.metadata.accessPath)
    const nextDirectory = input.directory !== undefined
      ? this.normalizeDirectoryPath(input.directory)
      : app.directory
    const explicitBuildScript = input.buildScript ?? input.build_script
    const nextTechStack = input.techStack ? this.parseTechStack(input.techStack) : app.techStack
    const normalizedNextTechStack = String(nextTechStack.name || '').trim().toLowerCase()

    if (input.directory !== undefined) {
      this.assertDirectoryPathUsable(nextDirectory)
    }

    let nextBuildScript = explicitBuildScript !== undefined
      ? this.normalizeExecutablePath(explicitBuildScript)
      : this.normalizeExecutablePath(app.buildScript ?? app.build_script)

    if (explicitBuildScript !== undefined && !nextBuildScript) {
      throw new ApplicationError(
        'Invalid buildScript path',
        'VALIDATION_ERROR',
        { field: 'buildScript', value: explicitBuildScript }
      )
    }

    if (
      normalizedNextTechStack === 'external-exe' &&
      input.directory !== undefined &&
      explicitBuildScript === undefined
    ) {
      const autoResolvedBuildScript = this.resolveExternalExeBuildScriptForDirectory(
        app.buildScript ?? app.build_script,
        nextDirectory
      )

      if (autoResolvedBuildScript && autoResolvedBuildScript !== nextBuildScript) {
        logger.info('Auto-remapped external-exe build script after directory update', {
          appId: app.id,
          appName: app.name,
          previousBuildScript: app.buildScript ?? app.build_script,
          nextBuildScript: autoResolvedBuildScript,
          nextDirectory
        })
      }

      nextBuildScript = autoResolvedBuildScript
    }

    if (normalizedNextTechStack === 'external-exe') {
      if (!nextBuildScript) {
        throw new ApplicationError(
          'External executable applications require buildScript',
          'VALIDATION_ERROR',
          { field: 'buildScript', appId: app.id, appName: app.name, directory: nextDirectory }
        )
      }

      this.assertExecutablePathUsable(nextBuildScript)
    }

    const runtimeTargetChanged =
      nextDirectory !== app.directory ||
      nextBuildScript !== this.normalizeExecutablePath(app.buildScript ?? app.build_script)
    
    // Handle port updates if provided
    let nextNetwork = app.network
    if (input.primaryPort !== undefined || input.secondaryPorts !== undefined || input.protocol !== undefined) {
      const newPrimaryPort = input.primaryPort ?? app.network.primaryPort
      const newSecondaryPorts = input.secondaryPorts !== undefined
        ? [...input.secondaryPorts]
        : [...app.network.secondaryPorts]
      const newProtocol = input.protocol ?? app.network.protocol

      // Validate primary port
      if (!Number.isInteger(newPrimaryPort) || newPrimaryPort < 1 || newPrimaryPort > 65535) {
        throw new ApplicationError(
          'primaryPort must be a valid TCP port (1-65535)',
          'VALIDATION_ERROR',
          { primaryPort: newPrimaryPort }
        )
      }

      // Validate secondary ports
      const invalidSecondaryPorts = newSecondaryPorts.filter(
        port => !Number.isInteger(port) || port < 1 || port > 65535 || port === newPrimaryPort
      )
      if (invalidSecondaryPorts.length > 0) {
        throw new ApplicationError(
          'All secondary ports must be valid TCP ports and different from primary port',
          'VALIDATION_ERROR',
          { invalidPorts: invalidSecondaryPorts }
        )
      }

      // Check for port conflicts if ports changed
      const portsChanged =
        newPrimaryPort !== app.network.primaryPort ||
        JSON.stringify([...newSecondaryPorts].sort((a, b) => a - b)) !==
          JSON.stringify([...app.network.secondaryPorts].sort((a, b) => a - b))

      if (portsChanged) {
        const allNewPorts = [newPrimaryPort, ...newSecondaryPorts]
        const existingPorts = new Set(this.getConfiguredPorts(app))
        const portsToCheck = allNewPorts.filter(port => !existingPorts.has(port))
        const conflicts = portsToCheck.length > 0
          ? await this.networkService.checkConflicts(portsToCheck)
          : []

        if (conflicts.length > 0) {
          throw new ApplicationError(
            `端口冲突：${conflicts.map(c => `端口 ${c.port} 已被 ${c.currentOwner || '其他进程'} 使用`).join(', ')}`,
            'PORT_CONFLICTS',
            { conflicts }
          )
        }

        logger.info('Updating application ports', {
          appId: id,
          appName: app.name,
          oldPrimaryPort: app.network.primaryPort,
          newPrimaryPort,
          oldSecondaryPorts: app.network.secondaryPorts,
          newSecondaryPorts
        })
      }

      nextNetwork = {
        primaryPort: newPrimaryPort,
        secondaryPorts: newSecondaryPorts,
        protocol: newProtocol
      }
    }

    // Create updated application
    const updatedApp: Application = {
      ...app,
      name: input.name ?? app.name,
      directory: nextDirectory,
      techStack: nextTechStack,
      network: nextNetwork,
      buildScript: nextBuildScript,
      build_script: nextBuildScript,
      deploymentMode: runtimeTargetChanged ? 'unknown' : (app.deploymentMode ?? 'unknown'),
      pm2ProcessName: runtimeTargetChanged ? null : (app.pm2ProcessName ?? null),
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
      await this.repository.updateDeploymentMode(id, 'development')
      await this.repository.updatePM2ProcessName(id, null)
      
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
    const configuredPorts = this.getConfiguredPorts(app)

    if (app.state === 'stopped') {
      const hasActivePorts = await this.hasActiveRuntimePorts(app)
      if (!hasActivePorts) {
        await this.repository.updateDeploymentMode(id, 'unknown')
        await this.repository.updatePM2ProcessName(id, null)
        logger.warn('Application already stopped', { id })
        return
      }

      logger.warn('Application state is stopped but runtime ports are still active, continuing cleanup', {
        id,
        appName: app.name,
        ports: this.getConfiguredPorts(app)
      })
    } else {
      this.enforceStopPolicy(app)
    }

    // 传递应用ID而不是整个应用对象
    await this.processManager.stop(id as any)

    const portReleaseErrors: Array<{ port: number; reason: string }> = []

    if (app.network?.primaryPort) {
      try {
        await this.networkService.releasePort(app.network.primaryPort)
        logger.info('Released primary port', { port: app.network.primaryPort, appId: id })
      } catch (error) {
        portReleaseErrors.push({
          port: app.network.primaryPort,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }

    if (Array.isArray(app.network?.secondaryPorts)) {
      for (const port of app.network.secondaryPorts) {
        if (!port) {
          continue
        }

        try {
          await this.networkService.releasePort(port)
          logger.info('Released secondary port', { port, appId: id })
        } catch (error) {
          portReleaseErrors.push({
            port,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }

    const remainingConflicts = configuredPorts.length > 0
      ? await this.networkService.checkConflicts(configuredPorts)
      : []

    if (portReleaseErrors.length > 0 || remainingConflicts.length > 0) {
      const occupiedPorts = Array.from(new Set(remainingConflicts.map(conflict => conflict.port)))
      const failedPorts = Array.from(new Set(portReleaseErrors.map(item => item.port)))
      const relevantPorts = Array.from(new Set([...failedPorts, ...occupiedPorts]))

      logger.error('Application stop incomplete, runtime ports are still active', {
        appId: id,
        appName: app.name,
        configuredPorts,
        failedPorts,
        occupiedPorts,
        portReleaseErrors,
        remainingConflicts
      })

      throw new ApplicationError(
        `应用停止失败：端口 ${relevantPorts.join(', ')} 仍被占用`,
        'STOP_INCOMPLETE',
        {
          appId: id,
          appName: app.name,
          failedPorts,
          occupiedPorts,
          releaseErrors: portReleaseErrors,
          conflicts: remainingConflicts,
          suggestion: '请使用管理员权限运行门户后重试，或手动结束占用进程'
        }
      )
    }

    await this.repository.updateState(id, 'stopped')
    await this.repository.updateDeploymentMode(id, 'unknown')
    await this.repository.updatePM2ProcessName(id, null)

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

    const requestedDirectory = typeof input.directory === 'string' && input.directory.trim().length > 0
      ? this.normalizeDirectoryPath(input.directory)
      : app.directory
    const currentBuildScript = this.normalizeExecutablePath(app.buildScript ?? app.build_script)
    const requestedBuildScriptRaw = input.buildScript ?? input.build_script
    const requestedBuildScript = requestedBuildScriptRaw !== undefined
      ? this.normalizeExecutablePath(requestedBuildScriptRaw)
      : currentBuildScript
    const changingRuntimeTarget =
      requestedDirectory !== app.directory ||
      requestedBuildScript !== currentBuildScript

    if (app.state === 'running' && (changingTechStack || changingRuntimeTarget)) {
      throw new ApplicationError(
        'Cannot change runtime target while application is running',
        'STATE_POLICY_VIOLATION',
        {
          appId: app.id,
          currentState: app.state,
          requestedChange: changingTechStack ? 'techStack' : 'runtimeTarget',
          currentTechStack: app.techStack.name,
          targetTechStack: input.techStack,
          requestedDirectory,
          requestedBuildScript
        }
      )
    }
  }

  private resolveExternalExeBuildScriptForDirectory(
    currentBuildScript: string | undefined,
    nextDirectory: string
  ): string | undefined {
    const normalizedCurrent = this.normalizeExecutablePath(currentBuildScript)
    const currentBasename = normalizedCurrent ? basename(normalizedCurrent) : ''

    if (currentBasename) {
      const relocatedExecutable = this.normalizeExecutablePath(join(nextDirectory, currentBasename))
      if (relocatedExecutable && existsSync(relocatedExecutable)) {
        return relocatedExecutable
      }
    }

    try {
      const executableFiles = readdirSync(nextDirectory).filter(fileName => /\.exe$/i.test(fileName))
      if (executableFiles.length === 1) {
        return this.normalizeExecutablePath(join(nextDirectory, executableFiles[0]))
      }
    } catch (error) {
      logger.warn('Failed to scan external-exe working directory while remapping build script', {
        nextDirectory,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return normalizedCurrent
  }

  private enforceStartPolicy(app: Application): void {
    this.assertStateTransition(app.state, 'running', 'start', { appId: app.id, appName: app.name })
    this.assertDirectoryExists(app)
    this.assertNetworkConfigurationValid(app)
  }

  private enforceStopPolicy(app: Application): void {
    this.assertStateTransition(app.state, 'stopped', 'stop', { appId: app.id, appName: app.name })
  }

  private getConfiguredPorts(app: Application): number[] {
    const ports: number[] = []

    if (app.network?.primaryPort) {
      ports.push(app.network.primaryPort)
    }

    if (Array.isArray(app.network?.secondaryPorts)) {
      for (const port of app.network.secondaryPorts) {
        if (port) {
          ports.push(port)
        }
      }
    }

    return ports
  }

  private async hasActiveRuntimePorts(app: Application): Promise<boolean> {
    const configuredPorts = this.getConfiguredPorts(app)
    if (configuredPorts.length === 0) {
      return false
    }

    try {
      const conflicts = await this.networkService.checkConflicts(configuredPorts)
      return conflicts.length > 0
    } catch (error) {
      logger.warn('Failed to check active runtime ports, assuming no stale runtime remains', {
        appId: app.id,
        appName: app.name,
        ports: configuredPorts,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
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

    return await this.isSeparatedFullStackDirectory(directory)
  }

  private async isSeparatedFullStackDirectory(directory: string): Promise<boolean> {
    const { frontendDir, backendDir } = await this.resolveFullStackDirectories(directory)
    return Boolean(frontendDir && backendDir)
  }

  private async resolveFullStackDirectories(
    directory: string
  ): Promise<{ frontendDir?: string; backendDir?: string }> {
    const directFrontendDir = this.findDirectSubdirectory(directory, FRONTEND_DIRECTORY_CANDIDATES)
    const directBackendDir = this.findDirectSubdirectory(directory, BACKEND_DIRECTORY_CANDIDATES)

    if (directFrontendDir && directBackendDir) {
      return {
        frontendDir: directFrontendDir,
        backendDir: directBackendDir
      }
    }

    const workspaceDirectories = await this.resolveWorkspaceDirectories(directory)
    let frontendDir = directFrontendDir
    let backendDir = directBackendDir

    for (const workspaceDirectory of workspaceDirectories) {
      const role = this.classifyWorkspaceDirectory(workspaceDirectory)

      if (role === 'frontend' && !frontendDir) {
        frontendDir = workspaceDirectory
      }

      if (role === 'backend' && !backendDir) {
        backendDir = workspaceDirectory
      }

      if (frontendDir && backendDir) {
        break
      }
    }

    return {
      frontendDir,
      backendDir
    }
  }

  private findDirectSubdirectory(directory: string, candidates: readonly string[]): string | undefined {
    for (const candidate of candidates) {
      const candidatePath = resolve(directory, candidate)
      if (!existsSync(candidatePath)) {
        continue
      }

      try {
        if (statSync(candidatePath).isDirectory()) {
          return candidatePath
        }
      } catch {
        continue
      }
    }

    return undefined
  }

  private async resolveWorkspaceDirectories(directory: string): Promise<string[]> {
    const patterns = this.readWorkspacePatterns(directory)
    if (patterns.length === 0) {
      return []
    }

    try {
      const fgModule = await import('fast-glob')
      const fg = fgModule.default
      const directories = await fg(patterns, {
        cwd: directory,
        onlyDirectories: true,
        absolute: true,
        unique: true,
        suppressErrors: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      })

      return directories.map(dir => resolve(dir))
    } catch (error) {
      logger.warn('Failed to resolve workspace directories for fullstack detection', {
        directory,
        patterns,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  private readWorkspacePatterns(directory: string): string[] {
    const patterns = new Set<string>()
    const packageJsonPath = join(directory, 'package.json')

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        for (const pattern of this.extractWorkspacePatternsFromPackageJson(packageJson)) {
          patterns.add(pattern)
        }
      } catch (error) {
        logger.warn('Failed to read package.json workspaces for fullstack detection', {
          directory,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const pnpmWorkspacePath = join(directory, 'pnpm-workspace.yaml')
    if (existsSync(pnpmWorkspacePath)) {
      try {
        for (const pattern of this.extractWorkspacePatternsFromPnpm(readFileSync(pnpmWorkspacePath, 'utf-8'))) {
          patterns.add(pattern)
        }
      } catch (error) {
        logger.warn('Failed to read pnpm workspace for fullstack detection', {
          directory,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return Array.from(patterns)
  }

  private extractWorkspacePatternsFromPackageJson(packageJson: any): string[] {
    const workspaces = packageJson?.workspaces
    if (Array.isArray(workspaces)) {
      return workspaces.filter((pattern: unknown): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
    }

    if (Array.isArray(workspaces?.packages)) {
      return workspaces.packages.filter((pattern: unknown): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
    }

    if (Array.isArray(packageJson?.packages)) {
      return packageJson.packages.filter((pattern: unknown): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
    }

    return []
  }

  private extractWorkspacePatternsFromPnpm(content: string): string[] {
    const patterns: string[] = []
    let inPackagesBlock = false

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      if (!inPackagesBlock) {
        if (/^packages\s*:/.test(trimmed)) {
          inPackagesBlock = true
        }
        continue
      }

      if (/^[A-Za-z0-9_-]+\s*:/.test(trimmed) && !trimmed.startsWith('-')) {
        break
      }

      const match = trimmed.match(/^-\s*['"]?([^'"]+)['"]?\s*$/)
      if (match?.[1]) {
        patterns.push(match[1].trim())
      }
    }

    return patterns
  }

  private classifyWorkspaceDirectory(directory: string): 'frontend' | 'backend' | 'unknown' {
    const packageJsonPath = join(directory, 'package.json')
    if (!existsSync(packageJsonPath)) {
      return 'unknown'
    }

    let frontendScore = this.scoreDirectoryName(basename(directory), FRONTEND_DIRECTORY_CANDIDATES)
    let backendScore = this.scoreDirectoryName(basename(directory), BACKEND_DIRECTORY_CANDIDATES)

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      if (this.isFrontendPackage(packageJson, directory)) {
        frontendScore += 3
      }

      if (this.isBackendPackage(packageJson, directory)) {
        backendScore += 3
      }
    } catch (error) {
      logger.warn('Failed to parse workspace package.json for fullstack classification', {
        directory,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    if (frontendScore === backendScore) {
      return 'unknown'
    }

    return frontendScore > backendScore ? 'frontend' : 'backend'
  }

  private scoreDirectoryName(directoryName: string, candidates: readonly string[]): number {
    const normalizedDirectoryName = directoryName.trim().toLowerCase()
    return candidates.some(candidate => normalizedDirectoryName === candidate.toLowerCase()) ? 2 : 0
  }

  private isFrontendPackage(packageJson: any, directory: string): boolean {
    const dependencies = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {})
    }

    if (
      dependencies.react ||
      dependencies.vue ||
      dependencies.next ||
      dependencies.nuxt ||
      dependencies.vite ||
      dependencies.svelte ||
      dependencies['@angular/core'] ||
      dependencies['@vitejs/plugin-vue'] ||
      dependencies['@vitejs/plugin-react']
    ) {
      return true
    }

    const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'next.config.js', 'next.config.ts']
    return configFiles.some(file => existsSync(join(directory, file)))
  }

  private isBackendPackage(packageJson: any, directory: string): boolean {
    const dependencies = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {})
    }
    const scripts = packageJson?.scripts || {}
    const packageName = String(packageJson?.name || '').toLowerCase()

    if (
      dependencies.express ||
      dependencies.koa ||
      dependencies.fastify ||
      dependencies['@nestjs/core']
    ) {
      return true
    }

    return Boolean(
      packageName.includes('api') ||
      packageName.includes('server') ||
      scripts.start ||
      scripts['start:dev'] ||
      scripts.dev
    ) && !this.isFrontendPackage(packageJson, directory)
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

  private async allocateSplitPortConfiguration(
    primaryPortInput: number | undefined,
    secondaryPortsInput: readonly number[] | undefined
  ): Promise<{
    primaryPort: number
    secondaryPorts: number[]
    allocatedPorts: number[]
  }> {
    const secondaryPorts = Array.isArray(secondaryPortsInput) ? [...secondaryPortsInput] : []
    const hasPrimaryInput = typeof primaryPortInput === 'number'
    const hasSecondaryInput = secondaryPorts.length > 0

    if (!hasPrimaryInput && !hasSecondaryInput) {
      const pair = await this.allocateFullStackPortPair()
      logger.info('Auto-allocated paired ports for fullstack application', pair)
      return {
        primaryPort: pair.primaryPort,
        secondaryPorts: [pair.secondaryPort],
        allocatedPorts: [pair.primaryPort, pair.secondaryPort]
      }
    }

    if (hasPrimaryInput && !hasSecondaryInput) {
      const secondaryPort = await this.allocateBackendPortMatchingPrimary(primaryPortInput as number)
      return {
        primaryPort: primaryPortInput as number,
        secondaryPorts: [secondaryPort],
        allocatedPorts: [secondaryPort]
      }
    }

    if (!hasPrimaryInput && hasSecondaryInput) {
      const primaryPort = await this.allocateFrontendPortMatchingBackend(secondaryPorts[0])
      return {
        primaryPort,
        secondaryPorts,
        allocatedPorts: [primaryPort]
      }
    }

    return {
      primaryPort: primaryPortInput as number,
      secondaryPorts,
      allocatedPorts: []
    }
  }

  private async allocateFullStackPortPair(): Promise<PortPairAllocation> {
    if (typeof this.networkService.allocatePortPair === 'function') {
      return await this.networkService.allocatePortPair()
    }

    const primaryPort = await this.networkService.allocatePort('frontend')
    try {
      const secondaryPort = await this.allocateBackendPortMatchingPrimary(primaryPort)
      return { primaryPort, secondaryPort }
    } catch (error) {
      try {
        await this.networkService.releasePort(primaryPort)
      } catch (releaseError) {
        logger.warn('Failed to release primary port after paired allocation fallback failed', {
          primaryPort,
          error: releaseError instanceof Error ? releaseError.message : String(releaseError)
        })
      }
      throw error
    }
  }

  private async allocateBackendPortMatchingPrimary(primaryPort: number): Promise<number> {
    const { frontend, backend } = this.getConfiguredPortRanges()
    const offset = primaryPort - frontend.start
    const secondaryPort = backend.start + offset

    if (!this.isPortInRange(secondaryPort, backend)) {
      throw new ApplicationError(
        `无法为主端口 ${primaryPort} 匹配后端端口：对应端口 ${secondaryPort} 不在后端端口范围 ${backend.start}-${backend.end} 内`,
        'PORT_PAIR_UNAVAILABLE',
        { primaryPort, secondaryPort, portRanges: { frontend, backend } }
      )
    }

    return await this.allocateSpecificPortOrThrow(secondaryPort, 'backend', {
      primaryPort,
      secondaryPort,
      portRanges: { frontend, backend }
    })
  }

  private async allocateFrontendPortMatchingBackend(secondaryPort: number): Promise<number> {
    const { frontend, backend } = this.getConfiguredPortRanges()
    const offset = secondaryPort - backend.start
    const primaryPort = frontend.start + offset

    if (!this.isPortInRange(primaryPort, frontend)) {
      throw new ApplicationError(
        `无法为后端端口 ${secondaryPort} 匹配主端口：对应端口 ${primaryPort} 不在前端端口范围 ${frontend.start}-${frontend.end} 内`,
        'PORT_PAIR_UNAVAILABLE',
        { primaryPort, secondaryPort, portRanges: { frontend, backend } }
      )
    }

    return await this.allocateSpecificPortOrThrow(primaryPort, 'frontend', {
      primaryPort,
      secondaryPort,
      portRanges: { frontend, backend }
    })
  }

  private async allocateSpecificPortOrThrow(
    port: number,
    scope: PortAllocationScope,
    context: Record<string, unknown>
  ): Promise<number> {
    if (typeof this.networkService.allocateSpecificPort !== 'function') {
      throw new ApplicationError(
        '当前网络服务不支持全栈端口配对分配',
        'PORT_ALLOCATION_UNSUPPORTED',
        context
      )
    }

    try {
      return await this.networkService.allocateSpecificPort(port, scope)
    } catch (error) {
      throw new ApplicationError(
        `对应的${scope === 'backend' ? '后端' : '前端'}端口 ${port} 不可用，请换用同编号的一组端口`,
        'PORT_PAIR_UNAVAILABLE',
        {
          ...context,
          unavailablePort: port,
          scope,
          cause: error instanceof Error ? error.message : String(error)
        }
      )
    }
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

    const { frontendDir, backendDir } = await this.resolveFullStackDirectories(directory)

    const hasFrontend = typeof frontendDir === 'string' && existsSync(frontendDir)
    const hasBackend = typeof backendDir === 'string' && existsSync(backendDir)
    const isFullStack = Boolean(hasFrontend && hasBackend && frontendDir && backendDir)

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
    if (hasFrontend && frontendDir) {
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
          HOST: '0.0.0.0',
          VITE_PORT: primaryPort.toString(),
          PORT: primaryPort.toString(),
          WEB_PORT: primaryPort.toString()
        }
      }
    }

    // 配置后端
    let backendConfig: import('./types').ProcessConfiguration | undefined
    if (hasBackend && backendDir) {
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
          HOST: '0.0.0.0',
          PORT: backendPort.toString(),
          API_PORT: backendPort.toString()
        }
      }
    }

    return {
      isFullStack: true,
      frontendDir,
      backendDir,
      frontendConfig,
      backendConfig
    }
  }
}

// =============================================================================
// SUPPORTING INTERFACES (to be implemented separately)
// =============================================================================

type PortAllocationScope = 'frontend' | 'backend' | 'unified'

interface PortPairAllocation {
  primaryPort: number
  secondaryPort: number
}

interface NetworkService {
  allocatePort(scope?: PortAllocationScope): Promise<number>
  allocateSpecificPort?(port: number, scope?: PortAllocationScope): Promise<number>
  allocatePortPair?(): Promise<PortPairAllocation>
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
