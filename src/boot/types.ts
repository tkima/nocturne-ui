/**
 * Boot System Types
 * Unified interface for all boot components
 */

import type { Ref, ComputedRef } from 'vue'

export type BootComponentName = 'settings' | 'auth' | 'network' | 'bluetooth'
export type BootStatus = 'idle' | 'starting' | 'ready' | 'error' | 'reconnecting'

/**
 * Unified interface for all boot components.
 * Each component manages its own isolated state with reactive refs.
 */
export interface BootComponent {
  readonly name: BootComponentName
  readonly status: Ref<BootStatus>
  readonly error: Ref<string | null>
  readonly isReady: ComputedRef<boolean>

  /** One-time setup (register listeners, etc) */
  startup(): Promise<void>

  /** Initialize/load data, returns success */
  init(): Promise<boolean>

  /** Optional: attempt reconnection */
  reconnect?(): Promise<boolean>

  /** Optional: start polling loop (legacy — prefer useHeartbeat) */
  startPolling?(): void

  /** Optional: stop polling loop (legacy — prefer useHeartbeat) */
  stopPolling?(): void
}

/**
 * Helper: sleep for ms milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Helper: loop until checkFn returns true
 * Used by Network and Bluetooth to wait for real status
 */
export async function waitUntilReady(
  checkFn: () => Promise<boolean>,
  intervalMs: number = 1000
): Promise<void> {
  while (true) {
    const ready = await checkFn()
    if (ready) break
    await sleep(intervalMs)
  }
}

/**
 * Helper: exponential backoff delay
 * 3s → 6s → 12s → 24s → max 60s
 */
export function getBackoffDelay(attempt: number): number {
  return Math.min(3000 * Math.pow(2, attempt), 60000)
}
