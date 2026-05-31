<script setup>
import { ref, computed } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'

const MAX_COIN_AMOUNT = 99999

const COINS = [
  { key: 'pp', label: 'PP', name: 'Platine', color: '#e5e4e2' },
  { key: 'po', label: 'PO', name: 'Or', color: '#d4af37' },
  { key: 'pe', label: 'PE', name: 'Electrum', color: '#80bfff' },
  { key: 'pa', label: 'PA', name: 'Argent', color: '#c0c0c0' },
  { key: 'pc', label: 'PC', name: 'Cuivre', color: '#b87333' },
]

const amounts = ref({ pp: 0, po: 0, pe: 0, pa: 0, pc: 0 })
const sendFeedback = ref('')

const players = computed(() => sessionStore.players || [])
const numPlayers = computed(() => players.value.length)

// Per-player shares: floor division per coin type
const shares = computed(() => {
  const n = numPlayers.value
  if (n === 0) return []
  return players.value.map(p => {
    const share = { playerId: p.id, playerName: p.player_name }
    for (const coin of COINS) {
      const amt = Math.max(0, Math.floor(Number(amounts.value[coin.key]) || 0))
      share[coin.key] = Math.floor(amt / n)
    }
    return share
  })
})

// Remainders per coin type
const remainders = computed(() => {
  const n = numPlayers.value
  if (n === 0) return {}
  const result = {}
  for (const coin of COINS) {
    const amt = Math.max(0, Math.floor(Number(amounts.value[coin.key]) || 0))
    result[coin.key] = amt % n
  }
  return result
})

const hasAnyCoin = computed(() =>
  COINS.some(c => (Number(amounts.value[c.key]) || 0) > 0)
)

const hasPlayers = computed(() => numPlayers.value > 0)
const hasSession = computed(() => !!sessionStore.activeSession)

function formatShare(share) {
  const parts = []
  for (const coin of COINS) {
    if (share[coin.key] > 0) parts.push(`${share[coin.key]} ${coin.label}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Rien'
}

function anyNonZeroShare() {
  return shares.value.some(s => COINS.some(c => s[c.key] > 0))
}

function sendSplit() {
  if (!hasSession.value || !hasPlayers.value || !anyNonZeroShare()) return
  const socket = getSocket(authStore.token)
  socket.emit('send-gold-split', {
    sessionId: sessionStore.activeSession.id,
    shares: shares.value,
  })
  sendFeedback.value = `Parts envoyées à ${numPlayers.value} joueur(s) !`
  setTimeout(() => { sendFeedback.value = '' }, 3000)
}

function reset() {
  amounts.value = { pp: 0, po: 0, pe: 0, pa: 0, pc: 0 }
}
</script>

<template>
  <div class="gold-divider">
    <p v-if="!hasSession" class="no-session-hint">Aucune session active. Sélectionnez une session pour diviser le trésor.</p>
    <p v-else-if="!hasPlayers" class="no-session-hint">Aucun joueur connecté dans la session.</p>

    <template v-else>
      <div class="section">
        <p class="section-label"><AppIcon icon="game-icons:coins" size="0.85rem" color="var(--color-gold-bright)" /> Trésor à diviser</p>
        <div class="coin-inputs">
          <div
            v-for="coin in COINS"
            :key="coin.key"
            class="coin-row"
          >
            <label class="coin-label" :style="{ color: coin.color }">
              <span class="coin-abbr">{{ coin.label }}</span>
              <span class="coin-name">{{ coin.name }}</span>
            </label>
            <div class="coin-stepper">
              <button class="step-btn" @click="amounts[coin.key] = Math.max(0, (Number(amounts[coin.key]) || 0) - 1)">−</button>
              <input
                v-model.number="amounts[coin.key]"
                type="number"
                class="coin-input"
                min="0"
                :max="MAX_COIN_AMOUNT"                placeholder="0"
              />
              <button class="step-btn" @click="amounts[coin.key] = (Number(amounts[coin.key]) || 0) + 1">+</button>
            </div>
          </div>
        </div>
        <button class="reset-btn" @click="reset">Remettre à zéro</button>
      </div>

      <div v-if="hasAnyCoin" class="section">
        <p class="section-label"><AppIcon icon="lucide:scale" size="0.85rem" /> Division entre {{ numPlayers }} joueur(s)</p>

        <div class="players-table">
          <div v-for="share in shares" :key="share.playerId" class="player-row">
            <span class="player-name"><AppIcon icon="game-icons:crossed-swords" size="0.8rem" color="var(--color-gold-bright)" /> {{ share.playerName }}</span>
            <span class="player-share">{{ formatShare(share) }}</span>
          </div>
        </div>

        <div class="remainders">
          <p class="section-label" style="margin-top: 0.5rem"><AppIcon icon="game-icons:coins" size="0.85rem" /> Restes (non divisibles)</p>
          <div class="remainder-chips">
            <template v-for="coin in COINS" :key="coin.key">
              <span
                v-if="remainders[coin.key] > 0"
                class="remainder-chip"
                :style="{ borderColor: coin.color, color: coin.color }"
              >
                {{ remainders[coin.key] }} {{ coin.label }}
              </span>
            </template>
            <span
              v-if="COINS.every(c => !remainders[c.key])"
              class="remainder-chip none"
            >Aucun reste</span>
          </div>
        </div>
      </div>

      <div class="send-section">
        <button class="send-btn" data-testid="gold-send-btn" :disabled="!hasAnyCoin || !anyNonZeroShare()" @click="sendSplit">
          <AppIcon icon="lucide:send" size="0.9em" /> Envoyer les parts aux joueurs
        </button>
        <p v-if="sendFeedback" class="send-feedback">
          <AppIcon icon="lucide:check-circle" size="0.9em" /> {{ sendFeedback }}
        </p>
        <p v-if="hasAnyCoin && !anyNonZeroShare()" class="send-hint">
          Aucune pièce entière à distribuer.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gold-divider {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.section-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.coin-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.coin-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.coin-label {
  display: flex;
  flex-direction: column;
  min-width: 52px;
}

.coin-abbr {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  font-weight: bold;
  letter-spacing: 0.05em;
}

.coin-name {
  font-size: 0.62rem;
  font-family: var(--font-heading), sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}

.coin-stepper {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
}

.step-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--admin-control-bg, var(--surface-raised));
  color: var(--color-parchment);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.coin-input {
  flex: 1;
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  text-align: center;
  outline: none;
}

.coin-input:focus {
  border-color: var(--color-gold-dark);
}

.reset-btn {
  align-self: flex-start;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg, var(--surface-raised));
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.reset-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.players-table {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--admin-control-bg, var(--surface-raised));
}

.player-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--color-parchment);
}

.player-share {
  font-family: var(--font-body), sans-serif;
  font-size: 0.82rem;
  color: var(--color-gold-bright);
  text-align: right;
}

.remainders {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.remainder-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.remainder-chip {
  border: 1px solid;
  border-radius: 20px;
  padding: 0.2rem 0.65rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.remainder-chip.none {
  border-color: var(--color-border);
  color: var(--color-text-dim);
}

.send-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.send-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-feedback {
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  color: var(--color-success);
  text-align: center;
  margin: 0;
}

.send-hint {
  font-family: var(--font-body), sans-serif;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  text-align: center;
  margin: 0;
}

.no-session-hint {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
  font-size: 0.9rem;
  padding: 0.5rem 0;
}
</style>
