import { ref } from 'vue'
import { logger } from '@/utils/logger'

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

  function saveButtonMapping(buttonNumber: string) {
    const { contentId, contentType, contentImage, contentName } = options()

    if (!contentId || !contentType) {
      logger.warn('Cannot save button mapping - no content', { contentId, contentType })
      return
    }

    localStorage.setItem(`button${buttonNumber}Id`, contentId)
    localStorage.setItem(`button${buttonNumber}Type`, contentType)

    let imageToSave = contentImage
    if (contentType === 'liked-songs' && !imageToSave) {
      imageToSave = '/images/liked-songs.webp'
    }
    localStorage.setItem(`button${buttonNumber}Image`, imageToSave || '')
    localStorage.setItem(`button${buttonNumber}Name`, contentName || '')

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
export function getPreset(buttonNumber: string) {
  return {
    id: localStorage.getItem(`button${buttonNumber}Id`),
    type: localStorage.getItem(`button${buttonNumber}Type`),
    image: localStorage.getItem(`button${buttonNumber}Image`),
    name: localStorage.getItem(`button${buttonNumber}Name`),
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

  switch (preset.type) {
    case 'playlist':
      await playFn({ context_uri: `spotify:playlist:${preset.id}` })
      break
    case 'album':
      await playFn({ context_uri: `spotify:album:${preset.id}` })
      break
    case 'artist':
      await playFn({ context_uri: `spotify:artist:${preset.id}` })
      break
    case 'show':
      await playFn({ context_uri: `spotify:show:${preset.id}` })
      break
    case 'liked-songs':
      // For liked songs, we'd need track URIs stored separately
      const tracksJson = localStorage.getItem(`button${buttonNumber}Tracks`)
      if (tracksJson) {
        const uris = JSON.parse(tracksJson)
        await playFn({ uris })
      }
      break
  }

  return true
}
