<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { BACKEND_URL } from '@/config.js'

const factions = ref([])
const loading = ref(false)

const newName = ref('')
const newMin = ref(-5)
const newMax = ref(5)
const newInitial = ref(0)
const creating = ref(false)

const canCreate = computed(() => {
  const name = newName.value.trim()
  const min = parseInt(newMin.value)
  const max = parseInt(newMax.value)
  const init = parseInt(newInitial.value)
  return (
    name.length > 0 &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min < max &&
    Number.isFinite(init) &&
    init >= min &&
    init <= max
  )
})

function factionBarWidth(faction) {
  const range = faction.max_value - faction.min_value
  if (range === 0) return 50
  return Math.round(((faction.current_value - faction.min_value) / range) * 100)
}

function factionBarColor(faction) {
  const normalized = factionBarWidth(faction) / 100
  const hue = Math.round(normalized * 120)
  return `hsl(${hue}, 65%, 45%)`
}

function formatValue(v) {
  return v >= 0 ? `+${v}` : `${v}`
}

async function loadFactions() {
  if (!sessionStore.activeSession?.id) return
  loading.value = true
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/factions`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) factions.value = await res.json()
  } finally {
    loading.value = false
  }
}

function createFaction() {
  if (!canCreate.value || !sessionStore.activeSession?.id) return
  const socket = getSocket()
  socket.emit('create-faction', {
    sessionId: sessionStore.activeSession.id,
    name: newName.value.trim(),
    minValue: parseInt(newMin.value),
    maxValue: parseInt(newMax.value),
    initialValue: parseInt(newInitial.value),
  })
  newName.value = ''
  newMin.value = -5
  newMax.value = 5
  newInitial.value = 0
}

function adjustValue(faction, delta) {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket()
  socket.emit('update-faction-value', {
    sessionId: sessionStore.activeSession.id,
    factionId: faction.id,
    delta,
  })
}

function deleteFaction(faction) {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket()
  socket.emit('delete-faction', {
    sessionId: sessionStore.activeSession.id,
    factionId: faction.id,
  })
}

function showOnTv() {
  if (!sessionStore.activeSession?.id || factions.value.length === 0) return
  const socket = getSocket()
  socket.emit('show-reputation', { sessionId: sessionStore.activeSession.id })
}

function handleFactionCreated({ faction }) {
  factions.value = [...factions.value, faction]
}

function handleFactionDeleted({ factionId }) {
  factions.value = factions.value.filter(f => f.id !== factionId)
}

function handleFactionsUpdated(data) {
  factions.value = Array.isArray(data) ? data : []
}

onMounted(() => {
  loadFactions()
  const socket = getSocket()
  socket.on('faction-created', handleFactionCreated)
  socket.on('faction-deleted', handleFactionDeleted)
  socket.on('factions-updated', handleFactionsUpdated)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('faction-created', handleFactionCreated)
  socket.off('faction-deleted', handleFactionDeleted)
  socket.off('factions-updated', handleFactionsUpdated)
})
</script>

<template>
  <div class="reputation-manager">
    <div class="rm-header">
      <h2 class="rm-title">
        <AppIcon icon="lucide:shield" size="1.1em" />
        Réputations de factions
      </h2>
      <HelpTip id="reputation.project">
        <button
          class="action-btn primary"
          :disabled="factions.length === 0"
          @click="showOnTv"
        >
          <AppIcon icon="lucide:tv" size="1em" />
          Projeter sur TV
        </button>
      </HelpTip>
    </div>

    <!-- Formulaire de création -->
    <fieldset class="rm-create-form">
      <legend class="rm-legend">Nouvelle faction</legend>
      <div class="rm-form-row">
        <label class="rm-label">Nom
          <input
            v-model="newName"
            class="form-input"
            type="text"
            placeholder="Ex: Garde de la Ville"
            maxlength="200"
            @keydown.enter="createFaction"
          />
        </label>
      </div>
      <div class="rm-form-row rm-form-row--three">
        <label class="rm-label">
          <span class="rm-label-text">Min <HelpTip id="reputation.range" /></span>
          <input v-model.number="newMin" class="form-input form-input--sm" type="number" min="-1000" max="-1" />
        </label>
        <label class="rm-label">
          <span class="rm-label-text">Valeur initiale</span>
          <input
            v-model.number="newInitial"
            class="form-input form-input--sm"
            type="number"
            :min="newMin"
            :max="newMax"
          />
        </label>
        <label class="rm-label">
          <span class="rm-label-text">Max</span>
          <input v-model.number="newMax" class="form-input form-input--sm" type="number" min="1" max="1000" />
        </label>
      </div>
      <button class="action-btn" :disabled="!canCreate" @click="createFaction">
        <AppIcon icon="lucide:plus" size="1em" />
        Ajouter la faction
      </button>
    </fieldset>

    <!-- Liste des factions -->
    <div v-if="loading" class="rm-loading">Chargement…</div>
    <div v-else-if="factions.length === 0" class="rm-empty">
      Aucune faction. Créez-en une ci-dessus.
    </div>
    <TransitionGroup v-else name="faction-list" tag="div" class="rm-list">
      <div v-for="faction in factions" :key="faction.id" class="faction-card">
        <div class="fc-top">
          <span class="fc-name">{{ faction.name }}</span>
          <span class="fc-range">{{ formatValue(faction.min_value) }} / {{ formatValue(faction.max_value) }}</span>
          <button class="remove-btn" @click="deleteFaction(faction)" title="Supprimer cette faction">
            <AppIcon icon="lucide:trash-2" size="0.9em" />
          </button>
        </div>
        <div class="fc-bar-row">
          <button class="adj-btn adj-btn--minus" @click="adjustValue(faction, -1)" :disabled="faction.current_value <= faction.min_value">
            <AppIcon icon="lucide:minus" size="0.9em" />
          </button>
          <div class="fc-bar-track">
            <div
              class="fc-bar-fill"
              :style="{
                width: factionBarWidth(faction) + '%',
                background: factionBarColor(faction),
              }"
            />
          </div>
          <button class="adj-btn adj-btn--plus" @click="adjustValue(faction, 1)" :disabled="faction.current_value >= faction.max_value">
            <AppIcon icon="lucide:plus" size="0.9em" />
          </button>
        </div>
        <div class="fc-value" :style="{ color: factionBarColor(faction) }">
          {{ formatValue(faction.current_value) }}
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.reputation-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.rm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.rm-title {
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  color: var(--color-text);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-text-dim); font-style: italic; }

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.6rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.action-btn.primary {
  width: auto;
  white-space: nowrap;
}

.rm-create-form {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.85rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.rm-legend {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 0.25rem;
}

.rm-form-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.rm-form-row--three {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.5rem;
}

.rm-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.rm-label-text {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
}

.form-input--sm {
  width: 100%;
}

.rm-loading,
.rm-empty {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 1.5rem 0;
}

/* Faction cards */
.rm-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.faction-card {
  background: var(--admin-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.fc-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fc-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fc-range {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0.15rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.remove-btn:hover {
  color: var(--admin-danger-text);
}

.fc-bar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.adj-btn {
  background: var(--admin-control-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 4px;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.adj-btn:hover:not(:disabled) {
  background: var(--admin-panel-highlight-bg);
}

.adj-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.adj-btn--plus {
  order: 3;
}

.fc-bar-track {
  flex: 1;
  height: 10px;
  background: var(--color-border);
  border-radius: 99px;
  overflow: hidden;
}

.fc-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.7s ease, background 0.7s ease;
}

.fc-value {
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* TransitionGroup animations */
/* noinspection CssUnusedSymbol */
.faction-list-enter-active,
/* noinspection CssUnusedSymbol */
.faction-list-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

/* noinspection CssUnusedSymbol */
.faction-list-enter-from,
/* noinspection CssUnusedSymbol */
.faction-list-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
