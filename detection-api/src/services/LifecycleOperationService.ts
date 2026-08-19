import { randomUUID } from 'crypto'
import { logger } from '../utils/logger'

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
}

type LifecycleExecutor = () => Promise<unknown>

export class LifecycleOperationService {
  private readonly operations = new Map<string, LifecycleOperation>()
  private readonly activeOperationByApp = new Map<string, string>()
  private readonly latestOperationByApp = new Map<string, string>()
  private readonly maxRetainedOperations = 500

  enqueue(
    appId: string,
    action: LifecycleOperationAction,
    executor: LifecycleExecutor
  ): { operation: LifecycleOperation; reused: boolean } {
    const activeOperation = this.getActiveForApp(appId)
    if (activeOperation) {
      return { operation: activeOperation, reused: true }
    }

    const operation: LifecycleOperation = {
      id: randomUUID(),
      appId,
      action,
      status: 'queued',
      requestedAt: new Date().toISOString()
    }

    this.operations.set(operation.id, operation)
    this.activeOperationByApp.set(appId, operation.id)
    this.latestOperationByApp.set(appId, operation.id)
    this.pruneCompletedOperations()

    queueMicrotask(() => {
      void this.execute(operation.id, executor)
    })

    return { operation: this.snapshot(operation), reused: false }
  }

  get(operationId: string): LifecycleOperation | null {
    const operation = this.operations.get(operationId)
    return operation ? this.snapshot(operation) : null
  }

  getLatestForApp(appId: string): LifecycleOperation | null {
    const operationId = this.latestOperationByApp.get(appId)
    return operationId ? this.get(operationId) : null
  }

  getActiveForApp(appId: string): LifecycleOperation | null {
    const operationId = this.activeOperationByApp.get(appId)
    if (!operationId) {
      return null
    }

    const operation = this.operations.get(operationId)
    if (!operation || !this.isPending(operation.status)) {
      this.activeOperationByApp.delete(appId)
      return null
    }

    return this.snapshot(operation)
  }

  private async execute(operationId: string, executor: LifecycleExecutor): Promise<void> {
    const operation = this.operations.get(operationId)
    if (!operation) {
      return
    }

    const startedAt = Date.now()
    operation.status = 'running'
    operation.startedAt = new Date(startedAt).toISOString()

    logger.info('Lifecycle operation started', {
      operationId: operation.id,
      appId: operation.appId,
      action: operation.action
    })

    try {
      operation.result = await executor()
      operation.status = 'succeeded'
    } catch (error) {
      operation.status = 'failed'
      operation.error = this.serializeError(error)
      logger.error('Lifecycle operation failed', {
        operationId: operation.id,
        appId: operation.appId,
        action: operation.action,
        error: operation.error
      })
    } finally {
      const completedAt = Date.now()
      operation.completedAt = new Date(completedAt).toISOString()
      operation.durationMs = completedAt - startedAt

      if (this.activeOperationByApp.get(operation.appId) === operation.id) {
        this.activeOperationByApp.delete(operation.appId)
      }

      logger.info('Lifecycle operation completed', {
        operationId: operation.id,
        appId: operation.appId,
        action: operation.action,
        status: operation.status,
        durationMs: operation.durationMs
      })
    }
  }

  private isPending(status: LifecycleOperationStatus): boolean {
    return status === 'queued' || status === 'running'
  }

  private serializeError(error: unknown): LifecycleOperationError {
    if (error instanceof Error) {
      const typedError = error as Error & { code?: string; context?: unknown; details?: unknown }
      return {
        code: typedError.code,
        message: typedError.message,
        details: typedError.context ?? typedError.details
      }
    }

    return { message: String(error) }
  }

  private snapshot(operation: LifecycleOperation): LifecycleOperation {
    return {
      ...operation,
      error: operation.error ? { ...operation.error } : undefined
    }
  }

  private pruneCompletedOperations(): void {
    if (this.operations.size <= this.maxRetainedOperations) {
      return
    }

    const completed = Array.from(this.operations.values())
      .filter(operation => !this.isPending(operation.status))
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))

    for (const operation of completed) {
      if (this.operations.size <= this.maxRetainedOperations) {
        break
      }

      this.operations.delete(operation.id)
      if (this.latestOperationByApp.get(operation.appId) === operation.id) {
        this.latestOperationByApp.delete(operation.appId)
      }
    }
  }
}
