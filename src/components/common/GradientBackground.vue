<script setup lang="ts">
interface Props {
  gradientState: {
    background: string
  }
}
defineProps<Props>()
</script>

<template>
  <div
    class="fixed inset-0 transition-all duration-500 ease-out"
    :style="gradientState"
    aria-hidden="true"
  />
</template>
