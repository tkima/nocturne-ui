<!-- ============================================================
     PairingScreen - Shows Bluetooth pairing PIN confirmation
     ============================================================ -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import GradientBackground from '@/components/common/GradientBackground.vue'
import { NocturneIcon } from '@/components/common/icons'

interface Props {
  pin: string
  isConnecting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isConnecting: false
})

const emit = defineEmits<{
  accept: []
  reject: []
}>()

const uiStore = useUiStore()

onMounted(() => {
  uiStore.setGradientColors(['#1a4a3a', '#2d1f3d'])
})
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
    <div class="absolute inset-0 bg-black" />
    <GradientBackground :gradient-state="uiStore.gradientStyle" />

    <div class="relative z-10 w-full max-w-6xl px-6 grid grid-cols-2 gap-16 items-center">
      <div class="flex flex-col items-start space-y-8 ml-12">
        <NocturneIcon class="h-12 w-auto" />

        <div class="space-y-4">
          <h2 class="text-5xl text-white tracking-tight font-semibold w-[24rem]">
            Bluetooth Pairing
          </h2>
          <p class="text-[28px] text-white tracking-tight">
            Confirm that this pin matches the one on your phone.
          </p>
          <div class="mt-4 flex space-x-4 justify-center">
            <button
              :disabled="isConnecting"
              class="flex w-full justify-center text-4xl font-semibold text-white tracking-tight transition-colors duration-200 rounded-xl px-6 py-3 border border-white/10 hover:bg-white/10 disabled:opacity-50 bg-black/20"
              @click="emit('reject')"
            >
              Reject
            </button>
            <button
              :disabled="isConnecting"
              class="flex w-full justify-center bg-black/20 hover:bg-white/10 text-4xl font-semibold text-white tracking-tight transition-colors duration-200 rounded-xl px-6 py-3 border border-white/10 disabled:opacity-50"
              @click="emit('accept')"
            >
              {{ isConnecting ? 'Connecting...' : 'Accept' }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-center">
        <div class="text-[56px] font-bold text-white">{{ pin }}</div>
      </div>
    </div>
  </div>
</template>
