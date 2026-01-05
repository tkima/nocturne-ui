/**
 * Auth Boot Component
 * Wraps auth store with BootComponent interface
 *
 * IMPORTANT: This component VALIDATES tokens by making a real API call.
 * Don't trust stored expiry dates - actually test the token works!
 */

import { ref, computed, readonly } from 'vue'
import type { BootComponent, BootStatus } from './types'
import { useAuthStore } from '@/stores/auth'
import { useSettings } from '@/composables/useSettings'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/debug'

const log = createLogger('AuthBoot')

/**
 * Validate token by making a real API call to Spotify
 * Returns true if token works, false if it doesn't
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) {
      log.success('Token validated: API call succeeded')
      return true
    }
    if (response.status === 401) {
      log.warn(`Token invalid: 401 Unauthorized`)
      return false
    }
    // Other errors (rate limit, server error) - assume token is OK
    log.warn(`Token validation got ${response.status}, assuming OK`)
    return true
  } catch (e) {
    // Network error - can't validate, assume OK for now
    log.warn(`Token validation failed: ${e instanceof Error ? e.message : 'network error'}`)
    return true
  }
}

export function createAuthComponent(): BootComponent {
  const status = ref<BootStatus>('idle')
  const error = ref<string | null>(null)

  let pollingId: ReturnType<typeof setInterval> | null = null

  const authStore = useAuthStore()
  const { settings } = useSettings()
  const toast = useToast()

  // isReady means "auth init is complete" (not "user is authenticated")
  // The app should show for unauthenticated users too (they see login screen)
  const isReady = computed(() => {
    return status.value === 'ready'
  })

  async function startup(): Promise<void> {
    log.info('startup() - no tasks')
  }

  async function init(): Promise<boolean> {
    log.info('init() - checking for tokens...')
    status.value = 'starting'
    error.value = null

    try {
      // Load tokens from settings.json (NOT localStorage for tokens)
      if (settings.value.accessToken && settings.value.refreshToken) {
        authStore.accessToken = settings.value.accessToken
        authStore.refreshToken = settings.value.refreshToken
        if (settings.value.tokenExpiry) {
          authStore.tokenExpiry = new Date(settings.value.tokenExpiry)
        }
        log.success('Tokens loaded from settings.json')

        // VALIDATE the token by making a real API call
        // Don't trust stored expiry - actually test it!
        const isValid = await validateToken(authStore.accessToken)

        if (!isValid) {
          log.warn('Token invalid, trying refresh...')
          const refreshed = await authStore.refreshAccessToken()
          if (!refreshed) {
            log.error('Token refresh failed, clearing tokens')
            authStore.accessToken = null
            authStore.refreshToken = null
            authStore.tokenExpiry = null
            toast.error('Authentication failed', 3000)
          } else {
            log.success('Token refreshed successfully')
          }
        }
      } else {
        log.info('No tokens in settings.json')
      }

      // Always mark ready - even if auth failed, user can re-login
      log.success(`init() complete: isAuth=${authStore.isAuthenticated}`)
      status.value = 'ready'
      return true
    } catch (e) {
      // Even on error, mark ready so app shows (user can re-login)
      log.error(`init() error: ${e instanceof Error ? e.message : 'Unknown'}`)
      status.value = 'ready'
      return true
    }
  }

  async function reconnect(): Promise<boolean> {
    log.info('reconnect() - refreshing token...')
    status.value = 'reconnecting'
    error.value = null

    try {
      const success = await authStore.refreshAccessToken()
      status.value = success ? 'ready' : 'error'
      if (success) {
        log.success('Token refreshed successfully')
      } else {
        log.error('Token refresh failed')
        error.value = 'Token refresh failed'
      }
      return success
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      log.error(`reconnect() error: ${msg}`)
      error.value = msg
      status.value = 'error'
      return false
    }
  }

  function startPolling(): void {
    if (pollingId) return
    log.info('startPolling() - checking token every 5min')

    // Check token expiry every 5 minutes
    pollingId = setInterval(async () => {
      if (authStore.isAuthenticated && authStore.isTokenExpired) {
        log.info('Token expired during poll, refreshing...')
        await reconnect()
      }
    }, 5 * 60 * 1000)
  }

  function stopPolling(): void {
    if (pollingId) {
      clearInterval(pollingId)
      pollingId = null
    }
  }

  return {
    name: 'auth',
    status: readonly(status),
    error: readonly(error),
    isReady,
    startup,
    init,
    reconnect,
    startPolling,
    stopPolling,
  }
}
