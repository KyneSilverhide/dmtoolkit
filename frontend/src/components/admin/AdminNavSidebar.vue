<script setup>
import { ref, computed, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

// Rail à 7 domaines. IMPORTANT : c'est un regroupement de PRÉSENTATION au-dessus des 24 clés
// d'onglet existantes — aucune clé n'est renommée, fusionnée ou supprimée, aucune route n'est
// créée. `/admin/session/XXXX/merchants` reste valide, adminTabRoute() reste le seul
// constructeur d'URL, et les data-testid `tab-<key>` sont préservés pour l'e2e.
// Voir docs/refonte-ui.md §2.1 et §4.3.
const props = defineProps({
  tabs:            { type: Array, required: true },
  navGroups:       { type: Array, required: true },
  activeTab:       { type: String, required: true },
  tabActivity:     { type: Object, default: () => ({}) },
  // Map des onglets verrouillés : { [tabKey]: { title, text } }. text peut contenir
  // du markup simple (<code>) — contenu défini en dur, jamais une entrée utilisateur.
  lockedTabs:      { type: Object, default: () => ({}) },
  isCollapsed:     { type: Boolean, default: false },
})

const emit = defineEmits(['update:activeTab', 'update:isCollapsed'])

const DOMAINS = [
  { key: 'table',        label: 'Table',        icon: 'game-icons:wizard-staff', items: ['players', 'journal'] },
  { key: 'scene',        label: 'Scène',        icon: 'lucide:clapperboard',     items: ['images', 'videos', 'audio', 'map'] },
  { key: 'rythme',       label: 'Rythme',       icon: 'lucide:timer',            items: ['tension'] },
  { key: 'interactions', label: 'Interactions', icon: 'lucide:message-square',   items: ['message', 'vote', 'puzzle'] },
  { key: 'economie',     label: 'Économie',     icon: 'game-icons:coins',        items: ['merchants', 'tresor', 'reputation'] },
  { key: 'grimoire',     label: 'Grimoire',     icon: 'lucide:book-open',        items: ['spells', 'equipment', 'magic', 'races', 'classes', 'backgrounds', 'abilities', 'services', 'conditions'] },
  { key: 'outils',       label: 'Outils',       icon: 'lucide:wrench',           items: ['dice', 'generator'] },
]

const tabByKey = computed(() => Object.fromEntries(props.tabs.map(t => [t.key, t])))

// Les domaines visibles dérivent de navGroups (déjà filtré par AdminView selon qu'une session
// est active ou non) : un domaine dont aucune clé n'est disponible disparaît entièrement.
const domains = computed(() => {
  const available = new Set(props.navGroups.flatMap(g => g.items))
  return DOMAINS
    .map(d => ({ ...d, items: d.items.filter(k => available.has(k)) }))
    .filter(d => d.items.length > 0)
})

const domainOfActiveTab = computed(() =>
  domains.value.find(d => d.items.includes(props.activeTab))?.key || domains.value[0]?.key || null
)

// Domaine déplié. Suit l'onglet actif (y compris quand il change via Ctrl+K ou une URL
// directe), mais reste pilotable à la main pour explorer un autre domaine sans naviguer.
const openDomain = ref(domainOfActiveTab.value)
watch(domainOfActiveTab, (d) => { if (d) openDomain.value = d }, { immediate: true })

function toggleDomain(key) {
  openDomain.value = openDomain.value === key ? null : key
}

function isLocked(key) {
  return !!props.lockedTabs[key]
}

// Une pastille sur le domaine agrège l'activité de ses onglets, pour qu'un domaine replié ne
// masque jamais un événement en cours (vote ouvert, marchand actif…).
function domainHasActivity(domain) {
  return domain.items.some(k => props.tabActivity[k] && props.activeTab !== k)
}

function selectTab(key) {
  if (isLocked(key)) return
  emit('update:activeTab', key)
}

// ── Tooltip fixe pour les onglets grisés (échappe à overflow:hidden du rail) ──
const lockedTooltipVisible = ref(false)
const lockedTooltipPos = ref({ top: 0, left: 0 })
const lockedTooltipContent = ref({ title: '', text: '' })

function showLockedTooltip(event, key) {
  const rect = event.currentTarget.getBoundingClientRect()
  lockedTooltipPos.value = { top: rect.top + rect.height / 2, left: rect.right + 10 }
  lockedTooltipContent.value = props.lockedTabs[key]
  lockedTooltipVisible.value = true
}
function hideLockedTooltip() {
  lockedTooltipVisible.value = false
}

// Mobile : une rangée de domaines, puis les onglets du domaine ouvert. 24 pastilles qui
// défilaient horizontalement étaient le pire cas d'usage possible pour une navigation.
const mobileTabs = computed(() => {
  const d = domains.value.find(x => x.key === openDomain.value)
  return (d ? d.items : []).map(k => tabByKey.value[k]).filter(Boolean)
})
</script>

<template>
  <!-- ── Rail de domaines (desktop ≥ 768px) ─────────────────────────────── -->
  <nav
    class="admin-sidebar"
    :class="{ collapsed: isCollapsed }"
    role="navigation"
    aria-label="Navigation admin"
  >
    <div class="sidebar-groups">
      <div v-for="domain in domains" :key="domain.key" class="rail-domain">
        <button
          class="rail-item"
          :class="{ open: openDomain === domain.key, 'has-active': domain.items.includes(activeTab) }"
          :aria-expanded="openDomain === domain.key"
          :data-testid="`domain-${domain.key}`"
          :title="domain.label"
          @click="toggleDomain(domain.key)"
        >
          <span class="rail-item-icon">
            <AppIcon :icon="domain.icon" size="1.25rem" />
            <span v-if="domainHasActivity(domain) && openDomain !== domain.key" class="sidebar-dot" />
          </span>
          <span class="rail-item-label">{{ domain.label }}</span>
          <AppIcon
            class="rail-chevron"
            :icon="openDomain === domain.key ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            size="0.8rem"
          />
        </button>

        <!-- Second niveau : les clés d'onglet réelles, inchangées -->
        <div v-show="openDomain === domain.key && !isCollapsed" class="rail-sub">
          <button
            v-for="key in domain.items"
            :key="key"
            class="sidebar-item"
            :class="{ active: activeTab === key, 'tab-locked': isLocked(key) }"
            :data-testid="`tab-${key}`"
            :aria-disabled="isLocked(key)"
            @click="selectTab(key)"
            @mouseenter="isLocked(key) ? showLockedTooltip($event, key) : null"
            @mouseleave="hideLockedTooltip"
          >
            <span class="sidebar-item-label">{{ tabByKey[key]?.label }}</span>
            <span v-if="tabActivity[key] && activeTab !== key" class="sidebar-dot sidebar-dot-inline" />
          </button>
        </div>
      </div>
    </div>

    <button
      class="sidebar-collapse-btn"
      :aria-expanded="!isCollapsed"
      @click="emit('update:isCollapsed', !isCollapsed)"
      :title="isCollapsed ? 'Agrandir la navigation' : 'Réduire la navigation'"
    >
      <AppIcon :icon="isCollapsed ? 'lucide:chevrons-right' : 'lucide:chevrons-left'" size="1rem" />
      <span class="rail-item-label">Réduire</span>
    </button>
  </nav>

  <!-- ── Navigation mobile (< 768px) : domaines puis onglets du domaine ──── -->
  <nav class="admin-nav-mobile" role="tablist">
    <div class="mobile-domains">
      <button
        v-for="domain in domains"
        :key="domain.key"
        class="mobile-domain-btn"
        :class="{ active: openDomain === domain.key }"
        :data-testid="`domain-m-${domain.key}`"
        @click="openDomain = domain.key"
      >
        <span class="mobile-nav-icon-wrap">
          <AppIcon :icon="domain.icon" size="1.2rem" />
          <span v-if="domainHasActivity(domain) && openDomain !== domain.key" class="nav-activity-dot" />
        </span>
        <span class="mobile-nav-label">{{ domain.label }}</span>
      </button>
    </div>
    <div class="mobile-tabs">
      <button
        v-for="tab in mobileTabs"
        :key="tab.key"
        class="mobile-nav-btn"
        :class="{ active: activeTab === tab.key, 'tab-locked': isLocked(tab.key) }"
        :title="tab.label"
        :aria-disabled="isLocked(tab.key)"
        @click="selectTab(tab.key)"
      >
        <span class="mobile-nav-icon-wrap">
          <AppIcon :icon="tab.icon" size="1.1rem" />
          <span v-if="tabActivity[tab.key] && activeTab !== tab.key" class="nav-activity-dot" />
        </span>
        <span class="mobile-nav-label">{{ tab.label }}</span>
      </button>
    </div>
  </nav>

  <!-- ── Tooltip fixe via Teleport ─────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="locked-tooltip">
      <div
        v-if="lockedTooltipVisible"
        class="generator-locked-tooltip"
        :style="{ top: lockedTooltipPos.top + 'px', left: lockedTooltipPos.left + 'px' }"
      >
        <span class="glt-icon"><AppIcon icon="lucide:lock" size="0.9em" /></span>
        <div class="glt-body">
          <span class="glt-title">{{ lockedTooltipContent.title }}</span>
          <!-- eslint-disable-next-line vue/no-v-html — contenu défini en dur, pas d'entrée utilisateur -->
          <span class="glt-text" v-html="lockedTooltipContent.text"></span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Rail desktop ──────────────────────────────────────────────────────── */
.admin-sidebar {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--gradient-panel-soft);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.22s var(--ease-out);
  scrollbar-width: none;
}
.admin-sidebar::-webkit-scrollbar { display: none; }
.admin-sidebar.collapsed { width: 56px; }

.sidebar-groups {
  flex: 1;
  padding: var(--space-3) var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.rail-domain { display: flex; flex-direction: column; }

.rail-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  min-height: var(--touch-min);
}
.rail-item:hover { background: var(--surface-hover); color: var(--color-parchment); }
.rail-item.has-active { color: var(--color-gold-bright); }
.rail-item.has-active::before {
  content: '';
  position: absolute;
  left: 0; top: 22%; bottom: 22%;
  width: 3px;
  background: var(--color-gold-bright);
  border-radius: 0 3px 3px 0;
}
.rail-chevron { margin-left: auto; flex-shrink: 0; opacity: 0.6; }

.rail-item-icon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
}
.rail-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.15s, max-width 0.22s;
  max-width: 200px;
}
.admin-sidebar.collapsed .rail-item-label,
.admin-sidebar.collapsed .rail-chevron { opacity: 0; max-width: 0; }

/* Second niveau */
.rail-sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-1) 0 var(--space-2) var(--space-6);
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.sidebar-item:hover { background: var(--surface-hover); color: var(--color-parchment); }
.sidebar-item.active {
  background: var(--surface-gold-soft);
  color: var(--color-gold-bright);
  font-weight: 700;
}
.sidebar-item.tab-locked { opacity: 0.42; cursor: not-allowed; }
.sidebar-item.tab-locked:hover { background: none; color: var(--color-text-dim); }

.sidebar-dot {
  position: absolute;
  top: -1px; right: -2px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--color-gold-bright);
  border: 1.5px solid var(--color-bg);
  animation: dotPulse 1.4s ease-in-out infinite;
}
.sidebar-dot-inline {
  position: static;
  margin-left: auto;
  border: none;
  flex-shrink: 0;
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: none;
  border-top: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
  white-space: nowrap;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-collapse-btn:hover { background: var(--surface-hover); color: var(--color-parchment); }
.admin-sidebar.collapsed .sidebar-collapse-btn .rail-item-label { opacity: 0; max-width: 0; }

/* ── Navigation mobile (masquée sur desktop) ──────────────────────────── */
.admin-nav-mobile { display: none; }

/* ── Tooltip fixe ─────────────────────────────────────────────────────── */
.generator-locked-tooltip {
  position: fixed;
  z-index: var(--z-tooltip);
  transform: translateY(-50%);
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-medium);
  pointer-events: none;
  max-width: 240px;
}
.glt-icon { color: var(--color-warning); flex-shrink: 0; margin-top: 0.05rem; }
.glt-body { display: flex; flex-direction: column; gap: 0.2rem; }
.glt-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
}
.glt-text {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-xs);
  color: var(--color-text-dim);
  line-height: var(--leading-normal);
}
.glt-text code {
  font-family: monospace;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 0.3rem;
  font-size: var(--text-2xs);
  color: var(--color-gold-bright);
}
/* noinspection CssUnusedSymbol */
.locked-tooltip-enter-active { transition: opacity var(--dur-fast), transform var(--dur-fast); }
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
    flex-direction: column;
    border-bottom: 1px solid var(--color-border);
    background: var(--gradient-panel-soft);
    flex-shrink: 0;
  }
  .mobile-domains,
  .mobile-tabs {
    display: flex;
    overflow-x: auto;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    scrollbar-width: none;
  }
  .mobile-domains::-webkit-scrollbar,
  .mobile-tabs::-webkit-scrollbar { display: none; }
  .mobile-tabs { border-top: 1px solid var(--color-border); }

  .mobile-domain-btn,
  .mobile-nav-btn {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-2);
    min-height: var(--touch-min);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-dim);
    font-family: var(--font-ui), sans-serif;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    transition: color var(--dur-fast), background var(--dur-fast);
    position: relative;
  }
  .mobile-domain-btn.active,
  .mobile-nav-btn.active { color: var(--color-gold-bright); background: var(--surface-gold-soft); }
  .mobile-nav-btn.tab-locked { opacity: 0.42; cursor: not-allowed; }
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
