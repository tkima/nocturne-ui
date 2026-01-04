/**
 * Boot Store
 * Central state for all boot components
 */

import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { BootComponent, BootComponentName } from '@/boot/types'

export const useBootStore = defineStore('boot', () => {
  // Component instances (set by orchestrator) - use shallowRef to avoid deep reactivity issues
  const settingsComponent = shallowRef<BootComponent | null>(null)
  const authComponent = shallowRef<BootComponent | null>(null)
  const networkComponent = shallowRef<BootComponent | null>(null)
  const bluetoothComponent = shallowRef<BootComponent | null>(null)

  const bootPhase = ref<'idle' | 'starting' | 'critical' | 'ready'>('idle')

  // Register a component
  function registerComponent(component: BootComponent) {
    switch (component.name) {
      case 'settings':
        settingsComponent.value = component
        break
      case 'auth':
        authComponent.value = component
        break
      case 'network':
        networkComponent.value = component
        break
      case 'bluetooth':
        bluetoothComponent.value = component
        break
    }
  }

  // Get component by name
  function getComponent(name: BootComponentName): BootComponent | null {
    switch (name) {
      case 'settings':
        return settingsComponent.value
      case 'auth':
        return authComponent.value
      case 'network':
        return networkComponent.value
      case 'bluetooth':
        return bluetoothComponent.value
    }
  }

  // Computed: critical components ready (settings only - for loading screen)
  // Network + Auth happen in background after loading screen completes
  const criticalReady = computed(() => {
    const settings = settingsComponent.value
    return settings?.isReady.value ?? false
  })

  // Computed: network ready
  const networkReady = computed(() => {
    return networkComponent.value?.isReady.value ?? false
  })

  // Computed: bluetooth ready
  const bluetoothReady = computed(() => {
    return bluetoothComponent.value?.isReady.value ?? false
  })

  // Computed: all ready
  const allReady = computed(() => {
    return criticalReady.value && networkReady.value
  })

  return {
    // Components
    settingsComponent,
    authComponent,
    networkComponent,
    bluetoothComponent,
    bootPhase,
    registerComponent,
    getComponent,
    criticalReady,
    networkReady,
    bluetoothReady,
    allReady,
  }
})
