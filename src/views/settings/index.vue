<!-- ============================================================
     Settings View - App settings with navigation
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSpotifyStore } from '@/stores/spotify'
import { useSettings, type BooleanSettingKey } from '@/composables/useSettings'
import { useToast } from '@/composables/useToast'
import { startBoot } from '@/boot'
import {
  BlockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@/components/common/icons'

const router = useRouter()
const authStore = useAuthStore()
const spotifyStore = useSpotifyStore()
const { toggle, get, set, loadSettings } = useSettings()
const toast = useToast()

// Navigation state
const currentView = ref<'main' | 'section'>('main')
const activeSection = ref<string | null>(null)
const isAnimating = ref(false)

// User profile
const userProfile = ref<{ display_name?: string; email?: string; images?: { url: string }[] } | null>(null)

// Item types
interface SettingItem {
  id: string
  type: string
  title?: string
  description?: string
  storageKey?: string
  defaultValue?: boolean
  action?: string
  route?: string
  names?: string[]
}

interface SettingSection {
  title: string
  icon: string
  items: SettingItem[]
}

// Settings structure
const settingsStructure: Record<string, SettingSection> = {
  general: {
    title: 'General',
    icon: 'G',
    items: [
      {
        id: 'start-with-now-playing',
        title: 'Start with Now Playing',
        type: 'toggle',
        description: 'When enabled, the app will open directly to Now Playing.',
        storageKey: 'startWithNowPlaying',
        defaultValue: false,
      },
    ],
  },
  playback: {
    title: 'Playback',
    icon: 'P',
    items: [
      {
        id: 'track-scrolling',
        title: 'Track Name Scrolling',
        type: 'toggle',
        description: 'Scroll long track names that don\'t fit on screen.',
        storageKey: 'trackNameScrollingEnabled',
        defaultValue: true,
      },
      {
        id: 'song-change-gesture',
        title: 'Swipe to Change Song',
        type: 'toggle',
        description: 'Enable left/right swipe gestures to skip to the previous or next song.',
        storageKey: 'songChangeGestureEnabled',
        defaultValue: true,
      },
      {
        id: 'dial-seek',
        title: 'Dial Seeks Track',
        type: 'toggle',
        description: 'When enabled, the dial skips 10 seconds forward or backward. When disabled, it controls volume.',
        storageKey: 'dialSeekEnabled',
        defaultValue: true,
      },
    ],
  },
  network: {
    title: 'Network',
    icon: 'N',
    items: [
      {
        id: 'network-settings',
        title: 'Wi-Fi',
        type: 'link',
        description: 'Configure Wi-Fi connections.',
        route: '/auth/network',
      },
    ],
  },
  blocklist: {
    title: 'Blocked Songs',
    icon: 'B',
    items: [
      {
        id: 'blocked-songs-list',
        type: 'blocklist',
      },
    ],
  },
  account: {
    title: 'Account',
    icon: 'A',
    items: [
      {
        id: 'profile-info',
        type: 'profile',
      },
      {
        id: 'sign-out',
        title: 'Sign Out',
        type: 'action',
        description: 'Sign out of your Spotify account.',
        action: 'signOut',
      },
    ],
  },
  about: {
    title: 'About',
    icon: 'i',
    items: [
      {
        id: 'version',
        title: 'Nocturne Vue',
        type: 'info',
        description: 'Vue 3 + TypeScript + Pinia\nA Spotify player for Car Thing',
      },
    ],
  },
  debug: {
    title: 'Debug',
    icon: 'D',
    items: [
      {
        id: 'debug-overlay',
        title: 'Debug Overlay',
        type: 'toggle',
        description: 'Show debug logs overlay at bottom of screen.',
        storageKey: 'debugOverlayEnabled',
        defaultValue: false,
      },
      {
        id: 'api-test',
        title: 'API Test Page',
        type: 'link',
        description: 'Test Spotify API endpoints.',
        route: '/test',
      },
    ],
  },
}

// Get setting value from composable
function getSettingValue(key: string): boolean {
  return get(key as BooleanSettingKey) as boolean
}

// Toggle setting via composable (persists to file)
function toggleSetting(key: string) {
  toggle(key as BooleanSettingKey)
}

// Navigation
function navigateToSection(sectionKey: string) {
  if (isAnimating.value) return
  isAnimating.value = true
  activeSection.value = sectionKey
  currentView.value = 'section'
  setTimeout(() => {
    isAnimating.value = false
  }, 300)
}

function navigateBack() {
  if (isAnimating.value) return
  isAnimating.value = true
  currentView.value = 'main'
  setTimeout(() => {
    activeSection.value = null
    isAnimating.value = false
  }, 300)
}

// Actions
function handleAction(action: string) {
  switch (action) {
    case 'signOut':
      authStore.logout()
      router.push('/auth/login')
      break
    case 'retryConnection':
      startBoot('connect')
      break
  }
}

function handleLink(route: string) {
  router.push(route)
}

async function unblockTrack(trackId: string) {
  const blockedTracks = get('blockedTracks').filter(t => t.id !== trackId)
  await set('blockedTracks', blockedTracks)
  toast.success('Song unblocked')
}

// Fetch user profile
async function fetchProfile() {
  if (authStore.isAuthenticated) {
    try {
      const profile = await spotifyStore.getCurrentUser()
      if (profile) {
        userProfile.value = profile
      }
    } catch (e) {
      console.error('Failed to fetch profile', e)
    }
  }
}

// Keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (currentView.value === 'section') {
      navigateBack()
    }
  }
}

onMounted(async () => {
  await loadSettings()
  fetchProfile()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const activeSectionData = computed(() => {
  if (!activeSection.value) return null
  return settingsStructure[activeSection.value as keyof typeof settingsStructure]
})
</script>

<template>
  <div class="h-full overflow-y-auto overflow-x-hidden scroll-smooth">
    <div class="min-h-full px-8 pt-8 pb-12">
      <!-- Main Settings List -->
      <div
        v-if="currentView === 'main'"
        class="transition-all duration-300 ease-out translate-x-0 opacity-100"
      >
        <h1 class="text-[46px] font-[580] text-white tracking-tight mb-6">Settings</h1>

        <div class="space-y-3">
          <button
            v-for="(section, key) in settingsStructure"
            :key="key"
            class="flex items-center justify-between w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-colors border border-white/10"
            @click="navigateToSection(key)"
          >
            <div class="flex items-center">
              <div class="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-2xl">
                {{ section.icon }}
              </div>
              <span class="text-[32px] ml-4 font-[580] text-white tracking-tight">
                {{ section.title }}
              </span>
            </div>
            <ChevronRightIcon class="w-8 h-8 text-white/60" />
          </button>
        </div>
      </div>

      <!-- Section Detail View -->
      <div
        v-if="currentView === 'section'"
        class="transition-all duration-300 ease-out translate-x-0 opacity-100"
      >
        <div v-if="activeSectionData" class="space-y-6">
          <!-- Header with back button -->
          <div class="flex items-center mb-4">
            <button
              class="mr-4 p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
              @click="navigateBack"
            >
              <ChevronLeftIcon class="w-8 h-8 text-white" />
            </button>
            <h2 class="text-[46px] font-[580] text-white tracking-tight">
              {{ activeSectionData.title }}
            </h2>
          </div>

          <!-- Section Items -->
          <div class="space-y-6">
            <template v-for="item in activeSectionData.items" :key="item.id">
              <!-- Toggle Item -->
              <div v-if="item.type === 'toggle' && item.storageKey" class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-[32px] font-[580] text-white tracking-tight">
                    {{ item.title }}
                  </span>
                  <button
                    class="relative w-20 h-11 rounded-full transition-colors duration-200"
                    :class="getSettingValue(item.storageKey) ? 'bg-white/40' : 'bg-white/10'"
                    @click="toggleSetting(item.storageKey)"
                  >
                    <span
                      class="absolute top-0.5 left-0.5 w-10 h-10 bg-white rounded-full shadow transition-transform duration-200"
                      :class="getSettingValue(item.storageKey) ? 'translate-x-9' : 'translate-x-0'"
                    />
                  </button>
                </div>
                <p class="text-[28px] font-[560] text-white/60 tracking-tight max-w-[380px]">
                  {{ item.description }}
                </p>
              </div>

              <!-- Action Button -->
              <div v-else-if="item.type === 'action' && item.action" class="space-y-3">
                <button
                  class="bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-6 py-3 border border-white/10"
                  @click="handleAction(item.action)"
                >
                  <span class="text-[32px] font-[580] text-white tracking-tight">
                    {{ item.title }}
                  </span>
                </button>
                <p class="text-[28px] font-[560] text-white/60 tracking-tight max-w-[380px]">
                  {{ item.description }}
                </p>
              </div>

              <!-- Link Item -->
              <div v-else-if="item.type === 'link' && item.route" class="space-y-3">
                <button
                  class="flex items-center justify-between w-full p-4 bg-white/10 hover:bg-white/20 rounded-xl transition-colors border border-white/10"
                  @click="handleLink(item.route)"
                >
                  <span class="text-[32px] font-[580] text-white tracking-tight">
                    {{ item.title }}
                  </span>
                  <ChevronRightIcon class="w-8 h-8 text-white/60" />
                </button>
                <p class="text-[28px] font-[560] text-white/60 tracking-tight max-w-[380px]">
                  {{ item.description }}
                </p>
              </div>

              <!-- Profile Info -->
              <div v-else-if="item.type === 'profile'" class="p-4 bg-white/10 rounded-xl border border-white/10">
                <!-- Authenticated: show profile -->
                <div v-if="authStore.isAuthenticated && userProfile" class="flex items-center">
                  <img
                    v-if="userProfile.images?.[0]?.url"
                    :src="userProfile.images[0].url"
                    alt="Profile"
                    class="w-16 h-16 rounded-full object-cover"
                  />
                  <div v-else class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <span class="text-3xl">👤</span>
                  </div>
                  <div class="ml-4">
                    <p class="text-[28px] font-[580] text-white tracking-tight">
                      {{ userProfile.display_name || 'Spotify User' }}
                    </p>
                    <p class="text-[22px] text-white/60">
                      {{ userProfile.email || 'Connected to Spotify' }}
                    </p>
                  </div>
                </div>
                <!-- Not authenticated: show retry button -->
                <div v-else-if="!authStore.isAuthenticated" class="space-y-3">
                  <p class="text-[28px] font-[580] text-white/60 tracking-tight">
                    Not connected to Spotify
                  </p>
                  <button
                    class="bg-white/20 hover:bg-white/30 transition-colors rounded-xl px-6 py-3"
                    @click="handleAction('retryConnection')"
                  >
                    <span class="text-[28px] font-[580] text-white tracking-tight">
                      Retry Connection
                    </span>
                  </button>
                </div>
                <!-- Loading: show skeleton -->
                <div v-else class="flex items-center">
                  <div class="w-16 h-16 bg-white/20 rounded-full animate-pulse" />
                  <div class="ml-4 space-y-2">
                    <div class="h-7 w-32 bg-white/20 rounded animate-pulse" />
                    <div class="h-5 w-48 bg-white/20 rounded animate-pulse" />
                  </div>
                </div>
              </div>

              <!-- Info Item -->
              <div v-else-if="item.type === 'info'" class="p-4 bg-white/10 rounded-xl border border-white/10">
                <p class="text-[28px] font-[580] text-white tracking-tight">
                  {{ item.title }}
                </p>
                <p class="text-[22px] text-white/60 whitespace-pre-line mt-1">
                  {{ item.description }}
                </p>
              </div>

              <!-- Blocklist Item -->
              <div v-else-if="item.type === 'blocklist'">
                <div v-if="get('blockedTracks').length === 0" class="p-4 bg-white/10 rounded-xl border border-white/10">
                  <p class="text-[28px] font-[560] text-white/60 tracking-tight">No blocked songs</p>
                </div>
                <div v-else class="space-y-3">
                  <div
                    v-for="track in [...get('blockedTracks')].reverse()"
                    :key="track.id"
                    class="flex items-center justify-between p-4 bg-white/10 rounded-xl border border-white/10"
                  >
                    <div class="flex-1 min-w-0 mr-4">
                      <p class="text-[28px] font-[580] text-white tracking-tight truncate">{{ track.name }}</p>
                      <p class="text-[22px] text-white/60 truncate">{{ track.artist }}</p>
                    </div>
                    <div class="cursor-pointer flex-shrink-0" @click="unblockTrack(track.id)">
                      <BlockIcon class="w-10 h-10 text-red-400 stroke-red-400" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Credits Item -->
              <div v-else-if="item.type === 'credits' && item.names" class="space-y-3">
                <h3 class="text-[32px] font-[580] text-white tracking-tight">
                  {{ item.title }}
                </h3>
                <div class="space-y-2">
                  <p
                    v-for="(name, idx) in item.names"
                    :key="idx"
                    class="text-[28px] font-[560] text-white/60 tracking-tight"
                  >
                    {{ name }}
                  </p>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
