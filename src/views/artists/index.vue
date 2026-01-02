<!-- ============================================================
     Artists View - Top artists
     ============================================================ -->
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyStore } from '@/stores/spotify'
import { useAuthStore } from '@/stores/auth'
import HorizontalScroll from '@/components/content/HorizontalScroll.vue'
import MediaCard from '@/components/content/MediaCard.vue'

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
function formatFollowerCount(count: number): string {
  if (count >= 1000000) {
    const millions = count / 1000000
    return millions % 1 === 0
      ? `${Math.floor(millions)}M Followers`
      : `${millions.toFixed(1)}M Followers`
  }
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' Followers'
}

function handleArtistClick(artistId: string) {
  router.push(`/artist/${artistId}`)
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  if (authStore.isAuthenticated) {
    await spotifyStore.fetchTopArtists()
  }
})
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
        :subtitle="formatFollowerCount(artist.followers?.total || 0)"
        :image-url="artist.images?.[1]?.url || artist.images?.[0]?.url || ''"
        :is-rounded="true"
        @click="handleArtistClick(artist.id)"
      />
    </HorizontalScroll>
  </div>
</template>
