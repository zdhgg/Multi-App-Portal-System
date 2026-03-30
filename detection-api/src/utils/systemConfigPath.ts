import { promises as fs } from 'fs'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SYSTEM_CONFIG_RELATIVE_PATH = join('configs', 'system-config.json')
const UTF8_BOM = '\uFEFF'

export interface SystemConfigPaths {
  activePath: string
  canonicalPath: string
  compatibilityPath: string | null
  usingOverride: boolean
}

type CreateSystemConfigPathsOptions = {
  moduleDir?: string
  overridePath?: string
}

const ensureParentDirectorySync = (filePath: string): void => {
  mkdirSync(dirname(filePath), { recursive: true })
}

// Windows editors may save UTF-8 JSON with BOM; strip it before parsing or syncing.
export const stripUtf8Bom = (content: string): string => (
  content.charCodeAt(0) === UTF8_BOM.charCodeAt(0) ? content.slice(1) : content
)

const readTextIfExists = (filePath: string): string | null => {
  if (!existsSync(filePath)) return null
  return stripUtf8Bom(readFileSync(filePath, 'utf8'))
}

const writeMirrorIfChanged = (sourcePath: string, targetPath: string, reason: string): void => {
  const sourceContent = readTextIfExists(sourcePath)
  if (sourceContent === null) return

  const targetContent = readTextIfExists(targetPath)
  if (targetContent === sourceContent) return

  ensureParentDirectorySync(targetPath)
  writeFileSync(targetPath, sourceContent, 'utf8')

  logger.warn('系统配置文件已自动同步', {
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

export const createSystemConfigPaths = (
  options: CreateSystemConfigPathsOptions = {}
): SystemConfigPaths => {
  const overrideCandidate = options.overridePath || process.env.SYSTEM_CONFIG_PATH?.trim()
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
  const detectionApiRoot = resolve(moduleDir, '../..')
  const projectRoot = resolve(moduleDir, '../../..')
  const canonicalPath = resolve(projectRoot, SYSTEM_CONFIG_RELATIVE_PATH)
  const compatibilityPath = resolve(detectionApiRoot, SYSTEM_CONFIG_RELATIVE_PATH)

  return {
    activePath: canonicalPath,
    canonicalPath,
    compatibilityPath: canonicalPath === compatibilityPath ? null : compatibilityPath,
    usingOverride: false
  }
}

export const synchronizeSystemConfigFiles = (
  paths: SystemConfigPaths = createSystemConfigPaths()
): SystemConfigPaths => {
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
      '将旧版 detection-api 配置迁移到仓库根目录'
    )
    return paths
  }

  if (canonicalExists && !compatibilityExists) {
    writeMirrorIfChanged(
      paths.canonicalPath,
      paths.compatibilityPath,
      '为兼容旧路径创建系统配置镜像'
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
        ? '使用仓库根目录配置覆盖旧版镜像'
        : '使用较新的 detection-api 配置回填仓库根目录'
    )
  }

  return paths
}

export const getSystemConfigFilePath = (): string => {
  const paths = synchronizeSystemConfigFiles()
  return paths.activePath
}

export const readSystemConfigFile = async (filePath: string = getSystemConfigFilePath()): Promise<string> => {
  return stripUtf8Bom(await fs.readFile(filePath, 'utf8'))
}

export const readSystemConfigFileSync = (filePath: string = getSystemConfigFilePath()): string => {
  return stripUtf8Bom(readFileSync(filePath, 'utf8'))
}

export const parseSystemConfigContent = <T = any>(content: string): T => {
  return JSON.parse(stripUtf8Bom(content)) as T
}

export const parseSystemConfigFile = async <T = any>(filePath: string = getSystemConfigFilePath()): Promise<T> => {
  return parseSystemConfigContent<T>(await readSystemConfigFile(filePath))
}

export const parseSystemConfigFileSync = <T = any>(filePath: string = getSystemConfigFilePath()): T => {
  return parseSystemConfigContent<T>(readSystemConfigFileSync(filePath))
}

export const writeSystemConfigFile = async (content: string): Promise<string> => {
  const paths = synchronizeSystemConfigFiles()

  await fs.mkdir(dirname(paths.activePath), { recursive: true })
  await fs.writeFile(paths.activePath, content, 'utf8')

  if (paths.compatibilityPath && paths.compatibilityPath !== paths.activePath) {
    await fs.mkdir(dirname(paths.compatibilityPath), { recursive: true })
    await fs.writeFile(paths.compatibilityPath, content, 'utf8')
  }

  return paths.activePath
}

export const writeSystemConfigFileSync = (content: string): string => {
  const paths = synchronizeSystemConfigFiles()

  ensureParentDirectorySync(paths.activePath)
  writeFileSync(paths.activePath, content, 'utf8')

  if (paths.compatibilityPath && paths.compatibilityPath !== paths.activePath) {
    ensureParentDirectorySync(paths.compatibilityPath)
    writeFileSync(paths.compatibilityPath, content, 'utf8')
  }

  return paths.activePath
}
