<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '@/composables/useToast'

const { currentToast } = useToast()

const bgColor = computed(() => {
  if (!currentToast.value) return ''
  switch (currentToast.value.type) {
    case 'success': return 'bg-green-600/90'
    case 'error': return 'bg-red-600/90'
    case 'info': return 'bg-blue-600/90'
    default: return 'bg-blue-600/90'
  }
})
</script>

<template>
  <div
    v-if="currentToast"
    class="absolute top-0 left-0 right-0 z-50 px-6 py-3 text-center"
    :class="bgColor"
  >
    <p class="text-white text-[24px] font-[560]">{{ currentToast.message }}</p>
  </div>
</template>
