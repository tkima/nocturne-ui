<script setup lang="ts">
interface Props {
  isRounded?: boolean
}

withDefaults(defineProps<Props>(), {
  isRounded: false,
})
</script>

<template>
  <div class="pl-2 mr-10" style="min-width: var(--album-art-size)">
    <div
      class="mt-10 aspect-square drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)] bg-white/10 animate-pulse"
      :class="isRounded ? 'rounded-full' : 'rounded-[12px]'"
      style="width: var(--album-art-size); height: var(--album-art-size)"
    ></div>
    <div class="mt-2 h-9 w-48 bg-white/10 rounded animate-pulse"></div>
    <div class="mt-2 h-8 w-40 bg-white/10 rounded animate-pulse"></div>
  </div>
</template>
