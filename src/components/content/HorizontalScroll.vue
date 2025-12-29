<script setup lang="ts">
// Simple horizontal scroll container - just CSS, no JS scroll handling
</script>

<template>
  <div class="flex overflow-x-auto scroll-container p-2 snap-x snap-mandatory">
    <slot />
    <div class="min-w-4 flex-shrink-0" />
  </div>
</template>
