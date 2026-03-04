#!/usr/bin/env node
// Simple CLI to trigger system backup via API
// Usage: node scripts/backup-cli.js [--host http://localhost:8002]

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const host = getArg('--host', 'http://localhost:8002')
const url = `${host.replace(/\/$/, '')}/api/config-export/backup`

async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ includeEnvironments: true, includeTemplates: true })
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('Backup failed:', res.status, text)
    process.exit(1)
  }
  const data = await res.json()
  console.log('Backup created:', data?.data?.filePath || data)
}

main().catch(err => { console.error(err); process.exit(1) })

