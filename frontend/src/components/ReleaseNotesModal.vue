<script setup>
import { onMounted, onUnmounted } from 'vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  role: { type: String, required: true },
})

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
            <template v-if="releaseNotesStore.unreadFor(props.role).length > 0">
              <article
                v-for="note in releaseNotesStore.unreadFor(props.role)"
                :key="note.version"
                class="rn-version"
              >
                <div class="rn-version-header">
                  <span class="rn-version-tag">v{{ note.version }}</span>
                  <span class="rn-version-date">{{ note.date }}</span>
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
            <button class="rn-btn-close" @click="close">Tout marquer comme lu</button>
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 950;
  padding: 1.5rem;
}

.rn-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 18px;
  padding: 1.75rem 2rem 1.5rem;
  width: 100%;
  max-width: 460px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 162, 39, 0.1);
  overflow: hidden;
}

.rn-close {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  line-height: 1;
  transition: color 0.15s;
}

.rn-close:hover { color: var(--color-parchment); }

.rn-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.rn-header-icon { color: var(--color-gold-bright); }

.rn-title {
  font-family: var(--font-heading);
  font-size: 1.2rem;
  color: var(--color-parchment);
  margin: 0;
}

.rn-body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-right: 0.25rem;
}

.rn-body::-webkit-scrollbar { width: 4px; }
.rn-body::-webkit-scrollbar-track { background: transparent; }
.rn-body::-webkit-scrollbar-thumb { background: var(--color-gold-dark); border-radius: 2px; }

.rn-version-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.rn-version-tag {
  font-family: var(--font-ui);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-gold-bright);
  background: rgba(201, 168, 76, 0.12);
  border: 1px solid rgba(201, 168, 76, 0.25);
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
  letter-spacing: 0.04em;
}

.rn-version-date {
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.rn-changes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.rn-change {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.88rem;
  color: var(--color-parchment);
  line-height: 1.4;
}

.rn-empty {
  text-align: center;
  color: var(--color-text-dim);
  font-size: 0.9rem;
  padding: 1rem 0;
}

.rn-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(201, 162, 39, 0.15);
}

.rn-btn-close {
  background: var(--gradient-accent-action, linear-gradient(135deg, #c9a84c, #8b6914));
  border: none;
  border-radius: 8px;
  color: #1a0e00;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.5rem 1.1rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.rn-btn-close:hover { opacity: 0.85; }

/* Transition */
.rn-modal-enter-active { transition: opacity 0.2s ease; }
.rn-modal-leave-active { transition: opacity 0.15s ease; }
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
