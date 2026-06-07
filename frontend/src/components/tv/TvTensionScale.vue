<script setup>
const props = defineProps({
  activeTensionScale: { type: Object, default: null },
  tensionColor: { type: String, default: 'var(--tv-success-text)' },
  tensionShakeClass: { type: String, default: '' },
})
</script>

<template>
  <div
    class="tension-display"
    data-testid="tv-mode-tension"
    :style="{ '--tension-color': tensionColor }"
  >
    <h2 class="tension-title">{{ activeTensionScale?.title }}</h2>
    <div class="tension-steps">
      <div
        v-for="step in activeTensionScale?.steps"
        :key="step"
        class="tension-step"
        :class="{ active: step <= activeTensionScale.level }"
      >{{ step }}</div>
    </div>
    <div class="tension-core">
      <div class="tension-pulse-wrap" :class="tensionShakeClass">
        <div class="tension-pulse"></div>
      </div>
      <div class="tension-level">
        {{ activeTensionScale?.level }}<span>/{{ activeTensionScale?.steps }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tension-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 2rem;
}
.tension-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(1.5rem, 4vw, 3rem);
  color: var(--tension-color, var(--tv-success-text));
  text-shadow: 0 0 30px currentColor;
  letter-spacing: 0.1em;
  margin: 0;
  text-align: center;
  transition: color 0.5s;
}
.tension-steps {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
.tension-step {
  width: 2.4rem; height: 2.4rem;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  color: var(--color-text-dim);
  transition: all 0.3s;
}
.tension-step.active {
  border-color: var(--tension-color, var(--tv-success-text));
  color: var(--tension-color, var(--tv-success-text));
  background: color-mix(in srgb, var(--tension-color, var(--tv-success-text)) 15%, transparent);
  box-shadow: 0 0 8px currentColor;
}
.tension-core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px; height: 200px;
}
.tension-pulse-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tension-pulse {
  width: 160px; height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tension-color, var(--tv-success-text)) 30%, transparent), transparent 70%);
  animation: tension-breathe 2s ease-in-out infinite;
  transition: background 0.5s;
}
.tension-level {
  position: relative;
  z-index: 1;
  font-family: var(--font-title), sans-serif;
  font-size: 3.5rem;
  color: var(--tension-color, var(--tv-success-text));
  text-shadow: 0 0 20px currentColor;
  line-height: 1;
}
.tension-level span { font-size: 1.5rem; color: var(--color-text-dim); }

@keyframes tension-breathe {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}

/* Shake classes */
.shake-soft { animation: shake-soft 2.5s ease-in-out infinite; }
.shake-medium { animation: shake-medium 1.5s ease-in-out infinite; }
.shake-hard { animation: shake-hard 0.7s ease-in-out infinite; }
@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
@keyframes shake-medium {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  20% { transform: translateX(-4px) rotate(-1deg); }
  60% { transform: translateX(4px) rotate(1deg); }
}
@keyframes shake-hard {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  15% { transform: translateX(-7px) rotate(-2deg); }
  45% { transform: translateX(7px) rotate(2deg); }
  75% { transform: translateX(-5px) rotate(-1deg); }
}
</style>
