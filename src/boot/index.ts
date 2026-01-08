/**
 * Boot Orchestrator
 * Coordinates the startup sequence for all components
 */

import { useBootStore } from '@/stores/boot'
import { useSpotifyStore } from '@/stores/spotify'
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
 * @param phase - undefined: full boot, 'init': phase 1 only, 'connect': phase 2 only (for reconnect)
 *
 * Phase 1 / init (blocking - for loading screen):
 *   1. Settings → load settings from file
 *
 * Phase 2 / connect (background - after loading screen):
 *   2. Bluetooth → start polling
 *   3. Network → wait until connected (max 15s)
 *   4. Auth → validate token via API (only if network ready)
 */
export async function startBoot(phase?: 'init' | 'connect'): Promise<void> {
  const bootStore = useBootStore()
  const startTime = Date.now()

  // ============================================================
  // Phase 1 / init: Settings only (blocking - for loading screen)
  // ============================================================
  if (!phase || phase === 'init') {
    if (bootStarted) {
      log.warn('Boot already started, ignoring')
      return
    }
    bootStarted = true

    log.success('════════════════════════════════════════')
    log.success('       BOOT SEQUENCE STARTED')
    log.success('════════════════════════════════════════')

    await new Promise(resolve => setTimeout(resolve, 2000))
    bootStore.bootPhase = 'starting'
    bootStore.setProgress(0)
    // Create components
    log.info('Creating boot components...')
    const settingsComponent = createSettingsComponent()
    bootStore.setProgress(10)
    await new Promise(resolve => setTimeout(resolve, 500))
    const authComponent = createAuthComponent()
    bootStore.setProgress(20)
    await new Promise(resolve => setTimeout(resolve, 500))
    const networkComponent = createNetworkComponent()
    bootStore.setProgress(30)
    await new Promise(resolve => setTimeout(resolve, 500))
    const bluetoothComponent = createBluetoothComponent()

    // Register with store
    bootStore.registerComponent(settingsComponent)
    bootStore.registerComponent(authComponent)
    bootStore.registerComponent(networkComponent)
    bootStore.registerComponent(bluetoothComponent)
    log.info('Components registered with boot store')

    log.info('[1/4] Settings...')
    bootStore.setProgress(50)
    await settingsComponent.startup()
    bootStore.setProgress(70)
    const settingsOk = await settingsComponent.init()
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (!settingsOk) {
      log.error('Settings failed to load - boot may fail!')
    }
    bootStore.setProgress(100)

    // Mark critical phase done - loading screen will complete
    bootStore.bootPhase = 'critical'
    const phase1Time = Date.now() - startTime
    log.success(`Phase 1 complete in ${phase1Time}ms - loading screen can close`)
  }

  // ============================================================
  // Phase 2 / connect: Network + Auth (background - after loading screen)
  // ============================================================
  if (!phase || phase === 'connect') {
    if (phase === 'connect') {
      log.info('════════════════════════════════════════')
      log.info('       RECONNECT - Phase 2')
      log.info('════════════════════════════════════════')
    }

    // Get components from store
    const bluetoothComponent = bootStore.getComponent('bluetooth')
    const networkComponent = bootStore.getComponent('network')
    const authComponent = bootStore.getComponent('auth')

    if (!networkComponent || !authComponent) {
      log.error('Components not registered - was init phase run?')
      return
    }

    // Start bluetooth (skip on reconnect - already polling)
    if (!phase && bluetoothComponent) {
      log.info('[2/4] Bluetooth (background)...')
      bluetoothComponent.startup()
        .then(() => {
          const elapsed = Date.now() - startTime
          log.success(`Bluetooth ready after ${elapsed}ms total`)
        })
        .catch((e) => {
          log.error(`Bluetooth startup failed: ${e}`)
        })
    }

    // Network + Auth in background (don't block UI)
    log.info(`[3/4] Network (${phase === 'connect' ? 'reconnect' : 'background'}, max 15s)...`)
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

          // Prefetch data (populates store for reactive views)
          // Delay 1s to let Spotify API settle after auth
          setTimeout(() => {
            log.info('Prefetching recents + playback...')
            const spotifyStore = useSpotifyStore()
            spotifyStore.fetchRecentlyPlayed()
            spotifyStore.fetchCurrentPlayback()
          }, 1000)
        } else {
          log.warn('[4/4] Auth skipped - no network')
        }
        bootStore.bootPhase = 'ready'
      })
      .catch((e) => {
        log.error(`Network/Auth failed: ${e}`)
      })
  }
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
