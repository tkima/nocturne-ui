<!-- ============================================================
     Recents View - Recently played albums and playlists
     ============================================================ -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { logger } from '@/utils/logger'
import { createLogger } from '@/utils/debug'
import { useBluetoothTrigger } from '@/composables/useBluetoothTrigger'

const log = createLogger('Recents')

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()
const { fastPollMode } = useBluetoothTrigger()

// ------------------------------------------------------------
// Polling State
// ------------------------------------------------------------
let playbackPollInterval: ReturnType<typeof setInterval> | null = null

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const albums = computed(() => spotifyStore.recentlyPlayed)
const playlists = computed(() => spotifyStore.userPlaylists)
const isLoading = computed(() => spotifyStore.isLoading)
const currentTrackUri = computed(() => spotifyStore.currentPlayback?.item?.uri)

// Combine albums and playlists into one list for display
const recentItems = computed(() => {
  const items: Array<{
    id: string
    type: 'album' | 'playlist'
    name: string
    subtitle: string
    imageUrl: string
  }> = []

  // Add albums
  albums.value.forEach(album => {
    items.push({
      id: album.id,
      type: 'album',
      name: album.name,
      subtitle: album.artists?.map(a => a.name).join(', ') || '',
      imageUrl: album.images?.[1]?.url || album.images?.[0]?.url || ''
    })
  })

  // Add playlists (interleave or append - here we append)
  playlists.value.slice(0, 10).forEach(playlist => {
    items.push({
      id: playlist.id,
      type: 'playlist',
      name: playlist.name,
      subtitle: playlist.owner?.display_name || 'Playlist',
      imageUrl: playlist.images?.[0]?.url || ''
    })
  })

  return items
})

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleItemClick(item: { id: string; type: 'album' | 'playlist' }) {
  const contextUri = `spotify:${item.type}:${item.id}`
  logger.info(`Play ${item.type}`, { id: item.id })
  spotifyStore.play({ context_uri: contextUri })
  router.push('/now-playing')
}

function handleSubtitleClick(item: { id: string; type: 'album' | 'playlist' }) {
  if (item.type === 'album') {
    // TODO: Navigate to artist view
    logger.info('Open artist for album', { albumId: item.id })
  }
}

// ------------------------------------------------------------
// Polling - Keep playback state in sync
// ------------------------------------------------------------
function startPlaybackPolling() {
  stopPlaybackPolling()

  const poll = async () => {
    if (!authStore.isAuthenticated) return
    await spotifyStore.fetchCurrentPlayback()
  }

  // Run poll immediately
  poll()

  // Determine poll interval:
  // - Fast mode (Bluetooth just connected): 2s
  // - Normal: 10s (recents doesn't need as frequent updates)
  let interval = 10000
  if (fastPollMode.value) {
    interval = 2000
    log.info('Poll interval: 2s (fast mode)')
  } else {
    log.info(`Poll interval: ${interval / 1000}s`)
  }

  playbackPollInterval = setInterval(poll, interval)
}

function stopPlaybackPolling() {
  if (playbackPollInterval) {
    clearInterval(playbackPollInterval)
    playbackPollInterval = null
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
async function fetchRecents() {
  log.info('Fetching recents + playlists...')
  await Promise.all([
    spotifyStore.fetchRecentlyPlayed(),
    spotifyStore.fetchUserPlaylists(),
    spotifyStore.fetchCurrentPlayback()
  ])
  log.success(`Fetched ${albums.value.length} albums, ${playlists.value.length} playlists`)
  startPlaybackPolling()
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchRecents()
  }
})

// Watch for auth to complete (happens in background after page mounts)
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth && recentItems.value.length === 0) {
    log.info('Auth completed, fetching recents...')
    fetchRecents()
  }
})

onUnmounted(() => {
  stopPlaybackPolling()
})
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && recentItems.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No items state -->
    <div
      v-else-if="recentItems.length === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No recent items</p>
    </div>

    <!-- Combined album and playlist list -->
    <HorizontalScroll v-else>
      <MediaCard
        v-for="item in recentItems"
        :key="`${item.type}-${item.id}`"
        :id="item.id"
        :name="item.name"
        :subtitle="item.subtitle"
        :image-url="item.imageUrl"
        :is-playing="currentTrackUri?.includes(item.id) || false"
        @click="handleItemClick(item)"
        @subtitle-click="handleSubtitleClick(item)"
      />
    </HorizontalScroll>
  </div>
</template>
