<!-- ============================================================
     LoadingScreen - Initial boot loading screen with progress bar
     Uses boot store for criticalReady state
     ============================================================ -->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useBootStore } from '@/stores/boot'
import { useNetwork } from '@/composables/useNetwork'
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
const bootStore = useBootStore()
const network = useNetwork()

const bootCounterDone = ref(false)
let completeCalled = false

// Progress from boot store (0-100)
const progress = computed(() => bootStore.progress)

// Watch for completion (bootCounterDone + full boot ready including network/auth)
watch([() => bootCounterDone.value, () => bootStore.bootPhase], ([counterDone, phase]) => {
  if (counterDone && phase === 'ready' && !completeCalled) {
    completeCalled = true
    // 1s delay before completing to let things stabilize
    setTimeout(() => {
      emit('complete')
    }, 1000)
  }
})

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
    // Boot sequence is started by App.vue, we just watch criticalReady
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

    <!-- Connection Status Indicator -->
    <div class="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
      <div
        class="w-3 h-3 rounded-full"
        :class="network.isConnected.value === true ? 'bg-green-500' : network.isConnected.value === false ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'"
      />
      <span class="text-[20px] text-white/80">
        {{ network.isConnected.value === true ? 'Connected' : network.isConnected.value === false ? 'No Internet' : 'Checking...' }}
      </span>
    </div>
  </div>
</template>
