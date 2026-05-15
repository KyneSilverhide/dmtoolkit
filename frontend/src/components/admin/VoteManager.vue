<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'
import AppIcon from '../AppIcon.vue'

const question = ref('')
const options = ref(['', ''])
const isAnonymous = ref(false)
const activeVote = ref(null)
const creating = ref(false)

function addOption() {
  if (options.value.length < 5) options.value.push('')
}

function removeOption(idx) {
  if (options.value.length > 2) options.value.splice(idx, 1)
}

function createVote() {
  if (!question.value.trim()) return
  const validOptions = options.value.map(o => o.trim()).filter(Boolean)
  if (validOptions.length < 2) return
  const socket = getSocket()
  socket.emit('create-vote', {
    sessionId: sessionStore.activeSession.id,
    question: question.value.trim(),
    options: validOptions,
    isAnonymous: isAnonymous.value,
  })
  creating.value = true
}

function closeVote() {
  const socket = getSocket()
  socket.emit('close-vote', { sessionId: sessionStore.activeSession.id })
}

function barWidth(i) {
  if (!activeVote.value || !activeVote.value.totalVotes) return 0
  return Math.round((activeVote.value.results[i] / activeVote.value.totalVotes) * 100)
}

function handleVoteStarted(voteData) {
  activeVote.value = { ...voteData, isClosed: false }
  creating.value = false
  question.value = ''
  options.value = ['', '']
  isAnonymous.value = false
}

function handleVoteUpdated(voteData) {
  activeVote.value = { ...voteData, isClosed: false }
}

function handleVoteClosed(voteData) {
  activeVote.value = { ...voteData, isClosed: true }
}

onMounted(() => {
  const socket = getSocket()
  socket.on('vote-started', handleVoteStarted)
  socket.on('vote-updated', handleVoteUpdated)
  socket.on('vote-closed', handleVoteClosed)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('vote-started', handleVoteStarted)
  socket.off('vote-updated', handleVoteUpdated)
  socket.off('vote-closed', handleVoteClosed)
})
</script>

<template>
  <div class="vote-manager">
    <h3 class="section-title"><AppIcon icon="lucide:check-square" size="0.9em" /> Gestionnaire de Vote</h3>

    <!-- Active vote display -->
    <div v-if="activeVote" class="active-vote">
      <div class="vote-status-header">
        <span class="vote-question-label">{{ activeVote.question }}</span>
        <span class="vote-badge" :class="activeVote.isClosed ? 'closed' : 'active'">
          {{ activeVote.isClosed ? 'Clôturé' : 'En cours' }}
        </span>
      </div>
      <p class="vote-progress-text">{{ activeVote.totalVotes }} / {{ activeVote.totalPlayers }} votes</p>

      <div class="vote-results">
        <div v-for="(opt, i) in activeVote.options" :key="i" class="result-row">
          <div class="result-header">
            <span class="result-label">{{ opt }}</span>
            <span class="result-count">{{ activeVote.results[i] }} ({{ barWidth(i) }}%)</span>
          </div>
          <div class="result-bar-track">
            <div class="result-bar-fill" :style="{ width: barWidth(i) + '%' }" />
          </div>
          <div v-if="!activeVote.isAnonymous && activeVote.voterNames?.length" class="voter-names">
            {{
              activeVote.voterNames
                .filter(v => v.optionIndex === i)
                .map(v => v.name)
                .join(', ')
            }}
          </div>
        </div>
      </div>

      <button v-if="!activeVote.isClosed" class="action-btn danger-btn" @click="closeVote">
        Clôturer le vote
      </button>
      <button v-else class="action-btn" @click="activeVote = null">
        Nouveau vote
      </button>
    </div>

    <!-- Create vote form -->
    <div v-else class="create-form">
      <div class="form-group">
        <label class="form-label">Question</label>
        <input
          v-model="question"
          type="text"
          class="form-input"
          placeholder="Posez votre question…"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Options</label>
        <div v-for="(_, i) in options" :key="i" class="option-row">
          <input
            v-model="options[i]"
            type="text"
            class="form-input"
            :placeholder="`Option ${i + 1}`"
          />
          <button v-if="options.length > 2" class="remove-option-btn" @click="removeOption(i)">✕</button>
        </div>
        <button v-if="options.length < 5" class="add-option-btn" @click="addOption">+ Ajouter une option</button>
      </div>

      <label class="checkbox-label">
        <input v-model="isAnonymous" type="checkbox" />
        <span>Vote anonyme</span>
      </label>

      <button
        class="action-btn"
        :disabled="!question.trim() || creating"
        @click="createVote"
      >
        <AppIcon v-if="!creating" icon="lucide:check-square" size="0.85em" /> {{ creating ? '…' : 'Lancer le vote' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.vote-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.option-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.remove-option-btn {
  background: none;
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 4px;
  color: var(--admin-danger-text, var(--color-danger));
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.7rem;
  flex-shrink: 0;
  transition: all 0.2s;
}
.remove-option-btn:hover { background: var(--admin-danger-bg, var(--color-danger-soft)); }

.add-option-btn {
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 0.4rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.add-option-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-dark); }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading);
  font-size: 0.7rem;
  color: var(--color-text-dim);
  cursor: pointer;
}

.action-btn {
  padding: 0.5rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.danger-btn {
  background: var(--gradient-danger-action);
  border-color: var(--admin-danger-border, var(--color-danger-border));
  color: var(--admin-danger-text, var(--color-danger));
}
.danger-btn:hover:not(:disabled) { background: var(--gradient-danger-action-hover); }

/* Active vote display */
.active-vote {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.vote-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.vote-question-label {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  color: var(--color-parchment);
  flex: 1;
}

.vote-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
}
.vote-badge.active {
  color: var(--admin-success-text, var(--color-success));
  background: var(--admin-success-bg, var(--color-success-soft));
  border: 1px solid var(--admin-success-border, var(--color-success-border));
}
.vote-badge.closed {
  color: var(--color-text-dim);
  background: var(--admin-control-bg-muted, var(--surface-ghost));
  border: 1px solid var(--color-border);
}

.vote-progress-text {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  color: var(--color-text-dim);
  letter-spacing: 0.1em;
}

.vote-results {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-label {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  color: var(--color-parchment);
}

.result-count {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  color: var(--color-gold-dark);
}

.result-bar-track {
  height: 8px;
  background: var(--surface-track);
  border-radius: 4px;
  overflow: hidden;
}

.result-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  border-radius: 4px;
  transition: width 0.6s ease;
}

.voter-names {
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--color-text-dim);
  font-style: italic;
}
</style>
