// ============================================================
// Settings Composable - File-based persistence via save-settings.sh
// ============================================================

import { ref, readonly } from 'vue'

const NOCTURNED_URL = 'http://127.0.0.1:5000'
const IS_DEV = import.meta.env.DEV

// Button mapping interface
export interface ButtonMapping {
  id: string | null
  type: string | null
  image: string | null
  name: string | null
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
  // Auth tokens (persisted across reboots)
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  // Button mappings (1-4)
  buttonMappings: [null, null, null, null],
  // Bluetooth
  lastBluetoothDevice: null,
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
  // Auth tokens
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: string | null
  // Button mappings (1-4)
  buttonMappings: (ButtonMapping | null)[]
  // Bluetooth
  lastBluetoothDevice: string | null
}

// Singleton state
const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const isLoaded = ref(false)
const isSaving = ref(false)

// Promise to track loading completion (allows multiple callers to await)
let loadingPromise: Promise<void> | null = null

/**
 * Load settings from file (or localStorage in dev mode)
 * Multiple callers can await this - they'll all wait for the same load operation
 */
async function loadSettings(): Promise<void> {
  // If already loaded, return immediately
  if (isLoaded.value) {
    console.log('[Settings] Already loaded, startWithNowPlaying =', settings.value.startWithNowPlaying)
    return
  }

  // If loading is in progress, wait for it
  if (loadingPromise) {
    console.log('[Settings] Loading in progress, waiting...')
    return loadingPromise
  }

  // Start loading
  console.log('[Settings] Starting load...')
  loadingPromise = (async () => {
    try {
      if (IS_DEV) {
        // In dev mode, use localStorage
        const stored = localStorage.getItem('nocturne_settings')
        console.log('[Settings] Dev mode, localStorage:', stored ? 'found' : 'not found')
        if (stored) {
          const parsed = JSON.parse(stored)
          settings.value = { ...DEFAULT_SETTINGS, ...parsed }
          console.log('[Settings] Loaded from localStorage, startWithNowPlaying =', settings.value.startWithNowPlaying)
        } else {
          console.log('[Settings] Using defaults, startWithNowPlaying =', settings.value.startWithNowPlaying)
        }
      } else {
        // On device, read settings.json with cache-busting
        const response = await fetch('/settings.json?t=' + Date.now(), {
          cache: 'no-store'
        })
        if (response.ok) {
          const parsed = await response.json()
          settings.value = { ...DEFAULT_SETTINGS, ...parsed }
          console.log('[Settings] Loaded from file, startWithNowPlaying =', settings.value.startWithNowPlaying)
        } else {
          console.log('[Settings] File not found, using defaults')
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
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
        return true
      }

      // On device, use save-settings.sh via nocturned /device/exec
      const settingsJson = JSON.stringify(settings.value, null, 2)
      const base64Content = btoa(settingsJson)

      console.log('[Settings] Saving to device...')

      const response = await fetch(`${NOCTURNED_URL}/device/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [`/etc/nocturne/ui/save-settings.sh ${base64Content}`]
        })
      })

      if (!response.ok) {
        console.error('[Settings] Save failed:', response.status)
        return false
      }

      const result = await response.json()
      const cmdResult = result.results?.[0]

      if (cmdResult?.exit_code !== 0) {
        console.error('[Settings] Save script failed:', cmdResult?.error || cmdResult?.output)
        return false
      }

      console.log('[Settings] Saved successfully')
      return true
    } catch (err) {
      console.error('[Settings] Save error:', err)
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
