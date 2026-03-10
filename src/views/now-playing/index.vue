<!-- ============================================================
     Now Playing View - Full-screen player with controls
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { createButtonHandler } from '@/composables/useButtonAction'
import { useHeartbeat } from '@/composables/useHeartbeat'
import ProgressBar from '@/components/player/ProgressBar.vue'
import {
  BlockIcon,
  HeartIcon,
  PlayIcon,
  PauseIcon,
  BackIcon,
  ForwardIcon,
  ShuffleIcon,
  RepeatIcon
} from '@/components/common/icons'
import { logger } from '@/utils/logger'
import { formatTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useSettings } from '@/composables/useSettings'

/* ============================================================
   STORES & ROUTER
   ============================================================ */
const router = useRouter()
const route = useRoute()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()
const heartbeat = useHeartbeat()
const { settings, get: getSetting, set: setSetting } = useSettings()


/* ============================================================
   STATE
   ============================================================ */

// --- Playback State ---
const isLiked = ref(false)
const isBlocked = ref(false)
const isProgressScrubbing = ref(false)
const playbackProgress = ref(0)
let progressInterval: ReturnType<typeof setInterval> | null = null


// --- Dial/Wheel Seek State ---
const wheelDeltaAccumulator = ref(0)
const pendingSeekPosition = ref<number | null>(null)
let seekDebounceTimeout: ReturnType<typeof setTimeout> | null = null

// --- Swipe Gesture State ---
let touchStartX = 0 // Plain variable, no reactivity needed
const swipeThreshold = 30 // Minimum distance for swipe
const swipeAreaRef = ref<HTMLElement | null>(null)

// --- Error Display State ---
const showError = ref(false)
let errorDelayTimeout: ReturnType<typeof setTimeout> | null = null

// --- Marquee Scrolling State ---
const trackNameRef = ref<HTMLElement | null>(null)
const trackNameContainerRef = ref<HTMLElement | null>(null)
const trackNameOverflow = ref(0) // How many pixels the text overflows



/* ============================================================
   COMPUTED - PLAYBACK (from store getters)
   ============================================================ */

const {
  isPlaying, shuffleState, repeatState, isEpisode,
  trackName, artistName, albumArt, duration, albumId, showId,
  currentPlayback, currentEpisodeContext, parsedContext,
  needsRetry, retryError,
} = storeToRefs(spotifyStore)

// Local aliases for template compat
const shuffleEnabled = shuffleState
const repeatMode = repeatState
const playback = currentPlayback
const episodeContext = currentEpisodeContext

// Show error with 5s delay, hide immediately when resolved
watch(needsRetry, (hasError) => {
  if (errorDelayTimeout) {
    clearTimeout(errorDelayTimeout)
    errorDelayTimeout = null
  }
  if (hasError) {
    errorDelayTimeout = setTimeout(() => {
      if (needsRetry.value) {
        showError.value = true
      }
    }, 8000)
  } else {
    showError.value = false
  }
})

// Should we animate the track name with marquee?
const shouldScrollTrackName = computed(() => {
  return settings.value.trackNameScrollingEnabled && trackNameOverflow.value > 0
})


/* ============================================================
   COMPUTED - PROGRESS & TIME
   ============================================================ */

const progress = computed(() => {
  if (duration.value === 0) return 0
  return (playbackProgress.value / duration.value) * 100
})

// Measure if track name overflows its container
function measureTrackNameOverflow() {
  if (!trackNameRef.value || !trackNameContainerRef.value) {
    trackNameOverflow.value = 0
    return
  }
  const textWidth = trackNameRef.value.scrollWidth
  const containerWidth = trackNameContainerRef.value.clientWidth
  trackNameOverflow.value = Math.max(0, textWidth - containerWidth)
}

const elapsedTime = computed(() => formatTime(playbackProgress.value))
const remainingTime = computed(() => {
  const remaining = duration.value - playbackProgress.value
  return `-${formatTime(Math.max(0, remaining))}`
})


/* ============================================================
   BUTTON MAPPING
   ============================================================ */

// Update global mappable content when playback changes
watch(parsedContext, (ctx) => {
  if (ctx.id && ctx.type) {
    uiStore.setMappableContent({
      id: ctx.id,
      type: ctx.type,
      image: spotifyStore.albumArt,
      name: spotifyStore.contextName || spotifyStore.trackName
    })
  }
}, { immediate: true })


/* ============================================================
   NAVIGATION HANDLERS
   ============================================================ */

function handleClose() {
  router.push('/radio')
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


/* ============================================================
   PROGRESS TRACKING & POLLING
   ============================================================ */

let lastSyncedTrackId: string | null = null // Track ID we already synced near end
let lastPolledTrackId: string | null = null // Track ID from last poll (for block detection)

function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval)

  progressInterval = setInterval(async () => {
    if (isPlaying.value && !isProgressScrubbing.value) {
      // Stop at track end (don't overflow)
      if (playbackProgress.value >= duration.value) return
      playbackProgress.value += 1000

      // Sync 10s before track ends (once per track)
      const currentTrackId = playback.value?.item?.id || null
      const remaining = duration.value - playbackProgress.value
      if (remaining > 0 && remaining <= 10000 && currentTrackId !== lastSyncedTrackId) {
        lastSyncedTrackId = currentTrackId
        await spotifyStore.fetchCurrentPlayback()
        if (playback.value) {
          playbackProgress.value = playback.value.progress_ms || 0
        }
      }
    }
  }, 1000)
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
}

// Poll for playback state changes
function startPlaybackPolling() {
  const interval = 5000

  // Initial poll
  pollPlayback()

  heartbeat.register({
    name: 'playback-poll',
    interval,
    enabled: () => authStore.isAuthenticated,
    fn: pollPlayback,
  })
}

async function pollPlayback() {
  if (!authStore.isAuthenticated) return
  await spotifyStore.fetchCurrentPlayback()
  // Always sync progress from server to prevent drift
  if (playback.value) {
    playbackProgress.value = playback.value.progress_ms || 0

    // Check if track changed and auto-skip if blocked
    const currentTrackId = playback.value.item?.id || null
    if (currentTrackId && currentTrackId !== lastPolledTrackId) {
      lastPolledTrackId = currentTrackId
      checkIfBlocked()
      await checkIfLiked()

      if (isBlocked.value) {
        toast.success('Skipped blocked song')
        await spotifyStore.skipToNext()
        spotifyStore.fetchPlaybackDebounced()
        return
      }

      // Artist radio: queue a related artist track
      if (parsedContext.value.type === 'artist' && parsedContext.value.id) {
        queueRelatedArtistTrack(parsedContext.value.id)
      }
    }
  }
}

/** Queue a random track from a similar artist (fire-and-forget) */
async function queueRelatedArtistTrack(artistId: string) {
  try {
    const artist = await spotifyStore.getArtist(artistId)
    if (!artist) return

    // Search for similar artists via Spotify search (returns related results)
    const artistResults = await spotifyStore.search(artist.name, ['artist'])
    const similarArtists = artistResults?.artists?.items?.filter(a => a.id !== artistId)
    if (!similarArtists?.length) return

    // Pick a random similar artist, search for their tracks
    const randomArtist = similarArtists[Math.floor(Math.random() * similarArtists.length)]
    if (!randomArtist) return
    const trackResults = await spotifyStore.search(randomArtist.name, ['track'])
    const tracks = trackResults?.tracks?.items
    if (!tracks?.length) return

    // Filter out blocked tracks and original artist
    const blockedIds = new Set(getSetting('blockedTracks').map(t => t.id))
    const eligible = tracks.filter(t =>
      !blockedIds.has(t.id) &&
      t.artists?.some(a => a.id === randomArtist.id)
    )
    if (!eligible.length) return

    const randomTrack = eligible[Math.floor(Math.random() * eligible.length)]
    if (!randomTrack) return
    await spotifyStore.addToQueue(randomTrack.uri)
    logger.info('Queued related track', {
      track: randomTrack.name,
      artist: randomArtist.name,
    })
  } catch (err) {
    logger.error('Failed to queue related track', { error: err })
  }
}

function stopPlaybackPolling() {
  heartbeat.unregister('playback-poll')
}

// When navigating back to now-playing (e.g. liked-songs → play → now-playing),
// fetch fresh playback after 1s so the new track shows up immediately
watch(() => route.path, (path) => {
  if (path === '/now-playing' && authStore.isAuthenticated) {
    setTimeout(pollPlayback, 1000)
  }
})

// Measure track name overflow when track changes
watch(trackName, () => {
  // Wait for DOM update before measuring
  setTimeout(measureTrackNameOverflow, 100)
})


/* ============================================================
   PLAYBACK CONTROL HANDLERS
   ============================================================ */

const handlePlayPause = createButtonHandler('Play/Pause', async () => {
  if (isPlaying.value) {
    await spotifyStore.pause()
  } else {
    await spotifyStore.play()
  }
  await spotifyStore.fetchCurrentPlayback()
}, 300)

// Reset progress after skip (with delay for smoother transition)
function resetProgress() {
  setTimeout(() => {
    playbackProgress.value = 0
  }, 1000)
}

// Skip handlers - instant action, debounced UI refresh via store
async function handleSkipNext() {
  logger.info('Skip Next')
  await spotifyStore.skipToNext()
  resetProgress()
  spotifyStore.fetchPlaybackDebounced()
}

async function handleSkipPrevious() {
  logger.info('Skip Previous')
  await spotifyStore.skipToPrevious()
  resetProgress()
  spotifyStore.fetchPlaybackDebounced()
}

const handleToggleLike = createButtonHandler('Like', async () => {
  const trackId = playback.value?.item?.id
  if (!trackId) throw new Error('No track ID')

  if (isLiked.value) {
    await spotifyStore.removeTrack(trackId)
    isLiked.value = false
    toast.success('Removed from Liked Songs')
  } else {
    await spotifyStore.saveTrack(trackId)
    isLiked.value = true
    toast.success('Added to Liked Songs')
  }
}, 500)

const handleToggleShuffle = createButtonHandler('Shuffle', async () => {
  await spotifyStore.setShuffle(!shuffleEnabled.value)
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

async function checkIfLiked() {
  const trackId = playback.value?.item?.id
  if (trackId) {
    isLiked.value = await spotifyStore.checkIfTrackSaved(trackId)
  }
}

function checkIfBlocked() {
  const trackId = playback.value?.item?.id
  if (trackId) {
    const blockedTracks = getSetting('blockedTracks')
    isBlocked.value = blockedTracks.some(t => t.id === trackId)
  }
}

const handleToggleBlock = createButtonHandler('Block', async () => {
  const trackId = playback.value?.item?.id
  if (!trackId) throw new Error('No track ID')

  const blockedTracks = [...getSetting('blockedTracks')]

  if (isBlocked.value) {
    const filtered = blockedTracks.filter(t => t.id !== trackId)
    await setSetting('blockedTracks', filtered)
    isBlocked.value = false
    toast.success('Song unblocked')
  } else {
    blockedTracks.push({
      id: trackId,
      name: trackName.value,
      artist: artistName.value,
    })
    await setSetting('blockedTracks', blockedTracks)
    toast.success('Song blocked')
    isBlocked.value = false
    await spotifyStore.skipToNext()
    resetProgress()
    spotifyStore.fetchPlaybackDebounced()
  }
}, 500)


/* ============================================================
   DIAL/WHEEL SEEK (±10 seconds)
   ============================================================ */

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

    // If seeking before start, go to previous
    if (rawNewPosition < 0) {
      handleSkipPrevious()
      return
    }

    // Store pending position and update UI immediately (optimistic)
    pendingSeekPosition.value = rawNewPosition
    playbackProgress.value = rawNewPosition

    // Debounce the actual API call
    if (seekDebounceTimeout) clearTimeout(seekDebounceTimeout)
    seekDebounceTimeout = setTimeout(async () => {
      const seekPosition = pendingSeekPosition.value
      if (seekPosition !== null) {
        try {
          await spotifyStore.seek(seekPosition)
        } catch {
          // Ignore seek errors
        }
        spotifyStore.clearRetryState()
        pendingSeekPosition.value = null
        logger.info('Dial seek completed', { position: seekPosition })
      }
    }, 300)
  }
}


/* ============================================================
   SWIPE GESTURES (next/previous track)
   Simplified: touchstart + touchend only, no touchmove overhead
   ============================================================ */

function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (touch) {
    touchStartX = touch.clientX
  }
}

function handleTouchEnd(e: TouchEvent) {
  const touch = e.changedTouches[0]
  if (!touch) return

  const deltaX = touch.clientX - touchStartX
  touchStartX = 0

  // Fire skip if moved more than threshold
  if (Math.abs(deltaX) > swipeThreshold) {
    if (deltaX < 0) {
      handleSkipNext() // Swipe left -> next track
    } else {
      handleSkipPrevious() // Swipe right -> previous track
    }
  }
}


/* ============================================================
   LIFECYCLE
   ============================================================ */

onMounted(async () => {
  // Register event listeners
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('wheel', handleWheel, { passive: false })

  // Attach swipe listeners
  if (swipeAreaRef.value) {
    swipeAreaRef.value.addEventListener('touchstart', handleTouchStart, { passive: true })
    swipeAreaRef.value.addEventListener('touchend', handleTouchEnd, { passive: true })
  }


  // Initialize playback
  if (authStore.isAuthenticated) {
    await spotifyStore.fetchCurrentPlayback()
    if (playback.value) {
      playbackProgress.value = playback.value.progress_ms || 0
      lastPolledTrackId = playback.value.item?.id || null
      await checkIfLiked()
      checkIfBlocked()

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
  // Remove event listeners
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('wheel', handleWheel)

  // Stop intervals
  stopProgressTracking()
  stopPlaybackPolling()

  // Clear timeouts
  if (seekDebounceTimeout) clearTimeout(seekDebounceTimeout)
  if (errorDelayTimeout) clearTimeout(errorDelayTimeout)

  // Remove swipe listeners
  if (swipeAreaRef.value) {
    swipeAreaRef.value.removeEventListener('touchstart', handleTouchStart)
    swipeAreaRef.value.removeEventListener('touchend', handleTouchEnd)
  }
})
</script>

<template>
  <div class="flex flex-col gap-1 h-screen w-full z-10 fadeIn-animation">
      <!-- Error Banner (No Active Device) -->
      <div
        v-if="showError && retryError"
        class="absolute top-0 left-0 right-0 z-20 bg-blue-600/90 px-6 py-3 text-center"
      >
        <p class="text-white text-[24px] font-[560]">{{ retryError }}</p>
      </div>

      <!-- Swipeable area for next/prev (covers album art, track info, and progress bar) -->
      <div ref="swipeAreaRef" class="flex-1">
      <!-- Album Art and Track Info -->
      <div
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

        <!-- Track Info (clickable to show album/show) -->
        <div
          class="flex-1 text-center md:text-left"
          :class="(albumId || showId) ? 'cursor-pointer' : ''"
          @click="handleArtClick"
        >
          <div ref="trackNameContainerRef" class="max-w-[400px] overflow-hidden">
            <h2
              ref="trackNameRef"
              class="text-[40px] font-[580] text-white tracking-tight whitespace-nowrap"
              :class="shouldScrollTrackName ? '' : 'truncate'"
              :style="shouldScrollTrackName ? {
                animation: 'marquee 8s linear infinite',
                '--final-position': `-${trackNameOverflow}px`
              } : {}"
            >
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
      </div>

      <!-- Player Controls -->
      <div
        class="flex justify-between items-center w-full px-12 mt-1 pb-10 transition-all duration-200 ease-in-out"
        :class="isProgressScrubbing ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'"
      >
        <!-- Like & Block Buttons -->
        <div class="flex items-center gap-6 flex-shrink-0">
          <div
            class="cursor-pointer focus:outline-none"
            @click="handleToggleLike"
          >
            <HeartIcon
              :class="isLiked ? 'w-14 h-14 fill-white' : 'w-14 h-14 fill-white/60'"
            />
          </div>
          <div
            class="cursor-pointer focus:outline-none pl-[20px]"
            @click="handleToggleBlock"
          >
            <BlockIcon
              :class="isBlocked ? 'w-10 h-10 text-red-400 stroke-red-400' : 'w-10 h-10 text-white/60'"
            />
          </div>
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

        </div>
      </div>
  </div>
</template>
