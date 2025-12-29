<!-- ============================================================
     QRCodeDisplay - Shows QR code for Spotify authentication
     ============================================================ -->
<script setup lang="ts">
import QrcodeVue from 'qrcode.vue'

interface Props {
  verificationUri: string | null
  isLoading?: boolean
  error?: string | null
}

withDefaults(defineProps<Props>(), {
  isLoading: false,
  error: null,
})
</script>

<template>
  <!-- Loading state -->
  <div
    v-if="isLoading"
    class="animate-pulse bg-white/10 w-[260px] h-[260px] rounded-xl"
  />

  <!-- Error state -->
  <div
    v-else-if="error"
    class="w-[280px] h-[280px] rounded-xl bg-white/10 flex items-center justify-center p-6"
  >
    <p class="text-white/70 text-xl text-center">{{ error }}</p>
  </div>

  <!-- No URI state -->
  <div
    v-else-if="!verificationUri"
    class="w-[280px] h-[280px] rounded-xl bg-white/10 flex items-center justify-center p-6"
  >
    <p class="text-white/70 text-xl text-center">Retrieving QR code...</p>
  </div>

  <!-- QR Code -->
  <div
    v-else
    class="bg-white p-1 rounded-xl drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]"
  >
    <QrcodeVue
      :value="verificationUri"
      :size="250"
      level="H"
      :margin="2"
    />
  </div>
</template>
