<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { applyStoredTheme, applyTheme, getLastUsedTheme, applyStoredDensity } from './utils/themePreferences.js'

const route = useRoute()

const themeScope = computed(() => {
  const path = route.path || '/'
  if (path === '/') return null
  if (path.startsWith('/admin') || path.startsWith('/login')) return 'admin'
  if (path.startsWith('/tv/')) return 'tv'
  if (path.startsWith('/join') || path.startsWith('/view/') || path.startsWith('/player')) return 'player'
  return 'player'
})

watch(themeScope, (scope) => {
  if (scope === null) {
    applyTheme(getLastUsedTheme('dark'))
  } else {
    applyStoredTheme(scope, 'dark')
  }
  // La densité suit la même portée que le thème. Sur l'accueil (scope null) on garde le
  // compact par défaut : c'est un écran de passage, sans réglage propre.
  applyStoredDensity(scope || 'admin', 'compact')
}, { immediate: true })
</script>

<template>
  <RouterView />
</template>
