<script setup>
const props = defineProps({
  puzzleServeUrl: { type: String, default: '' },
  pendingClicks: { type: Array, default: () => [] },
})

const emit = defineEmits(['iframe-ready', 'consumed-pending-clicks'])

function onLoad(event) {
  const iframe = event.target
  emit('iframe-ready', iframe)

  const clicks = props.pendingClicks
  if (clicks.length && iframe?.contentWindow) {
    clicks.forEach(path => iframe.contentWindow.postMessage({ type: 'puzzle-remote-click', path }, '*'))
    emit('consumed-pending-clicks')
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
