<script setup>
const props = defineProps({
  activeVote: { type: Object, default: null },
})

function barWidth(optionIndex) {
  if (!props.activeVote || !props.activeVote.totalVotes) return 0
  return Math.round((props.activeVote.results[optionIndex] / props.activeVote.totalVotes) * 100)
}

function voterNamesFor(optionIndex) {
  if (!props.activeVote) return ''
  return props.activeVote.voterNames
    .filter(v => v.optionIndex === optionIndex)
    .map(v => v.name)
    .join(', ')
}
</script>

<template>
  <div class="vote-display" data-testid="tv-mode-vote">
    <h2 class="vote-question" data-testid="tv-vote-question">{{ activeVote?.question }}</h2>
    <div class="vote-progress">{{ activeVote?.totalVotes }} / {{ activeVote?.totalPlayers }} joueurs ont voté</div>
    <div v-if="activeVote?.isClosed" class="vote-results">
      <div v-for="(option, i) in activeVote.options" :key="i" class="vote-option">
        <div class="vote-option-header">
          <span class="vote-option-label">{{ option }}</span>
          <span class="vote-option-count">{{ activeVote.results[i] }} vote(s)</span>
        </div>
        <div class="vote-bar">
          <div class="vote-bar-fill" :style="{ width: barWidth(i) + '%' }"></div>
        </div>
        <span v-if="!activeVote.isAnonymous" class="voter-names">{{ voterNamesFor(i) }}</span>
      </div>
    </div>
    <div v-else class="vote-waiting">
      <div class="vote-orb"></div>
      <p>Vote en cours…</p>
    </div>
  </div>
</template>

<style scoped>
.vote-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem;
}
.vote-question {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.4rem, 3.5vw, 2.8rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  text-align: center;
  letter-spacing: 0.05em;
  margin: 0;
}
.vote-progress {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}
.vote-results {
  width: 100%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.vote-option { display: flex; flex-direction: column; gap: 0.35rem; }
.vote-option-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.vote-option-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-text);
}
.vote-option-count {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
}
.vote-bar {
  height: 14px;
  background: var(--tv-track-bg);
  border-radius: 7px;
  overflow: hidden;
}
.vote-bar-fill {
  height: 100%;
  background: var(--color-gold-bright);
  border-radius: 7px;
  transition: width 0.6s ease;
}
.voter-names {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  color: var(--color-text-dim);
  letter-spacing: 0.04em;
}
.vote-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}
.vote-waiting p {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.vote-orb {
  width: 64px; height: 64px;
  border-radius: 50%;
  border: 3px solid var(--color-gold-dark);
  border-top-color: var(--color-gold-bright);
  animation: spin 1.2s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
