import { ref } from 'vue'
import { useBluetoothTrigger } from '@/composables/useBluetoothTrigger'
import { useHeartbeat } from '@/composables/useHeartbeat'
import { startBoot } from '@/boot'

// ============================================================
// Network Connectivity Composable (Singleton)
// State is shared, boot system (NetworkComponent) handles init
// ============================================================

const NETWORK_CHECK_BYPASS_KEY = 'networkCheckBypass'
const POLL_INTERVAL = 3000

// Singleton state - shared across all components
const isConnected = ref<boolean | null>(null)
const initialCheckDone = ref(false)
const hasEverConnectedThisSession = ref(false)
const isChecking = ref(false)

let listenersRegistered = false

// Check if bypass is enabled
const isBypassed = typeof localStorage !== 'undefined' &&
  localStorage.getItem(NETWORK_CHECK_BYPASS_KEY) === 'true'

export function useNetwork() {
  const heartbeat = useHeartbeat()

  // Perform network connectivity check
  async function checkConnectivity(): Promise<boolean> {
    if (isBypassed) {
      return true
    }

    if (!navigator.onLine) {
      return false
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('https://api.spotify.com/', {
        method: 'HEAD',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      return response.ok || response.status === 401 || response.status === 403
    } catch {
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

    if (connected && !wasConnected) {
      window.dispatchEvent(new Event('networkRestored'))
      const { onInternetConnected } = useBluetoothTrigger()
      onInternetConnected()

      // Re-run Phase 2 to validate auth
      startBoot('connect')
    }
  }

  // Perform a check and update status
  async function performCheck() {
    if (isChecking.value) return
    isChecking.value = true

    try {
      const connected = await checkConnectivity()
      updateConnectionStatus(connected)

      if (!initialCheckDone.value) {
        initialCheckDone.value = true
      }

      if (connected) {
        stopPolling()
      } else {
        startPolling()
      }
    } finally {
      isChecking.value = false
    }
  }

  function startPolling() {
    heartbeat.register({
      name: 'network-check',
      interval: POLL_INTERVAL,
      fn: performCheck,
    })
  }

  function stopPolling() {
    heartbeat.unregister('network-check')
  }

  // Event handlers for browser online/offline events
  async function handleOnline() {
    await performCheck()
  }

  function handleOffline() {
    updateConnectionStatus(false)
    startPolling()
  }

  // Register event listeners (called by boot system)
  function registerListeners() {
    if (listenersRegistered) return
    listenersRegistered = true
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  return {
    isConnected,
    initialCheckDone,
    hasEverConnectedThisSession,
    isChecking,
    checkConnectivity,
    refresh: performCheck,
    registerListeners,
  }
}
