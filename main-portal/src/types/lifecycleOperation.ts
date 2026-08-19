export type LifecycleOperationAction = 'start'
export type LifecycleOperationStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface LifecycleOperationError {
  code?: string
  message: string
  details?: unknown
}

export interface LifecycleOperation {
  id: string
  appId: string
  action: LifecycleOperationAction
  status: LifecycleOperationStatus
  requestedAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  result?: unknown
  error?: LifecycleOperationError
  reused?: boolean
}

export interface LifecyclePollingOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  onUpdate?: (operation: LifecycleOperation) => void
  onTransientError?: (error: unknown) => void
  signal?: AbortSignal
  now?: () => number
  wait?: (delayMs: number) => Promise<void>
}

export class LifecycleOperationTimeoutError extends Error {
  readonly code = 'LIFECYCLE_OPERATION_TIMEOUT'
  readonly operationId: string

  constructor(operationId: string) {
    super('应用仍在启动，暂未获得最终结果')
    this.name = 'LifecycleOperationTimeoutError'
    this.operationId = operationId
  }
}

export const isLifecycleOperationPending = (operation?: LifecycleOperation | null): boolean => (
  operation?.status === 'queued' || operation?.status === 'running'
)

export async function pollLifecycleOperation(
  initialOperation: LifecycleOperation,
  fetchOperation: (operationId: string) => Promise<LifecycleOperation>,
  options: LifecyclePollingOptions = {}
): Promise<LifecycleOperation> {
  const timeoutMs = options.timeoutMs ?? 150_000
  const pollIntervalMs = options.pollIntervalMs ?? 1_000
  const now = options.now ?? Date.now
  const wait = options.wait ?? ((delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs)))
  const deadline = now() + timeoutMs
  let operation = initialOperation

  options.onUpdate?.(operation)

  while (isLifecycleOperationPending(operation)) {
    if (options.signal?.aborted) {
      throw new DOMException('Lifecycle operation polling was aborted', 'AbortError')
    }

    if (now() >= deadline) {
      throw new LifecycleOperationTimeoutError(operation.id)
    }

    await wait(pollIntervalMs)

    if (options.signal?.aborted) {
      throw new DOMException('Lifecycle operation polling was aborted', 'AbortError')
    }

    try {
      operation = await fetchOperation(operation.id)
      options.onUpdate?.(operation)
    } catch (error) {
      options.onTransientError?.(error)
    }
  }

  return operation
}
