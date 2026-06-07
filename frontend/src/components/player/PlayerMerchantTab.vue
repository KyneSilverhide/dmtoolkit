<script setup>
import AppIcon from '@/components/AppIcon.vue'
import HelpTip from '@/components/HelpTip.vue'

const props = defineProps({
  activeMerchant: { default: null },
  cart:           { type: Object, default: () => ({}) },
  cartItemCount:  { type: Number, default: 0 },
  cartTotal:      { type: Number, default: 0 },
  cartSending:    { type: Boolean, default: false },
})

const emit = defineEmits(['set-cart-qty', 'submit-cart', 'clear-cart'])
</script>

<template>
  <div>
    <div v-if="!activeMerchant" class="panel empty-panel">
      <p class="empty-icon"><AppIcon icon="game-icons:shop" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="empty-text">Aucun marchand ouvert pour l'instant.</p>
    </div>
    <template v-else>
      <!-- Items list -->
      <div class="panel shop-panel">
        <div
          v-for="item in activeMerchant.items"
          :key="item.id"
          class="shop-item"
          :class="{ 'out-of-stock': item.stock === 0 }"
        >
          <div class="shop-item-info">
            <span class="shop-item-cat">{{ item.category }}</span>
            <span class="shop-item-name">{{ item.name }}</span>
            <p v-if="item.description" class="shop-item-desc">{{ item.description }}</p>
          </div>
          <div class="shop-item-right">
            <span class="shop-item-price">{{ item.price }} po</span>
            <span v-if="item.stock === -1" class="shop-item-stock">∞</span>
            <span v-else-if="item.stock === 0" class="shop-item-stock empty">Épuisé</span>
            <span v-else class="shop-item-stock">×{{ item.stock }}</span>
            <div v-if="item.stock !== 0" class="qty-controls">
              <button class="qty-btn" @click="emit('set-cart-qty', item.id, (cart[item.id] || 0) - 1)">−</button>
              <span class="qty-value">{{ cart[item.id] || 0 }}</span>
              <button class="qty-btn" @click="emit('set-cart-qty', item.id, (cart[item.id] || 0) + 1)">+</button>
              <HelpTip id="player.shop-quantity" />
            </div>
          </div>
        </div>
      </div>

      <!-- Cart summary + submit -->
      <div class="panel cart-panel" :class="{ 'cart-active': cartItemCount > 0 }">
        <div class="cart-summary">
          <span class="cart-label"><AppIcon icon="lucide:shopping-cart" size="0.9em" /> Panier : {{ cartItemCount }} article(s) <HelpTip id="player.shop-cart" /></span>
          <span class="cart-total">{{ cartTotal }} po</span>
        </div>
        <div class="cart-actions">
          <button
            class="cart-submit-btn"
            :disabled="cartItemCount === 0 || cartSending"
            @click="emit('submit-cart')"
          >
            <AppIcon v-if="!cartSending" icon="lucide:send" size="0.85em" />
            {{ cartSending ? '…' : 'Envoyer la demande' }}
          </button>
          <button
            v-if="cartItemCount > 0"
            class="cart-clear-btn"
            @click="emit('clear-cart')"
          >Vider</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Panel cards ─────────────────────────────────────────────────────── */
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}

/* ── Empty state ─────────────────────────────────────────────────────── */
.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 0.5rem;
  border-style: dashed;
}
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading), sans-serif; font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }

/* ── Shop ────────────────────────────────────────────────────────────── */
.shop-panel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.5rem;
  background: var(--player-control-bg-muted);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.shop-item.out-of-stock { opacity: 0.45; }
.shop-item-info { flex: 1; min-width: 0; }
.shop-item-cat {
  display: block;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.52rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.1rem;
}
.shop-item-name { font-family: var(--font-heading), sans-serif; font-size: 0.85rem; color: var(--color-parchment); }
.shop-item-desc { font-family: var(--font-body), sans-serif; font-size: 0.72rem; color: var(--color-text-dim); margin: 0.1rem 0 0; }
.shop-item-right { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.shop-item-price { font-family: var(--font-title), sans-serif; font-size: 0.95rem; color: var(--color-gold-bright); }
.shop-item-stock { font-family: var(--font-heading), sans-serif; font-size: 0.6rem; color: var(--color-text-dim); }
.shop-item-stock.empty { color: var(--player-danger-text); }

.qty-controls { display: flex; align-items: center; gap: 0.3rem; }
.qty-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-size: 1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.qty-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.qty-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-parchment);
  min-width: 20px;
  text-align: center;
}

/* ── Cart ────────────────────────────────────────────────────────────── */
.cart-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-color: var(--color-gold-dark);
  margin-top: 0.75rem;
}
.cart-panel.cart-active { border-color: var(--color-gold-dark); background: var(--player-panel-highlight-bg); }
.cart-summary { display: flex; align-items: center; justify-content: space-between; }
.cart-label { font-family: var(--font-heading), sans-serif; font-size: 0.75rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.cart-total { font-family: var(--font-title), sans-serif; font-size: 1.1rem; color: var(--color-gold-bright); }
.cart-actions { display: flex; gap: 0.5rem; }
.cart-submit-btn {
  flex: 1;
  padding: 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: var(--player-gold-bg);
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-submit-btn:hover:not(:disabled) { background: var(--player-gold-bg-strong); }
.cart-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cart-clear-btn {
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-clear-btn:hover { border-color: var(--player-danger-border); color: var(--player-danger-text); }
</style>
