import { ref, onUnmounted } from 'vue'
import { useBluetoothTrigger } from '@/composables/useBluetoothTrigger'
import { registerNetworkInit } from '@/utils/startup'

// ============================================================
// Network Connectivity Composable (Singleton)
// Checks if device has internet connectivity
// Polls every 3 seconds when not connected
// State is shared across all components
// ============================================================

const NETWORK_CHECK_BYPASS_KEY = 'networkCheckBypass'
const POLL_INTERVAL = 3000 // Poll every 3 seconds when not connected

// Singleton state - shared across all components
const isConnected = ref<boolean | null>(null)
const initialCheckDone = ref(false)
const hasEverConnectedThisSession = ref(false)
const isChecking = ref(false)

let pollIntervalId: ReturnType<typeof setInterval> | null = null
let initialized = false
let mountCount = 0

// Check if bypass is enabled
const isBypassed = typeof localStorage !== 'undefined' &&
  localStorage.getItem(NETWORK_CHECK_BYPASS_KEY) === 'true'

export function useNetwork() {

  // Perform network connectivity check
  async function checkConnectivity(): Promise<boolean> {
    if (isBypassed) {
      return true
    }

    // First check browser's online status
    if (!navigator.onLine) {
      return false
    }

    try {
      // Try to reach Spotify's API (the actual service we need)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('https://api.spotify.com/', {
        method: 'HEAD',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      // Any response means we can reach Spotify
      return response.ok || response.status === 401 || response.status === 403
    } catch {
      // Fallback: try accounts.spotify.com
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        await fetch('https://accounts.spotify.com/', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        return true
      } catch {
        return false
      }
    }
  }

  // Update connection status
  function updateConnectionStatus(connected: boolean) {
    const wasConnected = isConnected.value
    isConnected.value = connected

    if (connected && !hasEverConnectedThisSession.value) {
      hasEverConnectedThisSession.value = true
    }

    // Dispatch events for other components
    if (connected && !wasConnected) {
      window.dispatchEvent(new Event('networkRestored'))
      // Notify fast polling trigger
      const { onInternetConnected } = useBluetoothTrigger()
      onInternetConnected()
    }
  }

  // Perform a check and update status
  async function performCheck() {
    if (isChecking.value) return
    isChecking.value = true

    try {
      const connected = await checkConnectivity()
      updateConnectionStatus(connected)

      // Mark initial check done if not already (for manual refresh calls)
      if (!initialCheckDone.value) {
        initialCheckDone.value = true
      }

      // If connected, stop polling. If not connected, keep polling.
      if (connected) {
        stopPolling()
      } else if (!pollIntervalId) {
        startPolling()
      }
    } finally {
      isChecking.value = false
    }
  }

  // Start polling for connectivity
  function startPolling() {
    if (pollIntervalId) return
    pollIntervalId = setInterval(performCheck, POLL_INTERVAL)
  }

  // Stop polling
  function stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId)
      pollIntervalId = null
    }
  }

  // Initial check
  async function performInitialCheck() {
    if (isBypassed) {
      isConnected.value = true
      hasEverConnectedThisSession.value = true
      initialCheckDone.value = true
      return
    }

    const connected = await checkConnectivity()
    updateConnectionStatus(connected)
    initialCheckDone.value = true

    // Start polling if not connected
    if (!connected) {
      startPolling()
    }
  }

  // Event handlers
  async function handleOnline() {
    // Browser says online, verify with actual check
    await performCheck()
  }

  function handleOffline() {
    updateConnectionStatus(false)
    startPolling()
  }

  // Register with centralized startup
  if (!initialized) {
    initialized = true
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Register init function - will be called by startup.ts
    registerNetworkInit(() => {
      performInitialCheck()
    })
  }

  onUnmounted(() => {
    mountCount--

    // Only cleanup when all components using this composable are unmounted
    if (mountCount === 0) {
      stopPolling()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      initialized = false
    }
  })

  return {
    isConnected,
    initialCheckDone,
    hasEverConnectedThisSession,
    isChecking,
    checkConnectivity,
    refresh: performCheck
  }
}
