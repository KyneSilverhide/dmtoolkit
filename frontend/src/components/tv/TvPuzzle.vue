<script setup>
const props = defineProps({
  puzzleServeUrl: { type: String, default: '' },
  pendingClicks: { type: Array, default: () => [] },
})

const emit = defineEmits(['iframe-ready'])

function onLoad(event) {
  emit('iframe-ready', event.target)
}
</script>

<template>
  <div class="puzzle-display" data-testid="tv-mode-puzzle">
    <iframe
      :src="puzzleServeUrl"
      class="puzzle-iframe"
      sandbox="allow-scripts"
      title="Puzzle"
      @load="onLoad"
    />
  </div>
</template>

<style scoped>
.puzzle-display {
  flex: 1;
  display: flex;
  align-items: stretch;
}
.puzzle-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: #000;
}
</style>
