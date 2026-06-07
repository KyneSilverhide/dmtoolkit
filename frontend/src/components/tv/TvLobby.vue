<script setup>
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  session: { type: Object, required: true },
  qrCodeDataUrl: { type: String, default: null },
  sessionCode: { type: String, default: '' },
  lobbyBgUrl: { type: String, default: null },
})

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}
</script>

<template>
  <div class="lobby-display" data-testid="tv-mode-lobby">
    <img v-if="lobbyBgUrl" :src="resolveMediaUrl(lobbyBgUrl)" class="lobby-bg-img" alt="" aria-hidden="true" />
    <header class="tv-header">
      <h1 class="session-title">{{ session.name }}</h1>
      <div class="lobby-divider" aria-hidden="true">⸻ ✦ ⸻</div>
    </header>
    <p class="lobby-title">Rejoignez la partie !</p>
    <img v-if="qrCodeDataUrl" :src="qrCodeDataUrl" alt="QR Code" class="lobby-qr" />
    <div class="lobby-code" data-testid="tv-session-code">{{ sessionCode }}</div>
    <p class="lobby-hint">Scannez le QR code ou saisissez le code sur l'application</p>
  </div>
</template>

<style scoped>
.lobby-display {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
}
.lobby-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
}
.tv-header { text-align: center; margin-bottom: 0.6rem; }
.session-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.2rem, 3vw, 2.4rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.1em;
  margin: 0.15rem 0;
}
.lobby-divider {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(0.48rem, 0.9vw, 0.66rem);
  letter-spacing: 0.5em;
  color: var(--color-gold-dark);
  margin-top: 0.3rem;
}
.lobby-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.08rem, 2.1vw, 1.68rem);
  color: var(--color-parchment);
  text-shadow: var(--text-shadow-emphasis);
  letter-spacing: 0.08em;
  margin: 0;
}
.lobby-qr {
  width: 400px;
  height: 400px;
  border: 2px solid var(--color-gold-dark);
  border-radius: 10px;
  background: white;
  padding: 5px;
  box-shadow: var(--shadow-soft);
}
.lobby-code {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2.4rem, 7.2vw, 4.8rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.2em;
  line-height: 1;
}
.lobby-hint {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(0.42rem, 0.9vw, 0.6rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
}
</style>
