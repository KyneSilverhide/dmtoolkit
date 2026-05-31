<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'

import { BACKEND_URL } from '@/config.js'

const events = ref([])
const summary = ref('')
const loadingSummary = ref(false)
const clearConfirm = ref(false)
const clearingJournal = ref(false)
const hasSession = computed(() => !!sessionStore.activeSession)

const MERGE_WINDOW_MS = 1000
const MERGEABLE_TYPES = new Set(['damage', 'heal'])

const groupedEvents = computed(() => {
  if (events.value.length === 0) return []
  const result = []
  for (const evt of events.value) {
    const eventType = evt.eventType || evt.event_type
    const playerName = evt.playerName || evt.player_name
    const createdAt = new Date(evt.createdAt || evt.created_at).getTime()

    if (MERGEABLE_TYPES.has(eventType) && result.length > 0) {
      const last = result[result.length - 1]
      const lastType = last.eventType || last.event_type
      const lastPlayer = last.playerName || last.player_name
      const lastTime = last._lastEventTime || new Date(last.createdAt || last.created_at).getTime()

      if (lastType === eventType && lastPlayer === playerName && createdAt - lastTime <= MERGE_WINDOW_MS) {
        const totalValue = (last.value || 0) + (evt.value || 0)
        const count = (last._mergeCount || 1) + 1
        last.value = totalValue
        last._mergeCount = count
        last._lastEventTime = createdAt
        if (eventType === 'damage') {
          last.description = `${playerName} subit ${Math.abs(totalValue)} dégâts (×${count})`
        } else {
          last.description = `${playerName} récupère ${totalValue} PV (×${count})`
        }
        continue
      }
    }

    result.push({ ...evt })
  }
  return result.slice().reverse()
})

const EVENT_ICONS = {
  join:              { icon: 'lucide:log-in',                 color: 'var(--color-gold-dark)' },
  leave:             { icon: 'lucide:log-out',                color: 'var(--color-text-dim)' },
  damage:            { icon: 'game-icons:sword-wound',        color: 'var(--color-danger)' },
  heal:              { icon: 'game-icons:health-increase',    color: 'var(--color-success)' },
  death:             { icon: 'game-icons:skull',              color: '#aaa' },
  critical_hit:      { icon: 'game-icons:star-struck',        color: 'var(--color-gold-bright)' },
  critical_miss:     { icon: 'game-icons:broken-bone',        color: 'var(--color-warning)' },
  vote_started:      { icon: 'lucide:vote',                   color: 'var(--color-info)' },
  vote_closed:       { icon: 'lucide:check-circle',           color: 'var(--color-info)' },
  purchase_accepted: { icon: 'lucide:shopping-bag',           color: 'var(--color-success)' },
  purchase_rejected: { icon: 'lucide:x-circle',              color: 'var(--color-danger)' },
  doom_clock_started:{ icon: 'game-icons:hourglass',          color: 'var(--color-danger)' },
  doom_clock_stopped:{ icon: 'lucide:stop-circle',            color: 'var(--color-text-dim)' },
  tension_started:   { icon: 'lucide:activity',               color: 'var(--color-warning)' },
  tension_updated:   { icon: 'lucide:trending-up',            color: 'var(--color-warning)' },
  tension_ended:     { icon: 'lucide:flag',                   color: 'var(--color-text-dim)' },
  combat_round:      { icon: 'game-icons:crossed-swords',     color: 'var(--color-text-dim)' },
}
const DEFAULT_EVENT_ICON = { icon: 'lucide:bookmark', color: 'var(--color-text-dim)' }

const DOT_COLORS = {
  join:              'var(--color-gold-dark)',
  leave:             'var(--color-text-dim)',
  damage:            'var(--color-danger)',
  heal:              'var(--color-success)',
  death:             '#555',
  critical_hit:      'var(--color-gold-bright)',
  critical_miss:     'var(--color-warning)',
  vote_started:      'var(--color-info)',
  vote_closed:       'var(--color-info)',
  purchase_accepted: 'var(--color-success)',
  purchase_rejected: 'var(--color-danger)',
  doom_clock_started:'var(--color-danger)',
  doom_clock_stopped:'var(--color-text-dim)',
  tension_started:   'var(--color-warning)',
  tension_updated:   'var(--color-warning)',
  tension_ended:     'var(--color-text-dim)',
  combat_round:      'var(--color-text-dim)',
}

function getIcon(evt) {
  return EVENT_ICONS[evt.eventType || evt.event_type] || DEFAULT_EVENT_ICON
}

function getDotColor(evt) {
  return DOT_COLORS[evt.eventType || evt.event_type] || 'var(--color-border)'
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function handleSessionEvent(event) {
  events.value.push({ ...event, createdAt: event.createdAt || new Date() })
}

async function clearJournal() {
  if (!hasSession.value) return
  clearingJournal.value = true
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/journal`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    events.value = []
    summary.value = ''
  } catch {
    // ignore
  } finally {
    clearingJournal.value = false
    clearConfirm.value = false
  }
}

async function generateSummary() {
  if (!hasSession.value) return
  loadingSummary.value = true
  summary.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/journal`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (data.summary) {
      summary.value = data.summary
      events.value = data.events.map(e => ({ ...e, eventType: e.event_type, createdAt: e.created_at }))
    }
  } catch {
    summary.value = 'Erreur lors de la génération du résumé.'
  } finally {
    loadingSummary.value = false
  }
}

onMounted(() => {
  const socket = getSocket(authStore.token)
  socket.on('session-event', handleSessionEvent)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('session-event', handleSessionEvent)
})
</script>

<template>
  <div class="journal">
    <h2 class="section-title">✦ Journal de Session</h2>

    <div v-if="!hasSession" class="no-session">
      <p>Aucune session active.</p>
    </div>

    <template v-else>
      <div class="journal-actions">
        <div v-if="clearConfirm" class="clear-confirm">
          <span class="clear-confirm-text">Effacer tout le journal ?</span>
          <button class="confirm-btn" @click="clearJournal" :disabled="clearingJournal">
            {{ clearingJournal ? '…' : 'Confirmer' }}
          </button>
          <button class="cancel-btn" @click="clearConfirm = false" :disabled="clearingJournal">Annuler</button>
        </div>
        <button v-else class="clear-btn" @click="clearConfirm = true" :title="'Effacer le journal'">
          <AppIcon icon="lucide:trash-2" size="0.85em" />
        </button>
        <button class="summary-btn" @click="generateSummary" :disabled="loadingSummary">
          <AppIcon v-if="!loadingSummary" icon="lucide:file-text" size="0.85em" />
          {{ loadingSummary ? 'Génération…' : 'Générer le résumé' }}
        </button>
      </div>

      <div v-if="summary" class="summary-box">
        <pre class="summary-text">{{ summary }}</pre>
      </div>

      <div v-if="events.length === 0" class="empty-journal">
        <p class="empty-icon"><AppIcon icon="game-icons:scroll-unfurled" size="2.5rem" color="var(--color-text-dim)" /></p>
        <p class="empty-text">Aucun événement enregistré.</p>
      </div>

      <div v-else class="timeline">
        <div
          v-for="(evt, idx) in groupedEvents"
          :key="idx"
          class="timeline-item"
        >
          <div
            class="timeline-dot"
            :style="{ borderColor: getDotColor(evt) }"
          >
            <AppIcon
              :icon="getIcon(evt).icon"
              :color="getIcon(evt).color"
              size="0.9rem"
            />
          </div>
          <div class="timeline-content">
            <span class="tl-desc">{{ evt.description }}</span>
            <span class="tl-time">{{ formatTime(evt.createdAt || evt.created_at) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.no-session {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
  text-align: center;
  padding: 2rem 0;
}

.journal-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.55rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  cursor: pointer;
  transition: all 0.2s;
}
.clear-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }

.clear-confirm {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  justify-content: flex-end;
}

.clear-confirm-text {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--color-danger);
}

.confirm-btn {
  padding: 0.35rem 0.7rem;
  background: transparent;
  border: 1px solid var(--color-danger);
  border-radius: 6px;
  color: var(--color-danger);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.confirm-btn:hover:not(:disabled) { background: rgba(var(--color-danger-rgb, 180,50,50), 0.15); }
.confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cancel-btn {
  padding: 0.35rem 0.7rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-btn:hover:not(:disabled) { border-color: var(--color-text-dim); color: var(--color-parchment); }
.cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.summary-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.summary-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.summary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.summary-box {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.summary-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  color: var(--color-parchment);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
}

.empty-journal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
}

.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  color: var(--color-text-dim);
}

/* ── Timeline ── */
.timeline {
  position: relative;
  padding-left: 2.2rem;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 0.7rem;
  top: 0.55rem;
  bottom: 0.55rem;
  width: 2px;
  background: var(--color-border);
  border-radius: 2px;
}

.timeline-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 0.7rem;
}

.timeline-dot {
  position: absolute;
  left: -2.1rem;
  top: 0;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.2s;
}

.timeline-content {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
}

.tl-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  color: var(--color-parchment);
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}

.tl-time {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  color: var(--color-border);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
