<script setup>
import { releaseNotesStore } from '../stores/releaseNotes.js'
import AppIcon from './AppIcon.vue'
import ReleaseNotesModal from './ReleaseNotesModal.vue'

const props = defineProps({
  role: { type: String, required: true },
})
</script>

<template>
  <button
    class="rn-bell-btn"
    :class="{ 'has-unread': releaseNotesStore.hasUnreadFor(props.role) }"
    :title="releaseNotesStore.hasUnreadFor(props.role) ? 'Nouveautés disponibles' : 'Notes de version'"
    aria-label="Notes de version"
    @click="releaseNotesStore.isOpen = true"
  >
    <AppIcon icon="lucide:bell" size="1rem" />
    <span v-if="releaseNotesStore.hasUnreadFor(props.role)" class="rn-dot" aria-hidden="true" />
  </button>

  <ReleaseNotesModal :role="props.role" />
</template>

<style scoped>
.rn-bell-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}

.rn-bell-btn:hover {
  color: var(--color-parchment);
  background: rgba(201, 168, 76, 0.08);
}

.rn-bell-btn.has-unread {
  color: var(--color-gold);
}

.rn-dot {
  position: absolute;
  top: 0.15rem;
  right: 0.15rem;
  width: 0.45rem;
  height: 0.45rem;
  background: var(--color-danger);
  border-radius: 50%;
  animation: rn-pulse 2s ease-in-out infinite;
}

@keyframes rn-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
</style>
