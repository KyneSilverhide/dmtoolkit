<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

import { BACKEND_URL } from '@/config.js'

function getImageUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Typewriter effect
const displayedText = ref('')
let typewriterTimer = null

function startTypewriter(text) {
  if (typewriterTimer) clearInterval(typewriterTimer)
  displayedText.value = ''
  let i = 0
  typewriterTimer = setInterval(() => {
    if (i < text.length) {
      displayedText.value += text[i]
      i++
    } else {
      clearInterval(typewriterTimer)
      typewriterTimer = null
    }
  }, 60)
}

onMounted(() => {
  if (props.message.kind !== 'dice' && props.message.type !== 'image' && props.message.textEffect === 'typewriter') {
    startTypewriter(props.message.content || '')
  }
})

onUnmounted(() => {
  if (typewriterTimer) {
    clearInterval(typewriterTimer)
    typewriterTimer = null
  }
})

watch(() => props.message.content, (newVal) => {
  if (props.message.textEffect === 'typewriter') startTypewriter(newVal || '')
})

function resolvedText() {
  if (props.message.textEffect === 'typewriter') return displayedText.value
  return props.message.content
}
</script>

<template>
  <div class="message-card" :class="message.kind">
    <div v-if="message.kind === 'dice'" class="dice-card">
      <div class="dice-header">
        <span class="dice-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.3rem" color="var(--color-gold-bright)" /></span>
        <span class="dice-type">{{ message.combatType }}</span>
        <span class="dice-time">{{ formatTime(message.createdAt) }}</span>
      </div>
      <div class="dice-roll">
        <span class="roll-label">Résultat :</span>
        <span class="roll-value">{{ message.rollValue }}</span>
      </div>
      <p class="dice-result-text">{{ message.resultText }}</p>
    </div>

    <div v-else-if="message.type === 'gold'" class="gold-card">
      <div class="card-header">
        <span class="from-name">{{ message.fromName || 'MJ' }}</span>
        <span class="card-time">{{ formatTime(message.sentAt) }}</span>
      </div>
      <div class="gold-content">
        <span class="gold-icon"><AppIcon icon="game-icons:coins" size="1.6rem" color="#d4af37" /></span>
        <span class="gold-text">{{ message.content }}</span>
      </div>
    </div>

    <div v-else-if="message.type === 'image'" class="image-card">
      <div class="card-header">
        <span class="from-name">{{ message.fromName || 'MJ' }}</span>
        <span class="card-time">{{ formatTime(message.sentAt) }}</span>
      </div>
      <img :src="getImageUrl(message.content)" alt="Image du MJ" class="message-image" />
    </div>

    <div v-else class="text-card" :class="'effect-' + (message.textEffect || 'none')"
      :style="{ '--msg-color': message.authorColor || '#d4af37' }">
      <div class="card-header">
        <span class="from-name">{{ message.fromName || 'MJ' }}</span>
        <span class="card-time">{{ formatTime(message.sentAt) }}</span>
      </div>
      <p class="message-text">{{ resolvedText() }}</p>
    </div>
  </div>
</template>

<style scoped>
.message-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt));
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.dice-card,
.text-card,
.image-card {
  padding: 1rem 1.25rem;
}

.dice-card {
  border-left: 3px solid var(--color-gold-dark);
  background: var(--player-panel-highlight-bg, var(--gradient-panel-soft));
}

.gold-card {
  padding: 1rem 1.25rem;
  border-left: 3px solid #d4af37;
  background: var(--player-panel-highlight-bg, var(--gradient-panel-soft));
}

.gold-content {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.gold-icon {
  font-size: 1.6rem;
  flex-shrink: 0;
}

.gold-text {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  color: #d4af37;
  letter-spacing: 0.06em;
}

.dice-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.dice-icon { font-size: 1.2rem; }

.dice-type {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  flex: 1;
}

.dice-time,
.card-time {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  color: var(--color-text-dim);
}

.dice-roll {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.roll-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.roll-value {
  font-family: var(--font-title), sans-serif;
  font-size: 2rem;
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  line-height: 1;
}

.dice-result-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
  color: var(--color-parchment);
  line-height: 1.5;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.from-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.message-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
  color: var(--color-parchment);
  line-height: 1.6;
  white-space: pre-wrap;
}

/* ── Text card color theming ────────────────────────────────── */
.text-card {
  --msg-color: var(--color-gold-dark);
  border-left: 3px solid var(--msg-color, var(--color-gold-dark));
}

.text-card .from-name {
  color: var(--msg-color, var(--color-gold-dark));
}

/* ── Text effects ───────────────────────────────────────────── */
.effect-slow .message-text {
  animation: fadeSlow 3s ease-in;
}
@keyframes fadeSlow {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.effect-glitch .message-text {
  animation: glitchText 0.5s steps(2) 3;
}
@keyframes glitchText {
  0%   { clip-path: inset(0 0 90% 0); transform: translate(-3px, 0); }
  20%  { clip-path: inset(30% 0 50% 0); transform: translate(3px, 0); }
  40%  { clip-path: inset(60% 0 20% 0); transform: translate(-2px, 0); }
  60%  { clip-path: inset(10% 0 80% 0); transform: translate(2px, 0); }
  80%  { clip-path: inset(70% 0 5% 0); transform: translate(-1px, 0); }
  100% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
}

.effect-shake .message-text {
  animation: shakeText 0.55s ease-in-out;
}
@keyframes shakeText {
  0%, 100% { transform: translateX(0) rotate(0); }
  15%, 45%, 75% { transform: translateX(-5px) rotate(-0.4deg); }
  30%, 60%, 90% { transform: translateX(5px) rotate(0.4deg); }
}

.effect-glow .message-text {
  animation: pulseGlow 2.5s ease-in-out infinite;
}
@keyframes pulseGlow {
  0%, 100% {
    text-shadow: 0 0 4px var(--msg-color, var(--color-gold-bright));
    opacity: 1;
  }
  50% {
    text-shadow: 0 0 14px var(--msg-color, var(--color-gold-bright)), 0 0 28px var(--msg-color, var(--color-gold-bright));
    opacity: 0.88;
  }
}

.message-image {
  width: 100%;
  border-radius: 6px;
  max-height: 400px;
  object-fit: contain;
}
</style>
