<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'

// Barre de scène : remonte en permanence l'information la plus critique du MJ — « qu'est-ce
// que les joueurs voient en ce moment ». Elle remplace la colonne droite de 320 px
// (AdminTvSidebar), qui disparaissait sous 1100 px : l'état de diffusion était donc invisible
// exactement sur les gabarits où l'espace manque. Voir docs/refonte-ui.md §4.3.
const props = defineProps({
  tvModes:           { type: Array, required: true },
  tvMode:            { type: String, default: 'lobby' },
  hasActiveSession:  { type: Boolean, default: false },
  activeTvModeLabel: { type: String, default: '' },
  // Précision entre parenthèses (ex. type de fiche en mode « contenu ») — vide sinon.
  activeTvModeDetail:{ type: String, default: '' },
  combatRound:       { type: Number, default: 0 },
})

const emit = defineEmits(['set-mode', 'adjust-round', 'reset-round'])

const pickerOpen = ref(false)
const rootRef = ref(null)

const readyCount = computed(() => props.tvModes.filter(m => m.ready).length)

// Les noms de fiches peuvent être longs (« Baguette des merveilles ») : le libellé est
// tronqué en CSS, le titre complet reste accessible au survol.
const fullLiveLabel = computed(() => (
  props.activeTvModeDetail
    ? `${props.activeTvModeLabel} (${props.activeTvModeDetail})`
    : props.activeTvModeLabel
))

function choose(mode) {
  if (!mode.ready) return
  emit('set-mode', mode.key)
  pickerOpen.value = false
}

function onDocClick(e) {
  if (!pickerOpen.value) return
  if (rootRef.value && !rootRef.value.contains(e.target)) pickerOpen.value = false
}
function onKey(e) {
  if (e.key === 'Escape') pickerOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="rootRef" class="scene-bar" :class="{ 'scene-bar-idle': !hasActiveSession }">
    <template v-if="hasActiveSession">
      <div class="scene-live" data-testid="scene-live">
        <span class="live-dot" aria-hidden="true" />
        <span class="scene-live-text">
          <span class="scene-live-mode" :title="fullLiveLabel">
            <span class="scene-live-name">{{ activeTvModeLabel }}</span>
            <span v-if="activeTvModeDetail" class="scene-live-detail">({{ activeTvModeDetail }})</span>
          </span>
          <small>Diffusé sur la TV</small>
        </span>
      </div>

      <div class="scene-picker-wrap">
        <button
          type="button"
          class="scene-change-btn"
          :aria-expanded="pickerOpen"
          aria-haspopup="true"
          data-testid="scene-change-mode"
          @click="pickerOpen = !pickerOpen"
        >
          Changer
          <AppIcon :icon="pickerOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="0.8em" />
          <span class="scene-ready-count">{{ readyCount }}</span>
        </button>

        <!-- Les boutons de mode conservent leurs data-testid `tv-mode-btn-<key>` : ils sont
             la cible directe de AdminPage.setTvMode() dans une quinzaine de specs e2e.
             v-show et non v-if : plusieurs specs (19-map, 14-tv-modes) vérifient l'état
             `enabled`/`active` d'un mode SANS ouvrir le sélecteur — les boutons doivent donc
             rester dans le DOM quand il est fermé. -->
        <Transition name="scene-pop">
          <div v-show="pickerOpen" class="scene-picker" role="menu">
            <button
              v-for="mode in tvModes"
              :key="mode.key"
              type="button"
              class="scene-mode"
              :class="{ active: tvMode === mode.key, disabled: !mode.ready }"
              :disabled="!mode.ready"
              :data-testid="`tv-mode-btn-${mode.key}`"
              role="menuitem"
              @click="choose(mode)"
            >
              <span class="scene-mode-top">
                <span class="scene-mode-label">{{ mode.label }}</span>
                <span class="scene-ready" :class="mode.ready ? 'ready' : 'not-ready'">
                  {{ mode.ready ? 'prêt' : 'non prêt' }}
                </span>
              </span>
              <span class="scene-mode-hint">{{ mode.hint }}</span>
            </button>
          </div>
        </Transition>
      </div>

      <div class="scene-round">
        <button
          class="round-btn"
          :disabled="combatRound <= 0"
          title="Round précédent"
          @click="emit('adjust-round', -1)"
        >−</button>
        <span class="scene-round-text">
          Round <b>{{ combatRound }}</b>
        </span>
        <button class="round-btn" title="Round suivant" @click="emit('adjust-round', 1)">+</button>
        <button
          class="round-btn round-btn-reset"
          title="Réinitialiser le round"
          @click="emit('reset-round')"
        >
          <AppIcon icon="lucide:rotate-ccw" size="0.75em" />
        </button>
      </div>
    </template>

    <p v-else class="scene-idle-msg">
      <AppIcon icon="lucide:monitor-off" size="0.9em" />
      Aucune session active — sélectionnez-en une pour piloter l'écran TV.
    </p>
  </div>
</template>

<style scoped>
.scene-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: var(--gradient-panel);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.scene-bar-idle { justify-content: flex-start; }

/* ── Indicateur « à l'écran » ─────────────────────────────────────────────── */
.scene-live {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: var(--radius-sm);
  min-height: var(--touch-min);
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-danger);
  flex-shrink: 0;
  animation: dotPulse 1.6s ease-in-out infinite;
}
.scene-live-text { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.scene-live-mode {
  display: flex;
  align-items: baseline;
  gap: 0.3em;
  max-width: 32ch;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-gold-bright);
}
.scene-live-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-live-detail {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--color-text-dim);
}
.scene-live-text small {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
}

/* ── Sélecteur de mode ────────────────────────────────────────────────────── */
.scene-picker-wrap { position: relative; }
.scene-change-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--color-text);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  min-height: var(--touch-min);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}
.scene-change-btn:hover { border-color: var(--color-gold-dark); background: var(--surface-hover); }
.scene-ready-count {
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  color: var(--color-success);
  font-size: var(--text-2xs);
  font-weight: 700;
}

.scene-picker {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0;
  z-index: var(--z-dropdown);
  width: 300px;
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--gradient-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-strong);
}
.scene-mode {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--surface-raised);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color var(--dur-fast);
}
.scene-mode:hover:not(:disabled) { border-color: var(--color-gold-dark); }
.scene-mode.active { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.scene-mode.disabled, .scene-mode:disabled { opacity: 0.55; cursor: not-allowed; }
.scene-mode-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.scene-mode-label { font-size: var(--text-sm); font-weight: 600; }
.scene-mode-hint { font-size: var(--text-xs); color: var(--color-text-dim); }
.scene-ready {
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: var(--radius-full);
  padding: 0.1rem var(--space-2);
  border: 1px solid transparent;
  white-space: nowrap;
}
.scene-ready.ready { color: var(--color-success); background: var(--color-success-soft); border-color: var(--color-success-border); }
.scene-ready.not-ready { color: var(--color-text-dim); background: var(--surface-ghost); border-color: var(--color-border); }

/* ── Round de combat ──────────────────────────────────────────────────────── */
.scene-round {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  min-height: var(--touch-min);
}
.scene-round-text { font-size: var(--text-sm); color: var(--color-text-dim); white-space: nowrap; }
.scene-round-text b {
  color: var(--color-gold-bright);
  font-size: var(--text-md);
  font-variant-numeric: tabular-nums;
}
.round-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: var(--radius-xs);
  color: var(--color-text-on-accent);
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
}
.round-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.round-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.round-btn-reset {
  border-color: var(--color-danger-border);
  color: var(--color-danger);
  background: var(--gradient-danger-action);
}

.scene-idle-msg {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
}

/* noinspection CssUnusedSymbol */
.scene-pop-enter-active { transition: opacity var(--dur-fast), transform var(--dur-fast); }
/* noinspection CssUnusedSymbol */
.scene-pop-leave-active { transition: opacity var(--dur-fast); }
/* noinspection CssUnusedSymbol */
.scene-pop-enter-from { opacity: 0; transform: translateY(-4px); }
/* noinspection CssUnusedSymbol */
.scene-pop-leave-to { opacity: 0; }

@media (max-width: 767px) {
  .scene-bar { padding: var(--space-2) var(--space-3); gap: var(--space-2); }
  .scene-picker { width: min(300px, calc(100vw - 2 * var(--space-4))); }
}
</style>
