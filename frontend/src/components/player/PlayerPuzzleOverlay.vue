<script setup>
import { watch } from 'vue'

const props = defineProps({
  activePuzzle:     { default: null },
  puzzleServeUrl:   { type: String, default: '' },
  pendingClicks:    { type: Array, default: () => [] },
})

const emit = defineEmits(['iframe-ready'])

const iframeRef = defineModel('iframeRef', { default: null })

function onLoad(event) {
  const iframe = event.target
  emit('iframe-ready', iframe)
  const clicks = props.pendingClicks
  if (clicks.length && iframe?.contentWindow) {
    clicks.forEach(path => iframe.contentWindow.postMessage({ type: 'puzzle-remote-click', path }, '*'))
  }
}
</script>

<template>
  <iframe
    :src="puzzleServeUrl"
    class="puzzle-player-iframe"
    sandbox="allow-scripts"
    title="Puzzle"
    @load="onLoad"
  />
</template>

<style scoped>
.puzzle-player-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #d8cfb2;
  display: block;
}
</style>
