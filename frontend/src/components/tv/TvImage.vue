<script setup>
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  imageUrl: { type: String, default: null },
  imageLabel: { type: String, default: null },
})

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}
</script>

<template>
  <div class="image-display" data-testid="tv-mode-image">
    <img :src="resolveMediaUrl(imageUrl)" class="tv-image" alt="Image affichée" />
    <div v-if="imageLabel" class="image-label-overlay">{{ imageLabel }}</div>
  </div>
</template>

<style scoped>
.image-display {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
  background: #000;
}
.tv-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.image-label-overlay {
  position: absolute;
  top: 1rem;
  left: 1rem;
  padding: 0.4rem 0.9rem;
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  font-family: var(--font-heading), sans-serif;
  font-size: 72pt;
  letter-spacing: 0.1em;
  color: var(--color-gold-bright);
}
</style>
