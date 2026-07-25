<script setup>
import { computed } from 'vue'
import { linkify, SPELL_LIST_NAME_RE } from '@/utils/textLinker.js'
import RefLink from './RefLink.vue'

const props = defineProps({
  text: { type: String, required: true },
  candidates: { type: Array, default: () => [] },
  excludeId: { type: String, default: null },
  // Nom du trait/section qui porte ce texte — s'il évoque une liste de sorts (ex: "Sorts
  // de domaine"), les mentions de sorts d'un seul mot (Résistance, Bouclier...) sont
  // liées sans exiger un verbe d'incantation juste avant (voir utils/textLinker.js).
  traitName: { type: String, default: '' },
})

const segments = computed(() =>
  linkify(props.text, props.candidates, props.excludeId, SPELL_LIST_NAME_RE.test(props.traitName))
)
</script>

<template>
  <span class="linked-text">
    <template v-for="(seg, i) in segments" :key="i">
      <span v-if="seg.type === 'concept'" class="concept-term">{{ seg.value }}</span>
      <RefLink
        v-else-if="seg.type !== 'text'"
        :type="seg.type"
        :label="seg.value"
        :payload="seg.payload"
      />
      <template v-else>{{ seg.value }}</template>
    </template>
  </span>
</template>
