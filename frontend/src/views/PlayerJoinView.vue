<script setup>
import { ref, reactive, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import { getProfile, saveProfile } from '../utils/playerProfiles.js'
import { saveLastKnownPlayer } from '../utils/playerSessionMemory.js'
import AppIcon from '../components/AppIcon.vue'
import ReleaseNotesBell from '../components/ReleaseNotesBell.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import { JOIN_SESSION, SESSION_JOINED, ERROR } from '../socket-events.js'
import { applyTheme, getThemePreference, setThemePreference, getNextTheme, getThemeMeta } from '../utils/themePreferences.js'

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

// Sous-classe : uniquement proposée quand la classe choisie est une classe connue avec
// des sous-classes ; laissée vide si sans objet, ou saisie libre via « Autre ».
const selectedSubclass = ref('')
const customSubclass = ref('')
const isCustomSubclass = computed(() => selectedSubclass.value === '__custom__')
const subclass = computed(() => isCustomSubclass.value ? customSubclass.value.trim() : selectedSubclass.value)
const selectedClassSubclasses = computed(() => {
  if (isCustomClass.value || !selectedClass.value) return []
  return classesList.value.find(c => c.name === selectedClass.value)?.subclasses || []
})
// Le pré-remplissage depuis le profil stocké (voir watch(playerName) plus bas) modifie
// selectedClass puis selectedSubclass dans le même tick — sans ce garde-fou, ce watcher
// (déclenché de façon asynchrone par le changement de selectedClass) efface la sous-classe
// qui vient d'être restaurée. Ne doit réinitialiser la sous-classe que sur un changement de
// classe VOULU PAR L'UTILISATEUR (sélection manuelle dans le menu déroulant).
let suppressSubclassReset = false
watch(selectedClass, () => {
  if (suppressSubclassReset) { suppressSubclassReset = false; return }
  selectedSubclass.value = ''
  customSubclass.value = ''
})

const selectedRace = ref('')
const customRace = ref('')
const isCustomRace = computed(() => selectedRace.value === '__custom__')
const race = computed(() => isCustomRace.value ? customRace.value.trim() : selectedRace.value)

const avatarFile = ref(null)
const avatarPreview = ref(null)
const loading = ref(false)

// Erreurs affichées au plus près du champ concerné (au lieu d'un message générique en bas
// de formulaire) — sessionCode/playerName sont les deux seuls champs pouvant échouer côté
// serveur (voir errorField dans le handler ERROR plus bas). generalError couvre le reste
// (perte de connexion, erreur inattendue) et reste affiché près du bouton d'envoi.
const fieldErrors = reactive({ sessionCode: '', playerName: '' })
const generalError = ref('')
const sessionCodeInputRef = ref(null)
const playerNameInputRef = ref(null)

watch(sessionCode, () => { fieldErrors.sessionCode = '' })
watch(playerName, () => { fieldErrors.playerName = '' })

function focusField(field) {
  nextTick(() => {
    if (field === 'sessionCode') sessionCodeInputRef.value?.focus()
    else if (field === 'playerName') playerNameInputRef.value?.focus()
  })
}

// Validation locale avant tout appel réseau : couvre les cas que le serveur ne peut pas
// détecter lui-même (champ vide, format du code) pour donner un retour immédiat.
function validateForm() {
  fieldErrors.sessionCode = ''
  fieldErrors.playerName = ''
  let firstInvalid = ''
  if (!sessionCode.value.trim()) {
    fieldErrors.sessionCode = 'Veuillez indiquer le code de session.'
    firstInvalid ||= 'sessionCode'
  } else if (!/^\d{4}$/.test(sessionCode.value.trim())) {
    fieldErrors.sessionCode = 'Le code de session doit contenir 4 chiffres.'
    firstInvalid ||= 'sessionCode'
  }
  if (!playerName.value.trim()) {
    fieldErrors.playerName = 'Veuillez indiquer le nom de votre personnage.'
    firstInvalid ||= 'playerName'
  }
  if (firstInvalid) focusField(firstInvalid)
  return !firstInvalid
}

const theme = ref(getThemePreference('player', 'dark'))
const currentThemeMeta = computed(() => getThemeMeta(theme.value))

function toggleTheme() {
  theme.value = getNextTheme(theme.value)
  setThemePreference('player', theme.value)
  applyTheme(theme.value)
}

import { BACKEND_URL } from '@/config.js'

// Listes de classes/races chargées depuis le contenu (public, sans auth — voir
// GET /api/classes/public et /api/races/public) pour peupler les selects, avec repli sur
// une saisie libre (voir isCustomClass/isCustomRace) si l'API est indisponible.
const classesList = ref([])
const racesList = ref([])

// Pending socket handlers — saved so onUnmounted can remove them if the user
// navigates away before the join completes (avoids stale callbacks).
let _pendingJoinedHandler = null
let _pendingErrorHandler = null

onMounted(async () => {
  releaseNotesStore.load()
  if (sessionStore.activeSession && sessionStore.playerInfo) {
    const code = sessionStore.activeSession.code
    router.replace(code ? `/view/${code}` : '/player')
    return
  }
  try {
    const [classesRes, racesRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/classes/public`),
      fetch(`${BACKEND_URL}/api/races/public`),
    ])
    if (classesRes.ok) {
      const data = await classesRes.json()
      for (const dndClass of data) {
        if (dndClass.subclasses?.length) dndClass.subclasses.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      }
      classesList.value = data.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }
    if (racesRes.ok) {
      const data = await racesRes.json()
      racesList.value = data.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }
  } catch {
    // Selects restent vides ; l'utilisateur peut toujours saisir une classe/race libre.
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
      const knownClass = classesList.value.find(c => c.name === profile.dndClass)
      if (knownClass) {
        suppressSubclassReset = true
        // Filet de sécurité : si selectedClass.value avait déjà cette valeur (ex: profil
        // relu sans changement réel), le watcher ci-dessus ne se déclenche jamais et ne
        // remet donc jamais le drapeau à false — ce qui supprimerait à tort le prochain
        // changement de classe VOULU par l'utilisateur.
        nextTick(() => { suppressSubclassReset = false })
        selectedClass.value = profile.dndClass
        customClass.value = ''
        if (profile.subclass) {
          const knownSubclass = knownClass.subclasses.some(sc => sc.name === profile.subclass)
          selectedSubclass.value = knownSubclass ? profile.subclass : '__custom__'
          customSubclass.value = knownSubclass ? '' : profile.subclass
        }
      } else {
        selectedClass.value = '__custom__'
        customClass.value = profile.dndClass
      }
    }
    if (profile.race) {
      if (racesList.value.some(r => r.name === profile.race)) {
        selectedRace.value = profile.race
        customRace.value = ''
      } else {
        selectedRace.value = '__custom__'
        customRace.value = profile.race
      }
    }
    if (profile.avatarUrl) avatarPreview.value = profile.avatarUrl
    if (profile.hp != null) hp.value = profile.hp
    if (profile.ac != null) ac.value = profile.ac
  } else if (getProfile(prevName)) {
    // Leaving a profile-loaded name → reset to defaults
    selectedClass.value = ''
    customClass.value = ''
    selectedSubclass.value = ''
    customSubclass.value = ''
    selectedRace.value = ''
    customRace.value = ''
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
  generalError.value = ''
  if (!validateForm()) return
  loading.value = true

  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionCode.value.trim()}`)
    if (!res.ok) {
      fieldErrors.sessionCode = 'Session introuvable ou fermée.'
      loading.value = false
      focusField('sessionCode')
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
        subclass: subclass.value,
        race: race.value,
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
          subclass: data.player.subclass,
          race: data.player.race,
          avatarUrl: data.player.avatar_url,
        }
      sessionStore.activeMerchant = data.activeMerchant || null
      saveLastKnownPlayer(data.session.code, {
        name: data.player.player_name,
        ac: data.player.ac,
        hp: data.player.current_hp,
        maxHp: data.player.max_hp,
        dndClass: data.player.dnd_class,
        subclass: data.player.subclass,
        race: data.player.race,
        avatarUrl: data.player.avatar_url,
      })
      router.push(`/view/${data.session.code}`)
    }

    _pendingErrorHandler = (err) => {
      _pendingJoinedHandler = null
      _pendingErrorHandler = null
      loading.value = false
      const message = err.message || 'Erreur lors de la connexion.'
      if (err.field === 'sessionCode' || err.field === 'playerName') {
        fieldErrors[err.field] = message
        focusField(err.field)
      } else {
        generalError.value = message
      }
    }

    socket.once(SESSION_JOINED, _pendingJoinedHandler)
    socket.once(ERROR, _pendingErrorHandler)

    socket.emit(JOIN_SESSION, {
      code: sessionCode.value,
      playerName: playerName.value,
      ac: ac.value,
      hp: hp.value,
      dndClass: dndClass.value || null,
      subclass: subclass.value || null,
      race: race.value || null,
      avatarUrl,
    })
  } catch {
    generalError.value = 'Erreur de connexion au serveur.'
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
        <AppIcon :icon="currentThemeMeta.icon" size="0.9em" />
        {{ currentThemeMeta.label }}
      </button>
    </header>

    <main class="join-main">
      <form class="join-form" @submit.prevent="joinSession" data-testid="join-form">

        <div class="form-group">
          <label class="form-label">Code de session</label>
          <input
            ref="sessionCodeInputRef"
            v-model="sessionCode"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            class="form-input"
            :class="{ 'has-error': fieldErrors.sessionCode }"
            :aria-invalid="!!fieldErrors.sessionCode"
            placeholder="Code à 4 chiffres"
            data-testid="session-code-input"
          />
          <Transition name="error-fade">
            <p v-if="fieldErrors.sessionCode" class="field-error" role="alert" data-testid="session-code-error">
              <AppIcon icon="lucide:alert-circle" size="0.85em" /> {{ fieldErrors.sessionCode }}
            </p>
          </Transition>
          <p class="form-hint">Fourni par votre MJ ou via le QR Code.</p>
          <p v-if="sessionCode === '0000'" class="form-hint demo-hint">
            🎲 Ce code correspond à la session de démonstration — le contenu est effacé chaque nuit à minuit.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Nom du personnage</label>
          <input
            ref="playerNameInputRef"
            v-model="playerName"
            type="text"
            class="form-input"
            :class="{ 'has-error': fieldErrors.playerName }"
            :aria-invalid="!!fieldErrors.playerName"
            placeholder="Gandalf le Gris"
            data-testid="player-name-input"
          />
          <Transition name="error-fade">
            <p v-if="fieldErrors.playerName" class="field-error" role="alert" data-testid="player-name-error">
              <AppIcon icon="lucide:alert-circle" size="0.85em" /> {{ fieldErrors.playerName }}
            </p>
          </Transition>
        </div>

        <div class="form-group">
          <label class="form-label">
            <AppIcon icon="game-icons:wizard-staff" size="0.9rem" /> Classe
          </label>
          <select v-model="selectedClass" class="form-input form-select" data-testid="class-select">
            <option value="">— Choisir une classe —</option>
            <option v-for="cls in classesList" :key="cls.slug" :value="cls.name">{{ cls.name }}</option>
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

        <div v-if="selectedClassSubclasses.length > 0" class="form-group">
          <label class="form-label">
            <AppIcon icon="game-icons:round-shield" size="0.9rem" /> Sous-classe
          </label>
          <select v-model="selectedSubclass" class="form-input form-select" data-testid="subclass-select">
            <option value="">— Aucune / pas encore —</option>
            <option v-for="sc in selectedClassSubclasses" :key="sc.name" :value="sc.name">{{ sc.name }}</option>
            <option value="__custom__">Autre (saisie libre)…</option>
          </select>
          <input
            v-if="isCustomSubclass"
            v-model="customSubclass"
            type="text"
            class="form-input"
            placeholder="Nom de votre sous-classe…"
            data-testid="subclass-custom-input"
            autocomplete="off"
          />
        </div>

        <div class="form-group">
          <label class="form-label">
            <AppIcon icon="game-icons:vitruvian-man" size="0.9rem" /> Race
          </label>
          <select v-model="selectedRace" class="form-input form-select" data-testid="race-select">
            <option value="">— Choisir une race —</option>
            <option v-for="r in racesList" :key="r.slug" :value="r.name">{{ r.name }}</option>
            <option value="__custom__">Autre (saisie libre)…</option>
          </select>
          <input
            v-if="isCustomRace"
            v-model="customRace"
            type="text"
            class="form-input"
            placeholder="Nom de votre race…"
            data-testid="race-custom-input"
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

        <Transition name="error-fade">
          <p v-if="generalError" class="form-error" role="alert" data-testid="join-error">
            <AppIcon icon="lucide:alert-circle" size="0.9em" /> {{ generalError }}
          </p>
        </Transition>

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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  margin: 0;
}

/* !important nécessaire : la règle globale .form-input (style.css) force border-color
   avec !important pour la cohérence du thème — voir la même contrainte au-dessus. */
.form-input.has-error {
  border-color: var(--color-danger) !important;
}

.field-error {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  margin: 0;
}

/* noinspection CssUnusedSymbol */
.error-fade-enter-active, .error-fade-leave-active { transition: all 0.2s ease; }
/* noinspection CssUnusedSymbol */
.error-fade-enter-from, .error-fade-leave-to { opacity: 0; transform: translateY(-4px); }

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
  color: var(--color-demo-accent);
  font-style: italic;
}
</style>
