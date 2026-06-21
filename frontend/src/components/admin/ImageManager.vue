<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'

import { BACKEND_URL } from '@/config.js'

const images = ref([])
const selectedImageUrl = ref(null)
const activeLobbyBgUrl = ref(null)
const zoomedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)   // 0–100
const searchQuery = ref('')
const dragOver = ref(false)

const filteredImages = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return images.value
  return images.value.filter(img => (img.original_name || img.url).toLowerCase().includes(q))
})

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

function uploadFiles(files) {
  if (!files.length || !sessionStore.activeSession) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0

  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('session_id', sessionStore.activeSession.id)
  formData.append('type', 'image')

  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
  })
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadImages()
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
  xhr.open('POST', `${BACKEND_URL}/api/uploads`)
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
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (files.length) uploadFiles(files)
}

function showImageOnTv(imageUrl) {
  const socket = getSocket()
  socket.emit('show-image', { sessionId: sessionStore.activeSession.id, imageUrl })
}

function setLobbyBg(imageUrl) {
  const socket = getSocket()
  socket.emit('set-lobby-bg', { sessionId: sessionStore.activeSession.id, imageUrl })
}

function clearLobbyBg() {
  const socket = getSocket()
  socket.emit('set-lobby-bg', { sessionId: sessionStore.activeSession.id, imageUrl: null })
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  activeLobbyBgUrl.value = data.lobbyBgUrl || null
}

function handleLobbyBgUpdated({ url }) {
  activeLobbyBgUrl.value = url || null
}

function openZoom(url) {
  zoomedImageUrl.value = url
}

function closeZoom() {
  zoomedImageUrl.value = null
}

function imageFullUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

async function saveTvLabel(img) {
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tv_label: img.tv_label || null }),
    })
  } catch (err) { console.error(err) }
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

onMounted(() => {
  loadImages()
  const socket = getSocket()
  socket.on('admin-state', handleAdminState)
  socket.on('lobby-bg-updated', handleLobbyBgUpdated)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('admin-state', handleAdminState)
  socket.off('lobby-bg-updated', handleLobbyBgUpdated)
})
</script>

<template>
  <div
    class="image-manager"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    :class="{ 'drag-active': dragOver }"
  >
    <div v-if="dragOver" class="drop-overlay">
      <AppIcon icon="lucide:image-plus" size="2rem" color="var(--color-gold-bright)" />
      <span>Déposer les images ici</span>
    </div>

    <h3 class="section-title"><AppIcon icon="lucide:image" size="0.9em" /> Gestionnaire d'Images <HelpTip id="image.screen" /></h3>

    <div class="upload-card">
      <label class="upload-btn" :class="{ disabled: uploading || !sessionStore.activeSession }">
        <AppIcon icon="lucide:upload" size="0.8em" />
        {{ uploading ? `Envoi… ${uploadProgress}%` : 'Téléverser des images' }}
        <input
          type="file"
          accept="image/*"
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

    <div v-if="activeLobbyBgUrl" class="lobby-bg-active">
      <AppIcon icon="lucide:image-play" size="0.85em" />
      Fond lobby actif
      <button class="lobby-bg-clear-btn" @click="clearLobbyBg">
        <AppIcon icon="lucide:x" size="0.8em" /> Retirer
      </button>
    </div>

    <div v-if="images.length === 0" class="empty-state">
      <AppIcon icon="lucide:image" size="1.4em" />
      <p>Aucune image téléversée pour cette session.</p>
      <p class="empty-hint">Utilisez le bouton ci-dessus pour en ajouter.</p>
    </div>

    <template v-else>
      <div class="search-bar">
        <AppIcon icon="lucide:search" size="0.8em" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Filtrer les images…"
          type="search"
        />
        <span v-if="searchQuery" class="search-count">{{ filteredImages.length }} / {{ images.length }}</span>
      </div>

      <div v-if="filteredImages.length === 0" class="empty-state">
        <AppIcon icon="lucide:search-x" size="1.2em" />
        <p>Aucune image ne correspond à « {{ searchQuery }} ».</p>
      </div>

      <div v-else class="gallery">
        <div
          v-for="img in filteredImages"
          :key="img.id"
          class="gallery-item"
          :class="{ selected: selectedImageUrl === img.url }">
        <div class="thumb-wrapper">
          <img
            :src="imageFullUrl(img.thumbnail_url || img.url)"
            :alt="img.original_name || img.url"
            class="gallery-thumb zoomable"
            title="Voir en grand"
            @click="openZoom(img.url)"
          />
          <button class="delete-btn" @click="deleteImage(img, $event)" title="Supprimer">✕</button>
        </div>
        <p class="img-name">{{ img.original_name || img.url.split('/').pop() }}</p>
        <div class="tv-label-row">
          <input
            v-model="img.tv_label"
            class="tv-label-input"
            placeholder="Label TV…"
            @blur="saveTvLabel(img)"
            @keydown.enter.prevent="saveTvLabel(img)"
          />
        </div>
        <button class="show-btn" @click.stop="selectedImageUrl = img.url; showImageOnTv(img.url)" title="Afficher sur la TV">
          <AppIcon icon="lucide:monitor" size="0.85em" /> Afficher TV
        </button>
        <button
          class="show-btn lobby-btn"
          :class="{ active: activeLobbyBgUrl === img.url }"
          @click.stop="setLobbyBg(img.url)"
          title="Définir comme fond du lobby"
        >
          <AppIcon icon="lucide:image-play" size="0.85em" /> Fond lobby
        </button>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="zoomedImageUrl" class="zoom-overlay" @click="closeZoom">
        <button class="zoom-close-btn" @click="closeZoom" title="Fermer">
          <AppIcon icon="lucide:x" size="1.2em" />
        </button>
        <img :src="imageFullUrl(zoomedImageUrl)" class="zoom-image" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.image-manager {
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
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  display: block;
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

.img-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  letter-spacing: 0.03em;
  margin: 0.2rem 0 0.15rem;
  word-break: break-all;
  line-height: 1.3;
}

.tv-label-row { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.2rem; }
.tv-label-row .tv-label-input { flex: 1; margin-bottom: 0; }
.tv-label-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.2rem 0.4rem;
  margin-bottom: 0.2rem;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.05em;
  outline: none;
  transition: border-color 0.15s;
}
.tv-label-input:focus { border-color: var(--color-gold-dark); border-style: solid; }
.tv-label-input::placeholder { color: var(--color-border); font-style: italic; }

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
}
.thumb-wrapper:hover .delete-btn { opacity: 1; }

.zoomable { cursor: zoom-in; }

.zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}
.zoom-image {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  cursor: default;
}
.zoom-close-btn {
  position: absolute;
  top: 1.2rem;
  right: 1.2rem;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid var(--color-gold-dark);
  border-radius: 50%;
  color: var(--color-gold-bright);
  cursor: pointer;
}
.zoom-close-btn:hover { background: rgba(0, 0, 0, 0.8); }

.lobby-btn {
  margin-top: 0.2rem;
  border-color: var(--color-info-border, #3a8fba);
  color: var(--color-info-bright, #7ecfff);
  background: var(--color-info-soft, rgba(58,143,186,0.12));
}
.lobby-btn:hover, .lobby-btn.active {
  background: var(--color-info-soft, rgba(58,143,186,0.25));
  border-color: var(--color-info-bright, #7ecfff);
  color: var(--color-info-bright, #7ecfff);
}

.lobby-bg-active {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--color-info-bright, #7ecfff);
  background: var(--color-info-soft, rgba(58,143,186,0.12));
  border: 1px solid var(--color-info-border, #3a8fba);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
}

.lobby-bg-clear-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.5rem;
  background: transparent;
  border: 1px solid var(--color-danger, #e74c3c);
  border-radius: 4px;
  color: var(--color-danger, #e74c3c);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s;
}
.lobby-bg-clear-btn:hover {
  background: var(--tv-danger-bg, rgba(231,76,60,0.15));
}
</style>
