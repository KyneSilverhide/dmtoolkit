import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AdminView from '../views/AdminView.vue'
import PlayerJoinView from '../views/PlayerJoinView.vue'
import PlayerInboxView from '../views/PlayerInboxView.vue'
import TvView from '../views/TvView.vue'
import { authStore } from '../stores/auth.js'
import { isTokenExpired } from '../utils/jwt.js'
import { resetSocket } from '../socket.js'

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', redirect: '/' },
  {
    path: '/admin/:tab?',
    name: 'admin',
    component: AdminView,
    meta: { requiresAuth: true }
  },
  { path: '/join/:code?', component: PlayerJoinView },
  { path: '/view/:code/:tab?', name: 'player-view', component: PlayerInboxView },
  { path: '/player/:tab?', name: 'player-self', component: PlayerInboxView },
  { path: '/tv/:code', component: TvView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (!to.meta.requiresAuth) return
  if (!authStore.token) return '/'
  if (isTokenExpired(authStore.token)) {
    authStore.logout()
    resetSocket()
    return { path: '/', query: { expired: '1' } }
  }
})

export default router
