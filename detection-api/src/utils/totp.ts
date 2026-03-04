import { createHmac } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const normalizeSecret = (secret: string): string => {
  return secret.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

const decodeBase32 = (secret: string): Buffer => {
  const normalized = normalizeSecret(secret)
  let bits = ''

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid base32 secret')
    }
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  }

  return Buffer.from(bytes)
}

const generateHotp = (secret: Buffer, counter: number, digits: number): string => {
  const counterBuffer = Buffer.alloc(8)
  const high = Math.floor(counter / 0x100000000)
  const low = counter % 0x100000000

  counterBuffer.writeUInt32BE(high >>> 0, 0)
  counterBuffer.writeUInt32BE(low >>> 0, 4)

  const hmac = createHmac('sha1', secret).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % (10 ** digits)

  return String(code).padStart(digits, '0')
}

export interface TotpVerifyOptions {
  stepSeconds?: number
  window?: number
  digits?: number
}

export const verifyTotp = (code: string, secret: string, options: TotpVerifyOptions = {}): boolean => {
  if (!secret || typeof secret !== 'string') {
    return false
  }

  const normalizedCode = String(code || '').trim()
  if (!/^\d{6,8}$/.test(normalizedCode)) {
    return false
  }

  const stepSeconds = options.stepSeconds ?? 30
  const window = options.window ?? 1
  const digits = options.digits ?? normalizedCode.length

  try {
    const secretBuffer = decodeBase32(secret)
    const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds)

    for (let offset = -window; offset <= window; offset += 1) {
      const expected = generateHotp(secretBuffer, currentCounter + offset, digits)
      if (expected === normalizedCode) {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}
