<script setup>
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  tabs:            { type: Array, required: true },
  navGroups:       { type: Array, required: true },
  activeTab:       { type: String, required: true },
  tabActivity:     { type: Object, default: () => ({}) },
  generatorEnabled:{ type: Boolean, default: true },
  isCollapsed:     { type: Boolean, default: false },
})

const emit = defineEmits(['update:activeTab', 'update:isCollapsed'])

// Tooltip fixe pour l'onglet Générateur grisé (échappe à overflow:hidden de la sidebar)
const lockedTooltipVisible = ref(false)
const lockedTooltipPos = ref({ top: 0, left: 0 })

function showLockedTooltip(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  lockedTooltipPos.value = {
    top: rect.top + rect.height / 2,
    left: rect.right + 10,
  }
  lockedTooltipVisible.value = true
}

function hideLockedTooltip() {
  lockedTooltipVisible.value = false
}

function selectTab(key) {
  if (key === 'generator' && !props.generatorEnabled) return
  emit('update:activeTab', key)
}
</script>

<template>
  <!-- ── Sidebar de navigation (desktop ≥ 768px) ────────────────────────── -->
  <nav
    class="admin-sidebar"
    :class="{ collapsed: isCollapsed }"
    role="navigation"
    aria-label="Navigation admin"
  >
    <div class="sidebar-groups">
      <div
        v-for="group in navGroups"
        :key="group.label"
        class="sidebar-group"
      >
        <span class="sidebar-group-label">{{ group.label }}</span>
        <button
          v-for="key in group.items"
          :key="key"
          class="sidebar-item"
          :class="{
            active: activeTab === key,
            'tab-locked': key === 'generator' && !generatorEnabled,
          }"
          :data-testid="`tab-${key}`"
          :aria-disabled="key === 'generator' && !generatorEnabled"
          @click="selectTab(key)"
          @mouseenter="(key === 'generator' && !generatorEnabled) ? showLockedTooltip($event) : null"
          @mouseleave="hideLockedTooltip"
        >
          <span class="sidebar-item-icon">
            <AppIcon :icon="tabs.find(t => t.key === key)?.icon" size="1.3rem" />
            <span v-if="tabActivity[key] && activeTab !== key" class="sidebar-dot" />
          </span>
          <span class="sidebar-item-label">
            {{ tabs.find(t => t.key === key)?.label }}
          </span>
        </button>
      </div>
    </div>

    <!-- Bouton de réduction sidebar -->
    <button
      class="sidebar-collapse-btn"
      @click="emit('update:isCollapsed', !isCollapsed)"
      :title="isCollapsed ? 'Agrandir la navigation' : 'Réduire la navigation'"
    >
      <AppIcon :icon="isCollapsed ? 'lucide:chevrons-right' : 'lucide:chevrons-left'" size="1rem" />
      <span class="sidebar-item-label">Réduire</span>
    </button>
  </nav>

  <!-- ── Tab bar mobile (< 768px) ──────────────────────────────────────── -->
  <nav class="admin-nav-mobile" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="mobile-nav-btn"
      :class="{
        active: activeTab === tab.key,
        'tab-locked': tab.key === 'generator' && !generatorEnabled,
      }"
      :title="tab.label"
      @click="selectTab(tab.key)"
      @mouseenter="(tab.key === 'generator' && !generatorEnabled) ? showLockedTooltip($event) : null"
      @mouseleave="hideLockedTooltip"
    >
      <span class="mobile-nav-icon-wrap">
        <AppIcon :icon="tab.icon" size="1.3rem" />
        <span v-if="tabActivity[tab.key] && activeTab !== tab.key" class="nav-activity-dot" />
      </span>
      <span class="mobile-nav-label">{{ tab.label }}</span>
    </button>
  </nav>

  <!-- ── Tooltip fixe via Teleport ─────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="locked-tooltip">
      <div
        v-if="lockedTooltipVisible"
        class="generator-locked-tooltip"
        :style="{ top: lockedTooltipPos.top + 'px', left: lockedTooltipPos.left + 'px' }"
      >
        <span class="glt-icon"><AppIcon icon="lucide:key" size="0.9em" /></span>
        <div class="glt-body">
          <span class="glt-title">Générateur IA non activé</span>
          <span class="glt-text">Configurez <code>GITHUB_TOKEN</code> dans le <code>.env</code> backend</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Sidebar desktop ───────────────────────────────────────────────────── */
.admin-sidebar {
  width: 210px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--gradient-panel-soft);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  scrollbar-width: none;
}
.admin-sidebar::-webkit-scrollbar { display: none; }
.admin-sidebar.collapsed { width: 56px; }

.sidebar-groups {
  flex: 1;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.5rem;
}
.sidebar-group:last-child { margin-bottom: 0; }

.sidebar-group-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  padding: 0.25rem 0.6rem 0.1rem;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  transition: opacity 0.15s;
}
.admin-sidebar.collapsed .sidebar-group-label { opacity: 0; }

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.6rem 0.65rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}
.sidebar-item:hover { background: var(--surface-raised); color: var(--color-parchment); }
.sidebar-item.active {
  background: var(--surface-gold-soft);
  color: var(--color-gold-bright);
  font-weight: 600;
}
.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  background: var(--color-gold-bright);
  border-radius: 0 3px 3px 0;
}
.sidebar-item.tab-locked { opacity: 0.42; cursor: not-allowed; }
.sidebar-item.tab-locked:hover { background: none !important; color: var(--color-text-dim) !important; }

.sidebar-item-icon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
}
.sidebar-dot {
  position: absolute;
  top: -1px; right: -2px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--color-gold-bright);
  border: 1.5px solid var(--color-bg);
  animation: dotPulse 1.4s ease-in-out infinite;
}
.sidebar-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.15s, max-width 0.22s;
  max-width: 200px;
}
.admin-sidebar.collapsed .sidebar-item-label { opacity: 0; max-width: 0; }

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.65rem;
  border: none;
  border-top: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-collapse-btn:hover { background: var(--surface-raised); color: var(--color-parchment); }
.admin-sidebar.collapsed .sidebar-collapse-btn .sidebar-item-label { opacity: 0; max-width: 0; }

/* ── Tab bar mobile (masquée sur desktop) ─────────────────────────────── */
.admin-nav-mobile { display: none; }

/* ── Tooltip fixe ─────────────────────────────────────────────────────── */
.generator-locked-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translateY(-50%);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-medium);
  pointer-events: none;
  max-width: 240px;
}
.glt-icon { color: var(--color-warning); flex-shrink: 0; margin-top: 0.05rem; }
.glt-body { display: flex; flex-direction: column; gap: 0.2rem; }
.glt-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
  white-space: nowrap;
}
.glt-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  line-height: 1.4;
}
.glt-text code {
  font-family: monospace;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 0.3rem;
  font-size: 0.65rem;
  color: var(--color-gold-bright);
}
/* noinspection CssUnusedSymbol */
.locked-tooltip-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
/* noinspection CssUnusedSymbol */
.locked-tooltip-leave-active { transition: opacity 0.1s ease; }
/* noinspection CssUnusedSymbol */
.locked-tooltip-enter-from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
/* noinspection CssUnusedSymbol */
.locked-tooltip-leave-to { opacity: 0; }

/* ── Responsive mobile ────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .admin-sidebar { display: none; }
  .admin-nav-mobile {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--color-border);
    background: var(--gradient-panel-soft);
    padding: 0.35rem 0.5rem;
    gap: 0.2rem;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .admin-nav-mobile::-webkit-scrollbar { display: none; }
  .mobile-nav-btn {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem;
    min-height: 52px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--color-text-dim);
    font-size: 0.55rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    position: relative;
  }
  .mobile-nav-btn:hover { color: var(--color-parchment); background: var(--surface-raised); }
  .mobile-nav-btn.active { color: var(--color-gold-bright); background: var(--surface-gold-soft); }
  .mobile-nav-btn.tab-locked { opacity: 0.42; cursor: not-allowed; }
  .mobile-nav-btn.tab-locked:hover { background: none !important; color: var(--color-text-dim) !important; }
  .mobile-nav-icon-wrap { position: relative; }
  .mobile-nav-label { white-space: nowrap; }
  .nav-activity-dot {
    position: absolute;
    top: -2px; right: -3px;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--color-gold-bright);
    border: 1.5px solid var(--color-bg);
    animation: dotPulse 1.4s ease-in-out infinite;
  }
}
</style>
