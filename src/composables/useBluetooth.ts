import { ref, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useSettings } from '@/composables/useSettings'
import { createLogger } from '@/utils/debug'
import { useBluetoothTrigger } from '@/composables/useBluetoothTrigger'
import { registerBluetoothInit, registerPresenceInit } from '@/utils/startup'

// Check if Bluetooth is enabled via environment variable
const BLUETOOTH_ENABLED = import.meta.env.VITE_BLUETOOTH_ENABLED !== 'false'

const log = createLogger('BT')

export interface BluetoothDevice {
  address: string
  name: string
  alias?: string
  connected: boolean
  paired: boolean
}

export interface PairingRequest {
  address: string
  name: string
  pairingKey: string
}

// Script path for bt-connect.sh (deployed to /etc/nocturne/ui/)
const BT_CONNECT_SCRIPT = '/etc/nocturne/ui/bt-connect.sh'

// ============================================================
// SINGLETON STATE - shared across all components
// ============================================================
const devices = ref<BluetoothDevice[]>([])
const isLoading = ref(false)
const isConnecting = ref(false)
const error = ref<string | null>(null)
const discoveryActive = ref(false)
const reconnectAttempt = ref(0) // Kept for API compat
const isReconnecting = ref(false)
const shouldShowNetworkScreen = ref(false)
const pairingRequest = ref<PairingRequest | null>(null)
const wsConnected = ref(false)

// Internal singleton state
let ws: WebSocket | null = null
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
let reconnectLoopRunning = false
let initStarted = false  // Singleton init flag
let presenceCheckInterval: ReturnType<typeof setInterval> | null = null
let devicePresent = false  // Track if saved device is nearby

export function useBluetooth() {
  const config = useConfigStore()
  const { get: getSetting, set: setSetting, loadSettings } = useSettings()
  const { setBtPresent } = useBluetoothTrigger()

  // ============================================================
  // CORE API FUNCTIONS
  // ============================================================

  async function fetchDevices(): Promise<BluetoothDevice[]> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/devices`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      if (!response.ok) throw new Error('Failed to fetch devices')
      const data: BluetoothDevice[] = await response.json()
      devices.value = data
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch devices'
      return []
    }
  }

  async function startDiscovery(): Promise<boolean> {
    if (discoveryActive.value) return true
    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/discover/on`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to start discovery')
      discoveryActive.value = true
      return true
    } catch {
      return false
    }
  }

  async function stopDiscovery(): Promise<void> {
    if (!discoveryActive.value) return
    try {
      await fetch(`${config.nocturnedUrl}/bluetooth/discover/off`, { method: 'POST' })
      discoveryActive.value = false
    } catch { /* ignore */ }
  }

  // ============================================================
  // SIMPLE RECONNECT FLOW
  // ============================================================

  /**
   * Try to connect to saved device once.
   * Presence detection loop handles retries.
   */
  async function reconnect(): Promise<boolean> {
    const savedAddress = getSetting('lastBluetoothDevice')
    if (!savedAddress) {
      log.warn('No saved device')
      return false
    }
    log.info(`Connecting to ${savedAddress.slice(-8)}...`)

    // Check if already connected
    const deviceList = await fetchDevices()
    if (deviceList.some(d => d.address === savedAddress && d.connected)) {
      log.success('Already connected')
      return true
    }

    // Try to connect using bt-connect.sh
    isConnecting.value = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

      // Use bt-connect.sh script which deletes NAP profile before connecting
      const response = await fetch(`${config.nocturnedUrl}/device/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [`${BT_CONNECT_SCRIPT} ${savedAddress}`]
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        log.error(`Script call failed: HTTP ${response.status}`)
        isConnecting.value = false
        return false
      }

      const result = await response.json()
      const cmdResult = result.results?.[0]

      if (cmdResult?.exit_code === 0) {
        log.success('Connected!')
        isConnecting.value = false
        await fetchDevices()
        return true
      }

      // Script failed, check if connected anyway
      log.warn(`Script exit ${cmdResult?.exit_code}, verifying...`)
      isConnecting.value = false
      const deviceList = await fetchDevices()
      const isConnected = deviceList.some(d => d.address === savedAddress && d.connected)
      if (isConnected) {
        log.success('Verified: BT is connected!')
        return true
      }

      log.error(`Connect failed: ${cmdResult?.output || 'unknown'}`)
      return false

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error(`Connect error: ${msg}`)
      isConnecting.value = false
      return false
    }
  }

  /**
   * Attempt reconnect once. Presence loop handles retries.
   */
  async function startReconnectLoop(): Promise<void> {
    if (reconnectLoopRunning) return

    reconnectLoopRunning = true
    isReconnecting.value = true

    const success = await reconnect()
    if (success) {
      devicePresent = true
      setBtPresent(true)
    }

    reconnectLoopRunning = false
    isReconnecting.value = false
  }

  function stopReconnecting() {
    isReconnecting.value = false
  }

  // ============================================================
  // PRESENCE DETECTION - Lightweight polling to detect device nearby
  // ============================================================

  /**
   * Check if saved device is in discovery list (nearby)
   * Returns true if device found, false otherwise
   */
  async function checkPresence(): Promise<boolean> {
    const savedAddress = getSetting('lastBluetoothDevice')
    if (!savedAddress) return false

    const deviceList = await fetchDevices()
    return deviceList.some(d => d.address === savedAddress)
  }

  /**
   * Start presence detection loop
   * - Check every 2s when device not present
   * - Check every 5min when device is present
   */
  function startPresenceLoop() {
    if (presenceCheckInterval) return // Already running

    log.info('Starting presence detection')

    const runCheck = async () => {
      const found = await checkPresence()

      if (found && !devicePresent) {
        // Device just appeared - trigger reconnect
        log.success('Device appeared - triggering reconnect')
        devicePresent = true
        setBtPresent(true)
        startReconnectLoop()
      } else if (!found && devicePresent) {
        // Device disappeared
        log.warn('Device gone')
        devicePresent = false
        setBtPresent(false)
      }

      // Schedule next check: 3s if not present, 5min if present
      const nextDelay = devicePresent ? 300000 : 3000
      presenceCheckInterval = setTimeout(runCheck, nextDelay)
    }

    // Start first check after 5min (give initial reconnect time to work)
    presenceCheckInterval = setTimeout(runCheck, 300000)
  }

  function _stopPresenceLoop() {
    if (presenceCheckInterval) {
      clearTimeout(presenceCheckInterval)
      presenceCheckInterval = null
    }
  }
  // Keep reference to avoid unused warning
  void _stopPresenceLoop

  // ============================================================
  // DEVICE ACTIONS
  // ============================================================

  async function connectDevice(address: string): Promise<boolean> {
    log.info(`Manual connect to ${address.slice(-8)}`)
    isConnecting.value = true
    error.value = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

      // Use bt-connect.sh script which deletes NAP profile before connecting
      const response = await fetch(`${config.nocturnedUrl}/device/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [`${BT_CONNECT_SCRIPT} ${address}`]
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      const cmdResult = result.results?.[0]

      if (cmdResult?.exit_code === 0) {
        log.success('Connected!')
        await setSetting('lastBluetoothDevice', address)
        await fetchDevices()
        return true
      }

      // Script failed, check if connected anyway
      log.warn(`Script exit ${cmdResult?.exit_code}, verifying...`)
      const deviceList = await fetchDevices()
      const isConnected = deviceList.some(d => d.address === address && d.connected)
      if (isConnected) {
        log.success('Verified: BT is connected!')
        await setSetting('lastBluetoothDevice', address)
        return true
      }

      error.value = 'Connection failed'
      log.error(`Connect failed: ${cmdResult?.output || 'unknown'}`)
      return false

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed'
      log.error(`Connect failed: ${msg}`)
      error.value = msg
      return false
    } finally {
      isConnecting.value = false
    }
  }

  async function disconnectDevice(address: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/disconnect/${address}`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to disconnect')
      await setSetting('lastBluetoothDevice', null)
      await fetchDevices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Disconnect failed'
      return false
    }
  }

  async function forgetDevice(address: string): Promise<boolean> {
    isLoading.value = true
    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/remove/${address}`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to remove device')
      if (getSetting('lastBluetoothDevice') === address) {
        await setSetting('lastBluetoothDevice', null)
      }
      await fetchDevices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to remove device'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ============================================================
  // PAIRING
  // ============================================================

  async function acceptPairing(): Promise<boolean> {
    if (!pairingRequest.value) return false
    try {
      isConnecting.value = true
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/pairing/accept`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to accept pairing')
      pairingRequest.value = null
      await fetchDevices()
      return true
    } catch {
      pairingRequest.value = null
      return false
    } finally {
      isConnecting.value = false
    }
  }

  async function denyPairing(): Promise<boolean> {
    if (!pairingRequest.value) return false
    try {
      await fetch(`${config.nocturnedUrl}/bluetooth/pairing/deny`, { method: 'POST' })
      pairingRequest.value = null
      return true
    } catch {
      pairingRequest.value = null
      return false
    }
  }

  // ============================================================
  // WEBSOCKET - Just for pairing events, not for reconnect logic
  // ============================================================

  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return

    // Clear any pending reconnect
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout)
      wsReconnectTimeout = null
    }

    try {
      const wsUrl = config.nocturnedUrl.replace('http', 'ws') + '/ws'
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        wsConnected.value = true
        log.success('WebSocket connected')
      }

      ws.onclose = () => {
        wsConnected.value = false
        log.warn('WebSocket disconnected')
        wsReconnectTimeout = setTimeout(connectWebSocket, 3000)
      }

      ws.onerror = () => {
        log.error('WebSocket error')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWsMessage(data)
        } catch { /* ignore */ }
      }
    } catch {
      wsReconnectTimeout = setTimeout(connectWebSocket, 3000)
    }
  }

  function handleWsMessage(data: { type: string; payload?: unknown }) {
    const payload = data.payload as { address?: string; device?: { address: string; name?: string } } | undefined

    // Normalize event type (handle both / and \\ separators)
    const eventType = data.type.replace(/\\\\/g, '/').replace(/\\/g, '/')
    log.info(`WS: ${eventType}`)

    switch (eventType) {
      case 'bluetooth/pairing':
        log.warn(`Pairing request: ${(data.payload as PairingRequest)?.name}`)
        pairingRequest.value = data.payload as PairingRequest
        break

      case 'bluetooth/paired':
        log.success(`Paired: ${payload?.device?.name || payload?.device?.address}`)
        pairingRequest.value = null
        if (payload?.device?.address) {
          setSetting('lastBluetoothDevice', payload.device.address)
        }
        fetchDevices()
        break

      case 'bluetooth/connect':
        log.success(`Device connected: ${payload?.address?.slice(-8) || '?'}`)
        devicePresent = true
        if (payload?.address) {
          setSetting('lastBluetoothDevice', payload.address)
        }
        fetchDevices()
        break

      case 'bluetooth/disconnect':
      case 'bluetooth/disconnected':
        log.warn(`Device disconnected: ${payload?.address?.slice(-8) || '?'}`)
        // Don't auto-reconnect from WS events - let user trigger manually or on next boot
        fetchDevices()
        break

      case 'bluetooth/network/disconnect':
        // NAP disconnected - ignore, we don't use Personal Hotspot
        log.info('NAP disconnected (ignored)')
        break
    }
  }

  // ============================================================
  // INITIALIZATION (on-demand for network screen)
  // ============================================================

  async function initOnDemand() {
    log.info('On-demand init (network screen)')
    connectWebSocket()
    await startDiscovery()
    await fetchDevices()
  }

  // ============================================================
  // LIFECYCLE - Register with centralized startup
  // ============================================================

  if (BLUETOOTH_ENABLED && !initStarted) {
    initStarted = true

    // Register init functions - will be called by startup.ts
    registerBluetoothInit(() => {
      log.info('Initializing Bluetooth...')
      loadSettings()
      connectWebSocket()
      fetchDevices()
    })

    registerPresenceInit(() => {
      log.info('Starting presence detection...')
      // Try initial reconnect, then start presence loop
      const savedDevice = getSetting('lastBluetoothDevice')
      if (savedDevice) {
        startReconnectLoop()
        startPresenceLoop()
      }
    })
  }

  onUnmounted(() => {
    // Note: We don't cleanup on unmount since state is singleton
  })

  // ============================================================
  // EXPORTS
  // ============================================================

  return {
    // State
    devices,
    isLoading,
    isConnecting,
    error,
    discoveryActive,
    reconnectAttempt,
    isReconnecting,
    shouldShowNetworkScreen,
    pairingRequest,
    wsConnected,

    // Actions
    fetchDevices,
    startDiscovery,
    stopDiscovery,
    connectDevice,
    disconnectDevice,
    forgetDevice,
    acceptPairing,
    denyPairing,

    // Reconnect
    reconnect,
    attemptReconnect: startReconnectLoop, // Alias for compatibility
    stopReconnecting,

    // Init
    initOnDemand,
    refresh: fetchDevices,

    // Legacy compatibility (unused but exported)
    startNetworkPolling: () => {},
    stopNetworkPolling: () => {},
  }
}
