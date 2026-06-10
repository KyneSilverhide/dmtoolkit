<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeTimeScale: { type: Object, default: null },
})

const tilesColumns = computed(() => {
  const n = props.activeTimeScale?.slotCount || 1
  const rows = n >= 20 ? 3 : n >= 10 ? 2 : 1
  return Math.ceil(n / rows)
})

const dramaLevel = computed(() => {
  const ts = props.activeTimeScale
  if (!ts || ts.slotCount === 0) return 0
  return ts.elapsedSlots / ts.slotCount
})

const dramaClass = computed(() => {
  const d = dramaLevel.value
  if (d >= 0.9) return 'drama-critical'
  if (d >= 0.67) return 'drama-high'
  if (d >= 0.34) return 'drama-medium'
  return 'drama-low'
})
</script>

<template>
  <div
    class="timescale-display"
    :class="dramaClass"
    :style="{ '--drama': dramaLevel }"
    data-testid="tv-mode-timescale"
  >
    <div class="ts-vignette" aria-hidden="true"></div>
    <h2 class="timescale-title">{{ activeTimeScale?.title }}</h2>

    <div class="timescale-tiles" :style="{ '--tile-cols': tilesColumns }">
      <div
        v-for="i in activeTimeScale?.slotCount"
        :key="i"
        class="timescale-tile"
        :class="{
          elapsed: i <= activeTimeScale.elapsedSlots,
          current: i === activeTimeScale.elapsedSlots + 1,
          warning: i > activeTimeScale.elapsedSlots && (activeTimeScale.slotCount - i) < Math.ceil(activeTimeScale.slotCount * 0.34) && i !== activeTimeScale.elapsedSlots + 1,
          danger: i > activeTimeScale.elapsedSlots && (activeTimeScale.slotCount - i) < Math.ceil(activeTimeScale.slotCount * 0.15) && i !== activeTimeScale.elapsedSlots + 1,
        }"
      >
        <span class="tile-hour">{{ i * activeTimeScale.slotHours }}<span class="tile-unit">h</span></span>
      </div>
    </div>

    <div class="timescale-bar-wrap">
      <div class="timescale-bar">
        <div class="ts-fill-elapsed" :style="{ width: (activeTimeScale.elapsedSlots / activeTimeScale.slotCount * 100) + '%' }"></div>
        <div
          v-if="activeTimeScale.restSlots > 0 && !activeTimeScale.restTaken"
          class="ts-fill-rest"
          :class="{ impossible: activeTimeScale.elapsedSlots + activeTimeScale.restSlots > activeTimeScale.slotCount }"
          :style="{
            left: (activeTimeScale.elapsedSlots / activeTimeScale.slotCount * 100) + '%',
            width: (Math.min(activeTimeScale.restSlots, activeTimeScale.slotCount - activeTimeScale.elapsedSlots) / activeTimeScale.slotCount * 100) + '%',
          }"
        >
          <span class="ts-rest-label">Repos {{ activeTimeScale.restSlots * activeTimeScale.slotHours }}h</span>
        </div>
        <div v-for="i in activeTimeScale.slotCount - 1" :key="i" class="ts-divider" :style="{ left: (i / activeTimeScale.slotCount * 100) + '%' }"></div>
        <div class="ts-needle" :style="{ left: (activeTimeScale.elapsedSlots / activeTimeScale.slotCount * 100) + '%' }"></div>
      </div>
    </div>

    <div class="timescale-info">
      <span class="ts-info-elapsed">{{ activeTimeScale.elapsedSlots * activeTimeScale.slotHours }}h écoulées</span>
      <span class="ts-info-sep">·</span>
      <span class="ts-info-remaining">{{ (activeTimeScale.slotCount - activeTimeScale.elapsedSlots) * activeTimeScale.slotHours }}h restantes</span>
      <template v-if="activeTimeScale.restTaken">
        <span class="ts-info-sep">·</span>
        <span class="ts-info-rest-done">Repos pris ✓</span>
      </template>
      <template v-else-if="activeTimeScale.restSlots > 0 && activeTimeScale.elapsedSlots + activeTimeScale.restSlots > activeTimeScale.slotCount">
        <span class="ts-info-sep">·</span>
        <span class="ts-info-impossible">Repos impossible</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.timescale-display {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1.5rem, 4vh, 4rem);
  padding: clamp(1.5rem, 4vh, 4rem);
  overflow: hidden;
}
.ts-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 40%, color-mix(in srgb, var(--color-danger) calc(var(--drama, 0) * 25%), transparent));
  pointer-events: none;
  z-index: 0;
  transition: background 1s;
}
.timescale-title {
  position: relative;
  z-index: 1;
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2.5rem, 6vw, 7rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.1em;
  margin: 0;
  text-align: center;
}
.timescale-tiles {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(var(--tile-cols, 10), 1fr);
  gap: clamp(0.4rem, 0.8vw, 1.2rem);
  max-width: 95vw;
}
.timescale-tile {
  display: flex; align-items: center; justify-content: center;
  width: clamp(4rem, 7vw, 9rem);
  height: clamp(4rem, 7vw, 9rem);
  background: var(--tv-control-bg-muted);
  border: clamp(2px, 0.2vw, 3px) solid var(--color-border);
  border-radius: 8px;
  padding: 0.4rem;
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(0.8rem, 1.5vw, 2rem);
  color: var(--color-text-dim);
  transition: all 0.4s;
}
.timescale-tile.elapsed {
  background: var(--tv-control-bg-muted);
  opacity: 0.35;
  border-style: dashed;
}
.timescale-tile.current {
  border-color: var(--color-gold-bright);
  background: var(--tv-gold-bg-strong);
  color: var(--color-gold-bright);
  box-shadow: 0 0 12px var(--color-gold-dark);
}
.timescale-tile.warning {
  border-color: var(--tv-warning-border);
  color: var(--tv-warning-text);
}
.timescale-tile.danger {
  border-color: var(--tv-danger-border);
  color: var(--tv-danger-text);
  animation: tile-pulse 1s ease-in-out infinite alternate;
}
@keyframes tile-pulse { from { box-shadow: none; } to { box-shadow: 0 0 8px var(--tv-danger-border); } }
.tile-hour { font-size: 1em; }
.tile-unit { font-size: 0.6em; }

.timescale-bar-wrap {
  position: relative;
  z-index: 1;
  width: 90%;
}
.timescale-bar {
  position: relative;
  height: clamp(24px, 3.5vh, 50px);
  background: var(--tv-track-bg);
  border-radius: 10px;
  overflow: hidden;
}
.ts-fill-elapsed {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: var(--color-gold-bright);
  border-radius: 10px;
  transition: width 0.6s ease;
}
.ts-fill-rest {
  position: absolute;
  top: 0; bottom: 0;
  background: var(--tv-info-bg);
  border: 1px solid var(--tv-info-border);
  display: flex; align-items: center; justify-content: center;
  transition: width 0.6s ease, left 0.6s ease;
}
.ts-fill-rest.impossible { background: var(--tv-danger-bg); border-color: var(--tv-danger-border); }
.ts-rest-label {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(0.6rem, 1vw, 1.2rem);
  color: var(--tv-info-text);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.ts-divider {
  position: absolute;
  top: 0; bottom: 0;
  width: 1px;
  background: var(--color-border);
  opacity: 0.5;
}
.ts-needle {
  position: absolute;
  top: -3px; bottom: -3px;
  width: 3px;
  background: var(--color-text);
  border-radius: 2px;
  transform: translateX(-50%);
  transition: left 0.6s ease;
}

.timescale-info {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(0.6rem, 1vw, 1.5rem);
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(1rem, 2vw, 2.5rem);
  letter-spacing: 0.08em;
}
.ts-info-elapsed, .ts-info-remaining { color: var(--color-text-dim); }
.ts-info-sep { color: var(--color-border); }
.ts-info-rest-done { color: var(--tv-success-text); }
.ts-info-impossible { color: var(--tv-danger-text); }

/* Drama classes — affect vignette and tile glow via --drama var */
.drama-low .timescale-title { color: var(--color-gold-bright); }
.drama-medium .timescale-title { color: var(--tv-warning-text); text-shadow: 0 0 20px var(--tv-warning-bg); }
.drama-high .timescale-title { color: var(--tv-danger-text); text-shadow: 0 0 30px var(--tv-danger-bg); }
.drama-critical .timescale-title { color: var(--tv-danger-text); text-shadow: 0 0 40px var(--tv-danger-border); animation: doom-pulse 0.8s ease-in-out infinite alternate; }
@keyframes doom-pulse { from { opacity: 1; } to { opacity: 0.7; } }
</style>
