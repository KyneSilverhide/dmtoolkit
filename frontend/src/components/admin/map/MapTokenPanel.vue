<script setup>
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  players: { type: Array, default: () => [] },
  mapTokens: { type: Object, default: () => ({}) },
  pendingTokenPlayerId: { type: String, default: null },
  pendingCustomToken: { type: Boolean, default: false },
  customTokenName: { type: String, default: '' },
})

const emit = defineEmits([
  'toggle-player-token',
  'add-custom-token',
  'remove-custom-token',
  'update:customTokenName',
])

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}
</script>

<template>
  <div class="control-section">
    <h4 class="subsection-title"><AppIcon icon="game-icons:wizard-staff" size="0.85em" /> Jetons <HelpTip id="map.token-place" /></h4>

    <p v-if="players.length === 0" class="hint-text">Aucun joueur connecté.</p>
    <div v-else class="token-tray">
      <div
        v-for="player in players"
        :key="player.id"
        class="token-chip"
        :class="{
          placed: !!mapTokens[String(player.id)],
          pending: pendingTokenPlayerId === String(player.id),
        }"
        :title="mapTokens[String(player.id)] ? 'Cliquer pour retirer de la carte' : 'Cliquer pour placer sur la carte'"
        @click="emit('toggle-player-token', player.id)"
      >
        <div class="chip-avatar">
          <img v-if="player.avatar_url" :src="imageFullUrl(player.avatar_url)" :alt="player.player_name" class="chip-img" />
          <span v-else class="chip-initial">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
        </div>
        <span class="chip-name">{{ player.player_name }}</span>
        <span v-if="mapTokens[String(player.id)]" class="chip-badge">✓</span>
        <span v-else-if="pendingTokenPlayerId === String(player.id)" class="chip-badge pending-badge"><AppIcon icon="lucide:map-pin" size="0.75rem" /></span>
      </div>
    </div>

    <div class="custom-token-form">
      <input
        :value="customTokenName"
        class="custom-token-input"
        placeholder="Nom custom…"
        maxlength="30"
        @input="emit('update:customTokenName', $event.target.value)"
        @keydown.enter="emit('add-custom-token')"
      />
      <button
        class="action-btn"
        :class="{ active: pendingCustomToken }"
        :disabled="!customTokenName.trim()"
        @click="emit('add-custom-token')"
      >
        <AppIcon icon="lucide:map-pin" size="0.85em" />
      </button>
    </div>

    <p v-if="pendingCustomToken || pendingTokenPlayerId" class="hint-text placement-hint">
      <AppIcon icon="lucide:map-pin" size="0.85em" /> Cliquez sur la carte pour placer
    </p>

    <div v-if="Object.keys(mapTokens).some(k => k.startsWith('custom_'))" class="token-tray" style="margin-top:0.4rem">
      <template v-for="(tokenPos, pid) in mapTokens" :key="pid">
        <div
          v-if="String(pid).startsWith('custom_')"
          class="token-chip placed"
          title="Cliquer pour retirer"
          @click="emit('remove-custom-token', pid)"
        >
          <span class="chip-initial" style="color:#6aaa44">{{ tokenPos.name?.[0]?.toUpperCase() || '?' }}</span>
          <span class="chip-name">{{ tokenPos.name }}</span>
          <span class="chip-badge" style="color:#6aaa44">✓</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.subsection-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 0.4rem;
}
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;
}
.hint-text { font-family: var(--font-body), sans-serif; font-size: 0.75rem; color: var(--color-text-dim); margin: 0; }
.token-tray { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.token-chip {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.3rem 0.55rem 0.3rem 0.35rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1.5px solid var(--color-border);
  border-radius: 999px;
  cursor: pointer; transition: all 0.2s; position: relative;
}
.token-chip:hover { border-color: var(--color-gold-dark); background: var(--surface-gold-soft); }
.token-chip.placed { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.token-chip.pending { border-color: #a78bfa; background: rgba(139,92,246,0.15); animation: pulse-pending 1s infinite; }
@keyframes pulse-pending { 0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.4); } 50% { box-shadow: 0 0 0 4px rgba(139,92,246,0); } }
.chip-avatar {
  width: 26px; height: 26px; border-radius: 50%; overflow: hidden;
  border: 1.5px solid var(--color-gold-dark); background: #111;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.chip-img { width: 100%; height: 100%; object-fit: cover; }
.chip-initial { font-family: var(--font-heading), sans-serif; font-size: 0.75rem; color: var(--color-gold-dark); }
.chip-name { font-family: var(--font-heading), sans-serif; font-size: 0.65rem; letter-spacing: 0.05em; color: var(--color-text-dim); }
.chip-badge { font-size: 0.7rem; color: var(--color-gold-bright); font-weight: bold; }
.pending-badge { color: #a78bfa; }
.placement-hint { color: #a78bfa !important; font-style: italic; }
.custom-token-form { display: flex; gap: 0.4rem; align-items: center; }
.custom-token-input {
  flex: 1; padding: 0.35rem 0.6rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1px solid var(--color-border); border-radius: 8px;
  color: var(--color-text, #fff);
  font-family: var(--font-heading), sans-serif; font-size: 0.72rem; outline: none;
}
.custom-token-input:focus { border-color: var(--color-gold-dark); }
.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif; font-size: 0.72rem; letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
