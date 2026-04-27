import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { enhancedFullStackDetector } from '../enhancedFullStackDetector'

const createMonorepoFixture = () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'enhanced-fullstack-'))
  const webDir = join(rootDir, 'apps', 'web')
  const apiDir = join(rootDir, 'apps', 'api')
  const sharedDir = join(rootDir, 'packages', 'shared')

  mkdirSync(webDir, { recursive: true })
  mkdirSync(apiDir, { recursive: true })
  mkdirSync(sharedDir, { recursive: true })

  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
    name: 'novelos-monorepo',
    private: true
  }, null, 2))
  writeFileSync(join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n')

  writeFileSync(join(webDir, 'package.json'), JSON.stringify({
    name: '@novelos/web',
    private: true,
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 5173'
    },
    dependencies: {
      vue: '^3.0.0'
    },
    devDependencies: {
      vite: '^5.0.0',
      '@vitejs/plugin-vue': '^5.0.0'
    }
  }, null, 2))

  writeFileSync(join(apiDir, 'package.json'), JSON.stringify({
    name: '@novelos/api',
    private: true,
    scripts: {
      dev: 'tsx watch src/main.ts'
    },
    dependencies: {
      '@nestjs/core': '^11.0.0'
    }
  }, null, 2))

  writeFileSync(join(sharedDir, 'package.json'), JSON.stringify({
    name: '@novelos/shared',
    private: true
  }, null, 2))

  return {
    rootDir,
    webDir,
    apiDir
  }
}

describe('enhancedFullStackDetector', () => {
  it('detects pnpm workspace monorepo fullstack projects with glob patterns', async () => {
    const fixture = createMonorepoFixture()

    try {
      const projects = await enhancedFullStackDetector.detectFullStackProjects(fixture.rootDir)

      expect(projects).toHaveLength(1)
      expect(projects[0].type).toBe('monorepo_fullstack')
      expect(projects[0].frontend.directory.replace(/\\/g, '/').toLowerCase()).toBe(fixture.webDir.replace(/\\/g, '/').toLowerCase())
      expect(projects[0].backend.directory.replace(/\\/g, '/').toLowerCase()).toBe(fixture.apiDir.replace(/\\/g, '/').toLowerCase())
      expect(projects[0].metadata?.detectionReason).toContain('Monorepo')
    } finally {
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })
})
