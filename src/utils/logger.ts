/**
 * Centralized logging utility
 * - Logs to console in development
 * - Persists to localStorage for debugging
 * - Auto-cleanup when logs exceed size limit
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: unknown
}

const STORAGE_KEY = 'nocturne_logs'
const logs: LogEntry[] = []

// Auto-cleanup settings
const MAX_LOG_SIZE_BYTES = 500 * 1024 // 500KB
const CLEANUP_KEEP_RATIO = 0.5 // Keep 50% of logs after cleanup
let estimatedSize = 0

// Load existing logs from localStorage on init
function loadFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as LogEntry[]
      logs.push(...parsed)
      // Recalculate size
      estimatedSize = 0
      for (const entry of logs) {
        estimatedSize += estimateEntrySize(entry)
      }
    }
  } catch {
    // Ignore parse errors
  }
}

// Save logs to localStorage (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null
function saveToStorage(): void {
  if (typeof window === 'undefined') return
  // Debounce saves to avoid excessive writes
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
    } catch {
      // localStorage full - clear old logs
      logs.splice(0, Math.floor(logs.length / 2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
      } catch {
        // Give up
      }
    }
  }, 1000)
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function createLogEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    timestamp: formatTimestamp(),
    level,
    message,
    data,
  }
}

function estimateEntrySize(entry: LogEntry): number {
  // Rough estimate: timestamp + level + message + JSON size of data
  const dataSize = entry.data ? JSON.stringify(entry.data).length : 0
  return entry.timestamp.length + entry.level.length + entry.message.length + dataSize + 50 // overhead
}

function cleanupIfNeeded(): void {
  if (estimatedSize > MAX_LOG_SIZE_BYTES) {
    // Keep only the most recent logs (last 50%)
    const keepCount = Math.floor(logs.length * CLEANUP_KEEP_RATIO)
    const removed = logs.splice(0, logs.length - keepCount)

    // Recalculate size
    estimatedSize = 0
    for (const entry of logs) {
      estimatedSize += estimateEntrySize(entry)
    }

    console.log(`%c[LOGGER] Auto-cleanup: removed ${removed.length} old log entries, kept ${logs.length}`, 'color: #9C27B0')
  }
}

function writeLog(entry: LogEntry): void {
  const entrySize = estimateEntrySize(entry)
  estimatedSize += entrySize
  logs.push(entry)

  // Auto-cleanup if size exceeds limit
  cleanupIfNeeded()

  // Save to localStorage
  saveToStorage()

  // Console output with color coding
  const styles: Record<LogLevel, string> = {
    debug: 'color: #888',
    info: 'color: #2196F3',
    warn: 'color: #FF9800',
    error: 'color: #F44336',
  }

  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`

  if (entry.data !== undefined) {
    console.log(`%c${prefix} ${entry.message}`, styles[entry.level], entry.data)
  } else {
    console.log(`%c${prefix} ${entry.message}`, styles[entry.level])
  }
}

export const logger = {
  debug(message: string, data?: unknown): void {
    writeLog(createLogEntry('debug', message, data))
  },

  info(message: string, data?: unknown): void {
    writeLog(createLogEntry('info', message, data))
  },

  warn(message: string, data?: unknown): void {
    writeLog(createLogEntry('warn', message, data))
  },

  error(message: string, data?: unknown): void {
    writeLog(createLogEntry('error', message, data))
  },

  /**
   * Get all logs (useful for debugging or exporting)
   */
  getLogs(): LogEntry[] {
    return [...logs]
  },

  /**
   * Clear all stored logs (memory and localStorage)
   */
  clearLogs(): void {
    logs.length = 0
    estimatedSize = 0
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(logs, null, 2)
  },

  /**
   * Get estimated log size in bytes
   */
  getSize(): { bytes: number; kb: number; entries: number } {
    return {
      bytes: estimatedSize,
      kb: Math.round(estimatedSize / 1024),
      entries: logs.length,
    }
  },

  /**
   * Get last N logs (for quick debugging)
   */
  last(n = 30): LogEntry[] {
    return logs.slice(-n)
  },
}

// Initialize: load from localStorage and expose globally
if (typeof window !== 'undefined') {
  loadFromStorage()
  ;(window as unknown as { logger: typeof logger }).logger = logger
}
