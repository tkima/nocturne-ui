import { ref, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'

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

// Reconnection constants
const RECONNECT_INTERVAL = 2000 // 2 seconds - keep trying forever
const INITIAL_RECONNECT_DELAY = 1000
const SHOW_NETWORK_SCREEN_DELAY = 5000 // Show network screen after 5 seconds of no connection
const NETWORK_POLL_INTERVAL = 5000 // Poll network connection every 5 seconds

export function useBluetooth() {
  const config = useConfigStore()

  const devices = ref<BluetoothDevice[]>([])
  const isLoading = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const discoveryActive = ref(false)
  const reconnectAttempt = ref(0)
  const isReconnecting = ref(false)
  const shouldShowNetworkScreen = ref(false)

  // Pairing state
  const pairingRequest = ref<PairingRequest | null>(null)
  const wsConnected = ref(false)

  let reconnectTimeoutRef: ReturnType<typeof setTimeout> | null = null
  let networkScreenTimeoutRef: ReturnType<typeof setTimeout> | null = null
  let networkPollIntervalRef: ReturnType<typeof setInterval> | null = null
  let ws: WebSocket | null = null
  let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null

  // Fetch paired devices
  async function fetchDevices(): Promise<BluetoothDevice[]> {
    isLoading.value = true
    error.value = null

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
    } finally {
      isLoading.value = false
    }
  }

  // Start Bluetooth discovery
  async function startDiscovery(): Promise<boolean> {
    if (discoveryActive.value) return true

    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/discover/on`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to start discovery')

      discoveryActive.value = true
      return true
    } catch (err) {
      console.error('Failed to start discovery:', err)
      return false
    }
  }

  // Stop Bluetooth discovery
  async function stopDiscovery(): Promise<void> {
    if (!discoveryActive.value) return

    try {
      await fetch(`${config.nocturnedUrl}/bluetooth/discover/off`, {
        method: 'POST'
      })
      discoveryActive.value = false
    } catch (err) {
      console.error('Failed to stop discovery:', err)
    }
  }

  // Connect to a device
  async function connectDevice(address: string): Promise<boolean> {
    isConnecting.value = true
    error.value = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${config.nocturnedUrl}/bluetooth/connect/${address}`, {
        method: 'POST',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Failed to connect')

      const data = await response.json().catch(() => ({}))
      if (data.connected) {
        localStorage.setItem('lastConnectedBluetoothDevice', address)
        await fetchDevices()
        // Start network polling to establish NAP connection
        startNetworkPolling(address)
        return true
      }

      throw new Error('Connection failed')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Connection failed'
      return false
    } finally {
      isConnecting.value = false
    }
  }

  // Disconnect a device
  async function disconnectDevice(address: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/disconnect/${address}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to disconnect')

      localStorage.removeItem('lastConnectedBluetoothDevice')
      await fetchDevices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Disconnect failed'
      return false
    }
  }

  // Forget/unpair a device
  async function forgetDevice(address: string): Promise<boolean> {
    isLoading.value = true

    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/remove/${address}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to remove device')

      if (localStorage.getItem('lastConnectedBluetoothDevice') === address) {
        localStorage.removeItem('lastConnectedBluetoothDevice')
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

  // Cleanup reconnect timer
  function cleanupReconnectTimer() {
    if (reconnectTimeoutRef) {
      clearTimeout(reconnectTimeoutRef)
      reconnectTimeoutRef = null
    }
  }

  // Cleanup network screen timer
  function cleanupNetworkScreenTimer() {
    if (networkScreenTimeoutRef) {
      clearTimeout(networkScreenTimeoutRef)
      networkScreenTimeoutRef = null
    }
  }

  // Check if any device is connected
  function hasConnectedDevice(): boolean {
    return devices.value.some(d => d.connected)
  }

  // Start the network screen timer (shows after 5 seconds of no connection)
  function startNetworkScreenTimer() {
    cleanupNetworkScreenTimer()
    networkScreenTimeoutRef = setTimeout(() => {
      if (!hasConnectedDevice()) {
        shouldShowNetworkScreen.value = true
      }
    }, SHOW_NETWORK_SCREEN_DELAY)
  }

  // Attempt to reconnect to last connected device - runs forever until connected
  async function attemptReconnect(): Promise<void> {
    // Don't start another attempt if one is in progress
    if (isReconnecting.value) {
      return
    }

    const lastDeviceAddress = localStorage.getItem('lastConnectedBluetoothDevice')
    if (!lastDeviceAddress) {
      cleanupReconnectTimer()
      reconnectAttempt.value = 0
      isReconnecting.value = false
      return
    }

    try {
      isReconnecting.value = true

      // First check if already connected
      const devicesData = await fetchDevices()
      const isAlreadyConnected = devicesData.some(
        device => device.address === lastDeviceAddress && device.connected
      )

      if (isAlreadyConnected) {
        // Connected! Stop everything
        cleanupReconnectTimer()
        cleanupNetworkScreenTimer()
        reconnectAttempt.value = 0
        isReconnecting.value = false
        shouldShowNetworkScreen.value = false
        console.log('Device connected')
        return
      }

      reconnectAttempt.value++
      console.log(`Reconnect attempt ${reconnectAttempt.value} to ${lastDeviceAddress}`)

      // Attempt to connect
      const success = await connectDevice(lastDeviceAddress)

      if (success) {
        // Connected! Stop everything
        cleanupReconnectTimer()
        cleanupNetworkScreenTimer()
        reconnectAttempt.value = 0
        isReconnecting.value = false
        shouldShowNetworkScreen.value = false
        console.log('Reconnection successful')
        return
      }

      // Schedule next attempt - keep trying forever
      isReconnecting.value = false
      reconnectTimeoutRef = setTimeout(() => {
        reconnectTimeoutRef = null
        attemptReconnect()
      }, RECONNECT_INTERVAL)
    } catch (err) {
      console.error('Reconnect attempt failed:', err)
      reconnectAttempt.value++

      // Schedule next attempt - keep trying forever
      isReconnecting.value = false
      reconnectTimeoutRef = setTimeout(() => {
        reconnectTimeoutRef = null
        attemptReconnect()
      }, RECONNECT_INTERVAL)
    }
  }

  // Stop reconnection loop
  function stopReconnecting() {
    cleanupReconnectTimer()
    cleanupNetworkScreenTimer()
    isReconnecting.value = false
    reconnectAttempt.value = 0
  }

  // ------------------------------------------------------------
  // Network Polling - establishes NAP connection after BT pairing
  // ------------------------------------------------------------
  function stopNetworkPolling() {
    if (networkPollIntervalRef) {
      clearInterval(networkPollIntervalRef)
      networkPollIntervalRef = null
    }
  }

  async function startNetworkPolling(deviceAddress: string) {
    if (!deviceAddress) return

    stopNetworkPolling()
    console.log('Starting network polling for device:', deviceAddress)

    // Attempt to establish network connection
    const attemptNetworkConnection = async (): Promise<boolean> => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const response = await fetch(`${config.nocturnedUrl}/bluetooth/connect/${deviceAddress}`, {
          method: 'POST',
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json().catch(() => ({}))
          if (data.connected) {
            console.log('Network connection established successfully')
            stopNetworkPolling()
            // Trigger network check
            window.dispatchEvent(new Event('online'))
            return true
          }
        } else {
          // Check for "exit status 4" which means network connect failed
          // This happens when iPhone Personal Hotspot isn't enabled yet
          const errorData = await response.json().catch(() => ({}))
          console.log('Network connect response:', errorData.error || 'Failed')
          // Keep retrying - the user might enable Personal Hotspot
        }
      } catch (err) {
        console.log('Network connection attempt failed, will retry...')
      }
      return false
    }

    // Try immediately
    const success = await attemptNetworkConnection()
    if (success) return

    // Then poll every 5 seconds - keep trying until hotspot is enabled
    networkPollIntervalRef = setInterval(async () => {
      const success = await attemptNetworkConnection()
      if (success) {
        stopNetworkPolling()
      }
    }, NETWORK_POLL_INTERVAL)
  }

  // ------------------------------------------------------------
  // WebSocket for pairing requests
  // ------------------------------------------------------------
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return

    try {
      // nocturned WebSocket endpoint
      const wsUrl = config.nocturnedUrl.replace('http', 'ws') + '/ws'
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        wsConnected.value = true
        console.log('Bluetooth WebSocket connected')
      }

      ws.onclose = () => {
        wsConnected.value = false
        console.log('Bluetooth WebSocket disconnected')
        // Reconnect after delay
        wsReconnectTimeout = setTimeout(connectWebSocket, 3000)
      }

      ws.onerror = (err) => {
        console.error('Bluetooth WebSocket error:', err)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWsMessage(data)
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }
    } catch (err) {
      console.error('Failed to connect WebSocket:', err)
      wsReconnectTimeout = setTimeout(connectWebSocket, 3000)
    }
  }

  function handleWsMessage(data: { type: string; payload?: unknown }) {
    const payload = data.payload as { address?: string; device?: { address: string } } | undefined

    switch (data.type) {
      case 'bluetooth\\pairing':
      case 'bluetooth/pairing':
        pairingRequest.value = data.payload as PairingRequest
        break

      case 'bluetooth\\paired':
      case 'bluetooth/paired':
        pairingRequest.value = null
        // Store last connected device and start network polling
        if (payload?.device?.address) {
          localStorage.setItem('lastConnectedBluetoothDevice', payload.device.address)
          // Start network polling after a short delay to let BT settle
          setTimeout(() => {
            startNetworkPolling(payload.device!.address)
          }, 2000)
        }
        // Refresh devices after pairing
        fetchDevices()
        break

      case 'bluetooth\\connect':
      case 'bluetooth/connect':
        // Device connected, start network polling
        if (payload?.address) {
          startNetworkPolling(payload.address)
          cleanupReconnectTimer()
          reconnectAttempt.value = 0
          isReconnecting.value = false
        }
        fetchDevices()
        break

      case 'bluetooth\\disconnected':
      case 'bluetooth/disconnected':
      case 'bluetooth\\disconnect':
      case 'bluetooth/disconnect':
        // Device disconnected, stop polling and refresh list
        stopNetworkPolling()
        fetchDevices()
        // Try to reconnect
        setTimeout(() => attemptReconnect(), INITIAL_RECONNECT_DELAY)
        break

      case 'bluetooth\\network\\disconnect':
      case 'bluetooth/network/disconnect':
        // Network disconnected but BT still connected, try reconnecting
        setTimeout(() => attemptReconnect(), INITIAL_RECONNECT_DELAY)
        break

      case 'network_status':
        if ((payload as { status?: string })?.status === 'online') {
          cleanupReconnectTimer()
          reconnectAttempt.value = 0
          isReconnecting.value = false
          stopNetworkPolling()
        }
        break
    }
  }

  function closeWebSocket() {
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout)
      wsReconnectTimeout = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    wsConnected.value = false
  }

  // ------------------------------------------------------------
  // Pairing Actions
  // ------------------------------------------------------------
  async function acceptPairing(): Promise<boolean> {
    if (!pairingRequest.value) return false

    try {
      isConnecting.value = true
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${config.nocturnedUrl}/bluetooth/pairing/accept`, {
        method: 'POST',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Failed to accept pairing')

      pairingRequest.value = null
      await fetchDevices()
      return true
    } catch (err) {
      console.error('Error accepting pairing:', err)
      pairingRequest.value = null
      return false
    } finally {
      isConnecting.value = false
    }
  }

  async function denyPairing(): Promise<boolean> {
    if (!pairingRequest.value) return false

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${config.nocturnedUrl}/bluetooth/pairing/deny`, {
        method: 'POST',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Failed to deny pairing')

      pairingRequest.value = null
      return true
    } catch (err) {
      console.error('Error denying pairing:', err)
      pairingRequest.value = null
      return false
    }
  }

  // Initialize
  async function init() {
    connectWebSocket()
    await startDiscovery()
    await fetchDevices()

    // Check if we need to reconnect to last device
    const lastDeviceAddress = localStorage.getItem('lastConnectedBluetoothDevice')
    if (lastDeviceAddress && !hasConnectedDevice()) {
      // Start network screen timer (shows after 5 seconds)
      startNetworkScreenTimer()

      // Start reconnection after initial delay
      setTimeout(() => {
        attemptReconnect()
      }, INITIAL_RECONNECT_DELAY)
    }
  }

  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    closeWebSocket()
    stopDiscovery()
    cleanupReconnectTimer()
    cleanupNetworkScreenTimer()
    stopNetworkPolling()
  })

  return {
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
    fetchDevices,
    startDiscovery,
    stopDiscovery,
    connectDevice,
    disconnectDevice,
    forgetDevice,
    attemptReconnect,
    stopReconnecting,
    startNetworkPolling,
    stopNetworkPolling,
    acceptPairing,
    denyPairing,
    refresh: fetchDevices
  }
}
