import { watchFile, unwatchFile } from 'fs'
import path from 'path'
import cron, { ScheduledTask } from 'node-cron'
import { Database } from 'better-sqlite3'

import { ConfigurationExporter } from './configurationExporter.js'
import { AppConfigurationService } from './appConfigurationService.js'
import { EnvironmentManager } from './environmentManager.js'
import { getSystemConfigFilePath, readSystemConfigFileSync } from '../utils/systemConfigPath.js'
import { logger } from '../utils/logger.js'

interface BackupRuntimeSettings {
  enableAutoBackup: boolean
  backupInterval: 'hourly' | 'daily' | 'weekly' | 'monthly'
  backupTime: string
  retentionDays: number
  includeUserData: boolean
  includeLogs: boolean
  compressionEnabled: boolean
  backupPath: string
}

const DEFAULT_BACKUP_SETTINGS: BackupRuntimeSettings = {
  enableAutoBackup: true,
  backupInterval: 'daily',
  backupTime: '02:00',
  retentionDays: 30,
  includeUserData: true,
  includeLogs: false,
  compressionEnabled: true,
  backupPath: './backups'
}

export class BackupScheduler {
  private readonly exporter: ConfigurationExporter
  private task: ScheduledTask | null = null
  private currentSignature: string | null = null
  private currentSchedule: string | null = null
  private watching = false
  private isRunning = false
  private readonly systemConfigPath: string

  constructor(database: Database) {
    this.exporter = new ConfigurationExporter(
      database,
      new AppConfigurationService(database),
      new EnvironmentManager(database)
    )
    this.systemConfigPath = getSystemConfigFilePath()
  }

  start(): void {
    if (this.watching) {
      logger.warn('Backup scheduler is already watching system settings')
      return
    }

    this.refreshFromSettings()
    watchFile(this.systemConfigPath, { interval: 5000 }, () => {
      this.refreshFromSettings()
    })
    this.watching = true
    logger.info('✅ Backup scheduler watching system settings', {
      configPath: this.systemConfigPath
    })
  }

  stop(): void {
    if (this.task) {
      this.task.stop()
      this.task = null
    }

    if (this.watching) {
      unwatchFile(this.systemConfigPath)
      this.watching = false
    }

    this.isRunning = false
    this.currentSchedule = null
    this.currentSignature = null
    logger.info('Backup scheduler stopped')
  }

  refreshFromSettings(): void {
    try {
      const settings = this.loadBackupSettings()
      const schedule = settings.enableAutoBackup ? this.buildCronExpression(settings) : null
      const signature = JSON.stringify({ settings, schedule })

      if (signature === this.currentSignature) {
        return
      }

      this.currentSignature = signature
      this.reschedule(settings, schedule)
    } catch (error) {
      logger.error('Failed to refresh backup scheduler settings', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  getStatus(): {
    isRunning: boolean
    schedule: string | null
    configPath: string
  } {
    return {
      isRunning: this.isRunning,
      schedule: this.currentSchedule,
      configPath: this.systemConfigPath
    }
  }

  private reschedule(settings: BackupRuntimeSettings, schedule: string | null): void {
    if (this.task) {
      this.task.stop()
      this.task = null
    }

    if (!settings.enableAutoBackup || !schedule) {
      this.isRunning = false
      this.currentSchedule = null
      logger.info('Auto backup is disabled, scheduler not started')
      return
    }

    if (!cron.validate(schedule)) {
      this.isRunning = false
      this.currentSchedule = null
      logger.error('Invalid backup cron expression', { schedule, settings })
      return
    }

    this.task = cron.schedule(schedule, async () => {
      await this.runScheduledBackup(settings)
    })

    this.currentSchedule = schedule
    this.isRunning = true
    logger.info('✅ Backup scheduler started', {
      schedule,
      backupPath: settings.backupPath,
      retentionDays: settings.retentionDays
    })
  }

  private async runScheduledBackup(settings: BackupRuntimeSettings): Promise<void> {
    try {
      const backupRoot = this.resolveBackupRoot(settings.backupPath)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupName = `scheduled-${settings.backupInterval}-${timestamp}`
      const includePaths = this.buildArchiveIncludePaths(settings)

      logger.info('🔄 Running scheduled backup', {
        backupName,
        backupRoot,
        includePaths
      })

      const backup = await this.exporter.createBackup({
        mode: 'archive',
        archiveType: includePaths.length > 4 ? 'custom' : 'config',
        backupName,
        includePaths,
        compress: settings.compressionEnabled,
        includeEnvironments: false,
        includeTemplates: false,
        includeSensitiveData: false,
        format: 'json'
      }, path.join(backupRoot, backupName), 'system-scheduler')

      const cleanupResult = await this.exporter.cleanupBackups(settings.retentionDays)

      logger.info('✅ Scheduled backup completed', {
        backupId: backup.id,
        filePath: backup.filePath,
        cleanupDeleted: cleanupResult.deletedCount
      })
    } catch (error) {
      logger.error('Failed to run scheduled backup', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private loadBackupSettings(): BackupRuntimeSettings {
    const rawConfig = JSON.parse(readSystemConfigFileSync())
    const backup = rawConfig?.backup || {}

    const time = typeof backup.backupTime === 'string' && /^\d{2}:\d{2}$/.test(backup.backupTime.trim())
      ? backup.backupTime.trim()
      : DEFAULT_BACKUP_SETTINGS.backupTime

    const interval = ['hourly', 'daily', 'weekly', 'monthly'].includes(backup.backupInterval)
      ? backup.backupInterval
      : DEFAULT_BACKUP_SETTINGS.backupInterval

    const retentionDays = Number.isFinite(Number(backup.retentionDays))
      ? Math.max(1, Math.min(365, Math.round(Number(backup.retentionDays))))
      : DEFAULT_BACKUP_SETTINGS.retentionDays

    return {
      enableAutoBackup: this.toBoolean(backup.enableAutoBackup, DEFAULT_BACKUP_SETTINGS.enableAutoBackup),
      backupInterval: interval,
      backupTime: time,
      retentionDays,
      includeUserData: this.toBoolean(backup.includeUserData, DEFAULT_BACKUP_SETTINGS.includeUserData),
      includeLogs: this.toBoolean(backup.includeLogs, DEFAULT_BACKUP_SETTINGS.includeLogs),
      compressionEnabled: this.toBoolean(backup.compressionEnabled, DEFAULT_BACKUP_SETTINGS.compressionEnabled),
      backupPath: typeof backup.backupPath === 'string' && backup.backupPath.trim().length > 0
        ? backup.backupPath.trim()
        : DEFAULT_BACKUP_SETTINGS.backupPath
    }
  }

  private buildCronExpression(settings: BackupRuntimeSettings): string {
    const [hourPart, minutePart] = settings.backupTime.split(':')
    const hour = Number.parseInt(hourPart, 10)
    const minute = Number.parseInt(minutePart, 10)

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return '0 2 * * *'
    }

    switch (settings.backupInterval) {
      case 'hourly':
        return `${minute} * * * *`
      case 'weekly':
        return `${minute} ${hour} * * 1`
      case 'monthly':
        return `${minute} ${hour} 1 * *`
      case 'daily':
      default:
        return `${minute} ${hour} * * *`
    }
  }

  private buildArchiveIncludePaths(settings: BackupRuntimeSettings): string[] {
    const includePaths = [
      'configs/system-config.json',
      'configs/api-config.json',
      'configs/api-registry.json',
      'detection-api/configs/portal-config.json'
    ]

    if (settings.includeUserData) {
      includePaths.push('detection-api/data/*')
    }

    if (settings.includeLogs) {
      includePaths.push('logs/*.log', 'detection-api/logs/*.log')
    }

    return includePaths
  }

  private resolveBackupRoot(configuredPath: string): string {
    const workspaceRoot = path.resolve(path.dirname(this.systemConfigPath), '..')
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(workspaceRoot, configuredPath)
  }

  private toBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null) return defaultValue
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'off'].includes(normalized)) return false
    }
    return Boolean(value)
  }
}

let globalBackupScheduler: BackupScheduler | null = null

export function initializeGlobalBackupScheduler(database: Database): void {
  if (globalBackupScheduler) {
    logger.warn('Global backup scheduler already initialized')
    return
  }

  globalBackupScheduler = new BackupScheduler(database)
  globalBackupScheduler.start()
}

export function getGlobalBackupScheduler(): BackupScheduler | null {
  return globalBackupScheduler
}

export function stopGlobalBackupScheduler(): void {
  if (globalBackupScheduler) {
    globalBackupScheduler.stop()
    globalBackupScheduler = null
  }
}
