import type { PM2Process } from '@/services/pm2Api'

export interface PM2ManagedAppCandidate {
  name: string
  directory?: string | null
  pm2ProcessName?: string | null
}

function normalizeComparableName(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
}

export function normalizeComparablePath(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .replace(/[\\]+$/, '')
    .toLowerCase()
}

function getProcessScriptDirectory(script?: string | null): string {
  const normalizedScript = normalizeComparablePath(script)
  if (!normalizedScript) return ''

  const lastSeparatorIndex = normalizedScript.lastIndexOf('\\')
  return lastSeparatorIndex >= 0 ? normalizedScript.slice(0, lastSeparatorIndex) : normalizedScript
}

export function matchesPM2ProcessDirectory(
  app: PM2ManagedAppCandidate,
  process: Pick<PM2Process, 'cwd' | 'script'>
): boolean {
  const appDirectory = normalizeComparablePath(app.directory)
  if (!appDirectory) return false

  const processDirectories = [
    normalizeComparablePath(process.cwd),
    getProcessScriptDirectory(process.script)
  ].filter(Boolean)

  return processDirectories.some(candidate =>
    candidate === appDirectory ||
    candidate.startsWith(`${appDirectory}\\`)
  )
}

function getProcessMatchScore(app: PM2ManagedAppCandidate, process: PM2Process): number {
  if (!process?.name) return 0

  const candidateNames = [
    app.pm2ProcessName || '',
    app.name,
    app.name.toLowerCase().replace(/\s+/g, '-')
  ]
    .map(name => String(name || '').trim())
    .filter(Boolean)

  const processName = String(process.name).trim()
  let score = 0

  if (
    String(app.pm2ProcessName || '').trim() &&
    normalizeComparableName(app.pm2ProcessName) === normalizeComparableName(processName)
  ) {
    score += 300
  } else if (
    candidateNames.some(candidate =>
      normalizeComparableName(candidate) !== '' &&
      normalizeComparableName(candidate) === normalizeComparableName(processName)
    )
  ) {
    score += 200
  }

  if (matchesPM2ProcessDirectory(app, process)) {
    score += 100
  }

  if (score <= 0) {
    return 0
  }

  const status = String(process.status || '').toLowerCase()
  if (status === 'online') score += 1000
  else if (status === 'launching' || status === 'stopping') score += 500

  return score
}

export function findBestMatchedPM2Process(
  app: PM2ManagedAppCandidate,
  processes: PM2Process[]
): PM2Process | null {
  const rankedProcesses = processes
    .map(process => ({ process, score: getProcessMatchScore(app, process) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return rankedProcesses[0]?.process || null
}

export function isLivePM2ProcessStatus(status?: string | null): boolean {
  const normalizedStatus = String(status || '').toLowerCase()
  return normalizedStatus === 'online' || normalizedStatus === 'launching' || normalizedStatus === 'stopping'
}

export function isLikelyPM2ManagedApp(
  app: PM2ManagedAppCandidate,
  processes: PM2Process[]
): boolean {
  const matchedProcess = findBestMatchedPM2Process(app, processes)
  if (matchedProcess && isLivePM2ProcessStatus(matchedProcess.status)) {
    return true
  }

  return Boolean(String(app.pm2ProcessName || '').trim())
}
