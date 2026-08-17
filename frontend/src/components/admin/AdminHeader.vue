<script setup>
import AppIcon from '../AppIcon.vue'
import ReleaseNotesBell from '../ReleaseNotesBell.vue'
import SessionManager from './SessionManager.vue'
import ThemePicker from '../ThemePicker.vue'
import DensityToggle from '../DensityToggle.vue'

defineProps({
  admin:                  { type: Object, default: null },
  appVersion:             { type: String, default: '' },
  theme:                  { type: String, default: 'dark' },
  density:                { type: String, default: 'compact' },
  isSessionPanelCollapsed:{ type: Boolean, default: false },
  activeSessionLabel:     { type: String, default: '' },
  hasActiveSession:       { type: Boolean, default: false },
})

const emit = defineEmits(['logout', 'update:theme', 'update:density', 'toggle-session-panel', 'open-search'])
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
        <button
          class="search-trigger-btn"
          @click="emit('open-search')"
          data-testid="open-search-palette"
        >
          <AppIcon icon="lucide:search" size="0.9em" />
          Rechercher
          <kbd class="search-trigger-kbd">Ctrl K</kbd>
        </button>
        <ReleaseNotesBell role="admin" />
        <DensityToggle
          :model-value="density"
          @update:model-value="emit('update:density', $event)"
        />
        <ThemePicker
          :model-value="theme"
          @update:model-value="emit('update:theme', $event)"
        />
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
  padding: var(--space-3) var(--space-5) 0;
  background: linear-gradient(180deg, var(--surface-highlight) 0%, transparent 100%);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.page-title { font-size: 1.2rem; color: var(--color-parchment); font-weight: 600; }
.title-accent { color: var(--color-gold-bright); }

.admin-name {
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  margin: 0;
}
.app-version {
  margin-left: var(--space-2);
  opacity: 0.45;
  font-size: var(--text-xs);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: var(--space-1) var(--space-3);
  color: var(--color-text-dim);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.logout-btn:hover { border-color: var(--color-danger-border); color: var(--color-danger); }

.search-trigger-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-3);
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
  box-shadow: 0 0 0 1px transparent;
}
.search-trigger-btn:hover {
  background: var(--surface-gold-soft-strong);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-gold-dark) 25%, transparent);
}
.search-trigger-kbd {
  font-family: var(--font-heading), sans-serif;
  background: var(--gradient-panel);
  border: 1px solid var(--border-gold-soft);
  border-radius: 4px;
  padding: 0 var(--space-1);
  font-size: var(--text-2xs);
  color: var(--color-gold-dark);
}

.session-header-panel {
  margin: 0 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: var(--space-3) var(--space-3);
  background: var(--gradient-panel-soft);
}
.session-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.session-header-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.session-collapse-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border: 1px solid var(--color-border);
  background: var(--surface-raised);
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all 0.18s;
}
.session-collapse-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.session-header-active {
  margin: var(--space-2) 0 0;
  color: var(--color-gold);
  font-size: var(--text-base);
}
.session-header-content { margin-top: var(--space-3); }

@media (max-width: 767px) {
  .header-top { flex-wrap: wrap; gap: var(--space-2); }
  .admin-name { display: none; }
  .search-trigger-kbd { display: none; }
}
</style>
