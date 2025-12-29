<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Sidebar from '@/components/layout/Sidebar.vue'
import GradientBackground from '@/components/common/GradientBackground.vue'
import PowerMenuOverlay from '@/components/common/PowerMenuOverlay.vue'
import PairingScreen from '@/components/auth/PairingScreen.vue'
import LoadingScreen from '@/components/common/LoadingScreen.vue'
import ButtonMappingOverlay from '@/components/common/ButtonMappingOverlay.vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useSpotifyStore } from '@/stores/spotify'
import { useNetwork } from '@/composables/useNetwork'
import { useBluetooth } from '@/composables/useBluetooth'
import { getPreset, shouldIgnoreRelease } from '@/composables/useButtonMapping'
import { logger } from '@/utils/logger'

const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const config = useConfigStore()
const spotifyStore = useSpotifyStore()
const network = useNetwork()
const bluetooth = useBluetooth()

// Hide cursor only in production (on device)
const isDev = import.meta.env.DEV

// Loading screen state
const showLoader = ref(true)

// Power menu state
const powerMenuVisible = ref(false)
const previousRoute = ref('/recents')
let holdTimer: ReturnType<typeof setTimeout> | null = null
let longPressTriggered = false

// Button mapping overlay state (for short press preset playback)
const showMappingOverlay = ref(false)
const activePresetButton = ref<string | null>(null)
let isPlayingPreset = false

const isFullscreenRoute = computed(() =>
  route.path === '/now-playing' ||
  route.path === '/lock' ||
  route.path.startsWith('/auth/') ||
  route.path.startsWith('/test') ||
  route.path.startsWith('/album/') ||
  route.path.startsWith('/artist/') ||
  route.path.startsWith('/show/')
)

// Check if current path is public (doesn't require auth)
function isPublicPath(): boolean {
  const path = window.location.pathname
  return path.startsWith('/auth/') || path.startsWith('/test')
}

watch(() => authStore.isAuthenticated, (isAuth) => {
  if (!isAuth && !isPublicPath()) {
    router.replace('/auth/login')
  }
})

// M button handler - short press: lock screen, long press: power menu
function handleKeyDown(e: KeyboardEvent) {
  if (!e.key || e.key.toLowerCase() !== 'm') return
  if (powerMenuVisible.value) return
  if (longPressTriggered) return

  if (!holdTimer) {
    holdTimer = setTimeout(() => {
      longPressTriggered = true
      powerMenuVisible.value = true
      holdTimer = null
    }, 600)
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (!e.key || e.key.toLowerCase() !== 'm') return

  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }

  if (longPressTriggered) {
    longPressTriggered = false
    return
  }

  if (powerMenuVisible.value) {
    powerMenuVisible.value = false
    return
  }

  // Short press: toggle lock view
  if (route.path === '/lock') {
    router.push(previousRoute.value || '/recents')
  } else {
    previousRoute.value = route.path
    router.push('/lock')
  }
}

// Button 1-4 short press handler - play saved presets
async function handleButtonPress(buttonNumber: string) {
  if (!authStore.isAuthenticated || isPlayingPreset || powerMenuVisible.value) return

  const preset = getPreset(buttonNumber)
  if (!preset.id || !preset.type) {
    logger.info('No preset mapped for button', { button: buttonNumber })
    return
  }

  isPlayingPreset = true
  activePresetButton.value = buttonNumber
  showMappingOverlay.value = true

  logger.info('Playing preset', { button: buttonNumber, ...preset })

  try {
    let contextUri: string | undefined
    let uris: string[] | undefined

    switch (preset.type) {
      case 'playlist':
        contextUri = `spotify:playlist:${preset.id}`
        break
      case 'album':
        contextUri = `spotify:album:${preset.id}`
        break
      case 'artist':
        contextUri = `spotify:artist:${preset.id}`
        break
      case 'show':
        contextUri = `spotify:show:${preset.id}`
        break
      case 'liked-songs':
        const tracksJson = localStorage.getItem(`button${buttonNumber}Tracks`)
        if (tracksJson) {
          uris = JSON.parse(tracksJson)
        }
        break
    }

    if (contextUri) {
      await spotifyStore.play({ context_uri: contextUri })
    } else if (uris && uris.length > 0) {
      await spotifyStore.play({ uris })
    }

    // Navigate to now playing after successful playback
    setTimeout(() => {
      router.push('/now-playing')
    }, 500)
  } catch (err) {
    logger.error('Failed to play preset', { error: err })
  }

  // Hide overlay after a moment
  setTimeout(() => {
    showMappingOverlay.value = false
    activePresetButton.value = null
    isPlayingPreset = false
  }, 1500)
}

function handleButtonKeyUp(e: KeyboardEvent) {
  const validButtons = ['1', '2', '3', '4']
  if (!validButtons.includes(e.key)) return

  // Check if long press just triggered (mapping was saved)
  if (shouldIgnoreRelease()) {
    logger.info('Ignoring button release after long press', { button: e.key })
    return
  }

  // Short press - play the preset
  handleButtonPress(e.key)
}

// Back button handler - navigate back to recents from network screen when authenticated
function handleBackButton(e: KeyboardEvent) {
  if (e.key !== 'Escape') return

  // If on network screen and authenticated, go to recents
  if (route.path === '/auth/network' && authStore.isAuthenticated) {
    e.stopPropagation()
    router.push('/recents')
  }
}

function handleShutdown() {
  fetch(`${config.nocturnedUrl}/device/power/shutdown`, {
    method: 'POST'
  }).catch((err) => console.error('Shutdown request failed', err))
  powerMenuVisible.value = false
}

function handleReboot() {
  fetch(`${config.nocturnedUrl}/device/power/reboot`, {
    method: 'POST'
  }).catch((err) => console.error('Restart request failed', err))
  powerMenuVisible.value = false
}

function handleClosePowerMenu() {
  powerMenuVisible.value = false
}

// Handle loading screen complete
function handleLoadingComplete() {
  showLoader.value = false

  console.log('Loading complete:', {
    isConnected: network.isConnected.value,
    hasEverConnected: network.hasEverConnectedThisSession.value,
    isAuthenticated: authStore.isAuthenticated,
    currentPath: route.path
  })

  // Navigate based on connection and auth state
  if (authStore.isAuthenticated) {
    // If authenticated, go to recents (don't show login)
    if (route.path.startsWith('/auth/')) {
      router.replace('/recents')
    }
  } else if (!network.isConnected.value && !network.hasEverConnectedThisSession.value) {
    // No network ever - show network screen
    router.replace('/auth/network')
  } else if (!isPublicPath()) {
    // Not authenticated, has/had network - show login
    router.replace('/auth/login')
  }
}

// Watch for connection restored - redirect from network to login
watch(
  () => network.isConnected.value,
  (connected) => {
    if (connected && route.path === '/auth/network' && !authStore.isAuthenticated) {
      router.replace('/auth/login')
    }
  }
)

onMounted(async () => {
  await authStore.initFromStorage()

  window.addEventListener('keydown', handleKeyDown, { capture: true })
  window.addEventListener('keyup', handleKeyUp, { capture: true })
  window.addEventListener('keyup', handleButtonKeyUp)
  window.addEventListener('keydown', handleBackButton, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true })
  window.removeEventListener('keyup', handleKeyUp, { capture: true })
  window.removeEventListener('keyup', handleButtonKeyUp)
  window.removeEventListener('keydown', handleBackButton, { capture: true })
  if (holdTimer) {
    clearTimeout(holdTimer)
  }
})
</script>

<template>
  <main
    class="overflow-hidden relative min-h-screen rounded-2xl"
    :class="{ 'hide-cursor': !isDev }"
    style="font-family: var(--font-inter), system-ui, sans-serif; font-optical-sizing: auto;"
  >
    <!-- Dynamic gradient background -->
    <GradientBackground :gradient-state="uiStore.gradientStyle" />

    <!-- Only show content after loading is complete -->
    <template v-if="!showLoader">
      <!-- Full screen routes (Now Playing, Auth) -->
      <div v-if="isFullscreenRoute" class="relative z-10 fadeIn-animation">
        <RouterView />
      </div>

      <!-- Other sections: with sidebar -->
      <div v-else class="relative z-10 grid grid-cols-[2.2fr_3fr] fadeIn-animation">
        <!-- Sidebar navigation -->
        <div class="h-screen overflow-y-auto pb-12 pl-8 relative scroll-container scroll-smooth" style="will-change: transform;">
          <Sidebar />
        </div>

        <!-- Content area -->
        <div class="h-screen overflow-y-auto">
          <RouterView />
        </div>
      </div>
    </template>

    <!-- Power Menu Overlay -->
    <PowerMenuOverlay
      :show="powerMenuVisible"
      @shutdown="handleShutdown"
      @reboot="handleReboot"
      @close="handleClosePowerMenu"
    />

    <!-- Bluetooth Pairing Screen -->
    <PairingScreen
      v-if="bluetooth.pairingRequest.value"
      :pin="bluetooth.pairingRequest.value.pairingKey"
      :is-connecting="bluetooth.isConnecting.value"
      @accept="bluetooth.acceptPairing()"
      @reject="bluetooth.denyPairing()"
    />

    <!-- Loading Screen -->
    <LoadingScreen
      :show="showLoader"
      @complete="handleLoadingComplete"
    />

    <!-- Button Mapping Overlay (shows when playing/mapping presets) -->
    <ButtonMappingOverlay
      :show="showMappingOverlay"
      :active-button="activePresetButton"
    />
  </main>
</template>
