<!-- ============================================================
     Album View - Shows album tracks in a list
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
const album = ref<any>(null)
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
const albumId = computed(() => route.params.id as string)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)

const albumArt = computed(() => getImageUrl(album.value?.images))

const albumName = computed(() => album.value?.name || 'Unknown Album')

const artistName = computed(() => {
  return album.value?.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist'
})

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function fetchAlbumData() {
  isLoading.value = true
  try {
    const data = await spotifyStore.getAlbum(albumId.value)
    if (data) {
      album.value = data
      tracks.value = data.tracks?.items || []
      logger.info('Album loaded', { albumId: albumId.value, trackCount: tracks.value.length })

      uiStore.setMappableContent({
        id: albumId.value,
        type: 'album',
        image: data.images?.[0]?.url || '',
        name: data.name || 'Unknown Album'
      })
    }
  } catch (err) {
    logger.error('Failed to load album', { error: err })
  } finally {
    isLoading.value = false
  }
}

async function handleTrackPlay(track: any, index: number) {
  if (!track?.uri) return

  logger.info('Play track', { trackUri: track.uri, index })

  spotifyStore.play({
    context_uri: buildSpotifyUri('album', albumId.value),
    offset: { position: index }
  })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await fetchAlbumData()
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
    :image="albumArt"
    :title="albumName"
    :subtitle="artistName"
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
