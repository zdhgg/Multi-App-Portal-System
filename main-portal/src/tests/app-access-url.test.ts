import { describe, expect, it } from 'vitest'
import {
  isAppOnline,
  isAppOpenable,
  resolveAppDeploymentMode,
  resolveAppOpenPort,
  resolveAppOpenUrl
} from '@/utils/appAccess'

const fullStackApp = {
  id: 'app-1',
  name: 'Underground Home',
  frontend_port: 3018,
  backend_port: 8018,
  isFullStack: true,
  status: 'online',
  isRunning: true,
  network: { primaryPort: 3018, secondaryPorts: [8018], protocol: 'http' as const }
}

describe('resolveAppOpenPort', () => {
  it('uses the backend port for fullstack apps running in production (PM2)', () => {
    expect(resolveAppOpenPort({ ...fullStackApp, deploymentMode: 'production', pm2ProcessName: 'underground-home' })).toBe(8018)
  })

  it('uses the frontend port for fullstack apps running in development', () => {
    expect(resolveAppOpenPort({ ...fullStackApp, deploymentMode: 'development' })).toBe(3018)
  })

  it('falls back to production when the mode is unknown but a PM2 process name exists', () => {
    expect(resolveAppOpenPort({ ...fullStackApp, deploymentMode: 'unknown', pm2ProcessName: 'underground-home' })).toBe(8018)
    expect(resolveAppDeploymentMode({ deploymentMode: 'unknown', pm2ProcessName: 'underground-home' })).toBe('production')
  })

  it('uses the frontend port when the mode is unknown and no PM2 process is tracked', () => {
    expect(resolveAppOpenPort({ ...fullStackApp, deploymentMode: 'unknown', pm2ProcessName: null })).toBe(3018)
  })

  it('uses the single available port for non-fullstack apps', () => {
    expect(resolveAppOpenPort({ id: 'app-2', frontend_port: 3080, isFullStack: false, deploymentMode: 'production' })).toBe(3080)
    expect(resolveAppOpenPort({ id: 'app-3', backend_port: 8020, isFullStack: false })).toBe(8020)
  })

  it('ignores the deployment mode for apps that are not fullstack', () => {
    expect(resolveAppOpenPort({ id: 'app-4', frontend_port: 3013, backend_port: 8013, isFullStack: false, deploymentMode: 'production' })).toBe(3013)
  })

  it('returns null when the app has no port information', () => {
    expect(resolveAppOpenPort({ id: 'app-5', isFullStack: false })).toBeNull()
  })
})

describe('resolveAppOpenUrl', () => {
  it('builds a url from the resolved port', () => {
    expect(resolveAppOpenUrl({ ...fullStackApp, deploymentMode: 'production' })).toBe('http://localhost:8018')
    expect(resolveAppOpenUrl({ ...fullStackApp, deploymentMode: 'development' })).toBe('http://localhost:3018')
  })

  it('appends the configured access path', () => {
    expect(resolveAppOpenUrl({ ...fullStackApp, deploymentMode: 'development', accessPath: 'management.html' }))
      .toBe('http://localhost:3018/management.html')
    expect(resolveAppOpenUrl({ ...fullStackApp, deploymentMode: 'development', access_path: '/admin?tab=1' }))
      .toBe('http://localhost:3018/admin?tab=1')
  })

  it('honours the https protocol when the app declares it', () => {
    expect(resolveAppOpenUrl({ ...fullStackApp, deploymentMode: 'development', network: { primaryPort: 3018, secondaryPorts: [8018], protocol: 'https' } }))
      .toBe('https://localhost:3018')
  })
})

describe('isAppOpenable', () => {
  it('requires a running app', () => {
    expect(isAppOnline({ status: 'offline', isRunning: false })).toBe(false)
    expect(isAppOpenable({ ...fullStackApp, status: 'offline', isRunning: false })).toBe(false)
  })

  it('requires port information', () => {
    expect(isAppOpenable({ id: 'app-6', status: 'online', isRunning: true })).toBe(false)
  })

  it('accepts a running app with a resolvable port', () => {
    expect(isAppOpenable(fullStackApp)).toBe(true)
  })
})
