<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import RefLink from '../RefLink.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { useDebouncedTabFilter } from '@/composables/useDebouncedTabFilter.js'
import { spellCandidates, classAbilityCandidates, itemCandidates, SPELL_LIST_NAME_RE, withGlossary } from '@/utils/textLinker.js'
import { slugify, stripAccents } from '@/utils/slugify.js'
import { contentBasePath } from '@/utils/contentRoutes.js'

// Écran joueur : endpoints publics au lieu des endpoints admin (pas de boutons TV/Envoyer
// sur cette fiche de toute façon, voir CLAUDE.md — Classes est exclue de ContentActionButtons
// côté MJ aussi, fiche trop volumineuse). En playerMode, les traits de classe/sous-classe
// affichent leur description complète directement au lieu d'un simple lien vers la fiche
// Aptitudes : les joueurs n'ont pas besoin de la densité de navigation du MJ, et préfèrent
// tout voir sans changer d'onglet (retour explicite du MJ testeur de ce projet).
const props = defineProps({
  playerMode: { type: Boolean, default: false },
})

const router = useRouter()
const route = useRoute()
const tabQuery = useContentTabQuery('classes')

// Navigue directement vers l'onglet Sorts filtré par classe (voir SpellSearch.vue
// `by-class`), au lieu de faire remonter un événement à AdminView.
function goToClassSpells(dndClass) {
  router.push({ path: `${contentBasePath(route)}/spells`, query: { class: dndClass.name } })
}

// Voir le commentaire sur le prop `playerMode` ci-dessus. isSpellListTrait() est déclarée
// plus bas dans ce fichier (hoisting de `function`, donc accessible ici sans souci d'ordre).
function showFullTrait(trait) {
  return isSpellListTrait(trait) || props.playerMode
}

// exactMatch (renommé exactSlugFilter) : slug exact ciblé depuis la palette de commande
// (Ctrl+K) — si renseigné, la liste est réduite à cette seule classe plutôt qu'à toutes
// celles correspondant au texte recherché.
const { query, exactMatch: exactSlugFilter, clearExactMatch } = useDebouncedTabFilter(tabQuery)

const classes = ref([])
const loading = ref(false)
const loadError = ref(false)

// Sections dépliées par classe : `${slug}:${section}` -> true
const expanded = reactive({})
function toggleSection(slug, section) {
  const key = `${slug}:${section}`
  expanded[key] = !expanded[key]
}
function isExpanded(slug, section) {
  return !!expanded[`${slug}:${section}`]
}

async function loadClasses() {
  loading.value = true
  loadError.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/classes/public/full`)
      : await apiFetch('/api/classes', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      const data = await res.json()
      for (const dndClass of data) {
        if (dndClass.subclasses?.length) dndClass.subclasses.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      }
      classes.value = data.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
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

// Chargée pour transformer les mentions de sorts dans les descriptions de traits en liens
// cliquables avec aperçu (voir LinkedText.vue / RefLink.vue) — même mécanisme que le
// bouton "Voir les sorts de cette classe", mais au niveau du texte.
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

// Chargés pour lier les mentions d'objets d'équipement standard dans le texte
// d'équipement de départ (voir plus bas) vers leur fiche dans l'onglet Objets.
const items = ref([])
async function loadItems() {
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/magic-items/public`)
      : await apiFetch('/api/magic-items', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) items.value = (await res.json()).filter(i => i.source_category !== 'magic')
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => { loadClasses(); loadSpells(); loadItems() })

const spellRefCandidates = computed(() => spellCandidates(spells.value))
// N'est utilisé QUE pour le texte d'équipement de départ (voir template), jamais fusionné
// dans refCandidates() ci-dessous : de nombreux noms d'objets sont des mots courants d'un
// seul mot qui apparaissent partout ailleurs dans les descriptions de traits avec un tout
// autre sens (ex: "Lance" l'objet vs "Lance Détection des pensées" = lance le sort ; "Acide"
// l'objet vs "dégâts d'acide" le type de dégâts) — les y lier produirait énormément de faux
// positifs, contrairement au texte d'équipement où ces mots désignent bien l'objet.
const equipmentCandidates = computed(() => withGlossary(itemCandidates(items.value)))

// Candidats "aptitude" par classe (traits/features de CETTE classe uniquement), pour lier
// une mention d'une aptitude vers sa fiche plutôt que de répéter sa description ailleurs
// sur la même fiche de classe.
const abilityCandidatesBySlug = computed(() => {
  const map = {}
  for (const dndClass of classes.value) {
    map[dndClass.slug] = classAbilityCandidates(dndClass, slugify)
  }
  return map
})

function refCandidates(dndClass) {
  return withGlossary([...spellRefCandidates.value, ...(abilityCandidatesBySlug.value[dndClass.slug] || [])])
}

function traitId(dndClass, subclass, trait) {
  return [dndClass.slug, subclass ? slugify(subclass.name) : null, slugify(trait.name), trait.level]
    .filter(Boolean).join('__')
}

// Un trait de sous-classe qui donne un accès à des sorts (Sorts de serment/de domaine,
// Liste de sorts étendue, Sorts de cercle/d'alchimiste/…) n'est pas une aptitude "normale"
// répétée ailleurs sur la fiche de classe : son contenu utile est justement la liste des
// sorts qu'il donne. On ne le transforme donc pas en lien vers l'onglet Aptitudes (ça
// masquerait ces noms de sorts derrière une seule fiche) — on affiche son nom en clair et
// sa description passe par LinkedText pour lier individuellement chaque sort mentionné.
function isSpellListTrait(trait) {
  return SPELL_LIST_NAME_RE.test(trait.name)
}

// Payload "aptitude" pour le lien direct d'un trait (de classe de base ou de sous-classe,
// selon que `subclass` est null ou non) vers sa propre fiche (voir composants/RefLink.vue)
// — même forme que les entrées produites par classAbilityCandidates(), construite
// directement ici pour éviter une recherche inverse dans la liste de candidats.
function abilityPayload(dndClass, subclass, trait) {
  return {
    id: traitId(dndClass, subclass, trait),
    name: trait.name,
    description: trait.description,
    className: dndClass.name,
    classSlug: dndClass.slug,
    subclassName: subclass ? subclass.name : null,
  }
}

function classMatches(dndClass, q) {
  if (stripAccents(dndClass.name.toLowerCase()).includes(q)) return true
  if (stripAccents((dndClass.primary_ability || '').toLowerCase()).includes(q)) return true
  if ((dndClass.features || []).some(f => stripAccents(f.name.toLowerCase()).includes(q) || stripAccents(f.description.toLowerCase()).includes(q))) return true
  return (dndClass.subclasses || []).some(sc =>
    stripAccents(sc.name.toLowerCase()).includes(q) ||
    (sc.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))
  )
}

const filteredClasses = computed(() => {
  if (exactSlugFilter.value) return classes.value.filter(dndClass => dndClass.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return classes.value
  return classes.value.filter(dndClass => classMatches(dndClass, q))
})

// Si la recherche matche un trait précis (et non le nom/la caractéristique clé, déjà
// visibles dans l'en-tête), on affiche un aperçu de ce trait directement sur la carte
// plutôt que de forcer à déplier les sections pour comprendre pourquoi la classe matche.
function findMatchedTrait(dndClass, q) {
  const feature = (dndClass.features || []).find(f =>
    stripAccents(f.name.toLowerCase()).includes(q) || stripAccents(f.description.toLowerCase()).includes(q)
  )
  if (feature) return { name: feature.name, description: feature.description, source: dndClass.name }
  for (const sc of dndClass.subclasses || []) {
    const trait = (sc.traits || []).find(t =>
      stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q)
    )
    if (trait) return { name: trait.name, description: trait.description, source: `${dndClass.name} · ${sc.name}` }
  }
  return null
}

const traitPreviews = computed(() => {
  const q = stripAccents(query.value.trim().toLowerCase())
  const map = {}
  if (!q) return map
  for (const dndClass of filteredClasses.value) {
    if (stripAccents(dndClass.name.toLowerCase()).includes(q)) continue
    if (stripAccents((dndClass.primary_ability || '').toLowerCase()).includes(q)) continue
    const trait = findMatchedTrait(dndClass, q)
    if (trait) map[dndClass.slug] = trait
  }
  return map
})

// Niveaux où une classe gagne au moins un trait (les niveaux "vides" ne sont pas affichés
// dans la progression condensée, seul le bonus de maîtrise progresse entre deux paliers).
function levelsWithFeatures(dndClass) {
  return (dndClass.levels || []).filter(l => l.features && l.features.length > 0)
}

function spellSlotsLabel(row) {
  if (!row) return ''
  if (row.slot_count !== undefined) {
    // Magie de pacte (Occultiste) : N emplacements d'un niveau donné
    return row.slot_count > 0 ? `${row.slot_count} emplacement(s) de niveau ${row.slot_level}` : '—'
  }
  const slots = row.slots || []
  const parts = slots
    .map((n, i) => (n > 0 ? `${n}×niv.${i + 1}` : null))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="game-icons:vitruvian-man" size="0.9em" /> Classes</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, trait, sous-classe, caractéristique…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les classes.</p>
    </div>

    <div v-else-if="filteredClasses.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune classe trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredClasses.length }} classe(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="dndClass in filteredClasses" :key="dndClass.slug" class="class-card">
        <template v-if="dndClass.image">
          <div class="class-image-hover-zone"></div>
          <div class="class-image-float">
            <img :src="dndClass.image" :alt="dndClass.name" class="class-image" loading="lazy" />
            <span v-if="dndClass.image_credit" class="class-image-credit">{{ dndClass.image_credit }}</span>
          </div>
        </template>

        <!-- Regroupe tout le contenu textuel (hors pied de fiche) pour pouvoir borner sa
             largeur d'un seul bloc quand une image est incrustée (voir .class-content
             ci-dessous) : l'image est haute (11rem+), donc l'en-tête, la description, les
             attributs ET les premiers traits peuvent tous se retrouver sous sa zone opaque. -->
        <div class="class-content">
        <div class="class-header">
          <AppIcon :icon="dndClass.icon" size="1.6rem" class="class-icon" />
          <div class="class-header-main">
            <h3 class="class-name">{{ dndClass.name }}</h3>
            <span class="stat-badge">Dé de vie {{ dndClass.hit_die }}</span>
            <span class="stat-badge">{{ dndClass.primary_ability }}</span>
            <span v-if="dndClass.spellcasting" class="stat-badge stat-badge-spell">
              <AppIcon icon="lucide:sparkles" size="0.7em" /> Lanceur ({{ dndClass.spellcasting.ability }})
            </span>
          </div>
        </div>

        <p v-if="dndClass.description" class="class-description">{{ dndClass.description }}</p>

        <div class="class-attrs">
          <span class="class-attr"><AppIcon icon="lucide:shield-check" size="0.75em" /> JS : {{ dndClass.saving_throws.join(', ') }}</span>
          <span class="class-attr"><AppIcon icon="lucide:shirt" size="0.75em" /> {{ dndClass.armor_proficiencies.length ? dndClass.armor_proficiencies.join(', ') : 'Aucune armure' }}</span>
          <span class="class-attr"><AppIcon icon="game-icons:crossed-swords" size="0.75em" /> {{ dndClass.weapon_proficiencies.join(', ') }}</span>
          <span v-if="dndClass.tool_proficiencies?.length" class="class-attr"><AppIcon icon="lucide:hammer" size="0.75em" /> {{ dndClass.tool_proficiencies.join(', ') }}</span>
          <span class="class-attr"><AppIcon icon="lucide:sparkle" size="0.75em" /> Compétences : {{ dndClass.skill_choices.count }} parmi {{ dndClass.skill_choices.options.join(', ') }}</span>
        </div>

        <p class="starting-equipment"><AppIcon icon="lucide:backpack" size="0.8em" /> <LinkedText :text="dndClass.starting_equipment" :candidates="equipmentCandidates" /></p>

        <!-- Aperçu du trait qui matche la recherche -->
        <div v-if="traitPreviews[dndClass.slug]" class="matched-trait-preview">
          <div class="matched-trait-head">
            <AppIcon icon="lucide:search" size="0.75em" />
            <span class="matched-trait-name">{{ traitPreviews[dndClass.slug].name }}</span>
            <span class="matched-trait-source">{{ traitPreviews[dndClass.slug].source }}</span>
          </div>
          <p class="matched-trait-desc">
            <LinkedText
              :text="traitPreviews[dndClass.slug].description"
              :candidates="refCandidates(dndClass)"
              :trait-name="traitPreviews[dndClass.slug].name"
            />
          </p>
        </div>

        <!-- Traits -->
        <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'features')">
          <AppIcon :icon="isExpanded(dndClass.slug, 'features') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
          Traits de classe ({{ dndClass.features.length }})
        </button>
        <ul v-if="isExpanded(dndClass.slug, 'features')" class="trait-list trait-list-links">
          <li v-for="trait in dndClass.features" :key="trait.name" class="trait-item" :class="showFullTrait(trait) ? '' : 'trait-item-link'">
            <template v-if="showFullTrait(trait)">
              <span class="trait-name">{{ trait.name }}</span>
              <span class="trait-level">niv. {{ trait.level }}</span>
              <span class="trait-desc">
                <LinkedText
                  :text="trait.description"
                  :candidates="refCandidates(dndClass)"
                  :exclude-id="traitId(dndClass, null, trait)"
                  :trait-name="trait.name"
                />
              </span>
            </template>
            <template v-else>
              <RefLink type="ability" :label="trait.name" :payload="abilityPayload(dndClass, null, trait)" />
              <span class="trait-level">niv. {{ trait.level }}</span>
            </template>
          </li>
        </ul>

        <!-- Progression 1-20 -->
        <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'levels')">
          <AppIcon :icon="isExpanded(dndClass.slug, 'levels') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
          Progression (niveaux 1-20)
        </button>
        <div v-if="isExpanded(dndClass.slug, 'levels')" class="level-table">
          <div v-for="row in levelsWithFeatures(dndClass)" :key="row.level" class="level-row">
            <span class="level-num">Niv. {{ row.level }}</span>
            <span class="level-prof">Maîtrise +{{ row.proficiency_bonus }}</span>
            <span class="level-features">{{ row.features.join(', ') }}</span>
          </div>
        </div>

        <!-- Emplacements de sorts -->
        <template v-if="dndClass.spellcasting">
          <div class="section-toggle-row">
            <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'spells')">
              <AppIcon :icon="isExpanded(dndClass.slug, 'spells') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
              Emplacements de sorts
            </button>
            <button class="spells-link-btn" type="button" @click="goToClassSpells(dndClass)">
              <AppIcon icon="lucide:sparkles" size="0.75em" /> Voir les sorts de cette classe
            </button>
          </div>
          <div v-if="isExpanded(dndClass.slug, 'spells')" class="spell-section">
            <p class="spell-notes">{{ dndClass.spellcasting.notes }}</p>
            <div class="level-table">
              <div v-for="row in dndClass.spellcasting.slots_table" :key="row.level" class="level-row">
                <span class="level-num">Niv. {{ row.level }}</span>
                <span class="level-prof">{{ row.cantrips }} sort(s) mineur(s)</span>
                <span class="level-features">{{ spellSlotsLabel(row) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Sous-classes -->
        <div v-if="dndClass.subclasses.length" class="subclass-list">
          <div v-for="subclass in dndClass.subclasses" :key="subclass.name" class="subclass-card">
            <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, `sub:${subclass.name}`)">
              <AppIcon :icon="isExpanded(dndClass.slug, `sub:${subclass.name}`) ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
              {{ subclass.name }} <span class="subclass-unlock">(dès le niveau {{ subclass.unlocked_at_level }})</span>
            </button>
            <ul v-if="isExpanded(dndClass.slug, `sub:${subclass.name}`)" class="trait-list trait-list-links">
              <li v-for="trait in subclass.traits" :key="trait.name" class="trait-item" :class="showFullTrait(trait) ? '' : 'trait-item-link'">
                <template v-if="showFullTrait(trait)">
                  <span class="trait-name">{{ trait.name }}</span>
                  <span class="trait-level">niv. {{ trait.level }}</span>
                  <span class="trait-desc">
                    <LinkedText
                      :text="trait.description"
                      :candidates="refCandidates(dndClass)"
                      :exclude-id="traitId(dndClass, subclass, trait)"
                      :trait-name="trait.name"
                    />
                  </span>
                </template>
                <template v-else>
                  <RefLink type="ability" :label="trait.name" :payload="abilityPayload(dndClass, subclass, trait)" />
                  <span class="trait-level">niv. {{ trait.level }}</span>
                </template>
              </li>
            </ul>
          </div>
        </div>
        </div>

        <div class="class-footer">
          <span class="class-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ dndClass.source }}</span>
          <a :href="dndClass.detail_url" target="_blank" class="class-link">Voir sur AideDD ↗</a>
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

.class-card {
  position: relative;
  z-index: 0;
  overflow: hidden;
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.class-card:hover { border-color: var(--color-gold-dark); }
/* Le zoom ne doit se déclencher qu'au survol de l'image elle-même, pas de toute la
   carte : quand la zone de survol dédiée à l'image est active, la carte passe devant
   ses voisines (z-index) et autorise le débordement (overflow) pour que l'image
   incrustée puisse s'agrandir sans être rognée par les bords arrondis ni recouverte par
   la carte suivante. :has() est nécessaire pour remonter l'effet du déclencheur
   (descendant) jusqu'à la carte (ancêtre). */
.class-card:has(.class-image-hover-zone:hover) {
  z-index: 10;
  overflow: visible;
}

.class-content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
}
/* L'image incrustée est haute (11rem+ crédit) : l'en-tête, la description, les attributs,
   l'équipement de départ ET les premiers traits peuvent tous se retrouver dans sa zone
   opaque (à droite, là où le masque en dégradé ne fond pas encore vers la transparence)
   puisqu'ils sont en flux normal à pleine largeur. On borne donc tout le bloc de contenu
   d'un coup plutôt que d'essayer de deviner quels éléments précis dépassent sous l'image
   (dépend du nombre de traits/sous-classes dépliés) — voir le même traitement dans
   RaceSearch.vue. */
.class-card:has(.class-image-float) .class-content {
  max-width: calc(100% - min(55%, 320px) - 0.75rem);
}

.class-description {
  margin: 0;
  font-family: var(--font-body), sans-serif;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--color-text-dim);
}

/* Incrustation en fond de carte : l'image occupe le coin supérieur droit derrière le
   texte (z-index négatif), fondue vers le fond via un masque en dégradé, plutôt qu'une
   vignette qui pousse le texte (le flex-direction: column du parent ignore de toute
   façon `float` sur ses enfants). */
.class-image-float {
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
/* Zone invisible calquée sur la position/taille par défaut de l'image, mais placée
   au-dessus du texte (z-index positif) pour pouvoir réellement capter le survol —
   l'image réelle est en z-index négatif (derrière le texte), donc `:hover` directement
   dessus ne se déclencherait jamais, le texte capterait toujours la souris en premier. */
.class-image-hover-zone {
  position: absolute;
  top: 0;
  right: 0;
  width: 55%;
  max-width: 320px;
  height: 11rem;
  z-index: 4;
  cursor: zoom-in;
}
/* Au survol de cette zone, l'image passe devant le texte, se détache dans un panneau
   au fond du thème (masque totalement le texte derrière plutôt que de le laisser
   transparaître) et reprend sa taille d'origine — bornée pour rester dans le viewport —
   sans son fondu ni son recadrage. pointer-events reste "none" sur l'image elle-même
   donc elle ne bloque jamais les clics une fois agrandie. */
.class-image-hover-zone:hover ~ .class-image-float {
  z-index: 3;
  width: auto;
  max-width: min(90vw, 480px);
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 0.5rem;
  box-shadow: -16px 12px 32px rgba(0, 0, 0, 0.6);
}
.class-image {
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
.class-image-hover-zone:hover ~ .class-image-float .class-image {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(70vh, 480px);
  border-radius: 6px;
  -webkit-mask-image: none;
  mask-image: none;
}
.class-image-credit {
  margin-top: 0.2rem;
  padding-right: 0.3rem;
  font-size: 0.55rem;
  letter-spacing: 0.03em;
  color: var(--color-text-dim);
  opacity: 0.7;
}

.class-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.class-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.class-header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.class-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.stat-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
}
.stat-badge-spell {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.class-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}
.class-attr {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.starting-equipment {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}

.matched-trait-preview {
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.matched-trait-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-gold-dark);
}
.matched-trait-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-gold-bright);
}
.matched-trait-source {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  color: var(--color-text-dim);
  margin-left: auto;
}
.matched-trait-desc {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  line-height: 1.5;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0.2rem 0;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: var(--color-gold-dark);
  cursor: pointer;
  text-align: left;
}
.section-toggle:hover { color: var(--color-gold-bright); }

.section-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.spells-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.6rem;
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
}
.spells-link-btn:hover { color: var(--color-gold-bright); background: var(--surface-gold-soft); }

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.trait-item {
  font-size: 0.8rem;
  line-height: 1.5;
}
.trait-name {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-dark);
  font-weight: 600;
  margin-right: 0.4rem;
}
.trait-level {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  color: var(--color-text-dim);
  opacity: 0.7;
  margin-right: 0.4rem;
}
.trait-desc { color: var(--color-text-dim); }

.trait-item-link {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.level-table {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-left: 0.2rem;
}
.level-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.2rem 0;
  border-bottom: 1px dashed var(--color-border);
}
.level-num {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-dark);
  min-width: 3.5rem;
}
.level-prof { color: var(--color-text-dim); min-width: 6rem; }
.level-features { color: var(--color-parchment); flex: 1; }

.spell-section { display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.2rem; }
.spell-notes { font-size: 0.78rem; color: var(--color-text-dim); margin: 0; line-height: 1.5; }

.subclass-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border-top: 1px dashed var(--color-border);
  padding-top: 0.6rem;
}
.subclass-card {
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.subclass-unlock {
  font-size: 0.6rem;
  color: var(--color-text-dim);
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
}

.class-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.class-source {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}
.class-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.class-link:hover { color: var(--color-gold-bright); }

/* L'incrustation en fond de carte (petite, en z-index négatif) et son survol pour zoom
   n'ont pas de sens sur mobile : pas de hover tactile, et l'image chevauche le texte sur
   un écran étroit. On la masque plutôt que d'essayer de l'adapter. */
@media (max-width: 767px) {
  .class-image-hover-zone,
  .class-image-float {
    display: none;
  }
  /* L'image incrustée est masquée ci-dessus sur mobile, mais :has(.class-image-float) matche
     toujours l'élément (présent dans le DOM, juste display:none) : sans ce reset, le texte
     resterait borné inutilement alors qu'il n'y a plus d'image à ménager. */
  .class-card:has(.class-image-float) .class-content {
    max-width: none;
  }
}
</style>
