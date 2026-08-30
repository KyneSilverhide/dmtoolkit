<script setup>
import AppIcon from '../AppIcon.vue'

defineProps({
  toasts: { type: Array, default: () => [] },
})

const emit = defineEmits(['open', 'dismiss', 'pause', 'resume'])

function preview(content) {
  const text = String(content || '')
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}
</script>

<template>
  <!-- role="status" + aria-live : un message joueur arrive par socket, sans action du MJ — voir
       PlayerRollToasts.vue pour le même principe (conteneur monté en permanence par AdminView,
       sans v-if, condition pour qu'un lecteur d'écran annonce quoi que ce soit). Composant
       distinct de PlayerRollToasts (testid, position, comportement au clic différents) plutôt que
       de réutiliser le même : éviter tout risque sur les specs e2e qui ciblent déjà
       `player-roll-toast`, voir CLAUDE.md. -->
  <TransitionGroup
    name="msg-toast"
    tag="div"
    class="player-message-toasts"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="player-message-toast"
      data-testid="player-message-toast"
      title="Aller à l'onglet Messages"
      @click="emit('open', toast)"
      @mouseenter="emit('pause', toast.id)"
      @mouseleave="emit('resume', toast.id)"
    >
      <span class="pmt-icon"><AppIcon icon="lucide:mail" size="1.3rem" /></span>
      <div class="pmt-body">
        <span class="pmt-name">{{ toast.playerName }}</span>
        <span class="pmt-content">{{ preview(toast.content) }}</span>
      </div>
      <button
        type="button"
        class="pmt-dismiss"
        title="Ignorer"
        @click.stop="emit('dismiss', toast.id)"
      >
        <AppIcon icon="lucide:x" size="0.8em" />
      </button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.player-message-toasts {
  position: fixed;
  top: 5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 900;
  pointer-events: none;
}
.player-message-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border-radius: 10px;
  border: 1px solid var(--color-gold-dark);
  background: var(--gradient-panel-soft);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  min-width: 220px;
  max-width: 320px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.player-message-toast:hover { border-color: var(--color-gold-bright); box-shadow: var(--shadow-medium); }
/* noinspection CssUnusedSymbol */
.msg-toast-enter-active, .msg-toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
/* noinspection CssUnusedSymbol */
.msg-toast-enter-from, .msg-toast-leave-to { opacity: 0; transform: translateX(30px); }
.pmt-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 0.1rem; }
.pmt-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; flex: 1; }
.pmt-name { font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-gold-dark); }
.pmt-content { font-size: var(--text-sm); color: var(--color-text-dim); word-break: break-word; }
.pmt-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: var(--space-1);
  line-height: 1;
}
.pmt-dismiss:hover { color: var(--color-gold-bright); }
</style>
