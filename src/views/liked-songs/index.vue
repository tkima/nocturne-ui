<!-- ============================================================
     Liked Songs View - Browse and play saved tracks
     ============================================================ -->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useListNavigation } from '@/composables/useListNavigation'
import MediaListView from '@/components/common/MediaListView.vue'
import { logger } from '@/utils/logger'
import { formatCount } from '@/utils/format'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const tracks = computed(() => spotifyStore.savedTracks)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)
const subtitle = computed(() => formatCount(spotifyStore.savedTracksTotal, 'Songs'))
const isLoading = computed(() => spotifyStore.isLoading && tracks.value.length === 0)

// ------------------------------------------------------------
// List Navigation (shared composable)
// ------------------------------------------------------------
const { selectedIndex: selectedTrackIndex, setSelectedIndex } = useListNavigation(
  tracks,
  'data-track-index',
  (track: any, index: number) => handleTrackPlay(track, index)
)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function handleTrackPlay(track: any, index: number) {
  if (!track?.uri) return

  logger.info('Play liked song', { trackUri: track.uri, index })

  const trackUris = tracks.value.map(t => t.uri)
  spotifyStore.play({
    uris: trackUris,
    offset: { position: index }
  })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await spotifyStore.fetchSavedTracks()
    await spotifyStore.fetchCurrentPlayback()

    const playingIndex = tracks.value.findIndex(t => t.uri === currentTrackUri.value)
    if (playingIndex >= 0) {
      setSelectedIndex(playingIndex)
    }
  }
}, { immediate: true })

watch(currentTrackUri, (newUri) => {
  const playingIndex = tracks.value.findIndex(t => t.uri === newUri)
  if (playingIndex >= 0) {
    setSelectedIndex(playingIndex, false)
  }
})
</script>

<template>
  <!-- Loading -->
  <div v-if="isLoading" class="h-screen w-full flex items-center justify-center">
    <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
  </div>

  <MediaListView
    v-else
    image=""
    title="Liked Songs"
    :subtitle="subtitle"
    image-rounded="lg"
    :items="tracks"
    :selected-index="selectedTrackIndex"
    :current-item-uri="currentTrackUri"
    item-data-attribute="data-track-index"
    @item-click="handleTrackPlay"
  >
    <!-- Custom image: gradient + heart icon (matches library card) -->
    <template #image>
      <div
        class="rounded-[12px] bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]"
        style="width: var(--album-art-size); height: var(--album-art-size)"
      >
        <svg class="w-28 h-28 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
    </template>

    <template #item="{ item: track }">
      <p class="text-[28px] font-[580] tracking-tight truncate text-white">
        {{ track.name }}
      </p>
      <p class="text-[22px] font-[560] text-white/60 tracking-tight truncate">
        {{ track.artists?.map((a: any) => a.name).join(', ') }}
      </p>
    </template>
  </MediaListView>
</template>
