<script setup>
import AppIcon from '../AppIcon.vue'
import { DND_CONDITIONS_MAP } from '@/utils/conditions.js'
import { BACKEND_URL } from '@/config.js'

const TEMP_HP_COLOR = 'var(--tv-info-text)'

const props = defineProps({
  players: { type: Array, default: () => [] },
  combatRound: { type: Number, default: 0 },
  hpAnimations: { type: Object, default: () => ({}) },
})

const CONDITION_LABELS = DND_CONDITIONS_MAP

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function avatarUrl(player) {
  if (!player.avatar_url) return null
  return resolveMediaUrl(player.avatar_url)
}

function hpPercent(player) {
  if (!player.max_hp) return 100
  const displayedBaseHp = Math.min(player.max_hp, Math.max(0, player.current_hp ?? 0))
  return Math.min(100, Math.max(0, (displayedBaseHp / player.max_hp) * 100))
}

function hpBarColor(player) {
  if (temporaryHp(player) > 0) return TEMP_HP_COLOR
  const pct = hpPercent(player)
  if (pct > 50) return 'var(--tv-success-text)'
  if (pct > 20) return 'var(--tv-warning-text)'
  return 'var(--tv-danger-text)'
}

function temporaryHp(player) {
  return Math.max(0, (player.current_hp ?? 0) - (player.max_hp ?? 0))
}

function displayedCurrentHp(player) {
  const current = Number(player.current_hp ?? 0)
  const max = Number(player.max_hp)
  if (!Number.isFinite(max) || max <= 0) return Math.max(0, current)
  return Math.max(0, Math.min(current, max))
}

function parseConditions(player) {
  try {
    const raw = player.conditions
    if (!raw) return []
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
</script>

<template>
  <div v-if="players.length === 0" class="tv-empty">
    <p class="empty-icon"><AppIcon icon="game-icons:castle" size="2.5rem" color="var(--color-text-dim)" /></p>
    <p class="empty-text">En attente des aventuriers…</p>
  </div>

  <template v-else>
    <div class="combat-header">
      <div class="combat-round-badge" data-testid="tv-round">
        <AppIcon icon="game-icons:crossed-swords" size="1em" /> Round {{ combatRound }}
      </div>
    </div>
    <main class="party-grid">
      <div
        v-for="player in players"
        :key="player.id"
        class="player-card"
        :class="{
          'is-damage': hpAnimations[player.id]?.type === 'damage',
          'is-heal': hpAnimations[player.id]?.type === 'heal',
          'is-critical': hpPercent(player) <= 20 && hpPercent(player) > 0,
          'is-ko': hpPercent(player) <= 0,
        }"
        :data-testid="`tv-player-card-${player.id}`"
      >
        <div class="card-header">
          <div class="card-avatar">
            <img v-if="avatarUrl(player)" :src="avatarUrl(player)" :alt="player.player_name" class="avatar-img" />
            <span v-else class="avatar-fallback">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
          </div>
          <div class="card-identity">
            <span class="card-name">{{ player.player_name }}</span>
            <span v-if="player.dnd_class" class="class-badge">{{ player.dnd_class }}</span>
          </div>
          <div class="initiative-badge"><AppIcon icon="game-icons:dice-six-faces-five" size="1em" /> {{ player.initiative ?? '—' }}</div>
          <div class="ac-shield">
            <span class="ac-icon"><AppIcon icon="game-icons:shield" size="1em" color="var(--color-gold-bright)" /></span>
            <span class="ac-value">{{ player.ac ?? 10 }}</span>
          </div>
          <span v-if="player.is_concentrating" class="concentration-badge" title="Concentration">
            <AppIcon icon="game-icons:bullseye" size="1em" color="var(--tv-info-text, var(--color-info-bright))" />
          </span>
        </div>

        <div class="hp-section">
          <div class="hp-numbers">
            <span class="hp-current" :style="{ color: hpBarColor(player) }">{{ displayedCurrentHp(player) }}</span>
            <span class="hp-separator">/</span>
            <span class="hp-max">{{ player.max_hp ?? 0 }}</span>
            <span class="hp-label">PV</span>
            <span v-if="temporaryHp(player) > 0" class="hp-temp">+{{ temporaryHp(player) }} TEMP</span>
          </div>
          <div class="hp-track">
            <div class="hp-fill" :style="{ width: hpPercent(player) + '%', background: hpBarColor(player) }" />
          </div>
        </div>

        <div v-if="parseConditions(player).length > 0" class="conditions-row">
          <span
            v-for="cid in parseConditions(player)"
            :key="cid"
            class="condition-badge"
            :title="CONDITION_LABELS[cid]?.label || cid"
          >
            <AppIcon
              :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
              :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
              size="1em"
            />
            {{ CONDITION_LABELS[cid]?.label || cid }}
          </span>
        </div>

        <Transition name="hp-float">
          <div
            v-if="hpAnimations[player.id]"
            :key="hpAnimations[player.id].key"
            class="hp-delta"
            :class="hpAnimations[player.id].type === 'damage' ? 'hp-delta-damage' : 'hp-delta-heal'"
          >
            {{ hpAnimations[player.id].delta > 0 ? '+' : '' }}{{ hpAnimations[player.id].delta }}
          </div>
        </Transition>
      </div>
    </main>
  </template>
</template>

<style scoped>
.tv-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.empty-icon { font-size: 4rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading), sans-serif; font-size: 1.5rem; color: var(--color-text-dim); letter-spacing: 0.2em; }

.combat-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem 0;
}
.combat-round-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1.2rem;
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.15em;
  color: var(--color-gold-bright);
  text-transform: uppercase;
}

.party-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  padding: 0.75rem;
  align-content: start;
  overflow: auto;
}

.player-card {
  background: var(--tv-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  position: relative;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.player-card.is-damage {
  border-color: var(--tv-danger-border);
  box-shadow: 0 0 18px var(--tv-danger-bg);
  animation: card-damage-flash 0.4s ease;
}
.player-card.is-heal {
  border-color: var(--tv-success-border);
  box-shadow: 0 0 18px var(--tv-success-bg);
}
.player-card.is-critical {
  border-color: var(--tv-danger-border);
  box-shadow: 0 0 10px var(--tv-danger-bg);
  animation: pulse-critical 1.5s ease-in-out infinite;
}
.player-card.is-ko {
  opacity: 0.5;
  filter: grayscale(0.7);
  border-color: var(--color-border);
}
@keyframes card-damage-flash {
  0% { background: var(--tv-danger-bg); }
  100% { background: var(--tv-panel-bg); }
}
@keyframes pulse-critical {
  0%, 100% { box-shadow: 0 0 8px var(--tv-danger-bg); }
  50% { box-shadow: 0 0 20px var(--tv-danger-border); }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.card-avatar {
  width: 3rem; height: 3rem;
  border-radius: 50%;
  border: 2px solid var(--color-gold-dark);
  overflow: hidden;
  background: var(--tv-control-bg);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback {
  font-family: var(--font-title), sans-serif;
  font-size: 1.2rem;
  color: var(--color-gold-dark);
}
.card-identity {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.card-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  letter-spacing: 0.06em;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.class-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.initiative-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: var(--tv-control-bg-muted);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  white-space: nowrap;
}
.ac-shield {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.25rem 0.45rem;
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  white-space: nowrap;
}
.ac-icon { display: flex; align-items: center; }
.ac-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--color-gold-bright);
}
.concentration-badge { display: flex; align-items: center; }

.hp-section { display: flex; flex-direction: column; gap: 0.3rem; }
.hp-numbers {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-family: var(--font-heading), sans-serif;
}
.hp-current { font-size: 1.6rem; font-weight: bold; line-height: 1; }
.hp-separator { font-size: 1rem; color: var(--color-text-dim); }
.hp-max { font-size: 1rem; color: var(--color-text-dim); }
.hp-label {
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-left: 0.1rem;
}
.hp-temp {
  font-size: 0.72rem;
  color: var(--tv-info-text);
  letter-spacing: 0.05em;
  margin-left: auto;
}
.hp-track {
  height: 8px;
  background: var(--tv-track-bg);
  border-radius: 4px;
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease, background 0.5s ease;
}

.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.45rem;
  background: var(--tv-control-bg-muted);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  color: var(--color-text-dim);
}

.hp-delta {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  font-family: var(--font-title), sans-serif;
  font-size: 1.6rem;
  font-weight: bold;
  pointer-events: none;
  z-index: 5;
}
.hp-delta-damage { color: var(--tv-danger-text); }
.hp-delta-heal { color: var(--tv-success-text); }

.hp-float-enter-active { animation: float-up 2s ease forwards; }
.hp-float-leave-active { opacity: 0; }
@keyframes float-up {
  0% { opacity: 1; transform: translateY(0); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-2.5rem); }
}
</style>
