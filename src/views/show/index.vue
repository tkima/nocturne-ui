<!-- ============================================================
     Show View - Shows podcast episodes in a list
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
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
const selectedEpisodeIndex = ref(0)

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
  await spotifyStore.play({ uris: [episode.uri] })

  // Fetch updated playback state and navigate to Now Playing
  setTimeout(async () => {
    await spotifyStore.fetchCurrentPlayback()
    router.push('/now-playing')
  }, 500)
}

function handleBack() {
  router.back()
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleBack()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (selectedEpisodeIndex.value > 0) {
      selectedEpisodeIndex.value--
      scrollToEpisode(selectedEpisodeIndex.value)
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedEpisodeIndex.value < episodes.value.length - 1) {
      selectedEpisodeIndex.value++
      scrollToEpisode(selectedEpisodeIndex.value)
    }
  } else if (e.key === 'Enter') {
    const episode = episodes.value[selectedEpisodeIndex.value]
    if (episode) {
      handleEpisodePlay(episode, selectedEpisodeIndex.value)
    }
  }
}

function scrollToEpisode(index: number) {
  const element = document.querySelector(`[data-episode-index="${index}"]`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
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
  window.addEventListener('keydown', handleKeyDown)

  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    await fetchShowData()
    await spotifyStore.fetchCurrentPlayback()

    // Find currently playing episode index
    const playingIndex = episodes.value.findIndex(e => e.uri === currentTrackUri.value)
    if (playingIndex >= 0) {
      selectedEpisodeIndex.value = playingIndex
      setTimeout(() => scrollToEpisode(playingIndex), 100)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Watch for episode changes
watch(currentTrackUri, (newUri) => {
  const playingIndex = episodes.value.findIndex(e => e.uri === newUri)
  if (playingIndex >= 0) {
    selectedEpisodeIndex.value = playingIndex
  }
})
</script>

<template>
  <div class="h-screen w-full flex fadeIn-animation">
    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center w-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <template v-else>
      <!-- Left: Show Info (Sticky) -->
      <div class="flex-shrink-0 p-12 flex flex-col">
        <!-- Show Art -->
        <img
          v-if="showArt"
          :src="showArt"
          alt="Show Art"
          class="object-cover rounded-[12px] drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]"
          style="width: var(--album-art-size); height: var(--album-art-size)"
        />
        <div
          v-else
          class="bg-white/10 rounded-[12px] flex items-center justify-center"
          style="width: var(--album-art-size); height: var(--album-art-size)"
        >
          <span class="text-white/40 text-xl">No Art</span>
        </div>

        <!-- Show Info -->
        <div class="mt-6" style="max-width: var(--album-art-size)">
          <h2 class="text-[32px] font-[580] text-white tracking-tight truncate">
            {{ showName }}
          </h2>
          <p class="text-[24px] font-[560] text-white/60 tracking-tight truncate">
            {{ publisherName }}
          </p>
        </div>
      </div>

      <!-- Right: Episode List (Scrollable) -->
      <div class="flex-1 overflow-y-auto py-12 pr-12 scroll-container">
        <div
          v-for="(episode, index) in episodes"
          :key="episode.id || index"
          :data-episode-index="index"
          class="flex items-start mb-6 cursor-pointer transition-transform duration-200 ease-out"
          :class="selectedEpisodeIndex === index ? 'scale-105' : ''"
          @click="handleEpisodePlay(episode, index)"
        >
          <!-- Episode Number or Playing Indicator -->
          <div class="w-12 flex-shrink-0">
            <div
              v-if="episode.uri === currentTrackUri"
              class="flex items-end gap-[2px] h-6"
            >
              <div class="w-1 bg-white animate-wave0 rounded-full" />
              <div class="w-1 bg-white animate-wave1 rounded-full" />
              <div class="w-1 bg-white animate-wave2 rounded-full" />
              <div class="w-1 bg-white animate-wave3 rounded-full" />
            </div>
            <p v-else class="text-[28px] font-[560] text-white/40">
              {{ index + 1 }}
            </p>
          </div>

          <!-- Episode Info -->
          <div class="flex-1 min-w-0">
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
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Wave animation for currently playing episode */
@keyframes wave {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}

.animate-wave0 {
  animation: wave 0.8s ease-in-out infinite;
  animation-delay: 0s;
}

.animate-wave1 {
  animation: wave 0.8s ease-in-out infinite;
  animation-delay: 0.2s;
}

.animate-wave2 {
  animation: wave 0.8s ease-in-out infinite;
  animation-delay: 0.4s;
}

.animate-wave3 {
  animation: wave 0.8s ease-in-out infinite;
  animation-delay: 0.6s;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
