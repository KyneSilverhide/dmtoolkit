<script setup>
import AppIcon from '../../AppIcon.vue'

const props = defineProps({
  track:       { type: Object, required: true },
  isPlaying:   { type: Boolean, default: false },
  volume:      { type: Number, default: 1 },
  loop:        { type: Boolean, default: false },
  duration:    { type: Number, default: 0 },
  currentTime: { type: Number, default: 0 },
  isRenaming:  { type: Boolean, default: false },
  renameValue: { type: String, default: '' },
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
  'delete',
  'change-category',
])

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}
</script>

<template>
  <div class="track-tile" :class="{ playing: isPlaying }">
    <!-- En-tête : play + nom -->
    <div class="tile-header">
      <button class="play-btn" @click="emit('toggle-play')" :title="isPlaying ? 'Pause' : 'Lecture'">
        <AppIcon :icon="isPlaying ? 'lucide:pause' : 'lucide:play'" size="0.85em" />
      </button>
      <div v-if="isRenaming" class="rename-row">
        <input
          class="rename-input"
          :value="renameValue"
          @input="emit('update:renameValue', $event.target.value)"
          @keydown.enter="emit('commit-rename')"
          @keydown.esc="emit('cancel-rename')"
          @blur="emit('commit-rename')"
        />
      </div>
      <div v-else class="track-name" @dblclick="emit('start-rename')" title="Double-clic pour renommer">
        {{ track.original_name || track.url.split('/').pop() }}
      </div>
    </div>

    <!-- Seek bar -->
    <div class="seek-row">
      <input
        type="range" class="seek-bar"
        :min="0" :max="duration || 0"
        :value="currentTime || 0"
        step="0.5"
        @input="emit('seek', +$event.target.value)"
      />
      <span class="time-label">{{ formatTime(duration) }}</span>
    </div>

    <!-- Volume + actions -->
    <div class="tile-controls">
      <div class="volume-row">
        <AppIcon icon="lucide:volume-2" size="0.65em" class="vol-icon" />
        <input
          type="range" class="volume-slider"
          :min="0" :max="1" step="0.05"
          :value="volume"
          @input="emit('set-volume', +$event.target.value)"
        />
      </div>
      <div class="tile-actions">
        <button
          class="icon-btn" :class="{ active: loop }"
          :title="loop ? 'Désactiver boucle' : 'Activer boucle'"
          @click="emit('toggle-loop')"
        ><AppIcon icon="lucide:repeat" size="0.75em" /></button>
        <button class="icon-btn" title="Renommer" @click="emit('start-rename')">
          <AppIcon icon="lucide:pencil" size="0.7em" />
        </button>
        <button class="icon-btn danger" title="Supprimer" @click="emit('delete')">
          <AppIcon icon="lucide:trash-2" size="0.7em" />
        </button>
      </div>
    </div>

    <!-- Catégorie en bas de la tile -->
    <div class="cat-row">
      <input
        class="cat-input"
        :value="track.audio_category || 'Général'"
        list="audio-cats"
        @change="emit('change-category', $event.target.value.trim())"
        @keydown.enter="$event.target.blur()"
      />
    </div>
  </div>
</template>

<style scoped>
.track-tile {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.45rem 0.5rem;
  background: var(--surface-track);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
  min-width: 0;
}
.track-tile.playing {
  border-color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
}

.tile-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.play-btn {
  flex-shrink: 0;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  border: 1px solid var(--color-gold-dark);
  background: var(--surface-gold-soft);
  color: var(--color-gold-bright);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.play-btn:hover { background: var(--surface-gold-soft-strong); }
.track-tile.playing .play-btn { background: var(--color-gold-dark); color: var(--color-bg); }

.track-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  line-height: 1.3;
  min-width: 0;
  flex: 1;
}
.track-name:hover { color: var(--color-gold); }

.rename-row { width: 100%; }
.rename-input {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-gold-dark);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.66rem;
  padding: 0.1rem 0.3rem;
  outline: none;
}

.seek-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.time-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.52rem;
  color: var(--color-text-dim);
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}
.seek-bar {
  flex: 1;
  height: 3px;
  accent-color: var(--color-gold);
  cursor: pointer;
}

.tile-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.2rem;
}
.volume-row {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}
.vol-icon { color: var(--color-text-dim); flex-shrink: 0; }
.volume-slider {
  flex: 1;
  height: 3px;
  accent-color: var(--color-gold);
  cursor: pointer;
  min-width: 0;
}
.tile-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}
.icon-btn {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  padding: 0;
}
.icon-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold); }
.icon-btn.active { border-color: var(--color-gold); color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.icon-btn.danger:hover { border-color: var(--color-danger); color: var(--color-danger); }

.cat-row { display: flex; align-items: center; gap: 0.25rem; }
.cat-input {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.35rem;
  cursor: text;
}
.cat-input:focus { outline: none; border-color: var(--color-gold-dark); }
</style>
