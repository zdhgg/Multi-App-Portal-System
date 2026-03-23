import { promises as fs } from 'fs'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CANONICAL_RELATIVE_PATH = join('configs', 'portal-config.json')
const LEGACY_RELATIVE_PATH = join('config', 'system-config.json')

export interface PortalConfigPaths {
  activePath: string
  canonicalPath: string
  compatibilityPath: string | null
  usingOverride: boolean
}

type CreatePortalConfigPathsOptions = {
  moduleDir?: string
  overridePath?: string
}

const ensureParentDirectorySync = (filePath: string): void => {
  mkdirSync(dirname(filePath), { recursive: true })
}

const readTextIfExists = (filePath: string): string | null => {
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf8')
}

const writeMirrorIfChanged = (sourcePath: string, targetPath: string, reason: string): void => {
  const sourceContent = readTextIfExists(sourcePath)
  if (sourceContent === null) return

  const targetContent = readTextIfExists(targetPath)
  if (targetContent === sourceContent) return

  ensureParentDirectorySync(targetPath)
  writeFileSync(targetPath, sourceContent, 'utf8')

  logger.warn('端口配置文件已自动同步', {
    reason,
    sourcePath,
    targetPath
  })
}

const getNewerPath = (firstPath: string, secondPath: string): string => {
  const firstMtime = statSync(firstPath).mtimeMs
  const secondMtime = statSync(secondPath).mtimeMs
  return firstMtime >= secondMtime ? firstPath : secondPath
}

export const createPortalConfigPaths = (
  options: CreatePortalConfigPathsOptions = {}
): PortalConfigPaths => {
  const overrideCandidate = options.overridePath || process.env.PORTAL_CONFIG_PATH?.trim()
  if (overrideCandidate) {
    const activePath = resolve(overrideCandidate)
    return {
      activePath,
      canonicalPath: activePath,
      compatibilityPath: null,
      usingOverride: true
    }
  }

  const moduleDir = options.moduleDir || __dirname
  const apiRoot = resolve(moduleDir, '../..')
  const canonicalPath = resolve(apiRoot, CANONICAL_RELATIVE_PATH)
  const compatibilityPath = resolve(apiRoot, LEGACY_RELATIVE_PATH)

  return {
    activePath: canonicalPath,
    canonicalPath,
    compatibilityPath: canonicalPath === compatibilityPath ? null : compatibilityPath,
    usingOverride: false
  }
}

export const synchronizePortalConfigFiles = (
  paths: PortalConfigPaths = createPortalConfigPaths()
): PortalConfigPaths => {
  ensureParentDirectorySync(paths.activePath)

  if (paths.usingOverride || !paths.compatibilityPath) {
    return paths
  }

  const canonicalExists = existsSync(paths.canonicalPath)
  const compatibilityExists = existsSync(paths.compatibilityPath)

  if (!canonicalExists && !compatibilityExists) {
    return paths
  }

  if (!canonicalExists && compatibilityExists) {
    writeMirrorIfChanged(
      paths.compatibilityPath,
      paths.canonicalPath,
      '将旧版 system-config 端口配置迁移到 portal-config'
    )
    return paths
  }

  if (canonicalExists && !compatibilityExists) {
    writeMirrorIfChanged(
      paths.canonicalPath,
      paths.compatibilityPath,
      '为兼容旧路径创建端口配置镜像'
    )
    return paths
  }

  const canonicalContent = readTextIfExists(paths.canonicalPath)
  const compatibilityContent = readTextIfExists(paths.compatibilityPath)

  if (canonicalContent !== compatibilityContent) {
    const newerPath = getNewerPath(paths.canonicalPath, paths.compatibilityPath)
    const olderPath = newerPath === paths.canonicalPath ? paths.compatibilityPath : paths.canonicalPath

    writeMirrorIfChanged(
      newerPath,
      olderPath,
      newerPath === paths.canonicalPath
        ? '使用 portal-config 覆盖旧版端口配置镜像'
        : '使用较新的旧版端口配置回填 portal-config'
    )
  }

  return paths
}

export const getPortalConfigFilePath = (): string => {
  const paths = synchronizePortalConfigFiles()
  return paths.activePath
}

export const readPortalConfigFileSync = (): string => {
  return readFileSync(getPortalConfigFilePath(), 'utf8')
}

export const writePortalConfigFileSync = (content: string): string => {
  const paths = synchronizePortalConfigFiles()

  ensureParentDirectorySync(paths.activePath)
  writeFileSync(paths.activePath, content, 'utf8')

  if (paths.compatibilityPath && paths.compatibilityPath !== paths.activePath) {
    ensureParentDirectorySync(paths.compatibilityPath)
    writeFileSync(paths.compatibilityPath, content, 'utf8')
  }

  return paths.activePath
}

export const writePortalConfigFile = async (content: string): Promise<string> => {
  const paths = synchronizePortalConfigFiles()

  await fs.mkdir(dirname(paths.activePath), { recursive: true })
  await fs.writeFile(paths.activePath, content, 'utf8')

  if (paths.compatibilityPath && paths.compatibilityPath !== paths.activePath) {
    await fs.mkdir(dirname(paths.compatibilityPath), { recursive: true })
    await fs.writeFile(paths.compatibilityPath, content, 'utf8')
  }

  return paths.activePath
}
