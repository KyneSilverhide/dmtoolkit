<script setup>
import { computed } from 'vue'
import { sessionStore } from '@/stores/session.js'

const emit = defineEmits(['select-session'])

const activeSessionId = computed({
  get: () => sessionStore.activeSession?.id ? String(sessionStore.activeSession.id) : '',
  set: (val) => {
    const found = sessionStore.sessions.find(s => String(s.id) === String(val))
    if (found) emit('select-session', found)
  },
})
</script>

<template>
  <section class="session-context-bar">
    <label class="bar-label">Session active</label>
    <select v-model="activeSessionId" class="bar-select">
      <option value="" disabled>Sélectionner une session…</option>
      <option
          v-for="s in sessionStore.sessions"
          :key="s.id"
          :value="String(s.id)"
          :disabled="s.status !== 'active'"
      >
        {{ s.name }} ({{ s.status }})
      </option>
    </select>

    <div v-if="sessionStore.activeSession" class="active-chip">
      {{ sessionStore.activeSession.name }} · {{ sessionStore.activeSession.code }}
    </div>
  </section>
</template>

<style scoped>
.session-context-bar { display: flex; gap: 0.6rem; align-items: center; margin: 0.8rem 0; }
.bar-label { font-family: var(--font-heading), sans-serif; color: var(--color-text-dim); font-size: 0.7rem; text-transform: uppercase; }
.bar-select { min-width: 260px; }
.active-chip { font-family: var(--font-heading), sans-serif; color: var(--color-gold-bright); }
</style>
