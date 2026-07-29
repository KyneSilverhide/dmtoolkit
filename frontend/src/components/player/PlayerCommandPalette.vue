<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { BACKEND_URL } from '@/config.js'
import { useConditions } from '@/composables/useConditions.js'
import { usePlayerContentCatalogs } from '@/composables/usePlayerContentCatalogs.js'
import { itemTypeStyle } from '@/utils/itemTypes.js'
import { rarityColor } from '@/utils/rarity.js'
import { parseEcole, levelLabel, schoolColor } from '@/utils/spellSchool.js'
import { stripAccents } from '@/utils/slugify.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'select'])

const query = ref('')
const inputRef = ref(null)
const highlighted = ref(0)
const results = ref([])
const loading = ref(false)
let searchTimer = null
let requestId = 0

const { conditions, load: loadConditions } = useConditions()
const { races, classes, backgrounds, abilities, services, load: loadCatalogs } = usePlayerContentCatalogs()

function normalize(str) {
  return stripAccents(str || '').toLowerCase()
}

function snippet(text, max = 90) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

function spellPreview(spell) {
  const { school, level } = parseEcole(spell.attributes?.ecole)
  return {
    id: `spell-${spell.slug}`, label: spell.name, icon: 'lucide:sparkles',
    tagLabel: [school, levelLabel(level)].filter(Boolean).join(' · '), tagColor: schoolColor(school),
    snippet: snippet(spell.description), tab: 'spells', prefillQuery: spell.name, prefillSlug: spell.slug,
  }
}
function itemPreview(item) {
  const kind = item.source_category === 'magic' ? 'magic' : 'equipment'
  return {
    id: `item-${item.slug}`, label: item.name, icon: itemTypeStyle(item.item_type).icon,
    tagLabel: item.item_type, tagColor: kind === 'magic' ? rarityColor(item.rarity) : itemTypeStyle(item.item_type).color,
    snippet: snippet(item.description), tab: kind, prefillQuery: item.name, prefillSlug: item.slug,
  }
}
function racePreview(race) {
  return {
    id: `race-${race.slug}`, label: race.name, icon: race.icon || 'game-icons:footprint',
    tagLabel: race.ability_bonus, tagColor: 'var(--color-gold-dark)',
    snippet: [race.size, race.speed].filter(Boolean).join(' · '), tab: 'races', prefillQuery: race.name, prefillSlug: race.slug,
  }
}
function classPreview(dndClass) {
  return {
    id: `class-${dndClass.slug}`, label: dndClass.name, icon: dndClass.icon || 'game-icons:sword-brandish',
    tagLabel: `Dé de vie ${dndClass.hit_die}`, tagColor: 'var(--color-gold-dark)',
    snippet: dndClass.primary_ability, tab: 'classes', prefillQuery: dndClass.name, prefillSlug: dndClass.slug,
  }
}
function backgroundPreview(bg) {
  return {
    id: `background-${bg.slug}`, label: bg.name, icon: bg.icon || 'lucide:scroll',
    tagLabel: (bg.skill_proficiencies || []).join(', '), tagColor: 'var(--color-gold-dark)',
    snippet: bg.feature ? `${bg.feature.name} — ${snippet(bg.feature.description, 70)}` : '', tab: 'backgrounds', prefillQuery: bg.name, prefillSlug: bg.slug,
  }
}
function abilityPreview(ability) {
  return {
    id: `ability-${ability.id}`, label: ability.name, icon: ability.classIcon || 'lucide:sparkle',
    tagLabel: [ability.className, ability.subclassName].filter(Boolean).join(' · '), tagColor: 'var(--color-gold-dark)',
    snippet: snippet(ability.description, 70), tab: 'abilities', prefillQuery: ability.name, prefillSlug: ability.id,
  }
}
function servicePreview(service) {
  return {
    id: `service-${service.slug}`, label: service.name, icon: 'lucide:hand-coins',
    tagLabel: service.price || '', tagColor: 'var(--color-gold-dark)',
    snippet: snippet(service.description, 70), tab: 'services', prefillQuery: service.name, prefillSlug: service.slug,
  }
}
function conditionPreview(condition) {
  return {
    id: `condition-${condition.id}`, label: condition.label, icon: 'lucide:skull',
    tagLabel: '', tagColor: 'var(--color-danger)',
    snippet: snippet(condition.description, 70), tab: 'conditions', prefillQuery: condition.label, prefillSlug: condition.slug,
  }
}

async function fetchPublicSearch(path, q) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}?q=${encodeURIComponent(q)}`)
    return res.ok ? await res.json() : []
  } catch (err) {
    console.error(err)
    return []
  }
}

async function runSearch(q) {
  const id = ++requestId
  loading.value = true
  try {
    const [spells, items] = await Promise.all([
      fetchPublicSearch('/api/spells/public/search', q),
      fetchPublicSearch('/api/magic-items/public/search', q),
    ])
    if (id !== requestId) return
    const nq = normalize(q)
    const localRaces = races.value.filter(r => normalize(r.name).includes(nq)).slice(0, 3)
    const localClasses = classes.value.filter(c => normalize(c.name).includes(nq)).slice(0, 3)
    const localBackgrounds = backgrounds.value.filter(b => normalize(b.name).includes(nq)).slice(0, 3)
    const localAbilities = abilities.value.filter(a => normalize(a.name).includes(nq) || normalize(a.className).includes(nq)).slice(0, 4)
    const localServices = services.value.filter(s => normalize(s.name).includes(nq)).slice(0, 3)
    const localConditions = conditions.value.filter(c => normalize(c.label).includes(nq)).slice(0, 3)
    results.value = [
      ...spells.slice(0, 4).map(spellPreview),
      ...items.slice(0, 4).map(itemPreview),
      ...localRaces.map(racePreview),
      ...localClasses.map(classPreview),
      ...localBackgrounds.map(backgroundPreview),
      ...localAbilities.map(abilityPreview),
      ...localServices.map(servicePreview),
      ...localConditions.map(conditionPreview),
    ]
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  results.value = []
  highlighted.value = 0
  loadConditions()
  loadCatalogs()
  await nextTick()
  inputRef.value?.focus()
})

watch(query, () => {
  highlighted.value = 0
  if (searchTimer) clearTimeout(searchTimer)
  const q = query.value.trim()
  if (props.isDemo || q.length < 3) {
    results.value = []
    loading.value = false
    return
  }
  searchTimer = setTimeout(() => runSearch(q), 250)
})

function selectEntry(entry) {
  if (!entry) return
  emit('select', { tab: entry.tab, query: entry.prefillQuery, slug: entry.prefillSlug })
  close()
}
function close() { emit('close') }
function onBackdropClick(e) { if (e.target === e.currentTarget) close() }
function moveHighlight(delta) {
  const len = results.value.length
  if (!len) return
  highlighted.value = (highlighted.value + delta + len) % len
}
function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') { close(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); return }
  if (e.key === 'Enter') { e.preventDefault(); selectEntry(results.value[highlighted.value]) }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="pcp-modal">
      <div v-if="open" class="pcp-backdrop" @click="onBackdropClick" role="dialog" aria-modal="true" aria-label="Recherche globale">
        <div class="pcp-card">
          <div class="pcp-input-row">
            <AppIcon icon="lucide:search" size="1em" class="pcp-input-icon" />
            <input
              ref="inputRef"
              v-model="query"
              class="pcp-input"
              placeholder="Rechercher un sort, un objet, une race…"
              autocomplete="off"
              spellcheck="false"
            />
            <span v-if="loading" class="pcp-loading-dot">●</span>
            <button class="pcp-close" @click="close" aria-label="Fermer">
              <AppIcon icon="lucide:x" size="0.9em" />
            </button>
          </div>

          <div class="pcp-results">
            <template v-if="results.length > 0">
              <button
                v-for="entry in results"
                :key="entry.id"
                class="pcp-row"
                :class="{ active: results.indexOf(entry) === highlighted }"
                @mouseenter="highlighted = results.indexOf(entry)"
                @click="selectEntry(entry)"
              >
                <AppIcon :icon="entry.icon" size="1.1em" class="pcp-row-icon" :style="{ color: entry.tagColor }" />
                <div class="pcp-row-main">
                  <div class="pcp-row-top">
                    <span class="pcp-row-label">{{ entry.label }}</span>
                    <span v-if="entry.tagLabel" class="pcp-tag" :style="{ '--tag-color': entry.tagColor }">{{ entry.tagLabel }}</span>
                  </div>
                  <p v-if="entry.snippet" class="pcp-row-snippet">{{ entry.snippet }}</p>
                </div>
              </button>
            </template>

            <p v-if="isDemo" class="pcp-empty">Contenu masqué en mode démo.</p>
            <p v-else-if="query.trim().length > 0 && query.trim().length < 3" class="pcp-empty">Continuez à taper…</p>
            <p v-else-if="query.trim() && results.length === 0 && !loading" class="pcp-empty">Aucun résultat pour « {{ query }} »</p>
          </div>

          <div class="pcp-footer">
            <span><AppIcon icon="lucide:arrow-up" size="0.7em" /><AppIcon icon="lucide:arrow-down" size="0.7em" /> Naviguer</span>
            <span><AppIcon icon="lucide:corner-down-left" size="0.7em" /> Ouvrir</span>
            <span><kbd>Échap</kbd> Fermer</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pcp-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 960;
  padding: 8vh 1rem 1rem;
}
.pcp-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px var(--overlay-scrim), 0 0 0 1px var(--surface-gold-soft);
  overflow: hidden;
}
.pcp-input-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.pcp-input-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.pcp-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
}
.pcp-input::placeholder { color: var(--color-text-dim); }
.pcp-loading-dot { font-size: 0.5rem; color: var(--color-gold-dark); animation: pcpDotPulse 1s ease-in-out infinite; }
@keyframes pcpDotPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.pcp-close {
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
.pcp-close:hover { color: var(--color-parchment); }
.pcp-results { overflow-y: auto; padding: 0.5rem; scrollbar-gutter: stable; }
.pcp-row {
  display: flex;
  align-items: flex-start;
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
.pcp-row:hover, .pcp-row.active { background: var(--surface-gold-soft); }
.pcp-row-icon { flex-shrink: 0; margin-top: 0.15rem; }
.pcp-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.pcp-row-top { display: flex; align-items: center; gap: 0.4rem; }
.pcp-row-label { flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pcp-row-snippet {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcp-tag {
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
.pcp-empty { margin: 0; padding: 1.25rem 0.6rem; text-align: center; color: var(--color-text-dim); font-size: 0.82rem; }
.pcp-footer {
  display: flex;
  gap: 1rem;
  padding: 0.55rem 1rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-dim);
  font-size: 0.68rem;
  flex-shrink: 0;
}
.pcp-footer span { display: inline-flex; align-items: center; gap: 0.25rem; }
.pcp-footer kbd {
  font-family: var(--font-heading), sans-serif;
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0 0.3rem;
  font-size: 0.65rem;
}
@media (max-width: 640px) {
  .pcp-backdrop { padding: 4vh 0.5rem 0.5rem; }
}
/* noinspection CssUnusedSymbol */
.pcp-modal-enter-active { transition: opacity 0.15s ease; }
/* noinspection CssUnusedSymbol */
.pcp-modal-leave-active { transition: opacity 0.12s ease; }
/* noinspection CssUnusedSymbol */
.pcp-modal-enter-from, .pcp-modal-leave-to { opacity: 0; }
.pcp-modal-enter-active .pcp-card { animation: pcpSlideIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes pcpSlideIn {
  from { transform: translateY(-10px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
</style>
