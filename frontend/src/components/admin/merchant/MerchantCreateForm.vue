<script setup>
import { ref } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import MERCHANT_PRESETS from '../../../assets/merchantPresets.js'
import { authStore } from '@/stores/auth.js'
import { BACKEND_URL } from '@/config.js'

const emit = defineEmits(['submit', 'cancel'])

const presetPanelOpen = ref(false)
const newName = ref('')
const newDesc = ref('')
const newItems = ref([])

// Equipment search
const equipSearch = ref('')
const equipResults = ref([])
const equipLoading = ref(false)
const equipSearchOpen = ref(false)
const equipError = ref(false)
let equipTimer = null

async function runEquipSearch() {
  const q = equipSearch.value.trim()
  if (!q) { equipResults.value = []; return }
  equipLoading.value = true
  equipError.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/equipment/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      equipResults.value = await res.json()
    } else {
      equipError.value = true
      equipResults.value = []
    }
  } catch (err) {
    console.error(err)
    equipError.value = true
    equipResults.value = []
  } finally {
    equipLoading.value = false
  }
}

function onEquipInput() {
  clearTimeout(equipTimer)
  equipError.value = false
  if (equipSearch.value.trim().length < 2) { equipResults.value = []; return }
  equipTimer = setTimeout(runEquipSearch, 300)
}

function parsePrice(raw) {
  if (!raw) return 0
  const m = String(raw).replace(/\s/g, '').match(/^([\d,.]+)\s*(po|pa|pc)?/)
  if (!m) return 0
  const val = parseFloat(m[1].replace(',', '.'))
  if (m[2] === 'pa') return Math.ceil(val / 10)
  if (m[2] === 'pc') return 0
  return Math.round(val)
}

function equipCategory(itemType) {
  if (!itemType) return 'Divers'
  const t = itemType.toLowerCase()
  if (t.includes('arme de guerre')) return 'Armes de guerre'
  if (t.includes('arme simple')) return 'Armes simples'
  if (t.includes('munition')) return 'Munitions'
  if (t.includes('armure lourde')) return 'Armures lourdes'
  if (t.includes('armure interm')) return 'Armures intermédiaires'
  if (t.includes('armure l')) return 'Armures légères'
  if (t.includes('bouclier')) return 'Armures'
  if (t.includes('potion') || t.includes('poison')) return 'Potions'
  if (t.includes('monture') || t.includes('véhicule')) return 'Montures'
  if (t.includes('instrument')) return 'Instruments'
  if (t.includes('outil')) return 'Outils'
  return 'Équipement'
}

function addEquipItem(eq) {
  newItems.value.push({
    name: eq.name,
    description: eq.description || '',
    price: parsePrice(eq.list_data?.prix),
    stock: -1,
    category: equipCategory(eq.item_type),
  })
  equipSearch.value = ''
  equipResults.value = []
}

function applyPreset(preset) {
  newItems.value = preset.items.map(i => ({ ...i }))
  presetPanelOpen.value = false
}

function addItem() {
  newItems.value.push({ name: '', description: '', price: 10, stock: -1, category: 'Divers' })
}

function removeItem(idx) {
  newItems.value.splice(idx, 1)
}

function submit() {
  if (!newName.value.trim()) return
  const validItems = newItems.value.filter(i => i.name.trim() && i.price >= 0)
  if (validItems.length === 0) return
  emit('submit', {
    name: newName.value.trim(),
    description: newDesc.value.trim(),
    items: validItems,
  })
}

const canSubmit = () => newName.value.trim() && newItems.value.filter(i => i.name.trim()).length > 0
</script>

<template>
  <div class="create-form">
    <!-- Preset picker panel -->
    <div class="preset-toggle-row">
      <HelpTip id="merchant.preset">
        <button class="preset-toggle-btn" @click="presetPanelOpen = !presetPanelOpen">
          <AppIcon icon="game-icons:shop" size="0.85em" />
          {{ presetPanelOpen ? 'Masquer les modèles' : '✦ Choisir un modèle de marchand' }}
        </button>
      </HelpTip>
    </div>
    <div v-if="presetPanelOpen" class="preset-panel">
      <p class="preset-panel-hint">Cliquez sur un type pour pré-remplir le formulaire. Vous pourrez tout modifier ensuite.</p>
      <div class="preset-grid">
        <button
          v-for="preset in MERCHANT_PRESETS"
          :key="preset.id"
          class="preset-card"
          @click="applyPreset(preset)"
        >
          <AppIcon :icon="preset.icon" size="1.6em" color="var(--color-gold-bright)" />
          <span class="preset-card-label">{{ preset.label }}</span>
          <span class="preset-card-count">{{ preset.items.length }} articles</span>
        </button>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Nom du marchand</label>
      <input v-model="newName" class="form-input" placeholder="Ex: Brom le Forgeron" />
    </div>
    <div class="form-group">
      <label class="form-label">Description (optionnelle)</label>
      <input v-model="newDesc" class="form-input" placeholder="Ex: Un nain bourru mais honnête" />
    </div>

    <div class="items-header">
      <span class="form-label">Articles</span>
      <div class="items-actions">
        <button class="small-btn" @click="equipSearchOpen = !equipSearchOpen">
          <AppIcon icon="lucide:search" size="0.85em" /> Rechercher un objet
        </button>
        <button class="small-btn" @click="addItem">+ Ajouter</button>
      </div>
    </div>

    <!-- Equipment search panel -->
    <div v-if="equipSearchOpen" class="equip-search-panel">
      <div class="equip-search-row">
        <input
          v-model="equipSearch"
          class="form-input equip-search-input"
          placeholder="Chercher un objet D&D (ex: épée, potion, armure…)"
          @input="onEquipInput"
          @keydown.esc="equipSearchOpen = false"
        />
        <span v-if="equipLoading" class="equip-loading">…</span>
      </div>
      <ul v-if="equipResults.length > 0" class="equip-results">
        <li
          v-for="eq in equipResults"
          :key="eq.slug"
          class="equip-result-item"
          @click="addEquipItem(eq)"
        >
          <span class="equip-result-name">{{ eq.name }}</span>
          <span class="equip-result-type">{{ eq.item_type }}</span>
          <span v-if="eq.list_data?.prix" class="equip-result-price">{{ eq.list_data.prix }}</span>
        </li>
      </ul>
      <p v-else-if="equipError" class="equip-empty equip-err">⚠ Impossible de contacter le serveur.</p>
      <p v-else-if="equipSearch.trim().length >= 2 && !equipLoading" class="equip-empty">Aucun résultat pour « {{ equipSearch.trim() }} ».</p>
      <p v-else-if="equipSearch.trim().length > 0 && equipSearch.trim().length < 2" class="equip-empty">Tapez au moins 2 caractères.</p>
    </div>

    <div v-if="newItems.length === 0" class="no-items">
      <p>Aucun article. Cliquez sur « Objets D&D » pour pré-remplir ou « + Ajouter » pour créer manuellement.</p>
    </div>

    <div v-if="newItems.length > 0" class="item-row-header">
      <div class="item-header-fields">
        <span class="item-col-header col-name">Nom</span>
        <span class="item-col-header col-desc">Description</span>
        <span class="item-col-header col-price">🪙 Prix (po)</span>
        <span class="item-col-header col-stock">📦 Stock <HelpTip id="merchant.stock" /></span>
        <span class="item-col-header col-cat">Catégorie</span>
      </div>
      <span class="item-col-spacer" />
    </div>

    <div class="items-list">
      <div v-for="(item, idx) in newItems" :key="idx" class="item-row">
        <div class="item-row-fields">
          <input v-model="item.name" class="form-input item-name-input" placeholder="Nom" />
          <input v-model="item.description" class="form-input item-desc-input" placeholder="Description" />
          <input v-model.number="item.price" type="number" class="form-input item-price-input" placeholder="Prix (po)" min="0" />
          <input
            v-model.number="item.stock"
            type="number"
            class="form-input item-stock-input"
            placeholder="Stock (-1=∞)"
            min="-1"
          />
          <input v-model="item.category" class="form-input item-cat-input" placeholder="Catégorie" />
        </div>
        <button class="remove-btn" @click="removeItem(idx)">✕</button>
      </div>
    </div>

    <button
      class="action-btn"
      :disabled="!canSubmit()"
      @click="submit"
    >
      ✓ Créer le marchand
    </button>
  </div>
</template>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
}
.form-group { display: flex; flex-direction: column; gap: 0.35rem; }
.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.items-header { display: flex; align-items: center; justify-content: space-between; }
.items-actions { display: flex; gap: 0.4rem; }
.small-btn {
  padding: 0.3rem 0.6rem;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
}
.small-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-dark); }

.no-items {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  text-align: center;
  padding: 1rem 0;
}

.item-row-header { display: flex; align-items: center; gap: 0.4rem; padding: 0 0 0.1rem; }
.item-header-fields { display: flex; gap: 0.35rem; flex: 1; flex-wrap: wrap; }
.item-col-header {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-name  { flex: 2; min-width: 100px; }
.col-desc  { flex: 3; min-width: 120px; }
.col-price { flex: 1; min-width: 60px; }
.col-stock { flex: 1; min-width: 60px; }
.col-cat   { flex: 1; min-width: 80px; }
.item-col-spacer { width: 31px; flex-shrink: 0; }

.items-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; }
.item-row { display: flex; align-items: center; gap: 0.4rem; }
.item-row-fields { display: flex; gap: 0.35rem; flex: 1; flex-wrap: wrap; }
.item-name-input { flex: 2; min-width: 100px; }
.item-desc-input { flex: 3; min-width: 120px; }
.item-price-input { flex: 1; min-width: 60px; }
.item-stock-input { flex: 1; min-width: 60px; }
.item-cat-input { flex: 1; min-width: 80px; }
.remove-btn {
  background: none;
  border: 1px solid var(--color-danger-border);
  border-radius: 4px;
  color: var(--color-danger);
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.7rem;
  flex-shrink: 0;
  transition: all 0.2s;
}
.remove-btn:hover { background: var(--color-danger-soft); }

.action-btn {
  padding: 0.55rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Preset picker */
.preset-toggle-row { display: flex; justify-content: center; }
.preset-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.2rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}
.preset-toggle-btn:hover { background: var(--color-gold-dark); color: var(--color-surface); }
.preset-panel {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.preset-panel-hint { font-size: 0.75rem; color: var(--color-text-dim); text-align: center; margin: 0; }
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.5rem;
}
.preset-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.65rem 0.4rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
}
.preset-card:hover { border-color: var(--color-gold-dark); background: var(--surface-gold-soft); transform: translateY(-1px); }
.preset-card-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  line-height: 1.2;
}
.preset-card-count {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  color: var(--color-text-dim);
  background: var(--surface-ghost);
  border-radius: 6px;
  padding: 0.1rem 0.4rem;
  margin-top: 0.1rem;
}

/* Equipment search */
.equip-search-panel {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.equip-search-row { display: flex; align-items: center; gap: 0.5rem; }
.equip-search-input { flex: 1; }
.equip-loading { font-family: var(--font-heading), sans-serif; font-size: 0.8rem; color: var(--color-text-dim); }
.equip-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 220px;
  overflow-y: auto;
}
.equip-result-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.15s;
}
.equip-result-item:hover { border-color: var(--color-gold-dark); background: var(--surface-gold-soft); }
.equip-result-name { flex: 1; font-family: var(--font-heading), sans-serif; font-size: 0.82rem; color: var(--color-parchment); }
.equip-result-type { font-size: 0.68rem; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.equip-result-price { font-family: var(--font-heading), sans-serif; font-size: 0.75rem; color: var(--color-gold-bright); min-width: 52px; text-align: right; }
.equip-empty { font-size: 0.78rem; color: var(--color-text-dim); text-align: center; margin: 0; padding: 0.4rem; }
.equip-err { color: var(--color-danger); }
</style>
