import { defineStore } from 'pinia'
import { ref } from 'vue'
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
  const recentlyPlayed = ref<Album[]>([])
  const topArtists = ref<Artist[]>([])
  const userPlaylists = ref<Playlist[]>([])
  const savedTracks = ref<Track[]>([])
  const savedTracksTotal = ref(0)
  const userShows = ref<any[]>([])
  const radioMixes = ref<Playlist[]>([])
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
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  // Retry state - when true, user needs to manually retry
  const needsRetry = ref(false)
  const retryError = ref<string | null>(null)

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
    const token = await authStore.ensureValidToken()
    if (!token) {
      error.value = 'Not authenticated'
      retryError.value = 'Not authenticated - please log in again'
      needsRetry.value = true
      return null
    }

    // Rate limiting: wait if we're making requests too fast
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }
    lastRequestTime = Date.now()

    const method = options.method || 'GET'
    const requestId = Math.random().toString(36).substring(2, 8)
    const requestStartTime = Date.now()
    logger.info('API request', { requestId, method, endpoint })

    try {
      const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      const duration = Date.now() - requestStartTime

      // Log ALL responses for debugging
      logger.info('API response', {
        requestId,
        method,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        duration
      })

      // Record stats for this request
      recordRequest(endpoint, method, response.status, duration, retryCount)

      // Success - clear retry state
      if (response.status === 204) {
        needsRetry.value = false
        retryError.value = null
        return null
      }

      // Log response body for non-2xx responses
      if (!response.ok) {
        const responseBody = await response.clone().json().catch(() => ({}))
        logger.warn('API response error body', {
          requestId,
          endpoint,
          body: responseBody
        })
      }

      // Handle rate limiting (429) - use Retry-After header or our backoff
      if (response.status === 429) {
        if (retryCount >= MAX_RETRIES) {
          logger.error('Max retries reached for rate limit', { endpoint, retryCount })
          error.value = 'Too many requests - please try again later'
          retryError.value = 'Rate limited by Spotify. Please wait and try again.'
          needsRetry.value = true
          return null
        }

        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10)
        const delay = retryAfter * 1000
        logger.warn('Rate limited, retrying', { retryCount: retryCount + 1, delay })
        await new Promise(resolve => setTimeout(resolve, delay))
        return apiRequest<T>(endpoint, options, retryCount + 1)
      }

      // Handle server errors (5xx) with retry
      if (response.status >= 500) {
        if (retryCount >= MAX_RETRIES) {
          logger.error('Max retries reached for server error', { endpoint, status: response.status })
          error.value = 'Spotify server error - please try again later'
          retryError.value = 'Spotify is having issues. Please try again.'
          needsRetry.value = true
          return null
        }

        const delay = 1000
        logger.warn('Server error, retrying', { status: response.status, retryCount: retryCount + 1, delay })
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return apiRequest<T>(endpoint, options, retryCount + 1)
      }

      // Handle auth errors - try to refresh token and retry once
      if (response.status === 401) {
        logger.warn('Token expired (401), attempting refresh...')
        const newToken = await authStore.ensureValidToken()
        if (newToken && retryCount < 1) {
          // Token refreshed, retry the request once
          logger.info('Token refreshed, retrying request')
          return apiRequest<T>(endpoint, options, retryCount + 1)
        }
        // Refresh failed or already retried - show error
        error.value = 'Authentication expired'
        retryError.value = 'Session expired - please log in again'
        needsRetry.value = true
        return null
      }

      // Handle 404 - check for special cases
      if (response.status === 404) {
        const errorData = await response.clone().json().catch(() => ({}))
        // Check for "No active device" error
        if (errorData.error?.reason === 'NO_ACTIVE_DEVICE') {
          error.value = 'No active device found'
          retryError.value = 'Open Spotify on your phone to connect'
          needsRetry.value = true
          logger.warn('No active device found')
        }
        return null
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `API error: ${response.status}`)
      }

      // Success - clear retry state
      needsRetry.value = false
      retryError.value = null
      return await response.json()
    } catch (err) {
      // Network errors - retry with backoff
      if (retryCount < MAX_RETRIES) {
        const delay = 1000
        logger.warn('Network error, retrying', { error: err, retryCount: retryCount + 1, delay })
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return apiRequest<T>(endpoint, options, retryCount + 1)
      }

      logger.error('Max retries reached for network error', { endpoint, error: err })
      error.value = err instanceof Error ? err.message : 'API request failed'
      retryError.value = 'Connection failed. Check your internet and try again.'
      needsRetry.value = true
      return null
    }
  }

  // Clear retry state (call after successful manual retry)
  function clearRetryState() {
    needsRetry.value = false
    retryError.value = null
    error.value = null
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

  async function fetchCurrentPlayback() {
    // Include additional_types=episode to get full episode data for podcasts
    const data = await apiRequest<SpotifyPlayback>('/me/player?additional_types=episode')
    if (data) {
      // Log playback state to debug overlay
      const trackName = data.item?.name || 'None'
      const isPlaying = data.is_playing ? 'playing' : 'paused'
      log.info(`Poll: ${trackName.slice(0, 20)}.. (${isPlaying})`)

      logger.info('Playback data', {
        type: data.currently_playing_type,
        itemName: data.item?.name,
        duration: data.item?.duration_ms,
        hasShow: !!data.item?.show,
        showName: data.item?.show?.name,
        showId: data.item?.show?.id,
        hasImages: !!data.item?.images,
        imageUrl: data.item?.images?.[0]?.url,
      })
      currentPlayback.value = data

      // Cache artist info for tracks (reduces "Unknown Artist" occurrences)
      const trackId = data.item?.id
      const artists = data.item?.artists
      if (trackId && artists?.length) {
        const artistName = artists.map(a => a.name).join(', ')
        if (artistName) {
          localStorage.setItem(`artist_cache_${trackId}`, artistName)
        }
      }
    } else {
      log.warn('Poll: No playback')
    }
    return data
  }

  async function play(options?: { context_uri?: string; uris?: string[]; offset?: { position: number } }) {
    log.info(`Play${options ? ` (${options.context_uri || options.uris?.[0] || 'resume'})` : ''}`)
    await apiRequest('/me/player/play', {
      method: 'PUT',
      body: options ? JSON.stringify(options) : undefined,
    })
  }

  async function pause() {
    log.info('Pause')
    await apiRequest('/me/player/pause', { method: 'PUT' })
  }

  async function skipToNext() {
    log.info('Skip Next')
    // Check if currently playing a podcast episode
    const playback = currentPlayback.value
    const isEpisode = playback?.currently_playing_type === 'episode'

    if (isEpisode && currentEpisodeContext.value) {
      // For podcasts, fetch episode list and play next episode
      const showId = currentEpisodeContext.value.showId
      const currentEpisodeId = currentEpisodeContext.value.episodeId

      try {
        const episodesData = await getShowEpisodes(showId, 50)
        if (episodesData?.items) {
          const currentIndex = episodesData.items.findIndex((ep: any) => ep.id === currentEpisodeId)
          if (currentIndex !== -1 && currentIndex < episodesData.items.length - 1) {
            // Next episode is one down in the list (newer episodes first, so next = index + 1)
            const nextEpisode = episodesData.items[currentIndex + 1]
            logger.info('Playing next podcast episode', {
              showId,
              currentIndex,
              nextEpisode: nextEpisode.name
            })

            // Update episode context before playing
            setEpisodeContext({
              showId,
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
    const progress = currentPlayback.value?.progress_ms || 0
    if (progress > 3000) {
      log.info('Progress > 3s, seeking to start')
      await seek(0)
      return
    }

    // Check if currently playing a podcast episode
    const playback = currentPlayback.value
    const isEpisode = playback?.currently_playing_type === 'episode'

    if (isEpisode && currentEpisodeContext.value) {
      // For podcasts, fetch episode list and play previous episode
      const showId = currentEpisodeContext.value.showId
      const currentEpisodeId = currentEpisodeContext.value.episodeId

      try {
        const episodesData = await getShowEpisodes(showId, 50)
        if (episodesData?.items) {
          const currentIndex = episodesData.items.findIndex((ep: any) => ep.id === currentEpisodeId)
          if (currentIndex > 0) {
            // Previous episode is one up in the list (newer episodes first, so previous = index - 1)
            const prevEpisode = episodesData.items[currentIndex - 1]
            logger.info('Playing previous podcast episode', {
              showId,
              currentIndex,
              prevEpisode: prevEpisode.name
            })

            // Update episode context before playing
            setEpisodeContext({
              showId,
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
      }>(`/me/player/recently-played?limit=${limit}`)

      if (data?.items) {
        // Extract unique albums from recently played tracks
        const albumMap = new Map<string, Album>()
        // Also track unique contexts (playlists, radios) by URI
        const contextUris = new Set<string>()

        data.items.forEach(item => {
          // Add album
          if (item.track.album && !albumMap.has(item.track.album.id)) {
            albumMap.set(item.track.album.id, item.track.album)
          }

          // Track context URIs for playlists (includes radios like "Artist Radio")
          // Note: Artist radios show as playlist type in the context
          if (item.context?.type === 'playlist' && item.context.uri) {
            contextUris.add(item.context.uri)
          }
        })

        logger.info('Recently played contexts', {
          albumCount: albumMap.size,
          playlistContexts: Array.from(contextUris)
        })

        recentlyPlayed.value = Array.from(albumMap.values())

        // Fetch playlist details for recently played contexts
        // Filter out Spotify-generated playlists (radios, mixes) - they start with 37i9dQZF1 and return 404
        const playlistIds = Array.from(contextUris)
          .filter(uri => uri.startsWith('spotify:playlist:'))
          .map(uri => uri.replace('spotify:playlist:', ''))
          .filter(id => !id.startsWith('37i9dQZF1')) // Skip Spotify auto-generated playlists
          .slice(0, 10) // Limit to 10 playlists

        if (playlistIds.length > 0) {
          logger.info('Fetching playlist details', { playlistIds })

          // Fetch each playlist's details individually to handle errors gracefully
          const playlistResults: Playlist[] = []
          for (const id of playlistIds) {
            try {
              const playlist = await getPlaylist(id)
              if (playlist) {
                playlistResults.push(playlist)
              }
            } catch (err) {
              // Skip playlists that fail to load (might be deleted or inaccessible)
              logger.warn('Failed to fetch playlist', { id, error: err })
            }
          }

          // Add to userPlaylists if not already there (merge with existing)
          const existingIds = new Set(userPlaylists.value.map(p => p.id))
          const newPlaylists = playlistResults.filter(p => !existingIds.has(p.id))

          // Prepend recently played playlists to the list
          if (newPlaylists.length > 0) {
            userPlaylists.value = [...newPlaylists, ...userPlaylists.value]
          }
        }
      }
    } finally {
      isLoading.value = false
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

  async function fetchRadioMixes() {
    isLoading.value = true
    try {
      const mixes: Playlist[] = []
      const seenIds = new Set<string>()

      // 1. Get radios from recently played contexts (like "Kanye West Radio")
      // We need to extract the artist info from the track to build the radio name
      const recentData = await apiRequest<{
        items: Array<{
          track: Track
          context?: {
            type: string
            uri: string
          } | null
        }>
      }>('/me/player/recently-played?limit=25')

      if (recentData?.items) {
        // Extract radio playlist info from recently played
        // Artist radios have IDs starting with 37i9dQZF1E
        recentData.items.forEach(item => {
          if (item.context?.type === 'playlist' && item.context.uri) {
            const id = item.context.uri.replace('spotify:playlist:', '')
            if (id.startsWith('37i9dQZF1E') && !seenIds.has(id)) {
              seenIds.add(id)
              // Create a radio entry using the track's artist info
              const artistName = item.track.artists?.[0]?.name || 'Artist'
              const artistImage = item.track.album?.images?.[0]?.url || ''
              mixes.push({
                id,
                name: `${artistName} Radio`,
                images: artistImage ? [{ url: artistImage, width: 300, height: 300 }] : [],
                tracks: { total: 0 },
                type: 'playlist',
                owner: { id: 'spotify', display_name: 'Spotify' }
              })
            }
          }
        })

        logger.info('Found artist radios from recently played', {
          count: mixes.length,
          radios: mixes.map(m => ({ id: m.id, name: m.name }))
        })
      }

      // 2. Also get saved Spotify mixes (Daily Mix, Discover Weekly, etc.)
      const playlistData = await apiRequest<{ items: Playlist[] }>('/me/playlists?limit=50')
      if (playlistData?.items) {
        // Log all playlists to see what's available
        logger.info('User playlists for radio check', {
          total: playlistData.items.length,
          spotifyOwned: playlistData.items.filter(p => p.owner?.id === 'spotify').map(p => ({ id: p.id, name: p.name }))
        })

        playlistData.items.forEach(playlist => {
          const id = playlist.id
          const ownerId = playlist.owner?.id
          // Include ALL playlists owned by 'spotify' (Daily Mix, Discover Weekly, Release Radar, etc.)
          if (ownerId === 'spotify' && !seenIds.has(id)) {
            seenIds.add(id)
            mixes.push(playlist)
          }
        })
      }

      radioMixes.value = mixes
      logger.info('Fetched radio mixes', { count: mixes.length, names: mixes.map(m => m.name) })
    } finally {
      isLoading.value = false
    }
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
    const data = await apiRequest<boolean[]>(`/me/tracks/contains?ids=${trackId}`)
    return data?.[0] ?? false
  }

  async function saveTrack(trackId: string) {
    await apiRequest(`/me/tracks?ids=${trackId}`, { method: 'PUT' })
  }

  async function removeTrack(trackId: string) {
    await apiRequest(`/me/tracks?ids=${trackId}`, { method: 'DELETE' })
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
    }>(`/search?q=${encodeURIComponent(query)}&type=${typeString}&limit=20`)
  }

  async function getAlbum(albumId: string) {
    return await apiRequest<Album>(`/albums/${albumId}`)
  }

  async function getArtist(artistId: string) {
    return await apiRequest<Artist>(`/artists/${artistId}`)
  }

  async function getArtistTopTracks(artistId: string, market = 'US') {
    return await apiRequest<{ tracks: Track[] }>(
      `/artists/${artistId}/top-tracks?market=${market}`
    )
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
      email: string
      images: Array<{ url: string }>
      product: string
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
    currentEpisodeContext,
    isLoading,
    error,
    needsRetry,
    retryError,

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
    fetchTopArtists,
    fetchUserPlaylists,
    fetchUserShows,
    fetchRadioMixes,

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
