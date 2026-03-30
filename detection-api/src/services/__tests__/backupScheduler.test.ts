import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'

import { BackupScheduler } from '../backupScheduler'

describe('BackupScheduler', () => {
  let db: Database.Database
  let tempDir: string
  let systemConfigPath: string
  const originalSystemConfigPath = process.env.SYSTEM_CONFIG_PATH
  const originalWorkspaceRoot = process.env.PORTAL_WORKSPACE_ROOT

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'backup-scheduler-'))
    systemConfigPath = path.join(tempDir, 'configs', 'system-config.json')
    await mkdir(path.dirname(systemConfigPath), { recursive: true })
    db = new Database(':memory:')
    process.env.SYSTEM_CONFIG_PATH = systemConfigPath
    process.env.PORTAL_WORKSPACE_ROOT = tempDir
  })

  afterEach(async () => {
    if (originalSystemConfigPath === undefined) {
      delete process.env.SYSTEM_CONFIG_PATH
    } else {
      process.env.SYSTEM_CONFIG_PATH = originalSystemConfigPath
    }

    if (originalWorkspaceRoot === undefined) {
      delete process.env.PORTAL_WORKSPACE_ROOT
    } else {
      process.env.PORTAL_WORKSPACE_ROOT = originalWorkspaceRoot
    }

    db.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads backup schedule from system settings', async () => {
    await writeSystemSettings(systemConfigPath, {
      backup: {
        enableAutoBackup: true,
        backupInterval: 'weekly',
        backupTime: '04:30',
        retentionDays: 14,
        includeUserData: true,
        includeLogs: true,
        compressionEnabled: true,
        backupPath: './scheduled-backups'
      }
    })

    const scheduler = new BackupScheduler(db)
    scheduler.refreshFromSettings()

    expect(scheduler.getStatus()).toEqual({
      isRunning: true,
      schedule: '30 4 * * 1',
      configPath: systemConfigPath
    })

    scheduler.stop()
  })

  it('stops scheduling when auto backup is disabled', async () => {
    await writeSystemSettings(systemConfigPath, {
      backup: {
        enableAutoBackup: false,
        backupInterval: 'daily',
        backupTime: '02:00',
        retentionDays: 30,
        includeUserData: true,
        includeLogs: false,
        compressionEnabled: true,
        backupPath: './backups'
      }
    })

    const scheduler = new BackupScheduler(db)
    scheduler.refreshFromSettings()

    expect(scheduler.getStatus()).toEqual({
      isRunning: false,
      schedule: null,
      configPath: systemConfigPath
    })

    scheduler.stop()
  })

  it('loads backup settings even when the config file starts with a BOM', async () => {
    await writeFile(systemConfigPath, `\uFEFF${JSON.stringify({
      backup: {
        enableAutoBackup: true,
        backupInterval: 'daily',
        backupTime: '03:15',
        retentionDays: 21,
        includeUserData: true,
        includeLogs: false,
        compressionEnabled: true,
        backupPath: './bom-backups'
      }
    }, null, 2)}`, 'utf-8')

    const scheduler = new BackupScheduler(db)
    scheduler.refreshFromSettings()

    expect(scheduler.getStatus()).toEqual({
      isRunning: true,
      schedule: '15 3 * * *',
      configPath: systemConfigPath
    })

    scheduler.stop()
  })
})

async function writeSystemSettings(filePath: string, payload: Record<string, unknown>) {
  await writeFile(filePath, JSON.stringify({
    backup: {
      enableAutoBackup: true,
      backupInterval: 'daily',
      backupTime: '02:00',
      retentionDays: 30,
      includeUserData: true,
      includeLogs: false,
      compressionEnabled: true,
      backupPath: './backups'
    },
    ...payload
  }, null, 2), 'utf-8')
}
