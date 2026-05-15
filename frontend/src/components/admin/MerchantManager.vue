<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'
import AppIcon from '../AppIcon.vue'
import MERCHANT_PRESETS from '../../assets/merchantPresets.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// ── State ───────────────────────────────────────────────────────────────
const merchants = ref([])
const pendingRequests = ref([]) // normalized batch groups
const loading = ref(false)
const view = ref('list') // 'list' | 'create'
const presetPanelOpen = ref(false)// Create form
const newName = ref('')
const newDesc = ref('')
const newItems = ref([])
const creating = ref(false)

// Respond dialog
const respondingRequest = ref(null)
const respondAction = ref('accept')

// ── Equipment search ─────────────────────────────────────────────────────
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
  // "1 500 po" → 1500, "5 pa" → 0 (rounded down to 0 gp), "1 pc" → 0
  const m = String(raw).replace(/\s/g, '').match(/^([\d,\.]+)\s*(po|pa|pc)?/)
  if (!m) return 0
  const val = parseFloat(m[1].replace(',', '.'))
  if (m[2] === 'pa') return Math.ceil(val / 10)  // silver → gold (rounded)
  if (m[2] === 'pc') return 0
  return Math.round(val)
}

/** Map item_type to a merchant category label */
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

// ── API ─────────────────────────────────────────────────────────────────
async function loadMerchants() {
  if (!sessionStore.activeSession) return
  loading.value = true
  try {
    const [mRes, pRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/merchants`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/purchase-requests`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }),
    ])
    if (mRes.ok) merchants.value = await mRes.json()
    if (pRes.ok) pendingRequests.value = groupLoadedRequests((await pRes.json()).filter(r => r.status === 'pending'))
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

// ── Create flow ─────────────────────────────────────────────────────────
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

function createMerchant() {
  if (!newName.value.trim()) return
  const validItems = newItems.value.filter(i => i.name.trim() && i.price >= 0)
  if (validItems.length === 0) return
  const socket = getSocket()
  socket.emit('create-merchant', {
    sessionId: sessionStore.activeSession.id,
    name: newName.value.trim(),
    description: newDesc.value.trim(),
    items: validItems,
  })
  creating.value = true
}

function showOnTv(merchantId) {
  const socket = getSocket()
  socket.emit('show-merchant', { sessionId: sessionStore.activeSession.id, merchantId })
}

function closeMerchant() {
  const socket = getSocket()
  socket.emit('close-merchant', { sessionId: sessionStore.activeSession.id })
}

function deleteMerchant(merchantId) {
  const socket = getSocket()
  socket.emit('delete-merchant', { sessionId: sessionStore.activeSession.id, merchantId })
}

// ── Normalize request data into batch groups ─────────────────────────────
function normalizeRequest(data) {
  // New batch format: has batch_id + items array
  if (data.batch_id && Array.isArray(data.items)) {
    return {
      _key: data.batch_id,
      batch_id: data.batch_id,
      player_name: data.player_name,
      player_id: data.player_id,
      merchant_id: data.merchant_id,
      items: data.items,
      total_price: data.total_price,
    }
  }
  // Legacy single-item format (from REST API or old socket events)
  return {
    _key: `single-${data.id}`,
    batch_id: null,
    id: data.id,
    player_name: data.player_name,
    player_id: data.player_id,
    merchant_id: data.merchant_id,
    items: [{
      request_id: data.id,
      item_name: data.item_name,
      quantity: data.quantity,
      unit_price: data.item_price,
      total_price: data.base_price,
    }],
    total_price: data.base_price,
  }
}

function groupLoadedRequests(rows) {
  const groups = {}
  for (const row of rows) {
    const key = row.batch_id ? row.batch_id : `single-${row.id}`
    if (!groups[key]) {
      groups[key] = {
        _key: key,
        batch_id: row.batch_id || null,
        id: row.id,
        player_name: row.player_name,
        player_id: row.player_id,
        merchant_id: row.merchant_id,
        items: [],
        total_price: 0,
      }
    }
    groups[key].items.push({
      request_id: row.id,
      item_name: row.item_name,
      quantity: row.quantity,
      unit_price: row.item_price,
      total_price: row.base_price,
    })
    groups[key].total_price += row.base_price
  }
  return Object.values(groups)
}

// ── Purchase response ────────────────────────────────────────────────────
const respondCustomPrice = ref(0)

function openRespond(req) {
  respondingRequest.value = req
  respondAction.value = 'accept'
  respondCustomPrice.value = req.total_price
}

function submitRespond() {
  if (!respondingRequest.value) return
  const socket = getSocket()
  if (respondingRequest.value.batch_id) {
    const usesCustomPrice = respondAction.value === 'discount' || respondAction.value === 'increase'
    socket.emit('respond-batch-purchase', {
      batchId: respondingRequest.value.batch_id,
      action: respondAction.value,
      finalPrice: usesCustomPrice ? respondCustomPrice.value : respondingRequest.value.total_price,
    })
  } else {
    // Legacy single item — supports discount/increase with custom price
    socket.emit('respond-purchase', {
      requestId: respondingRequest.value.id,
      action: respondAction.value,
      finalPrice: (respondAction.value === 'discount' || respondAction.value === 'increase')
        ? respondCustomPrice.value
        : respondingRequest.value.total_price,
    })
  }
  respondingRequest.value = null
}

// ── Socket handlers ──────────────────────────────────────────────────────
function handleMerchantCreated(data) {
  merchants.value.unshift(data)
  creating.value = false
  view.value = 'list'
  newName.value = ''
  newDesc.value = ''
  newItems.value = []
}

function handleMerchantUpdated(data) {
  const idx = merchants.value.findIndex(m => m.id === data.id)
  if (idx !== -1) merchants.value[idx] = data
}

function handleMerchantDeleted({ merchantId }) {
  merchants.value = merchants.value.filter(m => m.id !== merchantId)
}

function handlePurchaseRequest(data) {
  pendingRequests.value.push(normalizeRequest(data))
}

function handlePurchaseResponded({ requestId, batchId }) {
  if (batchId) {
    pendingRequests.value = pendingRequests.value.filter(r => r.batch_id !== batchId)
  } else {
    pendingRequests.value = pendingRequests.value.filter(r => r._key !== `single-${requestId}`)
  }
}

function handleCounterOfferResponse({ requestId }) {
  pendingRequests.value = pendingRequests.value.filter(r => r._key !== `single-${requestId}`)
}

onMounted(() => {
  loadMerchants()
  const socket = getSocket()
  socket.on('merchant-created', handleMerchantCreated)
  socket.on('merchant-updated', handleMerchantUpdated)
  socket.on('merchant-deleted', handleMerchantDeleted)
  socket.on('purchase-request', handlePurchaseRequest)
  socket.on('purchase-responded', handlePurchaseResponded)
  socket.on('counter-offer-response', handleCounterOfferResponse)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('merchant-created', handleMerchantCreated)
  socket.off('merchant-updated', handleMerchantUpdated)
  socket.off('merchant-deleted', handleMerchantDeleted)
  socket.off('purchase-request', handlePurchaseRequest)
  socket.off('purchase-responded', handlePurchaseResponded)
  socket.off('counter-offer-response', handleCounterOfferResponse)
})
</script>

<template>
  <div class="merchant-manager">
    <div class="manager-header">
      <h2 class="section-title"><AppIcon icon="game-icons:shop" size="0.9em" color="var(--color-gold-bright)" /> Gestion des Marchands</h2>
      <div class="header-actions">
        <button
          class="tab-btn"
          :class="{ active: view === 'list' }"
          @click="view = 'list'"
        >Liste</button>
        <button
          class="tab-btn"
          :class="{ active: view === 'create' }"
          @click="view = 'create'"
        >+ Créer</button>
      </div>
    </div>

    <!-- Pending purchase requests banner -->
    <div v-if="pendingRequests.length > 0" class="requests-banner">
      <p class="requests-title"><AppIcon icon="lucide:shopping-cart" size="0.85em" /> Demandes d'achat en attente ({{ pendingRequests.length }})</p>
      <div v-for="req in pendingRequests" :key="req._key" class="request-row">
        <div class="request-info">
          <strong class="request-player">{{ req.player_name }}</strong> souhaite acheter :
          <ul class="request-items-list">
            <li v-for="item in req.items" :key="item.request_id">
              {{ item.item_name }} × {{ item.quantity }}
              <span class="item-line-price">— {{ item.total_price }} po</span>
            </li>
          </ul>
          <span class="request-total">Total : {{ req.total_price }} po</span>
        </div>
        <button class="respond-btn" @click="openRespond(req)">Répondre</button>
      </div>
    </div>

    <!-- Create merchant form -->
    <div v-if="view === 'create'" class="create-form">

      <!-- Preset picker panel -->
      <div class="preset-toggle-row">
        <button class="preset-toggle-btn" @click="presetPanelOpen = !presetPanelOpen">
          <AppIcon icon="game-icons:shop" size="0.85em" />
          {{ presetPanelOpen ? 'Masquer les modèles' : '✦ Choisir un modèle de marchand' }}
        </button>
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
            @keydown.escape="equipSearchOpen = false"
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
            <span class="equip-result-price" v-if="eq.list_data?.prix">{{ eq.list_data.prix }}</span>
          </li>
        </ul>
        <p v-else-if="equipError" class="equip-empty equip-err">⚠ Impossible de contacter le serveur.</p>
        <p v-else-if="equipSearch.trim().length >= 2 && !equipLoading" class="equip-empty">Aucun résultat pour « {{ equipSearch.trim() }} ».</p>
        <p v-else-if="equipSearch.trim().length > 0 && equipSearch.trim().length < 2" class="equip-empty">Tapez au moins 2 caractères.</p>
      </div>

      <div v-if="newItems.length === 0" class="no-items">
        <p>Aucun article. Cliquez sur « Objets D&D » pour pré-remplir ou « + Ajouter » pour créer manuellement.</p>
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
        :disabled="!newName.trim() || newItems.filter(i=>i.name.trim()).length === 0 || creating"
        @click="createMerchant"
      >
        {{ creating ? '…' : '✓ Créer le marchand' }}
      </button>
    </div>

    <!-- Merchants list -->
    <div v-else class="merchants-list">
      <div v-if="loading" class="loading-text">Chargement…</div>
      <div v-else-if="merchants.length === 0" class="empty-msg">
        <p>Aucun marchand créé pour cette session.</p>
      </div>
      <div v-for="merchant in merchants" :key="merchant.id" class="merchant-card">
        <div class="merchant-card-header">
          <div>
            <p class="merchant-card-name">{{ merchant.name }}</p>
            <p v-if="merchant.description" class="merchant-card-desc">{{ merchant.description }}</p>
          </div>
          <div class="merchant-actions">
            <button class="show-tv-btn" @click="showOnTv(merchant.id)"><AppIcon icon="lucide:monitor" size="0.85em" /> Sur TV</button>
            <button class="close-merchant-btn" @click="closeMerchant" title="Clôturer le marchand pour les joueurs">✕ Fermer</button>
            <button class="delete-merchant-btn" @click="deleteMerchant(merchant.id)" title="Supprimer définitivement ce marchand">
              <AppIcon icon="lucide:trash-2" size="0.85em" />
            </button>
          </div>
        </div>
        <div class="merchant-items-preview">
          <div v-for="item in merchant.items" :key="item.id" class="preview-item">
            <span class="preview-cat">{{ item.category }}</span>
            <span class="preview-name">{{ item.name }}</span>
            <span class="preview-price">{{ item.price }} po</span>
            <span class="preview-stock" :class="{ empty: item.stock === 0 }">
              {{ item.stock === -1 ? '∞' : item.stock === 0 ? 'Épuisé' : `×${item.stock}` }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Respond dialog -->
    <div v-if="respondingRequest" class="respond-overlay" @click.self="respondingRequest = null">
      <div class="respond-dialog">
        <h3 class="dialog-title">Répondre à la demande</h3>
        <p class="dialog-player">
          <strong>{{ respondingRequest.player_name }}</strong> souhaite acheter :
        </p>
        <ul class="dialog-items-list">
          <li v-for="item in respondingRequest.items" :key="item.request_id" class="dialog-item-row">
            <span class="dialog-item-name">{{ item.item_name }}</span>
            <span class="dialog-item-qty">× {{ item.quantity }}</span>
            <span class="dialog-item-price">{{ item.total_price }} po</span>
          </li>
        </ul>
        <div class="dialog-total">Total : <strong>{{ respondingRequest.total_price }} po</strong></div>

        <div class="respond-actions">
          <button class="respond-action-btn" :class="{ active: respondAction === 'accept' }" @click="respondAction = 'accept'">
            <AppIcon icon="lucide:check-circle" size="0.85em" color="var(--color-success)" /> Accepter
          </button>
          <button class="respond-action-btn reject" :class="{ active: respondAction === 'reject' }" @click="respondAction = 'reject'">
            <AppIcon icon="lucide:x-circle" size="0.85em" color="var(--color-danger)" /> Refuser
          </button>
          <button class="respond-action-btn discount" :class="{ active: respondAction === 'discount' }" @click="respondAction = 'discount'">
            <AppIcon icon="lucide:tag" size="0.85em" color="var(--color-success)" /> Ristourne
          </button>
          <button class="respond-action-btn increase" :class="{ active: respondAction === 'increase' }" @click="respondAction = 'increase'">
            <AppIcon icon="lucide:trending-up" size="0.85em" color="var(--color-danger)" /> Augmenter
          </button>
        </div>

        <div v-if="respondAction === 'discount' || respondAction === 'increase'" class="custom-price-row">
          <label class="custom-price-label">Prix final (po) :</label>
          <input
            v-model.number="respondCustomPrice"
            type="number"
            min="0"
            class="custom-price-input"
          />
        </div>

        <div class="dialog-footer">
          <button class="action-btn" @click="submitRespond">Confirmer</button>
          <button class="cancel-btn" @click="respondingRequest = null">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.merchant-manager {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  position: relative;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.4rem;
}

.tab-btn {
  padding: 0.35rem 0.75rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active, .tab-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft);
}

/* Requests banner */
.requests-banner {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.requests-title {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-success);
  margin: 0;
}
.request-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.request-info {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-parchment);
  flex: 1;
}
.request-player { color: var(--color-success); }
.request-items-list {
  margin: 0.3rem 0 0.3rem 1rem;
  padding: 0;
  list-style: disc;
  color: var(--color-text-dim);
  font-size: 0.8rem;
}
.item-line-price { color: var(--color-gold-dark); }
.request-total {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: var(--color-gold-bright);
}
.respond-btn {
  padding: 0.3rem 0.7rem;
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 6px;
  color: var(--color-success);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.respond-btn:hover { background: color-mix(in oklab, var(--color-success-soft) 75%, var(--surface-highlight)); }

/* Create form */
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
  font-family: var(--font-heading);
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
  font-family: var(--font-body);
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.items-actions { display: flex; gap: 0.4rem; }
.small-btn {
  padding: 0.3rem 0.6rem;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
}
.small-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-dark); }

.no-items {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  text-align: center;
  padding: 1rem 0;
}

.items-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; }
.item-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
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
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Merchants list */
.merchants-list { display: flex; flex-direction: column; gap: 1rem; }
.loading-text, .empty-msg {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 0;
}
.merchant-card {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.merchant-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.merchant-actions { display: flex; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.merchant-card-name {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  color: var(--color-parchment);
  margin: 0;
}
.merchant-card-desc {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0.2rem 0 0;
}
.show-tv-btn {
  padding: 0.35rem 0.75rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}
.show-tv-btn:hover { background: var(--surface-gold-soft-strong); border-color: var(--color-gold-bright); color: var(--color-gold-bright); }

.close-merchant-btn {
  padding: 0.35rem 0.75rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 6px;
  color: var(--color-danger);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}
.close-merchant-btn:hover { background: color-mix(in oklab, var(--color-danger-soft) 70%, var(--surface-highlight)); border-color: var(--color-danger); }

.delete-merchant-btn {
  padding: 0.35rem 0.55rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.delete-merchant-btn:hover {
  background: color-mix(in oklab, var(--color-danger-soft) 70%, var(--surface-highlight));
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.merchant-items-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.4rem;
  background: var(--surface-ghost);
  border-radius: 4px;
  font-family: var(--font-heading);
  font-size: 0.65rem;
}
.preview-cat {
  color: var(--color-gold-dark);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.6rem;
  width: 70px;
  flex-shrink: 0;
}
.preview-name { flex: 1; color: var(--color-parchment); }
.preview-price { color: var(--color-gold-bright); width: 50px; text-align: right; flex-shrink: 0; }
.preview-stock {
  width: 50px;
  text-align: right;
  flex-shrink: 0;
  color: var(--color-text-dim);
}
.preview-stock.empty { color: var(--color-danger); }

/* Respond dialog */
.respond-overlay {
  position: fixed;
  inset: 0;
  background: var(--surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.respond-dialog {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  width: min(480px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.dialog-title {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.dialog-player {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text-dim);
  margin: 0;
}
.dialog-player strong { color: var(--color-success); }
.dialog-items-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}
.dialog-item-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading);
  font-size: 0.8rem;
}
.dialog-item-name { flex: 1; color: var(--color-parchment); }
.dialog-item-qty { color: var(--color-text-dim); min-width: 40px; }
.dialog-item-price { color: var(--color-gold-bright); min-width: 60px; text-align: right; }
.dialog-total {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-text-dim);
  text-align: right;
}
.dialog-total strong { color: var(--color-gold-bright); font-size: 1rem; }

.respond-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.respond-action-btn {
  flex: 1;
  padding: 0.5rem 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  min-width: 80px;
}
.respond-action-btn.active { border-color: var(--color-gold-dark); color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.respond-action-btn.reject.active { border-color: var(--color-danger-border); color: var(--color-danger); background: var(--color-danger-soft); }
.respond-action-btn.discount.active { border-color: var(--color-success-border); color: var(--color-success); background: var(--color-success-soft); }
.respond-action-btn.increase.active { border-color: var(--color-warning-border); color: var(--color-warning); background: var(--color-warning-soft); }

.custom-price-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}
.custom-price-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  white-space: nowrap;
}
.custom-price-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  outline: none;
  width: 80px;
}
.custom-price-input:focus { border-color: var(--color-gold-dark); }

.dialog-footer { display: flex; gap: 0.5rem; }
.cancel-btn {
  flex: 1;
  padding: 0.55rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-btn:hover { border-color: var(--color-danger-border); color: var(--color-danger); }
.dialog-footer .action-btn { flex: 2; width: auto; }

/* Preset picker */
.preset-toggle-row {
  display: flex;
  justify-content: center;
}
.preset-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.2rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}
.preset-toggle-btn:hover {
  background: var(--color-gold-dark);
  color: var(--color-surface);
}
.preset-panel {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.preset-panel-hint {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  text-align: center;
  margin: 0;
}
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
.preset-card:hover {
  border-color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  transform: translateY(-1px);
}
.preset-card-label {
  font-family: var(--font-heading);
  font-size: 0.72rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  line-height: 1.2;
}
.preset-card-name {
  font-size: 0.68rem;
  color: var(--color-text-dim);
  font-style: italic;
  line-height: 1.2;
}
.preset-card-count {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  color: var(--color-text-dim);
  background: var(--surface-ghost);
  border-radius: 6px;
  padding: 0.1rem 0.4rem;
  margin-top: 0.1rem;
}

/* Equipment search */
.equip-search-panel {  background: var(--color-surface-alt);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.equip-search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.equip-search-input { flex: 1; }
.equip-loading {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  color: var(--color-text-dim);
}
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
.equip-result-item:hover {
  border-color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
}
.equip-result-name {
  flex: 1;
  font-family: var(--font-heading);
  font-size: 0.82rem;
  color: var(--color-parchment);
}
.equip-result-type {
  font-size: 0.68rem;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.equip-result-price {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  color: var(--color-gold-bright);
  min-width: 52px;
  text-align: right;
}
.equip-empty {
  font-size: 0.78rem;
  color: var(--color-text-dim);
  text-align: center;
  margin: 0;
  padding: 0.4rem;
}
.equip-err { color: var(--color-danger); }

</style>
