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

export function useWiFiNetworks() {
  const currentNetwork = ref<WiFiNetwork | null>(null)
  const savedNetworks = ref<WiFiNetwork[]>([])
  const availableNetworks = ref<WiFiNetwork[]>([])
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

  // Connect to a network
  async function connectToNetwork(ssid: string, password?: string): Promise<boolean> {
    if (!isConnectorAvailable.value) return false

    isConnecting.value = true
    error.value = null

    try {
      const response = await fetch(`${CONNECTOR_API}/network/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid,
          ...(password && { psk: password })
        })
      })

      if (!response.ok) throw new Error('Connection failed')

      // Wait a bit then refresh
      await new Promise(r => setTimeout(r, 2000))
      await fetchSavedNetworks()

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Connection failed'
      return false
    } finally {
      isConnecting.value = false
    }
  }

  // Connect to a saved network by ID
  async function connectToSavedNetwork(networkId: number): Promise<boolean> {
    if (!isConnectorAvailable.value) return false

    isConnecting.value = true
    error.value = null

    try {
      const response = await fetch(`${CONNECTOR_API}/network/select/${networkId}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to select network')

      await new Promise(r => setTimeout(r, 2000))
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
    refresh: scanNetworks
  }
}
