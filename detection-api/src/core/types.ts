/**
 * Core Types - Clean Data Structure Design
 * 
 * This file defines the new, clean data structures for the refactored system.
 * It follows Linus's principle: "Good programmers worry about data structures."
 * 
 * Key principles:
 * 1. Single responsibility - one concept, one representation
 * 2. Immutable by design - all fields are readonly
 * 3. No special cases - consistent naming and structure
 * 4. Type safety first - strict TypeScript types
 */

// =============================================================================
// APPLICATION CORE TYPES
// =============================================================================

export interface Application {
  readonly id: string
  readonly name: string
  readonly directory: string
  readonly techStack: TechStackType
  readonly network: NetworkConfiguration
  readonly state: ApplicationState
  readonly metadata: ApplicationMetadata
  readonly fullStack?: FullStackConfiguration
  readonly deploymentMode?: DeploymentMode
  readonly pm2ProcessName?: string | null
  readonly buildScript?: string
  readonly build_script?: string
}

export type DeploymentMode = 'development' | 'production' | 'unknown'

export interface TechStackType {
  readonly name: string
  readonly category: 'frontend' | 'backend' | 'fullstack'
  readonly startCommand: string
  readonly buildCommand?: string
}

// =============================================================================
// FULLSTACK PROJECT SUPPORT
// =============================================================================

export interface FullStackConfiguration {
  readonly isFullStack: boolean
  readonly frontendDir?: string
  readonly backendDir?: string
  readonly frontendConfig?: ProcessConfiguration
  readonly backendConfig?: ProcessConfiguration
}

export interface ProcessConfiguration {
  readonly workingDirectory: string
  readonly startCommand: string
  readonly buildCommand?: string
  readonly port: number
  readonly environmentVariables?: Record<string, string>
}

export interface NetworkConfiguration {
  readonly primaryPort: number
  readonly secondaryPorts: readonly number[]
  readonly protocol: 'http' | 'https'
}


export type ApplicationState = 'stopped' | 'running' | 'failed'

export interface ApplicationMetadata {
  readonly description?: string
  readonly icon?: string
  readonly color?: string
  readonly createdAt: number  // Unix timestamp
  readonly updatedAt: number  // Unix timestamp
  readonly pinned?: boolean
  readonly accessPath?: string
}

export interface CreateApplicationInput {
  readonly name: string
  readonly directory: string
  readonly techStack: string
  readonly description?: string
  readonly icon?: string
  readonly color?: string
  readonly accessPath?: string
  readonly primaryPort?: number
  readonly secondaryPorts?: readonly number[]
  readonly protocol?: 'http' | 'https'
  readonly buildScript?: string
  readonly build_script?: string
}

export interface UpdateApplicationInput {
  readonly name?: string
  readonly description?: string
  readonly icon?: string
  readonly color?: string
  readonly techStack?: string
  readonly pinned?: boolean
  readonly accessPath?: string | null
  readonly directory?: string
  readonly buildScript?: string
  readonly build_script?: string
}

// =============================================================================
// DETECTION TYPES
// =============================================================================

export interface DetectionSession {
  readonly id: string
  readonly workspacePath: string
  readonly state: DetectionSessionState
  readonly startedAt: number
  readonly completedAt?: number
  readonly summary?: DetectionSummary
  readonly config?: any
}

export type DetectionSessionState = 'running' | 'completed' | 'failed'

export interface DetectionResult {
  readonly id: string
  readonly sessionId: string
  readonly directory: string
  readonly techStack?: string
  readonly confidence: number
  readonly issues: readonly DetectionIssue[]
  readonly createdAt: number
  readonly enhancedData?: {
    readonly scores?: {
      readonly frontend: number
      readonly backend: number
      readonly fullstack: number
      readonly static: number
    }
    readonly reasoning?: readonly string[]
    readonly features?: any
  }
}

export interface DetectionIssue {
  readonly type: 'error' | 'warning' | 'info'
  readonly code: string
  readonly message: string
  readonly file?: string
  readonly suggestion?: string
  readonly severity?: string
  readonly suggestions?: any[]
}

export interface DetectionSummary {
  readonly totalScanned: number
  readonly validFound: number
  readonly warningCount: number
  readonly errorCount: number
}

// Batch scan types
export type ScanMode = 'single' | 'multiple' | 'workspace'

export interface BatchScanConfig {
  readonly mode: ScanMode
  readonly maxConcurrency?: number
  readonly commonConfig?: {
    readonly maxDepth?: number
    readonly excludePatterns?: readonly string[]
    readonly includePatterns?: readonly string[]
    readonly timeoutMs?: number
  }
}

export interface BatchScan {
  readonly id: string
  readonly mode: ScanMode
  readonly sessionIds: readonly string[]
  readonly totalPaths: number
  readonly createdAt: number
  readonly completedAt?: number
  readonly status: 'pending' | 'running' | 'completed' | 'failed'
  readonly summary?: {
    readonly completedSessions: number
    readonly failedSessions: number
    readonly totalProjectsFound: number
  }
}

// =============================================================================
// NETWORK SERVICE TYPES
// =============================================================================

export interface PortAllocation {
  readonly port: number
  readonly allocatedAt: number
  readonly allocatedTo: string  // Application ID
}

export interface PortConflict {
  readonly port: number
  readonly currentOwner: string
  readonly requestedBy: string
  readonly pid?: number
  readonly processName?: string
  readonly conflictType?: 'process' | 'allocation' | 'system' | 'range'
  readonly details?: string
  readonly affectedApps?: string[]
  readonly severity?: 'low' | 'medium' | 'high' | 'critical'
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApplicationError'
  }
}

// =============================================================================
// REPOSITORY INTERFACES
// =============================================================================

export interface ApplicationRepository {
  save(app: Application): Promise<void>
  findById(id: string): Promise<Application | null>
  findByDirectory(directory: string): Promise<Application | null>
  findAll(): Promise<readonly Application[]>
  delete(id: string): Promise<void>
  updateState(id: string, state: ApplicationState): Promise<void>
  updatePM2ProcessName(id: string, pm2ProcessName: string | null): Promise<void>
  updateDeploymentMode(id: string, deploymentMode: 'development' | 'production' | 'unknown'): Promise<void>
  findByState(state: ApplicationState): Promise<readonly Application[]>
}

export interface DetectionRepository {
  saveSession(session: DetectionSession): Promise<void>
  findSessionById(id: string): Promise<DetectionSession | null>
  findActiveSessions(): Promise<DetectionSession[]>
  saveResult(result: DetectionResult): Promise<void>
  findResultsBySession(sessionId: string): Promise<readonly DetectionResult[]>
  deleteSession(sessionId: string): Promise<void>
  findSessionsByWorkspace(workspacePath: string): Promise<DetectionSession[]>
  deleteResultsBySession(sessionId: string): Promise<void>
  cleanupOrphanedResults(): Promise<void>

  // Batch scan methods
  saveBatch(batch: BatchScan): Promise<void>
  findBatchById(id: string): Promise<BatchScan | null>
  updateBatchStatus(id: string, status: BatchScan['status'], summary?: BatchScan['summary']): Promise<void>
}

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

export interface ApplicationService {
  create(input: CreateApplicationInput): Promise<Application>
  findById(id: string): Promise<Application>
  findAll(): Promise<readonly Application[]>
  update(id: string, input: UpdateApplicationInput): Promise<Application>
  delete(id: string): Promise<void>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  setPM2ProcessName(id: string, pm2ProcessName: string | null): Promise<void>
}

export interface DetectionService {
  startWorkspaceScan(workspacePath: string): Promise<string>
  getSession(sessionId: string): Promise<DetectionSession>
  getResults(sessionId: string): Promise<readonly DetectionResult[]>
  getActiveSessions(): Promise<DetectionSession[]>
  cancelSession(sessionId: string): Promise<void>

  // Batch scan methods
  startBatchScan(paths: readonly string[], config: BatchScanConfig): Promise<{ batchId: string; sessionIds: readonly string[] }>
  getBatchStatus(batchId: string): Promise<BatchScan>
}

export interface NetworkService {
  allocatePort(): Promise<number>
  releasePort(port: number): Promise<void>
  isPortFree(port: number): Promise<boolean>
  checkConflicts(ports: readonly number[]): Promise<readonly PortConflict[]>
}

// Supporting service interfaces
export interface ScanOptions {
  maxDepth?: number  // 扫描深度，默认为 5
}

export interface FileScanner {
  findApplicationDirectories(workspacePath: string, options?: ScanOptions): Promise<string[]>
}

export interface TechStackAnalyzer {
  analyze(directory: string): Promise<WebAppAnalysisResult>
}

// =============================================================================
// WEB APPLICATION DETECTION TYPES
// =============================================================================

export interface WebAppAnalysisResult {
  readonly techStack: string
  readonly appType: WebAppType
  readonly confidence: number
  readonly features: WebAppFeatures
  readonly issues: readonly DetectionIssue[]
}

export type WebAppType = 'frontend' | 'backend' | 'fullstack' | 'static' | 'non-web' | 'unknown'

export interface WebAppFeatures {
  readonly hasPackageJson: boolean
  readonly configFiles: readonly string[]
  readonly directories: readonly string[]
  readonly scripts: readonly string[]
  readonly dependencies: readonly string[]
  readonly devDependencies: readonly string[]
  readonly ports?: readonly number[]
  readonly buildTools?: readonly string[]
}

export interface WebAppDetectionRule {
  readonly name: string
  readonly appType: WebAppType
  readonly priority: number
  readonly dependencies: readonly string[]
  readonly configFiles: readonly string[]
  readonly directories: readonly string[]
  readonly scripts: readonly string[]
  readonly excludeDependencies?: readonly string[]
}

export interface ConfidenceFactors {
  readonly dependencyMatch: number
  readonly configFileMatch: number
  readonly directoryMatch: number
  readonly scriptMatch: number
  readonly exclusionPenalty: number
}

// Web application detection constants
export const WEB_DETECTION_RULES: readonly WebAppDetectionRule[] = [
  // Fullstack frameworks (highest priority)
  {
    name: 'nextjs',
    appType: 'fullstack',
    priority: 100,
    dependencies: ['next'],
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    directories: ['pages', 'app', 'components'],
    scripts: ['dev', 'build', 'start']
  },
  {
    name: 'nuxtjs',
    appType: 'fullstack',
    priority: 100,
    dependencies: ['nuxt'],
    configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    directories: ['pages', 'components', 'server'],
    scripts: ['dev', 'build', 'generate']
  },
  {
    name: 'sveltekit',
    appType: 'fullstack',
    priority: 100,
    dependencies: ['@sveltejs/kit'],
    configFiles: ['svelte.config.js', 'vite.config.js'],
    directories: ['src/routes', 'src/lib'],
    scripts: ['dev', 'build', 'preview']
  },

  // Frontend frameworks (high priority)
  {
    name: 'react-vite',
    appType: 'frontend',
    priority: 90,
    dependencies: ['react', 'vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src', 'public'],
    scripts: ['dev', 'build', 'preview']
  },
  {
    name: 'vue-vite',
    appType: 'frontend',
    priority: 90,
    dependencies: ['vue', 'vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src', 'public'],
    scripts: ['dev', 'build', 'preview']
  },
  {
    name: 'angular',
    appType: 'frontend',
    priority: 85,
    dependencies: ['@angular/core'],
    configFiles: ['angular.json', 'ng-package.json'],
    directories: ['src/app'],
    scripts: ['start', 'build', 'test']
  },
  {
    name: 'react',
    appType: 'frontend',
    priority: 80,
    dependencies: ['react'],
    configFiles: ['webpack.config.js', 'craco.config.js'],
    directories: ['src', 'public'],
    scripts: ['start', 'build'],
    excludeDependencies: ['next']
  },
  {
    name: 'vue',
    appType: 'frontend',
    priority: 80,
    dependencies: ['vue'],
    configFiles: ['vue.config.js', 'webpack.config.js'],
    directories: ['src', 'public'],
    scripts: ['serve', 'build'],
    excludeDependencies: ['nuxt']
  },

  // Backend frameworks (medium priority)
  {
    name: 'nestjs',
    appType: 'backend',
    priority: 75,
    dependencies: ['@nestjs/core'],
    configFiles: ['nest-cli.json'],
    directories: ['src/controllers', 'src/services', 'src/modules'],
    scripts: ['start:dev', 'start:prod', 'build']
  },
  {
    name: 'express',
    appType: 'backend',
    priority: 70,
    dependencies: ['express'],
    configFiles: ['server.js', 'app.js', 'index.js'],
    directories: ['routes', 'controllers', 'middleware'],
    scripts: ['start', 'dev']
  },
  {
    name: 'fastify',
    appType: 'backend',
    priority: 70,
    dependencies: ['fastify'],
    configFiles: ['server.js', 'app.js'],
    directories: ['routes', 'plugins'],
    scripts: ['start', 'dev']
  },

  // Build tools (lower priority)
  {
    name: 'vite',
    appType: 'frontend',
    priority: 60,
    dependencies: ['vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src'],
    scripts: ['dev', 'build']
  },
  {
    name: 'webpack',
    appType: 'frontend',
    priority: 50,
    dependencies: ['webpack'],
    configFiles: ['webpack.config.js'],
    directories: ['src'],
    scripts: ['build', 'dev']
  }
] as const

// Non-web application exclusion rules
export const NON_WEB_EXCLUSION_DEPS = [
  // Desktop applications
  'electron', 'nw.js', 'tauri', '@tauri-apps/core', 'neutralino', 'nodegui', '@nodegui/core',

  // Mobile applications
  'react-native', '@react-native-community', 'expo', '@expo/cli', 'cordova', 'phonegap',
  '@ionic/core', '@capacitor/core',

  // CLI tools and system utilities
  'commander', 'yargs', 'inquirer', 'chalk', 'ora', 'boxen', 'update-notifier',
  'cli-table', 'progress', 'figlet', 'clear', 'clui'
] as const

// Web-specific dependency indicators
export const WEB_DEPENDENCY_INDICATORS = [
  // Frontend frameworks and libraries
  'react', 'vue', '@angular/core', 'svelte', 'solid-js', 'preact',

  // Build tools and bundlers
  'webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'snowpack',

  // Backend frameworks
  'express', 'koa', 'fastify', '@nestjs/core', 'hapi', '@hapi/hapi',

  // Web-specific utilities
  'cors', 'helmet', 'morgan', 'body-parser', 'cookie-parser',
  'socket.io', 'ws', 'http-proxy-middleware',

  // CSS and styling
  'sass', 'less', 'postcss', 'tailwindcss', 'styled-components',

  // Development tools
  '@babel/core', 'typescript', 'eslint', 'prettier'
] as const

export interface ProcessManager {
  start(app: Application): Promise<import('child_process').ChildProcess>
  stop(appId: string): Promise<void>
  isRunning(appId: string): Promise<boolean>
  getProcessLogs?(appId: string, lines?: number, target?: 'all' | 'frontend' | 'backend'): string[]
  getRunningProcesses?(): Map<string, any>

  // Extended methods for fullstack support
  startFullStack?(app: Application): Promise<FullStackProcessResult>
  stopFullStack?(appId: string): Promise<void>
  getFullStackStatus?(appId: string): Promise<FullStackStatus>
}

// =============================================================================
// FULLSTACK PROCESS MANAGEMENT TYPES
// =============================================================================

export interface FullStackProcessResult {
  readonly frontendProcess?: import('child_process').ChildProcess
  readonly backendProcess?: import('child_process').ChildProcess
  readonly success: boolean
  readonly errors: string[]
}

export interface FullStackStatus {
  readonly frontendRunning: boolean
  readonly backendRunning: boolean
  readonly frontendPort?: number
  readonly backendPort?: number
  readonly startedAt?: Date
}
