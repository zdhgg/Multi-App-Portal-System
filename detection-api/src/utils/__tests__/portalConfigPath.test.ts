import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { createPortalConfigPaths, synchronizePortalConfigFiles } from '../portalConfigPath.js'

const createWorkspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'portal-config-path-'))
  const moduleDir = join(root, 'detection-api', 'src', 'utils')
  const canonicalPath = join(root, 'detection-api', 'configs', 'portal-config.json')
  const compatibilityPath = join(root, 'detection-api', 'config', 'system-config.json')

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

describe('portalConfigPath', () => {
  const workspaces: string[] = []

  afterEach(() => {
    while (workspaces.length > 0) {
      const workspace = workspaces.pop()
      if (workspace) {
        rmSync(workspace, { recursive: true, force: true })
      }
    }
  })

  it('uses configs/portal-config.json as the canonical portal config file', () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    const paths = createPortalConfigPaths({ moduleDir: workspace.moduleDir })

    expect(paths.canonicalPath).toBe(workspace.canonicalPath)
    expect(paths.compatibilityPath).toBe(workspace.compatibilityPath)
    expect(paths.activePath).toBe(workspace.canonicalPath)
  })

  it('migrates the legacy config/system-config.json file to portal-config.json', () => {
    const workspace = createWorkspace()
    workspaces.push(workspace.root)

    writeJson(workspace.compatibilityPath, {
      portConfiguration: {
        backendRange: { start: 8003, end: 8100, description: 'backend' }
      }
    })

    const paths = createPortalConfigPaths({ moduleDir: workspace.moduleDir })
    synchronizePortalConfigFiles(paths)

    expect(JSON.parse(readFileSync(workspace.canonicalPath, 'utf8'))).toEqual(
      JSON.parse(readFileSync(workspace.compatibilityPath, 'utf8'))
    )
  })
})
