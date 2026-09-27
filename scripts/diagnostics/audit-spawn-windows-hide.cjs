/**
 * 审计脚本：找出 detection-api 里所有子进程调用点，检查是否设置了 windowsHide。
 *
 * 为什么需要它：
 *   在 Windows 上，凡是会创建控制台进程的调用（spawn/exec/execFile/...）
 *   如果不传 windowsHide: true，就会闪出一个黑框。2026-09-27 排查
 *   "每隔一段时间弹黑框" 时就是靠这个审计确认了门户自身没有周期性漏网点。
 *
 * 用法（在仓库根目录）：
 *   node scripts/diagnostics/audit-spawn-windows-hide.cjs
 *
 * 退出码：0 = 无漏网；1 = 有漏网（可用于 CI / 提交前检查）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(process.cwd(), 'detection-api', 'src')

const CALL_RE = /\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|execAsync|execFileAsync)\s*\(/g
// 排除 sqlite 的 db.exec 与正则的 .exec
const EXCLUDE_PREFIX_RE = /(db|database|stmt|statement|regex|regexp|pattern|re)\s*\.\s*$|\.db\s*\.\s*$/

/**
 * 有意为之的例外：显式 windowsHide: false 的调用点。
 * configurationExport.ts 拉起的是面向用户的 "离线还原助手"，窗口必须可见。
 */
const INTENTIONAL_VISIBLE = [
  'routes/configurationExport.ts'
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.ts')) out.push(p)
  }
  return out
}

function balanced(text, openIdx) {
  let depth = 0
  let inStr = null
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) return text.slice(openIdx, i + 1) }
  }
  return text.slice(openIdx, openIdx + 400)
}

const rows = []

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)
  const intervals = []
  lines.forEach((l, i) => { if (/setInterval\s*\(/.test(l)) intervals.push(i + 1) })

  let m
  CALL_RE.lastIndex = 0
  while ((m = CALL_RE.exec(src)) !== null) {
    const before = src.slice(Math.max(0, m.index - 30), m.index)
    if (EXCLUDE_PREFIX_RE.test(before)) continue

    const openIdx = src.indexOf('(', m.index)
    const callText = balanced(src, openIdx)
    const line = src.slice(0, m.index).split('\n').length
    // 统一成正斜杠，避免 Windows 上 path.relative 返回反斜杠导致比对失败
    const rel = path.relative(ROOT, file).split(path.sep).join('/')

    let enclosing = ''
    for (let i = line - 1; i >= 0 && i > line - 160; i--) {
      const fm = /(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)|([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{|([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\()/.exec(lines[i])
      if (fm) { enclosing = fm[1] || fm[2] || fm[3] || ''; break }
    }

    rows.push({
      file: rel,
      line,
      fn: m[1],
      hasHide: /windowsHide/.test(callText),
      explicitFalse: /windowsHide\s*:\s*false/.test(callText),
      enclosing,
      periodic: intervals.some(x => x <= line && line - x < 250)
    })
  }
}

const intentional = rows.filter(r => r.explicitFalse && INTENTIONAL_VISIBLE.includes(r.file))
const missing = rows.filter(r => !r.hasHide)
const periodicMissing = missing.filter(r => r.periodic)

console.log(`子进程调用点总数 : ${rows.length}`)
console.log(`带 windowsHide   : ${rows.filter(r => r.hasHide).length}`)
console.log(`缺 windowsHide   : ${missing.length}`)
console.log(`有意可见（豁免） : ${intentional.length}`)

if (intentional.length) {
  console.log('\n有意显示窗口、不算问题的调用点：')
  for (const r of intentional) console.log(`  ${r.file}:${r.line}  ${r.fn}()  在 ${r.enclosing || '(顶层)'}`)
}

if (missing.length) {
  console.log('\n缺失 windowsHide 的调用点：')
  for (const r of missing) {
    console.log(`  ${r.periodic ? '[周期性!] ' : ''}${r.file}:${r.line}  ${r.fn}()  在 ${r.enclosing || '(顶层)'}`)
  }
}

if (periodicMissing.length) {
  console.log(`\n结论：有 ${periodicMissing.length} 处周期性调用会闪黑框，必须修。`)
  process.exit(1)
}

if (missing.length) {
  console.log('\n结论：没有周期性漏网，但存在按需触发的漏网点（不会定时闪，触发时才会弹窗）。')
  process.exit(1)
}

console.log('\n结论：全部调用点均已处理，不存在会闪黑框的漏网点。')
process.exit(0)
