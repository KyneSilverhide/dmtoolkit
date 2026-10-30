<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HexGridCalibrator from './HexGridCalibrator.vue'
import HexcrawlGroupsStep from './HexcrawlGroupsStep.vue'
import HexcrawlTravelStep from './HexcrawlTravelStep.vue'
import { BACKEND_URL } from '@/config.js'
import { sessionStore } from '@/stores/session.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { saveHexcrawlConfig } from '@/composables/useHexcrawl.js'
import { getCellNeighbors } from '@/utils/mapGrid.js'
import { DEFAULT_HEXCRAWL_CONFIG, normalizeConfig } from '@/utils/hexcrawl.js'

const props = defineProps({
  // Carte à modifier ; null = l'assistant commence par le choix de la carte.
  image: { type: Object, default: null },
  startStep: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'finished'])

const STEPS = [
  { key: 'map', label: 'Carte', icon: 'lucide:map' },
  { key: 'grid', label: 'Hexagones', icon: 'lucide:hexagon' },
  { key: 'groups', label: "Groupes d'images", icon: 'lucide:images' },
  { key: 'travel', label: 'Voyage', icon: 'lucide:route' },
]

const step = ref(props.image ? props.startStep : 0)
const maps = ref([])
const hexcrawls = ref([])
const selected = ref(props.image)
const grid = ref(defaultGrid())
const config = ref(structuredClone(DEFAULT_HEXCRAWL_CONFIG))
const existingLog = ref([])
const uploading = ref(false)
const dragOver = ref(false)
const error = ref('')
const saving = ref(false)
const detecting = ref(false)
const detectMessage = ref('')
const dialogEl = ref(null)

const sessionPath = computed(() => `/api/sessions/${sessionStore.activeSession.id}`)
const labels = computed(() => ({ labelColOffset: config.value.labelColOffset, labelRowOffset: config.value.labelRowOffset }))
const hexcrawlImageIds = computed(() => new Set(hexcrawls.value.map(h => h.image_id)))
const canNext = computed(() => step.value > 0 || !!selected.value)
// Un voyage commencé fige la grille : le journal désigne des cases. « Recommencer » la rend modifiable.
const gridLocked = computed(() => existingLog.value.length > 0)
const nextStep = computed(() => STEPS.findIndex((_, index) => index > step.value && !stepLocked(index)))
const prevStep = computed(() => STEPS.findLastIndex((_, index) => index < step.value && !stepLocked(index)))

function stepLocked(index) {
  return gridLocked.value && (index === 1 || (index === 0 && !!props.image))
}

function defaultGrid() {
  return { cols: 20, rows: 14, orientation: 'flat', offsetX: 0, offsetY: 0, cellW: null, cellH: null }
}

function thumbUrl(img) {
  const url = img.thumbnail_url || img.url
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`
}

function gridFromImage(img) {
  if (img?.grid_type !== 'hex') return defaultGrid()
  return {
    cols: img.grid_cols || 20,
    rows: img.grid_rows || 14,
    orientation: img.grid_hex_orientation || 'flat',
    offsetX: parseFloat(img.grid_offset_x) || 0,
    offsetY: parseFloat(img.grid_offset_y) || 0,
    cellW: parseFloat(img.grid_cell_w) || null,
    cellH: parseFloat(img.grid_cell_h) || null,
  }
}

function selectMap(img) {
  selected.value = img
  grid.value = gridFromImage(img)
  const existing = hexcrawls.value.find(h => h.image_id === img.id)
  config.value = normalizeConfig(existing?.config)
  existingLog.value = existing?.log || []
  detectMessage.value = img.grid_type === 'hex'
    ? 'Grille détectée automatiquement : vérifiez que les codes tombent juste.'
    : 'Pas de grille détectée sur cette carte : utilisez le calage en 2 clics.'
}

async function loadMaps() {
  const [m, h] = await Promise.all([
    apiFetch(`${sessionPath.value}/images?type=map`),
    apiFetch(`${sessionPath.value}/hexcrawls`),
  ])
  if (m.ok) maps.value = await m.json()
  if (h.ok) hexcrawls.value = await h.json()
}

async function uploadMap(files) {
  const list = files.filter(f => f.type.startsWith('image/'))
  if (!list.length) return
  uploading.value = true
  error.value = ''
  try {
    const form = new FormData()
    form.append('file', list[0])
    form.append('session_id', sessionStore.activeSession.id)
    form.append('type', 'map')
    const res = await apiFetch('/api/uploads', { method: 'POST', body: form })
    if (!res.ok) {
      error.value = (await res.json().catch(() => ({}))).error || 'Envoi impossible.'
      return
    }
    const { urls } = await res.json()
    await loadMaps()
    const created = maps.value.find(m => m.url === urls[0])
    if (created) {
      selectMap(created)
      step.value = 1
    }
  } catch (err) {
    console.error(err)
    error.value = 'Envoi impossible.'
  } finally {
    uploading.value = false
  }
}

function onMapDrop(e) {
  dragOver.value = false
  uploadMap(Array.from(e.dataTransfer.files))
}

function onMapFile(e) {
  uploadMap(Array.from(e.target.files || []))
  e.target.value = ''
}

async function detect() {
  if (!selected.value) return
  detecting.value = true
  detectMessage.value = ''
  try {
    const res = await apiFetch(`${sessionPath.value}/images/${selected.value.id}/detect-grid`, { method: 'POST' })
    const result = res.ok ? await res.json() : null
    if (result?.grid_type === 'hex') {
      grid.value = gridFromImage(result)
      detectMessage.value = 'Grille trouvée : vérifiez que les codes tombent juste.'
    } else {
      detectMessage.value = 'Aucune grille hexagonale reconnue : utilisez le calage en 2 clics.'
    }
  } catch (err) {
    console.error(err)
    detectMessage.value = 'Détection impossible.'
  } finally {
    detecting.value = false
  }
}

async function saveGrid() {
  const g = grid.value
  const res = await apiFetch(`${sessionPath.value}/images/${selected.value.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grid_type: 'hex',
      grid_cols: g.cols,
      grid_rows: g.rows,
      grid_hex_orientation: g.orientation,
      grid_offset_x: g.offsetX,
      grid_offset_y: g.offsetY,
      grid_cell_w: g.cellW,
      grid_cell_h: g.cellH,
    }),
  })
  if (!res.ok) throw new Error('grid')
}

async function goTo(target) {
  if (target === step.value || (target > 0 && !selected.value) || stepLocked(target)) return
  error.value = ''
  if (step.value === 1) {
    try {
      await saveGrid()
    } catch {
      error.value = "La grille n'a pas pu être enregistrée."
      return
    }
  }
  step.value = target
}

async function finish(launch) {
  saving.value = true
  error.value = ''
  try {
    if (!gridLocked.value) await saveGrid()
    const g = grid.value
    const result = await saveHexcrawlConfig(selected.value.id, config.value, existingLog.value, cell =>
      getCellNeighbors(cell, 'hex', g.cols, g.rows, g.orientation, g.offsetX, g.offsetY, g.cellW, g.cellH))
    if (result?.error) {
      error.value = result.error
      return
    }
    emit('finished', { image: selected.value, launch })
  } catch (err) {
    console.error(err)
    error.value = "Le hexcrawl n'a pas pu être enregistré."
  } finally {
    saving.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && !e.defaultPrevented) emit('close')
}

// Évite que le navigateur n'ouvre un fichier lâché à côté d'une zone de dépôt.
function preventDrop(e) { e.preventDefault() }

watch(() => props.image, img => { if (img) selectMap(img) }, { immediate: true })

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  await loadMaps()
  if (props.image) {
    const fresh = maps.value.find(m => m.id === props.image.id)
    if (fresh) selectMap(fresh)
  }
  nextTick(() => dialogEl.value?.focus())
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="wizard-overlay" @dragover.prevent @drop="preventDrop">
      <div ref="dialogEl" class="wizard" role="dialog" aria-modal="true" aria-labelledby="hexcrawl-wizard-title" tabindex="-1" data-testid="hexcrawl-wizard">
        <header class="wizard-header">
          <h2 id="hexcrawl-wizard-title"><AppIcon icon="lucide:hexagon" size="0.9em" /> Hexcrawl</h2>
          <ol class="stepper">
            <li v-for="(s, index) in STEPS" :key="s.key">
              <button
                class="step-btn"
                :class="{ active: step === index, done: index < step }"
                :aria-current="step === index ? 'step' : undefined"
                :disabled="(index > 0 && !selected) || stepLocked(index)"
                :title="stepLocked(index) ? 'Voyage commencé : utilisez « Recommencer » pour changer la carte ou la grille.' : undefined"
                :data-testid="`hexcrawl-step-${s.key}`"
                @click="goTo(index)"
              >
                <span class="step-num">{{ index + 1 }}</span>
                <span class="step-label">{{ s.label }}</span>
              </button>
            </li>
          </ol>
          <button class="close-btn" aria-label="Fermer l'assistant" @click="emit('close')"><AppIcon icon="lucide:x" size="1.1em" /></button>
        </header>

        <main class="wizard-body" :class="{ 'no-scroll': step === 1 }">
          <!-- Étape 1 : carte -->
          <div v-if="step === 0" class="map-step">
            <label
              class="map-drop"
              :class="{ over: dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop.prevent.stop="onMapDrop"
            >
              <AppIcon icon="lucide:map-plus" size="1.6em" />
              <strong>{{ uploading ? 'Envoi et analyse de la carte…' : 'Déposez une nouvelle carte ici' }}</strong>
              <span>ou cliquez pour la choisir. La découpe en hexagones est testée tout de suite.</span>
              <input type="file" accept="image/*" class="file-input" :disabled="uploading" data-testid="hexcrawl-map-upload" @change="onMapFile" />
            </label>
            <template v-if="maps.length">
              <h3 class="sub-title">Ou reprenez une carte de la session</h3>
              <div class="map-grid">
                <button
                  v-for="img in maps"
                  :key="img.id"
                  class="map-card"
                  :class="{ selected: selected?.id === img.id }"
                  :aria-pressed="selected?.id === img.id"
                  :data-testid="`hexcrawl-map-${img.id}`"
                  @click="selectMap(img)"
                  @dblclick="goTo(nextStep)"
                >
                  <img :src="thumbUrl(img)" :alt="''" />
                  <span class="map-name">{{ img.original_name || 'Carte' }}</span>
                  <span v-if="hexcrawlImageIds.has(img.id)" class="map-badge">Hexcrawl</span>
                </button>
              </div>
            </template>
          </div>

          <HexGridCalibrator
            v-else-if="step === 1"
            :image-url="selected.url"
            :grid="grid"
            :labels="labels"
            :detecting="detecting"
            :detect-message="detectMessage"
            @update:grid="grid = $event"
            @update:labels="config = { ...config, ...$event }"
            @detect="detect"
          />

          <HexcrawlGroupsStep v-else-if="step === 2" />

          <HexcrawlTravelStep v-else :config="config" @update:config="config = $event" />
        </main>

        <footer class="wizard-footer">
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
          <span v-else-if="selected" class="selected-name">{{ selected.original_name }}</span>
          <div class="footer-actions">
            <button v-if="prevStep >= 0" class="wiz-btn" @click="goTo(prevStep)"><AppIcon icon="lucide:arrow-left" size="0.9em" /> Retour</button>
            <button v-if="step < STEPS.length - 1" class="wiz-btn primary" :disabled="!canNext" data-testid="hexcrawl-next" @click="goTo(nextStep)">
              {{ step === 2 ? 'Continuer' : 'Suivant' }} <AppIcon icon="lucide:arrow-right" size="0.9em" />
            </button>
            <template v-else>
              <button class="wiz-btn" :disabled="saving" data-testid="hexcrawl-save" @click="finish(false)">Enregistrer</button>
              <button class="wiz-btn primary" :disabled="saving" data-testid="hexcrawl-launch" @click="finish(true)">
                <AppIcon icon="lucide:play" size="0.9em" /> Enregistrer et afficher sur la TV
              </button>
            </template>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wizard-overlay { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; padding: var(--space-3); }
.wizard { width: min(1400px, 100%); height: min(900px, 100%); display: flex; flex-direction: column; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; outline: none; }
.wizard-header { display: flex; align-items: center; gap: var(--space-4, 16px); padding: var(--space-3) var(--space-4, 16px); border-bottom: 1px solid var(--color-border); }
.wizard-header h2 { margin: 0; font-family: var(--font-heading), sans-serif; font-size: var(--text-base, 16px); color: var(--color-gold-dark); white-space: nowrap; }
.stepper { flex: 1; display: flex; gap: var(--space-1); list-style: none; margin: 0; padding: 0; justify-content: center; flex-wrap: wrap; }
.step-btn { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); background: none; border: none; border-radius: 999px; color: var(--color-text-dim); font-size: var(--text-sm); cursor: pointer; }
.step-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.step-btn:hover:not(:disabled) { background: var(--surface-raised); }
.step-btn.active { background: var(--surface-gold-soft); color: var(--color-text); }
.step-num { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid currentColor; font-size: var(--text-xs); }
.step-btn.done .step-num, .step-btn.active .step-num { background: var(--color-gold-dark); border-color: var(--color-gold-dark); color: var(--color-text-on-accent); }
.close-btn { background: none; border: none; color: var(--color-text-dim); cursor: pointer; padding: var(--space-1); }
.close-btn:hover { color: var(--color-text); }
.wizard-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-3) var(--space-4, 16px); }
.wizard-body.no-scroll { overflow: hidden; }
.wizard-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4, 16px); border-top: 1px solid var(--color-border); flex-wrap: wrap; }
.footer-actions { display: flex; gap: var(--space-2); margin-left: auto; flex-wrap: wrap; }
.selected-name { color: var(--color-text-dim); font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.error-text { margin: 0; font-size: var(--text-sm); color: var(--color-danger); }
.map-step { display: flex; flex-direction: column; gap: var(--space-3); }
.map-drop { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); padding: var(--space-6, 32px) var(--space-3); border: 2px dashed var(--color-border); border-radius: 12px; color: var(--color-text-dim); font-size: var(--text-sm); text-align: center; cursor: pointer; }
.map-drop strong { color: var(--color-text); font-size: var(--text-base, 16px); }
.map-drop:hover, .map-drop:focus-within, .map-drop.over { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.file-input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.sub-title { margin: 0; font-family: var(--font-heading), sans-serif; font-size: var(--text-sm); color: var(--color-text-dim); }
.map-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-3); }
.map-card { position: relative; display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-1); background: var(--surface-raised); border: 2px solid var(--color-border); border-radius: 10px; color: var(--color-text); cursor: pointer; text-align: left; }
.map-card:hover { border-color: var(--color-gold-dark); }
.map-card.selected { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.map-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; display: block; }
.map-name { font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-badge { position: absolute; top: var(--space-2); left: var(--space-2); padding: 1px var(--space-2); border-radius: 999px; background: var(--color-gold-dark); color: var(--color-text-on-accent); font-size: var(--text-2xs); }
.wiz-btn { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius: 8px; border: 1px solid var(--color-border); background: var(--surface-raised); color: var(--color-text); font-size: var(--text-sm); cursor: pointer; }
.wiz-btn:hover:not(:disabled) { border-color: var(--color-gold-dark); }
.wiz-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wiz-btn.primary { background: var(--gradient-accent-action); border-color: var(--color-gold-dark); color: var(--color-text-on-accent); }
.wiz-btn.primary:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
@media (max-width: 720px) {
  .step-label { display: none; }
}
</style>
