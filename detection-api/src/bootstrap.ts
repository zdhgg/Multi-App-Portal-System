import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

;(globalThis).__PORTAL_BOOTSTRAP__ = true

const serverEntry = existsSync(join(__dirname, 'server.js')) ? './server.js' : './server.ts'
const serverModule = await import(serverEntry)

if (typeof serverModule.startServer === 'function') {
  await serverModule.startServer()
}