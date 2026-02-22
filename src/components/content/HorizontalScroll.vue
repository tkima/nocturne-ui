<script setup lang="ts">
const props = withDefaults(defineProps<{
  loading?: boolean
}>(), {
  loading: false,
})

const emit = defineEmits<{
  (e: 'load-more'): void
}>()

function handleScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el || props.loading) return

  const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 300
  if (nearEnd) {
    emit('load-more')
  }
}
</script>

<template>
  <div class="flex overflow-x-auto scroll-container p-2" @scroll="handleScroll">
    <slot />

    <!-- Loading more spinner -->
    <div
      v-if="loading"
      class="flex items-center justify-center min-w-[80px] flex-shrink-0"
    >
      <div class="w-8 h-8 border-3 border-white/20 border-t-white rounded-full animate-spin" />
    </div>

    <div class="min-w-4 flex-shrink-0" />
  </div>
</template>
