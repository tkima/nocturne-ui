// ============================================================
// Global Debug Utility - Reusable debug logging with overlay support
// ============================================================

import { ref } from 'vue'

// Check env variable directly - works at module load time
const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_ENABLED === 'true'

// Legacy function for backwards compatibility
export function initDebugFromSettings(_getter: () => boolean) {
  // No-op - we use env variable directly now
}

export interface DebugLogEntry {
  time: string
  category: string
  message: string
  type: 'info' | 'success' | 'error' | 'warn'
}

// Load persisted logs from localStorage on startup
function loadPersistedLogs(): DebugLogEntry[] {
  if (!DEBUG_ENABLED) return []
  try {
    const saved = localStorage.getItem('debug_logs')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch { /* ignore parse errors */ }
  return []
}

// Shared debug logs (accessible from debug overlay)
// Initialize with persisted logs so they survive browser restarts
export const debugLogs = ref<DebugLogEntry[]>(loadPersistedLogs())

// Category filter for overlay
export const debugCategory = ref<string | null>(null)

/**
 * Add a debug log entry
 * @param category - Category/source of the log (e.g., 'BT', 'Settings', 'Auth')
 * @param message - Log message
 * @param type - Log type for styling
 */
export function addDebugLog(
  category: string,
  message: string,
  type: DebugLogEntry['type'] = 'info'
) {
  // Skip entirely if debug is disabled - no overhead
  if (!DEBUG_ENABLED) return

  const now = new Date()
  const time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' +
    now.getMilliseconds().toString().padStart(3, '0')

  debugLogs.value.unshift({ time, category, message, type })

  // Keep max 1000 entries to allow debugging across multiple restarts
  if (debugLogs.value.length > 1000) {
    debugLogs.value.pop()
  }

  // Persist ALL logs to localStorage for debugging across restarts
  try {
    localStorage.setItem('debug_logs', JSON.stringify(debugLogs.value))
  } catch (e) {
    // If localStorage is full, trim older entries and retry
    if (debugLogs.value.length > 200) {
      debugLogs.value = debugLogs.value.slice(0, 200)
      try {
        localStorage.setItem('debug_logs', JSON.stringify(debugLogs.value))
      } catch { /* give up */ }
    }
  }
}

/**
 * Clear all debug logs
 */
export function clearDebugLogs() {
  debugLogs.value = []
  try {
    localStorage.removeItem('debug_logs')
  } catch { /* ignore */ }
}

/**
 * Create a scoped logger for a specific category.
 * Usage: const log = createLogger('MyCategory')
 *        log.info('message')
 */
export function createLogger(category: string) {
  return {
    info: (message: string) => addDebugLog(category, message, 'info'),
    success: (message: string) => addDebugLog(category, message, 'success'),
    warn: (message: string) => addDebugLog(category, message, 'warn'),
    error: (message: string) => addDebugLog(category, message, 'error'),
  }
}
