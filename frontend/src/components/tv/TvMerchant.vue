<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeMerchant: { type: Object, default: null },
})

const itemCount = computed(() => props.activeMerchant?.items?.length || 0)

// Only name + price + stock matter on the TV (category/description live on the
// player view), so cards are short — we can fit more columns/rows than before
// while keeping rows <= 4 so the grid always fits without scrolling.
const columns = computed(() => {
  const n = itemCount.value
  if (n <= 4) return Math.max(n, 1)
  if (n <= 8) return 4
  if (n <= 16) return 4
  if (n <= 20) return 5
  return 6
})

const rows = computed(() => Math.max(1, Math.ceil(itemCount.value / columns.value)))

// Beyond 2 rows, shrink text/padding a notch at a time so everything still fits.
const density = computed(() => {
  if (rows.value >= 4) return 'denser'
  if (rows.value === 3) return 'dense'
  return 'normal'
})
</script>

<template>
  <div class="merchant-display" data-testid="tv-mode-merchant">
    <div
      class="merchant-grid"
      :class="density"
      :style="{ '--merchant-cols': columns, '--merchant-rows': rows }"
    >
      <div
        v-for="item in activeMerchant?.items"
        :key="item.id"
        class="merchant-item"
        :class="{ 'out-of-stock': item.stock === 0 }"
      >
        <div class="item-name">{{ item.name }}</div>
        <div class="item-footer">
          <span class="item-price">{{ item.price }} po</span>
          <span v-if="item.stock === -1" class="item-stock unlimited">∞</span>
          <span v-else-if="item.stock === 0" class="item-stock empty">Épuisé</span>
          <span v-else class="item-stock">× {{ item.stock }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.merchant-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 2rem;
}
.merchant-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--merchant-cols, 4), 1fr);
  grid-auto-rows: minmax(0, clamp(170px, 30vh, 320px));
  align-content: center;
  gap: 1.75rem;
  min-height: 0;
}
.merchant-item {
  background: var(--tv-panel-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 14px;
  padding: 1.5rem 1.75rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  min-height: 0;
  min-width: 0;
  transition: opacity 0.3s;
}
.merchant-item.out-of-stock {
  opacity: 0.4;
  border-color: var(--color-border);
}
.item-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 2.4rem;
  letter-spacing: 0.04em;
  color: var(--color-text);
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.item-price {
  font-family: var(--font-heading), sans-serif;
  font-size: 2rem;
  color: var(--color-gold-bright);
  font-weight: bold;
}
.item-stock {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.5rem;
  color: var(--color-text-dim);
}
.item-stock.unlimited { color: var(--tv-success-text); font-size: 2.2rem; }
.item-stock.empty { color: var(--tv-danger-text); }

/* 3 rows: trim a notch so everything still fits. */
.merchant-grid.dense { gap: 1.2rem; grid-auto-rows: minmax(0, clamp(140px, 22vh, 240px)); }
.merchant-grid.dense .merchant-item { padding: 1.2rem 1.5rem; gap: 0.7rem; }
.merchant-grid.dense .item-name { font-size: 1.9rem; }
.merchant-grid.dense .item-price { font-size: 1.6rem; }
.merchant-grid.dense .item-stock { font-size: 1.2rem; }
.merchant-grid.dense .item-stock.unlimited { font-size: 1.8rem; }

/* 4+ rows: trim further still — name stays the dominant element. */
.merchant-grid.denser { gap: 0.85rem; grid-auto-rows: minmax(0, clamp(105px, 16vh, 170px)); }
.merchant-grid.denser .merchant-item { padding: 0.85rem 1.1rem; gap: 0.5rem; border-radius: 10px; }
.merchant-grid.denser .item-name { font-size: 1.5rem; -webkit-line-clamp: 2; }
.merchant-grid.denser .item-price { font-size: 1.25rem; }
.merchant-grid.denser .item-stock { font-size: 1rem; }
.merchant-grid.denser .item-stock.unlimited { font-size: 1.4rem; }
</style>
