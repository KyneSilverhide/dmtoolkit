<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import { authStore } from '@/stores/auth.js'
import { BACKEND_URL } from '@/config.js'
import { COMMAND_INDEX } from '@/utils/commandIndex.js'
import { itemTypeStyle } from '@/utils/itemTypes.js'
import { rarityColor } from '@/utils/rarity.js'
import { parseEcole, levelLabel, schoolColor } from '@/utils/spellSchool.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Clés des onglets actuellement visibles dans le menu (dépend d'une session active ou
  // non — voir AdminView.vue `navGroups`/`visibleTabKeys`). Les résultats de section sont
  // restreints à ces onglets pour ne jamais proposer un raccourci vers un onglet caché.
  visibleTabKeys: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'go-tab', 'go-search'])

const query = ref('')
const inputRef = ref(null)
const highlighted = ref(0)
const liveResults = ref([])
const liveLoading = ref(false)
const liveCache = new Map()
let liveTimer = null
let liveRequestId = 0

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
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

const flatResults = computed(() => [...sectionMatches.value, ...liveResults.value])

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  liveResults.value = []
  highlighted.value = 0
  await nextTick()
  inputRef.value?.focus()
})

watch(query, () => {
  highlighted.value = 0
  if (liveTimer) clearTimeout(liveTimer)
  const q = query.value.trim()
  if (q.length < 3) {
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
    const [spellsRes, itemsRes, racesRes, classesRes, backgroundsRes, abilitiesRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/spells/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/magic-items/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/races/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/classes/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/backgrounds/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/classes/abilities/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
    ])
    const spells = spellsRes.ok ? await spellsRes.json() : []
    const items = itemsRes.ok ? await itemsRes.json() : []
    const races = racesRes.ok ? await racesRes.json() : []
    const dndClasses = classesRes.ok ? await classesRes.json() : []
    const backgrounds = backgroundsRes.ok ? await backgroundsRes.json() : []
    const abilities = abilitiesRes.ok ? await abilitiesRes.json() : []
    if (requestId !== liveRequestId) return
    const results = [
      ...spells.slice(0, 4).map(spellPreview),
      ...items.slice(0, 4).map(itemPreview),
      ...races.slice(0, 3).map(racePreview),
      ...dndClasses.slice(0, 3).map(classPreview),
      ...backgrounds.slice(0, 3).map(backgroundPreview),
      ...abilities.slice(0, 4).map(abilityPreview),
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
  if (entry.kind === 'section') {
    emit('go-tab', entry.tabKey)
  } else {
    emit('go-search', { subTab: entry.subTab, query: entry.query, exactSlug: entry.slug })
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

            <p v-if="query.trim() && sectionMatches.length === 0 && liveResults.length === 0 && !liveLoading" class="cp-empty">
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
