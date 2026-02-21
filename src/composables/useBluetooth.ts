import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useSettings } from '@/composables/useSettings'
import { createLogger } from '@/utils/debug'
import { useBluetoothTrigger } from '@/composables/useBluetoothTrigger'

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

export function useBluetooth() {
  const config = useConfigStore()
  const { get: getSetting, set: setSetting } = useSettings()
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
  // RECONNECT
  // ============================================================

  async function reconnect(): Promise<boolean> {
    const savedAddress = getSetting('lastBluetoothDevice')
    if (!savedAddress) {
      log.warn('No saved device')
      return false
    }
    log.info(`Connecting to ${savedAddress.slice(-8)}...`)

    const deviceList = await fetchDevices()
    if (deviceList.some(d => d.address === savedAddress && d.connected)) {
      log.success('Already connected')
      return true
    }

    isConnecting.value = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

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

      log.warn(`Script exit ${cmdResult?.exit_code}, verifying...`)
      isConnecting.value = false
      const verifyList = await fetchDevices()
      const isConnected = verifyList.some(d => d.address === savedAddress && d.connected)
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

  async function startReconnectLoop(): Promise<void> {
    if (reconnectLoopRunning) return

    reconnectLoopRunning = true
    isReconnecting.value = true

    const success = await reconnect()
    if (success) {
      setBtPresent(true)
    }

    reconnectLoopRunning = false
    isReconnecting.value = false
  }

  function stopReconnecting() {
    isReconnecting.value = false
  }

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
  // WEBSOCKET - For pairing events
  // ============================================================

  function ensureWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return

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
        wsReconnectTimeout = setTimeout(ensureWebSocket, 3000)
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
      wsReconnectTimeout = setTimeout(ensureWebSocket, 3000)
    }
  }

  function handleWsMessage(data: { type: string; payload?: unknown }) {
    const payload = data.payload as { address?: string; device?: { address: string; name?: string } } | undefined
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
        if (payload?.address) {
          setSetting('lastBluetoothDevice', payload.address)
        }
        fetchDevices()
        break

      case 'bluetooth/disconnect':
      case 'bluetooth/disconnected':
        log.warn(`Device disconnected: ${payload?.address?.slice(-8) || '?'}`)
        fetchDevices()
        break

      case 'bluetooth/network/disconnect':
        log.info('NAP disconnected (ignored)')
        break
    }
  }

  // ============================================================
  // INITIALIZATION (on-demand for network screen)
  // ============================================================

  async function initOnDemand() {
    log.info('On-demand init (network screen)')
    ensureWebSocket()
    await startDiscovery()
    await fetchDevices()
  }

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
    attemptReconnect: startReconnectLoop,
    stopReconnecting,

    // Init
    ensureWebSocket,
    initOnDemand,
    refresh: fetchDevices,
  }
}
