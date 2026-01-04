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
 * Phase 1 (blocking - for loading screen):
 *   1. Settings → load settings from file
 *
 * Phase 2 (background - after loading screen):
 *   2. Bluetooth → start polling
 *   3. Network → wait until connected (max 15s)
 *   4. Auth → validate token via API (only if network ready)
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
  // Phase 1: Settings only (blocking - for loading screen)
  // ============================================================

  log.info('[1/4] Settings...')
  await settingsComponent.startup()
  const settingsOk = await settingsComponent.init()
  if (!settingsOk) {
    log.error('Settings failed to load - boot may fail!')
  }

  // Mark critical phase done - loading screen will complete
  bootStore.bootPhase = 'critical'
  const phase1Time = Date.now() - startTime
  log.success(`Phase 1 complete in ${phase1Time}ms - loading screen can close`)

  // ============================================================
  // Phase 2: Network + Auth (background - after loading screen)
  // ============================================================

  // Start bluetooth (doesn't need network/auth)
  log.info('[2/4] Bluetooth (background)...')
  bluetoothComponent.startup()
    .then(() => {
      const elapsed = Date.now() - startTime
      log.success(`Bluetooth ready after ${elapsed}ms total`)
    })
    .catch((e) => {
      log.error(`Bluetooth startup failed: ${e}`)
    })

  // Network + Auth in background (don't block UI)
  log.info('[3/4] Network (background, max 15s)...')
  networkComponent.startup()
    .then(async () => {
      const networkTime = Date.now() - startTime
      log.info(`Network complete in ${networkTime}ms, connected=${bootStore.networkReady}`)

      // 4. Auth - only run if network connected
      if (bootStore.networkReady) {
        log.info('[4/4] Auth (validating token)...')
        await authComponent.startup()
        await authComponent.init()
        authComponent.startPolling?.()
        const totalTime = Date.now() - startTime
        log.success(`Auth complete in ${totalTime}ms`)
      } else {
        log.warn('[4/4] Auth skipped - no network')
      }

      bootStore.bootPhase = 'ready'
    })
    .catch((e) => {
      log.error(`Network/Auth failed: ${e}`)
    })
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
