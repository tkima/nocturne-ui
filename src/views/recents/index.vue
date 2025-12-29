<!-- ============================================================
     Recents View - Recently played albums and playlists
     ============================================================ -->
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { logger } from '@/utils/logger'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const albums = computed(() => spotifyStore.recentlyPlayed)
const playlists = computed(() => spotifyStore.userPlaylists)
const isLoading = computed(() => spotifyStore.isLoading)
const currentTrackUri = computed(() => spotifyStore.currentPlayback?.item?.uri)

// Combine albums and playlists into one list for display
const recentItems = computed(() => {
  const items: Array<{
    id: string
    type: 'album' | 'playlist'
    name: string
    subtitle: string
    imageUrl: string
  }> = []

  // Add albums
  albums.value.forEach(album => {
    items.push({
      id: album.id,
      type: 'album',
      name: album.name,
      subtitle: album.artists?.map(a => a.name).join(', ') || '',
      imageUrl: album.images?.[1]?.url || album.images?.[0]?.url || ''
    })
  })

  // Add playlists (interleave or append - here we append)
  playlists.value.slice(0, 10).forEach(playlist => {
    items.push({
      id: playlist.id,
      type: 'playlist',
      name: playlist.name,
      subtitle: playlist.owner?.display_name || 'Playlist',
      imageUrl: playlist.images?.[0]?.url || ''
    })
  })

  return items
})

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function handleItemClick(item: { id: string; type: 'album' | 'playlist' }) {
  if (item.type === 'album') {
    logger.info('Play album', { albumId: item.id })
    await spotifyStore.play({ context_uri: `spotify:album:${item.id}` })
  } else {
    logger.info('Play playlist', { playlistId: item.id })
    await spotifyStore.play({ context_uri: `spotify:playlist:${item.id}` })
  }
  await spotifyStore.fetchCurrentPlayback()
  router.push('/now-playing')
}

function handleSubtitleClick(item: { id: string; type: 'album' | 'playlist' }) {
  if (item.type === 'album') {
    // TODO: Navigate to artist view
    logger.info('Open artist for album', { albumId: item.id })
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    // Fetch both albums and playlists in parallel
    await Promise.all([
      spotifyStore.fetchRecentlyPlayed(),
      spotifyStore.fetchUserPlaylists(),
      spotifyStore.fetchCurrentPlayback()
    ])
  }
})
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && recentItems.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No items state -->
    <div
      v-else-if="recentItems.length === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No recent items</p>
    </div>

    <!-- Combined album and playlist list -->
    <HorizontalScroll v-else>
      <MediaCard
        v-for="item in recentItems"
        :key="`${item.type}-${item.id}`"
        :id="item.id"
        :name="item.name"
        :subtitle="item.subtitle"
        :image-url="item.imageUrl"
        :is-playing="currentTrackUri?.includes(item.id) || false"
        @click="handleItemClick(item)"
        @subtitle-click="handleSubtitleClick(item)"
      />
    </HorizontalScroll>
  </div>
</template>
