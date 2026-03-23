import { describe, expect, it } from 'vitest'
import { buildSystemSettingsPayload, normalizePathAccessSettings } from '@/utils/systemSettingsPayload'

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
      }
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
      }
    }

    const payload = buildSystemSettingsPayload({
      serverSettings,
      accountsUsers: [],
      securitySettings: {},
      pathAccessSettings: {
        allowWorkspaceParent: true,
        allowedBasePaths: ['D:\\My Programs']
      }
    })

    expect(payload.security.pathAccess.allowedBasePaths).toEqual(['D:\\My Programs'])
    expect(serverSettings.security.pathAccess.allowedBasePaths).toEqual(['D:\\CLIProxyAPI_6.8.40'])
  })
})
