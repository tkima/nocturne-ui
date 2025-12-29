import { ref } from 'vue'
import { logger } from '@/utils/logger'

/**
 * Composable for handling button actions with:
 * - Automatic logging (press, complete, error)
 * - Throttling to prevent rapid clicks
 * - Error handling with optional retry
 * - Loading state tracking
 */

interface ButtonActionOptions {
  /** Minimum time between button presses in ms (default: 500) */
  throttleMs?: number
  /** Whether to allow retry on error (default: true) */
  allowRetry?: boolean
  /** Max retry attempts (default: 2) */
  maxRetries?: number
}

interface ButtonActionReturn {
  /** Whether the action is currently executing */
  isLoading: boolean
  /** Last error message, if any */
  error: string | null
  /** Execute the action */
  execute: () => Promise<void>
  /** Retry the last failed action */
  retry: () => Promise<void>
}

// Global throttle tracking per button name
const lastActionTimes = new Map<string, number>()
// Track buttons currently executing (to prevent concurrent calls)
const executingButtons = new Set<string>()

export function useButtonAction(
  name: string,
  action: () => Promise<void>,
  options: ButtonActionOptions = {}
): ButtonActionReturn {
  const {
    throttleMs = 500,
    allowRetry = true,
    maxRetries = 2
  } = options

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let retryCount = 0

  async function execute(): Promise<void> {
    const now = Date.now()
    const lastTime = lastActionTimes.get(name) || 0
    const timeSinceLastAction = now - lastTime

    // Log button press
    logger.info(`BUTTON PRESS: ${name}`, {
      timestamp: now,
      timeSinceLastAction,
      throttleMs
    })

    // Check throttle
    if (timeSinceLastAction < throttleMs) {
      logger.info(`BUTTON THROTTLED: ${name}`, {
        timeSinceLastAction,
        throttleMs
      })
      return
    }

    // Update last action time
    lastActionTimes.set(name, now)

    // Clear previous error
    error.value = null
    isLoading.value = true

    try {
      await action()
      retryCount = 0 // Reset retry count on success
      logger.info(`BUTTON COMPLETE: ${name}`, {
        timestamp: Date.now(),
        duration: Date.now() - now
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      error.value = errorMessage
      logger.error(`BUTTON ERROR: ${name}`, {
        error: errorMessage,
        timestamp: Date.now(),
        retryCount
      })

      // Auto-retry if enabled and under max retries
      if (allowRetry && retryCount < maxRetries) {
        retryCount++
        logger.info(`BUTTON RETRY: ${name}`, { attempt: retryCount, maxRetries })
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500))
        await execute()
      }
    } finally {
      isLoading.value = false
    }
  }

  async function retry(): Promise<void> {
    retryCount = 0
    await execute()
  }

  return {
    isLoading: isLoading.value,
    error: error.value,
    execute,
    retry
  }
}

/**
 * Create a simple click handler with logging and throttling
 * Use this for quick inline handlers
 */
export function createButtonHandler(
  name: string,
  action: () => Promise<void>,
  throttleMs = 500
): () => Promise<void> {
  const handler = async () => {
    const now = Date.now()
    const lastTime = lastActionTimes.get(name) || 0

    // Block if already executing
    if (executingButtons.has(name)) return

    // Block if within throttle window
    if (now - lastTime < throttleMs) return

    // Lock immediately before any async work
    executingButtons.add(name)
    lastActionTimes.set(name, now)

    try {
      await action()
    } catch (err) {
      logger.error(`Button error: ${name}`, { error: err instanceof Error ? err.message : 'Unknown' })
    } finally {
      setTimeout(() => executingButtons.delete(name), throttleMs)
    }
  }
  return handler
}
