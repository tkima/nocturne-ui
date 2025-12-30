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

/**
 * Load settings from file (or localStorage in dev mode)
 */
async function loadSettings(): Promise<void> {
  if (isLoaded.value) return

  try {
    if (IS_DEV) {
      // In dev mode, use localStorage
      const stored = localStorage.getItem('nocturne_settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      }
    } else {
      // On device, read settings.json with cache-busting
      const response = await fetch('/settings.json?t=' + Date.now(), {
        cache: 'no-store'
      })
      if (response.ok) {
        const parsed = await response.json()
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }

  isLoaded.value = true
}

/**
 * Save settings to file (or localStorage in dev mode)
 */
async function saveSettings(): Promise<boolean> {
  if (isSaving.value) return false
  isSaving.value = true

  try {
    if (IS_DEV) {
      // In dev mode, use localStorage
      localStorage.setItem('nocturne_settings', JSON.stringify(settings.value))
      isSaving.value = false
      return true
    }

    // On device, use save-settings.sh via nocturned /device/exec
    const settingsJson = JSON.stringify(settings.value, null, 2)
    const base64Content = btoa(settingsJson)

    const response = await fetch(`${NOCTURNED_URL}/device/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [`/etc/nocturne/ui/save-settings.sh ${base64Content}`]
      })
    })

    if (!response.ok) {
      console.error('Failed to save settings:', response.status)
      isSaving.value = false
      return false
    }

    const result = await response.json()
    const cmdResult = result.results?.[0]

    if (cmdResult?.exit_code !== 0) {
      console.error('Save settings script failed:', cmdResult?.error || cmdResult?.output)
      isSaving.value = false
      return false
    }

    isSaving.value = false
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    isSaving.value = false
    return false
  }
}

/**
 * Get a setting value
 */
function get<K extends keyof Settings>(key: K): Settings[K] {
  return settings.value[key]
}

/**
 * Set a setting value and save
 */
async function set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  settings.value[key] = value
  await saveSettings()
}

// Type for boolean-only settings keys
export type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

/**
 * Toggle a boolean setting and save
 */
async function toggle(key: BooleanSettingKey): Promise<void> {
  (settings.value[key] as boolean) = !settings.value[key]
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
