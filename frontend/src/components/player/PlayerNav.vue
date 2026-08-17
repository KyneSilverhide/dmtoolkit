<script setup>
import AppIcon from '../AppIcon.vue'

// Source unique de la navigation joueur. Avant la refonte, la même liste d'onglets était
// écrite deux fois dans PlayerInboxView (une colonne `.sidebar-nav` desktop + une barre
// `.tab-bar` mobile) : ~280 lignes dupliquées, deux éléments portant le même
// `data-testid="player-tab-<key>"`, d'où les `.filter({ visible: true })` dans les specs e2e.
// Ici : UNE seule instance, positionnée en rail à gauche ≥1024 px et en barre basse en
// dessous — il n'y a donc plus qu'un seul nœud par onglet dans le DOM.
defineProps({
  items:     { type: Array, required: true },
  activeKey: { type: String, default: '' },
})

const emit = defineEmits(['select'])
</script>

<template>
  <nav class="player-nav" aria-label="Navigation principale">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="nav-item"
      :class="{ active: item.key === activeKey }"
      :aria-label="item.label"
      :aria-current="item.key === activeKey ? 'page' : undefined"
      :data-testid="`player-tab-${item.testid || item.key}`"
      @click="emit('select', item)"
    >
      <!-- `tab-icon` / `tab-icon-notify` / `tab-badge*` : noms de classe conservés tels
           quels, plusieurs specs e2e (09-messages, 12-votes, 13-merchant) les ciblent
           directement sous le `data-testid` de l'onglet. -->
      <span class="tab-icon" :class="{ 'tab-icon-notify': item.notify }">
        <AppIcon :icon="item.icon" size="1.35rem" />
      </span>
      <span class="nav-label">{{ item.label }}</span>
      <span
        v-if="item.badge"
        class="tab-badge"
        :class="item.badgeTone === 'pulse' ? 'tab-badge-pulse' : 'tab-badge-urgent'"
      >{{ item.badge }}</span>
    </button>
  </nav>
</template>

<style scoped>
/* ── Barre basse (mobile / tablette) ──────────────────────────────────────── */
.player-nav {
  order: 2; /* poussée sous .inbox-main, qui reste en order: 1 */
  display: flex;
  overflow-x: auto;
  background: var(--player-header-bg);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.player-nav::-webkit-scrollbar { display: none; }

.nav-item {
  flex: 1;
  flex-shrink: 0;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  padding: var(--space-2) var(--space-1);
  min-height: 56px;
  background: none;
  border: none;
  border-left: 3px solid transparent; /* neutre ici, sert au rail desktop */
  color: var(--color-text-dim);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  cursor: pointer;
  transition: color var(--dur-base), background var(--dur-fast);
  position: relative;
  touch-action: manipulation;
}
.nav-item:hover:not(:disabled) { color: var(--color-parchment); }
.nav-item.active { color: var(--color-gold-bright); }
.nav-item.active::before {
  content: '';
  position: absolute;
  top: 0; left: 15%; right: 15%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-gold-bright), transparent);
  border-radius: 0 0 2px 2px;
}
.nav-item:disabled { opacity: 0.3; cursor: not-allowed; }

.tab-icon {
  font-size: 1.35rem;
  line-height: 1;
  display: flex;
  align-items: center;
  transition: transform var(--dur-base), filter var(--dur-base);
}
.tab-icon-notify {
  animation: iconShake 0.6s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 6px var(--player-danger-text));
}
@keyframes iconShake {
  0%   { transform: rotate(-8deg) scale(1.1); }
  100% { transform: rotate(8deg) scale(1.2); }
}

.nav-label {
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.tab-badge {
  position: absolute;
  top: 4px; right: calc(50% - 20px);
  min-width: 18px; height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--color-invariant-white);
  display: flex; align-items: center; justify-content: center;
}
.tab-badge-urgent {
  background: var(--player-danger-text);
  box-shadow: 0 0 8px var(--player-danger-text), 0 0 16px var(--player-danger-bg);
  animation: urgentPulse 1s ease-in-out infinite;
}
.tab-badge-pulse {
  background: var(--player-warning-text);
  box-shadow: 0 0 8px var(--player-warning-text), 0 0 16px var(--player-warning-bg);
  animation: urgentPulse 0.8s ease-in-out infinite;
}
@keyframes urgentPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.35); opacity: 0.85; }
}

/* Sous 380 px, l'icône seule : 5 entrées de base + jusqu'à 3 contextuelles tiennent
   alors sans défilement horizontal. */
@media (max-width: 380px) {
  .nav-label { display: none; }
  .nav-item { min-height: 52px; padding: var(--space-3) 0.2rem; }
}

/* ── Rail latéral (desktop ≥1024 px) ──────────────────────────────────────── */
@media (min-width: 1024px) {
  .player-nav {
    order: 0;
    flex-direction: column;
    width: 160px;
    flex-shrink: 0;
    overflow-x: visible;
    overflow-y: auto;
    border-top: none;
    border-right: 1px solid var(--color-border);
    padding: var(--space-2) var(--space-2) var(--space-2) 0;
    gap: 0.1rem;
  }
  .nav-item {
    flex: 0 0 auto;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-min);
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-3);
    border-radius: 0 8px 8px 0;
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    text-align: left;
  }
  .nav-item:hover:not(:disabled) { background: var(--surface-raised); }
  .nav-item.active {
    border-left-color: var(--color-gold-bright);
    background: var(--player-gold-bg);
  }
  .nav-item.active::before { content: none; }
  .nav-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: none;
    letter-spacing: 0.04em;
    font-size: var(--text-sm);
  }
  .tab-badge {
    position: static;
    margin-left: auto;
  }
}
</style>
