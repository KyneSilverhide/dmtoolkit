<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  role: { type: String, required: true },
})

const showAll = ref(false)

watch(() => releaseNotesStore.isOpen, open => {
  if (open) showAll.value = false
})

const displayedNotes = computed(() =>
  showAll.value
    ? releaseNotesStore.allFor(props.role)
    : releaseNotesStore.unreadFor(props.role)
)

const TYPE_ICONS = {
  feature: { icon: 'lucide:sparkles', color: 'var(--color-gold-bright)' },
  improvement: { icon: 'lucide:arrow-up-circle', color: 'var(--color-info)' },
  fix: { icon: 'lucide:wrench', color: 'var(--color-success)' },
  change: { icon: 'lucide:refresh-cw', color: 'var(--color-text-dim)' },
}

function typeIcon(type) {
  return TYPE_ICONS[type] || TYPE_ICONS.change
}

function close() {
  releaseNotesStore.markRead()
  releaseNotesStore.isOpen = false
}

function onBackdropClick(e) {
  if (e.target === e.currentTarget) close()
}

function onKeydown(e) {
  if (e.key === 'Escape' && releaseNotesStore.isOpen) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="rn-modal">
      <div
        v-if="releaseNotesStore.isOpen"
        class="rn-backdrop"
        @click="onBackdropClick"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rn-modal-title"
      >
        <div class="rn-card">
          <button class="rn-close" @click="close" aria-label="Fermer">
            <AppIcon icon="lucide:x" size="1em" />
          </button>

          <div class="rn-header">
            <AppIcon icon="lucide:sparkles" size="1.5rem" class="rn-header-icon" />
            <h2 id="rn-modal-title" class="rn-title">Quoi de neuf ?</h2>
          </div>

          <div class="rn-body">
            <template v-if="displayedNotes.length > 0">
              <article
                v-for="note in displayedNotes"
                :key="note.version"
                class="rn-version"
                :class="{ 'is-read': showAll && releaseNotesStore.isRead(note.version) }"
              >
                <div class="rn-version-header">
                  <span class="rn-version-tag">v{{ note.version }}</span>
                  <span class="rn-version-date">{{ note.date }}</span>
                  <span v-if="showAll && releaseNotesStore.isRead(note.version)" class="rn-read-badge">
                    <AppIcon icon="lucide:check" size="0.7rem" /> déjà lu
                  </span>
                </div>
                <ul class="rn-changes">
                  <li v-for="(change, i) in note.changes" :key="i" class="rn-change">
                    <AppIcon
                      :icon="typeIcon(change.type).icon"
                      size="0.85rem"
                      :style="{ color: typeIcon(change.type).color, flexShrink: 0 }"
                    />
                    <span>{{ change.text }}</span>
                  </li>
                </ul>
              </article>
            </template>
            <p v-else class="rn-empty">Vous êtes à jour !</p>
          </div>

          <div class="rn-footer">
            <button class="rn-btn-history" :aria-expanded="showAll" @click="showAll = !showAll">
              <AppIcon :icon="showAll ? 'lucide:eye-off' : 'lucide:history'" size="0.85rem" />
              {{ showAll ? 'Masquer l\'historique' : 'Voir tout l\'historique' }}
            </button>
            <button class="rn-btn-close" @click="close">Fermer</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rn-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 950;
  padding: var(--space-6);
}

.rn-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 18px;
  padding: var(--space-6) var(--space-8) var(--space-6);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-shadow: 0 24px 60px var(--overlay-scrim), 0 0 0 1px var(--surface-gold-soft);
  overflow: hidden;
}

@media (min-width: 640px) {
  .rn-card { max-width: 620px; }
}

@media (min-width: 1024px) {
  .rn-card { max-width: 700px; }
}

.rn-close {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: var(--space-1);
  border-radius: 6px;
  line-height: 1;
  transition: color 0.15s;
}

.rn-close:hover { color: var(--color-parchment); }

.rn-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rn-header-icon { color: var(--color-gold-bright); }

.rn-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.2rem;
  color: var(--color-parchment);
  margin: 0;
}

.rn-body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding-right: var(--space-2);
  scrollbar-gutter: stable;
}

.rn-body::-webkit-scrollbar { width: 4px; }
.rn-body::-webkit-scrollbar-track { background: transparent; }
.rn-body::-webkit-scrollbar-thumb { background: var(--color-gold-dark); border-radius: 2px; }

.rn-version-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.rn-version-tag {
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft);
  border: 1px solid var(--border-gold-soft);
  border-radius: 4px;
  padding: 0.1rem var(--space-2);
  letter-spacing: 0.04em;
}

.rn-version-date {
  font-size: var(--text-sm);
  color: var(--color-text-dim);
}

.rn-changes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rn-change {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-base);
  color: var(--color-parchment);
  line-height: 1.4;
}

.rn-empty {
  text-align: center;
  color: var(--color-text-dim);
  font-size: var(--text-base);
  padding: var(--space-4) 0;
}

.rn-version.is-read {
  opacity: 0.45;
}

.rn-read-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--text-xs);
  color: var(--color-success);
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 4px;
  padding: 0.05rem var(--space-1);
}

.rn-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding-top: 0.25rem;
  border-top: 1px solid var(--border-gold-soft);
}

.rn-btn-history {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: 1px solid var(--border-gold-soft);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.rn-btn-history:hover {
  color: var(--color-parchment);
  border-color: var(--border-gold-strong);
}

.rn-btn-close {
  background: var(--gradient-accent-action, linear-gradient(135deg, #c9a84c, #8b6914));
  border: none;
  border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-base);
  font-weight: 600;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: opacity 0.15s;
}

.rn-btn-close:hover { opacity: 0.85; }

/* Transition */
/* noinspection CssUnusedSymbol */
.rn-modal-enter-active { transition: opacity 0.2s ease; }
/* noinspection CssUnusedSymbol */
.rn-modal-leave-active { transition: opacity 0.15s ease; }
/* noinspection CssUnusedSymbol */
.rn-modal-enter-from, .rn-modal-leave-to { opacity: 0; }

.rn-modal-enter-active .rn-card {
  animation: rnSlideIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rn-modal-leave-active .rn-card {
  animation: rnSlideOut 0.15s ease forwards;
}

@keyframes rnSlideIn {
  from { transform: translateY(16px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes rnSlideOut {
  to { transform: translateY(10px) scale(0.97); opacity: 0; }
}
</style>
