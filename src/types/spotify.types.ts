// ========================================
// Spotify API Types
// ========================================

export interface SpotifyImage {
  url: string
  width: number
  height: number
}

export interface Artist {
  id: string
  name: string
  images: SpotifyImage[]
  followers?: { total: number }
  genres?: string[]
}

export interface Album {
  id: string
  name: string
  images: SpotifyImage[]
  artists: Artist[]
  release_date?: string
  type: 'album' | 'show' | 'local-track'
  publisher?: string
  tracks?: {
    items: Track[]
    total: number
  }
}

export interface Track {
  id: string
  name: string
  uri: string
  duration_ms: number
  album: Album
  artists: Artist[]
}

export interface Playlist {
  id: string
  name: string
  images: SpotifyImage[]
  items?: { total: number }
  tracks?: { total: number } // legacy compat
  type: 'playlist' | 'artist'
  owner?: {
    id: string
    display_name: string
  }
}

export interface Show {
  id: string
  name: string
  publisher: string
  images: SpotifyImage[]
}

export interface PlaybackState {
  is_playing: boolean
  progress_ms: number
  item: Track | null
  device: SpotifyDevice
  shuffle_state: boolean
  repeat_state: 'off' | 'track' | 'context'
  context?: {
    uri: string
  } | null
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  is_active: boolean
  volume_percent: number
}

export interface RadioMix {
  id: string
  name: string
  images: SpotifyImage[]
  tracks: unknown[]
  type?: string
  uri?: string
}
