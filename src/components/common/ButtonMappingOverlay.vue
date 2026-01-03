<!-- ============================================================
     ButtonMappingOverlay - Shows preset buttons when mapping
     ============================================================ -->
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSettings } from '@/composables/useSettings'

interface Props {
  show: boolean
  activeButton: string | null
}

const props = defineProps<Props>()

const preloadedImages = ref<Record<number, string>>({})
const imageTypes = ref<Record<number, string>>({})
const shouldRender = ref(false)
const isVisible = ref(false)

function preloadImages() {
  const images: Record<number, string> = {}
  const types: Record<number, string> = {}
  const { settings } = useSettings()

  ;[1, 2, 3, 4].forEach((buttonNum) => {
    const mapping = settings.value.buttonMappings[buttonNum - 1]

    if (mapping?.image) {
      // Preload image
      const img = new Image()
      img.src = mapping.image
      images[buttonNum] = mapping.image
    }
    if (mapping?.type) {
      types[buttonNum] = mapping.type
    }
  })

  preloadedImages.value = images
  imageTypes.value = types
}

watch(() => props.show, (show) => {
  if (show) {
    preloadImages()
    shouldRender.value = true
    setTimeout(() => {
      isVisible.value = true
    }, 10)
  } else {
    isVisible.value = false
    setTimeout(() => {
      shouldRender.value = false
    }, 300)
  }
}, { immediate: true })

onMounted(() => {
  preloadImages()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shouldRender"
      class="fixed inset-0 z-50 flex items-start justify-center transition-opacity duration-300 ease-in-out"
      :class="isVisible ? 'opacity-100' : 'opacity-0'"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/80" />

      <!-- Button presets -->
      <div class="relative w-[800px] pt-4 px-[23px] flex justify-center">
        <div class="flex">
          <div
            v-for="(buttonNum, index) in [1, 2, 3, 4]"
            :key="buttonNum"
            class="relative"
            :class="index > 0 ? 'ml-[40px]' : ''"
          >
            <div class="flex flex-col items-center w-[160px]">
              <!-- Active indicator bar -->
              <div
                class="w-20 h-1.5 rounded-full mb-4 transition-colors duration-300"
                :class="String(buttonNum) === activeButton ? 'bg-white' : 'bg-white/25'"
              />

              <!-- Button number -->
              <div
                class="text-[28px] font-[560] mb-4 transition-colors duration-300"
                :class="String(buttonNum) === activeButton ? 'text-white' : 'text-white/60'"
              >
                {{ buttonNum }}
              </div>

              <!-- Preset image -->
              <div
                v-if="preloadedImages[buttonNum]"
                class="aspect-square w-full p-1 transition-all duration-300"
              >
                <img
                  :src="preloadedImages[buttonNum]"
                  :alt="`Button ${buttonNum} mapping`"
                  class="w-full h-full object-cover shadow-lg max-w-[152px] max-h-[152px]"
                  :class="imageTypes[buttonNum] === 'artist' ? 'rounded-full' : 'rounded-lg'"
                />
              </div>

              <!-- Empty state -->
              <div
                v-else
                class="w-[152px] h-[152px] bg-white/10 rounded-lg flex items-center justify-center"
              >
                <span class="text-white/40 text-sm">Empty</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
