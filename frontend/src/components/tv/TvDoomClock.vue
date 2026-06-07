<script setup>
const DOOM_DANGER_THRESHOLD_SECONDS = 10

const props = defineProps({
  activeDoomClock: { type: Object, default: null },
  doomRemaining: { type: Number, default: 0 },
  doomRemainingLabel: { type: String, default: '00:00' },
})
</script>

<template>
  <div class="doom-display" data-testid="tv-mode-doom">
    <h2 class="doom-title">{{ activeDoomClock?.title || 'DOOM CLOCK' }}</h2>
    <div
      class="doom-timer"
      :class="{ danger: doomRemaining <= DOOM_DANGER_THRESHOLD_SECONDS }"
      data-testid="tv-doom-timer"
    >{{ doomRemainingLabel }}</div>
  </div>
</template>

<style scoped>
.doom-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}
.doom-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.5rem, 4vw, 3rem);
  color: var(--tv-danger-text);
  text-shadow: 0 0 30px var(--tv-danger-bg), var(--text-shadow-accent);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin: 0;
  text-align: center;
}
.doom-timer {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(5rem, 18vw, 14rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.05em;
  line-height: 1;
  transition: color 0.3s;
}
.doom-timer.danger {
  color: var(--tv-danger-text);
  text-shadow: 0 0 40px var(--tv-danger-bg);
  animation: doom-pulse 0.5s ease-in-out infinite alternate;
}
@keyframes doom-pulse {
  from { opacity: 1; }
  to { opacity: 0.6; }
}
</style>
