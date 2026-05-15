<script setup>
import { ref, onMounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const images = ref([])
const selectedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)   // 0–100

async function loadImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=image`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) images.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0

  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('session_id', sessionStore.activeSession.id)
  formData.append('type', 'image')

  const xhr = new XMLHttpRequest()

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      uploadProgress.value = Math.round((e.loaded / e.total) * 100)
    }
  })

  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadImages()
    } else {
      try {
        const data = JSON.parse(xhr.responseText)
        uploadError.value = data.error || 'Erreur lors du téléversement.'
      } catch {
        uploadError.value = 'Erreur lors du téléversement.'
      }
    }
    uploading.value = false
    uploadProgress.value = 0
    event.target.value = ''
  })

  xhr.addEventListener('error', () => {
    uploadError.value = 'Erreur de connexion.'
    uploading.value = false
    uploadProgress.value = 0
    event.target.value = ''
  })

  xhr.open('POST', `${BACKEND_URL}/api/uploads`)
  xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
  xhr.send(formData)
}

function showImageOnTv(imageUrl) {
  const socket = getSocket()
  socket.emit('show-image', { sessionId: sessionStore.activeSession.id, imageUrl })
}

function imageFullUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

async function deleteImage(img, event) {
  event.stopPropagation()
  if (!confirm(`Supprimer "${img.original_name || img.url}" ?`)) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      if (selectedImageUrl.value === img.url) selectedImageUrl.value = null
      await loadImages()
    }
  } catch (err) { console.error(err) }
}

onMounted(loadImages)
</script>

<template>
  <div class="image-manager">
    <h3 class="section-title"><AppIcon icon="lucide:image" size="0.9em" /> Gestionnaire d'Images</h3>

    <div class="upload-area">
      <label class="upload-btn" :class="{ disabled: uploading }">
        <span>{{ uploading ? `Envoi… ${uploadProgress}%` : 'Téléverser des images' }}</span>
        <input
            type="file"
            accept="image/*"
            multiple
            class="file-input"
            :disabled="uploading"
            @change="handleFileUpload"
        />
      </label>

      <div v-if="uploading" class="progress-track">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
        <span class="progress-label">{{ uploadProgress }}%</span>
      </div>

      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <div v-if="images.length === 0" class="empty-gallery">
      <p>Aucune image téléversée pour cette session.</p>
    </div>

    <div v-else class="gallery">
      <div
          v-for="img in images"
          :key="img.id"
          class="gallery-item"
          :class="{ selected: selectedImageUrl === img.url }">
        <div class="thumb-wrapper">
          <img :src="imageFullUrl(img.url)" :alt="img.original_name || img.url" class="gallery-thumb" />
          <button class="delete-btn" @click="deleteImage(img, $event)" title="Supprimer">✕</button>
        </div>
        <p class="img-name">{{ img.original_name || img.url.split('/').pop() }}</p>
        <button class="show-btn" @click.stop="selectedImageUrl = img.url; showImageOnTv(img.url)" title="Afficher sur la TV">
          <AppIcon icon="lucide:monitor" size="0.85em" /> Afficher TV
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.upload-area {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }

.file-input {
  display: none;
}

.upload-error {
  color: var(--color-danger);
  font-family: var(--font-body);
  font-size: 0.8rem;
}

.empty-gallery {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.85rem;
}

.gallery {
  columns: 5;
  column-gap: 0.6rem;
}
.gallery-item {
  break-inside: avoid;
  margin-bottom: 0.75rem;
}
.gallery-thumb {
  width: 100%;
  height: auto;
  aspect-ratio: unset;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  display: block;
}

.img-name {
  font-family: var(--font-heading);
  font-size: 0.55rem;
  color: var(--color-text-dim);
  letter-spacing: 0.03em;
  margin: 0.2rem 0 0.25rem;
  word-break: break-all;
  line-height: 1.3;
}

.show-btn {
  width: 100%;
  padding: 0.3rem 0.25rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  white-space: nowrap;
}

.show-btn:hover {
  background: var(--surface-gold-soft-strong);
  border-color: var(--color-gold-bright);
  color: var(--color-gold-bright);
}

.upload-btn.disabled {
  opacity: 0.65;
  cursor: not-allowed;
  pointer-events: none;
}

.progress-track {
  position: relative;
  height: 10px;
  background: var(--surface-track);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  border-radius: 6px;
  transition: width 0.15s ease;
}

.progress-label {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  color: var(--color-text-dim);
  letter-spacing: 0.05em;
  line-height: 1;
  pointer-events: none;
}

.thumb-wrapper {
  position: relative;
  width: 100%;
}
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
</style>
