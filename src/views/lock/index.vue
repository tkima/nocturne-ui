<!-- ============================================================
     Lock View - Full black screen (screen off state)
     Turn knob to go to now-playing
     ============================================================ -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  router.push('/now-playing')
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    router.push('/radio')
  }
}

onMounted(() => {
  window.addEventListener('wheel', handleWheel, { passive: false })
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleWheel)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="fixed inset-0 bg-black z-50" />
</template>
