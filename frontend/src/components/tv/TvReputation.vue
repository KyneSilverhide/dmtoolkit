<script setup>
const props = defineProps({
  factions: { type: Array, default: () => [] },
  session: { type: Object, default: null },
})

function factionBarWidth(faction) {
  const range = faction.max_value - faction.min_value
  if (range === 0) return 50
  return Math.round(((faction.current_value - faction.min_value) / range) * 100)
}

function factionBarColor(faction) {
  const normalized = factionBarWidth(faction) / 100
  const hue = Math.round(normalized * 120)
  return `hsl(${hue}, 65%, 45%)`
}

function formatFactionValue(v) {
  return v >= 0 ? `+${v}` : `${v}`
}
</script>

<template>
  <div class="reputation-display" data-testid="tv-mode-reputation">
    <header class="tv-header">
      <h1 class="session-title">Réputations</h1>
    </header>
    <div class="tv-faction-list">
      <div v-for="faction in factions" :key="faction.id" class="tv-faction-card">
        <span class="tv-faction-name">{{ faction.name }}</span>
        <div class="tv-faction-bar-track">
          <div
            class="tv-faction-bar-fill"
            :style="{
              width: factionBarWidth(faction) + '%',
              background: factionBarColor(faction),
            }"
          />
        </div>
        <span class="tv-faction-value" :style="{ color: factionBarColor(faction) }">
          {{ formatFactionValue(faction.current_value) }}
        </span>
      </div>
      <p v-if="!factions.length" class="tv-no-factions">Aucune faction enregistrée.</p>
    </div>
  </div>
</template>

<style scoped>
.reputation-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 5rem;
  gap: 2.5rem;
}
.tv-header { text-align: center; margin-bottom: 1rem; }
.session-title {
  font-family: var(--font-title), sans-serif;
  font-size: clamp(2.2rem, 5vw, 4rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.1em;
  margin: 0.15rem 0;
}
.tv-faction-list {
  display: flex;
  flex-direction: column;
  gap: 2.2rem;
  overflow: auto;
}
.tv-faction-card {
  display: flex;
  align-items: center;
  gap: 2rem;
}
.tv-faction-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 3.4rem;
  letter-spacing: 0.08em;
  color: var(--color-text);
  width: 720px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tv-faction-bar-track {
  flex: 1;
  height: 30px;
  background: var(--tv-track-bg);
  border-radius: 15px;
  overflow: hidden;
}
.tv-faction-bar-fill {
  height: 100%;
  border-radius: 15px;
  transition: width 0.6s ease, background 0.6s ease;
}
.tv-faction-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 2.6rem;
  font-weight: bold;
  width: 5.5rem;
  flex-shrink: 0;
  text-align: right;
}
.tv-no-factions {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.3rem;
  color: var(--color-text-dim);
  text-align: center;
  letter-spacing: 0.1em;
}
</style>
