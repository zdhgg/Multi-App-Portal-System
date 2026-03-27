import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'fs/promises'

import { AppConfigurationService } from '../appConfigurationService'
import { ConfigurationExporter } from '../configurationExporter'
import { EnvironmentManager } from '../environmentManager'
import type { AppConfiguration } from '../../models/AppConfiguration'

describe('ConfigurationExporter backup and restore flow', () => {
  let db: Database.Database
  let configService: AppConfigurationService
  let environmentManager: EnvironmentManager
  let exporter: ConfigurationExporter
  let tempDir: string
  const originalWorkspaceRoot = process.env.PORTAL_WORKSPACE_ROOT

  beforeEach(async () => {
    db = new Database(':memory:')
    configService = new AppConfigurationService(db)
    environmentManager = new EnvironmentManager(db)
    exporter = new ConfigurationExporter(db, configService, environmentManager)
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'configuration-exporter-'))
    process.env.PORTAL_WORKSPACE_ROOT = tempDir
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (originalWorkspaceRoot === undefined) {
      delete process.env.PORTAL_WORKSPACE_ROOT
    } else {
      process.env.PORTAL_WORKSPACE_ROOT = originalWorkspaceRoot
    }
    db.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates backups with real configuration and environment counts', async () => {
    await configService.createConfiguration(createConfig('app-a', {
      name: 'App A Config',
      workingDirectory: 'D:/apps/app-a',
      accessPath: '/app-a'
    }))
    await configService.createConfiguration(createConfig('app-b', {
      name: 'App B Config',
      workingDirectory: 'D:/apps/app-b',
      accessPath: '/app-b'
    }))

    await environmentManager.createProfile(createProfile('app-a', {
      name: 'app-a-default',
      variables: [{ key: 'NODE_ENV', value: 'development', required: true, sensitive: false }]
    }))
    await environmentManager.createProfile(createProfile('app-b', {
      name: 'app-b-default',
      variables: [{ key: 'NODE_ENV', value: 'production', required: true, sensitive: false }]
    }))

    const backupPath = path.join(tempDir, 'backup.json')
    const backup = await exporter.createBackup({
      includeEnvironments: true,
      includeTemplates: true,
      includeSensitiveData: true,
      format: 'json'
    }, backupPath, 'tester')

    expect(backup.metadata.configurationsCount).toBe(2)
    expect(backup.metadata.environmentsCount).toBe(2)
    expect(backup.metadata.templatesCount).toBeGreaterThan(0)
    expect(backup.includedApps.sort()).toEqual(['app-a', 'app-b'])

    const exported = JSON.parse(await readFile(backupPath, 'utf-8'))
    expect(exported.configurations).toHaveLength(2)
    expect(exported.environments).toHaveLength(2)
    expect(exported.templates.length).toBeGreaterThan(0)
  })

  it('creates configuration backups in the requested output directory and honors custom names', async () => {
    await configService.createConfiguration(createConfig('app-a', {
      name: 'App A Config',
      workingDirectory: 'D:/apps/app-a'
    }))

    const backup = await exporter.createBackup({
      backupName: 'manual-config-snapshot',
      outputDirectory: 'custom-output',
      includeEnvironments: false,
      includeTemplates: false,
      includeSensitiveData: false,
      format: 'json'
    }, undefined, 'tester')

    const expectedPath = path.join(tempDir, 'custom-output', 'manual-config-snapshot.json')
    const exported = JSON.parse(await readFile(expectedPath, 'utf-8'))

    expect(backup.name).toBe('manual-config-snapshot')
    expect(backup.filePath).toBe(expectedPath)
    expect(exported.configurations).toHaveLength(1)
  })

  it('overwrites existing configuration and environment profiles instead of duplicating them', async () => {
    await configService.createConfiguration(createConfig('app-a', {
      name: 'Primary Config',
      workingDirectory: 'D:/apps/app-a-old',
      accessPath: '/old-app'
    }))

    await environmentManager.createProfile(createProfile('app-a', {
      name: 'default',
      description: 'old env',
      variables: [{ key: 'NODE_ENV', value: 'development', required: true, sensitive: false }]
    }))

    const importPath = path.join(tempDir, 'restore.json')
    await writeFile(importPath, JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: 'tester',
      configurations: [{
        id: 'imported-config',
        appId: 'app-a',
        name: 'Primary Config',
        description: 'updated config',
        version: '2.0.0',
        workingDirectory: 'D:/apps/app-a-new',
        startCommand: 'pnpm dev',
        stopCommand: 'pnpm stop',
        accessPath: '/new-app',
        ports: [{
          port: 3200,
          type: 'frontend',
          protocol: 'http',
          description: 'updated port',
          autoAllocate: false
        }],
        environmentVariables: [
          { key: 'NODE_ENV', value: 'production', required: true, sensitive: false },
          { key: 'PORT', value: '3200', required: true, sensitive: false }
        ],
        startupParameters: [{ name: '--host', value: '0.0.0.0', required: false, type: 'string' }],
        buildConfig: { buildCommand: 'pnpm build', outputDirectory: 'dist' },
        runtimeConfig: {
          packageManager: 'pnpm',
          startupTimeout: 45000,
          healthCheckInterval: 8000,
          restartOnFailure: false,
          maxRestartAttempts: 1,
          healthCheckUrl: '/health'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'import-user',
        tags: ['updated'],
        isActive: true
      }],
      environments: [{
        id: 'imported-env',
        name: 'default',
        description: 'updated env',
        appId: 'app-a',
        isDefault: true,
        variables: [
          { key: 'NODE_ENV', value: 'production', required: true, sensitive: false },
          { key: 'API_URL', value: 'http://localhost:9000', required: false, sensitive: false }
        ],
        parameters: [{ name: '--inspect', value: '9230', required: false, type: 'number' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'import-user'
      }],
      templates: [],
      metadata: {
        sourceSystem: 'Intelligent Multi-App Portal System',
        sourceVersion: '2.0.0',
        totalConfigurations: 1
      }
    }, null, 2), 'utf-8')

    const result = await exporter.importConfigurations(importPath, {
      overwriteExisting: true,
      validateBeforeImport: true,
      mergeEnvironments: false,
      createBackup: false
    }, 'tester')

    expect(result.success).toBe(true)
    expect(result.importedConfigurations).toBe(1)
    expect(result.importedEnvironments).toBe(1)

    const configurations = await configService.getConfigurationsByAppId('app-a')
    expect(configurations).toHaveLength(1)
    expect(configurations[0].workingDirectory).toBe('D:/apps/app-a-new')
    expect(configurations[0].startCommand).toBe('pnpm dev')
    expect(configurations[0].ports[0]?.port).toBe(3200)
    expect(configurations[0].runtimeConfig.packageManager).toBe('pnpm')

    const profiles = await environmentManager.getProfilesByAppId('app-a')
    expect(profiles).toHaveLength(1)
    expect(profiles[0].description).toBe('updated env')
    expect(profiles[0].variables).toEqual([
      { key: 'NODE_ENV', value: 'production', required: true, sensitive: false },
      { key: 'API_URL', value: 'http://localhost:9000', required: false, sensitive: false }
    ])
  })

  it('merges legacy registry backups into the backup list and resolves current archive paths', async () => {
    await configService.createConfiguration(createConfig('app-a', {
      name: 'App A Config',
      workingDirectory: 'D:/apps/app-a'
    }))

    const jsonBackupPath = path.join(tempDir, 'config-backup.json')
    await exporter.createBackup({
      includeEnvironments: false,
      includeTemplates: false,
      includeSensitiveData: true,
      format: 'json'
    }, jsonBackupPath, 'tester')

    const legacyDir = path.join(tempDir, 'backups', 'data')
    await mkdir(legacyDir, { recursive: true })
    const legacyArchivePath = path.join(legacyDir, 'legacy-full.zip')
    await writeFile(legacyArchivePath, 'legacy-archive', 'utf-8')
    await writeFile(path.join(tempDir, 'backups', 'backup-registry.json'), JSON.stringify({
      version: '2.0.0',
      backups: [{
        id: 'legacy-backup-id',
        name: 'legacy-full',
        type: 'full',
        path: 'D:\\Legacy Portal\\backups\\data\\legacy-full.zip',
        size: 14,
        compressed: true,
        createdAt: '2025-09-23T11:04:52.063Z',
        description: 'Legacy zip backup',
        status: 'completed',
        filesCount: 2,
        includedFiles: [
          'D:\\Legacy Portal\\configs\\system-config.json',
          'D:\\Legacy Portal\\detection-api\\data\\portal.db'
        ],
        metadata: {
          creator: 'legacy-user',
          machine: 'LEGACY-PC',
          version: '2.0.0'
        }
      }],
      statistics: {
        totalBackups: 1,
        successfulBackups: 1,
        failedBackups: 0,
        lastBackup: '2025-09-23T11:04:52.063Z',
        totalSize: 14
      },
      lastUpdated: '2025-09-23T11:04:52.063Z'
    }, null, 2), 'utf-8')

    const backups = await exporter.getBackups()
    const legacyBackup = backups.find(backup => backup.id === 'legacy-backup-id')
    const configBackup = backups.find(backup => backup.source === 'configuration-export')

    expect(configBackup).toBeTruthy()
    expect(legacyBackup).toBeTruthy()
    expect(legacyBackup?.source).toBe('script-registry')
    expect(legacyBackup?.format).toBe('zip')
    expect(legacyBackup?.available).toBe(true)
    expect(legacyBackup?.filePath).toBe(legacyArchivePath)
    expect(legacyBackup?.originalFilePath).toBe('D:\\Legacy Portal\\backups\\data\\legacy-full.zip')
  })

  it('marks configuration-export backups as unavailable when the snapshot file is missing', async () => {
    await configService.createConfiguration(createConfig('app-a', {
      name: 'App A Config',
      workingDirectory: 'D:/apps/app-a'
    }))

    const backupPath = path.join(tempDir, 'missing-config-backup.json')
    const backup = await exporter.createBackup({
      includeEnvironments: false,
      includeTemplates: false,
      includeSensitiveData: true,
      format: 'json'
    }, backupPath, 'tester')

    await unlink(backupPath)

    const backups = await exporter.getBackups()
    const listedBackup = backups.find(item => item.id === backup.id)

    expect(listedBackup).toBeTruthy()
    expect(listedBackup?.source).toBe('configuration-export')
    expect(listedBackup?.available).toBe(false)
    expect(listedBackup?.status).toBe('missing')
  })

  it('creates archive backups inside the current workspace and rewrites stale backup-config paths', async () => {
    await mkdir(path.join(tempDir, 'configs'), { recursive: true })
    await mkdir(path.join(tempDir, 'detection-api', 'configs'), { recursive: true })
    await mkdir(path.join(tempDir, 'backups'), { recursive: true })

    await writeFile(path.join(tempDir, 'configs', 'system-config.json'), '{"name":"system"}', 'utf-8')
    await writeFile(path.join(tempDir, 'configs', 'api-config.json'), '{"name":"api"}', 'utf-8')
    await writeFile(path.join(tempDir, 'configs', 'api-registry.json'), '{"apps":[]}', 'utf-8')
    await writeFile(path.join(tempDir, 'detection-api', 'configs', 'portal-config.json'), '{"name":"portal"}', 'utf-8')

    await writeFile(path.join(tempDir, 'backups', 'backup-config.json'), JSON.stringify({
      version: '2.0.0',
      lastUpdated: '2025-09-23T11:02:46.243Z',
      settings: {
        defaultBackupPath: 'D:\\My Programs\\Intelligent Multi-App Portal SystemV1.0\\backups\\data',
        maxBackupRetention: 30,
        compressionEnabled: true,
        verificationEnabled: true,
        incrementalEnabled: true,
        scheduleEnabled: false
      },
      paths: {
        configs: [
          'configs\\system-config.json',
          'configs\\api-config.json',
          'configs\\api-registry.json',
          'detection-api\\configs\\portal-config.json'
        ],
        logs: [],
        data: [],
        scripts: [],
        exclude: []
      }
    }, null, 2), 'utf-8')

    const backup = await exporter.createBackup({
      mode: 'archive',
      archiveType: 'config',
      includeEnvironments: false,
      includeTemplates: false,
      includeSensitiveData: false,
      format: 'json'
    }, undefined, 'tester')

    const expectedBackupRoot = path.join(tempDir, 'backups', 'data')
    const persistedConfig = JSON.parse(await readFile(path.join(tempDir, 'backups', 'backup-config.json'), 'utf-8'))
    const persistedRegistry = JSON.parse(await readFile(path.join(tempDir, 'backups', 'backup-registry.json'), 'utf-8'))

    expect(backup.source).toBe('script-registry')
    expect(backup.format).toBe('zip')
    expect(backup.filesCount).toBe(4)
    expect(backup.filePath.startsWith(expectedBackupRoot)).toBe(true)
    expect(persistedConfig.settings.defaultBackupPath).toBe(expectedBackupRoot)
    expect(persistedRegistry.backups.some((entry: { id: string }) => entry.id === backup.id)).toBe(true)
  })

  it('creates archive backups in the requested output directory', async () => {
    await mkdir(path.join(tempDir, 'configs'), { recursive: true })
    await mkdir(path.join(tempDir, 'detection-api', 'configs'), { recursive: true })

    await writeFile(path.join(tempDir, 'configs', 'system-config.json'), '{"name":"system"}', 'utf-8')
    await writeFile(path.join(tempDir, 'configs', 'api-config.json'), '{"name":"api"}', 'utf-8')
    await writeFile(path.join(tempDir, 'configs', 'api-registry.json'), '{"apps":[]}', 'utf-8')
    await writeFile(path.join(tempDir, 'detection-api', 'configs', 'portal-config.json'), '{"name":"portal"}', 'utf-8')

    const backup = await exporter.createBackup({
      mode: 'archive',
      archiveType: 'config',
      backupName: 'manual-archive',
      outputDirectory: 'manual-backups',
      includeEnvironments: false,
      includeTemplates: false,
      includeSensitiveData: false,
      format: 'json'
    }, undefined, 'tester')

    expect(backup.name).toBe('manual-archive')
    expect(backup.filePath).toBe(path.join(tempDir, 'manual-backups', 'manual-archive.zip'))
  })
})

function createConfig(
  appId: string,
  overrides: Partial<Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'>> = {}
): Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    appId,
    name: overrides.name || `${appId}-config`,
    description: overrides.description,
    version: overrides.version || '1.0.0',
    workingDirectory: overrides.workingDirectory || `D:/apps/${appId}`,
    startCommand: overrides.startCommand || 'npm run dev',
    stopCommand: overrides.stopCommand,
    accessPath: overrides.accessPath || `/${appId}`,
    ports: overrides.ports || [{
      port: 3000,
      type: 'frontend',
      protocol: 'http',
      autoAllocate: true
    }],
    environmentVariables: overrides.environmentVariables || [
      { key: 'NODE_ENV', value: 'development', required: true, sensitive: false }
    ],
    startupParameters: overrides.startupParameters || [],
    buildConfig: overrides.buildConfig || { buildCommand: 'npm run build', outputDirectory: 'dist' },
    runtimeConfig: overrides.runtimeConfig || {
      packageManager: 'npm',
      startupTimeout: 30000,
      healthCheckInterval: 5000,
      restartOnFailure: true,
      maxRestartAttempts: 3
    },
    createdBy: overrides.createdBy,
    tags: overrides.tags || [],
    isActive: overrides.isActive ?? true
  }
}

function createProfile(
  appId: string,
  overrides: {
    name?: string
    description?: string
    variables?: Array<{ key: string; value: string; required: boolean; sensitive: boolean }>
    parameters?: Array<{ name: string; value: string; required: boolean; type: 'string' | 'number' | 'boolean' | 'path' }>
    isDefault?: boolean
    createdBy?: string
  } = {}
) {
  return {
    name: overrides.name || `${appId}-default`,
    description: overrides.description,
    appId,
    isDefault: overrides.isDefault ?? true,
    variables: overrides.variables || [
      { key: 'NODE_ENV', value: 'development', required: true, sensitive: false }
    ],
    parameters: overrides.parameters || [],
    createdBy: overrides.createdBy
  }
}
