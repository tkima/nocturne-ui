<!-- ============================================================
     Album View - Shows album tracks in a list
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const route = useRoute()
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const album = ref<any>(null)
const tracks = ref<any[]>([])
const isLoading = ref(true)
const selectedTrackIndex = ref(0)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const albumId = computed(() => route.params.id as string)
const currentTrackUri = computed(() => spotifyStore.currentPlayback?.item?.uri)

const albumArt = computed(() => {
  return album.value?.images?.[0]?.url || album.value?.images?.[1]?.url || ''
})

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

  // Play the track within album context
  await spotifyStore.play({
    context_uri: `spotify:album:${albumId.value}`,
    offset: { position: index }
  })

  // Fetch updated playback state
  setTimeout(async () => {
    await spotifyStore.fetchCurrentPlayback()
    // Navigate to Now Playing
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
    if (selectedTrackIndex.value > 0) {
      selectedTrackIndex.value--
      scrollToTrack(selectedTrackIndex.value)
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedTrackIndex.value < tracks.value.length - 1) {
      selectedTrackIndex.value++
      scrollToTrack(selectedTrackIndex.value)
    }
  } else if (e.key === 'Enter') {
    const track = tracks.value[selectedTrackIndex.value]
    if (track) {
      handleTrackPlay(track, selectedTrackIndex.value)
    }
  }
}

function scrollToTrack(index: number) {
  const element = document.querySelector(`[data-track-index="${index}"]`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)

  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    await fetchAlbumData()
    await spotifyStore.fetchCurrentPlayback()

    // Find currently playing track index
    const playingIndex = tracks.value.findIndex(t => t.uri === currentTrackUri.value)
    if (playingIndex >= 0) {
      selectedTrackIndex.value = playingIndex
      setTimeout(() => scrollToTrack(playingIndex), 100)
    }
  }
})

import { onUnmounted } from 'vue'
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Watch for track changes
watch(currentTrackUri, (newUri) => {
  const playingIndex = tracks.value.findIndex(t => t.uri === newUri)
  if (playingIndex >= 0) {
    selectedTrackIndex.value = playingIndex
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
      <!-- Left: Album Info (Sticky) -->
      <div class="flex-shrink-0 p-12 flex flex-col">
        <!-- Album Art -->
        <img
          v-if="albumArt"
          :src="albumArt"
          alt="Album Art"
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

        <!-- Album Info -->
        <div class="mt-6" style="max-width: var(--album-art-size)">
          <h2 class="text-[32px] font-[580] text-white tracking-tight truncate">
            {{ albumName }}
          </h2>
          <p class="text-[24px] font-[560] text-white/60 tracking-tight truncate">
            {{ artistName }}
          </p>
        </div>
      </div>

      <!-- Right: Track List (Scrollable) -->
      <div class="flex-1 overflow-y-auto py-12 pr-12 scroll-container">
        <div
          v-for="(track, index) in tracks"
          :key="track.id || index"
          :data-track-index="index"
          class="flex items-start mb-5 cursor-pointer transition-transform duration-200 ease-out"
          :class="selectedTrackIndex === index ? 'scale-105' : ''"
          @click="handleTrackPlay(track, index)"
        >
          <!-- Track Number or Playing Indicator -->
          <div class="w-12 flex-shrink-0">
            <div
              v-if="track.uri === currentTrackUri"
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

          <!-- Track Info -->
          <div class="flex-1 min-w-0">
            <p
              class="text-[28px] font-[580] tracking-tight truncate"
              :class="track.uri === currentTrackUri ? 'text-white' : 'text-white'"
            >
              {{ track.name }}
            </p>
            <p class="text-[22px] font-[560] text-white/60 tracking-tight truncate">
              {{ track.artists?.map((a: any) => a.name).join(', ') }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Wave animation for currently playing track */
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
</style>
