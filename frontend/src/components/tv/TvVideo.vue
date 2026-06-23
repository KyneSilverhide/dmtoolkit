<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { BACKEND_URL } from '@/config.js'
import { getSocket } from '@/socket.js'
import { VIDEO_CONTROL } from '@/socket-events.js'

const props = defineProps({
  videoUrl: { type: String, default: null },
})

const videoEl = ref(null)

// Tolérance avant de recaler la position : évite les micro-sauts inutiles.
const SEEK_THRESHOLD = 0.4

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

// Applique les commandes de lecture envoyées par l'admin (la TV ne pilote jamais l'admin).
function applyControl({ action, time }) {
  const el = videoEl.value
  if (!el) return
  if (typeof time === 'number' && isFinite(time) && Math.abs(el.currentTime - time) > SEEK_THRESHOLD) {
    el.currentTime = time
  }
  if (action === 'play') el.play().catch(() => {})
  else if (action === 'pause') el.pause()
  // 'seek' : la position a déjà été appliquée ci-dessus, on ne touche pas à l'état lecture/pause.
}

onMounted(() => {
  const socket = getSocket()
  socket.on(VIDEO_CONTROL, applyControl)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off(VIDEO_CONTROL, applyControl)
})
</script>

<template>
  <div class="video-display" data-testid="tv-mode-video">
    <video
      ref="videoEl"
      :src="resolveMediaUrl(videoUrl)"
      class="tv-video"
      autoplay
      muted
      playsinline
    />
  </div>
</template>

<style scoped>
.video-display {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
}
.tv-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
