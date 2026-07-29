<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../AppIcon.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { COMMAND_INDEX } from '@/utils/commandIndex.js'
import { itemTypeStyle } from '@/utils/itemTypes.js'
import { rarityColor } from '@/utils/rarity.js'
import { parseEcole, levelLabel, schoolColor } from '@/utils/spellSchool.js'
import { stripAccents } from '@/utils/slugify.js'
import { SHOW_IMAGE, SHOW_VIDEO, SHOW_MAP, MAP_SET_FOG, SHOW_MERCHANT } from '@/socket-events.js'
import { requestAudioLaunch } from '@/composables/useAudioLaunch.js'
import { adminTabRoute } from '@/utils/adminRoute.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Clés des onglets actuellement visibles dans le menu (dépend d'une session active ou
  // non — voir AdminView.vue `navGroups`/`visibleTabKeys`). Les résultats de section sont
  // restreints à ces onglets pour ne jamais proposer un raccourci vers un onglet caché.
  visibleTabKeys: { type: Array, default: () => [] },
  // Compte de démonstration : le contenu de référence (sorts/objets/races/...) est masqué,
  // la recherche live ne doit donc jamais interroger ces endpoints (voir AdminView.vue lockedTabs).
  isDemo: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
const router = useRouter()

const query = ref('')
const inputRef = ref(null)
const highlighted = ref(0)
const liveResults = ref([])
const liveLoading = ref(false)
const liveCache = new Map()
let liveTimer = null
let liveRequestId = 0

function normalize(str) {
  return stripAccents(str || '').toLowerCase()
}

const sectionMatches = computed(() => {
  const visible = COMMAND_INDEX.filter(entry => props.visibleTabKeys.includes(entry.tabKey))
  const q = normalize(query.value.trim())
  const entries = q
    ? visible.filter(entry => normalize(entry.label).includes(q) || normalize(entry.keywords).includes(q))
    : visible
  return entries.map(entry => ({ kind: 'section', id: `section-${entry.tabKey}`, ...entry }))
})

function snippet(text, max = 90) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

function spellPreview(spell) {
  const { school, level } = parseEcole(spell.attributes?.ecole)
  return {
    kind: 'spell', id: `spell-${spell.slug}`, label: spell.name,
    icon: 'lucide:sparkles', tagLabel: [school, levelLabel(level)].filter(Boolean).join(' · '),
    tagColor: schoolColor(school), price: '', snippet: snippet(spell.description),
    subTab: 'spells', query: spell.name, slug: spell.slug,
  }
}

function itemPreview(item) {
  const kind = item.source_category === 'magic' ? 'magic' : 'equipment'
  return {
    kind, id: `item-${item.slug}`, label: item.name,
    icon: itemTypeStyle(item.item_type).icon, tagLabel: item.item_type,
    tagColor: kind === 'magic' ? rarityColor(item.rarity) : itemTypeStyle(item.item_type).color,
    price: item.list_data?.prix || '', snippet: snippet(item.description),
    subTab: kind, query: item.name, slug: item.slug,
  }
}

function racePreview(race) {
  return {
    kind: 'race', id: `race-${race.slug}`, label: race.name,
    icon: race.icon, tagLabel: race.ability_bonus,
    tagColor: 'var(--color-gold-dark)', price: '',
    snippet: [race.size, race.speed].filter(Boolean).join(' · '),
    subTab: 'races', query: race.name, slug: race.slug,
  }
}

function classPreview(dndClass) {
  const trait = dndClass.matchedTrait
  return {
    kind: 'class', id: `class-${dndClass.slug}`, label: dndClass.name,
    icon: dndClass.icon,
    tagLabel: trait ? trait.source : `Dé de vie ${dndClass.hit_die}`,
    tagColor: 'var(--color-gold-dark)', price: '',
    snippet: trait
      ? `${trait.name} — ${snippet(trait.description, 80)}`
      : [dndClass.primary_ability, dndClass.spellcasting ? 'Lanceur de sorts' : null].filter(Boolean).join(' · '),
    subTab: 'classes', query: dndClass.name, slug: dndClass.slug,
  }
}

function backgroundPreview(background) {
  return {
    kind: 'background', id: `background-${background.slug}`, label: background.name,
    icon: background.icon, tagLabel: background.skill_proficiencies.join(', '),
    tagColor: 'var(--color-gold-dark)', price: '',
    snippet: background.feature ? `${background.feature.name} — ${snippet(background.feature.description, 80)}` : '',
    subTab: 'backgrounds', query: background.name, slug: background.slug,
  }
}

function abilityPreview(ability) {
  return {
    kind: 'ability', id: `ability-${ability.id}`, label: ability.name,
    icon: ability.classIcon,
    tagLabel: [ability.className, ability.subclassName].filter(Boolean).join(' · '),
    tagColor: 'var(--color-gold-dark)', price: '',
    snippet: snippet(ability.description, 80),
    subTab: 'abilities', query: ability.name, slug: ability.id,
  }
}

function servicePreview(service) {
  return {
    kind: 'service', id: `service-${service.slug}`, label: service.name,
    icon: 'lucide:hand-coins', tagLabel: '',
    tagColor: 'var(--color-gold-dark)', price: service.price || '',
    snippet: snippet(service.description, 80),
    subTab: 'services', query: service.name, slug: service.slug,
  }
}

function conditionPreview(condition) {
  return {
    kind: 'condition', id: `condition-${condition.slug}`, label: condition.name,
    icon: 'lucide:skull', tagLabel: condition.name_vo || '',
    tagColor: 'var(--color-danger)', price: '',
    snippet: snippet(condition.description, 80),
    subTab: 'conditions', query: condition.name, slug: condition.slug,
  }
}

// Contenu custom de la session active (images/vidéos/cartes/audio/marchands) : noms/labels
// filtrés côté client depuis GET /api/sessions/:id/images (+ /merchants), rechargés à chaque
// ouverture de la palette. Contrairement aux résultats de contenu de référence ci-dessus,
// ces entrées portent un `tabKey` (navigation directe, pas de query/slug) et, pour les types
// projetables sur la TV (image/vidéo/carte/marchand — pas l'audio, qui sort du navigateur du
// MJ, voir CLAUDE.md), un bouton dédié déclenche l'affichage TV sans quitter la palette.
const CUSTOM_CONTENT_COLOR = 'var(--color-info)'
const sessionImages = ref([])
const sessionMerchants = ref([])

function contentLabel(row) {
  return row.tv_label || row.original_name || row.url.split('/').pop()
}

function imagePreview(row) {
  return {
    kind: 'image', id: `image-${row.id}`, label: contentLabel(row),
    icon: 'lucide:image', tagLabel: 'Image', tagColor: CUSTOM_CONTENT_COLOR,
    price: '', snippet: row.original_name && row.tv_label ? row.original_name : '',
    tabKey: 'images', tvUrl: row.url,
  }
}
function videoPreview(row) {
  return {
    kind: 'video', id: `video-${row.id}`, label: contentLabel(row),
    icon: 'lucide:video', tagLabel: 'Vidéo', tagColor: CUSTOM_CONTENT_COLOR,
    price: '', snippet: '',
    tabKey: 'videos', tvUrl: row.url,
  }
}
function mapPreview(row) {
  return {
    kind: 'map', id: `map-${row.id}`, label: contentLabel(row),
    icon: 'lucide:map', tagLabel: 'Carte', tagColor: CUSTOM_CONTENT_COLOR,
    price: '', snippet: '',
    tabKey: 'map', tvUrl: row.url,
  }
}
function audioPreview(row) {
  return {
    kind: 'audio', id: `audio-${row.id}`, label: contentLabel(row),
    icon: 'lucide:music-2', tagLabel: row.audio_category || 'Audio', tagColor: CUSTOM_CONTENT_COLOR,
    price: '', snippet: '',
    tabKey: 'audio', trackId: row.id,
  }
}
function merchantPreview(row) {
  const count = (row.items || []).length
  return {
    kind: 'merchant', id: `merchant-${row.id}`, label: row.name,
    icon: 'game-icons:shop', tagLabel: 'Marchand', tagColor: CUSTOM_CONTENT_COLOR,
    price: '', snippet: count ? `${count} objet${count > 1 ? 's' : ''}` : '',
    tabKey: 'merchants', merchantId: row.id,
  }
}

async function loadSessionContent() {
  const session = sessionStore.activeSession
  if (!session) { sessionImages.value = []; sessionMerchants.value = []; return }
  try {
    const [imagesRes, merchantsRes] = await Promise.all([
      apiFetch(`/api/sessions/${session.id}/images`, { headers: { Authorization: `Bearer ${authStore.token}` } }),
      apiFetch(`/api/sessions/${session.id}/merchants`, { headers: { Authorization: `Bearer ${authStore.token}` } }),
    ])
    sessionImages.value = imagesRes.ok ? await imagesRes.json() : []
    sessionMerchants.value = merchantsRes.ok ? await merchantsRes.json() : []
  } catch (err) {
    console.error(err)
  }
}

const CUSTOM_CONTENT_PREVIEW = { image: imagePreview, video: videoPreview, map: mapPreview, audio: audioPreview }

const sessionContentMatches = computed(() => {
  const q = normalize(query.value.trim())
  if (!q || !sessionStore.activeSession) return []
  const imageMatches = []
  const merchantMatches = []
  for (const row of sessionImages.value) {
    const buildPreview = CUSTOM_CONTENT_PREVIEW[row.type]
    if (!buildPreview) continue
    if (!normalize(contentLabel(row)).includes(q)) continue
    imageMatches.push(buildPreview(row))
  }
  for (const row of sessionMerchants.value) {
    if (!normalize(row.name || '').includes(q)) continue
    merchantMatches.push(merchantPreview(row))
  }
  // Chaque source garde son propre plafond avant fusion, pour qu'un marchand ne soit jamais
  // masqué par un grand nombre d'images/audio correspondant à la même requête générique.
  return [...imageMatches.slice(0, 6), ...merchantMatches.slice(0, 3)]
})

function canShowOnTv(entry) {
  return entry.kind === 'image' || entry.kind === 'video' || entry.kind === 'map' || entry.kind === 'merchant'
}

// Libellé/icône du bouton de projection : la vidéo autoplay dès sa réception côté TV
// (`<video autoplay>` dans TvVideo.vue), donc « lancer » l'affiche ET la joue en une seule
// action — pas de bouton de lecture distinct nécessaire. Image/carte/marchand restent un
// affichage statique, d'où le libellé « TV ».
function tvActionMeta(entry) {
  if (entry.kind === 'video') return { icon: 'lucide:play', label: 'Lancer', doneLabel: 'Lancé' }
  return { icon: 'lucide:tv', label: 'Afficher sur la TV', doneLabel: 'Affiché' }
}

const shownOnTvId = ref(null)
function showOnTv(entry) {
  if (!sessionStore.activeSession || !canShowOnTv(entry)) return
  const socket = getSocket()
  const sessionId = sessionStore.activeSession.id
  if (entry.kind === 'image') socket.emit(SHOW_IMAGE, { sessionId, imageUrl: entry.tvUrl })
  else if (entry.kind === 'video') socket.emit(SHOW_VIDEO, { sessionId, videoUrl: entry.tvUrl })
  else if (entry.kind === 'map') {
    socket.emit(SHOW_MAP, { sessionId, imageUrl: entry.tvUrl })
    socket.emit(MAP_SET_FOG, { sessionId, enabled: true })
  } else if (entry.kind === 'merchant') {
    socket.emit(SHOW_MERCHANT, { sessionId, merchantId: entry.merchantId })
  }
  shownOnTvId.value = entry.id
  setTimeout(() => { if (shownOnTvId.value === entry.id) shownOnTvId.value = null }, 1600)
}

// L'audio n'a pas de scène TV dédiée (le son sort du navigateur du MJ, voir CLAUDE.md) —
// « lancer » navigue donc vers l'onglet Audio (seul endroit où on peut voir/contrôler la
// lecture) et y déclenche la piste via useAudioLaunch, qui tolère qu'AudioManager ne soit pas
// encore monté.
function launchAudio(entry) {
  if (!sessionStore.activeSession || entry.kind !== 'audio') return
  requestAudioLaunch(entry.trackId)
  router.push(adminTabRoute('audio'))
  close()
}

const flatResults = computed(() => [...sectionMatches.value, ...liveResults.value, ...sessionContentMatches.value])

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  liveResults.value = []
  highlighted.value = 0
  loadSessionContent()
  await nextTick()
  inputRef.value?.focus()
})

watch(query, () => {
  highlighted.value = 0
  if (liveTimer) clearTimeout(liveTimer)
  const q = query.value.trim()
  if (props.isDemo || q.length < 3) {
    liveResults.value = []
    liveLoading.value = false
    return
  }
  liveTimer = setTimeout(() => runLiveSearch(q), 250)
})

async function runLiveSearch(q) {
  if (liveCache.has(q)) {
    liveResults.value = liveCache.get(q)
    return
  }
  const requestId = ++liveRequestId
  liveLoading.value = true
  try {
    const [spellsRes, itemsRes, racesRes, classesRes, backgroundsRes, abilitiesRes, servicesRes, conditionsRes] = await Promise.all([
      apiFetch(`/api/spells/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/magic-items/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/races/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/classes/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/backgrounds/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/classes/abilities/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/services/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      apiFetch(`/api/conditions/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
    ])
    const spells = spellsRes.ok ? await spellsRes.json() : []
    const items = itemsRes.ok ? await itemsRes.json() : []
    const races = racesRes.ok ? await racesRes.json() : []
    const dndClasses = classesRes.ok ? await classesRes.json() : []
    const backgrounds = backgroundsRes.ok ? await backgroundsRes.json() : []
    const abilities = abilitiesRes.ok ? await abilitiesRes.json() : []
    const services = servicesRes.ok ? await servicesRes.json() : []
    const conditions = conditionsRes.ok ? await conditionsRes.json() : []
    if (requestId !== liveRequestId) return
    const results = [
      ...spells.slice(0, 4).map(spellPreview),
      ...items.slice(0, 4).map(itemPreview),
      ...races.slice(0, 3).map(racePreview),
      ...dndClasses.slice(0, 3).map(classPreview),
      ...backgrounds.slice(0, 3).map(backgroundPreview),
      ...abilities.slice(0, 4).map(abilityPreview),
      ...services.slice(0, 3).map(servicePreview),
      ...conditions.slice(0, 3).map(conditionPreview),
    ]
    liveCache.set(q, results)
    liveResults.value = results
  } catch (err) {
    console.error(err)
  } finally {
    if (requestId === liveRequestId) liveLoading.value = false
  }
}

function selectEntry(entry) {
  if (!entry) return
  if (entry.kind === 'section' || entry.tabKey) {
    router.push(adminTabRoute(entry.tabKey))
  } else {
    router.push(adminTabRoute(entry.subTab, { q: entry.query, slug: entry.slug }))
  }
  close()
}

function close() {
  emit('close')
}

function onBackdropClick(e) {
  if (e.target === e.currentTarget) close()
}

function moveHighlight(delta) {
  const len = flatResults.value.length
  if (!len) return
  highlighted.value = (highlighted.value + delta + len) % len
}

function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') { close(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); return }
  if (e.key === 'Enter') { e.preventDefault(); selectEntry(flatResults.value[highlighted.value]) }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (liveTimer) clearTimeout(liveTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-modal">
      <div
        v-if="open"
        class="cp-backdrop"
        @click="onBackdropClick"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche globale"
      >
        <div class="cp-card">
          <div class="cp-input-row">
            <AppIcon icon="lucide:search" size="1em" class="cp-input-icon" />
            <input
              ref="inputRef"
              v-model="query"
              class="cp-input"
              placeholder="Rechercher une section, un sort, un objet…"
              autocomplete="off"
              spellcheck="false"
            />
            <span v-if="liveLoading" class="cp-loading-dot">●</span>
            <button class="cp-close" @click="close" aria-label="Fermer">
              <AppIcon icon="lucide:x" size="0.9em" />
            </button>
          </div>

          <div class="cp-results">
            <template v-if="sectionMatches.length > 0">
              <p class="cp-group-label">Sections</p>
              <button
                v-for="(entry, i) in sectionMatches"
                :key="entry.id"
                class="cp-row"
                :class="{ active: flatResults.indexOf(entry) === highlighted }"
                @mouseenter="highlighted = flatResults.indexOf(entry)"
                @click="selectEntry(entry)"
              >
                <AppIcon :icon="entry.icon" size="1em" class="cp-row-icon" />
                <span class="cp-row-label">{{ entry.label }}</span>
                <AppIcon icon="lucide:corner-down-left" size="0.8em" class="cp-row-enter" />
              </button>
            </template>

            <template v-if="liveResults.length > 0">
              <p class="cp-group-label">Résultats</p>
              <button
                v-for="entry in liveResults"
                :key="entry.id"
                class="cp-row cp-row-preview"
                :class="{ active: flatResults.indexOf(entry) === highlighted }"
                @mouseenter="highlighted = flatResults.indexOf(entry)"
                @click="selectEntry(entry)"
              >
                <AppIcon :icon="entry.icon" size="1.1em" class="cp-row-icon" :style="{ color: entry.tagColor }" />
                <div class="cp-row-main">
                  <div class="cp-row-top">
                    <span class="cp-row-label">{{ entry.label }}</span>
                    <span v-if="entry.tagLabel" class="cp-tag" :style="{ '--tag-color': entry.tagColor }">{{ entry.tagLabel }}</span>
                    <span v-if="entry.price" class="cp-price-tag"><AppIcon icon="lucide:coins" size="0.6em" /> {{ entry.price }}</span>
                  </div>
                  <p v-if="entry.snippet" class="cp-row-snippet">{{ entry.snippet }}</p>
                </div>
              </button>
            </template>

            <template v-if="sessionContentMatches.length > 0">
              <p class="cp-group-label">Contenu de session</p>
              <div v-for="entry in sessionContentMatches" :key="entry.id" class="cp-row-item">
                <button
                  class="cp-row cp-row-preview"
                  :class="{ active: flatResults.indexOf(entry) === highlighted }"
                  @mouseenter="highlighted = flatResults.indexOf(entry)"
                  @click="selectEntry(entry)"
                >
                  <AppIcon :icon="entry.icon" size="1.1em" class="cp-row-icon" :style="{ color: entry.tagColor }" />
                  <div class="cp-row-main">
                    <div class="cp-row-top">
                      <span class="cp-row-label">{{ entry.label }}</span>
                      <span v-if="entry.tagLabel" class="cp-tag" :style="{ '--tag-color': entry.tagColor }">{{ entry.tagLabel }}</span>
                    </div>
                    <p v-if="entry.snippet" class="cp-row-snippet">{{ entry.snippet }}</p>
                  </div>
                </button>
                <button
                  v-if="canShowOnTv(entry)"
                  type="button"
                  class="cp-tv-btn"
                  :class="{ 'cp-tv-btn-active': shownOnTvId === entry.id }"
                  :title="shownOnTvId === entry.id ? tvActionMeta(entry).doneLabel : tvActionMeta(entry).label"
                  @click="showOnTv(entry)"
                >
                  <AppIcon :icon="shownOnTvId === entry.id ? 'lucide:check' : tvActionMeta(entry).icon" size="0.85em" />
                </button>
                <button
                  v-if="entry.kind === 'audio'"
                  type="button"
                  class="cp-tv-btn"
                  title="Lancer"
                  @click="launchAudio(entry)"
                >
                  <AppIcon icon="lucide:play" size="0.85em" />
                </button>
              </div>
            </template>

            <p v-if="query.trim() && sectionMatches.length === 0 && liveResults.length === 0 && sessionContentMatches.length === 0 && !liveLoading" class="cp-empty">
              Aucun résultat pour « {{ query }} »
            </p>
          </div>

          <div class="cp-footer">
            <span><AppIcon icon="lucide:arrow-up" size="0.7em" /><AppIcon icon="lucide:arrow-down" size="0.7em" /> Naviguer</span>
            <span><AppIcon icon="lucide:corner-down-left" size="0.7em" /> Sélectionner</span>
            <span><kbd>Échap</kbd> Fermer</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 960;
  padding: 10vh 1.5rem 1.5rem;
}

.cp-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 14px;
  width: 100%;
  max-width: 560px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px var(--overlay-scrim), 0 0 0 1px var(--surface-gold-soft);
  overflow: hidden;
}

.cp-input-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.cp-input-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.cp-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
}
.cp-input::placeholder { color: var(--color-text-dim); }
.cp-loading-dot {
  font-size: 0.5rem;
  color: var(--color-gold-dark);
  animation: cpDotPulse 1s ease-in-out infinite;
}
@keyframes cpDotPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.cp-close {
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 6px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}
.cp-close:hover { color: var(--color-parchment); }

.cp-results {
  overflow-y: auto;
  padding: 0.5rem;
  scrollbar-gutter: stable;
}
.cp-results::-webkit-scrollbar { width: 4px; }
.cp-results::-webkit-scrollbar-track { background: transparent; }
.cp-results::-webkit-scrollbar-thumb { background: var(--color-gold-dark); border-radius: 2px; }

.cp-group-label {
  margin: 0.5rem 0.6rem 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.cp-group-label:first-child { margin-top: 0.2rem; }

.cp-row-item {
  display: flex;
  align-items: stretch;
  gap: 0.3rem;
}
.cp-row-item .cp-row { flex: 1; min-width: 0; }
.cp-tv-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.cp-tv-btn:hover { color: var(--color-info); border-color: var(--color-info); background: var(--surface-gold-soft); }
.cp-tv-btn-active { color: var(--color-success); border-color: var(--color-success); }

.cp-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: none;
  border: none;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.cp-row:hover,
.cp-row.active {
  background: var(--surface-gold-soft);
}
.cp-row-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.cp-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-row-enter { color: var(--color-text-dim); opacity: 0; flex-shrink: 0; }
.cp-row.active .cp-row-enter { opacity: 1; }

/* Preview rows (sorts / objets) */
.cp-row-preview { align-items: flex-start; }
.cp-row-preview .cp-row-icon { margin-top: 0.15rem; }
.cp-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.cp-row-top { display: flex; align-items: center; gap: 0.4rem; }
.cp-row-top .cp-row-label { flex-shrink: 1; }
.cp-row-snippet {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-tag {
  --tag-color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid color-mix(in oklab, var(--tag-color) 50%, transparent);
  background: color-mix(in oklab, var(--tag-color) 16%, transparent);
  color: var(--tag-color);
  border-radius: 20px;
  padding: 0.05rem 0.45rem;
  flex-shrink: 0;
  white-space: nowrap;
}
.cp-price-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.05rem 0.45rem;
  flex-shrink: 0;
  white-space: nowrap;
}

.cp-empty {
  margin: 0;
  padding: 1.25rem 0.6rem;
  text-align: center;
  color: var(--color-text-dim);
  font-size: 0.82rem;
}

.cp-footer {
  display: flex;
  gap: 1rem;
  padding: 0.55rem 1rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-dim);
  font-size: 0.68rem;
  flex-shrink: 0;
}
.cp-footer span { display: inline-flex; align-items: center; gap: 0.25rem; }
.cp-footer kbd {
  font-family: var(--font-heading), sans-serif;
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0 0.3rem;
  font-size: 0.65rem;
}

@media (max-width: 640px) {
  .cp-backdrop { padding: 4vh 0.75rem 0.75rem; }
}

/* Transition */
/* noinspection CssUnusedSymbol */
.cp-modal-enter-active { transition: opacity 0.15s ease; }
/* noinspection CssUnusedSymbol */
.cp-modal-leave-active { transition: opacity 0.12s ease; }
/* noinspection CssUnusedSymbol */
.cp-modal-enter-from, .cp-modal-leave-to { opacity: 0; }
.cp-modal-enter-active .cp-card { animation: cpSlideIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes cpSlideIn {
  from { transform: translateY(-10px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
</style>
