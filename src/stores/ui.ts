import { defineStore } from 'pinia'

// ========================================
// UI Store
// ========================================

export type MappableContentType = 'playlist' | 'album' | 'artist' | 'show' | 'liked-songs' | null

export interface MappableContent {
  id: string | null
  type: MappableContentType
  image: string
  name: string
}

export const useUiStore = defineStore('ui', {
  // ========================================
  // State
  // ========================================
  state: () => ({
    activeSection: 'recents' as string,
    gradientColors: ['#4a6741', '#2d1f3d'] as string[], // Nice default gradient
    isLoading: false,
    // Current content that can be mapped to buttons 1-4 via long press
    mappableContent: {
      id: null,
      type: null,
      image: '',
      name: ''
    } as MappableContent,
  }),

  // ========================================
  // Getters
  // ========================================
  getters: {
    gradientStyle: (state) => ({
      background: `linear-gradient(135deg, ${state.gradientColors[0]}, ${state.gradientColors[1]})`,
    }),
  },

  // ========================================
  // Actions
  // ========================================
  actions: {
    setActiveSection(section: string) {
      this.activeSection = section
    },

    setGradientColors(colors: string[]) {
      this.gradientColors = colors
    },

    resetGradient() {
      this.gradientColors = ['#1a1a1a', '#0a0a0a']
    },

    setMappableContent(content: MappableContent) {
      this.mappableContent = content
    },

    clearMappableContent() {
      this.mappableContent = {
        id: null,
        type: null,
        image: '',
        name: ''
      }
    },
  },
})
