<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import { BACKEND_URL } from '@/config.js'
import { sessionStore } from '@/stores/session.js'
import { apiFetch } from '@/utils/apiFetch.js'

// Le serveur accepte 20 fichiers par envoi (routes/uploads.js) : on découpe pour le MJ.
const UPLOAD_CHUNK = 20
const THUMBS_SHOWN = 12

const groups = ref([])
const images = ref([])
const newGroupName = ref('')
const error = ref('')
const dropTarget = ref(null)
const uploadingGroup = ref(null)
const uploadProgress = ref('')
const showUngrouped = ref(false)

const sessionPath = computed(() => `/api/sessions/${sessionStore.activeSession.id}`)
const ungrouped = computed(() => images.value.filter(img => !img.group_id))

function imagesOf(group) {
  return images.value.filter(img => img.group_id === group.id)
}

function thumbUrl(img) {
  const url = img.thumbnail_url || img.url
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`
}

async function load() {
  try {
    const [g, i] = await Promise.all([
      apiFetch(`${sessionPath.value}/image-groups`),
      apiFetch(`${sessionPath.value}/images?type=image`),
    ])
    if (g.ok) groups.value = await g.json()
    if (i.ok) images.value = await i.json()
  } catch (err) { console.error(err) }
}

async function createGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  error.value = ''
  const res = await apiFetch(`${sessionPath.value}/image-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (res.ok) {
    const created = await res.json()
    groups.value = [...groups.value, created].sort((a, b) => a.name.localeCompare(b.name))
    newGroupName.value = ''
  } else {
    error.value = (await res.json().catch(() => ({}))).error || 'Création impossible.'
  }
}

async function setGroup(img, groupId) {
  const previous = img.group_id
  img.group_id = groupId
  const res = await apiFetch(`${sessionPath.value}/images/${img.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_id: groupId }),
  })
  if (!res.ok) {
    img.group_id = previous
    error.value = 'Impossible de déplacer cette image.'
  }
}

async function uploadTo(group, files) {
  const list = files.filter(f => f.type.startsWith('image/'))
  if (!list.length) {
    error.value = 'Seules les images sont acceptées ici.'
    return
  }
  error.value = ''
  uploadingGroup.value = group.id
  try {
    for (let i = 0; i < list.length; i += UPLOAD_CHUNK) {
      uploadProgress.value = `${Math.min(i + UPLOAD_CHUNK, list.length)} / ${list.length}`
      const form = new FormData()
      list.slice(i, i + UPLOAD_CHUNK).forEach(file => form.append('files', file))
      form.append('session_id', sessionStore.activeSession.id)
      form.append('type', 'image')
      form.append('group_id', group.id)
      const res = await apiFetch('/api/uploads', { method: 'POST', body: form })
      if (!res.ok) {
        error.value = (await res.json().catch(() => ({}))).error || 'Envoi impossible.'
        break
      }
    }
    await load()
  } catch (err) {
    console.error(err)
    error.value = 'Envoi impossible.'
  } finally {
    uploadingGroup.value = null
    uploadProgress.value = ''
  }
}

function onDrop(e, group) {
  dropTarget.value = null
  const id = parseInt(e.dataTransfer.getData('application/x-dmt-image'), 10)
  if (id) {
    const img = images.value.find(i => i.id === id)
    if (img) setGroup(img, group.id)
    return
  }
  uploadTo(group, Array.from(e.dataTransfer.files))
}

function onFiles(e, group) {
  uploadTo(group, Array.from(e.target.files || []))
  e.target.value = ''
}

function onThumbDragStart(e, img) {
  e.dataTransfer.setData('application/x-dmt-image', String(img.id))
  e.dataTransfer.effectAllowed = 'move'
}

onMounted(load)
</script>

<template>
  <div class="groups-step">
    <p class="intro">
      Chaque groupe regroupe des images d'ambiance (par terrain, par exemple). En jeu, un bouton en tire une au hasard sur la TV.
      Cette étape est facultative. <HelpTip id="hexcrawl.groups" />
    </p>
    <form class="create" @submit.prevent="createGroup">
      <input v-model="newGroupName" class="form-input" maxlength="100" placeholder="Nom du nouveau groupe, ex. Hex - Plaine" aria-label="Nom du nouveau groupe" data-testid="hexcrawl-new-group" />
      <button type="submit" class="wiz-btn primary" :disabled="!newGroupName.trim()"><AppIcon icon="lucide:plus" size="0.9em" /> Créer</button>
    </form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <p v-if="groups.length === 0" class="empty">Aucun groupe pour l'instant.</p>
    <div class="group-grid">
      <section
        v-for="group in groups"
        :key="group.id"
        class="group-card"
        :class="{ over: dropTarget === group.id }"
        :data-testid="`hexcrawl-group-${group.id}`"
        @dragover.prevent="dropTarget = group.id"
        @dragleave="dropTarget === group.id && !$event.currentTarget.contains($event.relatedTarget) && (dropTarget = null)"
        @drop.prevent.stop="onDrop($event, group)"
      >
        <header>
          <strong>{{ group.name }}</strong>
          <span class="count">{{ imagesOf(group).length }} image{{ imagesOf(group).length > 1 ? 's' : '' }}</span>
        </header>
        <div class="thumbs">
          <div v-for="img in imagesOf(group).slice(0, THUMBS_SHOWN)" :key="img.id" class="thumb" draggable="true" @dragstart="onThumbDragStart($event, img)">
            <img :src="thumbUrl(img)" :alt="img.original_name || ''" />
            <button class="thumb-remove" :title="`Retirer ${img.original_name || 'cette image'} du groupe`" @click="setGroup(img, null)">✕</button>
          </div>
          <span v-if="imagesOf(group).length > THUMBS_SHOWN" class="more">+{{ imagesOf(group).length - THUMBS_SHOWN }}</span>
        </div>
        <label class="drop-hint">
          <template v-if="uploadingGroup === group.id"><AppIcon icon="lucide:loader" size="0.9em" /> Envoi {{ uploadProgress }}…</template>
          <template v-else><AppIcon icon="lucide:upload" size="0.9em" /> Déposez des images ici ou cliquez</template>
          <input type="file" accept="image/*" multiple class="file-input" :disabled="uploadingGroup !== null" @change="onFiles($event, group)" />
        </label>
      </section>
    </div>

    <section v-if="ungrouped.length" class="ungrouped">
      <button class="wiz-btn ghost" :aria-expanded="showUngrouped" @click="showUngrouped = !showUngrouped">
        <AppIcon :icon="showUngrouped ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.9em" />
        {{ ungrouped.length }} image{{ ungrouped.length > 1 ? 's' : '' }} de la session sans groupe
      </button>
      <template v-if="showUngrouped">
        <p class="hint">Glissez-les sur un groupe.</p>
        <div class="thumbs">
          <div v-for="img in ungrouped" :key="img.id" class="thumb" draggable="true" @dragstart="onThumbDragStart($event, img)">
            <img :src="thumbUrl(img)" :alt="img.original_name || ''" />
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.groups-step { display: flex; flex-direction: column; gap: var(--space-3); }
.intro, .hint, .empty { margin: 0; color: var(--color-text-dim); font-size: var(--text-sm); }
.create { display: flex; gap: var(--space-2); max-width: 560px; }
.create input { flex: 1; min-width: 0; }
.error-text { margin: 0; font-size: var(--text-sm); color: var(--color-danger); }
.group-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
.group-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1.5px solid var(--color-border); border-radius: 10px; background: var(--admin-panel-bg, var(--gradient-panel)); transition: border-color var(--dur-fast, 120ms); }
.group-card.over { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.group-card header { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); }
.group-card strong { color: var(--color-text); font-size: var(--text-sm); overflow-wrap: anywhere; }
.count { flex-shrink: 0; color: var(--color-text-dim); font-size: var(--text-xs); }
.thumbs { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.thumb { position: relative; width: 56px; height: 56px; border-radius: 6px; overflow: hidden; cursor: grab; background: var(--color-media-letterbox); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.thumb-remove { position: absolute; top: 1px; right: 1px; width: 18px; height: 18px; padding: 0; border: none; border-radius: 50%; background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 10px; line-height: 1; cursor: pointer; opacity: 0; }
.thumb:hover .thumb-remove, .thumb-remove:focus-visible { opacity: 1; }
.more { color: var(--color-text-dim); font-size: var(--text-xs); padding: 0 var(--space-1); }
.drop-hint { display: flex; align-items: center; justify-content: center; gap: var(--space-1); padding: var(--space-3) var(--space-2); border: 1.5px dashed var(--color-border); border-radius: 8px; color: var(--color-text-dim); font-size: var(--text-sm); cursor: pointer; text-align: center; }
.drop-hint:hover, .drop-hint:focus-within { border-color: var(--color-gold-dark); color: var(--color-text); }
.file-input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.ungrouped { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.wiz-btn { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius: 8px; border: 1px solid var(--color-border); background: var(--surface-raised); color: var(--color-text); font-size: var(--text-sm); cursor: pointer; }
.wiz-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wiz-btn.primary { background: var(--gradient-accent-action); border-color: var(--color-gold-dark); color: var(--color-text-on-accent); }
.wiz-btn.ghost { background: none; }
</style>
