<!-- ============================================================
     LoadingScreen - Initial boot loading screen with progress bar
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useNetwork } from '@/composables/useNetwork'
import { useUiStore } from '@/stores/ui'
import GradientBackground from './GradientBackground.vue'
import { NocturneIcon } from './icons'

interface Props {
  show?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  show: true
})

const emit = defineEmits<{
  complete: []
}>()

const uiStore = useUiStore()
const network = useNetwork()

const progress = ref(0)
const bootCounterDone = ref(false)
const networkCheckDone = ref(false)
const minWaitDone = ref(false) // Minimum wait time to let network settle
let completeCalled = false

// Progress calculation - now 3 tasks: boot counter + network check + min wait
const tasksTotal = 3
const completedTasks = computed(() => {
  let count = 0
  if (bootCounterDone.value) count++
  if (networkCheckDone.value) count++
  if (minWaitDone.value) count++
  return count
})

// Update progress when tasks complete
watch(completedTasks, (count) => {
  progress.value = Math.floor((count / tasksTotal) * 100)

  if (count === tasksTotal && !completeCalled) {
    completeCalled = true
    // Small delay before completing
    setTimeout(() => {
      emit('complete')
    }, 500)
  }
})

// Watch network check - but also wait for connection if initial check says not connected
watch(
  [() => network.initialCheckDone.value, () => network.isConnected.value],
  ([done, connected]) => {
    // Wait until:
    // 1. Initial check is done AND connected, OR
    // 2. Initial check is done AND we've waited long enough (minWaitDone)
    if (done && (connected === true || minWaitDone.value)) {
      networkCheckDone.value = true
    }
  },
  { immediate: true }
)

// Reset boot counter on device
async function resetBootCounter() {
  try {
    await fetch('http://localhost:5000/device/resetcounter', {
      method: 'POST'
    })
  } catch (err) {
    console.error('Error resetting boot counter:', err)
  } finally {
    bootCounterDone.value = true
  }
}

onMounted(() => {
  if (props.show) {
    uiStore.setGradientColors(['#1a4a3a', '#2d1f3d'])
    resetBootCounter()

    // Minimum wait time (3 seconds) to let bluetooth/network settle on device
    // This ensures we don't flash "no connection" immediately
    setTimeout(() => {
      minWaitDone.value = true
      // Also mark network check done if still waiting (fallback)
      if (!networkCheckDone.value) {
        networkCheckDone.value = true
      }
    }, 3000)
  }
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden rounded-2xl"
  >
    <div class="absolute inset-0 bg-black" />
    <GradientBackground :gradient-state="uiStore.gradientStyle" />

    <div class="relative z-10 flex flex-col items-center">
      <NocturneIcon class="h-14 w-auto mb-8" />

      <div class="relative">
        <div class="relative w-72 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-white rounded-full transition-all duration-300 ease-out"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
