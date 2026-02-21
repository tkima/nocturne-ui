import { ref } from 'vue'
import { logger } from '@/utils/logger'
import { buildSpotifyUri } from '@/utils/spotify'
import { useSettings, type ButtonMapping } from '@/composables/useSettings'

interface ButtonMappingOptions {
  contentId: string | null
  contentType: 'playlist' | 'album' | 'artist' | 'show' | 'liked-songs' | null
  contentImage: string
  contentName: string
  isActive: boolean
  onLongPress?: () => void // Called when long press triggers, to tell global handler to ignore keyup
}

const LONG_PRESS_DURATION = 2000 // 2 seconds for long press

// Global state for communication between mapping (long press) and playback (short press)
let ignoreNextRelease = false

export function setIgnoreNextRelease() {
  ignoreNextRelease = true
}

export function shouldIgnoreRelease(): boolean {
  if (ignoreNextRelease) {
    ignoreNextRelease = false
    return true
  }
  return false
}

export function useButtonMapping(options: () => ButtonMappingOptions) {
  const showMappingOverlay = ref(false)
  const activeButton = ref<string | null>(null)
  const longPressTimers: Record<string, ReturnType<typeof setTimeout> | null> = {}
  let isMappingRef = false

  async function saveButtonMapping(buttonNumber: string) {
    const { contentId, contentType, contentImage, contentName } = options()

    if (!contentId || !contentType) {
      logger.warn('Cannot save button mapping - no content', { contentId, contentType })
      return
    }

    let imageToSave = contentImage
    if (contentType === 'liked-songs' && !imageToSave) {
      imageToSave = '/images/liked-songs.webp'
    }

    const { settings, set } = useSettings()
    const index = parseInt(buttonNumber) - 1 // Convert "1"-"4" to 0-3
    const mapping: ButtonMapping = {
      id: contentId,
      type: contentType,
      image: imageToSave || null,
      name: contentName || null,
    }

    // Update the button mapping at the correct index
    const newMappings: (ButtonMapping | null)[] = settings.value.buttonMappings.map(m =>
      m ? { ...m, tracks: m.tracks ? [...m.tracks] : null } : null
    )
    newMappings[index] = mapping
    await set('buttonMappings', newMappings)

    logger.info('Button mapping saved', {
      button: buttonNumber,
      contentId,
      contentType,
      contentName
    })
  }

  function handleKeyDown(e: KeyboardEvent) {
    const { isActive } = options()
    if (!isActive) return

    const validButtons = ['1', '2', '3', '4']
    const buttonNumber = e.key

    if (!validButtons.includes(buttonNumber)) return
    if (isMappingRef) return

    if (!longPressTimers[buttonNumber]) {
      logger.info('Starting long press timer', { buttonNumber })
      longPressTimers[buttonNumber] = setTimeout(() => {
        logger.info('Long press triggered!', { buttonNumber })
        isMappingRef = true

        // Tell global handler to ignore the next keyup (so it doesn't play the preset)
        setIgnoreNextRelease()

        // Call optional callback
        const { onLongPress } = options()
        if (onLongPress) onLongPress()

        saveButtonMapping(buttonNumber)

        activeButton.value = buttonNumber
        showMappingOverlay.value = true

        setTimeout(() => {
          showMappingOverlay.value = false
          activeButton.value = null
          isMappingRef = false
        }, 1500)

        longPressTimers[buttonNumber] = null
      }, LONG_PRESS_DURATION)
    }

    e.preventDefault()
  }

  function handleKeyUp(e: KeyboardEvent) {
    const { isActive } = options()
    if (!isActive) return

    const validButtons = ['1', '2', '3', '4']
    const buttonNumber = e.key

    if (!validButtons.includes(buttonNumber)) return

    if (longPressTimers[buttonNumber]) {
      clearTimeout(longPressTimers[buttonNumber]!)
      longPressTimers[buttonNumber] = null
    }

    e.preventDefault()
  }

  function startListening() {
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
  }

  function stopListening() {
    window.removeEventListener('keydown', handleKeyDown, { capture: true })
    window.removeEventListener('keyup', handleKeyUp, { capture: true })

    // Clear any pending timers
    Object.keys(longPressTimers).forEach((key) => {
      if (longPressTimers[key]) {
        clearTimeout(longPressTimers[key]!)
        longPressTimers[key] = null
      }
    })
  }

  return {
    showMappingOverlay,
    activeButton,
    startListening,
    stopListening,
  }
}

// Helper to get saved preset
export function getPreset(buttonNumber: string): ButtonMapping {
  const { settings } = useSettings()
  const index = parseInt(buttonNumber) - 1 // Convert "1"-"4" to 0-3
  const mapping = settings.value.buttonMappings[index]
  if (!mapping) {
    return { id: null, type: null, image: null, name: null }
  }
  // Create mutable copy from readonly settings
  return {
    id: mapping.id,
    type: mapping.type,
    image: mapping.image,
    name: mapping.name,
    tracks: mapping.tracks ? [...mapping.tracks] : null,
  }
}

// Helper to play a preset
export async function playPreset(
  buttonNumber: string,
  playFn: (options: { context_uri?: string; uris?: string[] }) => Promise<void>
) {
  const preset = getPreset(buttonNumber)
  if (!preset.id || !preset.type) {
    logger.info('No preset mapped for button', { button: buttonNumber })
    return false
  }

  logger.info('Playing preset', { button: buttonNumber, ...preset })

  if (preset.type === 'liked-songs') {
    // For liked songs, track URIs are stored in the mapping
    if (preset.tracks && preset.tracks.length > 0) {
      await playFn({ uris: preset.tracks })
    }
  } else {
    await playFn({ context_uri: buildSpotifyUri(preset.type, preset.id) })
  }

  return true
}
