<script setup>
import { computed } from 'vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import AppIcon from './AppIcon.vue'
import ReleaseNotesModal from './ReleaseNotesModal.vue'

const props = defineProps({
  role: { type: String, required: true },
  variant: { type: String, default: 'icon' }, // 'icon' | 'banner'
})

const hasUnread = computed(() => releaseNotesStore.hasUnreadFor(props.role))
const latest = computed(() => releaseNotesStore.latestVersion())
const latestUnread = computed(() => {
  const notes = releaseNotesStore.unreadFor(props.role)
  return notes.length ? notes[0].version : null
})
</script>

<template>
  <!-- Icon variant — compact bell with dot -->
  <template v-if="props.variant === 'icon'">
    <button
      class="rn-bell-btn"
      :class="{ 'has-unread': hasUnread }"
      :title="hasUnread ? 'Nouveautés disponibles' : 'Notes de version'"
      aria-label="Notes de version"
      @click="releaseNotesStore.isOpen = true"
    >
      <AppIcon icon="lucide:bell" size="1rem" />
      <span v-if="hasUnread" class="rn-dot" aria-hidden="true" />
    </button>
  </template>

  <!-- Banner variant — visible button with text -->
  <template v-else-if="props.variant === 'banner'">
    <button
      class="rn-banner-btn"
      :class="{ 'has-unread': hasUnread }"
      @click="releaseNotesStore.isOpen = true"
      aria-label="Notes de version"
    >
      <span class="rn-banner-left">
        <AppIcon :icon="hasUnread ? 'lucide:sparkles' : 'lucide:history'" size="0.95rem" />
        <span v-if="hasUnread" class="rn-banner-dot" aria-hidden="true" />
      </span>
      <span class="rn-banner-text">
        <span v-if="hasUnread" class="rn-banner-label">Nouveautés disponibles</span>
        <span v-else class="rn-banner-label">Notes de version</span>
        <span class="rn-banner-version">v{{ hasUnread ? latestUnread : latest }}</span>
      </span>
      <AppIcon icon="lucide:chevron-right" size="0.85rem" class="rn-banner-arrow" />
    </button>
  </template>

  <ReleaseNotesModal :role="props.role" />
</template>

<style scoped>
/* ── Icon variant ───────────────────────────────────────────────────────── */
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

.rn-bell-btn.has-unread { color: var(--color-gold); }

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

/* ── Banner variant ─────────────────────────────────────────────────────── */
.rn-banner-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(201, 168, 76, 0.06);
  border: 1px solid rgba(201, 168, 76, 0.2);
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: 0.82rem;
  text-align: left;
  width: 100%;
}

.rn-banner-btn:hover {
  background: rgba(201, 168, 76, 0.12);
  border-color: rgba(201, 168, 76, 0.4);
  color: var(--color-parchment);
}

.rn-banner-btn.has-unread {
  background: rgba(201, 168, 76, 0.1);
  border-color: var(--color-gold-dark);
  color: var(--color-parchment);
  animation: rn-banner-glow 3s ease-in-out infinite;
}

.rn-banner-left {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-gold);
  flex-shrink: 0;
}

.rn-banner-dot {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  width: 0.4rem;
  height: 0.4rem;
  background: var(--color-danger);
  border-radius: 50%;
  animation: rn-pulse 2s ease-in-out infinite;
}

.rn-banner-text {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.rn-banner-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rn-banner-version {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-gold-bright);
  background: rgba(201, 168, 76, 0.12);
  border: 1px solid rgba(201, 168, 76, 0.2);
  border-radius: 4px;
  padding: 0.05rem 0.35rem;
  flex-shrink: 0;
  letter-spacing: 0.04em;
}

.rn-banner-arrow {
  color: var(--color-text-dim);
  flex-shrink: 0;
  transition: transform 0.15s;
}
.rn-banner-btn:hover .rn-banner-arrow { transform: translateX(2px); }

@keyframes rn-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}

@keyframes rn-banner-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201, 168, 76, 0); }
  50% { box-shadow: 0 0 8px 0 rgba(201, 168, 76, 0.18); }
}
</style>
