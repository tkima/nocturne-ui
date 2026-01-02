import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  message: string
  type: ToastType
}

const currentToast = ref<Toast | null>(null)
let toastTimeout: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  function show(message: string, type: ToastType = 'info', duration = 2000) {
    if (toastTimeout) clearTimeout(toastTimeout)
    currentToast.value = { message, type }
    toastTimeout = setTimeout(() => {
      currentToast.value = null
    }, duration)
  }

  function success(message: string, duration = 2000) {
    show(message, 'success', duration)
  }

  function error(message: string, duration = 3000) {
    show(message, 'error', duration)
  }

  function info(message: string, duration = 2000) {
    show(message, 'info', duration)
  }

  function clear() {
    if (toastTimeout) clearTimeout(toastTimeout)
    currentToast.value = null
  }

  return {
    currentToast,
    show,
    success,
    error,
    info,
    clear
  }
}
