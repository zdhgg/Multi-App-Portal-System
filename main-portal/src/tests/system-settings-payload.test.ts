import { describe, expect, it } from 'vitest'
import {
  buildSystemSettingsPayload,
  normalizeBackupSettings,
  normalizePathAccessSettings
} from '@/utils/systemSettingsPayload'

describe('systemSettingsPayload', () => {
  it('buildSystemSettingsPayload 应该优先使用当前编辑中的路径访问设置', () => {
    const serverSettings = {
      accounts: {
        users: [{ id: 'admin-001', username: 'admin' }]
      },
      security: {
        passwordPolicy: {
          minLength: 8
        },
        pathAccess: {
          allowWorkspaceParent: false,
          allowedBasePaths: ['D:\\CLIProxyAPI_6.8.40']
        }
      },
      backup: {
        enableAutoBackup: true,
        backupInterval: 'daily',
        backupTime: '02:00',
        retentionDays: 30,
        includeUserData: true,
        includeLogs: false,
        compressionEnabled: true,
        backupPath: './backups'
      }
    }

    const payload = buildSystemSettingsPayload({
      serverSettings,
      accountsUsers: serverSettings.accounts.users,
      securitySettings: {
        passwordPolicy: {
          minLength: 12
        }
      },
      pathAccessSettings: {
        allowWorkspaceParent: true,
        allowedBasePaths: ['D:\\My Programs', 'D:\\OpenClaw']
      },
      backupSettings: serverSettings.backup
    })

    expect(payload.security.passwordPolicy.minLength).toBe(12)
    expect(payload.security.pathAccess).toEqual({
      allowWorkspaceParent: true,
      allowedBasePaths: ['D:\\My Programs', 'D:\\OpenClaw']
    })
  })

  it('normalizePathAccessSettings 应该去掉空白路径并裁剪空格', () => {
    expect(normalizePathAccessSettings({
      allowWorkspaceParent: 1,
      allowedBasePaths: [' D:\\My Programs ', '', '   ', 'D:\\OpenClaw']
    })).toEqual({
      allowWorkspaceParent: true,
      allowedBasePaths: ['D:\\My Programs', 'D:\\OpenClaw']
    })
  })

  it('buildSystemSettingsPayload 不应该反向修改原始 serverSettings', () => {
    const serverSettings = {
      security: {
        pathAccess: {
          allowWorkspaceParent: false,
          allowedBasePaths: ['D:\\CLIProxyAPI_6.8.40']
        }
      },
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
    }

    const payload = buildSystemSettingsPayload({
      serverSettings,
      accountsUsers: [],
      securitySettings: {},
      pathAccessSettings: {
        allowWorkspaceParent: true,
        allowedBasePaths: ['D:\\My Programs']
      },
      backupSettings: serverSettings.backup
    })

    expect(payload.security.pathAccess.allowedBasePaths).toEqual(['D:\\My Programs'])
    expect(serverSettings.security.pathAccess.allowedBasePaths).toEqual(['D:\\CLIProxyAPI_6.8.40'])
  })

  it('normalizeBackupSettings 应该标准化备份策略配置', () => {
    expect(normalizeBackupSettings({
      enableAutoBackup: 1,
      backupInterval: 'yearly',
      backupTime: ' 03:30 ',
      retentionDays: '400',
      includeUserData: false,
      includeLogs: 'yes',
      compressionEnabled: 0,
      backupPath: ' ./custom-backups '
    })).toEqual({
      enableAutoBackup: true,
      backupInterval: 'daily',
      backupTime: '03:30',
      retentionDays: 365,
      includeUserData: false,
      includeLogs: true,
      compressionEnabled: false,
      backupPath: './custom-backups'
    })
  })

  it('normalizeBackupSettings 在缺少备份段时应该回退到与后端一致的默认值', () => {
    expect(normalizeBackupSettings(undefined)).toEqual({
      enableAutoBackup: true,
      backupInterval: 'daily',
      backupTime: '02:00',
      retentionDays: 30,
      includeUserData: true,
      includeLogs: false,
      compressionEnabled: true,
      backupPath: './backups'
    })
  })

  it('buildSystemSettingsPayload 应该优先使用当前编辑中的备份设置', () => {
    const serverSettings = {
      backup: {
        enableAutoBackup: true,
        backupInterval: 'daily',
        backupTime: '02:00',
        retentionDays: 30,
        includeUserData: true,
        includeLogs: false,
        compressionEnabled: true,
        backupPath: './backups'
      }
    }

    const payload = buildSystemSettingsPayload({
      serverSettings,
      accountsUsers: [],
      securitySettings: {},
      pathAccessSettings: {
        allowWorkspaceParent: false,
        allowedBasePaths: []
      },
      backupSettings: {
        enableAutoBackup: false,
        backupInterval: 'weekly',
        backupTime: '04:45',
        retentionDays: 14,
        includeUserData: true,
        includeLogs: true,
        compressionEnabled: false,
        backupPath: 'D:\\PortalBackups'
      }
    })

    expect(payload.backup).toEqual({
      enableAutoBackup: false,
      backupInterval: 'weekly',
      backupTime: '04:45',
      retentionDays: 14,
      includeUserData: true,
      includeLogs: true,
      compressionEnabled: false,
      backupPath: 'D:\\PortalBackups'
    })
  })
})
