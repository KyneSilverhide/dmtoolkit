<script setup>
import { computed } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'
import AppIcon from '../AppIcon.vue'
import { DND_CONDITIONS_MAP } from '../../utils/conditions.js'

function hpPercent(player) {
  if (!player.max_hp) return 100
  return Math.min(100, Math.max(0, (player.current_hp / player.max_hp) * 100))
}
function hpColor(player) {
  const pct = hpPercent(player)
  if (pct > 50) return 'var(--admin-success-text, var(--color-success))'
  if (pct > 20) return 'var(--admin-warning-text, var(--color-warning))'
  return 'var(--admin-danger-text, var(--color-danger))'
}

const CONDITION_LABELS = DND_CONDITIONS_MAP

function parseConditions(player) {
  try {
    const raw = player.conditions
    if (!raw) return []
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function kickPlayer(player) {
  if (!confirm(`Expulser ${player.player_name} de la session ?`)) return
  const socket = getSocket()
  socket.emit('kick-player', { playerId: player.id })
  // Optimistic update: remove the player from the list immediately so the
  // GM screen reflects the kick even before the server event round-trip.
  sessionStore.removePlayer(player.id)
}
</script>

<template>
  <div class="player-list">
    <h2 class="section-title">✦ Joueurs Connectés</h2>
    <div v-if="sessionStore.players.length === 0" class="empty-list">
      <p>Aucun joueur connecté.</p>
    </div>
    <div v-else class="players">
      <div v-for="player in sessionStore.players" :key="player.id" class="player-item">
        <div class="player-row-top">
          <AppIcon icon="game-icons:crossed-swords" size="1rem" color="var(--color-gold-bright)" />
          <span class="player-name">{{ player.player_name }}</span>
          <AppIcon v-if="player.is_concentrating" icon="game-icons:bulls-eye" size="0.95rem" color="var(--color-info-bright)" title="Concentration" />
          <span class="initiative-badge"><AppIcon icon="game-icons:dice-six-faces-five" size="0.85rem" /> {{ player.initiative ?? '—' }}</span>
          <span class="ac-badge"><AppIcon icon="game-icons:shield" size="0.85rem" color="var(--color-gold-bright)" /> {{ player.ac ?? '?' }}</span>
          <span class="hp-text" :style="{ color: hpColor(player) }">
            <AppIcon icon="game-icons:hearts" size="0.85rem" /> {{ player.current_hp ?? '?' }}<span class="hp-max">/ {{ player.max_hp ?? '?' }}</span>
          </span>
          <span class="player-badge">En ligne</span>
          <button class="kick-btn" @click="kickPlayer(player)" title="Expulser de la session">✕</button>
        </div>
        <div v-if="player.max_hp" class="hp-bar-track">
          <div class="hp-bar-fill"
            :style="{ width: hpPercent(player) + '%', background: hpColor(player) }"
          />
        </div>
        <div v-if="parseConditions(player).length > 0" class="conditions-row">
          <span
            v-for="cid in parseConditions(player)"
            :key="cid"
            class="condition-badge"
          >
            <AppIcon
              :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
              :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
              size="0.85rem"
            />
            {{ CONDITION_LABELS[cid]?.label || cid }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-list { margin-top: 1.5rem; }

.section-title {
  font-family: var(--font-heading); font-size: 0.75rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--color-gold-dark); margin-bottom: 0.75rem;
}
.empty-list { font-family: var(--font-body); color: var(--color-text-dim); font-size: 0.9rem; padding: 0.5rem 0; }

.players { display: flex; flex-direction: column; gap: 0.6rem; }

.player-item {
  padding: 0.6rem 0.75rem;
  background: var(--admin-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.player-row-top { display: flex; align-items: center; gap: 0.6rem; }
.player-icon { font-size: 1rem; }
.player-name { flex: 1; font-family: var(--font-heading); font-size: 0.9rem; color: var(--color-parchment); }

.ac-badge {
  font-family: var(--font-heading); font-size: 0.65rem; letter-spacing: 0.05em;
  color: var(--color-gold-bright); background: var(--admin-gold-bg, var(--surface-gold-soft)); border: 1px solid var(--color-gold-dark);
  border-radius: 20px; padding: 0.1rem 0.45rem;
}
.initiative-badge {
  font-family: var(--font-heading); font-size: 0.65rem; letter-spacing: 0.05em;
  color: var(--admin-info-text, var(--color-info-bright)); background: var(--admin-info-bg, var(--color-info-soft)); border: 1px solid var(--admin-info-border, var(--color-info-border));
  border-radius: 20px; padding: 0.1rem 0.45rem;
}
.hp-text {
  font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700;
  transition: color 0.3s;
}
.hp-max { font-size: 0.6rem; color: var(--color-text-dim); margin-left: 2px; }

.player-badge {
  font-family: var(--font-heading); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--admin-success-text, var(--color-success)); background: var(--admin-success-bg, var(--color-success-soft)); border: 1px solid var(--admin-success-border, var(--color-success-border));
  padding: 0.15rem 0.4rem; border-radius: 20px;
}

.hp-bar-track { height: 4px; background: var(--surface-track); border-radius: 2px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease, background 0.5s ease; }

.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  color: var(--admin-warning-text, var(--color-warning));
  background: var(--admin-warning-bg, var(--color-warning-soft));
  border: 1px solid var(--admin-warning-border, var(--color-warning-border));
  border-radius: 20px;
  padding: 0.1rem 0.4rem;
  white-space: nowrap;
}

.kick-btn {
  background: none;
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 4px;
  color: var(--admin-danger-text, var(--color-danger));
  padding: 0.1rem 0.35rem;
  font-size: 0.65rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
  margin-left: auto;
}
.kick-btn:hover { background: var(--admin-danger-bg, var(--color-danger-soft)); border-color: var(--admin-danger-border, var(--color-danger-border)); }
</style>
