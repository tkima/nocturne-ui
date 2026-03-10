import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettings } from '@/composables/useSettings'
import { useNetwork } from '@/composables/useNetwork'
import { createLogger } from '@/utils/debug'

const log = createLogger('Auth')

// ============================================================
// Auth Store - Spotify Authentication (Device Auth + PKCE)
// ============================================================

// Spotify OAuth scopes (matching React version)
const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played user-top-read user-library-read user-library-modify playlist-read-private playlist-read-collaborative user-follow-read'

// Client IDs from environment
const SPOTIFY_CLIENT_ID_SHARED = import.meta.env.VITE_SPOTIFY_CLIENT_ID_SHARED || ''
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID_SHARED

// Auth relay URL for PKCE (if configured)
const AUTH_RELAY_URL = import.meta.env.VITE_AUTH_RELAY_URL || ''

// Is dev mode (browser)
const IS_DEV_MODE = import.meta.env.DEV

// Get settings composable (singleton)
let settingsInstance: ReturnType<typeof useSettings> | null = null
function getSettings() {
  if (!settingsInstance) {
    settingsInstance = useSettings()
  }
  return settingsInstance
}

// ============================================================
// PKCE Helper Functions
// ============================================================

function generateRandomString(length: number): string {
  // Use only alphanumeric chars for session IDs (relay-safe)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i]! % chars.length]
  }
  return result
}

function generateCodeVerifier(): string {
  return generateRandomString(64)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getRedirectUri(): string {
  // Use env variable if set (for production with external redirect handler)
  const envRedirectUri = import.meta.env.VITE_REDIRECT_URI
  if (envRedirectUri) {
    return envRedirectUri
  }
  // Default: use current origin (localhost in dev)
  const origin = window.location.origin.replace('localhost', '127.0.0.1')
  return `${origin}/auth/callback`
}


function getClientId(): string {
  const { settings } = useSettings()
  return settings.value.spotifyClientId || CLIENT_ID
}

// Check if we should use PKCE auth (custom client ID)
function shouldUsePkceAuth(): boolean {
  const { settings } = useSettings()
  const customClientId = settings.value.spotifyClientId
  const authType = settings.value.spotifyAuthType
  const hasCustomEnvClientId = CLIENT_ID && CLIENT_ID !== SPOTIFY_CLIENT_ID_SHARED
  return !!customClientId || hasCustomEnvClientId || authType === 'pkce'
}

// Check if relay auth is available
function hasRelayAuth(): boolean {
  return !!AUTH_RELAY_URL
}

// ============================================================
// Store Definition
// ============================================================

export const useAuthStore = defineStore('auth', () => {
  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const tokenExpiry = ref<Date | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Device auth state (for QR code flow)
  const authData = ref<{
    verification_uri_complete?: string
    device_code?: string | null
    interval?: number
    auth_type?: string
    session?: string
    state?: string
  } | null>(null)

  // Polling refs
  let pollingIntervalId: ReturnType<typeof setInterval> | null = null
  let currentDeviceCode: string | null = null

  // Refresh lock — prevents concurrent refresh attempts
  let refreshPromise: Promise<boolean> | null = null

  // ------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------
  const isAuthenticated = computed(() => !!accessToken.value && !!refreshToken.value)

  const isTokenExpired = computed(() => {
    if (!tokenExpiry.value) return true
    return new Date() >= tokenExpiry.value
  })

  const tokenReady = computed(() => isAuthenticated.value && !isTokenExpired.value)

  // Combined check: authenticated + network connected (single source of truth for API calls)
  const { isConnected: networkConnected } = useNetwork()
  const isConnected = computed(() => isAuthenticated.value && networkConnected.value === true)

  // ------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------

  /**
   * Start PKCE auth flow - redirects to Spotify
   */
  async function startPkceAuth(clientId?: string) {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(16)

    // Store for callback (use settings, not localStorage)
    const { set } = getSettings()
    await set('pkceCodeVerifier', codeVerifier)
    await set('pkceState', state)

    const finalClientId = clientId || getClientId()
    if (clientId) {
      await set('spotifyClientId', clientId)
    }

    const params = new URLSearchParams({
      client_id: finalClientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: SCOPES,
      state: state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    })

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
  }

  /**
   * Initialize auth - decides between device auth and PKCE based on config
   * Returns auth data with verification_uri_complete for QR code display
   */
  async function initAuth(): Promise<typeof authData.value> {
    // In dev mode, use browser-based PKCE (redirects)
    if (IS_DEV_MODE) {
      await startPkceAuth()
      return null
    }

    isLoading.value = true
    error.value = null

    try {
      // Stop any existing polling
      stopPolling()

      // Clear old PKCE session data to force a fresh session
      const { set } = getSettings()
      await set('pkceCodeVerifier', null)
      await set('pkceSession', null)
      await set('pkceRedirectUri', null)
      await set('pkceState', null)
      authData.value = null

      // Check if we should use PKCE auth
      if (shouldUsePkceAuth()) {
        const data = await startPkceAuthFlow()
        authData.value = data
        return data
      }

      // Default: Device Authorization flow
      const data = await deviceAuthorize()
      authData.value = data
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize authentication'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Device Authorization flow - returns verification URL for QR code
   */
  async function deviceAuthorize() {
    const response = await fetch('https://accounts.spotify.com/oauth2/device/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'Spotify/125700463 Win32_x86_64/0 (PC desktop)',
        'accept-language': 'en-Latn-US,en-US;q=0.9,en-Latn;q=0.8,en;q=0.7',
      },
      body: new URLSearchParams({
        client_id: getClientId(),
        creation_point: `https://login.app.spotify.com/?client_id=${getClientId()}&utm_source=spotify&utm_medium=desktop-win32&utm_campaign=organic`,
        intent: 'login',
        scope: SCOPES,
      }).toString(),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Device auth failed: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    return { ...data, auth_type: 'device' }
  }

  /**
   * PKCE auth flow via relay or nocturned
   */
  async function startPkceAuthFlow() {
    if (hasRelayAuth()) {
      return startRelayPkceAuth()
    }
    return startNocturnedPkceAuth()
  }

  /**
   * Start PKCE auth via external relay
   */
  async function startRelayPkceAuth(retryCount = 0) {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const session = generateRandomString(16)

    const { set } = getSettings()
    await set('pkceCodeVerifier', codeVerifier)
    await set('pkceSession', session)

    const params = new URLSearchParams({
      action: 'start',
      client_id: getClientId(),
      session: session,
      code_challenge: codeChallenge,
    })

    const url = `${AUTH_RELAY_URL}?${params.toString()}`
    log.info(`Starting relay PKCE auth: session=${session}, retryCount=${retryCount}`)

    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      log.error(`Relay auth error: status=${response.status}, retryCount=${retryCount}`)

      // If 400 error (bad request/expired), retry with fresh session
      if (response.status === 400 && retryCount < 2) {
        log.info('Relay returned 400, retrying with fresh session...')
        return startRelayPkceAuth(retryCount + 1)
      }
      throw new Error(`Relay auth failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.redirect_uri) {
      await set('pkceRedirectUri', data.redirect_uri)
    }

    return {
      verification_uri_complete: data.auth_url,
      session: data.session,
      device_code: null,
      auth_type: 'pkce',
    }
  }

  /**
   * Start PKCE auth via nocturned daemon
   */
  async function startNocturnedPkceAuth() {
    const response = await fetch('http://127.0.0.1:5000/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: getClientId(),
        redirect_uri: 'http://127.0.0.1:5000/auth/callback',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Nocturned auth failed: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    return {
      verification_uri_complete: data.auth_url,
      state: data.state,
      device_code: null,
      auth_type: 'pkce',
    }
  }

  /**
   * Poll for auth completion (device auth flow)
   */
  function pollAuthStatus(deviceCode: string | null) {
    // For PKCE with relay, poll the relay
    if (!deviceCode && hasRelayAuth()) {
      pollRelayForCode()
      return
    }

    // For PKCE without relay, tokens come via WebSocket (not implemented in Vue yet)
    if (!deviceCode) {
      console.log('PKCE auth: waiting for tokens via WebSocket')
      return
    }

    // Device auth: poll Spotify for token
    stopPolling()
    currentDeviceCode = deviceCode

    const intervalTime = (authData.value?.interval || 5) * 1000

    const poll = async () => {
      if (isAuthenticated.value || currentDeviceCode !== deviceCode) {
        stopPolling()
        return
      }

      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: getClientId(),
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }).toString(),
        })

        if (response.status === 400) {
          const errorData = await response.json()
          if (errorData.error === 'authorization_pending') {
            return // Keep polling
          }
          throw new Error(errorData.error_description || 'Authorization failed')
        }

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`)
        }

        const tokens = await response.json()
        if (tokens.access_token) {
          stopPolling()
          saveTokens(tokens)
          const { set } = getSettings()
          await set('spotifyAuthType', 'device')
        }
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('authorization_pending')) {
          console.error('Auth polling error:', err)
        }
      }
    }

    pollingIntervalId = setInterval(poll, intervalTime)
  }

  /**
   * Poll relay for auth code (PKCE flow)
   */
  async function pollRelayForCode() {
    const { settings } = useSettings()
    const session = settings.value.pkceSession
    if (!session) return

    stopPolling()

    const poll = async () => {
      if (isAuthenticated.value) {
        stopPolling()
        return
      }

      try {
        const params = new URLSearchParams({ action: 'check', session })
        const response = await fetch(`${AUTH_RELAY_URL}?${params.toString()}`)

        if (!response.ok) {
          if (response.status === 404) return // Still waiting
          if (response.status === 400) {
            // Session expired - restart auth flow
            console.log('Relay session expired (400), restarting auth...')
            stopPolling()
            error.value = null
            // Trigger a fresh auth flow
            const newAuth = await startRelayPkceAuth()
            if (newAuth) {
              authData.value = newAuth
              pollRelayForCode() // Start polling new session
            }
            return
          }
          throw new Error(`Relay check failed: ${response.status}`)
        }

        const result = await response.json()
        if (result.code) {
          stopPolling()
          await exchangeCodeForTokens(result.code)
        }
      } catch (err) {
        console.error('Relay polling error:', err)
      }
    }

    pollingIntervalId = setInterval(poll, 3000)
    poll() // Poll immediately
  }

  /**
   * Exchange auth code for tokens (PKCE flow)
   */
  async function exchangeCodeForTokens(code: string) {
    const { settings, set } = getSettings()
    const codeVerifier = settings.value.pkceCodeVerifier
    const redirectUri = settings.value.pkceRedirectUri

    if (!codeVerifier || !redirectUri) {
      throw new Error('Missing PKCE state')
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Token exchange failed: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const tokens = await response.json()
    saveTokens(tokens)

    // Clean up PKCE state
    await set('pkceCodeVerifier', null)
    await set('pkceSession', null)
    await set('pkceRedirectUri', null)
  }

  /**
   * Stop auth polling
   */
  function stopPolling() {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId)
      pollingIntervalId = null
    }
    currentDeviceCode = null
  }

  /**
   * Handle callback from Spotify - exchange code for tokens
   */
  async function handleCallback(): Promise<boolean> {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')

    if (errorParam) {
      error.value = `Spotify auth error: ${errorParam}`
      return false
    }

    if (!code) {
      return false
    }

    // Verify state
    const { settings, set } = getSettings()
    const storedState = settings.value.pkceState
    if (state !== storedState) {
      error.value = 'State mismatch - possible CSRF attack'
      return false
    }

    // Get stored verifier
    const codeVerifier = settings.value.pkceCodeVerifier
    if (!codeVerifier) {
      error.value = 'No code verifier found - auth flow corrupted'
      return false
    }

    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: getClientId(),
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: getRedirectUri(),
          code_verifier: codeVerifier,
        }).toString(),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Token exchange failed: ${response.status} - ${JSON.stringify(errorData)}`)
      }

      const tokens = await response.json()
      saveTokens(tokens)

      // Clean up PKCE storage
      await set('pkceCodeVerifier', null)
      await set('pkceState', null)

      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname)

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Token exchange failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh access token (with lock — concurrent callers share one request)
   */
  async function refreshAccessToken(): Promise<boolean> {
    // If a refresh is already in flight, piggyback on it
    if (refreshPromise) {
      log.info('Refresh already in progress, awaiting existing request')
      return refreshPromise
    }

    refreshPromise = doRefresh()
    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  async function doRefresh(): Promise<boolean> {
    if (!refreshToken.value) {
      return false
    }

    // Skip if network is down — don't waste time on a fetch that will timeout
    if (networkConnected.value !== true) {
      log.warn('Refresh skipped - no network')
      return false
    }

    isLoading.value = true

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: getClientId(),
          grant_type: 'refresh_token',
          refresh_token: refreshToken.value,
        }).toString(),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (errorData?.error === 'invalid_grant') {
          log.warn('Refresh token revoked (invalid_grant) - logging out')
          await logout()
          return false
        }
        throw new Error(`Token refresh failed: ${response.status}`)
      }

      const tokens = await response.json()
      saveTokens(tokens)

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Token refresh failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Save tokens to state and settings
   */
  async function saveTokens(tokens: {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }) {
    log.info('saveTokens called')
    const expiryDate = new Date()
    expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600) - 600)

    accessToken.value = tokens.access_token
    tokenExpiry.value = expiryDate

    if (tokens.refresh_token) {
      refreshToken.value = tokens.refresh_token
    }

    // Save to settings (persists across reboots)
    log.info('Saving to settings...')
    const { set } = getSettings()
    await set('accessToken', tokens.access_token)
    await set('tokenExpiry', expiryDate.toISOString())
    if (tokens.refresh_token) {
      await set('refreshToken', tokens.refresh_token)
    }

    log.success(`Tokens saved: access=${!!accessToken.value}, refresh=${!!refreshToken.value}`)
  }

  /**
   * Logout - clear all auth data
   */
  async function logout() {
    log.warn('logout() called - clearing all tokens')
    accessToken.value = null
    refreshToken.value = null
    tokenExpiry.value = null
    error.value = null

    // Clear all auth data from settings
    log.warn('Clearing tokens from settings')
    const { set } = getSettings()
    await set('accessToken', null)
    await set('refreshToken', null)
    await set('tokenExpiry', null)
    await set('pkceCodeVerifier', null)
    await set('pkceState', null)
    await set('pkceSession', null)
    await set('pkceRedirectUri', null)
  }

  /**
   * Check if token needs refresh and refresh if needed
   * Safe to call concurrently — refresh lock prevents duplicate requests
   */
  async function ensureValidToken(): Promise<string | null> {
    if (!isAuthenticated.value) {
      return null
    }

    if (isTokenExpired.value) {
      log.info('Token expired, refreshing...')
      const success = await refreshAccessToken()
      if (!success) {
        return null
      }
    }

    return accessToken.value
  }

  return {
    // State
    accessToken,
    refreshToken,
    tokenExpiry,
    isLoading,
    error,
    authData,

    // Getters
    isAuthenticated,
    isTokenExpired,
    tokenReady,
    isConnected,

    // Actions
    initAuth,
    startPkceAuth,
    pollAuthStatus,
    stopPolling,
    handleCallback,
    refreshAccessToken,
    saveTokens,
    logout,
    ensureValidToken,
  }
})
