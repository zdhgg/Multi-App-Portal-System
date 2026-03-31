import { tsImport } from 'tsx/esm/api'

const bootTimestamp = new Date().toISOString()
console.log(`[pm2-entry] Bootstrapping portal-api at ${bootTimestamp}`)

try {
  await tsImport('./src/bootstrap.ts', import.meta.url)
  console.log('[pm2-entry] portal-api bootstrap completed')
} catch (error) {
  console.error('[pm2-entry] portal-api bootstrap failed', error)
  throw error
}
