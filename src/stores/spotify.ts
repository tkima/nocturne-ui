import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import type { Track, Album, Artist, Playlist } from '@/types'
import { logger } from '@/utils/logger'
import { createLogger } from '@/utils/debug'

// ============================================================
// Spotify API Store - API calls and data fetching
// ============================================================

const log = createLogger('Spotify')
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

// Rate limiting: minimum time between API calls (ms)
const MIN_REQUEST_INTERVAL = 100
let lastRequestTime = 0

// No retries - keep it simple
const MAX_RETRIES = 0

export const useSpotifyStore = defineStore('spotify', () => {
  const authStore = useAuthStore()

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  const currentPlayback = ref<SpotifyPlayback | null>(null)
  const recentlyPlayed = ref<Track[]>([])
  const topArtists = ref<Artist[]>([])
  const userPlaylists = ref<Playlist[]>([])
  const savedTracks = ref<Track[]>([])
  const savedTracksTotal = ref(0)
  const userShows = ref<any[]>([])
  const radioMixes = ref<Playlist[]>([])
  const queue = ref<Track[]>([])
  const nextTrack = ref<Track | null>(null)
  // Context for podcasts - stores show and episode info for Now Playing fallback
  const currentEpisodeContext = ref<{
    showId: string
    showName: string
    showImages: Array<{ url: string }>
    episodeId: string
    episodeName: string
    episodeDuration: number
    episodeImages: Array<{ url: string }>
  } | null>(null)
  const isRadioMode = computed(() => {
    const uri = currentPlayback.value?.context?.uri
    return !!uri && uri.startsWith('spotify:artist:')
  })
  // Rolling history of recently played artist IDs (only tracks played >20s)
  const radioArtistHistory = ref<string[]>([])
  const RADIO_HISTORY_MAX = 15

  function radioHistoryPush(artistId: string) {
    radioArtistHistory.value.push(artistId)
    if (radioArtistHistory.value.length > RADIO_HISTORY_MAX) {
      radioArtistHistory.value.shift()
    }
  }

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  // Retry state - when true, user needs to manually retry
  const needsRetry = ref(false)
  const retryError = ref<string | null>(null)

  // ------------------------------------------------------------
  // Derived Playback Getters
  // ------------------------------------------------------------
  const isPlaying = computed(() => currentPlayback.value?.is_playing ?? false)
  const shuffleState = computed(() => currentPlayback.value?.shuffle_state ?? false)
  const repeatState = computed(() => currentPlayback.value?.repeat_state ?? 'off')

  const isEpisode = computed(() => {
    return currentPlayback.value?.currently_playing_type === 'episode'
      || !!currentPlayback.value?.item?.show
  })

  const currentTrackUri = computed(() => currentPlayback.value?.item?.uri ?? null)

  const trackName = computed(() => currentPlayback.value?.item?.name || 'Play Spotify First')

  const artistName = computed(() => {
    // For episodes, show the show name
    if (currentPlayback.value?.item?.show?.name) {
      return currentPlayback.value.item.show.name
    }
    // Fallback to stored episode context
    if (isEpisode.value && currentEpisodeContext.value?.showName) {
      return currentEpisodeContext.value.showName
    }
    // For tracks, show artist names
    const artists = currentPlayback.value?.item?.artists
    if (artists?.length) {
      return artists.map(a => a.name).join(', ')
    }
    return ''
  })

  const albumArt = computed(() => {
    const item = currentPlayback.value?.item

    // For episodes, use episode images or show images
    if (item?.images?.length) {
      return item.images[0]?.url || ''
    }
    if (item?.show?.images?.length) {
      return item.show.images[0]?.url || ''
    }
    // Fallback to stored episode context
    if (isEpisode.value && currentEpisodeContext.value) {
      if (currentEpisodeContext.value.episodeImages?.length) {
        return currentEpisodeContext.value.episodeImages[0]?.url || ''
      }
      if (currentEpisodeContext.value.showImages?.length) {
        return currentEpisodeContext.value.showImages[0]?.url || ''
      }
    }
    // For tracks, use album images
    const images = item?.album?.images
    return images?.[0]?.url || images?.[1]?.url || ''
  })

  const duration = computed(() => {
    const apiDuration = currentPlayback.value?.item?.duration_ms || 0
    if (apiDuration > 0) return apiDuration
    // Fallback to stored episode context duration
    if (isEpisode.value && currentEpisodeContext.value?.episodeDuration) {
      return currentEpisodeContext.value.episodeDuration
    }
    return 0
  })

  const albumId = computed(() => currentPlayback.value?.item?.album?.id || null)

  const showId = computed(() => {
    if (currentPlayback.value?.item?.show?.id) {
      return currentPlayback.value.item.show.id
    }
    if (isEpisode.value && currentEpisodeContext.value?.showId) {
      return currentEpisodeContext.value.showId
    }
    return null
  })

  const parsedContext = computed(() => {
    const contextUri = currentPlayback.value?.context?.uri
    // Liked Songs (spotify:user:xxx:collection)
    if (contextUri && /^spotify:user:[^:]+:collection$/.test(contextUri)) {
      return { id: 'liked-songs', type: 'liked-songs' as const }
    }
    if (contextUri?.startsWith('spotify:playlist:')) {
      return { id: contextUri.replace('spotify:playlist:', ''), type: 'playlist' as const }
    }
    if (contextUri?.startsWith('spotify:album:')) {
      return { id: contextUri.replace('spotify:album:', ''), type: 'album' as const }
    }
    if (contextUri?.startsWith('spotify:show:')) {
      return { id: contextUri.replace('spotify:show:', ''), type: 'show' as const }
    }
    if (contextUri?.startsWith('spotify:artist:')) {
      return { id: contextUri.replace('spotify:artist:', ''), type: 'artist' as const }
    }
    // For episodes, use the show ID
    if (isEpisode.value && showId.value) {
      return { id: showId.value, type: 'show' as const }
    }
    // For tracks without context, use album ID
    if (albumId.value) {
      return { id: albumId.value, type: 'album' as const }
    }
    return { id: null as string | null, type: null as 'playlist' | 'album' | 'show' | 'artist' | 'liked-songs' | null }
  })

  // Context name (album name, playlist name, etc.) - used for button presets
  const contextName = computed(() => {
    const ctx = parsedContext.value
    if (ctx.type === 'liked-songs') return 'Liked Songs'
    if (ctx.type === 'album') return currentPlayback.value?.item?.album?.name || 'Unknown Album'
    if (ctx.type === 'show') return currentPlayback.value?.item?.show?.name || artistName.value
    // For playlist/artist, name isn't in playback data — will be fetched on save
    return null
  })

  // ------------------------------------------------------------
  // API Stats - Track requests, retries, rate limits for debugging
  // ------------------------------------------------------------
  interface ApiStats {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    retries: number
    rateLimits: number
    lastRateLimit: string | null
    requestHistory: Array<{
      timestamp: string
      endpoint: string
      method: string
      status: number
      duration: number
      retryCount: number
    }>
  }

  const apiStats = ref<ApiStats>({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    rateLimits: 0,
    lastRateLimit: null,
    requestHistory: []
  })

  // Keep only last 50 requests in history
  const MAX_HISTORY = 50

  function recordRequest(
    endpoint: string,
    method: string,
    status: number,
    duration: number,
    retryCount: number
  ) {
    apiStats.value.totalRequests++

    if (status >= 200 && status < 300) {
      apiStats.value.successfulRequests++
    } else {
      apiStats.value.failedRequests++
    }

    if (retryCount > 0) {
      apiStats.value.retries += retryCount
    }

    if (status === 429) {
      apiStats.value.rateLimits++
      apiStats.value.lastRateLimit = new Date().toISOString()
    }

    // Add to history
    apiStats.value.requestHistory.push({
      timestamp: new Date().toISOString(),
      endpoint,
      method,
      status,
      duration,
      retryCount
    })

    // Trim history
    if (apiStats.value.requestHistory.length > MAX_HISTORY) {
      apiStats.value.requestHistory = apiStats.value.requestHistory.slice(-MAX_HISTORY)
    }

    // Log stats periodically (every 10 requests)
    if (apiStats.value.totalRequests % 10 === 0) {
      logger.info('API Stats', {
        total: apiStats.value.totalRequests,
        success: apiStats.value.successfulRequests,
        failed: apiStats.value.failedRequests,
        retries: apiStats.value.retries,
        rateLimits: apiStats.value.rateLimits
      })
    }
  }

  function getApiStats() {
    return { ...apiStats.value }
  }

  function resetApiStats() {
    apiStats.value = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateLimits: 0,
      lastRateLimit: null,
      requestHistory: []
    }
    logger.info('API Stats reset')
  }

  // ------------------------------------------------------------
  // Types
  // ------------------------------------------------------------
  interface SpotifyEpisode {
    id: string
    name: string
    duration_ms: number
    uri: string
    images?: Array<{ url: string; height: number; width: number }>
    show?: {
      id: string
      name: string
      publisher: string
      images?: Array<{ url: string; height: number; width: number }>
    }
  }

  interface SpotifyPlayback {
    is_playing: boolean
    progress_ms: number
    currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown'
    item: (Track & { show?: SpotifyEpisode['show']; images?: SpotifyEpisode['images'] }) | null
    device: {
      id: string
      name: string
      type: string
      volume_percent: number
    } | null
    shuffle_state: boolean
    repeat_state: 'off' | 'context' | 'track'
    context?: {
      uri: string
      type?: string
    } | null
  }

  // ------------------------------------------------------------
  // Helper: Make authenticated API request with rate limiting and retries
  // ------------------------------------------------------------
  async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T | null> {
    // Skip if not connected (no network or not authenticated)
    if (!authStore.isConnected) {
      log.warn(`API skipped (not connected): ${endpoint}`)
      return null
    }

    const token = await authStore.ensureValidToken()
    if (!token) {
      setRetryError('Not authenticated - please log in again')
      return null
    }

    await enforceRateLimit()

    const method = options.method || 'GET'
    generateRequestId()
    const startTime = Date.now()

    try {
      const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      const duration = Date.now() - startTime

      recordRequest(endpoint, method, response.status, duration, retryCount)

      // Success responses
      if (response.status === 204) {
        clearRetryState()
        return null
      }

      if (response.ok) {
        clearRetryState()
        const text = await response.text()
        if (!text) return null
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      }

      // Error responses
      return await handleErrorResponse<T>(response, endpoint, options, retryCount)

    } catch (err) {
      return await handleNetworkError<T>(err, endpoint, options, retryCount)
    }
  }

  // ------------------------------------------------------------
  // API Request Helpers
  // ------------------------------------------------------------
  async function enforceRateLimit() {
    const timeSinceLastRequest = Date.now() - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    }
    lastRequestTime = Date.now()
  }

  async function handleErrorResponse<T>(
    response: Response,
    endpoint: string,
    options: RequestInit,
    retryCount: number
  ): Promise<T | null> {
    const errorBody = await response.clone().json().catch(() => ({}))
    logger.warn('API error', { endpoint, status: response.status, body: errorBody })

    // Rate limiting (429)
    if (response.status === 429) {
      return handleRateLimit<T>(response, endpoint, options, retryCount)
    }

    // Server errors (5xx)
    if (response.status >= 500) {
      return handleServerError<T>(response.status, endpoint, options, retryCount)
    }

    // Auth errors (401)
    if (response.status === 401) {
      return handleAuthError<T>(endpoint, options, retryCount)
    }

    // No active device (404)
    if (response.status === 404 && errorBody.error?.reason === 'NO_ACTIVE_DEVICE') {
      setRetryError('Open Spotify on your phone to connect')
      return null
    }

    // Other errors
    const message = errorBody.error?.message || `API error: ${response.status}`
    throw new Error(message)
  }

  async function handleRateLimit<T>(
    response: Response,
    endpoint: string,
    options: RequestInit,
    retryCount: number
  ): Promise<T | null> {
    if (retryCount >= MAX_RETRIES) {
      setRetryError('Rate limited by Spotify. Please wait and try again.')
      return null
    }

    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10)
    const delay = retryAfter * 1000

    logger.warn('Rate limited, retrying', { retryCount: retryCount + 1, delay })
    await sleep(delay)

    return apiRequest<T>(endpoint, options, retryCount + 1)
  }

  async function handleServerError<T>(
    status: number,
    endpoint: string,
    options: RequestInit,
    retryCount: number
  ): Promise<T | null> {
    if (retryCount >= MAX_RETRIES) {
      setRetryError('Spotify is having issues. Please try again.')
      return null
    }

    logger.warn('Server error, retrying', { status, retryCount: retryCount + 1 })
    await sleep(1000)

    return apiRequest<T>(endpoint, options, retryCount + 1)
  }

  async function handleAuthError<T>(
    endpoint: string,
    options: RequestInit,
    retryCount: number
  ): Promise<T | null> {
    // Only retry once - if already retried, don't loop
    if (retryCount > 0) {
      log.warn('401 after refresh - token truly invalid')
      setRetryError('Session expired - please log in again')
      return null
    }

    // Only refresh if token is actually expired or not authenticated
    // Avoids unnecessary refresh spam from transient Spotify 401s
    if (!authStore.isAuthenticated) {
      log.warn('401 - not authenticated, cannot retry')
      setRetryError('Session expired - please log in again')
      return null
    }

    log.warn('401 - refreshing token...')
    const refreshed = await authStore.refreshAccessToken()
    if (refreshed) {
      log.info('Token refreshed, retrying request')
      return apiRequest<T>(endpoint, options, retryCount + 1)
    }

    log.warn('Token refresh failed')
    setRetryError('Session expired - please log in again')
    return null
  }

  async function handleNetworkError<T>(
    err: unknown,
    endpoint: string,
    options: RequestInit,
    retryCount: number
  ): Promise<T | null> {
    if (retryCount < MAX_RETRIES) {
      logger.warn('Network error, retrying', { error: err, retryCount: retryCount + 1 })
      await sleep(1000)
      return apiRequest<T>(endpoint, options, retryCount + 1)
    }

    logger.error('Max retries reached', { endpoint, error: err })
    setRetryError('Connection failed. Check your internet and try again.')
    return null
  }

  // ------------------------------------------------------------
  // Utility Functions
  // ------------------------------------------------------------
  function setRetryError(message: string) {
    error.value = message
    retryError.value = message
    needsRetry.value = true
  }

  function clearRetryState() {
    needsRetry.value = false
    retryError.value = null
    error.value = null
  }

  function generateRequestId(): string {
    return Math.random().toString(36).substring(2, 8)
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ------------------------------------------------------------
  // Playback Actions
  // ------------------------------------------------------------

  // Debounced playback fetch - resets timer on each call
  let debouncedFetchTimeout: ReturnType<typeof setTimeout> | null = null

  async function fetchPlaybackDebounced(delayMs = 500) {
    if (debouncedFetchTimeout) clearTimeout(debouncedFetchTimeout)
    debouncedFetchTimeout = setTimeout(async () => {
      await fetchCurrentPlayback()
      debouncedFetchTimeout = null
    }, delayMs)
  }

  // Staleness guard - skip if last fetch was < 2s ago
  let lastPlaybackFetchTime = 0
  const PLAYBACK_STALE_MS = 2000

  async function fetchCurrentPlayback() {
    const now = Date.now()
    if (now - lastPlaybackFetchTime < PLAYBACK_STALE_MS) {
      return currentPlayback.value
    }
    lastPlaybackFetchTime = now
    // Include additional_types=episode to get full episode data for podcasts
    const data = await apiRequest<SpotifyPlayback>('/me/player?additional_types=episode')
    if (data) {
      const itemName = data.item?.name || 'None'
      const playState = data.is_playing ? 'playing' : 'paused'
      log.info(`Poll: ${itemName.slice(0, 20)}.. (${playState})`)
      currentPlayback.value = data
    } else {
      log.warn('Poll: No playback')
    }
    return data
  }

  async function play(options?: { context_uri?: string; uris?: string[]; offset?: { position: number } }) {
    log.info(`Play${options ? ` (${options.context_uri || options.uris?.[0] || 'resume'})` : ''}`)
    if (currentPlayback.value) {
      currentPlayback.value = { ...currentPlayback.value, is_playing: true }
    }
    await apiRequest('/me/player/play', {
      method: 'PUT',
      body: options ? JSON.stringify(options) : undefined,
    })
  }

  async function pause() {
    log.info('Pause')
    if (currentPlayback.value) {
      currentPlayback.value = { ...currentPlayback.value, is_playing: false }
    }
    await apiRequest('/me/player/pause', { method: 'PUT' })
  }

  async function skipToNext() {
    log.info('Skip Next')
    // Check if currently playing a podcast episode
    const pb = currentPlayback.value
    const episodeMode = pb?.currently_playing_type === 'episode'

    if (episodeMode && currentEpisodeContext.value) {
      // For podcasts, fetch episode list and play next episode
      const ctxShowId = currentEpisodeContext.value.showId
      const currentEpisodeId = currentEpisodeContext.value.episodeId

      try {
        const episodesData = await getShowEpisodes(ctxShowId, 50)
        if (episodesData?.items) {
          const currentIndex = episodesData.items.findIndex((ep: any) => ep.id === currentEpisodeId)
          if (currentIndex !== -1 && currentIndex < episodesData.items.length - 1) {
            // Next episode is one down in the list (newer episodes first, so next = index + 1)
            const nextEpisode = episodesData.items[currentIndex + 1]
            logger.info('Playing next podcast episode', {
              showId: ctxShowId,
              currentIndex,
              nextEpisode: nextEpisode.name
            })

            // Update episode context before playing
            setEpisodeContext({
              showId: ctxShowId,
              showName: currentEpisodeContext.value.showName,
              showImages: currentEpisodeContext.value.showImages,
              episodeId: nextEpisode.id,
              episodeName: nextEpisode.name,
              episodeDuration: nextEpisode.duration_ms,
              episodeImages: nextEpisode.images || currentEpisodeContext.value.showImages
            })

            await play({ uris: [`spotify:episode:${nextEpisode.id}`] })
            return
          } else {
            logger.info('No next episode available')
          }
        }
      } catch (err) {
        logger.error('Failed to get next podcast episode', { error: err })
      }
    }

    // Fall back to standard API for tracks
    await apiRequest('/me/player/next', { method: 'POST' })
  }

  async function skipToPrevious() {
    log.info('Skip Previous')
    // If more than 3 seconds into track/episode, restart current
    const progressMs = currentPlayback.value?.progress_ms || 0
    if (progressMs > 3000) {
      log.info('Progress > 3s, seeking to start')
      await seek(0)
      return
    }

    // Check if currently playing a podcast episode
    const pb = currentPlayback.value
    const episodeMode = pb?.currently_playing_type === 'episode'

    if (episodeMode && currentEpisodeContext.value) {
      // For podcasts, fetch episode list and play previous episode
      const ctxShowId = currentEpisodeContext.value.showId
      const currentEpisodeId = currentEpisodeContext.value.episodeId

      try {
        const episodesData = await getShowEpisodes(ctxShowId, 50)
        if (episodesData?.items) {
          const currentIndex = episodesData.items.findIndex((ep: any) => ep.id === currentEpisodeId)
          if (currentIndex > 0) {
            // Previous episode is one up in the list (newer episodes first, so previous = index - 1)
            const prevEpisode = episodesData.items[currentIndex - 1]
            logger.info('Playing previous podcast episode', {
              showId: ctxShowId,
              currentIndex,
              prevEpisode: prevEpisode.name
            })

            // Update episode context before playing
            setEpisodeContext({
              showId: ctxShowId,
              showName: currentEpisodeContext.value.showName,
              showImages: currentEpisodeContext.value.showImages,
              episodeId: prevEpisode.id,
              episodeName: prevEpisode.name,
              episodeDuration: prevEpisode.duration_ms,
              episodeImages: prevEpisode.images || currentEpisodeContext.value.showImages
            })

            await play({ uris: [`spotify:episode:${prevEpisode.id}`] })
            return
          } else {
            logger.info('No previous episode available, seeking to start')
            await seek(0)
            return
          }
        }
      } catch (err) {
        logger.error('Failed to get previous podcast episode', { error: err })
      }
    }

    // Fall back to standard API for tracks
    try {
      await apiRequest('/me/player/previous', { method: 'POST' })
    } catch {
      // If previous fails (403 restriction), seek to start instead
      logger.info('Previous failed, seeking to start of track')
      await seek(0)
    }
  }

  async function seek(positionMs: number) {
    await apiRequest(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' })
  }

  async function setVolume(volumePercent: number) {
    await apiRequest(`/me/player/volume?volume_percent=${volumePercent}`, { method: 'PUT' })
  }

  async function setShuffle(state: boolean) {
    await apiRequest(`/me/player/shuffle?state=${state}`, { method: 'PUT' })
  }

  async function setRepeat(state: 'off' | 'context' | 'track') {
    await apiRequest(`/me/player/repeat?state=${state}`, { method: 'PUT' })
  }

  // ------------------------------------------------------------
  // Library Actions
  // ------------------------------------------------------------

  // Cursor for pagination of recently played
  let recentlyPlayedCursor: string | null = null
  const recentlyPlayedHasMore = ref(true)
  const recentlyPlayedLoadingMore = ref(false)

  async function fetchRecentlyPlayed(limit = 20) {
    isLoading.value = true
    try {
      const data = await apiRequest<{
        items: Array<{
          track: Track
          played_at: string
          context?: {
            type: 'album' | 'playlist' | 'artist'
            uri: string
            href: string
          } | null
        }>
        cursors?: { before?: string; after?: string }
      }>(`/me/player/recently-played?limit=${limit}`)

      if (data?.items) {
        recentlyPlayed.value = data.items.map(item => item.track)
        recentlyPlayedCursor = data.cursors?.before || null
        recentlyPlayedHasMore.value = !!recentlyPlayedCursor
        logger.info('Recently played tracks', { count: recentlyPlayed.value.length, hasMore: recentlyPlayedHasMore.value })
      }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchMoreRecentlyPlayed(limit = 20) {
    if (!recentlyPlayedCursor || recentlyPlayedLoadingMore.value || !recentlyPlayedHasMore.value) return
    recentlyPlayedLoadingMore.value = true
    try {
      const data = await apiRequest<{
        items: Array<{
          track: Track
          played_at: string
        }>
        cursors?: { before?: string; after?: string }
      }>(`/me/player/recently-played?limit=${limit}&before=${recentlyPlayedCursor}`)

      if (data?.items && data.items.length > 0) {
        recentlyPlayed.value = [...recentlyPlayed.value, ...data.items.map(item => item.track)]
        recentlyPlayedCursor = data.cursors?.before || null
        recentlyPlayedHasMore.value = !!recentlyPlayedCursor
        logger.info('Loaded more recently played', { total: recentlyPlayed.value.length, hasMore: recentlyPlayedHasMore.value })
      } else {
        recentlyPlayedHasMore.value = false
      }
    } finally {
      recentlyPlayedLoadingMore.value = false
    }
  }

  async function fetchTopArtists(limit = 20) {
    isLoading.value = true
    try {
      const data = await apiRequest<{ items: Artist[] }>(
        `/me/top/artists?limit=${limit}&time_range=short_term`
      )
      if (data?.items) {
        topArtists.value = data.items
      }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUserPlaylists(limit = 20) {
    isLoading.value = true
    try {
      const data = await apiRequest<{ items: Playlist[] }>(`/me/playlists?limit=${limit}`)
      if (data?.items) {
        userPlaylists.value = data.items
      }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUserShows(limit = 20) {
    isLoading.value = true
    try {
      const data = await apiRequest<{ items: Array<{ show: any }> }>(`/me/shows?limit=${limit}`)
      if (data?.items) {
        userShows.value = data.items.map(item => item.show)
      }
    } finally {
      isLoading.value = false
    }
  }

  let radioMixesFetched = false

  async function fetchRadioMixes() {
    // Only fetch once — prevent duplicate calls from multiple views
    if (radioMixesFetched && radioMixes.value.length > 0) return

    isLoading.value = true
    try {
      // Score artists from recents + liked songs to generate radios
      const artistScores = new Map<string, { name: string; id: string; score: number }>()

      function scoreArtist(artist: { id: string; name: string }) {
        const existing = artistScores.get(artist.id)
        if (existing) {
          existing.score += 1
        } else {
          artistScores.set(artist.id, { id: artist.id, name: artist.name, score: 1 })
        }
      }

      // Always fetch fresh data for scoring to ensure we have enough
      const [recentData, likedData] = await Promise.all([
        apiRequest<{ items: Array<{ track: Track }> }>('/me/player/recently-played?limit=50'),
        apiRequest<{ items: Array<{ track: Track }> }>('/me/tracks?limit=50'),
      ])

      if (recentData?.items) {
        for (const item of recentData.items) {
          for (const artist of item.track.artists || []) {
            scoreArtist(artist)
          }
        }
      }

      if (likedData?.items) {
        for (const item of likedData.items) {
          for (const artist of item.track.artists || []) {
            scoreArtist(artist)
          }
        }
      }

      // Top 20 artists by combined recents + likes score
      const ranked = Array.from(artistScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)

      logger.info('Radio artist scores', {
        top: ranked.map(a => ({ name: a.name, score: a.score }))
      })

      // Fetch real artist images from Spotify (individual calls)
      const artistImageMap = new Map<string, string>()
      const artistResults = await Promise.all(
        ranked.map(a => apiRequest<Artist>(`/artists/${a.id}`))
      )
      for (const a of artistResults) {
        if (a?.images?.[0]?.url) artistImageMap.set(a.id, a.images[0].url)
      }

      // Build radio entries — type 'artist' so views know to use artist context URI
      const mixes: Playlist[] = ranked.map(artist => ({
        id: artist.id,
        name: `${artist.name} Radio`,
        images: [{ url: artistImageMap.get(artist.id) || '', width: 300, height: 300 }],
        tracks: { total: 0 },
        type: 'artist',
        owner: { id: 'spotify', display_name: 'Spotify' }
      }))

      // Append Spotify-owned mixes (Daily Mix, Discover Weekly, etc.) — min 5 tracks
      const seenIds = new Set(mixes.map(m => m.id))
      const playlistData = await apiRequest<{ items: Playlist[] }>('/me/playlists?limit=50')
      if (playlistData?.items) {
        for (const playlist of playlistData.items) {
          if (playlist.owner?.id === 'spotify' && !seenIds.has(playlist.id) && ((playlist as any).items?.total || playlist.tracks?.total || 0) >= 5) {
            seenIds.add(playlist.id)
            mixes.push(playlist)
          }
        }
      }

      radioMixes.value = mixes
      radioMixesFetched = true
      logger.info('Fetched radio mixes', { count: mixes.length, names: mixes.map(m => m.name) })
    } finally {
      isLoading.value = false
    }
  }

  async function fetchQueue() {
    const data = await apiRequest<{ currently_playing: any; queue: Track[] }>('/me/player/queue')
    if (data) {
      queue.value = data.queue
      nextTrack.value = data.queue[0] || null
    }
  }

  async function addToQueue(uri: string) {
    await apiRequest('/me/player/queue?uri=' + encodeURIComponent(uri), { method: 'POST' })
  }

  async function getShow(showId: string) {
    return await apiRequest<any>(`/shows/${showId}`)
  }

  async function getShowEpisodes(showId: string, limit = 20) {
    return await apiRequest<{ items: any[] }>(`/shows/${showId}/episodes?limit=${limit}`)
  }

  // ------------------------------------------------------------
  // Track Actions
  // ------------------------------------------------------------

  async function fetchSavedTracks(limit = 50) {
    isLoading.value = true
    try {
      const data = await apiRequest<{
        items: Array<{ track: Track; added_at: string }>
        total: number
      }>(`/me/tracks?limit=${limit}`)

      if (data?.items) {
        savedTracks.value = data.items.map(item => item.track)
        savedTracksTotal.value = data.total
        logger.info('Fetched saved tracks', { count: savedTracks.value.length, total: data.total })
      }
    } finally {
      isLoading.value = false
    }
  }

  async function checkIfTrackSaved(trackId: string): Promise<boolean> {
    const data = await apiRequest<boolean[]>(`/me/library/contains?ids=${trackId}`)
    return data?.[0] ?? false
  }

  async function saveTrack(trackId: string) {
    await apiRequest(`/me/library?ids=${trackId}`, { method: 'PUT' })
  }

  async function removeTrack(trackId: string) {
    await apiRequest(`/me/library?ids=${trackId}`, { method: 'DELETE' })
  }

  // ------------------------------------------------------------
  // Search & Browse
  // ------------------------------------------------------------

  async function search(query: string, types: string[] = ['track', 'album', 'artist']) {
    const typeString = types.join(',')
    return await apiRequest<{
      tracks?: { items: Track[] }
      albums?: { items: Album[] }
      artists?: { items: Artist[] }
    }>(`/search?q=${encodeURIComponent(query)}&type=${typeString}&limit=10`)
  }

  async function getAlbum(albumId: string) {
    return await apiRequest<Album>(`/albums/${albumId}`)
  }

  async function getArtist(artistId: string) {
    return await apiRequest<Artist>(`/artists/${artistId}`)
  }

  async function getArtistTopTracks(artistId: string) {
    // Artist top-tracks endpoint removed Feb 2026
    // Build from user's liked songs + recents filtered by artist
    const [likedData, recentData] = await Promise.all([
      apiRequest<{ items: Array<{ track: Track }> }>('/me/tracks?limit=50'),
      apiRequest<{ items: Array<{ track: Track }> }>('/me/player/recently-played?limit=50'),
    ])

    const seen = new Set<string>()
    const tracks: Track[] = []

    for (const source of [likedData?.items, recentData?.items]) {
      for (const item of source || []) {
        if (item.track.artists?.some(a => a.id === artistId) && !seen.has(item.track.id)) {
          seen.add(item.track.id)
          tracks.push(item.track)
        }
      }
    }

    return { tracks }
  }

  async function getRelatedArtists(artistId: string) {
    const data = await apiRequest<{ artists: Artist[] }>(`/artists/${artistId}/related-artists`)
    return data?.artists || []
  }

  async function getPlaylist(playlistId: string) {
    return await apiRequest<Playlist>(`/playlists/${playlistId}`)
  }

  // ------------------------------------------------------------
  // Top Tracks
  // ------------------------------------------------------------

  const topTracks = ref<Track[]>([])

  async function fetchTopTracks(limit = 50, timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term') {
    isLoading.value = true
    try {
      const data = await apiRequest<{
        items: Track[]
        total: number
      }>(`/me/top/tracks?limit=${limit}&time_range=${timeRange}`)

      if (data?.items) {
        topTracks.value = data.items
        logger.info('Fetched top tracks', {
          count: data.items.length,
          timeRange
        })
      }
    } finally {
      isLoading.value = false
    }
  }

  // ------------------------------------------------------------
  // User Profile
  // ------------------------------------------------------------

  async function getCurrentUser() {
    return await apiRequest<{
      id: string
      display_name: string
      images: Array<{ url: string }>
    }>('/me')
  }

  // Helper to set episode context when playing from show view
  function setEpisodeContext(context: {
    showId: string
    showName: string
    showImages: Array<{ url: string }>
    episodeId: string
    episodeName: string
    episodeDuration: number
    episodeImages: Array<{ url: string }>
  } | null) {
    currentEpisodeContext.value = context
    logger.info('Set episode context', {
      showId: context?.showId,
      showName: context?.showName,
      episodeName: context?.episodeName,
      duration: context?.episodeDuration
    })
  }

  // Clear episode context (call when playing a track)
  function clearEpisodeContext() {
    currentEpisodeContext.value = null
  }

  return {
    // State
    currentPlayback,
    recentlyPlayed,
    topArtists,
    userPlaylists,
    savedTracks,
    savedTracksTotal,
    userShows,
    radioMixes,
    isRadioMode,
    radioArtistHistory,
    radioHistoryPush,
    queue,
    nextTrack,
    currentEpisodeContext,
    isLoading,
    error,
    needsRetry,
    retryError,

    // Derived Playback Getters
    isPlaying,
    shuffleState,
    repeatState,
    isEpisode,
    currentTrackUri,
    trackName,
    artistName,
    albumArt,
    duration,
    albumId,
    showId,
    parsedContext,
    contextName,

    // Playback
    fetchCurrentPlayback,
    fetchPlaybackDebounced,
    play,
    pause,
    skipToNext,
    skipToPrevious,
    seek,
    setVolume,
    setShuffle,
    setRepeat,

    // Library
    fetchRecentlyPlayed,
    fetchMoreRecentlyPlayed,
    recentlyPlayedHasMore,
    recentlyPlayedLoadingMore,
    fetchTopArtists,
    fetchUserPlaylists,
    fetchUserShows,
    fetchRadioMixes,

    // Queue
    fetchQueue,
    addToQueue,

    // Tracks
    fetchSavedTracks,
    checkIfTrackSaved,
    saveTrack,
    removeTrack,

    // Search & Browse
    search,
    getAlbum,
    getArtist,
    getArtistTopTracks,
    getRelatedArtists,
    getPlaylist,
    getShow,
    getShowEpisodes,

    // Top Tracks
    topTracks,
    fetchTopTracks,

    // User
    getCurrentUser,

    // Context helpers
    setEpisodeContext,
    clearEpisodeContext,

    // Retry helpers
    clearRetryState,

    // API Stats
    apiStats,
    getApiStats,
    resetApiStats,
  }
})
