<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NowPlayingIcon,
  RecentsIcon,
  LibraryIcon,
  ArtistsIcon,
  PodcastIcon,
  SettingsIcon,
} from '@/components/common/icons'

interface NavItem {
  path: string
  label: string
  icon: Component
}

const router = useRouter()
const route = useRoute()

const navItems: NavItem[] = [
  { path: '/now-playing', label: 'Now Playing', icon: NowPlayingIcon },
  { path: '/recents', label: 'Recents', icon: RecentsIcon },
  { path: '/library', label: 'Library', icon: LibraryIcon },
  { path: '/artists', label: 'Artists', icon: ArtistsIcon },
  { path: '/podcasts', label: 'Podcasts', icon: PodcastIcon },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]

const currentPath = computed(() => route.path)

function handleNavigate(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="space-y-7 pt-12">
    <!-- StatusBar will be conditionally rendered here when implemented -->

    <!-- Nav Items -->
    <div
      v-for="item in navItems"
      :key="item.path"
      class="relative flex items-center group cursor-pointer"
      @click="handleNavigate(item.path)"
    >
      <!-- Active indicator -->
      <div
        v-if="currentPath === item.path"
        class="absolute left-[-19px] top-1/2 transform -translate-y-1/2 h-8 w-1.5 bg-white rounded-full drop-shadow-[0_8px_5px_rgba(0,0,0,0.25)]"
        aria-hidden="true"
      />

      <!-- Icon box -->
      <div class="mr-4 flex-shrink-0">
        <div class="h-[70px] w-[70px] bg-white/25 rounded-[12px] flex items-center justify-center border border-white/10 drop-shadow-[0_20px_5px_rgba(0,0,0,0.25)]">
          <component :is="item.icon" class="h-10 w-10 text-white" />
        </div>
      </div>

      <!-- Label -->
      <div>
        <h4 class="ml-1 text-[32px] font-[580] text-white tracking-tight">
          {{ item.label }}
        </h4>
      </div>
    </div>
  </div>
</template>
