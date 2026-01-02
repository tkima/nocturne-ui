/**
 * Network Boot Component
 * Loops until network is connected (real ping), then inits
 *
 * IMPORTANT: This component updates useNetwork composable's state directly
 * so UI components get the correct network status.
 */

import { computed, readonly, ref } from 'vue'
import type { BootComponent, BootStatus } from './types'
import { waitUntilReady } from './types'
import { useNetwork } from '@/composables/useNetwork'
import { createLogger } from '@/utils/debug'

const log = createLogger('NetworkBoot')

const POLL_INTERVAL = 3000 // 3s when disconnected

export function createNetworkComponent(): BootComponent {
  const status = ref<BootStatus>('idle')
  const error = ref<string | null>(null)

  // Use the composable's state so UI components stay in sync
  const network = useNetwork()

  let pollingId: ReturnType<typeof setInterval> | null = null

  const isReady = computed(() => network.isConnected.value === true)

  /**
   * Startup: register listeners, then loop until connected
   */
  async function startup(): Promise<void> {
    log.info('startup() - registering listeners...')
    status.value = 'starting'

    // Register browser online/offline listeners
    network.registerListeners()
    log.info('Browser online/offline listeners registered')

    log.info('Waiting for network (ping every 1s)...')
    let attempts = 0

    // Loop: check every 1s until connected
    // Use refresh() which updates initialCheckDone for UI bubble
    await waitUntilReady(async () => {
      attempts++
      await network.refresh()
      const connected = network.isConnected.value === true
      if (connected) {
        log.success(`Network connected after ${attempts} attempt(s)!`)
      } else if (attempts % 5 === 0) {
        log.warn(`Still waiting for network... (${attempts} attempts)`)
      }
      return connected
    }, 1000)

    // Network confirmed working, now init
    await init()
  }

  /**
   * Init: network is already confirmed working, mark ready
   */
  async function init(): Promise<boolean> {
    log.info('init() - updating composable state...')

    // Update composable's state (this updates UI components too)
    await network.refresh()

    status.value = 'ready'
    error.value = null

    log.success('init() complete - network ready')
    return true
  }

  /**
   * Reconnect: force connectivity check
   */
  async function reconnect(): Promise<boolean> {
    status.value = 'reconnecting'
    log.info('Reconnecting...')

    await network.refresh()
    const connected = network.isConnected.value === true

    if (connected) {
      status.value = 'ready'
      error.value = null
      log.success('Reconnected')
    } else {
      status.value = 'error'
      error.value = 'No internet connection'
    }

    return connected
  }

  /**
   * Start polling when disconnected (delegates to composable)
   */
  function startPolling(): void {
    if (pollingId) return

    log.info(`Starting poll (every ${POLL_INTERVAL}ms)`)
    pollingId = setInterval(async () => {
      await network.refresh()
      if (network.isConnected.value === true) {
        status.value = 'ready'
        error.value = null
        stopPolling()
        log.success('Connection restored')
      }
    }, POLL_INTERVAL)
  }

  /**
   * Stop polling
   */
  function stopPolling(): void {
    if (pollingId) {
      clearInterval(pollingId)
      pollingId = null
      log.info('Polling stopped')
    }
  }

  return {
    name: 'network',
    status: readonly(status),
    error: readonly(error),
    isReady,
    startup,
    init,
    reconnect,
    startPolling,
    stopPolling,
  }
}
