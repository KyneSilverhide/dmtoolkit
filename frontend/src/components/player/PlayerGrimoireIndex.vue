<script setup>
import AppIcon from '../AppIcon.vue'

// Écran d'index du Grimoire : regroupe les familles de contenu de référence accessibles
// aux joueurs. Ce n'est qu'un aiguillage — chaque famille garde sa propre clé d'onglet et
// donc sa propre URL (/player/spells…), condition pour que useContentTabQuery() et les
// liens internes (RefLink, PlayerCommandPalette) continuent de fonctionner à l'identique.
// Les objets magiques ne sont volontairement PAS listés ici : leur fiche (rareté, effet)
// spoile la surprise si le joueur peut la consulter avant de l'obtenir — voir la
// description masquée côté PlayerMerchantTab.vue pour la même raison. Les joueurs ne les
// découvrent que via la boutique (sans description) ou une projection TV du MJ.
const ENTRIES = [
  { key: 'spells',      label: 'Sorts',           icon: 'lucide:sparkles',            hint: 'Toutes les incantations, par niveau et par école' },
  { key: 'equipment',   label: 'Objets',          icon: 'lucide:package',             hint: 'Armes, armures et équipement courant' },
  { key: 'races',       label: 'Races',           icon: 'game-icons:vitruvian-man',   hint: 'Traits raciaux et sous-races' },
  { key: 'classes',     label: 'Classes',         icon: 'game-icons:round-shield',    hint: 'Aptitudes de classe et archétypes' },
  { key: 'backgrounds', label: 'Origines',        icon: 'game-icons:quill-ink',       hint: 'Historiques, compétences et capacités' },
  { key: 'abilities',   label: 'Aptitudes',       icon: 'lucide:zap',                 hint: 'Recherche transverse dans les capacités' },
  { key: 'services',    label: 'Services',        icon: 'lucide:hand-coins',          hint: 'Auberges, montures, transports et tarifs' },
  { key: 'conditions',  label: 'États',           icon: 'lucide:skull',               hint: 'Effets d\'états préjudiciables' },
]

const emit = defineEmits(['open', 'search'])
</script>

<template>
  <div class="grimoire">
    <button type="button" class="grimoire-search" data-testid="grimoire-search" @click="emit('search')">
      <AppIcon icon="lucide:search" size="1rem" />
      <span>Rechercher dans tout le contenu…</span>
    </button>

    <div class="grimoire-grid">
      <button
        v-for="entry in ENTRIES"
        :key="entry.key"
        type="button"
        class="grimoire-card"
        :data-testid="`grimoire-entry-${entry.key}`"
        @click="emit('open', entry.key)"
      >
        <span class="grimoire-icon"><AppIcon :icon="entry.icon" size="1.5rem" /></span>
        <span class="grimoire-text">
          <span class="grimoire-label">{{ entry.label }}</span>
          <span class="grimoire-hint">{{ entry.hint }}</span>
        </span>
        <AppIcon class="grimoire-chevron" icon="lucide:chevron-right" size="0.9rem" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.grimoire { display: flex; flex-direction: column; gap: var(--space-4); }

.grimoire-search {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-min);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: var(--color-text-dim);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-fast), color var(--dur-fast);
}
.grimoire-search:hover { border-color: var(--color-gold-dark); color: var(--color-parchment); }

.grimoire-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
}
@media (min-width: 640px) {
  .grimoire-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .grimoire-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.grimoire-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--touch-min);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--gradient-panel);
  color: var(--color-text);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-fast), transform var(--dur-fast);
}
.grimoire-card:hover {
  border-color: var(--color-gold-bright);
  transform: translateY(-1px);
}
.grimoire-icon {
  display: flex;
  align-items: center;
  color: var(--color-gold-bright);
  flex-shrink: 0;
}
.grimoire-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; }
.grimoire-label { font-size: var(--text-base); font-weight: 600; }
.grimoire-hint {
  font-size: var(--text-xs);
  color: var(--color-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
}
.grimoire-chevron { color: var(--color-text-dim); flex-shrink: 0; }

@media (prefers-reduced-motion: reduce) {
  .grimoire-card:hover { transform: none; }
}
</style>
