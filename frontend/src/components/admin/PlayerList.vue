<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { useConditions } from '@/composables/useConditions.js'
import { parsePlayerConditions } from '@/utils/conditions.js'
import { hpTier } from '@/utils/hp.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { getDefensiveSummary } from '@/utils/defensiveTraits.js'
import { adminTabRoute } from '@/utils/adminRoute.js'

import { BACKEND_URL } from '@/config.js'

// ── Résumé résistances/immunités/sens (voir defensiveTraits.js) ────────────
const defensiveTraitsData = ref(null)
onMounted(async () => {
  try {
    const res = await apiFetch('/api/defensive-traits')
    if (res.ok) defensiveTraitsData.value = await res.json()
  } catch (err) { console.error(err) }
})

const DEFENSE_CATEGORIES = [
  { key: 'resistances', icon: 'lucide:shield-half', label: 'Résistance', color: 'var(--color-info-bright)' },
  { key: 'immunities', icon: 'lucide:shield-check', label: 'Immunité', color: 'var(--color-success)' },
  { key: 'senses', icon: 'lucide:eye', label: 'Sens', color: 'var(--color-gold-bright)' },
  { key: 'advantages', icon: 'lucide:trending-up', label: 'Avantage JdS', color: 'var(--color-gold-dark)' },
  { key: 'other', icon: 'lucide:info', label: 'Particularité', color: 'var(--color-text-dim)' },
]

function defensiveBadges(player) {
  const summary = getDefensiveSummary(defensiveTraitsData.value, {
    race: player.race, dndClass: player.dnd_class, subclass: player.subclass,
  })
  if (!summary) return []
  return DEFENSE_CATEGORIES.flatMap(cat =>
    (summary[cat.key] || []).map(value => ({ ...cat, value }))
  )
}

function hpPercent(player) {
  if (!player.max_hp) return 100
  return Math.min(100, Math.max(0, (player.current_hp / player.max_hp) * 100))
}
const HP_TIER_COLORS = {
  healthy: 'var(--admin-success-text, var(--color-success))',
  warning: 'var(--admin-warning-text, var(--color-warning))',
  critical: 'var(--admin-danger-text, var(--color-danger))',
}
const HP_TIER_GLOW = {
  healthy: 'rgba(var(--color-success-rgb), 0.18)',
  warning: 'rgba(var(--color-warning-rgb), 0.18)',
  critical: 'rgba(var(--color-danger-rgb), 0.22)',
}
function hpColor(player) {
  return HP_TIER_COLORS[hpTier(hpPercent(player))]
}
function hpGlow(player) {
  return HP_TIER_GLOW[hpTier(hpPercent(player))]
}

const { conditions: dndConditions, load: loadConditions } = useConditions()
onMounted(loadConditions)
const CONDITION_LABELS = computed(() => Object.fromEntries(dndConditions.value.map(c => [c.id, c])))
const router = useRouter()

// Navigue vers la fiche complète de l'état (onglet Contenu > États) — le slug est la clé
// commune entre ce catalogue de combat (conditions.js) et le catalogue de règles
// (backend/src/data/dnd_conditions.json), voir la note dans conditions.js.
function openConditionSheet(cid) {
  const cond = CONDITION_LABELS.value[cid]
  if (!cond?.slug) return
  router.push(adminTabRoute('conditions', { q: cond.label, slug: cond.slug }))
}

function parseConditions(player) {
  return parsePlayerConditions(player.conditions)
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
        <!-- Avatar + identité. Nom + badges sur une ligne fixe (comme la carte TV, cf.
             TvCombat.vue) ; la ligne classe/sous-classe/race est plus longue ici qu'en TV
             (qui n'affiche que la classe) et vit donc sur sa propre ligne pleine largeur —
             sinon elle se retrouvait compressée dans les ~110px restants à côté des badges,
             passait sur 3 lignes et étirait toute la carte de façon désaxée. -->
        <div class="card-header">
          <div class="avatar-wrap">
            <img v-if="avatarSrc(player)" :src="avatarSrc(player)" :alt="player.player_name" class="avatar-img" />
            <span v-else class="avatar-fallback">
              <AppIcon icon="game-icons:crossed-swords" size="1.1rem" color="var(--color-gold-bright)" />
            </span>
          </div>
          <span class="card-name" :data-testid="`player-name-${player.id}`">{{ player.player_name }}</span>
          <div class="card-badges">
            <AppIcon v-if="player.is_concentrating" icon="game-icons:bullseye" size="1rem"
              color="var(--color-info-bright)" title="Concentration"
              :data-testid="`player-concentrating-${player.id}`" />
            <span class="badge badge-init" :data-testid="`player-initiative-${player.id}`">
              <AppIcon icon="game-icons:dice-six-faces-five" size="0.8rem" />
              {{ player.initiative ?? '—' }}
            </span>
            <span class="badge badge-ac" :data-testid="`player-ac-${player.id}`">
              <AppIcon icon="game-icons:shield" size="0.8rem" color="var(--color-gold-bright)" />
              {{ player.ac ?? '?' }}
            </span>
          </div>
          <HelpTip id="admin.kick">
            <button class="kick-btn" @click="kickPlayer(player)" title="Expulser"
              :data-testid="`kick-button-${player.id}`">
              <AppIcon icon="lucide:x" size="0.85rem" />
            </button>
          </HelpTip>
        </div>
        <span v-if="player.dnd_class || player.race" class="card-class">
          {{ [player.dnd_class, player.subclass, player.race].filter(Boolean).join(' · ') }}
        </span>

        <!-- Barre HP -->
        <div class="hp-section" v-if="player.max_hp">
          <div class="hp-label-row">
            <span class="hp-icon"><AppIcon icon="game-icons:hearts" size="0.8rem" color="var(--color-danger)" /></span>
            <span class="hp-value" :style="{ color: hpColor(player) }" :data-testid="`player-hp-${player.id}`">
              {{ player.current_hp ?? '?' }}
            </span>
            <span class="hp-max">/ {{ player.max_hp }}</span>
            <span v-if="player.temp_hp > 0" class="hp-temp" :data-testid="`player-temp-hp-${player.id}`">+{{ player.temp_hp }} TEMP</span>
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
          <button
            v-for="cid in parseConditions(player)"
            :key="cid"
            type="button"
            class="condition-badge"
            :title="`Voir la fiche « ${CONDITION_LABELS[cid]?.label || cid} »`"
            @click="openConditionSheet(cid)"
          >
            <AppIcon
              :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
              :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
              size="0.75rem"
            />
            {{ CONDITION_LABELS[cid]?.label || cid }}
          </button>
        </div>

        <!-- Résistances / immunités / sens (voir defensiveTraits.js) -->
        <div v-if="defensiveBadges(player).length > 0" class="defense-row">
          <span
            v-for="(badge, idx) in defensiveBadges(player)"
            :key="`${badge.key}-${idx}`"
            class="defense-badge"
            :title="badge.label"
          >
            <AppIcon :icon="badge.icon" :color="badge.color" size="0.75rem" />
            {{ badge.value }}
          </span>
        </div>

        <span class="online-badge">● En ligne</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.player-list { margin-top: var(--space-4); }

.list-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.player-count-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  padding: 0.1rem var(--space-2);
  border-radius: 999px;
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border: 1px solid var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) 0;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.1em;
}

/* Grid responsive : 3 colonnes fixes en desktop plutôt que l'auto-fill précédent (qui
   pouvait tomber à 2 et laisser les cartes trop larges) — plus de rangées visibles sans
   scroll. Mobile-first, mêmes paliers que PlayerGrimoireIndex.vue. */
.players-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}
@media (min-width: 640px) {
  .players-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .players-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.player-card {
  background: var(--admin-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
  gap: var(--space-2);
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

.card-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-parchment);
  overflow-wrap: break-word;
}
/* Ligne pleine largeur, sous card-header — voir le commentaire du template. */
.card-class {
  display: block;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-badges {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  border-radius: 20px;
  padding: 0.1rem var(--space-2);
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
.hp-section { display: flex; flex-direction: column; gap: var(--space-1); }
.hp-label-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-heading), sans-serif;
}
.hp-icon { display: flex; }
.hp-value { font-size: var(--text-md); font-weight: 700; transition: color 0.35s; }
.hp-max { font-size: var(--text-xs); color: var(--color-text-dim); }
.hp-temp { font-size: var(--text-2xs); color: var(--color-info-bright); letter-spacing: 0.04em; }
.hp-pct { margin-left: auto; font-size: var(--text-2xs); color: var(--color-text-dim); }

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
  gap: var(--space-1);
}
.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.04em;
  color: var(--admin-warning-text, var(--color-warning));
  background: var(--admin-warning-bg, var(--color-warning-soft));
  border: 1px solid var(--admin-warning-border, var(--color-warning-border));
  border-radius: 20px;
  padding: 0.1rem var(--space-2);
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.condition-badge:hover, .condition-badge:focus-visible {
  color: var(--color-gold-bright);
  border-color: var(--color-gold-dark);
}

/* Résistances / immunités / sens */
.defense-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.defense-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.02em;
  color: var(--color-text-dim);
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.1rem var(--space-2);
  white-space: nowrap;
}

.online-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
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
  font-size: var(--text-sm);
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
/* noinspection CssUnusedSymbol */
:global(.player-card-enter-active) { animation: fadeUp 0.25s ease both; }
/* noinspection CssUnusedSymbol */
:global(.player-card-leave-active) { transition: opacity 0.2s ease, transform 0.2s ease; }
/* noinspection CssUnusedSymbol */
:global(.player-card-leave-to) { opacity: 0; transform: scale(0.95); }
</style>
