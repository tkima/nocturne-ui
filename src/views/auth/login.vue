<!-- ============================================================
     Auth Login Screen - QR code for Spotify authentication
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useNetwork } from '@/composables/useNetwork'
import QRCodeDisplay from '@/components/auth/QRCodeDisplay.vue'
import GradientBackground from '@/components/common/GradientBackground.vue'
import { NocturneIcon } from '@/components/common/icons'

const router = useRouter()
const authStore = useAuthStore()
const uiStore = useUiStore()
const network = useNetwork()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const hasQrCode = ref(false)
const authAttempted = ref(false)
let authTimerRef: ReturnType<typeof setTimeout> | null = null
let retryTimerRef: ReturnType<typeof setTimeout> | null = null

// For dev mode, we use browser-based PKCE auth (redirect flow)
const isDev = import.meta.env.DEV

// Client ID info for display
const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || import.meta.env.VITE_SPOTIFY_CLIENT_ID_SHARED || ''
const clientIdPreview = computed(() => clientId ? `${clientId.slice(0, 8)}...` : 'Not set')

// Token debug info
const tokenDebug = computed(() => {
  const access = authStore.accessToken
  const refresh = authStore.refreshToken
  return {
    hasAccess: !!access,
    hasRefresh: !!refresh,
    accessPreview: access ? `${access.slice(0, 12)}...` : 'none',
    refreshPreview: refresh ? `${refresh.slice(0, 12)}...` : 'none',
    isAuth: authStore.isAuthenticated
  }
})

// Computed verification URI from auth store
const verificationUri = computed(() => {
  if (hasQrCode.value && network.isConnected.value !== false) {
    return authStore.authData?.verification_uri_complete || null
  }
  return null
})

// Error message
const displayError = computed(() => {
  if (authStore.error && !authStore.error.includes('authorization_pending')) {
    return authStore.error
  }
  // Only show network error if we KNOW network is down (not just null/checking)
  if (network.isConnected.value === false) {
    return 'Network connection required'
  }
  return null
})

// ------------------------------------------------------------
// Auth initialization
// ------------------------------------------------------------
async function initAuth() {
  // Wait for network to be confirmed connected (not null/unknown, not false)
  if (network.isConnected.value !== true) {
    console.log('Auth: waiting for network connection...')
    return
  }

  // Clear any existing timers and errors
  if (authTimerRef) clearTimeout(authTimerRef)
  authStore.error = null
  hasQrCode.value = false
  authAttempted.value = true

  // Small delay to ensure network is stable
  authTimerRef = setTimeout(async () => {
    try {
      // Try to refresh existing token first (if we have a refresh token)
      if (authStore.refreshToken) {
        console.log('Auth: attempting token refresh...')
        const refreshed = await authStore.refreshAccessToken()
        if (refreshed) {
          console.log('Auth: token refresh successful')
          router.push('/recents')
          return
        }
        console.log('Auth: token refresh failed, starting new auth flow')
      }

      const authResponse = await authStore.initAuth()

      if (authResponse?.device_code) {
        // Device auth flow - poll for completion
        hasQrCode.value = true
        authStore.pollAuthStatus(authResponse.device_code)
      } else if (authResponse?.verification_uri_complete) {
        // PKCE auth flow - no device_code, tokens come via polling or WebSocket
        hasQrCode.value = true
        authStore.pollAuthStatus(null)
      }
    } catch (err) {
      console.error('Auth init error:', err)
      // On error, schedule a retry after 3 seconds
      scheduleRetry()
    }
  }, 1000)
}

// Schedule a retry after error
function scheduleRetry() {
  if (retryTimerRef) clearTimeout(retryTimerRef)
  retryTimerRef = setTimeout(() => {
    if (!hasQrCode.value && network.isConnected.value === true && !authStore.isAuthenticated) {
      console.log('Auth: retrying after error...')
      initAuth()
    }
  }, 3000)
}

function handleRefresh() {
  hasQrCode.value = false
  initAuth()
}

// Start login flow with redirect (for dev mode button)
function startLogin() {
  authStore.startPkceAuth()
}

// Watch for auth errors and auto-retry
watch(() => authStore.error, (error) => {
  if (error && !error.includes('authorization_pending')) {
    console.log('Auth: error detected, scheduling retry:', error)
    scheduleRetry()
  }
})

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  // Set auth gradient
  uiStore.setGradientColors(['#1a4a3a', '#2d1f3d'])

  // If network is already connected, start auth flow
  // Otherwise, the network watcher will trigger it when connected
  // (Guard prevents reaching here if already authenticated)
  if (network.isConnected.value === true) {
    initAuth()
  } else {
    console.log('Auth: waiting for network to connect...')
  }
})

onUnmounted(() => {
  // Cleanup timers
  if (authTimerRef) clearTimeout(authTimerRef)
  if (retryTimerRef) clearTimeout(retryTimerRef)
  authStore.stopPolling()
})

// Watch for authentication
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    hasQrCode.value = false
    router.push('/recents')
  }
})

// Watch for network changes - init auth when network becomes available
watch(() => network.isConnected.value, (connected, wasConnected) => {
  console.log('Auth: network status changed:', wasConnected, '->', connected)

  if (connected === true) {
    // Network is now connected - start auth if we haven't successfully done so
    if (!hasQrCode.value && !authStore.isAuthenticated) {
      console.log('Auth: network connected, starting auth flow')
      initAuth()
    }
  } else if (connected === false) {
    // Network lost - clear QR code state
    hasQrCode.value = false
    authAttempted.value = false
  }
})
</script>

<template>
  <div class="h-screen flex items-center justify-center overflow-hidden fixed inset-0 rounded-2xl">
    <GradientBackground :gradient-state="uiStore.gradientStyle" />

    <div class="relative z-10 w-full max-w-6xl px-6 grid grid-cols-2 gap-16 items-center">
      <!-- Left side: Info -->
      <div class="flex flex-col items-start space-y-8 ml-12">
        <NocturneIcon class="h-12 w-auto" />

        <div class="space-y-4">
          <h2 class="text-4xl text-white tracking-tight font-[580] w-[24rem]">
            {{ isDev ? 'Sign in with Spotify' : 'Scan the QR code with your phone\'s camera.' }}
          </h2>
          <p class="text-[28px] text-white/60 tracking-tight w-[22rem]">
            {{ isDev ? 'Click the button to authenticate with your Spotify account.' : 'You\'ll be redirected to Spotify to authorize Nocturne.' }}
          </p>
          <p class="text-[16px] text-white/40 tracking-tight">
            {{ authStore.authData?.auth_type === 'device' ? 'Device' : 'PKCE' }} auth • {{ clientIdPreview }}
          </p>
          <!-- Token debug info -->
          <p class="text-[14px] text-white/30 tracking-tight mt-2">
            Token: {{ tokenDebug.accessPreview }} | Refresh: {{ tokenDebug.refreshPreview }}
          </p>
          <p class="text-[14px] text-white/30 tracking-tight">
            isAuth: {{ tokenDebug.isAuth }}
          </p>

          <!-- Dev mode: Show login button -->
          <button
            v-if="isDev"
            class="mt-6 bg-[#1DB954] hover:bg-[#1ed760] text-white text-2xl font-[580] px-8 py-4 rounded-full transition-colors"
            @click="startLogin"
          >
            Login with Spotify
          </button>

          <!-- Dev mode: Link to test page -->
          <router-link
            v-if="isDev"
            to="/test"
            class="block mt-4 text-white/40 hover:text-white/60 text-lg transition-colors"
          >
            Go to Test Page →
          </router-link>
        </div>
      </div>

      <!-- Right side: QR Code (non-dev) or placeholder (dev) -->
      <div class="flex justify-center">
        <QRCodeDisplay
          v-if="!isDev"
          :verification-uri="verificationUri"
          :is-loading="authStore.isLoading || (!hasQrCode && network.isConnected.value !== true)"
          :error="displayError"
          @refresh="handleRefresh"
        />
      </div>
    </div>

    <!-- Connection Status Indicator -->
    <div class="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
      <div
        class="w-3 h-3 rounded-full"
        :class="network.isConnected.value === true ? 'bg-green-500' : network.isConnected.value === false ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'"
      />
      <span class="text-[20px] text-white/80">
        {{ network.isConnected.value === true ? 'Connected' : network.isConnected.value === false ? 'Internet' : 'Checking...' }}
      </span>
    </div>
  </div>
</template>
