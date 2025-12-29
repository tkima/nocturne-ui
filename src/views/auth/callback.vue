<!-- ============================================================
     Auth Callback - Handles Spotify OAuth callback
     ============================================================ -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'

const router = useRouter()
const authStore = useAuthStore()

const status = ref<'processing' | 'success' | 'error'>('processing')
const errorMessage = ref('')

onMounted(async () => {
  logger.info('Callback mounted', {
    url: window.location.href,
    search: window.location.search
  })

  const success = await authStore.handleCallback()
  logger.info('Callback result', { success, error: authStore.error })

  if (success) {
    status.value = 'success'
    logger.info('Auth success, redirecting to /recents')
    setTimeout(() => {
      router.push('/recents')
    }, 1000)
  } else {
    status.value = 'error'
    errorMessage.value = authStore.error || 'Authentication failed'
    logger.error('Auth failed', { error: errorMessage.value })
  }
})
</script>

<template>
  <div class="h-screen flex items-center justify-center">
    <div class="text-center">
      <!-- Processing -->
      <div v-if="status === 'processing'" class="space-y-4">
        <div class="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
        <p class="text-white text-2xl font-[560]">Authenticating...</p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'" class="space-y-4">
        <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p class="text-white text-2xl font-[560]">Success!</p>
        <p class="text-white/60 text-lg">Redirecting...</p>
      </div>

      <!-- Error -->
      <div v-else class="space-y-4">
        <div class="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p class="text-white text-2xl font-[560]">Authentication Failed</p>
        <p class="text-white/60 text-lg">{{ errorMessage }}</p>
        <button
          class="mt-4 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-[560] transition-colors"
          @click="router.push('/recents')"
        >
          Go Back
        </button>
      </div>
    </div>
  </div>
</template>
