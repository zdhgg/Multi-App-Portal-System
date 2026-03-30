import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSystemConfigPaths,
  parseSystemConfigFileSync,
  readSystemConfigFileSync,
  synchronizeSystemConfigFiles
} from '../systemConfigPath.js'

const createWorkspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'system-config-path-'))
  const moduleDir = join(root, 'detection-api', 'src', 'utils')
  const canonicalPath = join(root, 'configs', 'system-config.json')
  const compatibilityPath = join(root, 'detection-api', 'configs', 'system-config.json')

  return {
    root,
    moduleDir,
    canonicalPath,
    compatibilityPath
  }
}

const writeJson = (filePath: string, value: any) => {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

describe('systemConfigPath', () => {
  const workspaces: string[] = []

  afterEach(() => {
    while (workspaces.length > 0) {
      const workspace = workspaces.pop()
      if (workspace) {
        rmSync(workspace, { recursive: true, force: true })
      }
    }
  })

  it('prefers the repository root config path as canonical', () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    const paths = createSystemConfigPaths({ moduleDir: workspace.moduleDir })

    expect(paths.canonicalPath).toBe(workspace.canonicalPath)
    expect(paths.compatibilityPath).toBe(workspace.compatibilityPath)
    expect(paths.activePath).toBe(workspace.canonicalPath)
    expect(paths.usingOverride).toBe(false)
  })

  it('migrates the legacy detection-api config to the canonical root location when needed', () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    writeJson(workspace.compatibilityPath, {
      security: {
        pathAccess: {
          allowWorkspaceParent: true,
          allowedBasePaths: ['D:\\OpenClaw']
        }
      }
    })

    const paths = createSystemConfigPaths({ moduleDir: workspace.moduleDir })
    synchronizeSystemConfigFiles(paths)

    expect(JSON.parse(readFileSync(workspace.canonicalPath, 'utf8'))).toEqual(
      JSON.parse(readFileSync(workspace.compatibilityPath, 'utf8'))
    )
  })

  it('synchronizes the older copy to the newer file when both locations diverge', async () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    writeJson(workspace.canonicalPath, {
      security: {
        pathAccess: {
          allowWorkspaceParent: false,
          allowedBasePaths: ['D:\\Old']
        }
      }
    })

    await new Promise(resolve => setTimeout(resolve, 20))

    writeJson(workspace.compatibilityPath, {
      security: {
        pathAccess: {
          allowWorkspaceParent: true,
          allowedBasePaths: ['D:\\Latest']
        }
      }
    })

    const legacyMtime = statSync(workspace.compatibilityPath).mtimeMs
    const paths = createSystemConfigPaths({ moduleDir: workspace.moduleDir })
    synchronizeSystemConfigFiles(paths)

    expect(JSON.parse(readFileSync(workspace.canonicalPath, 'utf8'))).toEqual({
      security: {
        pathAccess: {
          allowWorkspaceParent: true,
          allowedBasePaths: ['D:\\Latest']
        }
      }
    })
    expect(statSync(workspace.canonicalPath).mtimeMs).toBeGreaterThanOrEqual(legacyMtime)
  })

  it('reads UTF-8 BOM config files without breaking JSON parsing', () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    mkdirSync(dirname(workspace.canonicalPath), { recursive: true })
    writeFileSync(workspace.canonicalPath, '\uFEFF{"backup":{"enableAutoBackup":false}}', 'utf8')

    expect(readSystemConfigFileSync(workspace.canonicalPath)).toBe('{"backup":{"enableAutoBackup":false}}')
    expect(parseSystemConfigFileSync<{ backup: { enableAutoBackup: boolean } }>(workspace.canonicalPath)).toEqual({
      backup: {
        enableAutoBackup: false
      }
    })
  })
})
