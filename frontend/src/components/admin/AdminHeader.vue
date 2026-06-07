<script setup>
import AppIcon from '../AppIcon.vue'
import ReleaseNotesBell from '../ReleaseNotesBell.vue'
import SessionManager from './SessionManager.vue'

defineProps({
  admin:                  { type: Object, default: null },
  appVersion:             { type: String, default: '' },
  isLightTheme:           { type: Boolean, default: false },
  isSessionPanelCollapsed:{ type: Boolean, default: false },
  activeSessionLabel:     { type: String, default: '' },
  hasActiveSession:       { type: Boolean, default: false },
})

const emit = defineEmits(['logout', 'toggle-theme', 'toggle-session-panel'])
</script>

<template>
  <header class="admin-header">
    <div class="header-top">
      <h1 class="page-title">
        <AppIcon icon="game-icons:dice-six-faces-five" size="1em" />
        Tableau de Bord <span class="title-accent">MJ</span>
      </h1>
      <div class="header-actions">
        <p class="admin-name" v-if="admin">
          {{ admin.username }}
          <span class="app-version">v{{ appVersion }}</span>
        </p>
        <ReleaseNotesBell role="admin" />
        <button class="theme-toggle-btn" @click="emit('toggle-theme')" data-testid="theme-toggle">
          <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.9em" />
          {{ isLightTheme ? 'Sombre' : 'Clair' }}
        </button>
        <button class="logout-btn" @click="emit('logout')" data-testid="logout-button">
          <AppIcon icon="lucide:log-out" size="0.9em" /> Déconnexion
        </button>
      </div>
    </div>

    <section class="session-header-panel">
      <div class="session-header-top">
        <h2 class="session-header-title"><AppIcon icon="lucide:clipboard-list" size="1em" /> Sessions</h2>
        <button class="session-collapse-btn" @click="emit('toggle-session-panel')">
          <AppIcon :icon="isSessionPanelCollapsed ? 'lucide:chevron-down' : 'lucide:chevron-up'" size="0.9em" />
          {{ isSessionPanelCollapsed ? 'Afficher' : 'Réduire' }}
        </button>
      </div>
      <p v-if="isSessionPanelCollapsed && hasActiveSession" class="session-header-active">
        Session active : {{ activeSessionLabel }}
      </p>
      <div v-show="!isSessionPanelCollapsed" class="session-header-content">
        <SessionManager />
      </div>
    </section>
  </header>
</template>

<style scoped>
.admin-header {
  padding: 0.85rem 1.25rem 0;
  background: linear-gradient(180deg, var(--surface-highlight) 0%, transparent 100%);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-title { font-size: 1.2rem; color: var(--color-parchment); font-weight: 600; }
.title-accent { color: var(--color-gold-bright); }

.admin-name {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0;
}
.app-version {
  margin-left: 0.4rem;
  opacity: 0.45;
  font-size: 0.65rem;
}

.theme-toggle-btn,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.theme-toggle-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.logout-btn:hover { border-color: var(--color-danger-border); color: var(--color-danger); }

.session-header-panel {
  margin: 0 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
  background: var(--gradient-panel-soft);
}
.session-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.session-header-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.session-collapse-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--color-border);
  background: var(--surface-raised);
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.18s;
}
.session-collapse-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.session-header-active {
  margin: 0.4rem 0 0;
  color: var(--color-gold);
  font-size: 0.88rem;
}
.session-header-content { margin-top: 0.65rem; }

@media (max-width: 767px) {
  .header-top { flex-wrap: wrap; gap: 0.5rem; }
  .admin-name { display: none; }
}
</style>
