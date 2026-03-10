<!-- ============================================================
     Queue View - Browse and play upcoming tracks
     ============================================================ -->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { logger } from '@/utils/logger'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const tracks = computed(() => spotifyStore.queue)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)
const isLoading = computed(() => spotifyStore.isLoading && tracks.value.length === 0)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleTrackClick(track: { uri: string }, index: number) {
  logger.info('Play queue track', { uri: track.uri, index })
  spotifyStore.play({
    uris: tracks.value.map(t => t.uri),
    offset: { position: index }
  })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await spotifyStore.fetchQueue()
    await spotifyStore.fetchCurrentPlayback()
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full">
    <div v-if="isLoading" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <div v-else-if="tracks.length === 0" class="flex items-center justify-center h-full">
      <p class="text-white/60 text-2xl">No upcoming tracks</p>
    </div>

    <HorizontalScroll v-else>
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
