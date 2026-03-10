<!-- ============================================================
     Test Page - Spotify API testing for development
     ============================================================ -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSpotifyStore } from '@/stores/spotify'

const authStore = useAuthStore()
const spotifyStore = useSpotifyStore()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
interface LogEntry {
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

const logs = ref<LogEntry[]>([])
const manualToken = ref('')

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const tokenPreview = computed(() =>
  authStore.accessToken ? `${authStore.accessToken.substring(0, 40)}...` : 'None'
)

const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || import.meta.env.VITE_SPOTIFY_CLIENT_ID_SHARED || ''

// ------------------------------------------------------------
// Logging
// ------------------------------------------------------------
function log(message: string, type: LogEntry['type'] = 'info') {
  const timestamp = new Date().toISOString()
  logs.value.unshift({ timestamp, message, type })
  if (logs.value.length > 50) {
    logs.value.pop()
  }
}

function clearLogs() {
  logs.value = []
}

// ------------------------------------------------------------
// Token Management
// ------------------------------------------------------------
function loadToken() {
  // Token is already loaded by boot system
  if (authStore.accessToken) {
    log(`Token loaded: ${authStore.accessToken.substring(0, 30)}...`, 'success')
  } else {
    log('No token found in localStorage', 'error')
  }
}

function useManualToken() {
  if (manualToken.value.trim()) {
    authStore.saveTokens({
      access_token: manualToken.value.trim(),
      expires_in: 3600,
    })
    log('Manual token saved', 'success')
  }
}

function clearAuth() {
  authStore.logout()
  log('Cleared auth data', 'warning')
}

function startAuth() {
  authStore.startPkceAuth()
}

// ------------------------------------------------------------
// Relay Testing
// ------------------------------------------------------------
const relayUrl = import.meta.env.VITE_AUTH_RELAY_URL || ''
const relayTestResult = ref('')

async function testRelay() {
  log('Testing relay connection...')
  try {
    const response = await fetch(`${relayUrl}?action=test`)
    const data = await response.json()
    log(`Relay test: ${JSON.stringify(data)}`, response.ok ? 'success' : 'error')
    relayTestResult.value = JSON.stringify(data, null, 2)
  } catch (e) {
    log(`Relay error: ${e instanceof Error ? e.message : 'Unknown'}`, 'error')
  }
}

async function testRelayAuth() {
  log('Testing relay auth flow...')
  try {
    // Generate PKCE values
    const verifier = generateTestVerifier()
    const challenge = await generateTestChallenge(verifier)
    const session = generateTestSession()

    log(`Verifier: ${verifier.substring(0, 20)}...`)
    log(`Challenge: ${challenge}`)
    log(`Session: ${session}`)

    const params = new URLSearchParams({
      action: 'start',
      client_id: clientId,
      session: session,
      code_challenge: challenge,
    })

    const url = `${relayUrl}?${params.toString()}`
    log(`Request URL: ${url}`)

    const response = await fetch(url)
    const data = await response.json()

    if (response.ok) {
      log(`Relay auth success!`, 'success')
      log(`Auth URL: ${data.auth_url?.substring(0, 80)}...`, 'success')
      relayTestResult.value = JSON.stringify(data, null, 2)
    } else {
      log(`Relay auth failed: ${JSON.stringify(data)}`, 'error')
      relayTestResult.value = JSON.stringify(data, null, 2)
    }
  } catch (e) {
    log(`Relay auth error: ${e instanceof Error ? e.message : 'Unknown'}`, 'error')
  }
}

function generateTestVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function generateTestSession(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

async function generateTestChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ------------------------------------------------------------
// API Testing
// ------------------------------------------------------------
async function testEndpoint(endpoint: string) {
  const token = await authStore.ensureValidToken()
  if (!token) {
    log('No token! Load or enter a token first.', 'error')
    return
  }

  const url = `https://api.spotify.com${endpoint}`
  log(`Testing: ${url}`)

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const retryAfter = response.headers.get('Retry-After')

    log(
      `Status: ${response.status} ${response.statusText}`,
      response.ok ? 'success' : response.status === 429 ? 'warning' : 'error'
    )

    if (retryAfter) {
      log(`Retry-After: ${retryAfter} seconds`, 'warning')
    }

    if (response.status === 429) {
      log('RATE LIMITED!', 'error')
      return
    }

    if (response.status === 401) {
      log('Token expired/invalid - need to re-auth', 'error')
      return
    }

    if (response.status === 204) {
      log('No content (player inactive)', 'warning')
      return
    }

    if (response.ok) {
      const data = await response.json()
      log(`Response: ${JSON.stringify(data).substring(0, 300)}...`, 'success')
    }
  } catch (e) {
    log(`Network error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error')
  }
}

// Test using the Spotify store
async function testSpotifyStore(action: string) {
  log(`Testing store action: ${action}`)

  try {
    switch (action) {
      case 'user':
        const user = await spotifyStore.getCurrentUser()
        if (user) {
          log(`User: ${user.display_name} (${user.id})`, 'success')
        }
        break
      case 'playback':
        await spotifyStore.fetchCurrentPlayback()
        if (spotifyStore.currentPlayback) {
          log(`Playing: ${spotifyStore.currentPlayback.item?.name || 'Nothing'}`, 'success')
        } else {
          log('No active playback', 'warning')
        }
        break
      case 'recent':
        await spotifyStore.fetchRecentlyPlayed()
        log(`Fetched ${spotifyStore.recentlyPlayed.length} recent albums`, 'success')
        break
      case 'playlists':
        await spotifyStore.fetchUserPlaylists()
        log(`Fetched ${spotifyStore.userPlaylists.length} playlists`, 'success')
        break
      case 'artists':
        await spotifyStore.fetchTopArtists()
        log(`Fetched ${spotifyStore.topArtists.length} top artists`, 'success')
        break
    }
  } catch (e) {
    log(`Store error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error')
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function getLogColor(type: LogEntry['type']): string {
  switch (type) {
    case 'error': return 'text-red-400'
    case 'success': return 'text-green-400'
    case 'warning': return 'text-orange-400'
    default: return 'text-white'
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(() => {
  loadToken()
})
</script>

<template>
  <div class="min-h-screen bg-[#1a1a1a] text-white p-6 font-mono">
    <h1 class="text-3xl font-bold mb-6">Spotify API Test</h1>

    <!-- Token Status -->
    <section class="mb-6">
      <h3 class="text-xl font-semibold mb-2">1. Token Status</h3>
      <div class="flex gap-2 mb-2">
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="loadToken"
        >
          Reload Token
        </button>
        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
          @click="startAuth"
        >
          Login with Spotify
        </button>
        <button
          class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white transition-colors"
          @click="clearAuth"
        >
          Clear Auth
        </button>
      </div>
      <p class="text-sm text-white/60">Current: {{ tokenPreview }}</p>
      <p class="text-xs text-white/40">Client ID: {{ clientId.substring(0, 8) }}...</p>
      <p class="text-xs text-white/40">
        Auth Status: {{ authStore.isAuthenticated ? 'Authenticated' : 'Not authenticated' }}
        | Token Ready: {{ authStore.tokenReady ? 'Yes' : 'No' }}
      </p>
    </section>

    <!-- Manual Token -->
    <section class="mb-6">
      <h3 class="text-xl font-semibold mb-2">2. Manual Token</h3>
      <div class="flex gap-2">
        <input
          v-model="manualToken"
          type="text"
          placeholder="Paste access token"
          class="px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded w-96 text-white"
        />
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="useManualToken"
        >
          Use This
        </button>
      </div>
    </section>

    <!-- Test Relay Auth -->
    <section class="mb-6">
      <h3 class="text-xl font-semibold mb-2">3. Test Relay Auth</h3>
      <p class="text-xs text-white/40 mb-2">Relay URL: {{ relayUrl || 'Not configured' }}</p>
      <div class="flex gap-2 mb-2">
        <button
          class="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded text-white transition-colors"
          @click="testRelay"
        >
          Test Relay Connection
        </button>
        <button
          class="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded text-white transition-colors"
          @click="testRelayAuth"
        >
          Test Relay Auth Flow
        </button>
      </div>
      <div v-if="relayTestResult" class="bg-[#2a2a2a] p-2 rounded text-xs text-green-400 max-h-32 overflow-auto">
        <pre>{{ relayTestResult }}</pre>
      </div>
    </section>

    <!-- Test Raw Endpoints -->
    <section class="mb-6">
      <h3 class="text-xl font-semibold mb-2">4. Test Raw Endpoints</h3>
      <div class="flex flex-wrap gap-2">
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me')"
        >
          /me
        </button>
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me/player')"
        >
          /me/player
        </button>
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me/playlists?limit=1')"
        >
          /me/playlists
        </button>
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me/albums?limit=1')"
        >
          /me/albums
        </button>
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me/player/recently-played?limit=5')"
        >
          /recently-played
        </button>
        <button
          class="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] rounded text-white transition-colors"
          @click="testEndpoint('/v1/me/top/artists?limit=5')"
        >
          /top/artists
        </button>
      </div>
    </section>

    <!-- Test Spotify Store -->
    <section class="mb-6">
      <h3 class="text-xl font-semibold mb-2">5. Test Spotify Store</h3>
      <div class="flex flex-wrap gap-2">
        <button
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
          @click="testSpotifyStore('user')"
        >
          Get User
        </button>
        <button
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
          @click="testSpotifyStore('playback')"
        >
          Get Playback
        </button>
        <button
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
          @click="testSpotifyStore('recent')"
        >
          Fetch Recent
        </button>
        <button
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
          @click="testSpotifyStore('playlists')"
        >
          Fetch Playlists
        </button>
        <button
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
          @click="testSpotifyStore('artists')"
        >
          Fetch Top Artists
        </button>
      </div>
    </section>

    <!-- Results -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xl font-semibold">Results</h3>
        <button
          class="px-3 py-1 bg-[#333] hover:bg-[#444] rounded text-sm transition-colors"
          @click="clearLogs"
        >
          Clear
        </button>
      </div>
      <div class="space-y-1 max-h-96 overflow-y-auto">
        <div
          v-for="(entry, i) in logs"
          :key="i"
          class="bg-[#2a2a2a] p-2 rounded text-xs"
          :class="getLogColor(entry.type)"
        >
          [{{ entry.timestamp }}] {{ entry.message }}
        </div>
        <div v-if="logs.length === 0" class="text-white/40 text-sm">
          No logs yet. Click a button to test.
        </div>
      </div>
    </section>

    <!-- Navigation -->
    <section class="mt-8 pt-4 border-t border-white/10">
      <h3 class="text-xl font-semibold mb-2">Quick Navigation</h3>
      <div class="flex flex-wrap gap-2">
        <router-link
          to="/auth/login"
          class="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white transition-colors"
        >
          Auth Login
        </router-link>
        <router-link
          to="/auth/network"
          class="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white transition-colors"
        >
          Network Screen
        </router-link>
        <router-link
          to="/recents"
          class="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white transition-colors"
        >
          Recents
        </router-link>
        <router-link
          to="/now-playing"
          class="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white transition-colors"
        >
          Now Playing
        </router-link>
        <router-link
          to="/settings"
          class="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white transition-colors"
        >
          Settings
        </router-link>
      </div>
    </section>
  </div>
</template>
