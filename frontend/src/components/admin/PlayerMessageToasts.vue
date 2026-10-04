<script setup>
import AppIcon from '../AppIcon.vue'

defineProps({
  toasts: { type: Array, default: () => [] },
})

const emit = defineEmits(['open', 'dismiss'])

function preview(content) {
  const text = String(content || '')
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}
</script>

<template>
  <!-- role="status" + aria-live : un message joueur arrive par socket, sans action du MJ — le
       conteneur est monté en permanence par AdminView (sans v-if), condition pour qu'un lecteur
       d'écran annonce quoi que ce soit. Cartes volontairement grandes et persistantes (pas d'auto-
       dismiss) : un joueur peut écrire en secret au MJ sans avoir été contacté, le MJ ne doit
       jamais le rater. Composant distinct de PlayerRollToasts, voir CLAUDE.md. -->
  <TransitionGroup
    name="msg-toast"
    tag="div"
    class="player-message-toasts"
    role="status"
    aria-live="assertive"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="player-message-toast"
      data-testid="player-message-toast"
    >
      <span class="pmt-icon"><AppIcon icon="lucide:mail" size="2rem" /></span>
      <div class="pmt-body">
        <span class="pmt-kicker">
          Message secret
          <span v-if="toast.count > 1" class="pmt-count">{{ toast.count }} nouveaux</span>
        </span>
        <span class="pmt-name">{{ toast.playerName }}</span>
        <span class="pmt-content">{{ preview(toast.content) }}</span>
        <div class="pmt-actions">
          <button type="button" class="pmt-open" data-testid="player-message-toast-open" @click="emit('open', toast)">
            Ouvrir la conversation
          </button>
          <button type="button" class="pmt-later" @click="emit('dismiss', toast.id)">Plus tard</button>
        </div>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.player-message-toasts {
  position: fixed;
  top: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: min(32rem, calc(100vw - 2rem));
  z-index: var(--z-toast, 900);
  pointer-events: none;
}
.player-message-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: 14px;
  border: 2px solid var(--color-gold-bright);
  background: var(--gradient-panel-soft);
  box-shadow: var(--shadow-medium);
  animation: pmt-pulse 1.6s ease-in-out 3;
}
@keyframes pmt-pulse {
  0%, 100% { box-shadow: var(--shadow-medium); }
  50% { box-shadow: 0 0 0 6px var(--color-gold-dark), var(--shadow-medium); }
}
@media (prefers-reduced-motion: reduce) {
  .player-message-toast { animation: none; }
}
/* noinspection CssUnusedSymbol */
.msg-toast-enter-active, .msg-toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
/* noinspection CssUnusedSymbol */
.msg-toast-enter-from, .msg-toast-leave-to { opacity: 0; transform: translateY(-20px); }
.pmt-icon { flex-shrink: 0; color: var(--color-gold-bright); line-height: 1; }
.pmt-body { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1; }
.pmt-kicker {
  display: flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm); letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--color-gold-dark);
}
.pmt-count {
  background: var(--color-gold-dark); color: var(--color-bg);
  border-radius: 10px; padding: 0 var(--space-2); letter-spacing: 0.05em; font-weight: 700;
}
.pmt-name { font-family: var(--font-heading), sans-serif; font-size: var(--text-lg, 1.15rem); color: var(--color-parchment); }
.pmt-content { font-family: var(--font-body), sans-serif; font-size: var(--text-md); color: var(--color-text-dim); word-break: break-word; white-space: pre-wrap; }
.pmt-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.pmt-open {
  padding: var(--space-2) var(--space-4);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark); border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif; font-size: var(--text-sm);
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.pmt-later {
  padding: var(--space-2) var(--space-3);
  background: none; border: 1px solid var(--color-border); border-radius: 8px;
  color: var(--color-text-dim); font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm); cursor: pointer;
}
.pmt-later:hover { color: var(--color-gold-bright); border-color: var(--color-gold-dark); }
</style>
