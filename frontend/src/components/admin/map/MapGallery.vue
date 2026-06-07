<script setup>
import AppIcon from '../../AppIcon.vue'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  images: { type: Array, default: () => [] },
  selectedImageUrl: { type: String, default: null },
  uploading: { type: Boolean, default: false },
  uploadProgress: { type: Number, default: 0 },
  uploadError: { type: String, default: '' },
  hasActiveSession: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'delete', 'upload', 'show-on-tv'])

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  emit('upload', files)
}
</script>

<template>
  <div class="map-gallery">
    <!-- Upload -->
    <div class="upload-card">
      <label class="upload-btn" data-testid="map-upload-btn" :class="{ disabled: uploading || !hasActiveSession }">
        <AppIcon icon="lucide:upload" size="0.8em" />
        {{ uploading ? `Envoi… ${uploadProgress}%` : 'Téléverser des cartes' }}
        <input type="file" accept="image/*" multiple class="file-input" :disabled="uploading || !hasActiveSession" @change="handleFileUpload" />
      </label>
      <div v-if="uploading" class="progress-track">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
      </div>
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <!-- Empty state -->
    <div v-if="images.length === 0" class="empty-state">
      <AppIcon icon="lucide:map" size="1.4em" />
      <p>Aucune carte téléversée pour cette session.</p>
      <p class="empty-hint">Utilisez le bouton ci-dessus pour en ajouter.</p>
    </div>

    <!-- Gallery -->
    <div v-else class="gallery">
      <div
        v-for="img in images"
        :key="img.id"
        class="gallery-item"
        :class="{ selected: selectedImageUrl === img.url }"
        @click="emit('select', img)"
      >
        <div class="thumb-wrapper">
          <img :src="imageFullUrl(img.thumbnail_url || img.url)" :alt="img.original_name || img.url" class="gallery-thumb" />
          <button class="delete-btn" @click.stop="emit('delete', img)" title="Supprimer">✕</button>
          <span v-if="img.grid_type && img.grid_type !== 'none'" class="grid-badge" :title="`Grille ${img.grid_type}`">
            <AppIcon :icon="img.grid_type === 'hex' ? 'lucide:hexagon' : 'lucide:grid-3x3'" size="0.7em" />
          </span>
        </div>
        <button class="show-btn" @click.stop="emit('show-on-tv', img)">
          <AppIcon icon="lucide:map" size="0.85em" /> Carte TV
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.55rem 0.75rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
}

.upload-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.3rem 0.8rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.07em;
  cursor: pointer;
  transition: background 0.2s;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }
.upload-btn.disabled { opacity: 0.65; cursor: not-allowed; pointer-events: none; }
.file-input { display: none; }

.upload-error { color: var(--color-danger); font-family: var(--font-body), sans-serif; font-size: 0.8rem; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 2rem 1rem;
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  text-align: center;
}
.empty-hint { font-size: 0.75rem; opacity: 0.7; }

.progress-track {
  flex: 1;
  min-width: 6rem;
  height: 5px;
  background: var(--surface-track);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  transition: width 0.15s ease;
}

.gallery { columns: 2; column-gap: 0.75rem; }
.gallery-item { break-inside: avoid; margin-bottom: 0.75rem; }
.gallery-thumb {
  width: 100%; height: auto;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  display: block;
}
.gallery-item.selected { border-color: var(--color-gold-bright); }

.show-btn {
  width: 100%; padding: 0.3rem 0.25rem;
  background: var(--surface-gold-soft); border: 1px solid var(--color-gold-dark);
  border-radius: 6px; color: var(--color-gold);
  font-family: var(--font-heading), sans-serif; font-size: 0.6rem;
  letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s;
  text-align: center; white-space: nowrap;
}
.show-btn:hover { background: var(--surface-gold-soft-strong); border-color: var(--color-gold-bright); color: var(--color-gold-bright); }

.thumb-wrapper { position: relative; width: 100%; }
.delete-btn {
  position: absolute;
  top: 4px; right: 4px;
  width: 20px; height: 20px;
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--color-danger, #e74c3c);
  border-radius: 50%;
  color: var(--color-danger, #e74c3c);
  font-size: 0.6rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
  line-height: 1;
}
.thumb-wrapper:hover .delete-btn { opacity: 1; }

.grid-badge {
  position: absolute;
  top: 4px; left: 4px;
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--color-gold-dark);
  border-radius: 4px;
  padding: 2px 4px;
  color: var(--color-gold-bright);
  font-size: 0.6rem;
}
</style>
