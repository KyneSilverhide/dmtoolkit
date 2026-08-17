<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { THEME_ORDER, getThemeMeta } from '../utils/themePreferences.js'

// Sélecteur de thème EXPLICITE : une entrée par thème, un clic pour l'atteindre. Remplace
// le bouton de cycle historique (getNextTheme), qui demandait jusqu'à 3 clics à l'aveugle
// pour arriver sur un thème donné et n'annonçait jamais la destination.
//
// Le composant ne persiste RIEN : il émet le thème choisi, et l'appelant décide de la
// portée (scope 'admin' / 'player' / 'tv') et des effets de bord — AdminView émet en plus
// `set-tv-theme` sur le socket pour que la TV suive, HomeView écrit deux scopes à la fois.
const props = defineProps({
  modelValue: { type: String, required: true },
  // `compact` masque les libellés et ne laisse que les pastilles de couleur : utilisé dans
  // les en-têtes étroits (mobile, barre joueur) où 4 libellés ne tiendraient pas.
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const themes = computed(() => THEME_ORDER.map(key => ({ key, ...getThemeMeta(key) })))
</script>

<template>
  <div
    class="theme-picker"
    :class="{ 'theme-picker-compact': compact }"
    role="group"
    aria-label="Choix du thème"
  >
    <button
      v-for="t in themes"
      :key="t.key"
      type="button"
      class="tp-option"
      :class="{ active: t.key === modelValue }"
      :aria-pressed="t.key === modelValue"
      :title="t.label"
      :data-testid="`theme-option-${t.key}`"
      @click="emit('update:modelValue', t.key)"
    >
      <span class="tp-swatch" :data-theme-swatch="t.key" aria-hidden="true" />
      <span v-if="!compact" class="tp-label">{{ t.label }}</span>
      <AppIcon v-if="compact" :icon="t.icon" size="0.8em" class="tp-icon" />
    </button>
  </div>
</template>

<style scoped>
/* inline-flex, pas flex : le composant est posé dans des conteneurs variés (en-tête en
   display:block sur PlayerJoinView, menu en colonne côté joueur) où un bloc s'étirerait à
   toute la largeur autour de 4 boutons de 42 px. */
.theme-picker {
  display: inline-flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
}

.tp-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.tp-option:hover {
  background: var(--surface-hover);
  color: var(--color-text);
}
.tp-option.active {
  background: var(--surface-gold-soft-strong);
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.theme-picker-compact .tp-option {
  padding: var(--space-1);
}
.tp-icon { flex-shrink: 0; }

/* Pastille bicolore : fond du thème / accent du thème. Valeurs en dur car elles doivent
   représenter un thème qui n'est PAS celui actuellement appliqué — impossible de les tirer
   des custom properties, qui ne portent que le thème courant. Garder synchronisé avec
   --color-bg / --color-gold de chaque bloc de style.css. */
.tp-swatch {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--color-border);
}
.tp-swatch[data-theme-swatch='dark']   { background: linear-gradient(135deg, #181411 50%, #efac39 50%); }
.tp-swatch[data-theme-swatch='sceau']  { background: linear-gradient(135deg, #ffffff 50%, #c50009 50%); }
.tp-swatch[data-theme-swatch='arcane'] { background: linear-gradient(135deg, #0f0f12 50%, #8b5cf6 50%); }
.tp-swatch[data-theme-swatch='nacre']  { background: linear-gradient(135deg, #f4f3f7 50%, #a63d6f 50%); }
</style>
