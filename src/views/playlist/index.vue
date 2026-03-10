<!-- ============================================================
     Playlist View - Browse and play playlist tracks
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useListNavigation } from '@/composables/useListNavigation'
import MediaListView from '@/components/common/MediaListView.vue'
import { logger } from '@/utils/logger'
import { getImageUrl } from '@/utils/format'
import { buildSpotifyUri } from '@/utils/spotify'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const route = useRoute()
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()
const uiStore = useUiStore()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const playlist = ref<any>(null)
const tracks = ref<any[]>([])
const isLoading = ref(true)

// ------------------------------------------------------------
// List Navigation (shared composable)
// ------------------------------------------------------------
const { selectedIndex: selectedTrackIndex, setSelectedIndex } = useListNavigation(
  tracks,
  'data-track-index',
  (track: any, index: number) => handleTrackPlay(track, index)
)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const playlistId = computed(() => route.params.id as string)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)
const playlistArt = computed(() => getImageUrl(playlist.value?.images))
const playlistName = computed(() => playlist.value?.name || 'Unknown Playlist')
const ownerName = computed(() => playlist.value?.owner?.display_name || '')

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function fetchPlaylistData() {
  isLoading.value = true
  try {
    const data = await spotifyStore.getPlaylist(playlistId.value)
    if (data) {
      playlist.value = data
      tracks.value = ((data as any).items?.items || (data as any).tracks?.items || []).map((item: any) => item.item || item.track).filter(Boolean)
      logger.info('Playlist loaded', { playlistId: playlistId.value, trackCount: tracks.value.length })

      uiStore.setMappableContent({
        id: playlistId.value,
        type: 'playlist',
        image: (data as any).images?.[0]?.url || '',
        name: (data as any).name || 'Unknown Playlist'
      })
    }
  } catch (err) {
    logger.error('Failed to load playlist', { error: err })
  } finally {
    isLoading.value = false
  }
}

async function handleTrackPlay(track: any, index: number) {
  if (!track?.uri) return

  logger.info('Play playlist track', { trackUri: track.uri, index })

  spotifyStore.play({
    context_uri: buildSpotifyUri('playlist', playlistId.value),
    offset: { position: index }
  })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await fetchPlaylistData()
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
    :image="playlistArt"
    :title="playlistName"
    :subtitle="ownerName"
    image-rounded="lg"
    :items="tracks"
    :selected-index="selectedTrackIndex"
    :current-item-uri="currentTrackUri"
    item-data-attribute="data-track-index"
    @item-click="handleTrackPlay"
  >
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
