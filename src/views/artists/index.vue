<!-- ============================================================
     Artists View - Top artists
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
const artists = computed(() => spotifyStore.topArtists)
const isLoading = computed(() => spotifyStore.isLoading)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleArtistClick(artistId: string) {
  router.push(`/artist/${artistId}`)
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await spotifyStore.fetchTopArtists()
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && artists.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No artists -->
    <div
      v-else-if="artists.length === 0"
      class="flex items-center justify-center h-full"
    >
      <p class="text-white/60 text-2xl">No top artists found</p>
    </div>

    <!-- Artist list -->
    <HorizontalScroll v-else>
      <MediaCard
        v-for="artist in artists"
        :key="artist.id"
        :id="artist.id"
        :name="artist.name"
        :subtitle="formatCount(artist.followers?.total || 0, 'Followers')"
        :image-url="artist.images?.[1]?.url || artist.images?.[0]?.url || ''"
        :is-rounded="true"
        @click="handleArtistClick(artist.id)"
      />
    </HorizontalScroll>
  </div>
</template>
