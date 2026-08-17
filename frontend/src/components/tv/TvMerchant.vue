<script setup>
import { computed } from 'vue'
import { rarityColor } from '@/utils/rarity.js'

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

// Astuce anti-troncature : au lieu de couper le nom avec "…", on réduit sa taille de
// police et on autorise une 3e ligne quand il est trop long pour tenir en 2 lignes à
// taille normale — le nom complet reste toujours visible.
function nameStyle(item) {
  const label = (item.is_magic ? '✨ ' : '') + (item.name || '')
  const len = label.length
  if (len > 40) return { '--name-scale': 0.55, '-webkit-line-clamp': 3 }
  if (len > 28) return { '--name-scale': 0.68, '-webkit-line-clamp': 3 }
  if (len > 18) return { '--name-scale': 0.85, '-webkit-line-clamp': 2 }
  return { '--name-scale': 1, '-webkit-line-clamp': 2 }
}
</script>

<template>
  <div class="merchant-display" data-testid="tv-mode-merchant">
    <header class="tv-header">
      <h1 class="session-title">{{ activeMerchant?.name }}</h1>
      <p v-if="activeMerchant?.description" class="merchant-desc">{{ activeMerchant.description }}</p>
    </header>
    <div
      class="merchant-grid"
      :class="density"
      :style="{ '--merchant-cols': columns, '--merchant-rows': rows }"
    >
      <div
        v-for="item in activeMerchant?.items"
        :key="item.id"
        class="merchant-item"
        :class="{ 'out-of-stock': item.stock === 0, 'is-magic': item.is_magic }"
        :style="item.is_magic && item.rarity ? { '--rarity-color': rarityColor(item.rarity) } : {}"
      >
        <div class="item-name" :style="nameStyle(item)">{{ item.is_magic ? '✨ ' : '' }}{{ item.name }}</div>
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
.tv-header { text-align: center; flex-shrink: 0; }
.session-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2.2rem, 5vw, 4rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.1em;
  margin: 0.15rem 0;
}
.merchant-desc {
  font-family: var(--font-body), sans-serif;
  font-size: clamp(1.1rem, 1.4vw, 1.8rem);
  color: var(--color-text-dim);
  margin: 0.5rem 0 0;
}
.merchant-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--merchant-cols, 4), 1fr);
  grid-auto-rows: minmax(0, clamp(170px, 30vh, 360px));
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
.merchant-item.is-magic {
  /* `!important` retiré : la règle globale .merchant-item (style.css) ne force plus
     background/border-color. --tv-panel-bg reste un gradient (pas une couleur unie) :
     color-mix() doit donc se baser sur --color-surface-alt, sous peine de déclaration
     invalide et ignorée. */
  --rarity-color: var(--color-gold-bright);
  border-color: var(--rarity-color);
  background: color-mix(in oklab, var(--rarity-color) 16%, var(--color-surface-alt));
  box-shadow: 0 0 0 1px var(--rarity-color), inset 0 0 24px color-mix(in oklab, var(--rarity-color) 22%, transparent);
}
.item-name {
  --name-scale: 1;
  font-family: var(--font-heading), sans-serif;
  font-size: calc(clamp(1.8rem, 2.2vw, 3.2rem) * var(--name-scale));
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
  font-size: clamp(1.5rem, 1.7vw, 2.6rem);
  color: var(--color-gold-bright);
  font-weight: bold;
}
.item-stock {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.6rem, 1.9vw, 2.8rem);
  font-weight: 700;
  color: var(--color-text-dim);
}
.item-stock.unlimited { color: var(--tv-success-text); font-size: clamp(2rem, 2.4vw, 3.4rem); }
.item-stock.empty { color: var(--tv-danger-text); }

/* 3 rows: trim a notch so everything still fits. */
.merchant-grid.dense { gap: 1.2rem; grid-auto-rows: minmax(0, clamp(140px, 22vh, 280px)); }
.merchant-grid.dense .merchant-item { padding: 1.2rem 1.5rem; gap: 0.7rem; }
.merchant-grid.dense .item-name { font-size: calc(clamp(1.5rem, 1.7vw, 2.4rem) * var(--name-scale)); }
.merchant-grid.dense .item-price { font-size: clamp(1.3rem, 1.4vw, 2rem); }
.merchant-grid.dense .item-stock { font-size: clamp(1.4rem, 1.6vw, 2.4rem); }
.merchant-grid.dense .item-stock.unlimited { font-size: clamp(1.8rem, 2vw, 2.8rem); }

/* 4+ rows: trim further still — name stays the dominant element. */
.merchant-grid.denser { gap: 0.85rem; grid-auto-rows: minmax(0, clamp(105px, 16vh, 220px)); }
.merchant-grid.denser .merchant-item { padding: 0.85rem 1.1rem; gap: 0.5rem; border-radius: 10px; }
.merchant-grid.denser .item-name { font-size: calc(clamp(1.3rem, 1.6vw, 2.2rem) * var(--name-scale)); }
.merchant-grid.denser .item-price { font-size: clamp(1.1rem, 1.3vw, 1.8rem); }
.merchant-grid.denser .item-stock { font-size: clamp(1.3rem, 1.5vw, 2.2rem); }
.merchant-grid.denser .item-stock.unlimited { font-size: clamp(1.6rem, 1.8vw, 2.6rem); }
</style>
