<!-- ============================================================
     ProgressBar.vue - Playback progress bar component
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { formatTime } from '@/utils/format'

// ------------------------------------------------------------
// Props
// ------------------------------------------------------------
interface Props {
  progress: number
  isPlaying: boolean
  durationMs: number
}

const props = withDefaults(defineProps<Props>(), {
  progress: 0,
  isPlaying: false,
  durationMs: 0
})

// ------------------------------------------------------------
// Emits
// ------------------------------------------------------------
const emit = defineEmits<{
  seek: [position: number]
  scrubbingChange: [isScrubbing: boolean]
}>()

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const isScrubbing = ref(false)
const scrubbingProgress = ref<number | null>(null)

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const finalProgress = computed(() => scrubbingProgress.value ?? props.progress)

const shouldShowTimestampOutside = computed(() => finalProgress.value < 8)

// ------------------------------------------------------------
// Methods
// ------------------------------------------------------------
function handleClick() {
  isScrubbing.value = true
  emit('scrubbingChange', true)
}

function handleWheel(event: WheelEvent) {
  if (!isScrubbing.value) return

  event.preventDefault()
  event.stopPropagation()

  const delta = event.deltaX
  const step = 1.5

  const prev = scrubbingProgress.value ?? props.progress
  const nextValue = prev + (delta > 0 ? step : -step)
  scrubbingProgress.value = Math.max(0, Math.min(100, nextValue))
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && isScrubbing.value) {
    event.preventDefault()
    event.stopPropagation()

    isScrubbing.value = false
    emit('scrubbingChange', false)

    if (scrubbingProgress.value !== null) {
      const seekMs = Math.floor((scrubbingProgress.value / 100) * props.durationMs)
      emit('seek', seekMs)
    }

    scrubbingProgress.value = null
  } else if (event.key === 'Escape' && isScrubbing.value) {
    event.preventDefault()
    event.stopPropagation()

    isScrubbing.value = false
    emit('scrubbingChange', false)
    scrubbingProgress.value = null
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(() => {
  window.addEventListener('wheel', handleWheel, { passive: false })
  window.addEventListener('keydown', handleKeyDown, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleWheel)
  window.removeEventListener('keydown', handleKeyDown, { capture: true })
})
</script>

<template>
  <div
    class="relative transition-all duration-200 ease-in-out"
    :class="{ 'translate-y-8': isScrubbing }"
  >
    <div
      class="relative w-full bg-white/20 rounded-full overflow-hidden transition-all duration-300"
      :class="isScrubbing ? 'h-8' : 'h-2 mt-4'"
      @click="handleClick"
    >
      <div
        class="absolute inset-0 bg-white flex items-center justify-end transition-transform duration-0 ease-linear"
        :style="{ transform: `translateX(${finalProgress - 100}%)` }"
      />
      <div
        v-if="isScrubbing"
        class="absolute inset-0 flex items-center"
        :style="{ transform: `translateX(${finalProgress}%)` }"
      >
        <span
          class="text-lg font-[580] absolute"
          :class="shouldShowTimestampOutside
            ? 'left-2 text-black/40'
            : 'right-full pr-2 text-black/40'"
        >
          {{ formatTime(Math.floor((finalProgress / 100) * durationMs)) }}
        </span>
      </div>
    </div>
  </div>
</template>
