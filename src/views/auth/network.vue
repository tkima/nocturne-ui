<!-- ============================================================
     Network Screen - Wi-Fi and Bluetooth connection settings
     ============================================================ -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useWiFiNetworks } from '@/composables/useWiFiNetworks'
import { useBluetooth } from '@/composables/useBluetooth'
import { useNetwork } from '@/composables/useNetwork'
import GradientBackground from '@/components/common/GradientBackground.vue'
import {
  NocturneIcon,
  WifiIcon,
  BluetoothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon
} from '@/components/common/icons'
import VirtualKeyboard from '@/components/common/VirtualKeyboard.vue'

const router = useRouter()
const uiStore = useUiStore()
const authStore = useAuthStore()

// Composables
const wifi = useWiFiNetworks()
const bluetooth = useBluetooth()
const network = useNetwork()

// Watch for internet connection - auto navigate to login when connected
watch(
  () => network.isConnected.value,
  (connected) => {
    if (connected && !authStore.isAuthenticated) {
      // Small delay to show "connected" status before navigating
      setTimeout(() => {
        router.replace('/auth/login')
      }, 1000)
    }
  }
)

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
type Screen = 'main' | 'network' | 'wifi' | 'bluetooth'
const currentScreen = ref<Screen>('main')
const isAnimating = ref(false)

// Password modal
const showPasswordModal = ref(false)
const passwordInput = ref('')
const selectedNetwork = ref<{ ssid: string; flags: string } | null>(null)
const showKeyboard = ref(false)

// Forget device modal
const showForgetModal = ref(false)
const deviceToForget = ref<{ address: string; name: string } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null

// Animation classes
const mainClasses = ref('translate-x-0 opacity-100')
const networkClasses = ref('translate-x-full opacity-0')
const subpageClasses = ref('translate-x-full opacity-0')

const ANIMATION_DURATION = 300

// ------------------------------------------------------------
// Navigation
// ------------------------------------------------------------
function navigateTo(screen: Screen) {
  if (isAnimating.value) return
  isAnimating.value = true

  if (screen === 'network') {
    mainClasses.value = '-translate-x-full opacity-0'
    networkClasses.value = 'translate-x-0 opacity-100'
  } else if (screen === 'wifi' || screen === 'bluetooth') {
    networkClasses.value = '-translate-x-full opacity-0'
    subpageClasses.value = 'translate-x-0 opacity-100'
  }

  setTimeout(() => {
    currentScreen.value = screen
    isAnimating.value = false
  }, ANIMATION_DURATION)
}

function navigateBack() {
  if (isAnimating.value) return
  isAnimating.value = true

  if (currentScreen.value === 'wifi' || currentScreen.value === 'bluetooth') {
    subpageClasses.value = 'translate-x-full opacity-0'
    networkClasses.value = 'translate-x-0 opacity-100'
    setTimeout(() => {
      currentScreen.value = 'network'
      isAnimating.value = false
    }, ANIMATION_DURATION)
  } else if (currentScreen.value === 'network') {
    networkClasses.value = 'translate-x-full opacity-0'
    mainClasses.value = 'translate-x-0 opacity-100'
    setTimeout(() => {
      currentScreen.value = 'main'
      isAnimating.value = false
    }, ANIMATION_DURATION)
  }
}

// ------------------------------------------------------------
// Wi-Fi Actions
// ------------------------------------------------------------
function handleNetworkClick(network: { ssid: string; flags: string }) {
  if (wifi.hasPasswordSecurity(network.flags)) {
    selectedNetwork.value = network
    passwordInput.value = ''
    showPasswordModal.value = true
    // Show keyboard after modal animation
    setTimeout(() => {
      showKeyboard.value = true
    }, 100)
  } else {
    wifi.connectToNetwork(network.ssid)
  }
}

async function handlePasswordSubmit() {
  if (!selectedNetwork.value) return

  showKeyboard.value = false
  const success = await wifi.connectToNetwork(
    selectedNetwork.value.ssid,
    passwordInput.value
  )

  if (success) {
    showPasswordModal.value = false
    selectedNetwork.value = null
    passwordInput.value = ''
  } else {
    // Show keyboard again on failure
    showKeyboard.value = true
  }
}

function handleCancelPassword() {
  showKeyboard.value = false
  showPasswordModal.value = false
  selectedNetwork.value = null
  passwordInput.value = ''
}

function handleHideKeyboard() {
  showKeyboard.value = false
}

// ------------------------------------------------------------
// Bluetooth Actions
// ------------------------------------------------------------
function handleBluetoothClick(device: { address: string; connected: boolean }) {
  if (device.connected) {
    bluetooth.disconnectDevice(device.address)
  } else {
    bluetooth.connectDevice(device.address)
  }
}

// Long press to forget device
function handleDevicePressStart(device: { address: string; name: string }) {
  longPressTimer = setTimeout(() => {
    deviceToForget.value = device
    showForgetModal.value = true
  }, 800)
}

function handleDevicePressEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

async function handleForgetDevice() {
  if (!deviceToForget.value) return

  await bluetooth.forgetDevice(deviceToForget.value.address)
  showForgetModal.value = false
  deviceToForget.value = null
}

function handleCancelForget() {
  showForgetModal.value = false
  deviceToForget.value = null
}

// Keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showForgetModal.value) {
      handleCancelForget()
    } else if (showPasswordModal.value) {
      handleCancelPassword()
    } else if (currentScreen.value !== 'main') {
      navigateBack()
    }
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
onMounted(() => {
  uiStore.setGradientColors(['#1a4a3a', '#2d1f3d'])
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="h-screen w-full flex items-center justify-center overflow-hidden fixed inset-0 rounded-2xl z-50">
    <div class="absolute inset-0 bg-black" />
    <GradientBackground :gradient-state="uiStore.gradientStyle" />

    <div class="relative z-10 w-full h-full overflow-hidden">
      <!-- Main Screen -->
      <div
        class="absolute top-0 left-0 w-full h-full transition-all duration-300 ease-out"
        :class="mainClasses"
        :style="{ visibility: currentScreen === 'main' || isAnimating ? 'visible' : 'hidden' }"
      >
        <div class="w-full max-w-6xl px-6 mx-auto h-full flex items-center">
          <div class="grid grid-cols-2 gap-16 items-center w-full">
            <div class="flex flex-col items-start space-y-8 ml-12">
              <NocturneIcon class="h-12 w-auto" />

              <div class="space-y-4">
                <h2 class="text-5xl text-white tracking-tight font-semibold w-[24rem]">
                  Connection Lost
                </h2>
                <p class="text-[28px] text-white/60 tracking-tight w-[32rem]">
                  Enable Bluetooth Tethering and connect to "Nocturne" in your phone's settings.
                </p>

                <button
                  class="mt-4 bg-white/10 hover:bg-white/20 transition-colors duration-200 rounded-xl px-6 py-3 border border-white/10 focus:outline-none"
                  @click="navigateTo('network')"
                >
                  <span class="text-[28px] font-[560] text-white tracking-tight">
                    Network Settings
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Network Options Screen -->
      <div
        class="absolute top-0 left-0 w-full h-full transition-all duration-300 ease-out"
        :class="networkClasses"
        :style="{ visibility: currentScreen === 'network' || isAnimating ? 'visible' : 'hidden' }"
      >
        <div class="p-12 h-full overflow-y-auto">
          <div class="flex items-center mb-8">
            <button
              class="bg-transparent border-none mr-4 focus:outline-none"
              @click="navigateBack"
            >
              <ChevronLeftIcon class="w-8 h-8 text-white" />
            </button>
            <h2 class="text-[46px] font-[580] text-white tracking-tight">
              Network
            </h2>
          </div>

          <div class="space-y-4">
            <!-- Wi-Fi -->
            <button
              class="flex items-center justify-between w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-colors border border-white/10 focus:outline-none"
              @click="navigateTo('wifi')"
            >
              <div class="flex items-center">
                <div class="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                  <WifiIcon class="w-7 h-7 text-white" />
                </div>
                <div class="ml-4 text-left">
                  <span class="text-[32px] font-[580] text-white tracking-tight block">
                    Wi-Fi
                  </span>
                  <span v-if="wifi.currentNetwork.value" class="text-[20px] text-white/60">
                    {{ wifi.currentNetwork.value.ssid }}
                  </span>
                  <span v-else-if="!wifi.isConnectorAvailable.value" class="text-[20px] text-white/40">
                    Requires Connector
                  </span>
                </div>
              </div>
              <ChevronRightIcon class="w-8 h-8 text-white/60" />
            </button>

            <!-- Bluetooth -->
            <button
              class="flex items-center justify-between w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-colors border border-white/10 focus:outline-none"
              @click="navigateTo('bluetooth')"
            >
              <div class="flex items-center">
                <div class="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                  <BluetoothIcon class="w-7 h-7 text-white" />
                </div>
                <div class="ml-4 text-left">
                  <span class="text-[32px] font-[580] text-white tracking-tight block">
                    Bluetooth
                  </span>
                  <span v-if="bluetooth.devices.value.find(d => d.connected)" class="text-[20px] text-white/60">
                    {{ bluetooth.devices.value.find(d => d.connected)?.name }}
                  </span>
                </div>
              </div>
              <ChevronRightIcon class="w-8 h-8 text-white/60" />
            </button>
          </div>
        </div>
      </div>

      <!-- Wi-Fi / Bluetooth Subpage -->
      <div
        class="absolute top-0 left-0 w-full h-full transition-all duration-300 ease-out"
        :class="subpageClasses"
        :style="{ visibility: (currentScreen === 'wifi' || currentScreen === 'bluetooth') || isAnimating ? 'visible' : 'hidden' }"
      >
        <div class="p-12 h-full overflow-y-auto">
          <div class="flex items-center justify-between mb-8">
            <div class="flex items-center">
              <button
                class="bg-transparent border-none mr-4 focus:outline-none"
                @click="navigateBack"
              >
                <ChevronLeftIcon class="w-8 h-8 text-white" />
              </button>
              <h2 class="text-[46px] font-[580] text-white tracking-tight">
                {{ currentScreen === 'wifi' ? 'Wi-Fi' : 'Bluetooth' }}
              </h2>
            </div>

            <!-- Refresh button -->
            <button
              v-if="currentScreen === 'wifi'"
              class="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
              :disabled="wifi.isScanning.value"
              @click="wifi.refresh()"
            >
              <RefreshIcon
                class="w-6 h-6 text-white/60"
                :class="{ 'animate-spin': wifi.isScanning.value }"
              />
            </button>
            <button
              v-else
              class="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
              :disabled="bluetooth.isLoading.value"
              @click="bluetooth.refresh()"
            >
              <RefreshIcon
                class="w-6 h-6 text-white/60"
                :class="{ 'animate-spin': bluetooth.isLoading.value }"
              />
            </button>
          </div>

          <!-- Wi-Fi Content -->
          <div v-if="currentScreen === 'wifi'" class="space-y-6">
            <!-- Loading state -->
            <div v-if="wifi.isLoading.value" class="space-y-4">
              <div class="h-24 bg-white/10 rounded-xl animate-pulse" />
              <div class="h-24 bg-white/10 rounded-xl animate-pulse" />
            </div>

            <!-- Connector not available -->
            <div v-else-if="!wifi.isConnectorAvailable.value" class="text-center py-12">
              <WifiIcon class="w-12 h-12 text-white/40 mx-auto mb-4" />
              <p class="text-[32px] font-[580] text-white">Wi-Fi Unavailable</p>
              <p class="text-[24px] text-white/60 mt-2">
                Wi-Fi requires Nocturne Connector on a Raspberry Pi.
              </p>
            </div>

            <template v-else>
              <!-- Current Network -->
              <div v-if="wifi.currentNetwork.value" class="mb-6">
                <h3 class="text-[28px] font-[560] text-white/60 mb-4">Current Network</h3>
                <div class="p-4 bg-white/10 rounded-xl border border-white/10">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      <WifiIcon class="w-6 h-6 text-white mr-4" />
                      <span class="text-[28px] font-[560] text-white">
                        {{ wifi.currentNetwork.value.ssid }}
                      </span>
                    </div>
                    <span class="text-[20px] text-green-400">Connected</span>
                  </div>
                </div>
              </div>

              <!-- Available Networks -->
              <div v-if="wifi.availableNetworks.value.length > 0">
                <h3 class="text-[28px] font-[560] text-white/60 mb-4">Available Networks</h3>
                <div class="space-y-4">
                  <div
                    v-for="network in wifi.availableNetworks.value.filter(n => n.ssid !== wifi.currentNetwork.value?.ssid)"
                    :key="network.bssid || network.ssid"
                    class="p-4 bg-white/10 rounded-xl border border-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                    @click="handleNetworkClick(network)"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center">
                        <WifiIcon class="w-6 h-6 text-white mr-4" />
                        <span class="text-[28px] font-[560] text-white">
                          {{ network.ssid }}
                        </span>
                      </div>
                      <div class="flex items-center space-x-2">
                        <span v-if="wifi.hasPasswordSecurity(network.flags)" class="text-[18px] text-white/40">
                          🔒
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- No networks -->
              <div v-if="!wifi.isScanning.value && wifi.availableNetworks.value.length === 0" class="text-center py-12">
                <WifiIcon class="w-12 h-12 text-white/40 mx-auto mb-4" />
                <p class="text-[28px] text-white/60">No networks found</p>
                <button
                  class="mt-4 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white text-[24px] focus:outline-none"
                  @click="wifi.scanNetworks()"
                >
                  Scan for networks
                </button>
              </div>
            </template>
          </div>

          <!-- Bluetooth Content -->
          <div v-if="currentScreen === 'bluetooth'" class="space-y-6">
            <!-- Loading state -->
            <div v-if="bluetooth.isLoading.value && bluetooth.devices.value.length === 0" class="space-y-4">
              <div class="h-24 bg-white/10 rounded-xl animate-pulse" />
              <div class="h-24 bg-white/10 rounded-xl animate-pulse" />
            </div>

            <!-- Devices list -->
            <template v-else>
              <div v-if="bluetooth.devices.value.length > 0" class="space-y-4">
                <div
                  v-for="device in bluetooth.devices.value"
                  :key="device.address"
                  class="p-4 bg-white/10 rounded-xl border border-white/10 select-none"
                  @mousedown="handleDevicePressStart({ address: device.address, name: device.name || device.alias || 'Unknown Device' })"
                  @mouseup="handleDevicePressEnd"
                  @mouseleave="handleDevicePressEnd"
                  @touchstart="handleDevicePressStart({ address: device.address, name: device.name || device.alias || 'Unknown Device' })"
                  @touchend="handleDevicePressEnd"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      <BluetoothIcon class="w-6 h-6 text-white mr-4" />
                      <div>
                        <span class="text-[28px] font-[560] text-white block">
                          {{ device.name || device.alias || 'Unknown Device' }}
                        </span>
                        <span v-if="device.connected" class="text-[20px] text-white/60">
                          Connected
                        </span>
                      </div>
                    </div>
                    <button
                      class="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white text-[24px] transition-colors focus:outline-none"
                      :disabled="bluetooth.isConnecting.value"
                      @click.stop="handleBluetoothClick(device)"
                    >
                      {{ device.connected ? 'Disconnect' : 'Connect' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- No devices -->
              <div v-else class="text-center py-12">
                <BluetoothIcon class="w-12 h-12 text-white/40 mx-auto mb-4" />
                <p class="text-[32px] font-[580] text-white">No Devices Found</p>
                <p class="text-[24px] text-white/60 mt-2">
                  Connect to "Nocturne" in your phone's Bluetooth settings.
                </p>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Password Modal -->
    <Teleport to="body">
      <div
        v-if="showPasswordModal"
        class="fixed inset-0 z-[100] flex items-start justify-center pt-8"
      >
        <div class="absolute inset-0 bg-black/90" @click="handleCancelPassword" />
        <div class="relative bg-[#1A1A1A] rounded-2xl p-6 w-full max-w-[600px] mx-4 shadow-lg border border-white/10">
          <h3 class="text-[28px] font-[580] text-white tracking-tight mb-6">
            Connect to {{ selectedNetwork?.ssid }}
          </h3>

          <input
            v-model="passwordInput"
            type="text"
            class="w-full bg-white/10 rounded-xl px-6 py-4 text-[24px] text-white placeholder-white/40 border border-white/10 mb-6 focus:outline-none"
            placeholder="Password"
            @focus="showKeyboard = true"
            @keyup.enter="handlePasswordSubmit"
          />

          <div class="flex justify-end gap-4">
            <button
              type="button"
              class="px-6 py-3 text-[24px] font-[560] text-white/60 hover:text-white transition-colors bg-transparent"
              @click="handleCancelPassword"
            >
              Cancel
            </button>
            <button
              type="button"
              class="bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-6 py-3 text-[24px] font-[560] text-white disabled:opacity-50"
              :disabled="wifi.isConnecting.value || !passwordInput"
              @click="handlePasswordSubmit"
            >
              {{ wifi.isConnecting.value ? 'Connecting...' : 'Connect' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Virtual Keyboard -->
      <VirtualKeyboard
        v-model="passwordInput"
        :visible="showKeyboard && showPasswordModal"
        @enter="handlePasswordSubmit"
        @hide="handleHideKeyboard"
      />

      <!-- Forget Device Modal -->
      <div
        v-if="showForgetModal"
        class="fixed inset-0 z-[100] flex items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/60" @click="handleCancelForget" />
        <div class="relative bg-[#161616] rounded-2xl pt-5 w-full max-w-md mx-4 overflow-hidden">
          <div class="text-center px-6">
            <h3 class="text-[36px] font-[560] text-white">
              Forget Device?
            </h3>
            <p class="text-[28px] text-white/60 mt-2">
              Pair this device again to use it.
            </p>
          </div>

          <div class="flex mt-5 border-t border-white/10">
            <button
              class="flex-1 py-4 text-[28px] font-[560] text-blue-400 hover:bg-white/5 focus:outline-none border-r border-white/10"
              @click="handleCancelForget"
            >
              Cancel
            </button>
            <button
              class="flex-1 py-4 text-[28px] font-[560] text-red-500 hover:bg-white/5 focus:outline-none"
              @click="handleForgetDevice"
            >
              Forget
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Connection Status Indicator -->
    <div class="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
      <div
        class="w-3 h-3 rounded-full"
        :class="network.isConnected.value ? 'bg-green-500' : 'bg-red-500'"
      />
      <span class="text-[20px] text-white/80">
        {{ network.isConnected.value ? 'Connected' : 'No Internet' }}
      </span>
    </div>
  </div>
</template>
