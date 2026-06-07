<script setup>
import AppIcon from '../../AppIcon.vue'
import AudioTrackTile from './AudioTrackTile.vue'

const props = defineProps({
  group:         { type: Object, required: true }, // { key, label, tracks }
  playing:       { type: Set, default: () => new Set() },
  volumes:       { type: Object, default: () => ({}) },
  loops:         { type: Object, default: () => ({}) },
  durations:     { type: Object, default: () => ({}) },
  currentTimes:  { type: Object, default: () => ({}) },
  renamingId:    { default: null },
  renameValue:   { type: String, default: '' },
  allCategories: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'toggle-play',
  'set-volume',
  'toggle-loop',
  'seek',
  'start-rename',
  'update:renameValue',
  'commit-rename',
  'cancel-rename',
  'delete-track',
  'delete-category',
  'change-category',
])
</script>

<template>
  <div class="category-section">
    <!-- En-tête de catégorie -->
    <div class="cat-header">
      <AppIcon icon="lucide:folder" size="0.8em" class="cat-icon" />
      <span class="cat-label">{{ group.label }}</span>
      <span class="cat-count">{{ group.tracks.length }}</span>
      <div class="cat-header-line" />
      <button
        class="cat-delete-btn"
        :title="`Supprimer les ${group.tracks.length} fichier(s) de « ${group.label} »`"
        @click="emit('delete-category', group.tracks)"
      ><AppIcon icon="lucide:trash-2" size="0.7em" /></button>
    </div>

    <!-- Tracks de cette catégorie -->
    <div class="track-list">
      <AudioTrackTile
        v-for="track in group.tracks"
        :key="track.id"
        :track="track"
        :is-playing="playing.has(track.id)"
        :volume="volumes[track.id] ?? 1"
        :loop="loops[track.id] ?? false"
        :duration="durations[track.id]"
        :current-time="currentTimes[track.id] ?? 0"
        :is-renaming="renamingId === track.id"
        :rename-value="renameValue"
        :all-categories="allCategories"
        @toggle-play="emit('toggle-play', track)"
        @set-volume="emit('set-volume', track, $event)"
        @toggle-loop="emit('toggle-loop', track)"
        @seek="emit('seek', track, $event)"
        @start-rename="emit('start-rename', track)"
        @update:rename-value="emit('update:renameValue', $event)"
        @commit-rename="emit('commit-rename', track)"
        @cancel-rename="emit('cancel-rename')"
        @delete="emit('delete-track', track)"
        @change-category="emit('change-category', track, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.category-section { display: flex; flex-direction: column; gap: 0.4rem; }

.cat-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.cat-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.cat-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  white-space: nowrap;
}
.cat-count {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  color: var(--color-text-dim);
  background: var(--surface-track);
  border-radius: 10px;
  padding: 0 0.35rem;
  min-width: 1.4em;
  text-align: center;
  flex-shrink: 0;
}
.cat-header-line {
  flex: 1;
  height: 1px;
  background: var(--color-border);
  opacity: 0.6;
}
.cat-delete-btn {
  flex-shrink: 0;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.12s;
}
.cat-delete-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }

.track-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
  gap: 0.45rem;
}
</style>
