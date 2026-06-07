<script setup>
import { ref, watch } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'

const props = defineProps({
  request: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submit'])

const respondAction = ref('accept')
const respondCustomPrice = ref(0)

watch(() => props.request, (req) => {
  if (req) {
    respondAction.value = 'accept'
    respondCustomPrice.value = req.total_price
  }
})

function submit() {
  const usesCustomPrice = respondAction.value === 'discount' || respondAction.value === 'increase'
  emit('submit', {
    action: respondAction.value,
    customPrice: usesCustomPrice ? respondCustomPrice.value : props.request.total_price,
  })
}
</script>

<template>
  <div v-if="request" class="respond-overlay" @click.self="emit('close')">
    <div class="respond-dialog">
      <h3 class="dialog-title">Répondre à la demande</h3>
      <p class="dialog-player">
        <strong>{{ request.player_name }}</strong> souhaite acheter :
      </p>
      <ul class="dialog-items-list">
        <li v-for="item in request.items" :key="item.request_id" class="dialog-item-row">
          <span class="dialog-item-name">{{ item.item_name }}</span>
          <span class="dialog-item-qty">× {{ item.quantity }}</span>
          <span class="dialog-item-price">{{ item.total_price }} po</span>
        </li>
      </ul>
      <div class="dialog-total">Total : <strong>{{ request.total_price }} po</strong></div>

      <div class="respond-actions">
        <HelpTip id="merchant.counter-offer" />
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
        <button class="action-btn" @click="submit">Confirmer</button>
        <button class="cancel-btn" @click="emit('close')">Annuler</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.dialog-player {
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  color: var(--color-text-dim);
  margin: 0;
}
.dialog-player strong { color: var(--color-success); }
.dialog-items-list {
  list-style: none;
  margin: 0;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
}
.dialog-item-name { flex: 1; color: var(--color-parchment); }
.dialog-item-qty { color: var(--color-text-dim); min-width: 40px; }
.dialog-item-price { color: var(--color-gold-bright); min-width: 60px; text-align: right; }
.dialog-total {
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  outline: none;
  width: 80px;
}
.custom-price-input:focus { border-color: var(--color-gold-dark); }

.dialog-footer { display: flex; gap: 0.5rem; }
.action-btn {
  flex: 2;
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
}
.action-btn:hover { background: var(--gradient-accent-action-hover); }
.cancel-btn {
  flex: 1;
  padding: 0.55rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-btn:hover { border-color: var(--color-danger-border); color: var(--color-danger); }
</style>
