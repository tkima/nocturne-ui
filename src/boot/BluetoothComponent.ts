/**
 * Bluetooth Boot Component
 * Loops until BT adapter is ready (real check), then inits
 */

import { ref, computed, readonly } from 'vue'
import type { BootComponent, BootStatus } from './types'
import { waitUntilReady } from './types'
import { useConfigStore } from '@/stores/config'
import { useSettings } from '@/composables/useSettings'
import { useBluetooth } from '@/composables/useBluetooth'
import { useHeartbeat } from '@/composables/useHeartbeat'
import { createLogger } from '@/utils/debug'

const log = createLogger('BTBoot')

// Check if Bluetooth is enabled via environment variable
// Also disable in dev mode (no nocturned daemon running)
const IS_DEV = import.meta.env.DEV
const BLUETOOTH_ENABLED = !IS_DEV && import.meta.env.VITE_BLUETOOTH_ENABLED !== 'false'

// Singleton state
const hasConnectedDevice = ref<boolean>(false)
const wsConnected = ref<boolean>(false)

export function createBluetoothComponent(): BootComponent {
  const status = ref<BootStatus>('idle')
  const error = ref<string | null>(null)

  let devicePresent = false

  const config = useConfigStore()
  const { settings, loadSettings } = useSettings()
  const heartbeat = useHeartbeat()

  const isReady = computed(() => hasConnectedDevice.value)

  /**
   * Check if BT adapter is available (real check via API)
   */
  async function checkAdapterReady(): Promise<boolean> {
    if (!BLUETOOTH_ENABLED) {
      return true // Skip if BT disabled
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${config.nocturnedUrl}/bluetooth/devices`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      // If we can fetch devices, adapter is ready
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Fetch device list
   */
  async function fetchDevices(): Promise<{ address: string; connected: boolean }[]> {
    try {
      const response = await fetch(`${config.nocturnedUrl}/bluetooth/devices`)
      if (!response.ok) return []
      return await response.json()
    } catch {
      return []
    }
  }

  /**
   * Try to reconnect to saved device
   */
  async function tryReconnect(): Promise<boolean> {
    const savedAddress = settings.value.lastBluetoothDevice
    if (!savedAddress) {
      log.info('No saved device')
      return false
    }

    log.info(`Connecting to ${savedAddress.slice(-8)}...`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

      const response = await fetch(`${config.nocturnedUrl}/device/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [`/etc/nocturne/ui/bt-connect.sh ${savedAddress}`]
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        log.error(`Connect failed: HTTP ${response.status}`)
        return false
      }

      const result = await response.json()
      const cmdResult = result.results?.[0]

      if (cmdResult?.exit_code === 0) {
        log.success('Connected!')
        hasConnectedDevice.value = true
        return true
      }

      // Verify connection
      const devices = await fetchDevices()
      const connected = devices.some(d => d.address === savedAddress && d.connected)
      if (connected) {
        log.success('Verified connected')
        hasConnectedDevice.value = true
        return true
      }

      log.warn('Connect failed')
      return false
    } catch (e) {
      log.error(`Connect error: ${e instanceof Error ? e.message : 'unknown'}`)
      return false
    }
  }

  /**
   * Startup: connect WebSocket via composable, then loop until adapter ready
   */
  async function startup(): Promise<void> {
    log.info('startup() - BT_ENABLED=' + BLUETOOTH_ENABLED)

    if (!BLUETOOTH_ENABLED) {
      status.value = 'ready'
      log.info('Bluetooth disabled via env, skipping')
      return
    }

    status.value = 'starting'
    log.info('Connecting WebSocket to nocturned...')

    // Delegate WebSocket to the composable (single connection)
    const bt = useBluetooth()
    bt.ensureWebSocket()

    // Loop: check adapter every 1s until ready
    log.info('Waiting for BT adapter (check every 1s)...')
    let attempts = 0
    await waitUntilReady(async () => {
      attempts++
      const ready = await checkAdapterReady()
      if (ready) {
        log.success(`BT adapter ready after ${attempts} attempt(s)!`)
      } else if (attempts % 5 === 0) {
        log.warn(`Still waiting for BT adapter... (${attempts} attempts)`)
      }
      return ready
    }, 1000)

    // Adapter confirmed ready, now init
    await init()
  }

  /**
   * Init: fetch devices, try reconnect to saved device
   */
  async function init(): Promise<boolean> {
    log.info('init() - loading settings and fetching devices...')
    await loadSettings()

    const devices = await fetchDevices()
    log.info(`Found ${devices.length} paired device(s)`)

    // Check if saved device is already connected
    const savedAddress = settings.value.lastBluetoothDevice
    if (savedAddress) {
      log.info(`Saved device: ...${savedAddress.slice(-8)}`)
      const device = devices.find(d => d.address === savedAddress)
      if (device) {
        log.info(`Device found in list, connected=${device.connected}`)
        if (device.connected) {
          log.success('Saved device already connected!')
          hasConnectedDevice.value = true
          devicePresent = true
          status.value = 'ready'
          registerPresencePolling()
          return true
        }
      } else {
        log.info('Saved device not in paired list')
      }

      // Try to reconnect
      log.info('Attempting reconnect to saved device...')
      const success = await tryReconnect()
      if (success) {
        devicePresent = true
        log.success('Reconnect successful!')
      } else {
        log.warn('Reconnect failed')
      }
    } else {
      log.info('No saved BT device')
    }

    status.value = 'ready'
    error.value = null

    // Start presence polling via heartbeat
    registerPresencePolling()

    log.success('init() complete')
    return true
  }

  /**
   * Register presence detection with the heartbeat service.
   * - 15s when no device present
   * - 5min when device present
   */
  function registerPresencePolling(): void {
    if (!BLUETOOTH_ENABLED) return

    log.info('Registering bt-presence with heartbeat')

    heartbeat.register({
      name: 'bt-presence',
      interval: devicePresent ? 300000 : 15000,
      fn: async () => {
        const savedAddress = settings.value.lastBluetoothDevice
        if (!savedAddress) return

        const devices = await fetchDevices()
        const found = devices.some(d => d.address === savedAddress)
        const connected = devices.some(d => d.address === savedAddress && d.connected)

        hasConnectedDevice.value = connected

        if (found && !devicePresent) {
          log.success('Device appeared, reconnecting...')
          devicePresent = true
          await tryReconnect()
          // Re-register with longer interval
          registerPresencePolling()
        } else if (!found && devicePresent) {
          log.warn('Device gone')
          devicePresent = false
          // Re-register with shorter interval
          registerPresencePolling()
        }
      },
    })
  }

  /**
   * Reconnect to saved device
   */
  async function reconnect(): Promise<boolean> {
    status.value = 'reconnecting'
    const success = await tryReconnect()
    status.value = success ? 'ready' : 'error'
    return success
  }

  return {
    name: 'bluetooth',
    status: readonly(status),
    error: readonly(error),
    isReady,
    startup,
    init,
    reconnect,
  }
}

// Export singleton state
export { hasConnectedDevice, wsConnected }
