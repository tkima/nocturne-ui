/**
 * Settings Boot Component
 * Wraps useSettings composable with BootComponent interface
 */

import { ref, computed, readonly } from 'vue'
import type { BootComponent, BootStatus } from './types'
import { useSettings } from '@/composables/useSettings'
import { createLogger } from '@/utils/debug'

const log = createLogger('SettingsBoot')

export function createSettingsComponent(): BootComponent {
  const status = ref<BootStatus>('idle')
  const error = ref<string | null>(null)

  const { settings, isLoaded, loadSettings } = useSettings()

  const isReady = computed(() => {
    return isLoaded.value && settings.value !== null
  })

  async function startup(): Promise<void> {
    log.info('startup() - no tasks')
  }

  async function init(): Promise<boolean> {
    log.info('init() - loading settings.json...')
    status.value = 'starting'
    error.value = null

    try {
      await loadSettings()

      // Verify settings loaded correctly
      if (!isLoaded.value || settings.value === null) {
        log.error('Settings failed to load - isLoaded or settings is null')
        error.value = 'Settings failed to load'
        status.value = 'error'
        return false
      }

      // Log key settings for debugging
      const hasTokens = !!(settings.value.accessToken && settings.value.refreshToken)
      const lastBt = settings.value.lastBluetoothDevice?.slice(-8) || 'none'
      log.success(`Settings loaded: hasTokens=${hasTokens}, lastBT=...${lastBt}`)

      status.value = 'ready'
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      log.error(`init() failed: ${msg}`)
      error.value = msg
      status.value = 'error'
      return false
    }
  }

  return {
    name: 'settings',
    status: readonly(status),
    error: readonly(error),
    isReady,
    startup,
    init,
  }
}
