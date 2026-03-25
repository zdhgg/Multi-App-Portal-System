import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimpleProcessManager } from '../SimpleServices'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

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

  it('generates a Vite proxy config that preserves the app base config when one exists', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'portal-vite-proxy-base-'))

    try {
      await writeFile(
        join(tempDir, 'vite.config.ts'),
        'export default { plugins: ["placeholder-plugin"] }\n',
        'utf-8'
      )

      const manager = new SimpleProcessManager()
      await (manager as any).createViteProxyConfig(tempDir, '8123')

      const generatedConfig = await readFile(join(tempDir, 'vite.config.proxy.ts'), 'utf-8')

      expect(generatedConfig).toContain('const baseConfigFile = "vite.config.ts"')
      expect(generatedConfig).toContain('loadConfigFromFile')
      expect(generatedConfig).toContain("target: 'http://localhost:8123'")
      expect(generatedConfig).toContain("'/uploads':")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back to a generated Vite config when no base vite config exists', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'portal-vite-proxy-fallback-'))

    try {
      const manager = new SimpleProcessManager()
      await (manager as any).createViteProxyConfig(tempDir, '8456')

      const generatedConfig = await readFile(join(tempDir, 'vite.config.proxy.ts'), 'utf-8')

      expect(generatedConfig).toContain('const baseConfigFile = null')
      expect(generatedConfig).toContain('plugins: [vue()]')
      expect(generatedConfig).toContain("target: 'http://localhost:8456'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
