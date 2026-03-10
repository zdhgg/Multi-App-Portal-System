import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimpleProcessManager } from '../SimpleServices'

describe('SimpleProcessManager environment handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers child process NODE_ENV over portal NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const manager = new SimpleProcessManager()
    const env = (manager as any).buildProcessEnvironmentVariables('backend', {
      workingDirectory: process.cwd(),
      startCommand: 'npm run dev',
      port: 8006,
      environmentVariables: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0'
      }
    })

    expect(env.NODE_ENV).toBe('development')
    expect(env.HOST).toBe('0.0.0.0')
    expect(env.PORT).toBe('8006')
    expect(env.SERVER_PORT).toBe('8006')
  })
})
