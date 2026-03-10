<script setup lang="ts">
import { ref, computed } from 'vue'
import { debugLogs, clearDebugLogs, debugCategory, sessionId } from '@/utils/debug'

// Start minimized by default
const isExpanded = ref(false)

// Available categories from logs
const categories = computed(() => {
  const cats = new Set(debugLogs.value.map(l => l.category))
  return ['All', ...Array.from(cats)]
})

// Filtered logs - only show current session
const filteredLogs = computed(() => {
  // Only show logs from current session
  let logs = debugLogs.value.filter(l => l.session === sessionId)

  // Filter by category
  if (debugCategory.value && debugCategory.value !== 'All') {
    logs = logs.filter(l => l.category === debugCategory.value)
  }

  return logs
})

function setCategory(cat: string) {
  debugCategory.value = cat === 'All' ? null : cat
}
</script>

<template>
  <div
    class="fixed bottom-0 left-0 right-0 z-[9999] bg-black text-white font-mono text-[14px] border-t-2 border-white/30"
    :class="isExpanded ? 'h-[70vh]' : 'h-[50px]'"
  >
    <!-- Header bar - always visible -->
    <div
      class="flex items-center justify-between px-4 py-2 bg-black cursor-pointer border-b border-white/20"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-4">
        <span class="font-bold text-blue-400 text-[16px]">DEBUG</span>
        <span class="text-purple-400 font-bold">{{ sessionId }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-white/50">{{ filteredLogs.length }} logs</span>
        <button
          @click.stop="clearDebugLogs"
          class="px-3 py-1 bg-red-600/50 rounded hover:bg-red-600"
        >
          Clear
        </button>
        <span class="text-white/50 text-[20px]">{{ isExpanded ? '▼' : '▲' }}</span>
      </div>
    </div>

    <!-- Expandable content -->
    <div v-if="isExpanded" class="flex flex-col h-[calc(70vh-50px)]">
      <!-- Category filter tabs -->
      <div class="flex gap-2 px-3 py-2 border-b border-white/10 overflow-x-auto items-center">
        <span class="text-white/40 text-[12px] shrink-0">Category:</span>
        <button
          v-for="cat in categories"
          :key="cat"
          @click.stop="setCategory(cat)"
          class="px-3 py-1 rounded text-[12px] shrink-0"
          :class="(cat === 'All' && !debugCategory) || cat === debugCategory
            ? 'bg-blue-600 text-white'
            : 'bg-white/10 text-white/60 hover:bg-white/20'"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Log area -->
      <div class="overflow-y-auto flex-1 p-3 bg-black">
        <div
          v-for="(log, i) in filteredLogs"
          :key="i"
          class="flex gap-3 py-1 border-b border-white/5"
          :class="{
            'text-white/80': log.type === 'info',
            'text-green-400': log.type === 'success',
            'text-red-400': log.type === 'error',
            'text-yellow-400': log.type === 'warn'
          }"
        >
          <span class="text-white/40 shrink-0 w-[70px]">{{ log.time }}</span>
          <span class="text-blue-400/60 shrink-0 w-[80px]">[{{ log.category }}]</span>
          <span>{{ log.message }}</span>
        </div>
        <div v-if="filteredLogs.length === 0" class="text-white/30 italic text-[16px]">No logs yet...</div>
      </div>
    </div>
  </div>
</template>
