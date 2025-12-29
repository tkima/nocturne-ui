<!-- ============================================================
     Podcasts View - User's saved podcast shows
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
const shows = computed(() => spotifyStore.userShows)
const isLoading = computed(() => spotifyStore.isLoading)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleShowClick(showId: string) {
  logger.info('Open show', { showId })
  router.push(`/show/${showId}`)
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(async () => {
  authStore.initFromStorage()
  if (authStore.isAuthenticated) {
    await spotifyStore.fetchUserShows()
  }
})
</script>

<template>
  <div class="h-full">
    <!-- Loading state -->
    <div v-if="isLoading && shows.length === 0" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <!-- No shows -->
    <div
      v-else-if="shows.length === 0"
      class="flex items-center justify-center h-full"
    >
      <div class="text-center">
        <p class="text-white/60 text-2xl">No podcasts found</p>
        <p class="text-white/40 text-lg mt-2">Save some shows in Spotify to see them here</p>
      </div>
    </div>

    <!-- Show list -->
    <HorizontalScroll v-else>
      <MediaCard
        v-for="show in shows"
        :key="show.id"
        :id="show.id"
        :name="show.name"
        :subtitle="show.publisher || ''"
        :image-url="show.images?.[1]?.url || show.images?.[0]?.url || ''"
        @click="handleShowClick(show.id)"
      />
    </HorizontalScroll>
  </div>
</template>
