import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AdminView from '../views/AdminView.vue'
import PlayerJoinView from '../views/PlayerJoinView.vue'
import PlayerInboxView from '../views/PlayerInboxView.vue'
import TvView from '../views/TvView.vue'
import { authStore } from '../stores/auth.js'

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', redirect: '/' },
  {
    path: '/admin',
    component: AdminView,
    meta: { requiresAuth: true }
  },
  { path: '/join/:code?', component: PlayerJoinView },
  { path: '/view/:code', component: PlayerInboxView },
  { path: '/player', component: PlayerInboxView },
  { path: '/tv/:code', component: TvView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authStore.token) {
    return '/login'
  }
})

export default router
