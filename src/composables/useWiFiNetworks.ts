import { ref, onMounted } from 'vue'

// Connector API base (Raspberry Pi)
const CONNECTOR_API = 'http://172.16.42.1:20574'

export interface WiFiNetwork {
  ssid: string
  bssid?: string
  signal: string
  flags: string
  networkId?: number
}

export interface NetworkStatus {
  wpaState?: string
  networkId?: number
  ssid?: string
  ipAddress?: string
}

export function useWiFiNetworks() {
  const currentNetwork = ref<WiFiNetwork | null>(null)
  const savedNetworks = ref<WiFiNetwork[]>([])
  const availableNetworks = ref<WiFiNetwork[]>([])
  const networkStatus = ref<NetworkStatus | null>(null)
  const isLoading = ref(false)
  const isScanning = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const isConnectorAvailable = ref(false)

  // Check if connector is available
  async function checkConnector(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${CONNECTOR_API}/network`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      isConnectorAvailable.value = response.ok
      return response.ok
    } catch {
      isConnectorAvailable.value = false
      return false
    }
  }

  // Scan for available networks
  async function scanNetworks(): Promise<WiFiNetwork[]> {
    if (!isConnectorAvailable.value) return []

    isScanning.value = true
    error.value = null

    try {
      const response = await fetch(`${CONNECTOR_API}/network/scan`)
      if (!response.ok) throw new Error('Scan failed')

      const networks: WiFiNetwork[] = await response.json()

      // Filter out invalid networks
      const filtered = networks.filter(n =>
        n.ssid &&
        n.ssid.trim() !== '' &&
        !n.flags?.includes('[P2P]') &&
        !n.ssid.startsWith('\\x00')
      )

      // Deduplicate by SSID, keeping strongest signal
      const unique = filtered.reduce((acc: WiFiNetwork[], network) => {
        const existing = acc.find(n => n.ssid === network.ssid)
        if (!existing || parseInt(network.signal) > parseInt(existing.signal)) {
          if (existing) {
            acc = acc.filter(n => n.ssid !== network.ssid)
          }
          acc.push(network)
        }
        return acc
      }, [])

      availableNetworks.value = unique

      // Also fetch saved networks
      await fetchSavedNetworks()

      return unique
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Scan failed'
      return []
    } finally {
      isScanning.value = false
    }
  }

  // Fetch saved/configured networks
  async function fetchSavedNetworks(): Promise<void> {
    if (!isConnectorAvailable.value) return

    try {
      const response = await fetch(`${CONNECTOR_API}/network/list`)
      if (!response.ok) throw new Error('Failed to fetch saved networks')

      const networks: WiFiNetwork[] = await response.json()

      // Find current connected network
      const current = networks.find(n => n.flags?.includes('[CURRENT]'))
      currentNetwork.value = current || null

      // Saved networks (not current)
      savedNetworks.value = networks.filter(n => !n.flags?.includes('[CURRENT]'))
    } catch (err) {
      console.error('Failed to fetch saved networks:', err)
    }
  }

  // Fetch current network status (wpaState, etc.)
  async function fetchNetworkStatus(): Promise<NetworkStatus | null> {
    try {
      const response = await fetch(`${CONNECTOR_API}/network`)
      if (!response.ok) return null

      const status: NetworkStatus = await response.json()
      networkStatus.value = status
      return status
    } catch {
      return null
    }
  }

  // Poll for connection status (like React version)
  // Polls up to maxAttempts times, every interval ms
  // Returns true when wpaState === "COMPLETED" or networkId is set
  async function pollConnectionStatus(maxAttempts = 10, interval = 2000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await fetchNetworkStatus()
      console.log(`[WiFi] Poll attempt ${i + 1}/${maxAttempts}:`, status)
      if (status && (status.wpaState === 'COMPLETED' || status.networkId)) {
        return true
      }
      await new Promise(r => setTimeout(r, interval))
    }
    return false
  }

  // Connect to a network (matches React version logic)
  async function connectToNetwork(ssid: string, password?: string): Promise<boolean> {
    if (!isConnectorAvailable.value) return false

    isConnecting.value = true
    error.value = null

    try {
      // First check if network is already saved
      const savedResponse = await fetch(`${CONNECTOR_API}/network/list`)
      if (!savedResponse.ok) throw new Error('Failed to check saved networks')

      const savedList: WiFiNetwork[] = await savedResponse.json()
      const existingSaved = savedList.find(n => n.ssid === ssid)

      if (existingSaved && existingSaved.networkId !== undefined) {
        // Network already saved, just select it
        console.log('[WiFi] Network already saved, selecting:', existingSaved.networkId)
        const selectResponse = await fetch(
          `${CONNECTOR_API}/network/select/${existingSaved.networkId}`,
          { method: 'POST' }
        )
        if (!selectResponse.ok) {
          throw new Error(`Failed to select network: ${selectResponse.status}`)
        }
      } else {
        // New network, connect with credentials
        console.log('[WiFi] Connecting to new network:', ssid)
        const connectResponse = await fetch(`${CONNECTOR_API}/network/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid,
            ...(password && { psk: password })
          })
        })

        if (!connectResponse.ok) {
          throw new Error(`Failed to connect to network: ${connectResponse.status}`)
        }

        // After connecting, fetch list again and select the newly saved network
        try {
          const listResp = await fetch(`${CONNECTOR_API}/network/list`)
          if (listResp.ok) {
            const listData: WiFiNetwork[] = await listResp.json()
            const newlySaved = listData.find(n => n.ssid === ssid)
            if (newlySaved && newlySaved.networkId !== undefined) {
              console.log('[WiFi] Selecting newly saved network:', newlySaved.networkId)
              await fetch(
                `${CONNECTOR_API}/network/select/${newlySaved.networkId}`,
                { method: 'POST' }
              )
            }
          }
        } catch (err) {
          console.error('[WiFi] Failed to select newly added network:', err)
        }
      }

      // Poll for connection status (up to 10 attempts, 2s each = 20s max)
      console.log('[WiFi] Polling for connection status...')
      const connected = await pollConnectionStatus()

      if (!connected) {
        await scanNetworks()
        await fetchNetworkStatus()
        throw new Error('Failed to establish connection to network')
      }

      // Connection successful, refresh saved networks
      await fetchSavedNetworks()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Connection failed'
      return false
    } finally {
      isConnecting.value = false
    }
  }

  // Connect to a saved network by ID (with polling like React version)
  async function connectToSavedNetwork(networkId: number): Promise<boolean> {
    if (!isConnectorAvailable.value) return false

    isConnecting.value = true
    error.value = null

    try {
      const response = await fetch(`${CONNECTOR_API}/network/select/${networkId}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error(`Failed to select network: ${response.status}`)

      // Poll for connection status
      console.log('[WiFi] Polling for saved network connection...')
      const connected = await pollConnectionStatus()

      if (!connected) {
        await scanNetworks()
        await fetchNetworkStatus()
        throw new Error('Failed to establish connection to network')
      }

      await fetchSavedNetworks()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Connection failed'
      return false
    } finally {
      isConnecting.value = false
    }
  }

  // Forget a saved network
  async function forgetNetwork(networkId: number): Promise<boolean> {
    if (!isConnectorAvailable.value) return false

    try {
      const response = await fetch(`${CONNECTOR_API}/network/remove/${networkId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to forget network')

      await scanNetworks()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to forget network'
      return false
    }
  }

  // Check if network requires password
  function hasPasswordSecurity(flags: string): boolean {
    return flags?.includes('WPA') || flags?.includes('WEP')
  }

  // Initialize
  async function init() {
    isLoading.value = true
    const available = await checkConnector()
    if (available) {
      await scanNetworks()
    }
    isLoading.value = false
  }

  onMounted(() => {
    init()
  })

  return {
    currentNetwork,
    savedNetworks,
    availableNetworks,
    networkStatus,
    isLoading,
    isScanning,
    isConnecting,
    error,
    isConnectorAvailable,
    scanNetworks,
    connectToNetwork,
    connectToSavedNetwork,
    forgetNetwork,
    hasPasswordSecurity,
    fetchNetworkStatus,
    refresh: scanNetworks
  }
}
