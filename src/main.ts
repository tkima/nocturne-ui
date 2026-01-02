import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import './index.css'
import App from './App.vue'
import { initDebugFromSettings } from './utils/debug'

// Initialize debug early from env variable so boot logs are captured
const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_ENABLED === 'true'
initDebugFromSettings(() => DEBUG_ENABLED)

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
