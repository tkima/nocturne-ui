<!-- ============================================================
     Library View - Liked songs + User playlists
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
const playlists = computed(() => spotifyStore.userPlaylists)
const savedTracksTotal = computed(() => spotifyStore.savedTracksTotal)
const isLoading = computed(() => spotifyStore.isLoading)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function formatTrackCount(count: number): string {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' Songs'
}

async function handleLikedSongsClick() {
  logger.info('Play liked songs')
  // Play saved tracks
  const tracks = spotifyStore.savedTracks
  if (tracks.length > 0) {
    const trackUris = tracks.map((t: Track) => t.uri)
    await spotifyStore.play({ uris: trackUris })
    await spotifyStore.fetchCurrentPlayback()
    router.push('/now-playing')
  }
}

async function handlePlaylistClick(playlistId: string) {
  logger.info('Play playlist', { playlistId })
  await spotifyStore.play({ context_uri: `spotify:playlist:${playlistId}` })
  await spotifyStore.fetchCurrentPlayback()
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  if (authStore.isAuthenticated) {
    await Promise.all([
      spotifyStore.fetchUserPlaylists(),
      spotifyStore.fetchSavedTracks()
    ])
  }
})
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && playlists.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No content -->
    <div
      v-else-if="playlists.length === 0 && savedTracksTotal === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No library content found</p>
    </div>

    <!-- Library content -->
    <HorizontalScroll v-else>
      <!-- Liked Songs card (first item) - matches MediaCard structure -->
      <div
        class="pl-2 mr-10 snap-start cursor-pointer"
        style="min-width: var(--album-art-size)"
        @click="handleLikedSongsClick"
      >
        <div class="mt-10 rounded-[12px] bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]" style="width: var(--album-art-size); height: var(--album-art-size)">
          <svg class="w-28 h-28 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <h4 class="mt-2 text-[36px] font-[580] text-white truncate tracking-tight" style="max-width: var(--album-art-size)">
          Liked Songs
        </h4>
        <h4 class="text-[32px] font-[560] text-white/60 truncate tracking-tight" style="max-width: var(--album-art-size)">
          {{ formatTrackCount(savedTracksTotal) }}
        </h4>
      </div>

      <!-- User playlists -->
      <MediaCard
        v-for="playlist in playlists"
        :key="playlist.id"
        :id="playlist.id"
        :name="playlist.name"
        :subtitle="formatTrackCount(playlist.tracks?.total || 0)"
        :image-url="playlist.images?.[0]?.url || ''"
        @click="handlePlaylistClick(playlist.id)"
      />
    </HorizontalScroll>
  </div>
</template>
