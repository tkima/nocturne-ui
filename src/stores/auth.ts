import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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

// Is dev mode (browser without nocturned)
const IS_DEV_MODE = import.meta.env.DEV

// Nocturned URL for device file operations
// Use localhost (not 127.0.0.1) to match app origin for CORS
const NOCTURNED_URL = 'http://localhost:5000'

// Token file path on device
const TOKEN_FILE_PATH = '/etc/nocturne/tokens.json'

// ============================================================
// File-based Token Persistence (for device)
// ============================================================

interface StoredTokens {
  accessToken: string
  refreshToken: string
  tokenExpiry: string
  clientId?: string
  authType?: string
}

/**
 * Save tokens to file on device via nocturned
 */
async function saveTokensToFile(tokens: StoredTokens): Promise<boolean> {
  if (IS_DEV_MODE) {
    console.log('Token file save skipped (dev mode)')
    return false
  }

  const url = `${NOCTURNED_URL}/device/file/write`
  const body = JSON.stringify({
    path: TOKEN_FILE_PATH,
    content: JSON.stringify(tokens)
  })

  console.log('Saving tokens to file:', { url, path: TOKEN_FILE_PATH })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })

    const responseText = await response.text()
    console.log('Token file save response:', response.status, responseText)

    if (response.ok) {
      console.log('Token file saved successfully')
      return true
    }
    console.error('Token file save failed:', response.status, responseText)
    return false
  } catch (err) {
    console.error('Failed to save tokens to file (network error):', err)
    return false
  }
}

/**
 * Load tokens from file on device via nocturned
 */
async function loadTokensFromFile(): Promise<StoredTokens | null> {
  if (IS_DEV_MODE) return null // Skip in dev mode

  try {
    const response = await fetch(`${NOCTURNED_URL}/device/file/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: TOKEN_FILE_PATH
      })
    })

    if (response.status === 404) {
      console.log('Token file not found on device')
      return null
    }

    if (!response.ok) {
      console.log('Token file load: response not ok', response.status)
      return null
    }

    const result = await response.json()
    console.log('Token file load result:', result)

    if (result.status === 'success' && result.content) {
      const parsed = JSON.parse(result.content)
      console.log('Loaded tokens from file:', { hasAccess: !!parsed.accessToken, hasRefresh: !!parsed.refreshToken })
      return parsed
    }
    return null
  } catch (err) {
    console.error('Failed to load tokens from file:', err)
    return null
  }
}

/**
 * Delete tokens file on device
 */
async function deleteTokensFile(): Promise<boolean> {
  if (IS_DEV_MODE) return false

  try {
    const response = await fetch(`${NOCTURNED_URL}/device/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          `mount -o remount,rw /`,
          `rm -f ${TOKEN_FILE_PATH}`,
          `mount -o remount,ro /`
        ]
      })
    })
    return response.ok
  } catch (err) {
    console.error('Failed to delete tokens file:', err)
    return false
  }
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
  return localStorage.getItem('spotifyClientId') || CLIENT_ID
}

// Check if we should use PKCE auth (custom client ID)
function shouldUsePkceAuth(): boolean {
  const customClientId = localStorage.getItem('spotifyClientId')
  const authType = localStorage.getItem('spotifyAuthType')
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

  // ------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------
  const isAuthenticated = computed(() => !!accessToken.value && !!refreshToken.value)

  const isTokenExpired = computed(() => {
    if (!tokenExpiry.value) return true
    return new Date() >= tokenExpiry.value
  })

  const tokenReady = computed(() => isAuthenticated.value && !isTokenExpired.value)

  // ------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------

  /**
   * Initialize auth state from localStorage (and file on device)
   */
  async function initFromStorage() {
    // First try localStorage (fast, works in dev)
    const storedAccessToken = localStorage.getItem('spotifyAccessToken')
    const storedRefreshToken = localStorage.getItem('spotifyRefreshToken')
    const storedExpiry = localStorage.getItem('spotifyTokenExpiry')

    if (storedAccessToken && storedRefreshToken) {
      accessToken.value = storedAccessToken
      refreshToken.value = storedRefreshToken
      if (storedExpiry) {
        tokenExpiry.value = new Date(storedExpiry)
      }
      return
    }

    // If not in localStorage, try loading from file (device persistence)
    const fileTokens = await loadTokensFromFile()
    if (fileTokens?.accessToken && fileTokens?.refreshToken) {
      accessToken.value = fileTokens.accessToken
      refreshToken.value = fileTokens.refreshToken
      if (fileTokens.tokenExpiry) {
        tokenExpiry.value = new Date(fileTokens.tokenExpiry)
      }
      // Also sync to localStorage for faster access during session
      localStorage.setItem('spotifyAccessToken', fileTokens.accessToken)
      localStorage.setItem('spotifyRefreshToken', fileTokens.refreshToken)
      if (fileTokens.tokenExpiry) {
        localStorage.setItem('spotifyTokenExpiry', fileTokens.tokenExpiry)
      }
      if (fileTokens.clientId) {
        localStorage.setItem('spotifyClientId', fileTokens.clientId)
      }
      console.log('Loaded tokens from persistent file storage')
    }
  }

  /**
   * Start PKCE auth flow - redirects to Spotify
   */
  async function startPkceAuth(clientId?: string) {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(16)

    // Store for callback
    localStorage.setItem('pkce_code_verifier', codeVerifier)
    localStorage.setItem('pkce_state', state)

    const finalClientId = clientId || getClientId()
    if (clientId) {
      localStorage.setItem('spotifyClientId', clientId)
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
      localStorage.removeItem('pkce_code_verifier')
      localStorage.removeItem('pkce_session')
      localStorage.removeItem('pkce_redirect_uri')
      localStorage.removeItem('pkce_state')
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

    localStorage.setItem('pkce_code_verifier', codeVerifier)
    localStorage.setItem('pkce_session', session)

    const params = new URLSearchParams({
      action: 'start',
      client_id: getClientId(),
      session: session,
      code_challenge: codeChallenge,
    })

    const url = `${AUTH_RELAY_URL}?${params.toString()}`
    console.log('Starting relay PKCE auth:', { url: AUTH_RELAY_URL, session, clientId: getClientId(), retryCount })

    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('Relay auth error:', { status: response.status, body: errorText, retryCount })

      // If 400 error (bad request/expired), retry with fresh session
      if (response.status === 400 && retryCount < 2) {
        console.log('Relay returned 400, retrying with fresh session...')
        return startRelayPkceAuth(retryCount + 1)
      }
      throw new Error(`Relay auth failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.redirect_uri) {
      localStorage.setItem('pkce_redirect_uri', data.redirect_uri)
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
          localStorage.setItem('spotifyAuthType', 'device')
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
    const session = localStorage.getItem('pkce_session')
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
    const codeVerifier = localStorage.getItem('pkce_code_verifier')
    const redirectUri = localStorage.getItem('pkce_redirect_uri')

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
    localStorage.removeItem('pkce_code_verifier')
    localStorage.removeItem('pkce_session')
    localStorage.removeItem('pkce_redirect_uri')
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
    const storedState = localStorage.getItem('pkce_state')
    if (state !== storedState) {
      error.value = 'State mismatch - possible CSRF attack'
      return false
    }

    // Get stored verifier
    const codeVerifier = localStorage.getItem('pkce_code_verifier')
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
      localStorage.removeItem('pkce_code_verifier')
      localStorage.removeItem('pkce_state')

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
   * Refresh access token
   */
  async function refreshAccessToken(): Promise<boolean> {
    if (!refreshToken.value) {
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
          logout()
          throw new Error('invalid_grant')
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
   * Save tokens to state, localStorage, and persistent file
   */
  async function saveTokens(tokens: {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }) {
    const expiryDate = new Date()
    expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600) - 600)

    accessToken.value = tokens.access_token
    tokenExpiry.value = expiryDate

    localStorage.setItem('spotifyAccessToken', tokens.access_token)
    localStorage.setItem('spotifyTokenExpiry', expiryDate.toISOString())
    localStorage.setItem('spotifyAuthType', 'pkce')
    localStorage.setItem('_debug_auth_saved', new Date().toISOString())

    if (tokens.refresh_token) {
      refreshToken.value = tokens.refresh_token
      localStorage.setItem('spotifyRefreshToken', tokens.refresh_token)
    }

    console.log('localStorage saved:', {
      hasAccessToken: !!localStorage.getItem('spotifyAccessToken'),
      hasRefreshToken: !!localStorage.getItem('spotifyRefreshToken'),
      debugTime: localStorage.getItem('_debug_auth_saved')
    })

    // Also save to persistent file on device
    const fileTokens: StoredTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken.value || '',
      tokenExpiry: expiryDate.toISOString(),
      clientId: getClientId(),
      authType: 'pkce'
    }
    console.log('Attempting to save tokens to file...', { IS_DEV_MODE, fileTokens: { hasAccess: !!fileTokens.accessToken, hasRefresh: !!fileTokens.refreshToken } })

    // Await the file save to ensure it completes before navigation
    try {
      const saved = await saveTokensToFile(fileTokens)
      console.log('Token file save result:', saved)
    } catch (err) {
      console.error('Token file save error:', err)
    }
  }

  /**
   * Logout - clear all auth data
   */
  function logout() {
    accessToken.value = null
    refreshToken.value = null
    tokenExpiry.value = null
    error.value = null

    localStorage.removeItem('spotifyAccessToken')
    localStorage.removeItem('spotifyRefreshToken')
    localStorage.removeItem('spotifyTokenExpiry')
    localStorage.removeItem('spotifyAuthType')
    localStorage.removeItem('pkce_code_verifier')
    localStorage.removeItem('pkce_state')

    // Also delete persistent file on device
    deleteTokensFile()
  }

  /**
   * Check if token needs refresh and refresh if needed
   */
  async function ensureValidToken(): Promise<string | null> {
    if (!isAuthenticated.value) {
      return null
    }

    if (isTokenExpired.value) {
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

    // Actions
    initFromStorage,
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
