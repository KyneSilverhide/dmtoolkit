<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import { SHOW_VIDEO } from '@/socket-events.js'

import { BACKEND_URL } from '@/config.js'

const videos = ref([])
const selectedVideoUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)   // 0–100
const searchQuery = ref('')
const dragOver = ref(false)

const filteredVideos = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return videos.value
  return videos.value.filter(v => (v.original_name || v.url).toLowerCase().includes(q))
})

async function loadVideos() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=video`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) videos.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

function uploadFiles(files) {
  if (!files.length || !sessionStore.activeSession) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0

  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('session_id', sessionStore.activeSession.id)

  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
  })
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadVideos()
    } else {
      try { uploadError.value = JSON.parse(xhr.responseText).error || 'Erreur lors du téléversement.' }
      catch { uploadError.value = 'Erreur lors du téléversement.' }
    }
    uploading.value = false
    uploadProgress.value = 0
  })
  xhr.addEventListener('error', () => {
    uploadError.value = 'Erreur de connexion.'
    uploading.value = false
    uploadProgress.value = 0
  })
  xhr.open('POST', `${BACKEND_URL}/api/uploads/video`)
  xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
  xhr.send(formData)
}

function handleFileUpload(event) {
  uploadFiles(Array.from(event.target.files || []))
  event.target.value = ''
}

function onDragOver(e) {
  if (uploading.value || !sessionStore.activeSession) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = false
}

function onDrop(e) {
  e.preventDefault()
  dragOver.value = false
  if (uploading.value || !sessionStore.activeSession) return
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
  if (files.length) uploadFiles(files)
}

function showVideoOnTv(videoUrl) {
  const socket = getSocket()
  socket.emit(SHOW_VIDEO, { sessionId: sessionStore.activeSession.id, videoUrl })
}

function videoFullUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

async function deleteVideo(video, event) {
  event.stopPropagation()
  if (!confirm(`Supprimer "${video.original_name || video.url}" ?`)) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${video.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      if (selectedVideoUrl.value === video.url) selectedVideoUrl.value = null
      await loadVideos()
    }
  } catch (err) { console.error(err) }
}

onMounted(() => {
  loadVideos()
})

onUnmounted(() => {})
</script>

<template>
  <div
    class="video-manager"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    :class="{ 'drag-active': dragOver }"
  >
    <div v-if="dragOver" class="drop-overlay">
      <AppIcon icon="lucide:film" size="2rem" color="var(--color-gold-bright)" />
      <span>Déposer les vidéos ici</span>
    </div>

    <h3 class="section-title"><AppIcon icon="lucide:video" size="0.9em" /> Gestionnaire de Vidéos <HelpTip id="video.screen" /></h3>

    <div class="upload-card">
      <label class="upload-btn" :class="{ disabled: uploading || !sessionStore.activeSession }">
        <AppIcon icon="lucide:upload" size="0.8em" />
        {{ uploading ? `Envoi… ${uploadProgress}%` : 'Téléverser des vidéos' }}
        <input
          type="file"
          accept="video/*"
          multiple
          class="file-input"
          :disabled="uploading || !sessionStore.activeSession"
          @change="handleFileUpload"
        />
      </label>
      <div v-if="uploading" class="progress-track">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
      </div>
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <div v-if="videos.length === 0" class="empty-state">
      <AppIcon icon="lucide:video" size="1.4em" />
      <p>Aucune vidéo téléversée pour cette session.</p>
      <p class="empty-hint">Utilisez le bouton ci-dessus pour en ajouter.</p>
    </div>

    <template v-else>
      <div class="search-bar">
        <AppIcon icon="lucide:search" size="0.8em" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Filtrer les vidéos…"
          type="search"
        />
        <span v-if="searchQuery" class="search-count">{{ filteredVideos.length }} / {{ videos.length }}</span>
      </div>

      <div v-if="filteredVideos.length === 0" class="empty-state">
        <AppIcon icon="lucide:search-x" size="1.2em" />
        <p>Aucune vidéo ne correspond à « {{ searchQuery }} ».</p>
      </div>

      <div v-else class="gallery">
        <div
          v-for="video in filteredVideos"
          :key="video.id"
          class="gallery-item"
          :class="{ selected: selectedVideoUrl === video.url }">
        <div class="thumb-wrapper">
          <video
            :src="videoFullUrl(video.url)"
            class="gallery-thumb"
            preload="metadata"
            muted
            controls
            playsinline
          />
          <button class="delete-btn" @click="deleteVideo(video, $event)" title="Supprimer">✕</button>
        </div>
        <p class="vid-name">{{ video.original_name || video.url.split('/').pop() }}</p>
        <button class="show-btn" @click.stop="selectedVideoUrl = video.url; showVideoOnTv(video.url)" title="Afficher sur la TV">
          <AppIcon icon="lucide:monitor" size="0.85em" /> Afficher TV
        </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.video-manager {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: rgba(0, 0, 0, 0.65);
  border: 2px dashed var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
}

.drag-active > *:not(.drop-overlay) { opacity: 0.35; pointer-events: none; }

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }

.file-input {
  display: none;
}

.upload-error {
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
}

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

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.6rem;
}
.gallery-item {
  min-width: 0;
}
.gallery-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  display: block;
  background: #000;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
}
.search-icon { color: var(--color-text-dim); flex-shrink: 0; }
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}
.search-input::placeholder { color: var(--color-border); font-style: italic; }
.search-input::-webkit-search-cancel-button { cursor: pointer; }
.search-count {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  color: var(--color-text-dim);
  white-space: nowrap;
}

.vid-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  letter-spacing: 0.03em;
  margin: 0.2rem 0 0.15rem;
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
  font-family: var(--font-heading), sans-serif;
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
  z-index: 2;
}
.thumb-wrapper:hover .delete-btn { opacity: 1; }
</style>
