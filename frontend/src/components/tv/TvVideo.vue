<script setup>
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  videoUrl: { type: String, default: null },
})

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}
</script>

<template>
  <div class="video-display" data-testid="tv-mode-video">
    <video
      :src="resolveMediaUrl(videoUrl)"
      class="tv-video"
      autoplay
      controls
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
