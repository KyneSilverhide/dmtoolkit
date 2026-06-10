<script setup>
import AppIcon from '../AppIcon.vue'

defineProps({
  toasts: { type: Array, default: () => [] },
})

const emit = defineEmits(['dismiss', 'pause', 'resume'])
</script>

<template>
  <TransitionGroup name="roll-toast" tag="div" class="player-roll-toasts">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="player-roll-toast"
      :class="{ hidden: toast.hidden }"
      data-testid="player-roll-toast"
      @click="emit('dismiss', toast.id)"
      @mouseenter="emit('pause', toast.id)"
      @mouseleave="emit('resume', toast.id)"
    >
      <span class="prt-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.5rem" /></span>
      <div class="prt-body">
        <span class="prt-name">{{ toast.playerName }}</span>
        <span class="prt-label">
          {{ toast.diceCount }}d{{ toast.diceType }}
          <template v-if="toast.modifier !== 0">{{ toast.modifier > 0 ? '+' : '' }}{{ toast.modifier }}</template>
          <span v-if="toast.rollType !== 'normal'" class="prt-type">
            {{ toast.rollType === 'advantage' ? ' (avantage)' : ' (désavantage)' }}
          </span>
        </span>
        <span v-if="toast.hidden" class="prt-result hidden-result">
          <AppIcon icon="lucide:eye-off" size="0.85em" /> Jet caché — {{ toast.total }}
        </span>
        <span v-else class="prt-result">= {{ toast.total }}</span>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.player-roll-toasts {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 900;
  pointer-events: none;
}
.player-roll-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--color-gold-dark);
  background: var(--gradient-panel-soft);
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  cursor: pointer;
  min-width: 200px;
  max-width: 300px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.player-roll-toast:hover { border-color: var(--color-gold-bright); box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.player-roll-toast.hidden { border-color: var(--color-info-border); }
/* noinspection CssUnusedSymbol */
.roll-toast-enter-active, .roll-toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
/* noinspection CssUnusedSymbol */
.roll-toast-enter-from, .roll-toast-leave-to { opacity: 0; transform: translateX(30px); }
.prt-icon { font-size: 1.4rem; flex-shrink: 0; }
.prt-body { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.prt-name { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-gold-dark); }
.prt-label { font-size: 0.72rem; color: var(--color-text-dim); }
.prt-type { font-style: italic; }
.prt-result { font-size: 1.1rem; font-weight: 700; color: var(--color-gold-bright); }
.prt-result.hidden-result { color: var(--color-info-bright); font-size: 0.85rem; }
</style>
