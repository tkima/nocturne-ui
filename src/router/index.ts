import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/recents' },

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
  { path: '/radio', component: () => import('@/views/radio/index.vue') },
  { path: '/podcasts', component: () => import('@/views/podcasts/index.vue') },
  { path: '/settings', component: () => import('@/views/settings/index.vue') },
  { path: '/now-playing', component: () => import('@/views/now-playing/index.vue') },
  { path: '/lock', component: () => import('@/views/lock/index.vue') },

  // Detail views
  { path: '/album/:id', component: () => import('@/views/album/index.vue') },
  { path: '/artist/:id', component: () => import('@/views/artist/index.vue') },
  { path: '/show/:id', component: () => import('@/views/show/index.vue') },

  // Catch-all redirect for removed/invalid routes
  { path: '/:pathMatch(.*)*', redirect: '/recents' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
