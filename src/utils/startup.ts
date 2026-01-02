import { createLogger, initDebugFromSettings } from '@/utils/debug'
import { useSettings } from '@/composables/useSettings'

const log = createLogger('Boot')

/**
 * Centralized boot sequence for controlled startup.
 * Staggers initialization to reduce load on Car Thing.
 *
 * Settings are loaded FIRST so debug logging works from the start.
 */

const DELAYS = {
  NETWORK_CHECK: 2000,    // 2s - Check network first
  BLUETOOTH_INIT: 5000,   // 5s - Then BT
  PRESENCE_LOOP: 10000,   // 10s - Then presence detection
} as const

type InitFunction = () => void | Promise<void>

let bootStarted = false

// Registered init functions
let networkInit: InitFunction | null = null
let bluetoothInit: InitFunction | null = null
let presenceInit: InitFunction | null = null

/**
 * Register init functions from composables.
 * These will be called during boot sequence.
 */
export function registerNetworkInit(fn: InitFunction) {
  log.info('Registered: Network init')
  networkInit = fn
}

export function registerBluetoothInit(fn: InitFunction) {
  log.info('Registered: Bluetooth init')
  bluetoothInit = fn
}

export function registerPresenceInit(fn: InitFunction) {
  log.info('Registered: Presence init')
  presenceInit = fn
}

/**
 * Start the boot sequence.
 * Called once from App.vue onMounted.
 */
export async function startBootSequence() {
  if (bootStarted) return
  bootStarted = true

  // Load settings FIRST so debug logging works from the start
  const { settings, loadSettings } = useSettings()
  await loadSettings()
  initDebugFromSettings(() => settings.value.debugOverlayEnabled)

  log.success('=== Boot sequence started ===')

  // Stage 1: Network check
  setTimeout(async () => {
    log.info(`[${DELAYS.NETWORK_CHECK}ms] Network check...`)
    if (networkInit) await networkInit()
    log.success('Network check done')
  }, DELAYS.NETWORK_CHECK)

  // Stage 2: Bluetooth init
  setTimeout(async () => {
    log.info(`[${DELAYS.BLUETOOTH_INIT}ms] Bluetooth init...`)
    if (bluetoothInit) await bluetoothInit()
    log.success('Bluetooth init done')
  }, DELAYS.BLUETOOTH_INIT)

  // Stage 3: Presence detection
  setTimeout(async () => {
    log.info(`[${DELAYS.PRESENCE_LOOP}ms] Presence detection...`)
    if (presenceInit) await presenceInit()
    log.success('Presence detection started')
  }, DELAYS.PRESENCE_LOOP)
}

/**
 * Reset boot state (for testing/hot reload).
 */
export function resetBoot() {
  bootStarted = false
  networkInit = null
  bluetoothInit = null
  presenceInit = null
}
