<!-- ============================================================
     Library View - Liked songs + User playlists + Radio mixes
     ============================================================ -->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'
import { formatCount } from '@/utils/format'

// ------------------------------------------------------------
// Router & Stores
// ------------------------------------------------------------
const router = useRouter()
const spotifyStore = useSpotifyStore()
const authStore = useAuthStore()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const savedTracksTotal = computed(() => spotifyStore.savedTracksTotal)
const isLoading = computed(() => spotifyStore.isLoading)

// Combine playlists + radio mixes into one deduplicated list
const libraryItems = computed(() => {
  const seen = new Set<string>()
  const items: Array<{
    id: string
    type: 'playlist' | 'radio' | 'artist-radio'
    name: string
    subtitle: string
    imageUrl: string
  }> = []

  // User playlists first
  for (const playlist of spotifyStore.userPlaylists) {
    if (seen.has(playlist.id)) continue
    seen.add(playlist.id)
    items.push({
      id: playlist.id,
      type: 'playlist',
      name: playlist.name,
      subtitle: formatCount(playlist.tracks?.total || 0, 'Songs'),
      imageUrl: playlist.images?.[0]?.url || ''
    })
  }

  // Radio mixes (only those not already shown as playlists)
  for (const radio of spotifyStore.radioMixes) {
    if (seen.has(radio.id)) continue
    seen.add(radio.id)
    items.push({
      id: radio.id,
      type: radio.type === 'artist' ? 'artist-radio' : 'radio',
      name: radio.name,
      subtitle: radio.owner?.display_name || 'Spotify',
      imageUrl: radio.images?.[0]?.url || ''
    })
  }

  return items
})

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleLikedSongsClick() {
  router.push('/liked-songs')
}

async function handleItemClick(item: { id: string; type: string }) {
  if (item.type === 'artist-radio') {
    await spotifyStore.setShuffle(true)
    spotifyStore.play({ context_uri: `spotify:artist:${item.id}` })
    router.push('/now-playing')
  } else if (item.type === 'radio') {
    await spotifyStore.setShuffle(true)
    spotifyStore.play({ context_uri: `spotify:playlist:${item.id}` })
    router.push('/now-playing')
  } else {
    router.push(`/playlist/${item.id}`)
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await Promise.all([
      spotifyStore.fetchUserPlaylists(),
      spotifyStore.fetchSavedTracks(),
      spotifyStore.fetchRadioMixes()
    ])
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && libraryItems.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No content -->
    <div
      v-else-if="libraryItems.length === 0 && savedTracksTotal === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No library content found</p>
    </div>

    <!-- Library content -->
    <HorizontalScroll v-else>
      <!-- Liked Songs card (first item) -->
      <div
        class="pl-2 mr-10 cursor-pointer"
        style="min-width: var(--album-art-size)"
        @click="handleLikedSongsClick"
      >
        <div class="mt-10 rounded-[12px] bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]" style="width: var(--album-art-size); height: var(--album-art-size)">
          <svg class="w-28 h-28 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <h4 class="mt-2 text-[36px] font-[580] text-white truncate tracking-tight" style="max-width: var(--album-art-size)">
          Liked Songs
        </h4>
        <h4 class="text-[32px] font-[560] text-white/60 truncate tracking-tight" style="max-width: var(--album-art-size)">
          {{ formatCount(savedTracksTotal, 'Songs') }}
        </h4>
      </div>

      <!-- All library items (playlists + radios, deduplicated) -->
      <MediaCard
        v-for="item in libraryItems"
        :key="item.id"
        :id="item.id"
        :name="item.name"
        :subtitle="item.subtitle"
        :image-url="item.imageUrl"
        @click="handleItemClick(item)"
      />
    </HorizontalScroll>
  </div>
</template>
