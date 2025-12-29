<!-- ============================================================
     PowerMenuOverlay - Power/Reboot/Brightness controls
     ============================================================ -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import PowerIcon from './icons/PowerIcon.vue'
import RefreshIcon from './icons/RefreshIcon.vue'
import BrightnessMidIcon from './icons/BrightnessMidIcon.vue'
import BrightnessLowIcon from './icons/BrightnessLowIcon.vue'
import BrightnessHighIcon from './icons/BrightnessHighIcon.vue'

const config = useConfigStore()

interface Props {
  show: boolean
}

interface Emits {
  (e: 'shutdown'): void
  (e: 'reboot'): void
  (e: 'close'): void
  (e: 'brightness-toggle', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const shouldRender = ref(false)
const isVisible = ref(false)
const brightnessToggled = ref(false)
const brightnessValue = ref(180)
const isDragging = ref(false)
const trackRef = ref<HTMLDivElement | null>(null)

// Slider percentage (brightness range: 1-220, inverted for UI)
const BRIGHTNESS_MIN = 1
const BRIGHTNESS_MAX = 220

const percentage = computed(() => {
  const value = 221 - brightnessValue.value
  return ((clamp(value, BRIGHTNESS_MIN, BRIGHTNESS_MAX) - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * 100
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getPositionValue(clientX: number, trackRect: DOMRect, min: number, max: number) {
  const ratio = clamp((clientX - trackRect.left) / trackRect.width, 0, 1)
  const rawValue = min + ratio * (max - min)
  return Math.round(rawValue)
}

// Fetch initial brightness state
async function fetchBrightness() {
  try {
    const response = await fetch(`${config.nocturnedUrl}/device/brightness`)
    const data = await response.json()
    brightnessToggled.value = data.auto
    brightnessValue.value = data.brightness
  } catch (error) {
    console.error('Failed to fetch brightness state:', error)
  }
}

// Set brightness
async function setBrightness(value: number) {
  brightnessValue.value = value
  try {
    await fetch(`${config.nocturnedUrl}/device/brightness/${value}`, {
      method: 'POST'
    })
  } catch (error) {
    console.error('Failed to set brightness:', error)
  }
}

// Toggle auto brightness
async function toggleAutoBrightness() {
  const newToggleState = !brightnessToggled.value
  brightnessToggled.value = newToggleState
  emit('brightness-toggle', newToggleState)

  try {
    await fetch(`${config.nocturnedUrl}/device/brightness/auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled: newToggleState })
    })
  } catch (error) {
    console.error('Failed to toggle auto brightness:', error)
  }
}

// Slider drag handlers
function startDraggingAt(clientX: number) {
  if (brightnessToggled.value) return
  const track = trackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const sliderPos = getPositionValue(clientX, rect, 1, 220)
  const newValue = 221 - sliderPos
  setBrightness(newValue)
  isDragging.value = true
}

function handleMouseDown(e: MouseEvent) {
  e.preventDefault()
  startDraggingAt(e.clientX)
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches && e.touches[0]) {
    startDraggingAt(e.touches[0].clientX)
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  e.preventDefault()
  const track = trackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const sliderPos = getPositionValue(e.clientX, rect, 1, 220)
  const newValue = 221 - sliderPos
  setBrightness(newValue)
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value) return
  if (!e.touches || !e.touches[0]) return
  const track = trackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const sliderPos = getPositionValue(e.touches[0].clientX, rect, 1, 220)
  const newValue = 221 - sliderPos
  setBrightness(newValue)
}

function stopDragging() {
  isDragging.value = false
}

// Escape key handler
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopImmediatePropagation?.()
    e.stopPropagation()
    emit('close')
  }
}

// Watch for show changes
watch(() => props.show, (show) => {
  if (show) {
    shouldRender.value = true
    fetchBrightness()
    setTimeout(() => {
      isVisible.value = true
    }, 10)
    window.addEventListener('keydown', handleKeyDown, true)
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
  } else {
    isVisible.value = false
    setTimeout(() => {
      shouldRender.value = false
    }, 300)
    window.removeEventListener('keydown', handleKeyDown, true)
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
  }
}, { immediate: true })

// Drag event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove, { passive: false })
  document.addEventListener('mouseup', stopDragging)
  document.addEventListener('touchmove', handleTouchMove, { passive: true })
  document.addEventListener('touchend', stopDragging)
  document.addEventListener('touchcancel', stopDragging)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', stopDragging)
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', stopDragging)
  document.removeEventListener('touchcancel', stopDragging)
  window.removeEventListener('keydown', handleKeyDown, true)
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
})

function handleShutdown() {
  emit('shutdown')
}

function handleReboot() {
  emit('reboot')
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shouldRender"
      class="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ease-in-out"
      :class="isVisible ? 'opacity-100' : 'opacity-0'"
      @click="handleClose"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/80" />

      <!-- Menu content -->
      <div
        class="relative bg-neutral-900/90 rounded-2xl px-8 py-6 flex flex-col items-center space-y-8"
        @click.stop
      >
        <!-- Buttons row -->
        <div class="flex space-x-8">
          <!-- Shutdown button -->
          <button
            @click="handleShutdown"
            class="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-700 transition-colors focus:outline-none"
          >
            <PowerIcon class="w-10 h-10 text-white" />
          </button>

          <!-- Reboot button -->
          <button
            @click="handleReboot"
            class="w-24 h-24 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors focus:outline-none"
          >
            <RefreshIcon class="w-10 h-10 text-white" />
          </button>

          <!-- Auto brightness toggle -->
          <button
            @click="toggleAutoBrightness"
            class="w-24 h-24 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-0"
            :class="brightnessToggled ? 'bg-white hover:bg-gray-100' : 'bg-neutral-700 hover:bg-neutral-600'"
          >
            <BrightnessMidIcon
              :class="brightnessToggled ? 'w-10 h-10 text-black' : 'w-10 h-10 text-white'"
            />
          </button>
        </div>

        <!-- Brightness slider -->
        <div class="flex items-center space-x-4 w-full max-w-sm">
          <BrightnessLowIcon class="w-8 h-8 text-white flex-shrink-0" />
          <div class="flex-1 relative">
            <!-- Slider -->
            <div
              class="relative cursor-pointer"
              :class="brightnessToggled ? 'opacity-50 cursor-not-allowed' : ''"
              @mousedown="handleMouseDown"
              @touchstart="handleTouchStart"
              role="slider"
              :aria-valuemin="1"
              :aria-valuemax="220"
              :aria-valuenow="brightnessValue"
              :aria-disabled="brightnessToggled"
              :style="{ touchAction: 'none' }"
            >
              <div class="py-3 select-none">
                <div
                  ref="trackRef"
                  class="relative h-2 rounded-lg bg-neutral-700"
                >
                  <!-- Fill -->
                  <div
                    class="absolute inset-y-0 left-0 rounded-lg bg-white"
                    :style="{ width: `${percentage}%` }"
                  />
                  <!-- Thumb -->
                  <div
                    class="absolute top-1/2 -translate-y-1/2 -ml-3 w-6 h-6 rounded-full bg-white"
                    :class="brightnessToggled ? 'pointer-events-none' : ''"
                    :style="{ left: `calc(${percentage}% + 0px)` }"
                  />
                </div>
              </div>
            </div>
          </div>
          <BrightnessHighIcon class="w-8 h-8 text-white flex-shrink-0" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
