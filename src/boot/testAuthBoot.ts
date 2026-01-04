/**
 * Test Auth Boot Script
 * Simulates the boot auth flow using the same functions as the real boot sequence.
 * Can be triggered from debug overlay or console to test auth without full reboot.
 *
 * Usage (from console): window.testAuthBoot()
 */

import { createSettingsComponent } from './SettingsComponent'
import { createAuthComponent } from './AuthComponent'
import { useAuthStore } from '@/stores/auth'
import { useSettings } from '@/composables/useSettings'
import { createLogger } from '@/utils/debug'

const log = createLogger('TestBoot')

/**
 * Run the auth boot test sequence
 * This mimics Phase 1 of the real boot sequence
 */
export async function testAuthBoot(): Promise<{
  success: boolean
  settingsLoaded: boolean
  hasTokens: boolean
  tokenValid: boolean
  isAuthenticated: boolean
  networkConnected: boolean | null
}> {
  log.info('════════════════════════════════════════')
  log.info('       TEST AUTH BOOT STARTED')
  log.info('════════════════════════════════════════')

  const startTime = Date.now()
  const result = {
    success: false,
    settingsLoaded: false,
    hasTokens: false,
    tokenValid: false,
    isAuthenticated: false,
    networkConnected: null as boolean | null,
  }

  try {
    // Step 0: Check network first (informational, doesn't block)
    log.info('Step 0: Checking network status...')
    const networkStatus = await testNetworkCheck()
    result.networkConnected = networkStatus
    log.info(`Network: ${networkStatus ? 'connected' : 'disconnected'}`)

    // Step 1: Load settings
    log.info('────────────────────────────────────────')
    log.info('Step 1: Loading settings...')
    const settingsComponent = createSettingsComponent()
    await settingsComponent.startup()
    const settingsOk = await settingsComponent.init()

    if (!settingsOk) {
      log.error('Settings failed to load!')
      return result
    }

    result.settingsLoaded = true
    log.success('Settings loaded successfully')

    // Check what tokens are in settings
    const { settings } = useSettings()
    const hasAccess = !!settings.value.accessToken
    const hasRefresh = !!settings.value.refreshToken
    result.hasTokens = hasAccess && hasRefresh

    log.info(`Tokens in settings: access=${hasAccess}, refresh=${hasRefresh}`)
    if (settings.value.tokenExpiry) {
      const expiry = new Date(settings.value.tokenExpiry)
      const now = new Date()
      const isExpired = expiry < now
      log.info(`Token expiry: ${expiry.toISOString()} (${isExpired ? 'EXPIRED' : 'valid'})`)
    }

    // Step 2: Initialize auth
    log.info('────────────────────────────────────────')
    log.info('Step 2: Initializing auth...')
    const authComponent = createAuthComponent()
    await authComponent.startup()
    const authOk = await authComponent.init()

    // Check auth store state
    const authStore = useAuthStore()
    result.isAuthenticated = authStore.isAuthenticated
    result.tokenValid = !authStore.isTokenExpired

    log.info(`Auth init result: ${authOk}`)
    log.info(`isAuthenticated: ${authStore.isAuthenticated}`)
    log.info(`isTokenExpired: ${authStore.isTokenExpired}`)
    log.info(`isConnected: ${authStore.isConnected}`)

    if (authStore.accessToken) {
      log.info(`Access token (first 20 chars): ${authStore.accessToken.slice(0, 20)}...`)
    } else {
      log.warn('No access token in auth store')
    }

    result.success = true

    const elapsed = Date.now() - startTime
    log.success('════════════════════════════════════════')
    log.success(`       TEST COMPLETE (${elapsed}ms)`)
    log.success('════════════════════════════════════════')
    log.info(`Result: ${JSON.stringify(result)}`)

    return result

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    log.error(`Test failed with error: ${msg}`)
    return result
  }
}

/**
 * Quick network connectivity check (doesn't use full component)
 */
async function testNetworkCheck(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch('https://api.spotify.com/', {
      method: 'HEAD',
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    return response.ok || response.status === 401 || response.status === 403
  } catch {
    return false
  }
}

/**
 * Test token validation directly (like AuthComponent does)
 */
export async function testTokenValidation(): Promise<boolean> {
  log.info('Testing token validation...')

  const authStore = useAuthStore()

  if (!authStore.accessToken) {
    log.warn('No access token to validate')
    return false
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${authStore.accessToken}` }
    })

    if (response.ok) {
      const data = await response.json()
      log.success(`Token valid! User: ${data.display_name || data.id}`)
      return true
    }

    if (response.status === 401) {
      log.warn('Token invalid: 401 Unauthorized')
      return false
    }

    log.info(`Validation got ${response.status}, assuming OK`)
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network error'
    log.error(`Validation failed: ${msg}`)
    return false
  }
}

/**
 * Test token refresh
 */
export async function testTokenRefresh(): Promise<boolean> {
  log.info('Testing token refresh...')

  const authStore = useAuthStore()

  if (!authStore.refreshToken) {
    log.warn('No refresh token available')
    return false
  }

  try {
    const success = await authStore.refreshAccessToken()
    if (success) {
      log.success('Token refresh successful!')
    } else {
      log.error('Token refresh failed')
    }
    return success
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    log.error(`Token refresh error: ${msg}`)
    return false
  }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testAuthBoot = testAuthBoot;
  (window as unknown as Record<string, unknown>).testTokenValidation = testTokenValidation;
  (window as unknown as Record<string, unknown>).testTokenRefresh = testTokenRefresh
}
