<script setup>
import AppIcon from '../AppIcon.vue'

defineProps({
  tvModes:        { type: Array, required: true },
  tvMode:         { type: String, default: 'lobby' },
  hasActiveSession:{ type: Boolean, default: false },
  activeTvModeLabel:{ type: String, default: '' },
})

const emit = defineEmits(['set-mode'])
</script>

<template>
  <aside class="tv-sidebar">
    <h2 class="tv-sidebar-title"><AppIcon icon="lucide:monitor" size="1em" /> Diffusion TV</h2>
    <p class="tv-sidebar-subtitle">
      Mode actuel : <span class="tv-mode-current">{{ activeTvModeLabel }}</span>
    </p>
    <div v-if="hasActiveSession" class="tv-mode-list">
      <button
        v-for="mode in tvModes"
        :key="mode.key"
        class="tv-mode-btn"
        :class="{ active: tvMode === mode.key, disabled: !mode.ready }"
        :disabled="!mode.ready"
        :data-testid="`tv-mode-btn-${mode.key}`"
        @click="emit('set-mode', mode.key)"
      >
        <span class="tv-mode-top">
          <span class="tv-mode-label">{{ mode.label }}</span>
          <span class="tv-ready-badge" :class="mode.ready ? 'ready' : 'not-ready'">
            {{ mode.ready ? 'prêt' : 'non prêt' }}
          </span>
        </span>
        <span class="tv-mode-hint">{{ mode.hint }}</span>
      </button>
    </div>
    <p v-else class="no-session-msg">Sélectionnez une session pour piloter l'écran TV.</p>
  </aside>
</template>

<style scoped>
.tv-sidebar {
  position: sticky;
  top: 1rem;
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tv-sidebar-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}
.tv-sidebar-subtitle {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.72rem;
}
.tv-mode-current { color: var(--color-gold-bright); font-weight: 600; }
.tv-mode-list { display: flex; flex-direction: column; gap: 0.35rem; }
.tv-mode-btn {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--surface-raised);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.18s;
}
.tv-mode-btn:hover { border-color: var(--color-gold-dark); }
.tv-mode-btn.active { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.tv-mode-label { font-size: 0.75rem; font-weight: 600; }
.tv-mode-hint { font-size: 0.72rem; color: var(--color-text-dim); }
.tv-mode-top { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
.tv-ready-badge {
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  border: 1px solid transparent;
}
.tv-ready-badge.ready { color: var(--color-success); background: var(--color-success-soft); border-color: var(--color-success-border); }
.tv-ready-badge.not-ready { color: var(--color-text-dim); background: var(--surface-ghost); border-color: var(--color-border); }
.tv-mode-btn.disabled, .tv-mode-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.no-session-msg { font-size: 0.88rem; color: var(--color-text-dim); padding: 1rem 0; }
</style>
