// ============================================================
// Settings Composable - File-based persistence via save-settings.sh
// ============================================================

import { ref, readonly } from 'vue'
import { createLogger } from '@/utils/debug'
import { useToast } from '@/composables/useToast'

const log = createLogger('Settings')
const NOCTURNED_URL = 'http://127.0.0.1:5000'
const IS_DEV = import.meta.env.DEV

// Button mapping interface
export interface ButtonMapping {
  id: string | null
  type: string | null
  image: string | null
  name: string | null
  trackCount?: number | null  // Total tracks in context (for random offset)
  tracks?: string[] | null    // For liked-songs URIs
}

// Default settings values
const DEFAULT_SETTINGS: Settings = {
  version: 1,
  // General
  startWithNowPlaying: false,
  // Playback
  trackNameScrollingEnabled: true,
  songChangeGestureEnabled: true,
  elapsedTimeEnabled: false,
  dialSeekEnabled: true,
  // Display
  use24HourTime: false,
  showStatusBar: true,
  // Debug
  debugOverlayEnabled: false,
  // Auth (persisted across reboots)
  spotifyClientId: null,
  spotifyAuthType: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  // PKCE auth state (temporary, cleared after auth completes)
  pkceCodeVerifier: null,
  pkceState: null,
  pkceSession: null,
  pkceRedirectUri: null,
  // Button mappings (1-4)
  buttonMappings: [null, null, null, null],
  // Blocklist
  blockedTracks: [],
  // Radio history (persisted so duplicate-skip survives reboots)
  radioTrackHistory: [],
}

export interface Settings {
  version: number
  // General
  startWithNowPlaying: boolean
  // Playback
  trackNameScrollingEnabled: boolean
  songChangeGestureEnabled: boolean
  elapsedTimeEnabled: boolean
  dialSeekEnabled: boolean
  // Display
  use24HourTime: boolean
  showStatusBar: boolean
  // Debug
  debugOverlayEnabled: boolean
  // Auth
  spotifyClientId: string | null
  spotifyAuthType: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: string | null
  // PKCE auth state (temporary, cleared after auth completes)
  pkceCodeVerifier: string | null
  pkceState: string | null
  pkceSession: string | null
  pkceRedirectUri: string | null
  // Button mappings (1-4)
  buttonMappings: (ButtonMapping | null)[]
  // Blocklist
  blockedTracks: { id: string; name: string; artist: string }[]
  // Radio history (persisted so duplicate-skip survives reboots)
  radioTrackHistory: string[]
}

// Singleton state
const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const isLoaded = ref(false)
const isSaving = ref(false)
const loadSucceeded = ref(false)  // Track if settings.json was found

// Promise to track loading completion (allows multiple callers to await)
let loadingPromise: Promise<void> | null = null

/**
 * Load settings from file (or localStorage in dev mode)
 * Multiple callers can await this - they'll all wait for the same load operation
 */
async function loadSettings(): Promise<void> {
  // If already loaded, return immediately
  if (isLoaded.value) {
    log.info('Already loaded')
    return
  }

  // If loading is in progress, wait for it
  if (loadingPromise) {
    log.info('Loading in progress, waiting...')
    return loadingPromise
  }

  // Start loading
  log.info('Starting load...')
  loadingPromise = (async () => {
    try {
      if (IS_DEV) {
        // In dev mode, use localStorage
        const stored = localStorage.getItem('nocturne_settings')
        log.info(`Dev mode, localStorage: ${stored ? 'found' : 'not found'}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          settings.value = { ...DEFAULT_SETTINGS, ...parsed }
          loadSucceeded.value = true
          log.success('Loaded from localStorage')
        } else {
          loadSucceeded.value = true  // OK to save in dev mode even if no prior settings
          log.info('Using defaults')
        }
      } else {
        // On device, read settings.json with retries
        let loaded = false
        for (let attempt = 1; attempt <= 3; attempt++) {
          const response = await fetch('/settings.json?t=' + Date.now(), {
            cache: 'no-store'
          })
          if (response.ok) {
            const parsed = await response.json()
            settings.value = { ...DEFAULT_SETTINGS, ...parsed }
            loadSucceeded.value = true
            loaded = true
            log.success('Loaded from file')
            break
          }
          if (attempt < 3) {
            log.warn(`settings.json not found, retrying... (${3 - attempt} left)`)
            await new Promise(r => setTimeout(r, 1000))
          }
        }
        if (!loaded) {
          loadSucceeded.value = false  // Block saves - file not found
          log.error('settings.json not found after 3 attempts! Saves will be blocked.')
          // Show toast to user
          try {
            const toast = useToast()
            toast.error('settings.json not found - settings cannot be saved', 5000)
          } catch {
            // Toast may not be available during early boot
          }
        }
      }
    } catch (err) {
      log.error(`Failed to load: ${err}`)
    }

    isLoaded.value = true
    loadingPromise = null
  })()

  return loadingPromise
}

// Queue to handle concurrent save requests
let savePromise: Promise<boolean> | null = null

/**
 * Save settings to file (or localStorage in dev mode)
 * Queues saves to prevent concurrent writes
 */
async function saveSettings(): Promise<boolean> {
  // Block saves if settings.json was never loaded successfully (prevents overwriting with defaults)
  if (!loadSucceeded.value) {
    log.warn('Blocking save - settings.json was not found, cannot save to prevent data loss')
    return false
  }

  // If a save is in progress, wait for it then save again with latest values
  if (savePromise) {
    await savePromise
  }

  isSaving.value = true

  savePromise = (async () => {
    try {
      if (IS_DEV) {
        // In dev mode, use localStorage
        localStorage.setItem('nocturne_settings', JSON.stringify(settings.value))
        log.success('Saved to localStorage')
        return true
      }

      // On device, use save-settings.sh via nocturned /device/exec
      const settingsJson = JSON.stringify(settings.value, null, 2)
      const base64Content = btoa(settingsJson)

      log.info('Saving to device...')

      const response = await fetch(`${NOCTURNED_URL}/device/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [`/etc/nocturne/ui/save-settings.sh ${base64Content}`]
        })
      })

      if (!response.ok) {
        log.error(`Save failed: ${response.status}`)
        return false
      }

      const result = await response.json()
      const cmdResult = result.results?.[0]

      if (cmdResult?.exit_code !== 0) {
        log.error(`Save script failed: ${cmdResult?.error || cmdResult?.output}`)
        return false
      }

      log.success('Saved to file')
      return true
    } catch (err) {
      log.error(`Save error: ${err}`)
      return false
    } finally {
      isSaving.value = false
      savePromise = null
    }
  })()

  return savePromise
}

/**
 * Get a setting value
 */
function get<K extends keyof Settings>(key: K): Settings[K] {
  return settings.value[key]
}

/**
 * Set a setting value and save
 * Ensures settings are loaded first to prevent overwriting with defaults
 */
async function set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  // Ensure settings are loaded before modifying to prevent overwriting with defaults
  await loadSettings()
  settings.value[key] = value
  await saveSettings()
}

// Type for boolean-only settings keys
export type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

/**
 * Toggle a boolean setting and save
 * Ensures settings are loaded first to prevent overwriting with defaults
 */
async function toggle(key: BooleanSettingKey): Promise<void> {
  // Ensure settings are loaded before modifying to prevent overwriting with defaults
  await loadSettings()
  ;(settings.value[key] as boolean) = !settings.value[key]
  await saveSettings()
}

/**
 * Composable hook
 */
export function useSettings() {
  // Load settings on first use
  if (!isLoaded.value) {
    loadSettings()
  }

  return {
    settings: readonly(settings),
    isLoaded: readonly(isLoaded),
    isSaving: readonly(isSaving),
    loadSettings,
    saveSettings,
    get,
    set,
    toggle,
  }
}
