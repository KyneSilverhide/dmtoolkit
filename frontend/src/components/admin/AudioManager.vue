<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import { getSocket } from '../../socket.js'
import { AUDIO_PLAY_REQUESTED } from '../../socket-events.js'

import { BACKEND_URL } from '@/config.js'

const tracks = ref([])
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')

// playback state per track id
const audioObjects = new Map()   // id -> HTMLAudioElement
const playing = ref(new Set())   // Set of ids currently playing
const volumes = ref({})          // id -> 0..1
const loops = ref({})            // id -> boolean
const durations = ref({})        // id -> seconds (NaN until loaded)
const currentTimes = ref({})     // id -> seconds

// Web Audio API — shared context + per-track gain nodes to prevent clipping
let audioCtx = null
let masterLimiter = null
const gainNodes = new Map()    // id -> GainNode
const sourceNodes = new Map()  // id -> MediaElementSourceNode

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    // Brick-wall limiter: only activates near 0 dBFS so multiple tracks can't clip
    masterLimiter = audioCtx.createDynamicsCompressor()
    masterLimiter.threshold.value = -3
    masterLimiter.knee.value = 0
    masterLimiter.ratio.value = 20
    masterLimiter.attack.value = 0.001
    masterLimiter.release.value = 0.1
    masterLimiter.connect(audioCtx.destination)
  }
  return audioCtx
}

function connectToContext(track) {
  if (sourceNodes.has(track.id)) return
  const ctx = getAudioContext()
  const audio = audioObjects.get(track.id)
  if (!audio) return
  const source = ctx.createMediaElementSource(audio)
  const gain = ctx.createGain()
  gain.gain.value = volumes.value[track.id] ?? 1
  source.connect(gain)
  gain.connect(masterLimiter)
  sourceNodes.set(track.id, source)
  gainNodes.set(track.id, gain)
}

function disconnectTrack(id) {
  const source = sourceNodes.get(id)
  const gain = gainNodes.get(id)
  if (source) { try { source.disconnect() } catch (_) {} sourceNodes.delete(id) }
  if (gain) { try { gain.disconnect() } catch (_) {} gainNodes.delete(id) }
}

// rename state
const renamingId = ref(null)
const renameValue = ref('')
const renameInput = ref(null)

const allCategories = computed(() => {
  const seen = new Set()
  for (const t of tracks.value) seen.add(t.audio_category || 'Général')
  return [...seen].sort((a, b) => a.localeCompare(b, 'fr'))
})

const tracksByCategory = computed(() =>
  allCategories.value.map(cat => ({
    key: cat,
    label: cat,
    tracks: tracks.value.filter(t => (t.audio_category || 'Général') === cat),
  }))
)

async function loadTracks() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=audio`,
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )
    if (res.ok) {
      const data = await res.json()
      tracks.value = data
      for (const t of data) {
        if (volumes.value[t.id] === undefined) volumes.value[t.id] = 1
        if (loops.value[t.id] === undefined) loops.value[t.id] = false
      }
    }
  } catch (err) { console.error(err) }
}

function getAudio(track) {
  if (!audioObjects.has(track.id)) {
    const src = track.url.startsWith('http') ? track.url : `${BACKEND_URL}${track.url}`
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'  // required for AudioContext cross-origin
    audio.src = src
    audio.loop = loops.value[track.id] ?? false
    audio.addEventListener('ended', () => {
      if (!audio.loop) {
        playing.value = new Set([...playing.value].filter(id => id !== track.id))
      }
    })
    audio.addEventListener('timeupdate', () => {
      currentTimes.value = { ...currentTimes.value, [track.id]: audio.currentTime }
    })
    audio.addEventListener('loadedmetadata', () => {
      durations.value = { ...durations.value, [track.id]: audio.duration }
    })
    audioObjects.set(track.id, audio)
  }
  return audioObjects.get(track.id)
}

function togglePlay(track) {
  const audio = getAudio(track)
  if (playing.value.has(track.id)) {
    audio.pause()
    playing.value = new Set([...playing.value].filter(id => id !== track.id))
  } else {
    connectToContext(track)
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    audio.play().catch(err => console.error(err))
    playing.value = new Set([...playing.value, track.id])
  }
}

function stopAll() {
  for (const [id, audio] of audioObjects) {
    audio.pause()
    audio.currentTime = 0
  }
  currentTimes.value = {}
  playing.value = new Set()
}

function setVolume(track, val) {
  volumes.value = { ...volumes.value, [track.id]: val }
  const gain = gainNodes.get(track.id)
  if (gain) gain.gain.value = val
  else {
    const audio = audioObjects.get(track.id)
    if (audio) audio.volume = val
  }
}

function toggleLoop(track) {
  const newVal = !loops.value[track.id]
  loops.value = { ...loops.value, [track.id]: newVal }
  const audio = audioObjects.get(track.id)
  if (audio) audio.loop = newVal
}

function seek(track, val) {
  const audio = audioObjects.get(track.id)
  if (audio) audio.currentTime = val
  currentTimes.value = { ...currentTimes.value, [track.id]: val }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0

  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  formData.append('session_id', sessionStore.activeSession.id)

  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
  })
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadTracks()
    } else {
      try {
        uploadError.value = JSON.parse(xhr.responseText).error || 'Erreur upload.'
      } catch { uploadError.value = 'Erreur upload.' }
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
  xhr.open('POST', `${BACKEND_URL}/api/uploads/audio`)
  xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
  xhr.send(formData)
}

async function deleteAll() {
  if (!confirm(`Supprimer les ${tracks.value.length} fichiers audio de cette session ?`)) return
  for (const track of [...tracks.value]) {
    const audio = audioObjects.get(track.id)
    if (audio) { audio.pause(); audioObjects.delete(track.id) }
    disconnectTrack(track.id)
  }
  playing.value = new Set()
  try {
    await Promise.all(tracks.value.map(t =>
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${t.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${authStore.token}` } })
    ))
  } catch (err) { console.error(err) }
  await loadTracks()
}

async function deleteCategory(categoryTracks) {
  if (!confirm(`Supprimer les ${categoryTracks.length} fichier(s) de cette catégorie ?`)) return
  for (const track of categoryTracks) {
    const audio = audioObjects.get(track.id)
    if (audio) { audio.pause(); audioObjects.delete(track.id) }
    disconnectTrack(track.id)
    playing.value = new Set([...playing.value].filter(id => id !== track.id))
  }
  try {
    await Promise.all(categoryTracks.map(t =>
      fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${t.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${authStore.token}` } })
    ))
  } catch (err) { console.error(err) }
  await loadTracks()
}

async function deleteTrack(track) {
  if (!confirm(`Supprimer "${track.original_name || track.url}" ?`)) return
  const audio = audioObjects.get(track.id)
  if (audio) { audio.pause(); audioObjects.delete(track.id) }
  disconnectTrack(track.id)
  playing.value = new Set([...playing.value].filter(id => id !== track.id))
  try {
    await fetch(
      `${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${track.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${authStore.token}` } }
    )
    await loadTracks()
  } catch (err) { console.error(err) }
}

function startRename(track) {
  renamingId.value = track.id
  renameValue.value = track.original_name || ''
  setTimeout(() => renameInput.value?.focus(), 30)
}

async function commitRename(track) {
  const name = renameValue.value.trim()
  renamingId.value = null
  if (!name || name === track.original_name) return
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${track.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_name: name }),
      }
    )
    if (res.ok) {
      const updated = await res.json()
      tracks.value = tracks.value.map(t => t.id === track.id ? { ...t, original_name: updated.original_name } : t)
    }
  } catch (err) { console.error(err) }
}

async function changeCategory(track, newCat) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${track.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_category: newCat }),
      }
    )
    if (res.ok) {
      tracks.value = tracks.value.map(t => t.id === track.id ? { ...t, audio_category: newCat } : t)
    }
  } catch (err) { console.error(err) }
}

const playingCount = computed(() => playing.value.size)

const reclassifying = ref(false)
const reclassifyProgress = ref(0)   // 0–100
const reclassifyError = ref('')
const RECLASSIFY_CHUNK = 20

async function reclassifyAll() {
  if (!sessionStore.activeSession || tracks.value.length === 0) return
  reclassifying.value = true
  reclassifyProgress.value = 0
  reclassifyError.value = ''

  const allIds = tracks.value.map(t => t.id)
  const total = allIds.length
  let done = 0

  try {
    for (let i = 0; i < allIds.length; i += RECLASSIFY_CHUNK) {
      const chunk = allIds.slice(i, i + RECLASSIFY_CHUNK)
      const res = await fetch(`${BACKEND_URL}/api/uploads/audio/reclassify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionStore.activeSession.id, ids: chunk }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        reclassifyError.value = data.error || 'Erreur de reclassification.'
        break
      }
      const { categories } = await res.json()
      // Update tracks locally without a full reload
      tracks.value = tracks.value.map(t => {
        const newCat = categories[t.original_name]
        return newCat ? { ...t, audio_category: newCat } : t
      })
      done += chunk.length
      reclassifyProgress.value = Math.round((done / total) * 100)
    }
  } catch {
    reclassifyError.value = 'Erreur de connexion.'
  }

  reclassifying.value = false
  reclassifyProgress.value = 0
}

function onAudioPlayRequested({ trackId }) {
  const track = tracks.value.find(t => t.id === trackId)
  if (track && !playing.value.has(track.id)) togglePlay(track)
}

onMounted(() => {
  loadTracks()
  getSocket().on(AUDIO_PLAY_REQUESTED, onAudioPlayRequested)
})
onUnmounted(() => {
  getSocket().off(AUDIO_PLAY_REQUESTED, onAudioPlayRequested)
  for (const [, audio] of audioObjects) { audio.pause() }
  audioObjects.clear()
  gainNodes.clear()
  sourceNodes.clear()
  if (audioCtx) { audioCtx.close(); audioCtx = null; masterLimiter = null }
})
</script>

<template>
  <div class="audio-manager">

    <!-- Barre supérieure : titre + lecture en cours + stop all -->
    <div class="top-bar">
      <h3 class="section-title">
        <AppIcon icon="lucide:music-2" size="0.9em" /> Gestionnaire Audio
      </h3>
      <div class="top-actions">
        <span v-if="playingCount > 0" class="playing-badge">
          <AppIcon icon="lucide:radio" size="0.75em" /> {{ playingCount }} en lecture
        </span>
        <button v-if="playingCount > 0" class="stop-all-btn" @click="stopAll">
          <AppIcon icon="lucide:square" size="0.75em" /> Tout arrêter
        </button>
        <button
          v-if="tracks.length > 0"
          class="delete-all-btn"
          title="Supprimer tous les fichiers audio"
          @click="deleteAll"
        >
          <AppIcon icon="lucide:trash-2" size="0.75em" /> Tout supprimer
        </button>
        <button
          v-if="tracks.length > 0"
          class="reclassify-btn"
          :class="{ loading: reclassifying }"
          :disabled="reclassifying"
          title="Reclassifier tous les fichiers via l'IA"
          @click="reclassifyAll"
        >
          <AppIcon :icon="reclassifying ? 'lucide:loader' : 'lucide:sparkles'" size="0.75em" />
          {{ reclassifying ? `Analyse… ${reclassifyProgress}%` : 'Reclassifier' }}
          <span class="ai-badge">IA</span>
        </button>
      </div>
      <div v-if="reclassifying" class="reclassify-progress">
        <div class="reclassify-fill" :style="{ width: reclassifyProgress + '%' }" />
      </div>
      <p v-if="reclassifyError" class="reclassify-error">{{ reclassifyError }}</p>
    </div>

    <!-- Zone d'upload — clairement séparée du dashboard -->
    <div class="upload-card">
      <label class="upload-btn" :class="{ disabled: uploading || !sessionStore.activeSession }">
        <AppIcon icon="lucide:upload" size="0.8em" />
        {{ uploading ? 'Envoi en cours…' : 'Choisir des fichiers' }}
        <input
          type="file"
          accept=".mp3,.wav,.ogg,.flac,.m4a,.aac,.webm,audio/*"
          multiple
          class="file-input"
          :disabled="uploading || !sessionStore.activeSession"
          @change="handleFileUpload"
        />
      </label>
      <div v-if="uploading" class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
        </div>
        <span class="progress-pct">{{ uploadProgress }}%</span>
      </div>
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <!-- Dashboard : toutes les catégories affichées en groupes -->
    <div v-if="tracks.length === 0" class="empty-state">
      <AppIcon icon="lucide:music-2" size="1.4em" />
      <p>Aucun fichier audio pour cette session.</p>
      <p class="empty-hint">Utilisez le bouton ci-dessus pour en ajouter.</p>
    </div>

    <div v-else class="dashboard">
      <!-- Datalist global pour la saisie de catégorie -->
      <datalist id="audio-cats">
        <option v-for="cat in allCategories" :key="cat" :value="cat" />
      </datalist>
      <div
        v-for="group in tracksByCategory"
        :key="group.key"
        class="category-section"
      >
        <!-- En-tête de catégorie -->
        <div class="cat-header">
          <AppIcon icon="lucide:folder" size="0.8em" class="cat-icon" />
          <span class="cat-label">{{ group.label }}</span>
          <span class="cat-count">{{ group.tracks.length }}</span>
          <div class="cat-header-line" />
          <button
            class="cat-delete-btn"
            :title="`Supprimer les ${group.tracks.length} fichier(s) de « ${group.label} »`"
            @click="deleteCategory(group.tracks)"
          ><AppIcon icon="lucide:trash-2" size="0.7em" /></button>
        </div>

        <!-- Tracks de cette catégorie -->
        <div class="track-list">
          <div
            v-for="track in group.tracks"
            :key="track.id"
            class="track-tile"
            :class="{ playing: playing.has(track.id) }"
          >
            <!-- En-tête : play + nom -->
            <div class="tile-header">
              <button class="play-btn" @click="togglePlay(track)" :title="playing.has(track.id) ? 'Pause' : 'Lecture'">
                <AppIcon :icon="playing.has(track.id) ? 'lucide:pause' : 'lucide:play'" size="0.85em" />
              </button>
              <div v-if="renamingId === track.id" class="rename-row">
                <input
                  ref="renameInput"
                  v-model="renameValue"
                  class="rename-input"
                  @keydown.enter="commitRename(track)"
                  @keydown.escape="renamingId = null"
                  @blur="commitRename(track)"
                />
              </div>
              <div v-else class="track-name" @dblclick="startRename(track)" title="Double-clic pour renommer">
                {{ track.original_name || track.url.split('/').pop() }}
              </div>
            </div>

            <!-- Seek bar -->
            <div class="seek-row">
              <input
                type="range" class="seek-bar"
                :min="0" :max="durations[track.id] || 0"
                :value="currentTimes[track.id] || 0"
                step="0.5"
                @input="seek(track, +$event.target.value)"
              />
              <span class="time-label">{{ formatTime(durations[track.id]) }}</span>
            </div>

            <!-- Volume + actions -->
            <div class="tile-controls">
              <div class="volume-row">
                <AppIcon icon="lucide:volume-2" size="0.65em" class="vol-icon" />
                <input
                  type="range" class="volume-slider"
                  :min="0" :max="1" step="0.05"
                  :value="volumes[track.id] ?? 1"
                  @input="setVolume(track, +$event.target.value)"
                />
              </div>
              <div class="tile-actions">
                <button
                  class="icon-btn" :class="{ active: loops[track.id] }"
                  :title="loops[track.id] ? 'Désactiver boucle' : 'Activer boucle'"
                  @click="toggleLoop(track)"
                ><AppIcon icon="lucide:repeat" size="0.75em" /></button>
                <button class="icon-btn" title="Renommer" @click="startRename(track)">
                  <AppIcon icon="lucide:pencil" size="0.7em" />
                </button>
                <button class="icon-btn danger" title="Supprimer" @click="deleteTrack(track)">
                  <AppIcon icon="lucide:trash-2" size="0.7em" />
                </button>
              </div>
            </div>

            <!-- Catégorie en bas de la tile -->
            <input
              class="cat-input"
              :value="track.audio_category || 'Général'"
              list="audio-cats"
              title="Catégorie (tapez ou choisissez)"
              @change="changeCategory(track, $event.target.value.trim())"
              @keydown.enter="$event.target.blur()"
            />
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.audio-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Barre supérieure ─────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.playing-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 20px;
  color: var(--color-success);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  padding: 0.1rem 0.5rem;
  letter-spacing: 0.05em;
}

.stop-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.65rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 6px;
  color: var(--color-danger);
  font-family: var(--font-heading);
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s;
}
.stop-all-btn:hover { background: var(--surface-danger-soft); }

.delete-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.65rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 6px;
  color: var(--color-danger);
  font-family: var(--font-heading);
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s;
}
.delete-all-btn:hover { background: var(--surface-danger-soft); }

.reclassify-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.65rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s;
}
.reclassify-btn:hover:not(:disabled) { background: var(--surface-gold-soft-strong); color: var(--color-gold-bright); }
.reclassify-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.reclassify-btn.loading :deep(svg) { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.ai-badge {
  font-family: var(--font-heading);
  font-size: 0.5rem;
  letter-spacing: 0.06em;
  font-weight: 700;
  background: var(--color-gold-dark);
  color: var(--color-bg);
  border-radius: 3px;
  padding: 0.05em 0.3em;
  line-height: 1.4;
}

.reclassify-progress {
  width: 100%;
  height: 4px;
  background: var(--surface-track);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.1rem;
}
.reclassify-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  transition: width 0.3s ease;
}

.reclassify-error {
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--color-danger);
  width: 100%;
}

/* ── Upload card ─────────────────────────────────────── */
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

.cat-input {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.35rem;
  cursor: text;
}
.cat-input:focus {
  outline: none;
  border-color: var(--color-gold-dark);
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.8rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.07em;
  cursor: pointer;
  transition: background 0.2s;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }
.upload-btn.disabled { opacity: 0.55; cursor: not-allowed; pointer-events: none; }
.file-input { display: none; }

.upload-error {
  width: 100%;
  color: var(--color-danger);
  font-size: 0.75rem;
  font-family: var(--font-body);
  margin-top: 0.15rem;
}

.progress-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.15rem;
}

.progress-track {
  flex: 1;
  height: 8px;
  background: var(--surface-track);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  transition: width 0.2s ease;
  animation: progress-pulse 1.4s ease-in-out infinite;
}
@keyframes progress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.progress-pct {
  font-family: var(--font-heading);
  font-size: 0.62rem;
  color: var(--color-gold-dark);
  letter-spacing: 0.05em;
  white-space: nowrap;
  min-width: 2.5em;
  text-align: right;
}

/* ── Empty state ─────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 2rem 1rem;
  color: var(--color-text-dim);
  font-family: var(--font-body);
  font-size: 0.85rem;
  text-align: center;
}
.empty-hint { font-size: 0.75rem; opacity: 0.7; }

/* ── Dashboard ───────────────────────────────────────── */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.category-section { display: flex; flex-direction: column; gap: 0.4rem; }

/* En-tête catégorie */
.cat-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.cat-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.cat-label {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  white-space: nowrap;
}
.cat-count {
  font-family: var(--font-heading);
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
.cat-delete-btn:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* ── Track list (grid de tiles) ──────────────────────── */
.track-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
  gap: 0.45rem;
}

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

/* En-tête de tile : play + nom */
.tile-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

/* Bouton play */
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
  font-family: var(--font-heading);
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
  font-family: var(--font-heading);
  font-size: 0.66rem;
  padding: 0.1rem 0.3rem;
  outline: none;
}

/* Seek */
.seek-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.time-label {
  font-family: var(--font-heading);
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

/* Volume + actions */
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
</style>
