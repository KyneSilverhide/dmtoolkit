<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import { getProfile, saveProfile } from '../utils/playerProfiles.js'
import { saveLastKnownPlayer } from '../utils/playerSessionMemory.js'
import AppIcon from '../components/AppIcon.vue'
import ReleaseNotesBell from '../components/ReleaseNotesBell.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import { JOIN_SESSION, SESSION_JOINED, ERROR } from '../socket-events.js'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'

const router = useRouter()
const route = useRoute()

const sessionCode = ref(route.params.code || '')
const playerName = ref('')
const hp = ref(20)
const ac = ref(10)
const selectedClass = ref('')
const customClass = ref('')
const isCustomClass = computed(() => selectedClass.value === '__custom__')
const dndClass = computed(() => isCustomClass.value ? customClass.value.trim() : selectedClass.value)
const avatarFile = ref(null)
const avatarPreview = ref(null)
const error = ref('')
const loading = ref(false)

const theme = ref(getThemePreference('player', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  setThemePreference('player', theme.value)
  applyTheme(theme.value)
}

import { BACKEND_URL } from '@/config.js'

const DND_CLASSES = [
  'Barbare', 'Barde', 'Clerc', 'Druide', 'Guerrier',
  'Moine', 'Paladin', 'Rôdeur', 'Roublard',
  'Ensorceleur', 'Occultiste', 'Magicien',
]

// Pending socket handlers — saved so onUnmounted can remove them if the user
// navigates away before the join completes (avoids stale callbacks).
let _pendingJoinedHandler = null
let _pendingErrorHandler = null

onMounted(() => {
  releaseNotesStore.load()
  if (sessionStore.activeSession && sessionStore.playerInfo) {
    const code = sessionStore.activeSession.code
    router.replace(code ? `/view/${code}` : '/player')
  }
})

onUnmounted(() => {
  const socket = getSocket()
  if (_pendingJoinedHandler) {
    socket.off(SESSION_JOINED, _pendingJoinedHandler)
    _pendingJoinedHandler = null
  }
  if (_pendingErrorHandler) {
    socket.off(ERROR, _pendingErrorHandler)
    _pendingErrorHandler = null
  }
  loading.value = false
})

// Auto-fill from localStorage when playerName changes
watch(playerName, (name, prevName) => {
  const profile = getProfile(name)
  if (profile) {
    if (profile.dndClass) {
      if (DND_CLASSES.includes(profile.dndClass)) {
        selectedClass.value = profile.dndClass
        customClass.value = ''
      } else {
        selectedClass.value = '__custom__'
        customClass.value = profile.dndClass
      }
    }
    if (profile.avatarUrl) avatarPreview.value = profile.avatarUrl
    if (profile.hp != null) hp.value = profile.hp
    if (profile.ac != null) ac.value = profile.ac
  } else if (getProfile(prevName)) {
    // Leaving a profile-loaded name → reset to defaults
    selectedClass.value = ''
    customClass.value = ''
    avatarPreview.value = null
    avatarFile.value = null
    hp.value = 20
    ac.value = 10
  }
})

function onAvatarChange(event) {
  const file = event.target.files[0]
  if (!file) return
  avatarFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => { avatarPreview.value = e.target.result }
  reader.readAsDataURL(file)
}

async function uploadAvatar() {
  if (!avatarFile.value) return null
  const formData = new FormData()
  if (sessionCode.value) formData.append('sessionCode', sessionCode.value)
  formData.append('file', avatarFile.value)
  try {
    const res = await fetch(`${BACKEND_URL}/api/uploads/avatar`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.url || null
  } catch {
    return null
  }
}

async function joinSession() {
  if (!sessionCode.value || !playerName.value) {
    error.value = 'Veuillez remplir tous les champs.'
    return
  }
  loading.value = true
  error.value = ''

  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionCode.value}`)
    if (!res.ok) {
      error.value = 'Session introuvable ou fermée.'
      loading.value = false
      return
    }

    // Upload avatar if a new file was selected
    let avatarUrl = null
    if (avatarFile.value) {
      avatarUrl = await uploadAvatar()
    } else if (avatarPreview.value && avatarPreview.value.startsWith('/uploads/')) {
      // Re-use previously stored server URL
      avatarUrl = avatarPreview.value
    }

    const socket = getSocket()

    _pendingJoinedHandler = (data) => {
      _pendingJoinedHandler = null
      _pendingErrorHandler = null
      loading.value = false
      // Persist profile to localStorage
      saveProfile(playerName.value, {
        dndClass: dndClass.value,
        avatarUrl: data.player.avatar_url || avatarUrl,
        hp: data.player.max_hp,
        ac: data.player.ac,
      })

      sessionStore.setActiveSession(data.session)
        sessionStore.playerInfo = {
          id: data.player.id,
          name: data.player.player_name,
          ac: data.player.ac,
          hp: data.player.current_hp,
          maxHp: data.player.max_hp,
          initiative: data.player.initiative,
          dndClass: data.player.dnd_class,
          avatarUrl: data.player.avatar_url,
        }
      sessionStore.activeMerchant = data.activeMerchant || null
      saveLastKnownPlayer(data.session.code, {
        name: data.player.player_name,
        ac: data.player.ac,
        hp: data.player.current_hp,
        maxHp: data.player.max_hp,
        dndClass: data.player.dnd_class,
        avatarUrl: data.player.avatar_url,
      })
      router.push(`/view/${data.session.code}`)
    }

    _pendingErrorHandler = (err) => {
      _pendingJoinedHandler = null
      _pendingErrorHandler = null
      error.value = err.message || 'Erreur lors de la connexion.'
      loading.value = false
    }

    socket.once(SESSION_JOINED, _pendingJoinedHandler)
    socket.once(ERROR, _pendingErrorHandler)

    socket.emit(JOIN_SESSION, {
      code: sessionCode.value,
      playerName: playerName.value,
      ac: ac.value,
      hp: hp.value,
      dndClass: dndClass.value || null,
      avatarUrl,
    })
  } catch {
    error.value = 'Erreur de connexion au serveur.'
    loading.value = false
  }
}
</script>

<template>
  <div class="join-wrapper">
    <header class="join-header">
      <button class="back-btn" @click="router.push('/')">← Retour</button>
      <h1 class="page-title">Rejoindre <span class="title-accent">une Session</span></h1>
      <button class="theme-toggle-btn" @click="toggleTheme">
        <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.9em" />
        {{ isLightTheme ? 'Sombre' : 'Clair' }}
      </button>
    </header>

    <main class="join-main">
      <form class="join-form" @submit.prevent="joinSession" data-testid="join-form">

        <div class="form-group">
          <label class="form-label">Code de session</label>
          <input v-model="sessionCode" type="text" inputmode="numeric" pattern="[0-9]*" class="form-input"
            placeholder="Code à 4 chiffres" data-testid="session-code-input" />
          <p class="form-hint">Fourni par votre MJ ou via le QR Code.</p>
          <p v-if="sessionCode === '0000'" class="form-hint demo-hint">
            🎲 Ce code correspond à la session de démonstration — le contenu est effacé chaque nuit à minuit.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Nom du personnage</label>
          <input v-model="playerName" type="text" class="form-input" placeholder="Gandalf le Gris" data-testid="player-name-input" />
        </div>

        <div class="form-group">
          <label class="form-label">
            <AppIcon icon="game-icons:wizard-staff" size="0.9rem" /> Classe
          </label>
          <select v-model="selectedClass" class="form-input form-select" data-testid="class-select">
            <option value="">— Choisir une classe —</option>
            <option v-for="cls in DND_CLASSES" :key="cls" :value="cls">{{ cls }}</option>
            <option value="__custom__">Autre (saisie libre)…</option>
          </select>
          <input
            v-if="isCustomClass"
            v-model="customClass"
            type="text"
            class="form-input"
            placeholder="Nom de votre classe…"
            data-testid="class-custom-input"
            autocomplete="off"
          />
        </div>

        <div class="form-group">
          <label class="form-label">
            <AppIcon icon="lucide:image" size="0.9rem" /> Avatar du personnage
          </label>
          <div class="avatar-upload-row">
            <div v-if="avatarPreview" class="avatar-preview-wrap">
              <img
                :src="avatarPreview.startsWith('/uploads/') ? BACKEND_URL + avatarPreview : avatarPreview"
                alt="Aperçu avatar"
                class="avatar-preview"
              />
            </div>
            <div v-else class="avatar-placeholder">
              <AppIcon icon="lucide:user" size="1.6rem" color="var(--color-border)" />
            </div>
            <label class="avatar-upload-btn">
              {{ avatarPreview ? 'Changer' : 'Choisir une image' }}
              <input type="file" accept="image/*" class="avatar-input-hidden" @change="onAvatarChange" />
            </label>
          </div>
          <p class="form-hint">JPG, PNG ou GIF · max 2 Mo</p>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              <AppIcon icon="game-icons:hearts" size="0.9rem" color="var(--color-danger)" /> Points de Vie (HP)
            </label>
            <input v-model.number="hp" type="number" min="1" max="999" class="form-input stat-input" data-testid="hp-input" />
          </div>
          <div class="form-group">
            <label class="form-label">
              <AppIcon icon="game-icons:shield" size="0.9rem" color="var(--color-gold-bright)" /> Armure (CA)
            </label>
            <input v-model.number="ac" type="number" min="1" max="30" class="form-input stat-input" data-testid="ac-input" />
          </div>
        </div>

        <ReleaseNotesBell variant="banner" role="player" />

        <p v-if="error" class="form-error" data-testid="join-error">{{ error }}</p>

        <button type="submit" class="submit-btn" :disabled="loading" data-testid="join-button">
          <AppIcon v-if="!loading" icon="game-icons:crossed-swords" size="1em" />
          {{ loading ? 'Connexion...' : 'Rejoindre la session' }}
        </button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.join-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 540px;
  margin: 0 auto;
}

@media (min-width: 1024px) {
  .join-wrapper {
    max-width: 560px;
  }
  .join-header {
    padding: 2.5rem 2rem 1.5rem;
  }
  .join-main {
    padding: 2rem 2rem;
  }
}

.join-header {
  text-align: center;
  padding: 2rem 1.5rem 1.5rem;
  position: relative;
}

.back-btn {
  position: absolute;
  left: 1rem;
  top: 1.5rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  cursor: pointer;
}
.back-btn:hover { color: var(--color-gold); }

.theme-toggle-btn {
  position: absolute;
  top: 1.5rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.theme-toggle-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }


.page-title {
  font-family: var(--font-title), sans-serif;
  font-size: 1.8rem;
  color: var(--color-parchment);
  margin-top: 0.5rem;
}
.title-accent { color: var(--color-gold-bright); }

.join-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.join-form {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}
.stat-input { text-align: center; font-size: 1.3rem; font-weight: 700; padding: 0.75rem 0.5rem; }
.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b5a3a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.9rem center;
  padding-right: 2.5rem;
}
.form-select option { background: var(--color-surface); color: var(--color-parchment); }
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-text-dim); font-style: italic; }

.form-hint {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
}

/* Avatar upload */
.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.avatar-preview-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-gold-dark);
  flex-shrink: 0;
}
.avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-raised);
  border: 2px dashed var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  flex-shrink: 0;
}
.avatar-upload-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.avatar-upload-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold); }
.avatar-input-hidden { display: none; }

.form-error {
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  text-align: center;
}

.submit-btn {
  padding: 1rem;
  background: var(--gradient-success-action);
  border: 1px solid var(--color-success-border);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
}
.submit-btn:hover:not(:disabled) {
  background: var(--gradient-success-action-hover);
  box-shadow: var(--shadow-soft);
}
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.demo-hint {
  color: #f59e0b;
  font-style: italic;
}
</style>
