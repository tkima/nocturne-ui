<!-- ============================================================
     Top Tracks View - User's most played tracks
     ============================================================ -->
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { logger } from '@/utils/logger'
import type { Track } from '@/types'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const tracks = computed(() => spotifyStore.topTracks)
const isLoading = computed(() => spotifyStore.isLoading)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function handleTrackClick(track: Track, index: number) {
  logger.info('Play top track', { trackId: track.id, index })

  // Play from this track with remaining top tracks as queue
  const trackUris = tracks.value.map(t => t.uri)
  await spotifyStore.play({
    uris: trackUris,
    offset: { position: index }
  })
  await spotifyStore.fetchCurrentPlayback()
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    await spotifyStore.fetchTopTracks()
  }
})
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && tracks.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No tracks found -->
    <div
      v-else-if="tracks.length === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No top tracks found</p>
    </div>

    <!-- Top tracks list -->
    <HorizontalScroll v-else>
      <MediaCard
        v-for="(track, index) in tracks"
        :key="track.id"
        :id="track.id"
        :name="track.name"
        :subtitle="track.artists?.map(a => a.name).join(', ') || ''"
        :image-url="track.album?.images?.[0]?.url || ''"
        @click="handleTrackClick(track, index)"
      />
    </HorizontalScroll>
  </div>
</template>
