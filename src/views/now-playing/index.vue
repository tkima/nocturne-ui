<!-- ============================================================
     Now Playing View - Full-screen player with controls
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { createButtonHandler } from '@/composables/useButtonAction'
import { useButtonMapping } from '@/composables/useButtonMapping'
import ProgressBar from '@/components/player/ProgressBar.vue'
import ButtonMappingOverlay from '@/components/common/ButtonMappingOverlay.vue'
import {
  HeartIcon,
  PlayIcon,
  PauseIcon,
  BackIcon,
  ForwardIcon,
  ShuffleIcon,
  RepeatIcon,
  MenuIcon
} from '@/components/common/icons'
import { logger } from '@/utils/logger'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const isLiked = ref(false)
const isProgressScrubbing = ref(false)
const playbackProgress = ref(0)
let progressInterval: ReturnType<typeof setInterval> | null = null
let playbackPollInterval: ReturnType<typeof setInterval> | null = null

// Dial/wheel seek state
const wheelDeltaAccumulator = ref(0)
const pendingSeekPosition = ref<number | null>(null)
let seekDebounceTimeout: ReturnType<typeof setTimeout> | null = null

// Swipe gesture state
const touchStartX = ref(0)
const touchStartY = ref(0)
const isSwiping = ref(false)
const swipeThreshold = 50 // Minimum distance for swipe
const swipeAreaRef = ref<HTMLElement | null>(null)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const playback = computed(() => spotifyStore.currentPlayback)
const isPlaying = computed(() => playback.value?.is_playing ?? false)
const shuffleEnabled = computed(() => playback.value?.shuffle_state ?? false)
const repeatMode = computed(() => playback.value?.repeat_state ?? 'off')
const needsRetry = computed(() => spotifyStore.needsRetry)
const retryError = computed(() => spotifyStore.retryError)
const showError = ref(false)
let errorDelayTimeout: ReturnType<typeof setTimeout> | null = null

// Show error with 5s delay, hide immediately when resolved
watch(needsRetry, (hasError) => {
  if (errorDelayTimeout) {
    clearTimeout(errorDelayTimeout)
    errorDelayTimeout = null
  }

  if (hasError) {
    // Delay showing error by 5 seconds
    errorDelayTimeout = setTimeout(() => {
      showError.value = true
    }, 5000)
  } else {
    // Hide immediately when error clears
    showError.value = false
  }
})

const trackName = computed(() => playback.value?.item?.name || 'Not Playing')

// Check if currently playing is an episode (podcast) or track
// Also check if item has 'show' property as fallback detection
const isEpisode = computed(() => {
  return playback.value?.currently_playing_type === 'episode' || !!playback.value?.item?.show
})

// Get episode context from store (set when playing from show view)
const episodeContext = computed(() => spotifyStore.currentEpisodeContext)

const artistName = computed(() => {
  // For episodes, show the show name
  if (playback.value?.item?.show?.name) {
    return playback.value.item.show.name
  }
  // Fallback to stored episode context
  if (isEpisode.value && episodeContext.value?.showName) {
    return episodeContext.value.showName
  }
  // For tracks, show artist names
  const artists = playback.value?.item?.artists
  return artists?.map(a => a.name).join(', ') || 'Unknown Artist'
})

const albumArt = computed(() => {
  const item = playback.value?.item

  // For episodes, use episode images or show images
  if (item?.images?.length) {
    return item.images[0]?.url || ''
  }
  if (item?.show?.images?.length) {
    return item.show.images[0]?.url || ''
  }
  // Fallback to stored episode context
  if (isEpisode.value && episodeContext.value) {
    if (episodeContext.value.episodeImages?.length) {
      return episodeContext.value.episodeImages[0]?.url || ''
    }
    if (episodeContext.value.showImages?.length) {
      return episodeContext.value.showImages[0]?.url || ''
    }
  }
  // For tracks, use album images
  const images = item?.album?.images
  return images?.[0]?.url || images?.[1]?.url || ''
})

const duration = computed(() => {
  // Try API duration first
  const apiDuration = playback.value?.item?.duration_ms || 0
  if (apiDuration > 0) return apiDuration

  // Fallback to stored episode context duration
  if (isEpisode.value && episodeContext.value?.episodeDuration) {
    return episodeContext.value.episodeDuration
  }
  return 0
})
const progress = computed(() => {
  if (duration.value === 0) return 0
  return (playbackProgress.value / duration.value) * 100
})

// Time formatting helper
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Elapsed and remaining time
const elapsedTime = computed(() => formatTime(playbackProgress.value))
const remainingTime = computed(() => {
  const remaining = duration.value - playbackProgress.value
  return `-${formatTime(Math.max(0, remaining))}`
})

// For tracks: album ID, for episodes: show ID
const albumId = computed(() => playback.value?.item?.album?.id || null)
const showId = computed(() => {
  // Try API show ID first
  if (playback.value?.item?.show?.id) {
    return playback.value.item.show.id
  }
  // Fallback to stored episode context
  if (isEpisode.value && episodeContext.value?.showId) {
    return episodeContext.value.showId
  }
  return null
})

// Get content info from context URI (for button mapping)
const mappingContent = computed(() => {
  const contextUri = playback.value?.context?.uri
  if (contextUri?.startsWith('spotify:playlist:')) {
    return {
      id: contextUri.replace('spotify:playlist:', ''),
      type: 'playlist' as const
    }
  }
  if (contextUri?.startsWith('spotify:album:')) {
    return {
      id: contextUri.replace('spotify:album:', ''),
      type: 'album' as const
    }
  }
  if (contextUri?.startsWith('spotify:show:')) {
    return {
      id: contextUri.replace('spotify:show:', ''),
      type: 'show' as const
    }
  }
  if (contextUri?.startsWith('spotify:artist:')) {
    return {
      id: contextUri.replace('spotify:artist:', ''),
      type: 'artist' as const
    }
  }
  // For episodes, use the show ID
  if (isEpisode.value && showId.value) {
    return {
      id: showId.value,
      type: 'show' as const
    }
  }
  // For tracks without context, use album ID
  if (albumId.value) {
    return {
      id: albumId.value,
      type: 'album' as const
    }
  }
  return { id: null, type: null }
})

// ------------------------------------------------------------
// Button Mapping (long press 1-4 to save preset)
// ------------------------------------------------------------
const { showMappingOverlay, activeButton, startListening: startButtonMapping, stopListening: stopButtonMapping } = useButtonMapping(() => ({
  contentId: mappingContent.value.id,
  contentType: mappingContent.value.type,
  contentImage: albumArt.value,
  contentName: trackName.value,
  isActive: true, // Always listen for button presses
}))

// ------------------------------------------------------------
// Close/Back handler
// ------------------------------------------------------------
function handleClose() {
  router.push('/recents')
}

function handleArtClick() {
  if (isEpisode.value && showId.value) {
    router.push(`/show/${showId.value}`)
  } else if (albumId.value) {
    router.push(`/album/${albumId.value}`)
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleClose()
  }
}

// ------------------------------------------------------------
// Playback Progress
// ------------------------------------------------------------
function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval)

  progressInterval = setInterval(() => {
    if (isPlaying.value && !isProgressScrubbing.value) {
      playbackProgress.value += 1000
    }
  }, 1000)
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
}

// Poll for playback state changes (e.g., when user starts playing on phone)
// Polls every 5s when idle, every 30s when playing
function startPlaybackPolling() {
  if (playbackPollInterval) clearInterval(playbackPollInterval)

  const poll = async () => {
    if (!authStore.isAuthenticated) return

    const wasPlaying = isPlaying.value
    const hadPlayback = !!playback.value?.item

    await spotifyStore.fetchCurrentPlayback()

    // Sync progress when playback state changes or periodically
    if (playback.value) {
      // Update progress from server if we weren't playing before, or every poll
      if (!wasPlaying || !hadPlayback) {
        playbackProgress.value = playback.value.progress_ms || 0
      }
    }
  }

  // Initial poll
  poll()

  // Set up interval - poll more frequently when nothing is playing
  playbackPollInterval = setInterval(() => {
    poll()
  }, isPlaying.value ? 30000 : 5000) // 30s when playing, 5s when idle
}

function stopPlaybackPolling() {
  if (playbackPollInterval) {
    clearInterval(playbackPollInterval)
    playbackPollInterval = null
  }
}

// Adjust polling frequency when play state changes
watch(isPlaying, () => {
  // Restart polling with appropriate interval
  if (playbackPollInterval) {
    startPlaybackPolling()
  }
})

// ------------------------------------------------------------
// Handlers - Using createButtonHandler for automatic logging & throttling
// ------------------------------------------------------------
const handlePlayPause = createButtonHandler('Play/Pause', async () => {
  if (isPlaying.value) {
    await spotifyStore.pause()
  } else {
    await spotifyStore.play()
  }
  await spotifyStore.fetchCurrentPlayback()
}, 300)

const handleSkipNext = createButtonHandler('Skip Next', async () => {
  await spotifyStore.skipToNext()
  await new Promise(r => setTimeout(r, 500))
  await spotifyStore.fetchCurrentPlayback()
  playbackProgress.value = spotifyStore.currentPlayback?.progress_ms || 0
}, 1500)

const handleSkipPrevious = createButtonHandler('Skip Previous', async () => {
  await spotifyStore.skipToPrevious()
  await new Promise(r => setTimeout(r, 500))
  await spotifyStore.fetchCurrentPlayback()
  playbackProgress.value = spotifyStore.currentPlayback?.progress_ms || 0
}, 1500)

const handleToggleLike = createButtonHandler('Like', async () => {
  const trackId = playback.value?.item?.id
  if (!trackId) {
    throw new Error('No track ID')
  }
  if (isLiked.value) {
    await spotifyStore.removeTrack(trackId)
    isLiked.value = false
  } else {
    await spotifyStore.saveTrack(trackId)
    isLiked.value = true
  }
}, 500)

const handleToggleShuffle = createButtonHandler('Shuffle', async () => {
  const newState = !shuffleEnabled.value
  await spotifyStore.setShuffle(newState)
  await spotifyStore.fetchCurrentPlayback()
}, 500)

const handleToggleRepeat = createButtonHandler('Repeat', async () => {
  const modes: ('off' | 'context' | 'track')[] = ['off', 'context', 'track']
  const currentIndex = modes.indexOf(repeatMode.value)
  const nextMode = modes[(currentIndex + 1) % modes.length] || 'off'
  await spotifyStore.setRepeat(nextMode)
  await spotifyStore.fetchCurrentPlayback()
}, 500)

async function onSeek(progressPercent: number) {
  const seekMs = Math.floor((progressPercent / 100) * duration.value)
  await spotifyStore.seek(seekMs)
  playbackProgress.value = seekMs
}

function handleScrubbingChange(scrubbing: boolean) {
  isProgressScrubbing.value = scrubbing
}

// ------------------------------------------------------------
// Dial/Wheel Seek Handler (±10 seconds)
// ------------------------------------------------------------
function handleWheel(e: WheelEvent) {
  e.preventDefault()

  if (isProgressScrubbing.value) return

  // Accumulate delta (handle both horizontal and vertical scroll)
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  wheelDeltaAccumulator.value += delta

  // Only trigger seek when accumulated delta exceeds threshold
  if (Math.abs(wheelDeltaAccumulator.value) >= 2) {
    const direction = wheelDeltaAccumulator.value > 0 ? 1 : -1
    wheelDeltaAccumulator.value = 0

    const seekAmount = 10000 // 10 seconds in ms
    const basePosition = pendingSeekPosition.value !== null
      ? pendingSeekPosition.value
      : playbackProgress.value

    const rawNewPosition = basePosition + direction * seekAmount

    // If seeking past end, skip to next song
    if (rawNewPosition >= duration.value) {
      handleSkipNext()
      return
    }

    // If seeking before start, go to previous or start
    if (rawNewPosition < 0) {
      handleSkipPrevious()
      return
    }

    // Store pending position and update UI immediately (optimistic)
    pendingSeekPosition.value = rawNewPosition
    playbackProgress.value = rawNewPosition

    // Debounce the actual API call
    if (seekDebounceTimeout) {
      clearTimeout(seekDebounceTimeout)
    }

    seekDebounceTimeout = setTimeout(async () => {
      const seekPosition = pendingSeekPosition.value
      if (seekPosition !== null) {
        try {
          await spotifyStore.seek(seekPosition)
        } catch {
          // Ignore seek errors - don't show connection error for seek failures
        }
        // Clear any transient errors from seeking
        spotifyStore.clearRetryState()
        pendingSeekPosition.value = null
        logger.info('Dial seek completed', { position: seekPosition })
      }
    }, 300)
  }
}

// ------------------------------------------------------------
// Swipe Gesture Handlers (for next/previous track)
// ------------------------------------------------------------
function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
  isSwiping.value = false
}

function handleTouchMove(e: TouchEvent) {
  if (touchStartX.value === 0) return
  const touch = e.touches[0]
  if (!touch) return

  const deltaX = touch.clientX - touchStartX.value
  const deltaY = touch.clientY - touchStartY.value

  // If horizontal movement is greater than vertical, it's a swipe
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20) {
    isSwiping.value = true
    e.preventDefault() // Prevent scroll during horizontal swipe
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (touchStartX.value === 0) return
  const touch = e.changedTouches[0]
  if (!touch) return

  const deltaX = touch.clientX - touchStartX.value

  // Simple check: if moved more than threshold horizontally
  if (Math.abs(deltaX) > swipeThreshold) {
    if (deltaX < 0) {
      // Swipe left -> next track
      handleSkipNext()
    } else {
      // Swipe right -> previous track
      handleSkipPrevious()
    }
  }

  // Reset
  touchStartX.value = 0
  touchStartY.value = 0
  isSwiping.value = false
}

// Check if current track is liked
async function checkIfLiked() {
  const trackId = playback.value?.item?.id
  if (trackId) {
    isLiked.value = await spotifyStore.checkIfTrackSaved(trackId)
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('wheel', handleWheel, { passive: false })
  startButtonMapping()

  // Attach swipe listeners with passive: false to allow preventDefault
  if (swipeAreaRef.value) {
    swipeAreaRef.value.addEventListener('touchstart', handleTouchStart, { passive: true })
    swipeAreaRef.value.addEventListener('touchmove', handleTouchMove, { passive: false })
    swipeAreaRef.value.addEventListener('touchend', handleTouchEnd)
  }

  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    await spotifyStore.fetchCurrentPlayback()
    if (playback.value) {
      playbackProgress.value = playback.value.progress_ms || 0
      await checkIfLiked()

      // Debug: log what data we have for episodes
      logger.info('Now Playing mounted', {
        type: playback.value.currently_playing_type,
        isEpisode: isEpisode.value,
        itemName: playback.value.item?.name,
        hasShow: !!playback.value.item?.show,
        showName: playback.value.item?.show?.name,
        hasItemImages: !!playback.value.item?.images?.length,
        hasShowImages: !!playback.value.item?.show?.images?.length,
        hasEpisodeContext: !!episodeContext.value,
        computedArtistName: artistName.value,
        computedAlbumArt: albumArt.value ? 'has image' : 'no image',
      })
    }
    startProgressTracking()
    startPlaybackPolling()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('wheel', handleWheel)
  stopButtonMapping()
  stopProgressTracking()
  stopPlaybackPolling()
  if (seekDebounceTimeout) {
    clearTimeout(seekDebounceTimeout)
  }
  if (errorDelayTimeout) {
    clearTimeout(errorDelayTimeout)
  }
  // Remove swipe listeners
  if (swipeAreaRef.value) {
    swipeAreaRef.value.removeEventListener('touchstart', handleTouchStart)
    swipeAreaRef.value.removeEventListener('touchmove', handleTouchMove)
    swipeAreaRef.value.removeEventListener('touchend', handleTouchEnd)
  }
})
</script>

<template>
  <!-- Button Mapping Overlay -->
  <ButtonMappingOverlay
    :show="showMappingOverlay"
    :active-button="activeButton"
  />

  <div class="flex flex-col gap-1 h-screen w-full z-10 fadeIn-animation">
      <!-- Error Banner (No Active Device) -->
      <div
        v-if="showError && retryError"
        class="absolute top-0 left-0 right-0 z-20 bg-blue-600/90 px-6 py-3 text-center"
      >
        <p class="text-white text-[24px] font-[560]">{{ retryError }}</p>
      </div>

      <!-- Album Art and Track Info (swipeable for next/prev) -->
      <div
        ref="swipeAreaRef"
        class="md:w-1/3 flex flex-row items-center px-12 pt-10"
      >
        <!-- Album/Show Art (clickable to show track/episode list) -->
        <div
          class="mr-8"
          style="min-width: var(--album-art-size); height: var(--album-art-size)"
          :class="(albumId || showId) ? 'cursor-pointer' : ''"
          @click="handleArtClick"
        >
          <img
            v-if="albumArt"
            :src="albumArt"
            alt="Album Art"
            loading="lazy"
            class="object-cover rounded-[12px] drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:scale-[1.02]"
            style="width: var(--album-art-size); height: var(--album-art-size)"
          />
          <div
            v-else
            class="bg-white/10 rounded-[12px] flex items-center justify-center"
            style="width: var(--album-art-size); height: var(--album-art-size)"
          >
            <span class="text-white/40 text-xl">No Track</span>
          </div>
        </div>

        <!-- Track Info -->
        <div class="flex-1 text-center md:text-left">
          <div class="max-w-[400px]">
            <h2 class="text-[40px] font-[580] text-white tracking-tight truncate">
              {{ trackName }}
            </h2>
          </div>
          <h4 class="text-[36px] font-[560] text-white/60 truncate tracking-tight max-w-[380px]">
            {{ artistName }}
          </h4>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="px-12 pt-4 pb-7">
        <ProgressBar
          :progress="progress"
          :is-playing="isPlaying"
          :duration-ms="duration"
          @seek="onSeek"
          @scrubbing-change="handleScrubbingChange"
        />
        <!-- Time display -->
        <div class="flex justify-between mt-2 text-[20px] font-[560] text-white/60 tracking-tight">
          <span>{{ elapsedTime }}</span>
          <span>{{ remainingTime }}</span>
        </div>
      </div>

      <!-- Player Controls -->
      <div
        class="flex justify-between items-center w-full px-12 mt-1 transition-all duration-200 ease-in-out"
        :class="isProgressScrubbing ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'"
      >
        <!-- Like Button -->
        <div
          class="flex-shrink-0 cursor-pointer focus:outline-none"
          @click="handleToggleLike"
        >
          <HeartIcon
            :class="isLiked ? 'w-14 h-14 fill-white' : 'w-14 h-14 fill-white/60'"
          />
        </div>

        <!-- Center Controls: Back, Play/Pause, Forward -->
        <div class="flex justify-center items-center flex-1">
          <div
            class="mx-6 cursor-pointer focus:outline-none"
            @click="handleSkipPrevious"
          >
            <BackIcon class="w-14 h-14" />
          </div>

          <div
            class="mx-6 cursor-pointer transition-opacity duration-100 focus:outline-none"
            @click="handlePlayPause"
          >
            <PauseIcon v-if="isPlaying" class="w-14 h-14" />
            <PlayIcon v-else class="w-14 h-14" />
          </div>

          <div
            class="mx-6 cursor-pointer focus:outline-none"
            @click="handleSkipNext"
          >
            <ForwardIcon class="w-14 h-14" />
          </div>
        </div>

        <!-- Right Controls: Shuffle, Repeat, Menu -->
        <div class="flex items-center gap-12">
          <div
            class="mr-4 cursor-pointer focus:outline-none"
            @click="handleToggleShuffle"
          >
            <ShuffleIcon
              :class="shuffleEnabled ? 'w-10 h-10 text-white' : 'w-10 h-10 text-white/60'"
            />
          </div>

          <div
            class="mr-4 cursor-pointer focus:outline-none"
            @click="handleToggleRepeat"
          >
            <RepeatIcon
              :class="repeatMode !== 'off' ? 'w-10 h-10 text-white' : 'w-10 h-10 text-white/60'"
            />
          </div>

          <div class="cursor-pointer focus:outline-none">
            <MenuIcon class="w-14 h-14 fill-white/60" />
          </div>
        </div>
      </div>
  </div>
</template>
