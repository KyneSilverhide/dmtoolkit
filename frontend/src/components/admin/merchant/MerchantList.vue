<script setup>
import AppIcon from '../../AppIcon.vue'

defineProps({
  merchants: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['show-tv', 'close-merchant', 'delete-merchant'])
</script>

<template>
  <div class="merchants-list">
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
          <button class="show-tv-btn" @click="emit('show-tv', merchant.id)">
            <AppIcon icon="lucide:monitor" size="0.85em" /> Sur TV
          </button>
          <button class="close-merchant-btn" @click="emit('close-merchant')" title="Clôturer le marchand pour les joueurs">✕ Fermer</button>
          <button class="delete-merchant-btn" @click="emit('delete-merchant', merchant.id)" title="Supprimer définitivement ce marchand">
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
</template>

<style scoped>
.merchants-list { display: flex; flex-direction: column; gap: 1rem; }
.loading-text, .empty-msg {
  font-family: var(--font-body), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  color: var(--color-parchment);
  margin: 0;
}
.merchant-card-desc {
  font-family: var(--font-body), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
}
.preview-cat {
  color: var(--color-gold-dark);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.6rem;
  width: 90px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
