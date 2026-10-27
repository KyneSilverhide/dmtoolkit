<script setup>
// Page interactive recopiée sur la TV : jamais cliquable, elle suit l'état envoyé par la page
// du MJ (pont dmt-bridge) ou, pour une page sans pont, rejoue les clics du MJ.
import { ref, computed } from 'vue'
import InteractiveStage from '../InteractiveStage.vue'
import { BACKEND_URL } from '@/config.js'
import { bridgePlayers } from '@/utils/interactiveBridge.js'

const props = defineProps({
  activeInteractive: { type: Object, required: true },
  players: { type: Array, default: () => [] },
})

const stageRef = ref(null)

const src = computed(() =>
  `${BACKEND_URL}/api/interactive/serve/${props.activeInteractive.imageId}?seed=${props.activeInteractive.seed}`)

const bridgedPlayers = computed(() => bridgePlayers(props.players, BACKEND_URL))

function replayClick(path) {
  stageRef.value?.replayClick(path)
}

defineExpose({ replayClick })
</script>

<template>
  <div class="interactive-display" data-testid="tv-mode-interactive">
    <InteractiveStage
      ref="stageRef"
      :src="src"
      role="tv"
      fill
      :players="bridgedPlayers"
      :state="activeInteractive.state"
      :clicks="activeInteractive.clicks"
    />
  </div>
</template>

<style scoped>
.interactive-display {
  flex: 1;
  display: flex;
  align-items: stretch;
}
</style>
