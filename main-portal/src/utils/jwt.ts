const normalizeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4

  if (padding === 0) {
    return normalized
  }

  return normalized.padEnd(normalized.length + (4 - padding), '=')
}

const decodeBase64 = (value: string): string => {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(value)
  }

  if (typeof atob === 'function') {
    return atob(value)
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('binary')
  }

  throw new Error('No base64 decoder available')
}

const decodeUtf8 = (binary: string): string => {
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))

  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes)
  }

  return Array.from(bytes, byte => String.fromCharCode(byte)).join('')
}

export const decodeJwtPayload = <TPayload = Record<string, unknown>>(token: string): TPayload | null => {
  const [, payload] = token.split('.')

  if (!payload) {
    return null
  }

  try {
    const decoded = decodeBase64(normalizeBase64Url(payload))
    return JSON.parse(decodeUtf8(decoded)) as TPayload
  } catch {
    return null
  }
}
