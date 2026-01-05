<script setup lang="ts">
// ------------------------------------------------------------
// Imports
// ------------------------------------------------------------
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNetwork } from '@/composables/useNetwork'
import { useBluetooth } from '@/composables/useBluetooth'
import { useGlobalKeys } from '@/composables/useGlobalKeys'
import { useSettings } from '@/composables/useSettings'
import { startBoot } from '@/boot'
import { useBootStore } from '@/stores/boot'
import Sidebar from '@/components/layout/Sidebar.vue'
import GradientBackground from '@/components/common/GradientBackground.vue'
import PowerMenuOverlay from '@/components/common/PowerMenuOverlay.vue'
import PairingScreen from '@/components/auth/PairingScreen.vue'
import LoadingScreen from '@/components/common/LoadingScreen.vue'
import ButtonMappingOverlay from '@/components/common/ButtonMappingOverlay.vue'
import ToastMessage from '@/components/common/ToastMessage.vue'
import DebugOverlay from '@/components/common/DebugOverlay.vue'
import { logger } from '@/utils/logger'
import { createLogger } from '@/utils/debug'

const log = createLogger('App')

// ------------------------------------------------------------
// Stores & Composables
// ------------------------------------------------------------
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const authStore = useAuthStore()
const config = useConfigStore()
const network = useNetwork()
const bluetooth = useBluetooth()
const bootStore = useBootStore()

const {
  powerMenuVisible,
  showMappingOverlay,
  activePresetButton,
  closePowerMenu,
  setupListeners: setupGlobalKeys,
  cleanupListeners: cleanupGlobalKeys
} = useGlobalKeys()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const isDev = import.meta.env.DEV
const showLoader = ref(true)
const { settings } = useSettings()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const isFullscreenRoute = computed(() =>
  route.path === '/now-playing' ||
  route.path === '/lock' ||
  route.path.startsWith('/auth/') ||
  route.path.startsWith('/test') ||
  route.path.startsWith('/album/') ||
  route.path.startsWith('/artist/') ||
  route.path.startsWith('/show/')
)

// Show global no-connection indicator (except on network setup page)
const showNoConnectionBubble = computed(() =>
  network.isConnected.value === false &&
  network.initialCheckDone.value &&
  route.path !== '/auth/network'
)

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function isPublicPath(): boolean {
  const path = window.location.pathname
  return path.startsWith('/auth/') || path.startsWith('/test')
}

// ------------------------------------------------------------
// Watchers
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, (isAuth) => {
  // Only redirect if loading is complete (avoid race during boot)
  if (!isAuth && !showLoader.value && !isPublicPath()) {
    router.replace('/auth/login')
  }
})

watch(
  () => network.isConnected.value,
  (connected) => {
    if (connected && route.path === '/auth/network' && !authStore.isAuthenticated) {
      router.replace('/auth/login')
    }
  }
)


// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  log.info('App mounted, initializing...')

  setupGlobalKeys()

  // Wait 1s for device to stabilize before starting boot
  await new Promise(resolve => setTimeout(resolve, 1000))

  // Start the unified boot sequence
  // This handles: Settings → Bluetooth → Network → Auth
  await startBoot()
  log.info(`Boot complete: criticalReady=${bootStore.criticalReady}, auth=${authStore.isAuthenticated}`)
})

onUnmounted(() => {
  cleanupGlobalKeys()
})

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleShutdown() {
  fetch(`${config.nocturnedUrl}/device/power/shutdown`, {
    method: 'POST'
  }).catch((err) => logger.error('Shutdown request failed', err))
  closePowerMenu()
}

function handleReboot() {
  fetch(`${config.nocturnedUrl}/device/power/reboot`, {
    method: 'POST'
  }).catch((err) => logger.error('Restart request failed', err))
  closePowerMenu()
}

async function handleLoadingComplete() {
  showLoader.value = false

  // Check if we have saved tokens (auth validation happens in background)
  const hasTokens = !!settings.value.accessToken && !!settings.value.refreshToken

  log.info(`Route decision: hasTokens=${hasTokens}, auth=${authStore.isAuthenticated}, startNP=${settings.value.startWithNowPlaying}`)

  if (hasTokens) {
    // We have tokens - go to main app, auth validates in background
    const startRoute = settings.value.startWithNowPlaying ? '/now-playing' : '/recents'
    log.info(`Has tokens -> ${startRoute}`)
    if (route.path !== startRoute) {
      router.replace(startRoute)
    }
  } else if (!isPublicPath()) {
    // No tokens - go to login (network check happens in background)
    log.info('No tokens -> /auth/login')
    router.replace('/auth/login')
  }
}
</script>

<template>
  <main
    class="overflow-hidden relative min-h-screen rounded-2xl"
    :class="{ 'hide-cursor': !isDev }"
    style="font-family: var(--font-inter), system-ui, sans-serif; font-optical-sizing: auto;"
  >
    <!-- Global Toast Message -->
    <ToastMessage />

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
      @close="closePowerMenu"
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

    <!-- Global No Connection Indicator -->
    <div
      v-if="showNoConnectionBubble"
      class="fixed top-4 right-4 z-50 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full"
    >
      <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
      <span class="text-[18px] text-white/90"> No Internet</span>
    </div>

    <!-- Debug Overlay -->
    <DebugOverlay v-if="settings.debugOverlayEnabled" />
  </main>
</template>
