<script setup>
import AppIcon from '../../AppIcon.vue'

defineProps({
  requests: { type: Array, default: () => [] },
})

const emit = defineEmits(['respond'])
</script>

<template>
  <div v-if="requests.length > 0" class="requests-banner">
    <p class="requests-title"><AppIcon icon="lucide:shopping-cart" size="0.85em" /> Demandes d'achat en attente ({{ requests.length }})</p>
    <div v-for="req in requests" :key="req._key" class="request-row">
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
      <button class="respond-btn" @click="emit('respond', req)">Répondre</button>
    </div>
  </div>
</template>

<style scoped>
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-body), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.respond-btn:hover { background: color-mix(in oklab, var(--color-success-soft) 75%, var(--surface-highlight)); }
</style>
