import { spawn, spawnSync } from 'child_process'
import crypto from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

const BASE_URL = process.env.PORTAL_BASE_URL || 'http://localhost:8002'
const DEBUG_PORT = Number(process.env.CDP_PORT || '9222')
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
]
const JWT_ISSUER = 'intelligent-portal-system'
const JWT_AUDIENCE = 'portal-users'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function findBrowserExecutable() {
  const browserPath = EDGE_CANDIDATES.find(candidate => existsSync(candidate))
  if (!browserPath) {
    throw new Error('未找到 Edge/Chrome 可执行文件')
  }
  return browserPath
}

function readJwtSecret() {
  const envPath = path.resolve('detection-api/.env')
  const content = readFileSync(envPath, 'utf8')
  const match = content.match(/^JWT_SECRET=(.+)$/m)
  if (!match) {
    throw new Error(`在 ${envPath} 中未找到 JWT_SECRET`)
  }
  return match[1].trim()
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signJwt(payload, secret) {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const body = base64UrlJson(payload)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url')

  return `${header}.${body}.${signature}`
}

function createAccessToken(secret, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'admin-001',
      username: 'admin',
      role: 'admin',
      tokenType: 'access',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + expiresInSeconds,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE
    },
    secret
  )
}

function createRefreshToken(secret, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'admin-001',
      username: 'admin',
      role: 'admin',
      tokenType: 'refresh',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + expiresInSeconds,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE
    },
    secret
  )
}

function createUserData() {
  return {
    id: 'admin-001',
    username: 'admin',
    role: 'admin',
    is_active: true,
    created_at: '2025-11-09T13:17:38.008Z',
    updated_at: '2025-12-11T15:18:26.338Z'
  }
}

async function waitForDebuggerEndpoint() {
  const deadline = Date.now() + 15000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      if (response.ok) {
        return response.json()
      }
    } catch {
      // Ignore startup races.
    }

    await delay(250)
  }

  throw new Error('浏览器调试端口启动超时')
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
    this.nextId = 1
    this.pending = new Map()
    this.eventWaiters = []
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = event => {
        cleanup()
        reject(new Error(`CDP WebSocket 连接失败: ${String(event?.message || 'unknown error')}`))
      }
      const cleanup = () => {
        this.socket.removeEventListener('open', onOpen)
        this.socket.removeEventListener('error', onError)
      }

      this.socket.addEventListener('open', onOpen)
      this.socket.addEventListener('error', onError)
    })

    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)

      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)

        if (message.error) {
          reject(new Error(message.error.message || 'CDP command failed'))
        } else {
          resolve(message.result || {})
        }
        return
      }

      for (const waiter of [...this.eventWaiters]) {
        if (waiter.method !== message.method) {
          continue
        }

        if (waiter.sessionId && waiter.sessionId !== message.sessionId) {
          continue
        }

        if (waiter.predicate && !waiter.predicate(message.params || {})) {
          continue
        }

        this.eventWaiters = this.eventWaiters.filter(item => item !== waiter)
        waiter.resolve(message.params || {})
      }
    })
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = { id, method, params }

    if (sessionId) {
      payload.sessionId = sessionId
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify(payload))
    })
  }

  waitForEvent(method, { sessionId, predicate, timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const waiter = { method, sessionId, predicate, resolve }
      const timeout = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter(item => item !== waiter)
        reject(new Error(`等待事件超时: ${method}`))
      }, timeoutMs)

      waiter.resolve = params => {
        clearTimeout(timeout)
        resolve(params)
      }

      this.eventWaiters.push(waiter)
    })
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close()
      await delay(100)
    }
  }
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  )

  if (result.exceptionDetails) {
    throw new Error(`页面执行失败: ${JSON.stringify(result.exceptionDetails)}`)
  }

  return result.result?.value
}

async function navigate(client, sessionId, url) {
  const loadEvent = client.waitForEvent('Page.loadEventFired', { sessionId, timeoutMs: 15000 })
  await client.send('Page.navigate', { url }, sessionId)
  await loadEvent
}

async function waitForPredicate(client, sessionId, predicateExpression, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = await evaluate(client, sessionId, predicateExpression)
    if (value) {
      return value
    }
    await delay(100)
  }

  throw new Error(`等待条件超时: ${description}`)
}

async function seedAuthStorage(client, sessionId, { accessToken, refreshToken, userData }) {
  const expression = `
    (() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem('auth_token', ${JSON.stringify(accessToken)})
      localStorage.setItem('refresh_token', ${JSON.stringify(refreshToken)})
      localStorage.setItem('user_info', ${JSON.stringify(JSON.stringify(userData))})
      localStorage.setItem('auth_storage_mode', 'persistent')
      return {
        auth_token: localStorage.getItem('auth_token'),
        refresh_token: localStorage.getItem('refresh_token'),
        user_info: localStorage.getItem('user_info'),
        auth_storage_mode: localStorage.getItem('auth_storage_mode')
      }
    })()
  `

  return evaluate(client, sessionId, expression)
}

async function getPath(client, sessionId) {
  return evaluate(client, sessionId, 'location.pathname')
}

async function getBodyText(client, sessionId) {
  return evaluate(client, sessionId, 'document.body ? document.body.innerText : ""')
}

async function verifyTokenAgainstApi(accessToken) {
  const response = await fetch(`${BASE_URL}/api/v2/auth/verify`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new Error(`生成的 access token 未通过后端验证: ${JSON.stringify(body)}`)
  }
}

async function main() {
  const browserPath = findBrowserExecutable()
  const jwtSecret = readJwtSecret()
  const userData = createUserData()
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'portal-auth-e2e-'))
  let browserProcess = null
  let client = null

  try {
    const validAccessToken = createAccessToken(jwtSecret, 60 * 60)
    const validRefreshToken = createRefreshToken(jwtSecret, 7 * 24 * 60 * 60)
    const expiringAccessToken = createAccessToken(jwtSecret, 60)

    await verifyTokenAgainstApi(validAccessToken)

    browserProcess = spawn(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank'
      ],
      {
        stdio: 'ignore'
      }
    )

    const versionInfo = await waitForDebuggerEndpoint()
    client = new CdpClient(versionInfo.webSocketDebuggerUrl)
    await client.connect()

    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })

    await client.send('Page.enable', {}, sessionId)
    await client.send('Runtime.enable', {}, sessionId)

    await navigate(client, sessionId, `${BASE_URL}/portal`)
    await seedAuthStorage(client, sessionId, {
      accessToken: validAccessToken,
      refreshToken: validRefreshToken,
      userData
    })

    await navigate(client, sessionId, `${BASE_URL}/management`)
    await waitForPredicate(
      client,
      sessionId,
      `location.pathname === '/management' && document.body.innerText.includes('应用管理')`,
      10000,
      '进入已登录的管理页'
    )

    const eventStart = Date.now()
    await evaluate(
      client,
      sessionId,
      `
        (() => {
          window.dispatchEvent(new CustomEvent('auth:token-invalid', {
            detail: { source: 'manual-e2e', message: '认证已失效，请重新登录' }
          }))
          return true
        })()
      `
    )
    await waitForPredicate(client, sessionId, `location.pathname === '/portal'`, 3000, 'auth:token-invalid 后回到首页')
    const eventRedirectMs = Date.now() - eventStart

    await navigate(client, sessionId, `${BASE_URL}/portal`)
    await seedAuthStorage(client, sessionId, {
      accessToken: expiringAccessToken,
      refreshToken: 'invalid-refresh-token',
      userData
    })

    const refreshStart = Date.now()
    await navigate(client, sessionId, `${BASE_URL}/management`)
    await waitForPredicate(client, sessionId, `location.pathname === '/portal'`, 4000, 'refresh 失败后回到首页')
    const refreshRedirectMs = Date.now() - refreshStart
    const finalBodyText = await getBodyText(client, sessionId)

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      browserPath,
      results: {
        authInvalidationEventRedirectMs: eventRedirectMs,
        refreshFailureRedirectMs: refreshRedirectMs,
        finalPath: await getPath(client, sessionId),
        sawExpiryMessage: /登录已过期|认证已失效|请重新登录/.test(finalBodyText)
      }
    }, null, 2))
  } finally {
    if (client) {
      await client.close().catch(() => {})
    }

    if (browserProcess?.pid) {
      spawnSync('taskkill', ['/PID', String(browserProcess.pid), '/T', '/F'], {
        stdio: 'ignore'
      })
    }

    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // Windows may hold the profile directory briefly after browser shutdown.
    }
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2))
  process.exitCode = 1
})
