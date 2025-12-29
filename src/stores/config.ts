import { defineStore } from 'pinia'
import { computed } from 'vue'

// ============================================================
// Config Store - Environment detection and app configuration
// ============================================================

export const useConfigStore = defineStore('config', () => {
  // ------------------------------------------------------------
  // Environment Detection
  // ------------------------------------------------------------

  // Check if running on the actual Car Thing device (port 5000 backend available)
  const isDevice = computed(() => {
    // Device runs on localhost with nocturned backend on port 5000
    // Web/dev runs on various ports (7777, 5173, etc.)
    return window.location.hostname === 'localhost' &&
           window.location.port === '' // Device serves on port 80 (no port in URL)
  })

  // Check if running in development mode
  const isDev = computed(() => {
    return import.meta.env.DEV
  })

  // Check if running in production mode
  const isProd = computed(() => {
    return import.meta.env.PROD
  })

  // Check if running on web (browser, not device)
  const isWeb = computed(() => {
    return !isDevice.value
  })

  // ------------------------------------------------------------
  // API Endpoints
  // ------------------------------------------------------------

  // Nocturned backend URL (device control, brightness, etc.)
  const nocturnedUrl = computed(() => {
    if (isDevice.value) {
      return 'http://localhost:5000'
    }
    // In dev/web, nocturned is not available - could proxy or mock
    return 'http://localhost:5000'
  })

  // ------------------------------------------------------------
  // Feature Flags from Environment
  // ------------------------------------------------------------

  const skipTutorial = computed(() => {
    return import.meta.env.VITE_SKIP_TUTORIAL === 'true'
  })

  const dialSeekEnabled = computed(() => {
    return import.meta.env.VITE_DIAL_SEEK_ENABLED !== 'false'
  })

  const analyticsEnabled = computed(() => {
    return import.meta.env.VITE_ANALYTICS_ENABLED !== 'false'
  })

  // ------------------------------------------------------------
  // Spotify Config
  // ------------------------------------------------------------

  const spotifyClientId = computed(() => {
    return import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
           import.meta.env.VITE_SPOTIFY_CLIENT_ID_SHARED ||
           ''
  })

  const redirectUri = computed(() => {
    const envRedirectUri = import.meta.env.VITE_REDIRECT_URI
    if (envRedirectUri) {
      return envRedirectUri
    }
    const origin = window.location.origin.replace('localhost', '127.0.0.1')
    return `${origin}/auth/callback`
  })

  // ------------------------------------------------------------
  // Debug Info
  // ------------------------------------------------------------

  function logEnvironment() {
    console.log('=== Nocturne Config ===')
    console.log('isDev:', isDev.value)
    console.log('isProd:', isProd.value)
    console.log('isDevice:', isDevice.value)
    console.log('isWeb:', isWeb.value)
    console.log('nocturnedUrl:', nocturnedUrl.value)
    console.log('redirectUri:', redirectUri.value)
    console.log('skipTutorial:', skipTutorial.value)
    console.log('dialSeekEnabled:', dialSeekEnabled.value)
    console.log('=======================')
  }

  return {
    // Environment
    isDev,
    isProd,
    isDevice,
    isWeb,

    // URLs
    nocturnedUrl,
    redirectUri,

    // Feature flags
    skipTutorial,
    dialSeekEnabled,
    analyticsEnabled,

    // Spotify
    spotifyClientId,

    // Debug
    logEnvironment,
  }
})
