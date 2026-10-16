import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { freemem, totalmem, platform, loadavg } from 'node:os'
import { promisify } from 'node:util'
import { logger } from '../utils/logger'

const execFileAsync = promisify(execFile)
export const DEFAULT_STARTUP_TIMEOUT_MS = 180_000

// Fits inside the management page's five minute observation window.
export function resolveStartupTimeoutMs(environment: Record<string, string | undefined> = {}): number {
  const value = Number(environment.PORTAL_STARTUP_TIMEOUT_MS ?? process.env.PORTAL_STARTUP_TIMEOUT_MS)
  return Number.isFinite(value) && value >= 10_000 && value <= 240_000
    ? Math.round(value) : DEFAULT_STARTUP_TIMEOUT_MS
}

async function sampleResources(pid?: number): Promise<Record<string, unknown>> {
  const system = { freeMemoryBytes: freemem(), totalMemoryBytes: totalmem() }
  if (platform() !== 'win32' || !pid) return { ...system, loadAverage: loadavg() }
  // Sample only this launcher's descendants; omit command lines and environment.
  const script = `
$all = @(Get-CimInstance Win32_Process)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add(${pid})
do {
  $changed = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true }
  }
} while ($changed)
[pscustomobject]@{
  processes = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } |
    Select-Object ProcessId,ParentProcessId,WorkingSetSize,UserModeTime,KernelModeTime)
  cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor |
    Where-Object Name -eq '_Total' | Select-Object PercentProcessorTime
  memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory |
    Select-Object AvailableMBytes,PagesInputPersec,PagesOutputPersec
  disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk |
    Where-Object Name -eq '_Total' | Select-Object DiskReadBytesPersec,DiskWriteBytesPersec,PercentDiskTime
} | ConvertTo-Json -Depth 4 -Compress
`
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024
    })
    return { ...system, ...JSON.parse(stdout || '{}'), resourceSampleStatus: 'complete' }
  } catch {
    // Memory evidence remains useful when Windows counters are slow/unavailable.
    return { ...system, resourceSampleStatus: 'partial' }
  }
}

export class StartupDiagnostics {
  private readonly attemptId = randomUUID()
  private readonly startedAt = Date.now()
  private readonly phases = new Set<string>()
  private readonly timer: NodeJS.Timeout
  private stopped = false
  private sampling = false

  constructor(
    private readonly processId: string,
    private readonly pid?: number,
    private readonly sample = sampleResources
  ) {
    this.phase('spawn_requested')
    this.timer = setInterval(() => {
      if (Date.now() - this.startedAt >= 30_000) void this.sampleSlowStartup()
    }, 15_000)
    this.timer.unref()
  }

  phase(phase: string): void {
    if (this.stopped || this.phases.has(phase)) return
    this.phases.add(phase)
    logger.info('startup_phase', {
      attemptId: this.attemptId, processId: this.processId, pid: this.pid,
      phase, elapsedMs: Date.now() - this.startedAt
    })
  }

  output(message: string): void {
    this.phase('first_output')
    if (message.includes('Starting Nest application')) this.phase('nest_bootstrap')
    if (message.includes('Nest application successfully started')) this.phase('nest_ready')
  }

  finish(phase: string): void {
    this.phase(phase)
    this.stopped = true
    clearInterval(this.timer)
  }

  private async sampleSlowStartup(): Promise<void> {
    if (this.stopped || this.sampling) return
    this.sampling = true
    try {
      const resources = await this.sample(this.pid)
      if (!this.stopped) logger.info('startup_resources', {
        attemptId: this.attemptId, processId: this.processId,
        elapsedMs: Date.now() - this.startedAt, ...resources
      })
    } catch {
      if (!this.stopped) this.phase('resource_sample_unavailable')
    } finally {
      this.sampling = false
    }
  }
}
