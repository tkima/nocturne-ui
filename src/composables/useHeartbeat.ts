/**
 * Centralized Heartbeat Service
 * Manages named polling tasks with dedup, dynamic intervals, and pause/resume.
 * Singleton — all callers share the same instance.
 */

import { createLogger } from '@/utils/debug'

const log = createLogger('Heartbeat')

export interface HeartbeatTask {
  name: string
  fn: () => Promise<void> | void
  interval: number           // ms between runs
  enabled?: () => boolean    // optional condition to skip execution
}

interface RunningTask {
  task: HeartbeatTask
  timeoutId: ReturnType<typeof setTimeout> | null
  running: boolean           // true while fn() is in-flight
}

// Singleton state
const tasks = new Map<string, RunningTask>()
let paused = false

function scheduleNext(entry: RunningTask) {
  if (paused) return
  if (!tasks.has(entry.task.name)) return // unregistered while running

  entry.timeoutId = setTimeout(async () => {
    if (paused || !tasks.has(entry.task.name)) return

    // Check enabled condition
    if (entry.task.enabled && !entry.task.enabled()) {
      scheduleNext(entry)
      return
    }

    entry.running = true
    try {
      await entry.task.fn()
    } catch (e) {
      log.error(`Task "${entry.task.name}" error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      entry.running = false
      scheduleNext(entry)
    }
  }, entry.task.interval)
}

function stopTask(entry: RunningTask) {
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId)
    entry.timeoutId = null
  }
}

/**
 * Register or update a named polling task.
 * If a task with the same name already exists, it is replaced.
 */
function register(task: HeartbeatTask) {
  const existing = tasks.get(task.name)
  if (existing) {
    stopTask(existing)
    log.info(`Updated task "${task.name}" (${task.interval}ms)`)
  } else {
    log.info(`Registered task "${task.name}" (${task.interval}ms)`)
  }

  const entry: RunningTask = {
    task,
    timeoutId: null,
    running: false,
  }
  tasks.set(task.name, entry)

  if (!paused) {
    scheduleNext(entry)
  }
}

/**
 * Remove a named task. No-op if not registered.
 */
function unregister(name: string) {
  const entry = tasks.get(name)
  if (entry) {
    stopTask(entry)
    tasks.delete(name)
    log.info(`Unregistered task "${name}"`)
  }
}

/**
 * Pause all tasks (e.g. app backgrounded).
 */
function pause() {
  if (paused) return
  paused = true
  for (const entry of tasks.values()) {
    stopTask(entry)
  }
  log.info('All tasks paused')
}

/**
 * Resume all tasks after pause.
 */
function resume() {
  if (!paused) return
  paused = false
  for (const entry of tasks.values()) {
    scheduleNext(entry)
  }
  log.info('All tasks resumed')
}

/**
 * Get list of registered task names (for debugging).
 */
function getTaskNames(): string[] {
  return Array.from(tasks.keys())
}

export function useHeartbeat() {
  return {
    register,
    unregister,
    pause,
    resume,
    getTaskNames,
  }
}
