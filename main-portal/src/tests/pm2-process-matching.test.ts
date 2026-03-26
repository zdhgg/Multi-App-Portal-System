import { describe, expect, it } from 'vitest'
import {
  findBestMatchedPM2Process,
  isLikelyPM2ManagedApp,
  matchesPM2ProcessDirectory
} from '@/utils/pm2ProcessMatching'

describe('pm2ProcessMatching', () => {
  const app = {
    name: 'Teaching-inspection-system',
    directory: 'D:/My Programs/Teaching-inspection-system',
    pm2ProcessName: null
  }

  it('matches PM2 processes running from an app subdirectory', () => {
    expect(matchesPM2ProcessDirectory(app, {
      cwd: 'D:/My Programs/Teaching-inspection-system/backend',
      script: 'D:/My Programs/Teaching-inspection-system/backend/dist/server.js'
    })).toBe(true)
  })

  it('does not treat a shared workspace parent directory as a match', () => {
    expect(matchesPM2ProcessDirectory(app, {
      cwd: 'D:/My Programs'
    })).toBe(false)
  })

  it('finds PM2-managed apps even when the process name differs from the app name', () => {
    const processes = [
      {
        name: 'workspace-runner',
        status: 'online',
        cwd: 'D:/My Programs'
      },
      {
        name: 'teaching-inspection-backend',
        status: 'online',
        cwd: 'D:/My Programs/Teaching-inspection-system/backend',
        script: 'D:/My Programs/Teaching-inspection-system/backend/dist/server.js'
      }
    ]

    const matched = findBestMatchedPM2Process(app, processes as any)

    expect(matched?.name).toBe('teaching-inspection-backend')
    expect(isLikelyPM2ManagedApp(app, processes as any)).toBe(true)
  })
})
