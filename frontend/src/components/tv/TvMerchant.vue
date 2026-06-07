<script setup>
const props = defineProps({
  activeMerchant: { type: Object, default: null },
})
</script>

<template>
  <div class="merchant-display" data-testid="tv-mode-merchant">
    <div class="merchant-grid">
      <div
        v-for="item in activeMerchant?.items"
        :key="item.id"
        class="merchant-item"
        :class="{ 'out-of-stock': item.stock === 0 }"
      >
        <div class="item-category">{{ item.category }}</div>
        <div class="item-name">{{ item.name }}</div>
        <p v-if="item.description" class="item-desc">{{ item.description }}</p>
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
  overflow: auto;
  padding: 1.5rem;
}
.merchant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.merchant-item {
  background: var(--tv-panel-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  transition: opacity 0.3s;
}
.merchant-item.out-of-stock {
  opacity: 0.4;
  border-color: var(--color-border);
}
.item-category {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.item-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  color: var(--color-text);
}
.item-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  line-height: 1.4;
  margin: 0;
  flex: 1;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}
.item-price {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  color: var(--color-gold-bright);
  font-weight: bold;
}
.item-stock {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}
.item-stock.unlimited { color: var(--tv-success-text); font-size: 1.2rem; }
.item-stock.empty { color: var(--tv-danger-text); }
</style>
