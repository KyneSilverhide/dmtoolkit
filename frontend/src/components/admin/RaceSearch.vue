<script setup>
import { ref, computed, onMounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { useDebouncedTabFilter } from '@/composables/useDebouncedTabFilter.js'
import { spellCandidates, withGlossary } from '@/utils/textLinker.js'
import { stripAccents } from '@/utils/slugify.js'
import ContentActionButtons from './ContentActionButtons.vue'

// Écran joueur : endpoints publics + pas de boutons TV/Envoyer (voir SpellSearch.vue).
const props = defineProps({
  playerMode: { type: Boolean, default: false },
})

const tabQuery = useContentTabQuery('races')
// exactMatch (renommé exactSlugFilter) : slug exact ciblé depuis la palette de commande
// (Ctrl+K) — si renseigné, la liste est réduite à cette seule race plutôt qu'à toutes
// celles correspondant au texte recherché.
const { query, exactMatch: exactSlugFilter, clearExactMatch } = useDebouncedTabFilter(tabQuery)

const races = ref([])
const loading = ref(false)
const loadError = ref(false)

async function loadRaces() {
  loading.value = true
  loadError.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/races/public/full`)
      : await apiFetch('/api/races', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      const data = await res.json()
      for (const race of data) {
        if (race.subraces?.length) race.subraces.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      }
      races.value = data.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    } else {
      loadError.value = true
    }
  } catch (err) {
    console.error(err)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const spells = ref([])
async function loadSpells() {
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/spells/public`)
      : await apiFetch('/api/spells', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) spells.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => { loadRaces(); loadSpells() })

const refCandidates = computed(() => withGlossary(spellCandidates(spells.value)))

function raceMatches(race, q) {
  if (stripAccents(race.name.toLowerCase()).includes(q)) return true
  if (stripAccents((race.ability_bonus || '').toLowerCase()).includes(q)) return true
  if ((race.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))) return true
  return (race.subraces || []).some(sr =>
    stripAccents(sr.name.toLowerCase()).includes(q) ||
    (sr.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))
  )
}

const filteredRaces = computed(() => {
  if (exactSlugFilter.value) return races.value.filter(race => race.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return races.value
  return races.value.filter(race => raceMatches(race, q))
})

</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="game-icons:vitruvian-man" size="0.9em" /> Races</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, trait, bonus de caractéristique…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les races.</p>
    </div>

    <div v-else-if="filteredRaces.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune race trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredRaces.length }} race(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="race in filteredRaces" :key="race.slug" class="race-card">
        <template v-if="race.image">
          <div class="race-image-hover-zone"></div>
          <div class="race-image-float">
            <img :src="race.image" :alt="race.name" class="race-image" loading="lazy" />
            <span v-if="race.image_credit" class="race-image-credit">{{ race.image_credit }}</span>
          </div>
        </template>

        <!-- Regroupe tout le contenu textuel (hors pied de fiche) pour pouvoir borner sa
             largeur d'un seul bloc quand une image est incrustée (voir .race-content ci-
             dessous) : l'image est haute (11rem+), donc l'en-tête, la description, les
             attributs ET les premiers traits peuvent tous se retrouver sous sa zone opaque. -->
        <div class="race-content">
          <div class="race-header">
            <AppIcon :icon="race.icon" size="1.6rem" class="race-icon" />
            <div class="race-header-main">
              <h3 class="race-name">{{ race.name }}</h3>
              <span class="ability-badge">{{ race.ability_bonus }}</span>
            </div>
          </div>

          <p v-if="race.description" class="race-description">{{ race.description }}</p>

          <div class="race-attrs">
            <span class="race-attr"><AppIcon icon="lucide:ruler" size="0.75em" /> {{ race.size }}</span>
            <span class="race-attr"><AppIcon icon="lucide:footprints" size="0.75em" /> {{ race.speed }}</span>
            <span class="race-attr"><AppIcon icon="lucide:hourglass" size="0.75em" /> {{ race.age }}</span>
            <span class="race-attr"><AppIcon icon="lucide:languages" size="0.75em" /> {{ race.languages.join(', ') }}</span>
          </div>

          <ul v-if="race.traits.length" class="trait-list">
            <li v-for="trait in race.traits" :key="trait.name" class="trait-item">
              <span class="trait-name">{{ trait.name }}</span>
              <span class="trait-desc"><LinkedText :text="trait.description" :candidates="refCandidates" :trait-name="trait.name" /></span>
            </li>
          </ul>

          <div v-if="race.subraces.length" class="subrace-list">
            <div v-for="subrace in race.subraces" :key="subrace.name" class="subrace-card">
              <div class="subrace-header">
                <h4 class="subrace-name">{{ subrace.name }}</h4>
                <span class="ability-badge ability-badge-sub">{{ subrace.ability_bonus }}</span>
              </div>
              <ul class="trait-list">
                <li v-for="trait in subrace.traits" :key="trait.name" class="trait-item">
                  <span class="trait-name">{{ trait.name }}</span>
                  <span class="trait-desc"><LinkedText :text="trait.description" :candidates="refCandidates" :trait-name="trait.name" /></span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="race-footer">
          <span class="race-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ race.source }}</span>
          <a :href="race.detail_url" target="_blank" class="race-link">Voir sur AideDD ↗</a>
          <ContentActionButtons v-if="!playerMode" content-type="race" :item="race" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Squelette (barre de recherche, chargement, "aucun résultat", grille...) partagé par
 * les composants de recherche de contenu qui filtrent une liste en mémoire — voir
 * assets/content-search-shared.css. Seul le rendu de la carte de résultat, propre à ce
 * type de contenu, reste défini ci-dessous.
 */
@import '@/assets/content-search-shared.css';

.race-card {
  position: relative;
  z-index: 0;
  overflow: hidden;
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: border-color 0.2s;
}
.race-card:hover { border-color: var(--color-gold-dark); }
/* Le zoom ne doit se déclencher qu'au survol de l'image elle-même, pas de toute la
   carte : voir le commentaire équivalent dans ClassSearch.vue pour le détail du
   raisonnement (:has() remonte l'effet du déclencheur descendant jusqu'à la carte). */
.race-card:has(.race-image-hover-zone:hover) {
  z-index: 10;
  overflow: visible;
}

.race-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
/* L'image incrustée est haute (11rem+ crédit) : l'en-tête, la description, les attributs et
   les premiers traits peuvent tous se retrouver dans sa zone opaque (à droite, là où le
   masque en dégradé ne fond pas encore vers la transparence) puisqu'ils sont en flux normal
   à pleine largeur. On borne donc tout le bloc de contenu d'un coup plutôt que d'essayer de
   deviner quels éléments précis dépassent sous l'image (dépend du nombre de traits). */
.race-card:has(.race-image-float) .race-content {
  max-width: calc(100% - min(55%, 320px) - 0.75rem);
}

.race-description {
  margin: 0;
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--color-text-dim);
}

/* Incrustation en fond de carte : même traitement que ClassSearch.vue (image derrière
   le texte via z-index négatif, fondue vers le fond, crédit placé après l'image plutôt
   que dessus). */
.race-image-float {
  position: absolute;
  top: 0;
  right: 0;
  width: 55%;
  max-width: 320px;
  z-index: -1;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  transition: all 0.25s ease;
}
/* Zone invisible calquée sur la position/taille par défaut de l'image mais placée
   au-dessus du texte (z-index positif) pour capter le survol — voir ClassSearch.vue. */
.race-image-hover-zone {
  position: absolute;
  top: 0;
  right: 0;
  width: 55%;
  max-width: 320px;
  height: 11rem;
  z-index: 4;
  cursor: zoom-in;
}
.race-image-hover-zone:hover ~ .race-image-float {
  z-index: 3;
  width: auto;
  max-width: min(90vw, 480px);
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: var(--space-2);
  box-shadow: -16px 12px 32px rgba(0, 0, 0, 0.6);
}
.race-image {
  width: 100%;
  height: 11rem;
  object-fit: contain;
  object-position: right;
  display: block;
  opacity: 1;
  -webkit-mask-image: linear-gradient(to left, black 40%, transparent 100%);
  mask-image: linear-gradient(to left, black 40%, transparent 100%);
  transition: all 0.25s ease;
}
.race-image-hover-zone:hover ~ .race-image-float .race-image {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(70vh, 480px);
  border-radius: 6px;
  -webkit-mask-image: none;
  mask-image: none;
}
.race-image-credit {
  margin-top: 0.2rem;
  padding-right: var(--space-1);
  font-size: var(--text-2xs);
  letter-spacing: 0.03em;
  color: var(--color-text-dim);
  opacity: 0.7;
}

.race-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.race-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.race-header-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.race-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.ability-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem var(--space-2);
}
.ability-badge-sub { font-size: var(--text-2xs); }

.race-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}
.race-attr {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
}

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.trait-item {
  font-size: var(--text-sm);
  line-height: 1.5;
}
.trait-name {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-dark);
  font-weight: 600;
  margin-right: var(--space-2);
}
.trait-desc { color: var(--color-text-dim); }

.subrace-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-top: 1px dashed var(--color-border);
  padding-top: var(--space-3);
}
.subrace-card {
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: var(--space-1) var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.subrace-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.subrace-name {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-base);
  letter-spacing: 0.04em;
  color: var(--color-parchment);
  margin: 0;
}

.race-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.race-source {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}
.race-link {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.race-link:hover { color: var(--color-gold-bright); }

/* L'incrustation en fond de carte (petite, en z-index négatif) et son survol pour zoom
   n'ont pas de sens sur mobile : pas de hover tactile, et l'image chevauche le texte sur
   un écran étroit. On la masque plutôt que d'essayer de l'adapter. */
@media (max-width: 767px) {
  .race-image-hover-zone,
  .race-image-float {
    display: none;
  }
  /* L'image incrustée est masquée ci-dessus sur mobile, mais :has(.race-image-float) matche
     toujours l'élément (présent dans le DOM, juste display:none) : sans ce reset, le texte
     resterait borné inutilement alors qu'il n'y a plus d'image à ménager. */
  .race-card:has(.race-image-float) .race-content {
    max-width: none;
  }
}
</style>
