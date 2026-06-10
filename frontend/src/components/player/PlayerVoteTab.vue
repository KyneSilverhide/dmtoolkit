<script setup>
import AppIcon from '@/components/AppIcon.vue'
import HelpTip from '@/components/HelpTip.vue'

const props = defineProps({
  activeVote: { default: null },
  myVote:     { default: null },
})

const emit = defineEmits(['submit-vote'])
</script>

<template>
  <div>
    <div v-if="!activeVote" class="panel empty-panel">
      <p class="empty-icon"><AppIcon icon="lucide:check-square" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="empty-text">Aucun vote en cours.</p>
    </div>
    <div v-else class="panel vote-panel">
      <h3 class="vote-title"><AppIcon icon="lucide:check-square" size="1em" /> {{ activeVote.question }}</h3>
      <p v-if="activeVote.isAnonymous" class="vote-anon-hint"><AppIcon icon="lucide:eye-off" size="0.8em" /> Vote anonyme <HelpTip id="player.vote-anonymous" /></p>
      <div v-if="myVote === null && !activeVote.isClosed" class="vote-options">
        <button
          v-for="(opt, i) in activeVote.options"
          :key="i"
          class="vote-option-btn"
          @click="emit('submit-vote', i)"
        >{{ opt }}</button>
      </div>
      <div v-else-if="myVote !== null && !activeVote.isClosed" class="vote-done">
        <p>✓ Vous avez voté pour : <strong>{{ activeVote.options[myVote] }}</strong></p>
      </div>
      <div v-if="activeVote.isClosed" class="vote-results-mini">
        <p class="vote-closed-label">Vote clôturé — Résultats :</p>
        <p v-for="(opt, i) in activeVote.options" :key="i" class="vote-result-line">
          {{ opt }}: <strong>{{ activeVote.results[i] }}</strong> vote(s)
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 0.5rem;
  border-style: dashed;
}
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading), sans-serif; font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }

.vote-panel { display: flex; flex-direction: column; gap: 0.75rem; }
.vote-anon-hint { margin: 0; font-size: 0.72rem; color: var(--color-text-dim); display: flex; align-items: center; gap: 0.3rem; font-family: var(--font-heading), sans-serif; letter-spacing: 0.07em; }
.vote-title { font-family: var(--font-heading), sans-serif; font-size: 1rem; color: var(--color-gold-bright); letter-spacing: 0.05em; margin: 0; }
.vote-options { display: flex; flex-direction: column; gap: 0.5rem; }
.vote-option-btn {
  padding: 0.7rem 1rem;
  background: var(--player-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.vote-option-btn:hover { background: var(--player-gold-bg-strong); border-color: var(--color-gold); color: var(--color-gold-bright); }
.vote-done { font-family: var(--font-body), sans-serif; font-size: 0.9rem; color: var(--player-success-text); }
.vote-done strong { color: var(--color-parchment); }
.vote-closed-label { font-family: var(--font-heading), sans-serif; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-dim); margin: 0 0 0.25rem; }
.vote-result-line { font-family: var(--font-body), sans-serif; font-size: 0.85rem; color: var(--color-text-dim); margin: 0.1rem 0; }
.vote-result-line strong { color: var(--color-parchment); }
</style>
