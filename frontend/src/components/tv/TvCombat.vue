<script setup>
import { computed, onMounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useConditions } from '@/composables/useConditions.js'
import { parsePlayerConditions } from '@/utils/conditions.js'
import { hpTier } from '@/utils/hp.js'
import { BACKEND_URL } from '@/config.js'

const TEMP_HP_COLOR = 'var(--tv-info-text)'

const props = defineProps({
  players: { type: Array, default: () => [] },
  combatRound: { type: Number, default: 0 },
  hpAnimations: { type: Object, default: () => ({}) },
})

const { conditions: dndConditions, load: loadConditions } = useConditions()
onMounted(loadConditions)
const CONDITION_LABELS = computed(() => Object.fromEntries(dndConditions.value.map(c => [c.id, c])))

// Grille de référence fixée à 3x2 (6 cases) : la taille des cartes reste constante de 1 à 6
// joueurs (les cases inutilisées restent vides plutôt que de laisser les cartes grossir).
// Au-delà de 6, la grille grandit (colonnes proches d'un carré) et les cartes rétrécissent pour
// que tout le monde tienne sans scroller.
const REFERENCE_COLS = 3
const REFERENCE_ROWS = 2
const gridCols = computed(() => {
  const n = props.players.length
  if (n <= REFERENCE_COLS * REFERENCE_ROWS) return REFERENCE_COLS
  return Math.max(REFERENCE_COLS, Math.ceil(Math.sqrt(n)))
})
const gridRows = computed(() => {
  const n = props.players.length
  if (n <= REFERENCE_COLS * REFERENCE_ROWS) return REFERENCE_ROWS
  return Math.max(REFERENCE_ROWS, Math.ceil(n / gridCols.value))
})

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

const HP_TIER_COLORS = {
  healthy: 'var(--tv-success-text)',
  warning: 'var(--tv-warning-text)',
  critical: 'var(--tv-danger-text)',
}
function hpBarColor(player) {
  if (temporaryHp(player) > 0) return TEMP_HP_COLOR
  return HP_TIER_COLORS[hpTier(hpPercent(player))]
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
  return parsePlayerConditions(player.conditions)
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
    <main
      class="party-grid"
      :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gridTemplateRows: `repeat(${gridRows}, 1fr)` }"
    >
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
        <div class="card-top-row">
          <div class="card-avatar">
            <img v-if="avatarUrl(player)" :src="avatarUrl(player)" :alt="player.player_name" class="avatar-img" />
            <span v-else class="avatar-fallback">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
          </div>
          <div class="card-identity">
            <span class="card-name">{{ player.player_name }}</span>
            <span v-if="player.dnd_class" class="class-badge">{{ player.dnd_class }}</span>
          </div>
          <div class="mini-stats">
            <span class="mini-badge" title="Initiative">
              <AppIcon icon="game-icons:dice-six-faces-five" size="1.1em" /> {{ player.initiative ?? '—' }}
            </span>
            <span class="mini-badge mini-ac" title="Classe d'armure">
              <AppIcon icon="game-icons:shield" size="1.1em" color="var(--color-gold-bright)" /> {{ player.ac ?? 10 }}
            </span>
            <span v-if="player.is_concentrating" class="concentration-badge" title="Concentration">
              <AppIcon icon="game-icons:bullseye" size="1.3em" color="var(--tv-info-text, var(--color-info-bright))" />
            </span>
          </div>
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
            :style="{ '--cond-color': CONDITION_LABELS[cid]?.color || 'var(--color-text-dim)' }"
            :title="CONDITION_LABELS[cid]?.label || cid"
          >
            <AppIcon
              :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
              :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
              size="1.3em"
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
  gap: 0.5rem;
  padding: 0.6rem 1.8rem;
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  font-family: var(--font-heading), sans-serif;
  font-size: 1.4rem;
  letter-spacing: 0.15em;
  color: var(--color-gold-bright);
  text-transform: uppercase;
}

.party-grid {
  flex: 1;
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
  align-content: stretch;
  overflow: auto;
}

.player-card {
  background: var(--tv-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 1.5rem 1.75rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
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

.card-top-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* Médaillon avatar rond (ou carré si l'image ne l'est pas) plutôt qu'une bande pleine hauteur :
   reste identifiable de loin sans imposer une forme qui ne correspond pas aux tokens des joueurs. */
.card-avatar {
  flex: 0 0 clamp(80px, 11vw, 130px);
  width: clamp(80px, 11vw, 130px);
  height: clamp(80px, 11vw, 130px);
  border-radius: 50%;
  border: 3px solid var(--color-gold-dark);
  overflow: hidden;
  background: var(--tv-control-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2rem, 4vw, 3.4rem);
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
  font-weight: 700;
  font-size: clamp(1.9rem, 2.8vw, 2.8rem);
  letter-spacing: 0.04em;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.class-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.2rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.mini-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.mini-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  background: var(--tv-control-bg-muted);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: var(--font-heading), sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-dim);
  white-space: nowrap;
}
.mini-badge.mini-ac {
  background: var(--tv-gold-bg);
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  font-weight: bold;
}
.concentration-badge { display: flex; align-items: center; }

/* Section PV : le point focal de la carte, elle absorbe l'espace vertical disponible plutôt
   que de laisser du vide entre l'en-tête et le bas de carte. */
.hp-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.9rem;
}
.hp-numbers {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-family: var(--font-heading), sans-serif;
}
.hp-current { font-size: clamp(3rem, 6vw, 5.5rem); font-weight: bold; line-height: 1; }
.hp-separator { font-size: clamp(1.6rem, 2.4vw, 2.4rem); color: var(--color-text-dim); }
.hp-max { font-size: clamp(1.6rem, 2.4vw, 2.4rem); color: var(--color-text-dim); }
.hp-label {
  font-size: 1.2rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-left: 0.15rem;
}
.hp-temp {
  font-size: 1.25rem;
  color: var(--tv-info-text);
  letter-spacing: 0.05em;
  margin-left: auto;
}
.hp-track {
  height: clamp(22px, 3vw, 40px);
  background: var(--tv-track-bg);
  border-radius: 999px;
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease, background 0.5s ease;
}

.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.9rem;
  background: color-mix(in srgb, var(--cond-color) 22%, var(--tv-panel-bg));
  border: 1px solid var(--cond-color);
  border-radius: 999px;
  font-family: var(--font-heading), sans-serif;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--cond-color);
}

.hp-delta {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  font-family: var(--font-title), sans-serif;
  font-size: 2.6rem;
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
