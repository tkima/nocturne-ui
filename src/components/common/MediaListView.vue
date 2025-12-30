<!-- ============================================================
     MediaListView - Shared layout for album, artist, show views
     ============================================================ -->
<script setup lang="ts">
import { computed } from 'vue'

// ------------------------------------------------------------
// Props
// ------------------------------------------------------------
const props = defineProps<{
  // Left side - media info
  image: string
  title: string
  subtitle: string
  imageRounded?: 'full' | 'lg'  // 'full' for artist, 'lg' for album/show

  // Right side - list
  items: any[]
  selectedIndex: number
  currentItemUri: string | null | undefined

  // Display config
  itemDataAttribute?: string  // e.g., 'data-track-index'
}>()

// ------------------------------------------------------------
// Emits
// ------------------------------------------------------------
const emit = defineEmits<{
  (e: 'item-click', item: any, index: number): void
}>()

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------
const imageClass = computed(() => {
  return props.imageRounded === 'full' ? 'rounded-full' : 'rounded-[12px]'
})

const textAlign = computed(() => {
  return props.imageRounded === 'full' ? 'text-center' : ''
})

// Helper to get dynamic data attribute for an item
function getItemAttrs(index: number): Record<string, number> {
  if (!props.itemDataAttribute) return {}
  return { [props.itemDataAttribute]: index }
}
</script>

<template>
  <div class="h-screen w-full flex fadeIn-animation">
    <!-- Left: Media Info (Sticky) -->
    <div class="flex-shrink-0 p-12 flex flex-col">
      <!-- Image -->
      <img
        v-if="image"
        :src="image"
        alt="Media Art"
        class="object-cover drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]"
        :class="imageClass"
        style="width: var(--album-art-size); height: var(--album-art-size)"
      />
      <div
        v-else
        class="bg-white/10 flex items-center justify-center"
        :class="imageClass"
        style="width: var(--album-art-size); height: var(--album-art-size)"
      >
        <span class="text-white/40 text-xl">No Image</span>
      </div>

      <!-- Info -->
      <div class="mt-6" :class="textAlign" style="max-width: var(--album-art-size)">
        <h2 class="text-[32px] font-[580] text-white tracking-tight truncate">
          {{ title }}
        </h2>
        <p class="text-[24px] font-[560] text-white/60 tracking-tight truncate">
          {{ subtitle }}
        </p>
      </div>
    </div>

    <!-- Right: List (Scrollable) -->
    <div class="flex-1 overflow-y-auto py-12 pr-12 scroll-container">
      <div
        v-for="(item, index) in items"
        :key="item.id || index"
        v-bind="getItemAttrs(index)"
        class="flex items-start mb-5 cursor-pointer transition-transform duration-200 ease-out"
        :class="selectedIndex === index ? 'scale-105' : ''"
        @click="emit('item-click', item, index)"
      >
        <!-- Number or Playing Indicator -->
        <div class="w-14 flex-shrink-0">
          <div
            v-if="item.uri === currentItemUri"
            class="flex items-end gap-[2px] h-6"
          >
            <div class="w-1 bg-white animate-wave0 rounded-full" />
            <div class="w-1 bg-white animate-wave1 rounded-full" />
            <div class="w-1 bg-white animate-wave2 rounded-full" />
            <div class="w-1 bg-white animate-wave3 rounded-full" />
          </div>
          <p v-else class="text-[28px] font-[560] text-white/40">
            {{ (index + 1) }}
          </p>
        </div>

        <!-- Item Content (slot) -->
        <div class="flex-1 min-w-0">
          <slot name="item" :item="item" :index="index" :is-playing="item.uri === currentItemUri" />
        </div>
      </div>
    </div>
  </div>
</template>
