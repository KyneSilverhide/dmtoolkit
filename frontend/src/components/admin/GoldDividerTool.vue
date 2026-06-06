<script setup>
import { ref, computed } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'

const MAX_COIN_AMOUNT = 99999

const COINS = [
  { key: 'pp', label: 'PP', name: 'Platine', color: '#e5e4e2', pcValue: 1000 },
  { key: 'po', label: 'PO', name: 'Or', color: '#d4af37', pcValue: 100 },
  { key: 'pe', label: 'PE', name: 'Electrum', color: '#80bfff', pcValue: 50 },
  { key: 'pa', label: 'PA', name: 'Argent', color: '#c0c0c0', pcValue: 10 },
  { key: 'pc', label: 'PC', name: 'Cuivre', color: '#b87333', pcValue: 1 },
]

const amounts = ref({ pp: 0, po: 0, pe: 0, pa: 0, pc: 0 })
const sendFeedback = ref('')
const splitMode = ref('exact') // 'exact' | 'approximate'
const groupedPlayerIds = ref([])
const groupExpanded = ref(true)

const players = computed(() => sessionStore.players || [])
const numPlayers = computed(() => players.value.length)

// For 'exact' mode: simple floor division per coin type
function computeExactShares(playerList, amts) {
  const n = playerList.length
  return playerList.map(p => {
    const share = { playerId: p.id, playerName: p.player_name }
    for (const coin of COINS) {
      const amt = Math.max(0, Math.floor(Number(amts[coin.key]) || 0))
      share[coin.key] = Math.floor(amt / n)
    }
    return share
  })
}

// For 'approximate' mode: water-fill across all denominations.
// Each coin goes to the player(s) with the lowest cumulative PC value,
// filling gaps between tiers before distributing evenly at the top.
function computeApproximateShares(playerList, amts) {
  const n = playerList.length
  const totals = new Array(n).fill(0)
  const result = playerList.map(p => {
    const share = { playerId: p.id, playerName: p.player_name }
    for (const coin of COINS) share[coin.key] = 0
    return share
  })

  for (const coin of COINS) {
    let remaining = Math.max(0, Math.floor(Number(amts[coin.key]) || 0))
    if (remaining === 0) continue

    while (remaining > 0) {
      const minTotal = Math.min(...totals)
      const minIdxs = []
      let nextTotal = Infinity
      for (let i = 0; i < totals.length; i++) {
        const t = totals[i]
        if (t === minTotal) minIdxs.push(i)
        else if (t > minTotal && t < nextTotal) nextTotal = t
      }
      const gapPc = nextTotal === Infinity ? Infinity : nextTotal - minTotal
      const coinsToFill = gapPc === Infinity ? Infinity : Math.ceil(gapPc / coin.pcValue)
      const coinsNeeded = coinsToFill * minIdxs.length

      if (coinsNeeded <= remaining) {
        for (const idx of minIdxs) {
          result[idx][coin.key] += coinsToFill
          totals[idx] += coinsToFill * coin.pcValue
        }
        remaining -= coinsNeeded
      } else {
        const perPlayer = Math.floor(remaining / minIdxs.length)
        const rem = remaining % minIdxs.length
        for (let k = 0; k < minIdxs.length; k++) {
          const give = perPlayer + (k < rem ? 1 : 0)
          result[minIdxs[k]][coin.key] += give
          totals[minIdxs[k]] += give * coin.pcValue
        }
        remaining = 0
      }
    }
  }

  return result
}

const shares = computed(() => {
  const n = numPlayers.value
  if (n === 0) return []
  return splitMode.value === 'approximate'
    ? computeApproximateShares(players.value, amounts.value)
    : computeExactShares(players.value, amounts.value)
})

// Remainders per coin type (only relevant in exact mode)
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

const allGrouped = computed(() =>
  players.value.length > 0 &&
  players.value.every(p => groupedPlayerIds.value.includes(p.id))
)

const groupedShares = computed(() => {
  if (groupedPlayerIds.value.length === 0) return null
  const total = {}
  for (const coin of COINS) total[coin.key] = 0
  for (const share of shares.value) {
    if (groupedPlayerIds.value.includes(share.playerId)) {
      for (const coin of COINS) total[coin.key] += share[coin.key]
    }
  }
  return total
})

const soloShares = computed(() =>
  shares.value.filter(s => !groupedPlayerIds.value.includes(s.playerId))
)
const groupedShares_individual = computed(() =>
  shares.value.filter(s => groupedPlayerIds.value.includes(s.playerId))
)

function formatShare(share) {
  const parts = []
  for (const coin of COINS) {
    if (share[coin.key] > 0) parts.push(`${share[coin.key]} ${coin.label}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Rien'
}

function shareTotalPc(share) {
  return COINS.reduce((sum, coin) => sum + (share[coin.key] || 0) * coin.pcValue, 0)
}

function anyNonZeroShare() {
  return shares.value.some(s => COINS.some(c => s[c.key] > 0))
}

function toggleGroup(playerId) {
  const idx = groupedPlayerIds.value.indexOf(playerId)
  if (idx >= 0) groupedPlayerIds.value.splice(idx, 1)
  else groupedPlayerIds.value.push(playerId)
}

function isGrouped(playerId) {
  return groupedPlayerIds.value.includes(playerId)
}

function toggleAllGroup() {
  if (allGrouped.value) {
    groupedPlayerIds.value = []
  } else {
    groupedPlayerIds.value = players.value.map(p => p.id)
  }
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
        <p class="section-label"><AppIcon icon="game-icons:coins" size="0.85rem" color="var(--color-gold-bright)" /> Trésor à diviser <HelpTip id="gold.coins" /></p>
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
                :max="MAX_COIN_AMOUNT"
                placeholder="0"
              />
              <button class="step-btn" @click="amounts[coin.key] = (Number(amounts[coin.key]) || 0) + 1">+</button>
            </div>
          </div>
        </div>
        <button class="reset-btn" @click="reset">Remettre à zéro</button>
      </div>

      <div v-if="hasAnyCoin" class="section">
        <div class="split-mode-row">
          <p class="section-label" style="margin: 0"><AppIcon icon="lucide:scale" size="0.85rem" /> Division entre {{ numPlayers }} joueur(s)</p>
          <div class="mode-toggle">
            <button
              :class="['mode-btn', { active: splitMode === 'exact' }]"
              @click="splitMode = 'exact'"
            >Exact</button>
            <button
              :class="['mode-btn', { active: splitMode === 'approximate' }]"
              @click="splitMode = 'approximate'"
            >Complet</button>
          </div>
        </div>

        <div class="group-actions">
          <button class="group-all-btn" @click="toggleAllGroup">
            <AppIcon :icon="allGrouped ? 'lucide:ungroup' : 'lucide:group'" size="0.8rem" />
            {{ allGrouped ? 'Dégrouper' : 'Tout grouper' }}
          </button>
        </div>

        <div class="players-table">
          <!-- Solo players -->
          <div
            v-for="share in soloShares"
            :key="share.playerId"
            class="player-row"
          >
            <button
              class="group-toggle"
              :class="{ grouped: false }"
              :title="'Ajouter au groupe banquier'"
              @click="toggleGroup(share.playerId)"
            >
              <AppIcon icon="lucide:users" size="0.75rem" />
            </button>
            <span class="player-name"><AppIcon icon="game-icons:crossed-swords" size="0.8rem" color="var(--color-gold-bright)" /> {{ share.playerName }}</span>
            <span class="player-share">{{ formatShare(share) }}</span>
            <span class="share-pc-value">≈ {{ shareTotalPc(share) }} PC</span>
          </div>

          <!-- Group row (if any players grouped) -->
          <template v-if="groupedShares">
            <div class="group-row">
              <div class="group-row-header">
                <button
                  class="group-expand-btn"
                  :title="groupExpanded ? 'Masquer le détail' : 'Voir le détail'"
                  @click="groupExpanded = !groupExpanded"
                >
                  <AppIcon :icon="groupExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8rem" />
                </button>
                <span class="group-label">
                  <AppIcon icon="lucide:users" size="0.8rem" color="var(--color-gold-bright)" />
                  Groupe ({{ groupedPlayerIds.length }} joueur{{ groupedPlayerIds.length > 1 ? 's' : '' }})
                </span>
                <span class="player-share group-total">{{ formatShare(groupedShares) }}</span>
                <span class="share-pc-value">≈ {{ shareTotalPc(groupedShares) }} PC</span>
              </div>
              <div v-if="groupExpanded" class="group-members">
                <div
                  v-for="share in groupedShares_individual"
                  :key="share.playerId"
                  class="group-member-row"
                >
                  <button
                    class="group-toggle grouped"
                    :title="'Retirer du groupe'"
                    @click="toggleGroup(share.playerId)"
                  >
                    <AppIcon icon="lucide:users" size="0.75rem" />
                  </button>
                  <span class="player-name player-name-dim">{{ share.playerName }}</span>
                  <span class="player-share player-share-dim">{{ formatShare(share) }}</span>
                  <span class="share-pc-value">≈ {{ shareTotalPc(share) }} PC</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-if="splitMode === 'exact'" class="remainders">
          <p class="section-label" style="margin-top: 0.5rem"><AppIcon icon="game-icons:coins" size="0.85rem" /> Restes (non divisibles) <HelpTip id="gold.remainder" /></p>
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
        <p v-else class="approx-hint">
          <AppIcon icon="lucide:info" size="0.8rem" /> Toutes les pièces sont distribuées — les quelques pièces en trop vont aux joueurs qui ont reçu le moins.
        </p>
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

.split-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.mode-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.mode-btn {
  padding: 0.25rem 0.6rem;
  border: none;
  background: var(--admin-control-bg, var(--surface-raised));
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn + .mode-btn {
  border-left: 1px solid var(--color-border);
}

.mode-btn.active {
  background: var(--color-gold-dark);
  color: var(--color-parchment);
}

.group-actions {
  display: flex;
  gap: 0.5rem;
}

.group-all-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg, var(--surface-raised));
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.group-all-btn:hover {
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
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--admin-control-bg, var(--surface-raised));
}

.group-toggle {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.group-toggle:hover, .group-toggle.grouped {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: rgba(212, 175, 55, 0.1);
}

.player-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--color-parchment);
  flex: 1;
}

.player-share {
  font-family: var(--font-body), sans-serif;
  font-size: 0.82rem;
  color: var(--color-gold-bright);
  text-align: right;
}

.group-row {
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  overflow: hidden;
  background: var(--admin-control-bg, var(--surface-raised));
}

.group-row-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
}

.group-expand-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.group-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  flex: 1;
}

.group-total {
  font-weight: bold;
}

.group-members {
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.group-member-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.group-member-row:last-child {
  border-bottom: none;
}

.player-name-dim {
  color: var(--color-text-dim);
}

.player-share-dim {
  color: var(--color-text-dim);
  font-size: 0.78rem;
}

.share-pc-value {
  font-family: var(--font-body), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  white-space: nowrap;
  opacity: 0.7;
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

.approx-hint {
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.3rem;
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
