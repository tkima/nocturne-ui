/**
 * Boot Orchestrator
 * Coordinates the startup sequence for all components
 */

import { useBootStore } from '@/stores/boot'
import { createSettingsComponent } from './SettingsComponent'
import { createAuthComponent } from './AuthComponent'
import { createNetworkComponent } from './NetworkComponent'
import { createBluetoothComponent } from './BluetoothComponent'
import { createLogger } from '@/utils/debug'

const log = createLogger('Boot')

let bootStarted = false

/**
 * Start the boot sequence
 *
 * Phase 1 (Critical, blocking):
 *   1. Settings.init() - load settings from file
 *   2. Auth.init() - load tokens from settings
 *   → criticalReady = true → dismiss LoadingScreen
 *
 * Phase 2 (Background, non-blocking):
 *   3. Network.startup() - loop until connected, then init
 *   4. Bluetooth.startup() - loop until adapter ready, then init
 */
export async function startBoot(): Promise<void> {
  if (bootStarted) {
    log.warn('Boot already started, ignoring')
    return
  }
  bootStarted = true

  const startTime = Date.now()
  log.success('════════════════════════════════════════')
  log.success('       BOOT SEQUENCE STARTED')
  log.success('════════════════════════════════════════')

  const bootStore = useBootStore()
  bootStore.bootPhase = 'starting'

  // Create components
  log.info('Creating boot components...')
  const settingsComponent = createSettingsComponent()
  const authComponent = createAuthComponent()
  const networkComponent = createNetworkComponent()
  const bluetoothComponent = createBluetoothComponent()

  // Register with store
  bootStore.registerComponent(settingsComponent)
  bootStore.registerComponent(authComponent)
  bootStore.registerComponent(networkComponent)
  bootStore.registerComponent(bluetoothComponent)
  log.info('Components registered with boot store')

  // ============================================================
  // Phase 1: Critical (blocking)
  // ============================================================
  log.info('────────────────────────────────────────')
  log.info('PHASE 1: Critical components (blocking)')
  log.info('────────────────────────────────────────')

  // 1. Settings first (other components need settings)
  log.info('[1/2] Settings...')
  await settingsComponent.startup()
  const settingsOk = await settingsComponent.init()
  if (!settingsOk) {
    log.error('Settings failed to load - boot may fail!')
  }

  // 2. Auth (needs settings for tokens)
  log.info('[2/2] Auth...')
  await authComponent.startup()
  await authComponent.init()
  authComponent.startPolling?.()

  const phase1Time = Date.now() - startTime
  log.success(`Phase 1 complete in ${phase1Time}ms`)
  log.success(`criticalReady = ${bootStore.criticalReady}`)
  bootStore.bootPhase = 'critical'

  // ============================================================
  // Phase 2: Background (non-blocking)
  // ============================================================
  log.info('────────────────────────────────────────')
  log.info('PHASE 2: Background components (async)')
  log.info('────────────────────────────────────────')

  // Network: startup loops until connected, then inits
  log.info('Starting Network component (background)...')
  networkComponent.startup()
    .then(() => {
      const elapsed = Date.now() - startTime
      log.success(`Network ready after ${elapsed}ms total`)
    })
    .catch((e) => {
      log.error(`Network startup failed: ${e}`)
    })

  // Bluetooth: startup loops until adapter ready, then inits
  log.info('Starting Bluetooth component (background)...')
  bluetoothComponent.startup()
    .then(() => {
      const elapsed = Date.now() - startTime
      log.success(`Bluetooth ready after ${elapsed}ms total`)
    })
    .catch((e) => {
      log.error(`Bluetooth startup failed: ${e}`)
    })

  log.info('Boot orchestrator returning (background tasks running)')
}

/**
 * Reset boot state (for testing/hot reload)
 */
export function resetBoot(): void {
  bootStarted = false
}

// Export types and components for direct access if needed
export type { BootComponent, BootStatus, BootComponentName } from './types'
export { createSettingsComponent } from './SettingsComponent'
export { createAuthComponent } from './AuthComponent'
export { createNetworkComponent } from './NetworkComponent'
export { createBluetoothComponent, hasConnectedDevice } from './BluetoothComponent'

// Export test utilities (also registers on window object)
export { testAuthBoot, testTokenValidation, testTokenRefresh } from './testAuthBoot'
