<!-- ============================================================
     Radio View - Spotify-generated mixes and artist radios
     ============================================================ -->
<script setup lang="ts">
import { computed, watch } from 'vue'
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
const radios = computed(() => spotifyStore.radioMixes)
const isLoading = computed(() => spotifyStore.isLoading && radios.value.length === 0)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
async function handleRadioClick(radio: { id: string; type: string }) {
  // Enable shuffle so radio starts at a random track
  await spotifyStore.setShuffle(true)
  const uri = radio.type === 'artist'
    ? `spotify:artist:${radio.id}`
    : `spotify:playlist:${radio.id}`
  spotifyStore.play({ context_uri: uri })
  router.push('/now-playing')
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await spotifyStore.fetchRadioMixes()
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full">
    <div v-if="isLoading" class="flex items-center justify-center h-full">
      <div class="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <div v-else-if="radios.length === 0" class="flex items-center justify-center h-full">
      <p class="text-white/60 text-2xl">No radios found</p>
    </div>

    <HorizontalScroll v-else>
      <MediaCard
        v-for="radio in radios"
        :key="radio.id"
        :id="radio.id"
        :name="radio.name"
        :subtitle="radio.owner?.display_name || 'Spotify'"
        :image-url="radio.images?.[0]?.url || ''"
        @click="handleRadioClick(radio)"
      />
    </HorizontalScroll>
  </div>
</template>
