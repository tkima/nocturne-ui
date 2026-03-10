import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useSpotifyStore } from '@/stores/spotify'
import { getPreset } from '@/composables/useButtonMapping'
import { useSettings, type ButtonMapping } from '@/composables/useSettings'
import { useToast } from '@/composables/useToast'
import { logger } from '@/utils/logger'
import { buildSpotifyUri } from '@/utils/spotify'

const LONG_PRESS_DURATION = 2000 // 2 seconds for long press to map

/**
 * Composable for global keyboard handlers:
 * - M button: short press = lock screen, long press = power menu
 * - 1-4 buttons: short press = play preset, long press = save mapping
 * - Escape: back navigation from network screen
 */
export function useGlobalKeys() {
  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  const spotifyStore = useSpotifyStore()
  const toast = useToast()

  // Power menu state
  const powerMenuVisible = ref(false)
  const previousRoute = ref('/radio')
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false

  // Button mapping overlay state
  const showMappingOverlay = ref(false)
  const activePresetButton = ref<string | null>(null)
  let isPlayingPreset = false

  // Long press button mapping state
  const buttonHoldTimers: Record<string, ReturnType<typeof setTimeout> | null> = {}
  let longPressButtonTriggered = false

  // ------------------------------------------------------------
  // M Button Handler (lock/power menu)
  // ------------------------------------------------------------
  function handleMKeyDown(e: KeyboardEvent) {
    if (!e.key || e.key.toLowerCase() !== 'm') return
    if (powerMenuVisible.value) return
    if (longPressTriggered) return

    if (!holdTimer) {
      holdTimer = setTimeout(() => {
        longPressTriggered = true
        powerMenuVisible.value = true
        holdTimer = null
      }, 600)
    }
  }

  function handleMKeyUp(e: KeyboardEvent) {
    if (!e.key || e.key.toLowerCase() !== 'm') return

    if (holdTimer) {
      clearTimeout(holdTimer)
      holdTimer = null
    }

    if (longPressTriggered) {
      longPressTriggered = false
      return
    }

    if (powerMenuVisible.value) {
      powerMenuVisible.value = false
      return
    }

    // Short press: toggle lock view
    if (route.path === '/lock') {
      router.push(previousRoute.value || '/radio')
    } else {
      previousRoute.value = route.path
      router.push('/lock')
    }
  }

  // ------------------------------------------------------------
  // Button 1-4 Handlers (presets)
  // ------------------------------------------------------------
  async function saveButtonMapping(buttonNumber: string) {
    // Fetch fresh playback data before saving
    await spotifyStore.fetchCurrentPlayback()

    const { id, type } = spotifyStore.parsedContext
    const image = spotifyStore.albumArt || null

    if (!id || !type) {
      logger.warn('Cannot save button mapping - no mappable content', { id, type })
      return
    }

    // Build context-based mapping (album/playlist/liked-songs, not individual track)
    let contextName: string | null = spotifyStore.contextName
    let trackCount: number | null = null
    let trackUris: string[] | null = null

    if (type === 'liked-songs') {
      contextName = 'Liked Songs'
      trackUris = spotifyStore.savedTracks.map(t => t.uri)
      trackCount = trackUris.length
    } else if (type === 'album') {
      // Album name + total tracks from playback data
      contextName = contextName || 'Unknown Album'
      trackCount = (spotifyStore.currentPlayback as any)?.item?.album?.total_tracks || null
      // If no track count, fetch the album
      if (!trackCount) {
        const album = await spotifyStore.getAlbum(id)
        trackCount = (album as any)?.total_tracks || null
      }
    } else if (type === 'playlist') {
      // Fetch playlist to get name + track count
      const playlist = await spotifyStore.getPlaylist(id)
      contextName = (playlist as any)?.name || 'Unknown Playlist'
      trackCount = (playlist as any)?.items?.total || (playlist as any)?.tracks?.total || null
    } else if (type === 'artist') {
      // Artist top tracks
      contextName = spotifyStore.artistName
      const data = await spotifyStore.getArtistTopTracks(id)
      trackCount = (data as any)?.tracks?.length || null
    }

    const { settings, set } = useSettings()
    const index = parseInt(buttonNumber) - 1
    const mapping: ButtonMapping = {
      id,
      type,
      image: image || null,
      name: contextName || null,
      trackCount: trackCount || null,
      tracks: trackUris || null,
    }

    const newMappings: (ButtonMapping | null)[] = settings.value.buttonMappings.map(m =>
      m ? { ...m, tracks: m.tracks ? [...m.tracks] : null } : null
    )
    newMappings[index] = mapping
    await set('buttonMappings', newMappings)

    logger.info('Button mapping saved', { button: buttonNumber, id, type, name: contextName, trackCount })
  }

  function handleButtonKeyDown(e: KeyboardEvent) {
    const validButtons = ['1', '2', '3', '4']
    if (!validButtons.includes(e.key)) return
    if (!authStore.isAuthenticated || powerMenuVisible.value) return

    const buttonNumber = e.key

    // Don't start a new timer if one is already running
    if (buttonHoldTimers[buttonNumber]) return

    buttonHoldTimers[buttonNumber] = setTimeout(() => {
      // Long press triggered - save mapping
      longPressButtonTriggered = true

      // Only save if we have mappable content
      if (uiStore.mappableContent.id && uiStore.mappableContent.type) {
        saveButtonMapping(buttonNumber)
        toast.success(`Saved to button ${buttonNumber}`)

        // Show the mapping overlay
        activePresetButton.value = buttonNumber
        showMappingOverlay.value = true

        // Hide after a moment
        setTimeout(() => {
          showMappingOverlay.value = false
          activePresetButton.value = null
        }, 1500)
      } else {
        logger.info('No mappable content for long press', { button: buttonNumber })
      }

      buttonHoldTimers[buttonNumber] = null
    }, LONG_PRESS_DURATION)
  }

  async function handleButtonPress(buttonNumber: string) {
    if (!authStore.isAuthenticated || isPlayingPreset || powerMenuVisible.value) return

    const preset = getPreset(buttonNumber)
    if (!preset.id || !preset.type) {
      logger.info('No preset mapped for button', { button: buttonNumber })
      return
    }

    isPlayingPreset = true
    activePresetButton.value = buttonNumber
    showMappingOverlay.value = true

    logger.info('Playing preset', { button: buttonNumber, ...preset })

    try {
      // Enable shuffle so presets don't always play in the same order
      await spotifyStore.setShuffle(true)

      if (preset.type === 'liked-songs') {
        if (preset.tracks && preset.tracks.length > 0) {
          await spotifyStore.play({ uris: preset.tracks })
        }
      } else {
        await spotifyStore.play({
          context_uri: buildSpotifyUri(preset.type, preset.id),
        })
      }

      // Navigate to now playing after successful playback
      setTimeout(() => {
        router.push('/now-playing')
      }, 500)
    } catch (err) {
      logger.error('Failed to play preset', { error: err })
    }

    // Hide overlay after 2 seconds, then refresh playback if on now-playing
    setTimeout(async () => {
      showMappingOverlay.value = false
      activePresetButton.value = null
      isPlayingPreset = false

      // If on now-playing, fetch updated playback to refresh album art
      if (route.path === '/now-playing') {
        await spotifyStore.fetchCurrentPlayback()
      }
    }, 2000)
  }

  function handleButtonKeyUp(e: KeyboardEvent) {
    const validButtons = ['1', '2', '3', '4']
    if (!validButtons.includes(e.key)) return

    const buttonNumber = e.key

    // Clear the long press timer if it's still running
    if (buttonHoldTimers[buttonNumber]) {
      clearTimeout(buttonHoldTimers[buttonNumber]!)
      buttonHoldTimers[buttonNumber] = null
    }

    // Check if long press just triggered (mapping was saved)
    if (longPressButtonTriggered) {
      logger.info('Ignoring button release after long press', { button: buttonNumber })
      longPressButtonTriggered = false
      return
    }

    // Short press - play the preset
    handleButtonPress(buttonNumber)
  }

  // ------------------------------------------------------------
  // Back Button Handler (Escape from network screen)
  // ------------------------------------------------------------
  function handleBackButton(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    router.back()
  }

  // ------------------------------------------------------------
  // Power Menu Actions
  // ------------------------------------------------------------
  function closePowerMenu() {
    powerMenuVisible.value = false
  }

  // ------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------
  function setupListeners() {
    window.addEventListener('keydown', handleMKeyDown, { capture: true })
    window.addEventListener('keyup', handleMKeyUp, { capture: true })
    window.addEventListener('keydown', handleButtonKeyDown)
    window.addEventListener('keyup', handleButtonKeyUp)
    window.addEventListener('keydown', handleBackButton, { capture: true })
  }

  function cleanupListeners() {
    window.removeEventListener('keydown', handleMKeyDown, { capture: true })
    window.removeEventListener('keyup', handleMKeyUp, { capture: true })
    window.removeEventListener('keydown', handleButtonKeyDown)
    window.removeEventListener('keyup', handleButtonKeyUp)
    window.removeEventListener('keydown', handleBackButton, { capture: true })

    if (holdTimer) {
      clearTimeout(holdTimer)
    }
    // Clear any pending button timers
    Object.values(buttonHoldTimers).forEach(timer => {
      if (timer) clearTimeout(timer)
    })
  }

  return {
    // State
    powerMenuVisible,
    showMappingOverlay,
    activePresetButton,

    // Actions
    closePowerMenu,

    // Lifecycle
    setupListeners,
    cleanupListeners
  }
}
