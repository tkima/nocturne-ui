import { defineStore } from 'pinia'

// ========================================
// UI Store
// ========================================

export const useUiStore = defineStore('ui', {
  // ========================================
  // State
  // ========================================
  state: () => ({
    activeSection: 'recents' as string,
    gradientColors: ['#4a6741', '#2d1f3d'] as string[], // Nice default gradient
    isLoading: false,
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
  },
})
