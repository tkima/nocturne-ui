import { ref } from 'vue'
import { useNetwork } from '@/composables/useNetwork'
import { logger } from '@/utils/logger'

/**
 * Fast Spotify polling mode.
 * Triggers when both internet AND BT device are present.
 */

const FAST_POLL_DURATION = 60000 // 1 minute

// Shared state
const fastPollMode = ref(false)
const btDevicePresent = ref(false)
let fastPollTimeout: ReturnType<typeof setTimeout> | null = null

export function useBluetoothTrigger() {
  const { isConnected: hasInternet } = useNetwork()

  function tryStartFastPoll() {
    if (!hasInternet.value || !btDevicePresent.value) return
    if (fastPollMode.value) return // Already polling

    logger.info('BT + Internet - starting fast poll for 1min')
    fastPollMode.value = true

    if (fastPollTimeout) clearTimeout(fastPollTimeout)
    fastPollTimeout = setTimeout(() => {
      logger.info('Fast poll ended (timeout)')
      fastPollMode.value = false
      fastPollTimeout = null
    }, FAST_POLL_DURATION)
  }

  // Called by useBluetooth when device presence changes
  function setBtPresent(present: boolean) {
    btDevicePresent.value = present
    if (present) tryStartFastPoll()
  }

  // Called by useNetwork when internet connects
  function onInternetConnected() {
    tryStartFastPoll()
  }

  // Stop early when playback detected
  function stopFastPoll() {
    if (!fastPollMode.value) return
    logger.info('Fast poll ended (playback detected)')
    fastPollMode.value = false
    if (fastPollTimeout) {
      clearTimeout(fastPollTimeout)
      fastPollTimeout = null
    }
  }

  return {
    fastPollMode,
    setBtPresent,
    onInternetConnected,
    stopFastPoll
  }
}
