<script setup>
// Variante « cellule » du minuteur libre, pour une cellule de TvDashboard.vue —
// distincte du rendu en overlay coin (TvView.vue, .timer-overlay), qui reste inchangé
// et se masque de lui-même quand tv_mode === 'dashboard' pour éviter un double affichage.
defineProps({
  activeTimer: { type: Object, default: null },
  remaining: { type: Number, default: 0 },
  remainingLabel: { type: String, default: '00:00' },
  danger: { type: Boolean, default: false },
})
</script>

<template>
  <div class="timer-widget" :class="{ danger }" data-testid="tv-widget-timer">
    <span class="timer-widget-label">{{ activeTimer?.label }}</span>
    <span class="timer-widget-time">{{ remainingLabel }}</span>
  </div>
</template>

<style scoped>
.timer-widget {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
.timer-widget-label {
  font-family: var(--font-heading), sans-serif;
  /* cq* (container queries) : la taille suit la cellule du dashboard (TvDashboard.vue
     pose `container-type: size` sur `.dashboard-cell`), pas le viewport — voir le même
     commentaire sur TvTensionScale.vue .compact. */
  font-size: clamp(0.7rem, 7cqmin, 2rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
}
.timer-widget-time {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.8rem, 30cqmin, 10rem);
  color: var(--tv-info-text, var(--color-info-bright));
  line-height: 1;
  letter-spacing: 0.03em;
}
.timer-widget.danger .timer-widget-time {
  color: var(--tv-warning-text, var(--color-warning));
  animation: timerWidgetPulse 1s ease-in-out infinite;
}
@keyframes timerWidgetPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
