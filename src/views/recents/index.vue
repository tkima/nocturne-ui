<!-- ============================================================
     Recents View - Recently played tracks (infinite scroll)
     ============================================================ -->
<script setup lang="ts">
import { onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useHeartbeat } from '@/composables/useHeartbeat'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { logger } from '@/utils/logger'
import { createLogger } from '@/utils/debug'

const log = createLogger('Recents')

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()
const heartbeat = useHeartbeat()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const tracks = computed(() => spotifyStore.recentlyPlayed)
const isLoading = computed(() => spotifyStore.isLoading)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleTrackClick(track: { uri: string }, index: number) {
  logger.info('Play recent track', { uri: track.uri, index })
  spotifyStore.play({
    uris: tracks.value.map(t => t.uri),
    offset: { position: index }
  })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Polling
// ------------------------------------------------------------
function startPlaybackPolling() {
  if (authStore.isAuthenticated) {
    spotifyStore.fetchCurrentPlayback()
  }

  heartbeat.register({
    name: 'playback-poll',
    interval: 5000,
    enabled: () => authStore.isAuthenticated,
    fn: async () => {
      await spotifyStore.fetchCurrentPlayback()
    },
  })
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
async function fetchRecents() {
  log.info('Fetching recents...')
  await Promise.all([
    spotifyStore.fetchRecentlyPlayed(),
    spotifyStore.fetchCurrentPlayback()
  ])
  log.success(`Fetched ${tracks.value.length} tracks`)
  startPlaybackPolling()
}

watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    fetchRecents()
  }
}, { immediate: true })

onUnmounted(() => {
  heartbeat.unregister('playback-poll')
})
</script>

<template>
  <div class="h-full">
    <div v-if="isLoading && tracks.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <div v-else-if="tracks.length === 0" class="flex items-center justify-center h-full">
      <p class="text-white/60 text-2xl">No recent tracks</p>
    </div>

    <HorizontalScroll
      v-else
      :loading="spotifyStore.recentlyPlayedLoadingMore"
      @load-more="spotifyStore.fetchMoreRecentlyPlayed()"
    >
      <MediaCard
        v-for="(track, index) in tracks"
        :key="`${track.id}-${index}`"
        :id="track.id"
        :name="track.name"
        :subtitle="track.artists?.map(a => a.name).join(', ') || ''"
        :image-url="track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || ''"
        :is-playing="track.uri === currentTrackUri"
        @click="handleTrackClick(track, index)"
      />
    </HorizontalScroll>
  </div>
</template>
