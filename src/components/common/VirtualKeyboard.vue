<!-- ============================================================
     Virtual Keyboard - On-screen keyboard for touchscreen input
     ============================================================ -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Keyboard from 'simple-keyboard'
import 'simple-keyboard/build/css/index.css'

const props = defineProps<{
  modelValue: string
  visible: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'enter': []
  'hide': []
}>()

const keyboardRef = ref<HTMLDivElement | null>(null)
let keyboard: Keyboard | null = null

const layoutName = ref('default')
const capsLock = ref(false)

const layouts = {
  default: [
    'q w e r t y u i o p {bksp}',
    'a s d f g h j k l ; {enter}',
    '{shift} z x c v b n m , . {lock}',
    '{numbers} {space} {numbers} {hide}'
  ],
  shift: [
    'Q W E R T Y U I O P {bksp}',
    'A S D F G H J K L : {enter}',
    '{shift} Z X C V B N M < > {lock}',
    '{numbers} {space} {numbers} {hide}'
  ],
  numbers: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '- / : ; ( ) $ & @ " {enter}',
    '{symbols} . , ? ! \' + - = \' {lock}',
    '{default} {space} {default} {hide}'
  ],
  symbols: [
    '[ ] { } # % ^ * + = {bksp}',
    '_ \\ | ~ < > € £ ¥ • {enter}',
    '{numbers} ` ¿ ¡ § ° † ‡ … ≠ {lock}',
    '{default} {space} {default} {hide}'
  ]
}

const display = {
  '{bksp}': 'del',
  '{enter}': 'return',
  '{shift}': 'shift',
  '{lock}': 'caps',
  '{space}': 'space',
  '{numbers}': '?123',
  '{symbols}': '#+=',
  '{default}': 'ABC',
  '{hide}': 'hide'
}

function onKeyPress(button: string) {
  console.log('[VirtualKeyboard] onKeyPress:', button)
  if (button === '{bksp}') {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  } else if (button === '{enter}') {
    // Submit/done - emit enter to trigger form submission
    console.log('[VirtualKeyboard] Emitting enter event')
    emit('enter')
  } else if (button === '{space}') {
    emit('update:modelValue', props.modelValue + ' ')
  } else if (button === '{shift}') {
    layoutName.value = layoutName.value === 'default' ? 'shift' : 'default'
    keyboard?.setOptions({ layoutName: layoutName.value })
  } else if (button === '{lock}') {
    capsLock.value = !capsLock.value
    layoutName.value = capsLock.value ? 'shift' : 'default'
    keyboard?.setOptions({ layoutName: layoutName.value })
  } else if (button === '{numbers}') {
    layoutName.value = 'numbers'
    keyboard?.setOptions({ layoutName: 'numbers' })
  } else if (button === '{symbols}') {
    layoutName.value = 'symbols'
    keyboard?.setOptions({ layoutName: 'symbols' })
  } else if (button === '{default}') {
    layoutName.value = 'default'
    keyboard?.setOptions({ layoutName: 'default' })
  } else if (button === '{hide}') {
    emit('hide')
  } else {
    emit('update:modelValue', props.modelValue + button)
    // Auto-unshift after typing (unless caps lock)
    if (layoutName.value === 'shift' && !capsLock.value) {
      layoutName.value = 'default'
      keyboard?.setOptions({ layoutName: 'default' })
    }
  }
}

function initKeyboard() {
  if (!keyboardRef.value) {
    console.log('[VirtualKeyboard] initKeyboard: keyboardRef is null')
    return
  }

  console.log('[VirtualKeyboard] initKeyboard: Creating keyboard instance')

  keyboard = new Keyboard(keyboardRef.value, {
    onChange: () => {},
    onKeyPress,
    layout: layouts,
    display,
    layoutName: layoutName.value,
    theme: 'hg-theme-default nocturne-keyboard',
    buttonTheme: [
      { class: 'hg-red', buttons: '{bksp}' },
      { class: 'hg-green', buttons: '{enter}' }
    ]
  })

  console.log('[VirtualKeyboard] Keyboard instance created:', keyboard ? 'success' : 'failed')
}

function destroyKeyboard() {
  if (keyboard) {
    keyboard.destroy()
    keyboard = null
  }
}

watch(() => props.visible, async (visible) => {
  console.log('[VirtualKeyboard] Visibility changed:', visible)
  if (visible) {
    // Use nextTick to ensure DOM is ready
    await nextTick()
    initKeyboard()
  } else {
    destroyKeyboard()
  }
})

watch(() => props.modelValue, (value) => {
  if (keyboard) {
    keyboard.setInput(value)
  }
})

onMounted(async () => {
  console.log('[VirtualKeyboard] onMounted, visible:', props.visible)
  if (props.visible) {
    await nextTick()
    initKeyboard()
  }
})

onUnmounted(() => {
  destroyKeyboard()
})
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="fixed bottom-0 left-0 right-0 z-[110] p-4 bg-[#1a1a1a]/95 backdrop-blur-sm border-t border-white/10"
      @click.stop
      @mousedown.stop
      @touchstart.stop
    >
      <div class="max-w-[800px] mx-auto">
        <div ref="keyboardRef" class="keyboard-container" />
      </div>
    </div>
  </Transition>
</template>

<style>
/* Nocturne keyboard theme */
.nocturne-keyboard {
  background: transparent !important;
  padding: 0 !important;
}

.nocturne-keyboard .hg-row {
  margin-bottom: 8px !important;
}

.nocturne-keyboard .hg-button {
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 8px !important;
  color: white !important;
  font-size: 20px !important;
  font-weight: 500 !important;
  height: 50px !important;
  min-width: 40px !important;
}

.nocturne-keyboard .hg-button:active {
  background: rgba(255, 255, 255, 0.2) !important;
}

.nocturne-keyboard .hg-button.hg-red {
  background: rgba(239, 68, 68, 0.3) !important;
  color: #fca5a5 !important;
}

.nocturne-keyboard .hg-button.hg-green {
  background: rgba(34, 197, 94, 0.3) !important;
  color: #86efac !important;
}

.nocturne-keyboard .hg-button.hg-standardBtn[data-skbtn="{space}"] {
  min-width: 200px !important;
}

.nocturne-keyboard .hg-button.hg-standardBtn[data-skbtn="{enter}"] {
  min-width: 80px !important;
}

/* Slide up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
