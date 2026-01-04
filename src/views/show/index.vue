<!-- ============================================================
     Show View - Shows podcast episodes in a list
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useListNavigation } from '@/composables/useListNavigation'
import MediaListView from '@/components/common/MediaListView.vue'
import { logger } from '@/utils/logger'

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
const show = ref<any>(null)
const episodes = ref<any[]>([])
const isLoading = ref(true)

// ------------------------------------------------------------
// List Navigation (shared composable)
// ------------------------------------------------------------
const { selectedIndex: selectedEpisodeIndex, setSelectedIndex } = useListNavigation(
  episodes,
  'data-episode-index',
  (episode: any, index: number) => handleEpisodePlay(episode, index)
)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const showId = computed(() => route.params.id as string)
const currentTrackUri = computed(() => spotifyStore.currentPlayback?.item?.uri)

const showArt = computed(() => {
  return show.value?.images?.[0]?.url || show.value?.images?.[1]?.url || ''
})

const showName = computed(() => show.value?.name || 'Unknown Show')

const publisherName = computed(() => show.value?.publisher || 'Unknown Publisher')

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function fetchShowData() {
  isLoading.value = true
  try {
    const [showData, episodesData] = await Promise.all([
      spotifyStore.getShow(showId.value),
      spotifyStore.getShowEpisodes(showId.value)
    ])
    if (showData) {
      show.value = showData
      // Set mappable content for button mapping
      uiStore.setMappableContent({
        id: showId.value,
        type: 'show',
        image: showData.images?.[0]?.url || '',
        name: showData.name || 'Unknown Show'
      })
    }
    if (episodesData?.items) {
      episodes.value = episodesData.items
    }
    logger.info('Show loaded', { showId: showId.value, episodeCount: episodes.value.length })
  } catch (err) {
    logger.error('Failed to load show', { error: err })
  } finally {
    isLoading.value = false
  }
}

async function handleEpisodePlay(episode: any, index: number) {
  if (!episode?.uri) return

  logger.info('Play episode', { episodeUri: episode.uri, index, duration: episode.duration_ms })

  // Set episode context for Now Playing to use (includes all data needed)
  if (show.value) {
    spotifyStore.setEpisodeContext({
      showId: show.value.id,
      showName: show.value.name,
      showImages: show.value.images || [],
      episodeId: episode.id,
      episodeName: episode.name,
      episodeDuration: episode.duration_ms || 0,
      episodeImages: episode.images || []
    })
  }

  // Play the episode
  spotifyStore.play({ uris: [episode.uri] })
  router.push('/now-playing')
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }
  return `${minutes} min`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  if (authStore.isAuthenticated) {
    await fetchShowData()
    await spotifyStore.fetchCurrentPlayback()

    // Find currently playing episode index
    const playingIndex = episodes.value.findIndex(e => e.uri === currentTrackUri.value)
    if (playingIndex >= 0) {
      setSelectedIndex(playingIndex)
    }
  }
})

// Watch for episode changes
watch(currentTrackUri, (newUri) => {
  const playingIndex = episodes.value.findIndex(e => e.uri === newUri)
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
    :image="showArt"
    :title="showName"
    :subtitle="publisherName"
    image-rounded="lg"
    :items="episodes"
    :selected-index="selectedEpisodeIndex"
    :current-item-uri="currentTrackUri"
    item-data-attribute="data-episode-index"
    @item-click="handleEpisodePlay"
  >
    <template #item="{ item: episode }">
      <p class="text-[28px] font-[580] tracking-tight truncate text-white">
        {{ episode.name }}
      </p>
      <p class="text-[20px] font-[560] text-white/60 tracking-tight truncate">
        {{ formatDate(episode.release_date) }} · {{ formatDuration(episode.duration_ms) }}
      </p>
      <p
        v-if="episode.description"
        class="text-[18px] text-white/40 tracking-tight line-clamp-2 mt-1"
      >
        {{ episode.description }}
      </p>
    </template>
  </MediaListView>
</template>

