import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'

/**
 * Composable for keyboard navigation in list views (album, artist, show)
 * Handles: Escape (back), ArrowUp/Down (select), Enter (play)
 */
export function useListNavigation<T>(
  items: Ref<T[]>,
  dataAttribute: string,
  onSelect: (item: T, index: number) => void
) {
  const router = useRouter()
  const selectedIndex = ref(0)

  function scrollToItem(index: number) {
    const element = document.querySelector(`[${dataAttribute}="${index}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      router.back()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (selectedIndex.value > 0) {
        selectedIndex.value--
        scrollToItem(selectedIndex.value)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (selectedIndex.value < items.value.length - 1) {
        selectedIndex.value++
        scrollToItem(selectedIndex.value)
      }
    } else if (e.key === 'Enter') {
      const item = items.value[selectedIndex.value]
      if (item) {
        onSelect(item, selectedIndex.value)
      }
    }
  }

  function setSelectedIndex(index: number, scroll = true) {
    selectedIndex.value = index
    if (scroll) {
      setTimeout(() => scrollToItem(index), 100)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return {
    selectedIndex,
    setSelectedIndex,
    scrollToItem
  }
}
