import { createRouter, createWebHistory } from 'vue-router'
import { useBootStore } from '@/stores/boot'
import { useAuthStore } from '@/stores/auth'
import { useNetwork } from '@/composables/useNetwork'

function isPublicRoute(path: string): boolean {
  return path.startsWith('/auth/') || path.startsWith('/test')
}

// Routes accessible when offline and unauthenticated (to reach Settings > Wi-Fi)
function isOfflineAllowedRoute(path: string): boolean {
  return path === '/radio' || path === '/settings'
}

const routes = [
  { path: '/', redirect: '/radio' },

  // Auth routes
  { path: '/auth/login', component: () => import('@/views/auth/login.vue') },
  { path: '/auth/callback', component: () => import('@/views/auth/callback.vue') },
  { path: '/auth/network', component: () => import('@/views/auth/network.vue') },

  // Dev/Test routes
  { path: '/test', component: () => import('@/views/test/index.vue') },

  // Main sections (button 1-4 navigation)
  { path: '/recents', component: () => import('@/views/recents/index.vue') },
  { path: '/library', component: () => import('@/views/library/index.vue') },
  { path: '/artists', component: () => import('@/views/artists/index.vue') },
  { path: '/podcasts', component: () => import('@/views/podcasts/index.vue') },
  { path: '/radio', component: () => import('@/views/radio/index.vue') },
  { path: '/settings', component: () => import('@/views/settings/index.vue') },
  { path: '/now-playing', component: () => import('@/views/now-playing/index.vue') },
  { path: '/queue', component: () => import('@/views/queue/index.vue') },
  { path: '/lock', component: () => import('@/views/lock/index.vue') },

  // Detail views
  { path: '/album/:id', component: () => import('@/views/album/index.vue') },
  { path: '/artist/:id', component: () => import('@/views/artist/index.vue') },
  { path: '/show/:id', component: () => import('@/views/show/index.vue') },
  { path: '/liked-songs', component: () => import('@/views/liked-songs/index.vue') },
  { path: '/playlist/:id', component: () => import('@/views/playlist/index.vue') },

  // Catch-all redirect for removed/invalid routes
  { path: '/:pathMatch(.*)*', redirect: '/radio' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const bootStore = useBootStore()
  const authStore = useAuthStore()

  // During loading screen, allow all navigation
  if (!bootStore.loadingComplete) {
    return true
  }

  const isAuth = authStore.isAuthenticated

  // Authenticated user visiting login → redirect to recents
  if (isAuth && to.path === '/auth/login') {
    return '/radio'
  }

  // Unauthenticated user visiting protected route → redirect to login
  // Exception: allow /radio and /settings when offline so user can reach Wi-Fi settings
  if (!isAuth && !isPublicRoute(to.path)) {
    const network = useNetwork()
    if (network.isConnected.value === false && isOfflineAllowedRoute(to.path)) {
      return true
    }
    return '/auth/login'
  }

  return true
})
