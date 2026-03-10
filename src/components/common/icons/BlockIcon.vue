<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(256, 256, 256, 0.6)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="$props.class"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
</template>
