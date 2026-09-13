<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeTensionScale: { type: Object, default: null },
  tensionColor: { type: String, default: 'var(--tv-success-text)' },
  tensionShakeClass: { type: String, default: '' },
  // Rendu réduit pour une cellule de la vue dynamique (TvDashboard.vue) — le rendu
  // plein écran par défaut (compact=false) n'est pas affecté par les règles .compact.
  compact: { type: Boolean, default: false },
})

const stepsColumns = computed(() => {
  const n = props.activeTensionScale?.steps || 1
  const rows = n >= 20 ? 3 : n >= 10 ? 2 : 1
  return Math.ceil(n / rows)
})
</script>

<template>
  <div
    class="tension-display"
    :class="{ compact }"
    data-testid="tv-mode-tension"
    :style="{ '--tension-color': tensionColor }"
  >
    <h2 class="tension-title">{{ activeTensionScale?.title }}</h2>
    <div class="tension-steps" :style="{ '--step-cols': stepsColumns }">
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
  gap: clamp(1rem, 3vh, 3rem);
  padding: 2rem;
}
.tension-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2rem, 5vw, 5rem);
  color: var(--tension-color, var(--tv-success-text));
  text-shadow: 0 0 30px currentColor;
  letter-spacing: 0.1em;
  margin: 0;
  text-align: center;
  transition: color 0.5s;
}
.tension-steps {
  display: grid;
  grid-template-columns: repeat(var(--step-cols, 10), 1fr);
  gap: clamp(0.6rem, 1.2vw, 1.5rem);
  max-width: 90vw;
}
.tension-step {
  width: clamp(3rem, 6.5vw, 9rem);
  height: clamp(3rem, 6.5vw, 9rem);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: clamp(2px, 0.3vw, 5px) solid var(--color-border);
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1.2rem, 2.6vw, 3.5rem);
  font-weight: 700;
  color: var(--color-text-dim);
  transition: all 0.3s;
}
.tension-step.active {
  border-color: var(--tension-color, var(--tv-success-text));
  color: var(--tension-color, var(--tv-success-text));
  background: color-mix(in srgb, var(--tension-color, var(--tv-success-text)) 15%, transparent);
  box-shadow: 0 0 clamp(8px, 1vw, 20px) currentColor;
}
.tension-core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(200px, 30vw, 500px);
  height: clamp(200px, 30vw, 500px);
}
.tension-pulse-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tension-pulse {
  width: 80%; height: 80%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tension-color, var(--tv-success-text)) 30%, transparent), transparent 70%);
  animation: tension-breathe 2s ease-in-out infinite;
  transition: background 0.5s;
}
.tension-level {
  position: relative;
  z-index: 1;
  font-family: var(--font-title), sans-serif;
  font-size: clamp(4rem, 12vw, 14rem);
  color: var(--tension-color, var(--tv-success-text));
  text-shadow: 0 0 20px currentColor;
  line-height: 1;
}
.tension-level span { font-size: 0.4em; color: var(--color-text-dim); }

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

/* ── Variante compacte (cellule de la vue dynamique, TvDashboard.vue) ────────
   N'affecte jamais le rendu plein écran par défaut (compact=false). Dimensionnée en
   unités cq* (container queries — TvDashboard.vue pose `container-type: size` sur
   `.dashboard-cell`, le parent direct) plutôt qu'en vw/vh : la taille suit celle de LA
   CELLULE, pas du viewport entier, donc reste lisible à distance quel que soit le
   layout (colonne étroite et haute, ligne large et basse, coin carré...). cqmin = le
   plus petit des deux (cqw, cqh), pour ne jamais déborder dans la dimension la plus
   contrainte de la cellule. */
.tension-display.compact {
  gap: 3cqmin;
  padding: 4cqmin;
}
.tension-display.compact .tension-title {
  font-size: clamp(0.9rem, 9cqmin, 4rem);
}
.tension-display.compact .tension-steps {
  gap: 1.5cqmin;
  max-width: 100%;
}
.tension-display.compact .tension-step {
  width: clamp(1rem, 9cqmin, 3.5rem);
  height: clamp(1rem, 9cqmin, 3.5rem);
  font-size: clamp(0.55rem, 4.5cqmin, 1.6rem);
  border-width: clamp(1px, 0.5cqmin, 3px);
}
.tension-display.compact .tension-core {
  width: min(55cqw, 50cqh);
  height: min(55cqw, 50cqh);
}
.tension-display.compact .tension-level {
  font-size: clamp(1.5rem, 28cqmin, 9rem);
}
</style>
