<script setup>
const props = defineProps({
  activeVote: { type: Object, default: null },
})

function barWidth(optionIndex) {
  const vote = props.activeVote
  const total = Number(vote?.totalVotes) || 0
  if (!total) return 0
  const votesFor = Number(vote?.results?.[optionIndex]) || 0
  return Math.round((votesFor / total) * 100)
}

function voterNamesFor(optionIndex) {
  const names = props.activeVote?.voterNames
  if (!Array.isArray(names)) return ''
  return names
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
  gap: clamp(2rem, 4vh, 4.5rem);
  padding: 3rem;
}
.vote-question {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2.5rem, 6.5vw, 7rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  text-align: center;
  letter-spacing: 0.05em;
  margin: 0;
}
.vote-progress {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.4rem, 2vw, 2.6rem);
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}
.vote-results {
  width: 100%;
  max-width: min(1200px, 85vw);
  display: flex;
  flex-direction: column;
  gap: clamp(2rem, 3vh, 3.5rem);
}
.vote-option { display: flex; flex-direction: column; gap: 0.6rem; }
.vote-option-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.vote-option-label {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.8rem, 2.6vw, 3.2rem);
  letter-spacing: 0.06em;
  color: var(--color-text);
}
.vote-option-count {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.4rem, 1.8vw, 2.2rem);
  color: var(--color-text-dim);
}
.vote-bar {
  height: clamp(24px, 2.4vw, 56px);
  background: var(--tv-track-bg);
  border-radius: 999px;
  overflow: hidden;
}
.vote-bar-fill {
  height: 100%;
  background: var(--color-gold-bright);
  border-radius: 999px;
  transition: width 0.6s ease;
}
.voter-names {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.15rem, 1.4vw, 1.7rem);
  color: var(--color-text-dim);
  letter-spacing: 0.04em;
}
.vote-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(2rem, 3vh, 3rem);
}
.vote-waiting p {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.6rem, 2.4vw, 3rem);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.vote-orb {
  width: clamp(96px, 9vw, 220px); height: clamp(96px, 9vw, 220px);
  border-radius: 50%;
  border: clamp(4px, 0.4vw, 8px) solid var(--color-gold-dark);
  border-top-color: var(--color-gold-bright);
  animation: spin 1.2s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
