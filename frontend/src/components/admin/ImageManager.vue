<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'

import { BACKEND_URL } from '@/config.js'
import { apiFetch } from '@/utils/apiFetch.js'

const images = ref([])
const selectedImageUrl = ref(null)
const activeLobbyBgUrl = ref(null)
const zoomedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)   // 0–100
const searchQuery = ref('')
const dragOver = ref(false)

// Groupes d'images : une image appartient à au plus un groupe (img.group_id). Le bouton
// « Tirage TV » d'un groupe projette une de ses images au hasard (show-image-group).
const groups = ref([])
const newGroupName = ref('')
const groupError = ref('')
const groupFilterId = ref(null)   // id de groupe : la galerie n'affiche que ses images

const groupImageCounts = computed(() => {
  const counts = {}
  for (const img of images.value) {
    if (img.group_id) counts[img.group_id] = (counts[img.group_id] || 0) + 1
  }
  return counts
})

const filteredImages = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let list = images.value
  if (groupFilterId.value) list = list.filter(img => img.group_id === groupFilterId.value)
  if (!q) return list
  return list.filter(img => (img.original_name || img.url).toLowerCase().includes(q))
})

async function loadImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/images?type=image`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) images.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

async function loadGroups() {
  if (!sessionStore.activeSession) return
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/image-groups`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      groups.value = (await res.json()).map(g => ({ ...g, draftName: g.name }))
      if (groupFilterId.value && !groups.value.some(g => g.id === groupFilterId.value)) groupFilterId.value = null
    }
  } catch (err) {
    console.error(err)
  }
}

async function groupRequest(path, method, body) {
  groupError.value = ''
  const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/image-groups${path}`, {
    method,
    headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    groupError.value = data.error || 'Erreur lors de la mise à jour du groupe.'
  }
  return res.ok
}

async function createGroup() {
  const name = newGroupName.value.trim()
  if (!name || !sessionStore.activeSession) return
  // Vidé avant la requête (et restauré en cas d'échec) : vider après coup effacerait ce que le
  // MJ a commencé à taper pendant l'aller-retour.
  newGroupName.value = ''
  try {
    if (await groupRequest('', 'POST', { name })) await loadGroups()
    else newGroupName.value = name
  } catch (err) {
    newGroupName.value = name
    console.error(err)
  }
}

async function renameGroup(group) {
  const name = group.draftName.trim()
  if (!name || name === group.name) { group.draftName = group.name; return }
  try {
    if (await groupRequest(`/${group.id}`, 'PATCH', { name })) group.name = name
    else group.draftName = group.name
  } catch (err) { console.error(err) }
}

async function deleteGroup(group) {
  if (!confirm(`Supprimer le groupe « ${group.name} » ? Ses images ne sont pas supprimées.`)) return
  try {
    if (await groupRequest(`/${group.id}`, 'DELETE')) {
      for (const img of images.value) if (img.group_id === group.id) img.group_id = null
      await loadGroups()
    }
  } catch (err) { console.error(err) }
}

function toggleGroupFilter(group) {
  groupFilterId.value = groupFilterId.value === group.id ? null : group.id
}

function showRandomGroupImageOnTv(group) {
  const socket = getSocket()
  socket.emit('show-image-group', { sessionId: sessionStore.activeSession.id, groupId: group.id })
}

async function setImageGroup(img, groupId) {
  const previous = img.group_id
  img.group_id = groupId
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId }),
    })
    if (!res.ok) img.group_id = previous
  } catch (err) {
    img.group_id = previous
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
    await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
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
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
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
  loadGroups()
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

    <section v-if="sessionStore.activeSession" class="groups-card" aria-label="Groupes d'images">
      <div class="groups-header">
        <span class="groups-title"><AppIcon icon="lucide:dices" size="0.85em" /> Groupes</span>
        <form class="group-create" @submit.prevent="createGroup">
          <input
            v-model="newGroupName"
            class="group-name-input"
            placeholder="Nouveau groupe…"
            maxlength="100"
            aria-label="Nom du nouveau groupe"
          />
          <button type="submit" class="group-btn" :disabled="!newGroupName.trim()">
            <AppIcon icon="lucide:plus" size="0.8em" /> Créer
          </button>
        </form>
      </div>
      <p v-if="groupError" class="upload-error">{{ groupError }}</p>
      <p v-if="groups.length === 0" class="groups-empty">
        Créez un groupe (ex. « Hex - Plaine »), rangez-y des images via le menu « Groupe » de chaque image, puis tirez-en une au hasard sur la TV.
      </p>
      <ul v-else class="group-list">
        <li
          v-for="group in groups"
          :key="group.id"
          class="group-row"
          :class="{ filtered: groupFilterId === group.id }"
        >
          <input
            v-model="group.draftName"
            class="group-name-input group-rename"
            maxlength="100"
            :aria-label="`Renommer le groupe ${group.name}`"
            @blur="renameGroup(group)"
            @keydown.enter.prevent="$event.target.blur()"
          />
          <button
            class="group-count"
            :class="{ active: groupFilterId === group.id }"
            :title="groupFilterId === group.id ? 'Afficher toutes les images' : 'N\'afficher que les images de ce groupe'"
            @click="toggleGroupFilter(group)"
          >
            {{ groupImageCounts[group.id] || 0 }} image{{ (groupImageCounts[group.id] || 0) > 1 ? 's' : '' }}
          </button>
          <button
            class="group-btn group-draw-btn"
            :disabled="!groupImageCounts[group.id]"
            title="Afficher une image du groupe au hasard sur la TV"
            @click="showRandomGroupImageOnTv(group)"
          >
            <AppIcon icon="lucide:dices" size="0.85em" /> Tirage TV
          </button>
          <button class="group-delete-btn" :title="`Supprimer le groupe ${group.name}`" @click="deleteGroup(group)">
            <AppIcon icon="lucide:trash-2" size="0.8em" />
          </button>
        </li>
      </ul>
    </section>

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
        <span v-if="searchQuery || groupFilterId" class="search-count">{{ filteredImages.length }} / {{ images.length }}</span>
      </div>

      <div v-if="filteredImages.length === 0" class="empty-state">
        <AppIcon icon="lucide:search-x" size="1.2em" />
        <p v-if="searchQuery">Aucune image ne correspond à « {{ searchQuery }} ».</p>
        <p v-else>Aucune image dans ce groupe.</p>
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
        <select
          v-if="groups.length"
          class="group-select"
          :value="img.group_id ?? ''"
          :aria-label="`Groupe de ${img.original_name || 'l\'image'}`"
          @change="setImageGroup(img, $event.target.value ? Number($event.target.value) : null)"
        >
          <option value="">— Aucun groupe —</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
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
  gap: var(--space-4);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--overlay-scrim);
  border: 2px dashed var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-base);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
}

.drag-active > *:not(.drop-overlay) { opacity: 0.35; pointer-events: none; }

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.upload-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2) var(--space-3);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
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
  font-size: var(--text-sm);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
  text-align: center;
}
.empty-hint { font-size: var(--text-sm); opacity: 0.7; }

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-2);
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
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: var(--space-1) var(--space-2);
}
.search-icon { color: var(--color-text-dim); flex-shrink: 0; }
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
}
.search-input::placeholder { color: var(--color-border); font-style: italic; }
.search-input::-webkit-search-cancel-button { cursor: pointer; }
.search-count {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  color: var(--color-text-dim);
  white-space: nowrap;
}

.img-name {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
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
  padding: 0.2rem var(--space-2);
  margin-bottom: 0.2rem;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.05em;
  outline: none;
  transition: border-color 0.15s;
}
.tv-label-input:focus { border-color: var(--color-gold-dark); border-style: solid; }
.tv-label-input::placeholder { color: var(--color-border); font-style: italic; }

.show-btn {
  width: 100%;
  padding: var(--space-1) 0.25rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
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
  background: var(--overlay-scrim);
  border: 1px solid var(--color-danger, #e74c3c);
  border-radius: 50%;
  color: var(--color-danger, #e74c3c);
  font-size: var(--text-2xs);
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
  background: var(--overlay-scrim-strong);
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
  background: var(--overlay-scrim);
  border: 1px solid var(--color-gold-dark);
  border-radius: 50%;
  color: var(--color-gold-bright);
  cursor: pointer;
}
.zoom-close-btn:hover { background: var(--overlay-scrim-strong); }

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
  gap: var(--space-2);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  color: var(--color-info-bright, #7ecfff);
  background: var(--color-info-soft, rgba(58,143,186,0.12));
  border: 1px solid var(--color-info-border, #3a8fba);
  border-radius: 6px;
  padding: var(--space-1) var(--space-2);
}

.lobby-bg-clear-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem var(--space-2);
  background: transparent;
  border: 1px solid var(--color-danger, #e74c3c);
  border-radius: 4px;
  color: var(--color-danger, #e74c3c);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s;
}
.groups-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.groups-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.groups-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.group-create {
  display: flex;
  gap: var(--space-1);
  flex: 1;
  min-width: 14rem;
}
.group-name-input {
  flex: 1;
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
}
.group-name-input:focus { border-color: var(--color-gold-dark); }
.group-name-input::placeholder { color: var(--color-border); font-style: italic; }
.group-rename { border-style: dashed; color: var(--color-gold-bright); }
.group-rename:focus { border-style: solid; }
.groups-empty {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
}
.group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.group-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.2rem;
  border-radius: 6px;
}
.group-row.filtered { background: var(--surface-gold-soft); }
.group-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: var(--space-1) var(--space-2);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.group-btn:hover:not(:disabled) {
  background: var(--surface-gold-soft-strong);
  border-color: var(--color-gold-bright);
  color: var(--color-gold-bright);
}
.group-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.group-count {
  padding: 0.15rem var(--space-2);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  white-space: nowrap;
  cursor: pointer;
}
.group-count.active { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.group-delete-btn {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--color-text-dim);
  cursor: pointer;
}
.group-delete-btn:hover { border-color: var(--color-danger, #e74c3c); color: var(--color-danger, #e74c3c); }
.group-select {
  width: 100%;
  margin-bottom: 0.2rem;
  padding: 0.15rem var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
}

.lobby-bg-clear-btn:hover {
  background: var(--tv-danger-bg, rgba(231,76,60,0.15));
}
</style>
