<script setup>
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import { DND_CONDITIONS_MAP } from '@/utils/conditions.js'

import { BACKEND_URL } from '@/config.js'

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
function hpGlow(player) {
  const pct = hpPercent(player)
  if (pct > 50) return 'rgba(47,184,150,0.18)'
  if (pct > 20) return 'rgba(240,165,0,0.18)'
  return 'rgba(255,107,107,0.22)'
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
  sessionStore.removePlayer(player.id)
}

function avatarSrc(player) {
  if (!player.avatar_url) return null
  return player.avatar_url.startsWith('/uploads/')
    ? BACKEND_URL + player.avatar_url
    : player.avatar_url
}
</script>

<template>
  <div class="player-list">
    <div class="list-header">
      <h2 class="section-title"><AppIcon icon="game-icons:wizard-staff" size="0.85em" /> Joueurs Connectés</h2>
      <span class="player-count-badge">{{ sessionStore.players.length }}</span>
    </div>

    <div v-if="sessionStore.players.length === 0" class="empty-list">
      <AppIcon icon="lucide:users" size="2rem" color="var(--color-border)" />
      <p>Aucun joueur connecté.</p>
    </div>

    <TransitionGroup name="player-card" tag="div" class="players-grid" v-else>
      <div
        v-for="player in sessionStore.players"
        :key="player.id"
        class="player-card"
        :data-testid="`player-row-${player.id}`"
      >
        <!-- Avatar + identité -->
        <div class="card-header">
          <div class="avatar-wrap">
            <img v-if="avatarSrc(player)" :src="avatarSrc(player)" :alt="player.player_name" class="avatar-img" />
            <span v-else class="avatar-fallback">
              <AppIcon icon="game-icons:crossed-swords" size="1.1rem" color="var(--color-gold-bright)" />
            </span>
          </div>
          <div class="card-identity">
            <span class="card-name" :data-testid="`player-name-${player.id}`">{{ player.player_name }}</span>
            <span v-if="player.dnd_class" class="card-class">{{ player.dnd_class }}</span>
          </div>
          <div class="card-badges">
            <AppIcon v-if="player.is_concentrating" icon="game-icons:bullseye" size="1rem"
              color="var(--color-info-bright)" title="Concentration"
              :data-testid="`player-concentrating-${player.id}`" />
            <span class="badge badge-init" :data-testid="`player-initiative-${player.id}`">
              <AppIcon icon="game-icons:dice-six-faces-five" size="0.8rem" />
              {{ player.initiative ?? '—' }}
            </span>
            <span class="badge badge-ac">
              <AppIcon icon="game-icons:shield" size="0.8rem" color="var(--color-gold-bright)" />
              {{ player.ac ?? '?' }}
            </span>
          </div>
          <button class="kick-btn" @click="kickPlayer(player)" title="Expulser"
            :data-testid="`kick-button-${player.id}`">
            <AppIcon icon="lucide:x" size="0.85rem" />
          </button>
        </div>

        <!-- Barre HP -->
        <div class="hp-section" v-if="player.max_hp">
          <div class="hp-label-row">
            <span class="hp-icon"><AppIcon icon="game-icons:hearts" size="0.8rem" color="var(--color-danger)" /></span>
            <span class="hp-value" :style="{ color: hpColor(player) }" :data-testid="`player-hp-${player.id}`">
              {{ player.current_hp ?? '?' }}
            </span>
            <span class="hp-max">/ {{ player.max_hp }}</span>
            <span class="hp-pct">{{ Math.round(hpPercent(player)) }}%</span>
          </div>
          <div class="hp-bar-track">
            <div
              class="hp-bar-fill"
              :style="{
                width: hpPercent(player) + '%',
                background: hpColor(player),
                boxShadow: `0 0 8px ${hpGlow(player)}`
              }"
            />
          </div>
        </div>

        <!-- Conditions -->
        <div v-if="parseConditions(player).length > 0" class="conditions-row">
          <span v-for="cid in parseConditions(player)" :key="cid" class="condition-badge">
            <AppIcon
              :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
              :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
              size="0.75rem"
            />
            {{ CONDITION_LABELS[cid]?.label || cid }}
          </span>
        </div>

        <span class="online-badge">● En ligne</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.player-list { margin-top: 1rem; }

.list-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.player-count-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border: 1px solid var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
}

/* Grid responsive */
.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.65rem;
}

.player-card {
  background: var(--admin-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.player-card:hover {
  border-color: var(--color-gold-dark);
  box-shadow: var(--shadow-soft);
}

/* Header de la carte */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.avatar-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--color-gold-dark);
  overflow: hidden;
  background: var(--surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback { display: flex; }

.card-identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}
.card-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.88rem;
  color: var(--color-parchment);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-class {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.card-badges {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  border-radius: 20px;
  padding: 0.1rem 0.4rem;
  border: 1px solid;
}
.badge-init {
  color: var(--admin-info-text, var(--color-info-bright));
  background: var(--admin-info-bg, var(--color-info-soft));
  border-color: var(--admin-info-border, var(--color-info-border));
}
.badge-ac {
  color: var(--color-gold-bright);
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border-color: var(--color-gold-dark);
}

/* Barre HP */
.hp-section { display: flex; flex-direction: column; gap: 0.3rem; }
.hp-label-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-heading), sans-serif;
}
.hp-icon { display: flex; }
.hp-value { font-size: 0.95rem; font-weight: 700; transition: color 0.35s; }
.hp-max { font-size: 0.65rem; color: var(--color-text-dim); }
.hp-pct { margin-left: auto; font-size: 0.62rem; color: var(--color-text-dim); }

.hp-bar-track {
  height: 10px;
  background: var(--surface-track);
  border-radius: 5px;
  overflow: hidden;
}
.hp-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.55s ease, background 0.55s ease, box-shadow 0.55s ease;
}

/* Conditions */
.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  letter-spacing: 0.04em;
  color: var(--admin-warning-text, var(--color-warning));
  background: var(--admin-warning-bg, var(--color-warning-soft));
  border: 1px solid var(--admin-warning-border, var(--color-warning-border));
  border-radius: 20px;
  padding: 0.1rem 0.4rem;
  white-space: nowrap;
}

.online-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--admin-success-text, var(--color-success));
  opacity: 0.75;
  align-self: flex-end;
}

.kick-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-dim);
  padding: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.18s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.kick-btn:hover {
  background: var(--admin-danger-bg, var(--color-danger-soft));
  border-color: var(--admin-danger-border, var(--color-danger-border));
  color: var(--admin-danger-text, var(--color-danger));
}

/* TransitionGroup animations (global car TransitionGroup génère des classes hors scope) */
:global(.player-card-enter-active) { animation: fadeUp 0.25s ease both; }
:global(.player-card-leave-active) { transition: opacity 0.2s ease, transform 0.2s ease; }
:global(.player-card-leave-to) { opacity: 0; transform: scale(0.95); }
</style>
