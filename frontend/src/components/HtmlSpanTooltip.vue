<script setup>
// Bulle flottante riche pour les mentions (état/règle/sort) rendues en HTML brut
// (data-tt-* sur les spans .condition-term/.glossary-term/.spell-ref-term générés par
// textLinker.js highlightGlossaryHtml()/internalizeSpellLinks()) — remplace le `title`
// natif du navigateur par la même bulle que RefLink.vue, impossible à monter directement
// dans du v-html (pas de composant Vue par span). Une seule instance partagée par liste de
// résultats (voir ItemSearch.vue/SpellSearch.vue) : `onMouseOver`/`onMouseOut` sont exposées
// et branchées en délégation sur le conteneur v-html, plutôt qu'un composant par span.
import { ref } from 'vue'
import { computeBubblePosition } from '@/utils/bubblePosition.js'

const BUBBLE_WIDTH = 280
const BUBBLE_OFFSET = 10

const tooltip = ref(null)

function onMouseOver(e) {
  const el = e.target.closest?.('[data-tt-name]')
  if (!el) return
  const pos = computeBubblePosition(el.getBoundingClientRect(), BUBBLE_WIDTH, BUBBLE_OFFSET)
  tooltip.value = {
    name: el.dataset.ttName,
    desc: el.dataset.ttDesc,
    badge: el.dataset.ttBadge || '',
    color: el.dataset.ttColor || null,
    navigable: el.dataset.ttNav === '1',
    style: {
      position: 'fixed',
      zIndex: 9999,
      top: pos.top + 'px',
      left: pos.left + 'px',
      transform: pos.dir === 'bottom' ? 'none' : 'translateY(-50%)',
      width: BUBBLE_WIDTH + 'px',
      maxWidth: 'calc(100vw - 16px)',
    },
  }
}

function onMouseOut(e) {
  const el = e.target.closest?.('[data-tt-name]')
  if (el && !el.contains(e.relatedTarget)) tooltip.value = null
}

defineExpose({ onMouseOver, onMouseOut })
</script>

<template>
  <Teleport to="body">
    <Transition name="reflink">
      <div v-if="tooltip" class="reflink-bubble" :style="tooltip.style" role="tooltip">
        <div class="reflink-head">
          <span class="reflink-name">{{ tooltip.name }}</span>
          <span v-if="tooltip.badge" class="reflink-badge" :style="{ color: tooltip.color }">{{ tooltip.badge }}</span>
        </div>
        <p class="reflink-desc">{{ tooltip.desc }}</p>
        <p v-if="tooltip.navigable" class="reflink-hint">Cliquer pour voir la fiche complète</p>
      </div>
    </Transition>
  </Teleport>
</template>
