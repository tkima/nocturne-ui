<!-- ============================================================
     Artist View - Shows artist's top tracks
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
import { formatCount, getImageUrl } from '@/utils/format'
import type { Artist, Track } from '@/types'

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
const artist = ref<Artist | null>(null)
const tracks = ref<Track[]>([])
const isLoading = ref(true)

// ------------------------------------------------------------
// List Navigation (shared composable)
// ------------------------------------------------------------
const { selectedIndex: selectedTrackIndex, setSelectedIndex } = useListNavigation(
  tracks,
  'data-track-index',
  (track: Track, index: number) => handleTrackPlay(track, index)
)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const artistId = computed(() => route.params.id as string)
const currentTrackUri = computed(() => spotifyStore.currentTrackUri)

const artistImage = computed(() => getImageUrl(artist.value?.images))

const artistName = computed(() => artist.value?.name || 'Unknown Artist')

const followerCount = computed(() => formatCount(artist.value?.followers?.total || 0, 'Followers'))

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function fetchArtistData() {
  isLoading.value = true
  try {
    const [artistData, topTracksData] = await Promise.all([
      spotifyStore.getArtist(artistId.value),
      spotifyStore.getArtistTopTracks(artistId.value)
    ])

    if (artistData) {
      artist.value = artistData

      // Set mappable content for button mapping
      uiStore.setMappableContent({
        id: artistId.value,
        type: 'artist',
        image: artistData.images?.[0]?.url || '',
        name: artistData.name || 'Unknown Artist'
      })
    }
    if (topTracksData?.tracks) {
      tracks.value = topTracksData.tracks
    }

    logger.info('Artist loaded', {
      artistId: artistId.value,
      name: artistData?.name,
      trackCount: tracks.value.length
    })
  } catch (err) {
    logger.error('Failed to load artist', { error: err })
  } finally {
    isLoading.value = false
  }
}

async function handleTrackPlay(track: Track, index: number) {
  if (!track?.uri) return

  logger.info('Play track', { trackUri: track.uri, index })

  // Play the selected track with the rest of top tracks as queue
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
    await fetchArtistData()
    await spotifyStore.fetchCurrentPlayback()

    // Find currently playing track index
    const playingIndex = tracks.value.findIndex(t => t.uri === currentTrackUri.value)
    if (playingIndex >= 0) {
      setSelectedIndex(playingIndex)
    }
  }
}, { immediate: true })

// Watch for track changes
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
    :image="artistImage"
    :title="artistName"
    :subtitle="followerCount"
    image-rounded="full"
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

