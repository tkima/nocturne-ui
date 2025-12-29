<script setup lang="ts">
interface Props {
  id: string
  name: string
  subtitle?: string
  imageUrl?: string
  isPlaying?: boolean
  isRounded?: boolean // true for artists (circular), false for albums/playlists
}

withDefaults(defineProps<Props>(), {
  subtitle: '',
  imageUrl: '',
  isPlaying: false,
  isRounded: false,
})

const emit = defineEmits<{
  click: []
  subtitleClick: []
}>()
</script>

<template>
  <div
    class="pl-2 mr-10 snap-start"
    style="min-width: var(--album-art-size)"
    :data-id="id"
    :data-playing="isPlaying ? 'true' : 'false'"
  >
    <!-- Image container -->
    <div
      class="mt-10 aspect-square drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)] cursor-pointer"
      :class="isRounded ? 'rounded-full' : 'rounded-[12px]'"
      style="width: var(--album-art-size); height: var(--album-art-size)"
      @click="emit('click')"
    >
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="`${name} Cover`"
        class="w-full h-full object-cover"
        :class="isRounded ? 'rounded-full' : 'rounded-[12px]'"
      />
      <div
        v-else
        class="w-full h-full bg-white/10 flex items-center justify-center"
        :class="isRounded ? 'rounded-full' : 'rounded-[12px]'"
      >
        <span class="text-white/40 text-6xl">♪</span>
      </div>
    </div>

    <!-- Title -->
    <h4
      class="mt-2 text-[36px] font-[580] text-white truncate tracking-tight cursor-pointer"
      style="max-width: var(--album-art-size)"
      @click="emit('click')"
    >
      {{ name }}
    </h4>

    <!-- Subtitle with optional "Now Playing" indicator -->
    <h4
      v-if="subtitle || isPlaying"
      class="text-[32px] font-[560] text-white/60 truncate tracking-tight flex items-center"
      style="max-width: var(--album-art-size)"
      @click="emit('subtitleClick')"
    >
      <template v-if="isPlaying">
        <div class="w-5 ml-0.5 mr-3 mb-2">
          <section>
            <div class="wave0"></div>
            <div class="wave1"></div>
            <div class="wave2"></div>
            <div class="wave3"></div>
          </section>
        </div>
        Now Playing
      </template>
      <template v-else>
        {{ subtitle }}
      </template>
    </h4>
  </div>
</template>
