import { existsSync } from 'fs'
import { normalize } from 'path'

const FOLDER_PICKER_SELECTED_MARKER = '__FOLDER_PICKER_SELECTED__'
const FOLDER_PICKER_CANCELLED_MARKER = '__FOLDER_PICKER_CANCELLED__'

export interface WindowsFolderPickerParseResult {
  cancelled: boolean
  path?: string
}

function sanitizePickerText(value: string): string {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\uFEFF/g, '')
    .trim()
}

function normalizePathCandidate(value: string): string | null {
  let candidate = sanitizePickerText(value)
  if (!candidate) return null

  if (candidate.includes(FOLDER_PICKER_SELECTED_MARKER)) {
    candidate = candidate.slice(candidate.lastIndexOf(FOLDER_PICKER_SELECTED_MARKER) + FOLDER_PICKER_SELECTED_MARKER.length)
  }

  candidate = candidate
    .replace(/^Path\s*:\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()

  if (!candidate) return null

  return normalize(candidate)
}

function extractJsonPayloads(rawOutput: string): WindowsFolderPickerParseResult[] {
  const results: WindowsFolderPickerParseResult[] = []
  const lines = sanitizePickerText(rawOutput)
    .split(/\r?\n/)
    .map(sanitizePickerText)
    .filter(Boolean)

  for (const line of lines) {
    if (!line.startsWith('{') || !line.includes('"cancelled"')) {
      continue
    }

    try {
      const parsed = JSON.parse(line)
      const normalizedPath =
        typeof parsed?.path === 'string'
          ? normalizePathCandidate(parsed.path)
          : undefined

      results.push({
        cancelled: Boolean(parsed?.cancelled),
        path: normalizedPath || undefined
      })
    } catch {
      // Ignore malformed JSON and continue with legacy parsing fallbacks.
    }
  }

  return results
}

function extractPathCandidates(rawOutput: string): string[] {
  const cleanedOutput = sanitizePickerText(rawOutput)
  const candidates: string[] = []
  const seen = new Set<string>()

  const pushCandidate = (candidate: string | null) => {
    if (!candidate) return
    const normalized = normalizePathCandidate(candidate)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
  }

  const lines = cleanedOutput
    .split(/\r?\n/)
    .map(sanitizePickerText)
    .filter(Boolean)

  for (const line of lines) {
    if (line.includes(FOLDER_PICKER_CANCELLED_MARKER)) {
      continue
    }

    if (line.includes(FOLDER_PICKER_SELECTED_MARKER)) {
      pushCandidate(line)
      continue
    }

    if (/^(?:[a-zA-Z]:\\|\\\\)/.test(line.replace(/^["'`]+|["'`]+$/g, ''))) {
      pushCandidate(line)
    }
  }

  const pathRegex = /(?:[a-zA-Z]:\\|\\\\)[^\r\n]*/g
  for (const match of cleanedOutput.match(pathRegex) || []) {
    pushCandidate(match)
  }

  return candidates
}

export function parseWindowsFolderPickerOutput(
  rawOutput: string,
  pathExists: (path: string) => boolean = existsSync
): WindowsFolderPickerParseResult {
  const cleanedOutput = sanitizePickerText(rawOutput)

  for (const parsed of extractJsonPayloads(cleanedOutput).reverse()) {
    if (parsed.cancelled) {
      return { cancelled: true }
    }

    if (parsed.path) {
      return {
        cancelled: false,
        path: parsed.path
      }
    }
  }

  if (cleanedOutput.includes(FOLDER_PICKER_CANCELLED_MARKER)) {
    return { cancelled: true }
  }

  const candidates = extractPathCandidates(cleanedOutput)
  const existingPath = candidates.find(candidate => pathExists(candidate))

  if (existingPath) {
    return {
      cancelled: false,
      path: existingPath
    }
  }

  if (candidates.length > 0) {
    return {
      cancelled: false,
      path: candidates[0]
    }
  }

  return { cancelled: false }
}

export {
  FOLDER_PICKER_CANCELLED_MARKER,
  FOLDER_PICKER_SELECTED_MARKER,
  sanitizePickerText
}
