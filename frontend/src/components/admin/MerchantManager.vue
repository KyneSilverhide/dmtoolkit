<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import { BACKEND_URL } from '@/config.js'

import MerchantRequestsBanner from './merchant/MerchantRequestsBanner.vue'
import MerchantCreateForm from './merchant/MerchantCreateForm.vue'
import MerchantList from './merchant/MerchantList.vue'
import MerchantRespondDialog from './merchant/MerchantRespondDialog.vue'

// ── State ───────────────────────────────────────────────────────────────
const merchants = ref([])
const pendingRequests = ref([])
const loading = ref(false)
const view = ref('list') // 'list' | 'create'

// Respond dialog
const respondingRequest = ref(null)

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

// ── Normalize request data into batch groups ─────────────────────────────
function normalizeRequest(data) {
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

// ── Socket actions ───────────────────────────────────────────────────────
let createInFlight = false

function onCreateSubmit({ name, description, items }) {
  if (createInFlight || !sessionStore.activeSession) return
  createInFlight = true
  const socket = getSocket()
  socket.emit('create-merchant', {
    sessionId: sessionStore.activeSession.id,
    name,
    description,
    items,
  })
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

function openRespond(req) {
  respondingRequest.value = req
}

function submitRespond({ action, customPrice }) {
  if (!respondingRequest.value) return
  const socket = getSocket()
  if (respondingRequest.value.batch_id) {
    const usesCustomPrice = action === 'discount' || action === 'increase'
    socket.emit('respond-batch-purchase', {
      batchId: respondingRequest.value.batch_id,
      action,
      finalPrice: usesCustomPrice ? customPrice : respondingRequest.value.total_price,
    })
  } else {
    socket.emit('respond-purchase', {
      requestId: respondingRequest.value.id,
      action,
      finalPrice: (action === 'discount' || action === 'increase')
        ? customPrice
        : respondingRequest.value.total_price,
    })
  }
  respondingRequest.value = null
}

// ── Socket handlers ──────────────────────────────────────────────────────
function handleMerchantCreated(data) {
  merchants.value.unshift(data)
  view.value = 'list'
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
        <button class="tab-btn" :class="{ active: view === 'list' }" @click="view = 'list'">Liste</button>
        <button class="tab-btn" :class="{ active: view === 'create' }" @click="view = 'create'">+ Créer</button>
      </div>
    </div>

    <MerchantRequestsBanner :requests="pendingRequests" @respond="openRespond" />

    <MerchantCreateForm v-if="view === 'create'" @submit="onCreateSubmit" />

    <MerchantList
      v-else
      :merchants="merchants"
      :loading="loading"
      @show-tv="showOnTv"
      @close-merchant="closeMerchant"
      @delete-merchant="deleteMerchant"
    />

    <MerchantRespondDialog
      :request="respondingRequest"
      @close="respondingRequest = null"
      @submit="submitRespond"
    />
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}
.header-actions { display: flex; gap: 0.4rem; }
.tab-btn {
  padding: 0.35rem 0.75rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
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
</style>
