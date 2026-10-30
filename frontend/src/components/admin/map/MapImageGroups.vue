<script setup>
import { ref, watch, onMounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { SHOW_IMAGE_GROUP_TEMP } from '@/socket-events.js'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'

const DURATION_KEY = 'dmt_map_group_preview_seconds'
const MIN_SECONDS = 2
const MAX_SECONDS = 120
const DEFAULT_SECONDS = 10

const groups = ref([])
const seconds = ref(DEFAULT_SECONDS)

try {
  const stored = parseInt(localStorage.getItem(DURATION_KEY), 10)
  if (stored >= MIN_SECONDS && stored <= MAX_SECONDS) seconds.value = stored
} catch { /* stockage indisponible : durée par défaut */ }

function clampedSeconds() {
  const n = parseInt(seconds.value, 10)
  return Number.isNaN(n) ? DEFAULT_SECONDS : Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, n))
}

watch(seconds, () => {
  try { localStorage.setItem(DURATION_KEY, String(clampedSeconds())) } catch { /* ignoré */ }
})

async function loadGroups() {
  if (!sessionStore.activeSession) { groups.value = []; return }
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/image-groups`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) groups.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

function preview(group) {
  if (!sessionStore.activeSession) return
  getSocket().emit(SHOW_IMAGE_GROUP_TEMP, {
    sessionId: sessionStore.activeSession.id,
    groupId: group.id,
    durationSeconds: clampedSeconds(),
  })
}

onMounted(loadGroups)
watch(() => sessionStore.activeSession?.id, loadGroups)
</script>

<template>
  <div class="control-section">
    <h4 class="subsection-title"><AppIcon icon="lucide:dices" size="0.85em" /> Groupes d'images <HelpTip id="map.groups" /></h4>
    <p v-if="groups.length === 0" class="groups-empty">Aucun groupe. Créez-en dans l'onglet Images.</p>
    <template v-else>
      <label class="duration-label">
        Durée
        <input v-model.number="seconds" type="number" :min="MIN_SECONDS" :max="MAX_SECONDS" class="form-input duration-input" />
        s
      </label>
      <ul class="group-list">
        <li v-for="group in groups" :key="group.id">
          <button
            class="action-btn group-btn"
            :disabled="!group.image_count"
            :data-testid="`map-group-preview-${group.id}`"
            @click="preview(group)"
          >
            <AppIcon icon="lucide:dices" size="0.85em" /> {{ group.name }}
            <span class="group-count">{{ group.image_count }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.subsection-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 var(--space-2);
}
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2);
}
.groups-empty { margin: 0; color: var(--color-text-dim); font-size: var(--text-sm); }
.duration-label { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-dim); font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); }
.duration-input { width: 4.5em; }
.group-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.action-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.group-count { opacity: 0.7; margin-left: var(--space-1); }
</style>
