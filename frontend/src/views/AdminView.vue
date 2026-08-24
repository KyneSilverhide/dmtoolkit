<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'
import { sessionStore } from '../stores/session.js'
import { getSocket, resetSocket } from '../socket.js'
import { apiFetch } from '../utils/apiFetch.js'
import PlayerList from '../components/admin/PlayerList.vue'
import MessageTool from '../components/admin/MessageTool.vue'
import CriticalFailTool from '../components/admin/CriticalFailTool.vue'
import SessionJournal from '../components/admin/SessionJournal.vue'
import TvControls from '../components/admin/TvControls.vue'
import VoteManager from '../components/admin/VoteManager.vue'
import ImageManager from '../components/admin/ImageManager.vue'
import VideoManager from '../components/admin/VideoManager.vue'
import AudioManager from '../components/admin/AudioManager.vue'
import MerchantManager from '../components/admin/MerchantManager.vue'
import PuzzleManager from '../components/admin/PuzzleManager.vue'
import ReputationManager from '../components/admin/ReputationManager.vue'
import SpellSearch from '../components/admin/SpellSearch.vue'
import ItemSearch from '../components/admin/ItemSearch.vue'
import RaceSearch from '../components/admin/RaceSearch.vue'
import ClassSearch from '../components/admin/ClassSearch.vue'
import BackgroundSearch from '../components/admin/BackgroundSearch.vue'
import AbilitySearch from '../components/admin/AbilitySearch.vue'
import ServiceSearch from '../components/admin/ServiceSearch.vue'
import ConditionSearch from '../components/admin/ConditionSearch.vue'
import CommandPalette from '../components/admin/CommandPalette.vue'
import MapManager from '../components/admin/MapManager.vue'
import GoldDividerTool from '../components/admin/GoldDividerTool.vue'
import GeneratorTool from '../components/admin/GeneratorTool.vue'
import AppIcon from '../components/AppIcon.vue'
import AdminHeader from '../components/admin/AdminHeader.vue'
import AdminNavSidebar from '../components/admin/AdminNavSidebar.vue'
import AdminSceneBar from '../components/admin/AdminSceneBar.vue'
import PlayerRollToasts from '../components/admin/PlayerRollToasts.vue'
import AdminAccountsManager from '../components/admin/AdminAccountsManager.vue'
import AdminForcePasswordModal from '../components/admin/AdminForcePasswordModal.vue'
import {
  applyTheme, getThemePreference, setThemePreference,
  applyDensity, getDensityPreference, setDensityPreference,
} from '../utils/themePreferences.js'
import { adminTabRoute } from '../utils/adminRoute.js'
import DemoBanner from '../components/DemoBanner.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import {
  PLAYER_JOINED, PLAYER_LEFT, PLAYERS_SNAPSHOT, HP_UPDATED,
  CONDITIONS_UPDATED, CONCENTRATION_UPDATED, INITIATIVE_UPDATED,
  ADMIN_STATE, TV_MODE_CHANGED, VOTE_STARTED, VOTE_CLOSED,
  MAP_STATE, MERCHANT_ITEMS_UPDATED, DOOM_CLOCK_STARTED, DOOM_CLOCK_STOPPED,
  TENSION_SCALE_UPDATED, TENSION_SCALE_ENDED, TIME_SCALE_UPDATED, TIME_SCALE_ENDED,
  PLAYER_ROLL_RESULT, DEMO_RESET, ROUND_UPDATED,
  ADMIN_JOIN, SET_TV_MODE, FACTIONS_UPDATED, PUZZLE_CLOSED,
} from '../socket-events.js'

const router = useRouter()
const route = useRoute()
import { BACKEND_URL } from '@/config.js'
// __APP_VERSION__ is injected at build time by Vite from frontend/package.json
const appVersion = __APP_VERSION__
const generatorEnabled = ref(true) // optimistic default — updated by loadConfig()

const isSessionPanelCollapsed = ref(false)
const tvMode = ref('lobby')
const theme = ref(getThemePreference('admin', 'dark'))
const density = ref(getDensityPreference('admin', 'compact'))
const isNavCollapsed = ref(false)
const isPaletteOpen = ref(false)

// ── Tab → component mapping (for <KeepAlive>) ───────────────────────────
const tabComponents = {
  players: PlayerList,
  message: MessageTool,
  dice: CriticalFailTool,
  journal: SessionJournal,
  tension: TvControls,
  vote: VoteManager,
  images: ImageManager,
  videos: VideoManager,
  audio: AudioManager,
  map: MapManager,
  merchants: MerchantManager,
  puzzle: PuzzleManager,
  reputation: ReputationManager,
  tresor: GoldDividerTool,
  spells: SpellSearch,
  equipment: ItemSearch,
  magic: ItemSearch,
  races: RaceSearch,
  classes: ClassSearch,
  backgrounds: BackgroundSearch,
  abilities: AbilitySearch,
  services: ServiceSearch,
  conditions: ConditionSearch,
  generator: GeneratorTool,
  admins: AdminAccountsManager,
}
// Onglet actif piloté par l'URL (/admin/:tab). Un segment inconnu retombe
// silencieusement sur 'players' plutôt que de rediriger.
const activeTab = computed(() => (
  route.params.tab && tabComponents[route.params.tab] ? route.params.tab : 'players'
))
const currentTabComponent = computed(() => tabComponents[activeTab.value] || null)

function goToTab(key) {
  router.push(adminTabRoute(key))
}

const hasActiveVote = ref(false)
const hasActiveImage = ref(false)
const hasActiveVideo = ref(false)
const hasActiveMerchant = ref(false)
const hasActiveDoom = ref(false)
const hasActiveTension = ref(false)
const hasActiveTimeScale = ref(false)
const hasActiveMap = ref(false)
const activePuzzle = ref(null)
const hasActiveReputation = ref(false)
// Objet complet `{ contentType, contentData }` (et non un simple booléen) : la barre de
// scène affiche le nom de la fiche projetée et son type, « Contenu » seul étant trop vague
// quand n'importe quel sort/objet/race peut être à l'écran.
const activeContent = ref(null)
const hasActiveContent = computed(() => !!activeContent.value)
const combatRound = ref(0)

// Onglets verrouillés (grisés + tooltip). Map { [tabKey]: { title, text } }.
const lockedTabs = computed(() => {
  const locked = {}
  if (!generatorEnabled.value) {
    locked.generator = {
      title: 'Générateur IA non activé',
      text: 'Configurez <code>GITHUB_TOKEN</code> dans le <code>.env</code> backend',
    }
  }
  if (authStore.admin?.is_demo) {
    locked.videos = {
      title: 'Indisponible en mode démo',
      text: 'L\'upload de vidéos n\'est pas disponible sur le compte de démonstration.',
    }
    for (const tabKey of CONTENT_TABS) {
      locked[tabKey] = {
        title: 'Contenu masqué en mode démo',
        text: 'Le contenu de référence D&amp;D (sorts, objets, races, classes...) n\'est pas accessible sur le compte de démonstration.',
      }
    }
  }
  return locked
})

// La pastille signifie « diffusé sur la TV en ce moment », pas « du contenu existe ».
// `hasActiveMap` / `hasActiveReputation` restent des indicateurs de « prêt à diffuser »
// (utilisés par `tvModes[].ready` ci-dessous : une carte déjà chargée, des factions déjà
// créées, restent sélectionnables depuis le sélecteur générique même après avoir quitté ce
// mode) — une carte ou des réputations, une fois créées, ne « ferment » jamais au sens où
// un vote ou un marchand se ferment. `hasActiveMerchant`, lui, reflète déjà « diffusé
// maintenant » (le serveur ne le pose que si `tv_mode === 'merchant'`, cf. handleTvModeChanged)
// donc sert directement ici sans dérivation supplémentaire.
const tabActivity = computed(() => ({
  vote: hasActiveVote.value,
  images: hasActiveImage.value,
  videos: hasActiveVideo.value,
  merchants: hasActiveMerchant.value,
  tension: hasActiveDoom.value || hasActiveTension.value || hasActiveTimeScale.value,
  map: tvMode.value === 'map',
  puzzle: !!activePuzzle.value,
  reputation: tvMode.value === 'reputation',
}))

// Keeps the socket instance used in onMounted so onUnmounted can clean up
// safely even after resetSocket() was called (e.g. on logout before unmount).
let _socket = null

// ── Player roll toasts ───────────────────────────────────────────────────
const playerRollToasts = ref([])
let playerRollToastId = 0
const toastTimers = new Map()

function scheduleToastDismiss(id, delay) {
  const timerId = setTimeout(() => {
    dismissPlayerRollToast(id)
    toastTimers.delete(id)
  }, delay)
  toastTimers.set(id, timerId)
}

function pushPlayerRollToast(payload) {
  const id = ++playerRollToastId
  playerRollToasts.value = [...playerRollToasts.value, { id, ...payload }]
  scheduleToastDismiss(id, 6000)
}

function dismissPlayerRollToast(id) {
  const timerId = toastTimers.get(id)
  if (timerId) clearTimeout(timerId)
  playerRollToasts.value = playerRollToasts.value.filter(t => t.id !== id)
  toastTimers.delete(id)
}

function pauseToast(id) {
  const timerId = toastTimers.get(id)
  if (timerId) {
    clearTimeout(timerId)
    toastTimers.delete(id)
  }
}

function resumeToast(id) {
  if (!playerRollToasts.value.find(t => t.id === id)) return
  scheduleToastDismiss(id, 3000)
}

// ── Tab / nav definitions ────────────────────────────────────────────────
const tabs = [
  { key: 'players',    label: 'Joueurs',      icon: 'game-icons:wizard-staff' },
  { key: 'message',   label: 'Messages',      icon: 'lucide:mail' },
  { key: 'dice',      label: 'Critical Fail', icon: 'game-icons:dice-six-faces-five' },
  { key: 'journal',   label: 'Journal',       icon: 'game-icons:scroll-unfurled' },
  { key: 'tension',   label: 'Rythme',        icon: 'lucide:timer' },
  { key: 'vote',      label: 'Vote',          icon: 'lucide:check-square' },
  { key: 'images',    label: 'Images',        icon: 'lucide:image' },
  { key: 'videos',    label: 'Vidéos',        icon: 'lucide:video' },
  { key: 'audio',     label: 'Audio',         icon: 'lucide:music-2' },
  { key: 'map',       label: 'Carte',         icon: 'lucide:map' },
  { key: 'merchants', label: 'Marchands',     icon: 'game-icons:shop' },
  { key: 'puzzle',    label: 'Puzzles',       icon: 'lucide:puzzle' },
  { key: 'reputation',label: 'Réputations',   icon: 'lucide:shield' },
  { key: 'tresor',    label: 'Trésor',        icon: 'game-icons:coins' },
  { key: 'spells',    label: 'Sorts',         icon: 'lucide:sparkles' },
  { key: 'equipment', label: 'Objets',        icon: 'lucide:package' },
  { key: 'magic',     label: 'Objets magiques', icon: 'lucide:gem' },
  { key: 'races',     label: 'Races',         icon: 'game-icons:vitruvian-man' },
  { key: 'classes',   label: 'Classes',       icon: 'game-icons:round-shield' },
  { key: 'backgrounds', label: 'Origines',    icon: 'game-icons:quill-ink' },
  { key: 'abilities', label: 'Aptitudes',     icon: 'lucide:zap' },
  { key: 'services',  label: 'Services',      icon: 'lucide:hand-coins' },
  { key: 'conditions', label: 'États',        icon: 'lucide:skull' },
  { key: 'generator', label: 'Générateur',    icon: 'lucide:wand-2' },
  { key: 'admins',    label: 'Admins',        icon: 'lucide:user-cog' },
]

// Onglets « Contenu » : fiches de référence D&D 5e statiques, indépendantes de toute
// session (ne lisent ni n'écrivent aucun état de session) — accessibles même sans
// session active, contrairement aux autres groupes.
const CONTENT_TABS = ['spells', 'equipment', 'magic', 'races', 'classes', 'backgrounds', 'abilities', 'services', 'conditions']

// Onglet de gestion des comptes admin — indépendant de toute session, comme les onglets
// de contenu, mais lui-même réservé au propriétaire (is_owner) : absent du menu pour
// tout autre admin plutôt que grisé, il n'y a rien à découvrir derrière.
const ACCOUNT_TABS = authStore.admin?.is_owner ? ['admins'] : []

// Onglets utilisables sans session active — contenu ET gestion des admins. Piloté le
// rendu du panneau principal (sinon "Sélectionnez ou créez une session…" s'affiche même
// pour ces onglets) et le nettoyage de l'URL en quittant une session (voir plus bas).
const SESSIONLESS_TABS = [...CONTENT_TABS, ...ACCOUNT_TABS]
const isSessionlessTab = computed(() => SESSIONLESS_TABS.includes(activeTab.value))

const NAV_GROUPS_FULL = [
  { label: 'En jeu',  items: ['players', 'message', 'dice', 'journal'] },
  { label: 'Scène',   items: ['tension', 'vote', 'images', 'videos', 'audio', 'map', 'merchants', 'puzzle', 'reputation'] },
  { label: 'Contenu', items: CONTENT_TABS },
  { label: 'Compte',  items: ACCOUNT_TABS },
  { label: 'Outils',  items: ['tresor', 'generator'] },
]
// Sans session active, les onglets de contenu et de compte restent pertinents (ils ne
// lisent ni n'écrivent aucun état de session) ; le reste du menu dépend d'une session
// (joueurs, scène TV, trésor de la session, etc.).
const navGroups = computed(() => (
  sessionStore.activeSession ? NAV_GROUPS_FULL : NAV_GROUPS_FULL.filter(g => g.label === 'Contenu' || g.label === 'Compte')
))
// Transmis à CommandPalette pour que ses résultats de section (Ctrl+K) restent alignés
// sur le menu affiché : pas de raccourci vers un onglet caché (ex: « Joueurs » sans
// session active), même si la palette elle-même est utilisable sans session.
const visibleTabKeys = computed(() => navGroups.value.flatMap(g => g.items))

// ── TV modes ─────────────────────────────────────────────────────────────
const tvModes = computed(() => ([
  { key: 'lobby',      label: 'Lobby',            hint: 'Code et QR de session',        ready: true },
  { key: 'combat',     label: 'Combat',           hint: 'Liste des joueurs / HP / AC',  ready: true },
  { key: 'vote',       label: 'Vote',             hint: 'Affiche le vote actif',         ready: hasActiveVote.value },
  { key: 'image',      label: 'Image',            hint: 'Affiche l image active',        ready: hasActiveImage.value },
  { key: 'video',      label: 'Vidéo',            hint: 'Affiche la vidéo active',       ready: hasActiveVideo.value },
  { key: 'map',        label: 'Carte',            hint: 'Depuis l onglet Carte',         ready: hasActiveMap.value },
  { key: 'merchant',   label: 'Marchand',         hint: 'Affiche le marchand actif',     ready: hasActiveMerchant.value },
  { key: 'puzzle',     label: 'Puzzle',           hint: 'Depuis l onglet Puzzles',       ready: !!activePuzzle.value },
  { key: 'doom',       label: 'Doom Clock',       hint: 'Depuis l onglet Rythme',        ready: hasActiveDoom.value },
  { key: 'tension',    label: 'Echelle tension',  hint: 'Depuis l onglet Rythme',        ready: hasActiveTension.value },
  { key: 'timescale',  label: 'Echelle de temps', hint: 'Depuis l onglet Rythme',        ready: hasActiveTimeScale.value },
  { key: 'reputation', label: 'Réputations',      hint: 'Depuis l onglet Réputations',   ready: hasActiveReputation.value },
  { key: 'content',    label: 'Contenu',          hint: 'Depuis un onglet Contenu',      ready: hasActiveContent.value },
]))

// Libellés des 7 `CONTENT_TYPES` acceptés par `show-content` (backend/src/socket.js).
// `item` couvre équipement ET objet magique côté serveur : on retrouve la nuance via
// `source_category`, seul indice disponible dans la fiche déjà chargée côté client.
const CONTENT_TYPE_LABELS = {
  spell:      'Sort',
  item:       'Objet',
  race:       'Race',
  background: 'Origine',
  ability:    'Aptitude',
  service:    'Service',
  condition:  'État',
}

function contentTypeLabel(content) {
  if (!content) return ''
  if (content.contentType === 'item') {
    return content.contentData?.source_category === 'magic' ? 'Objet magique' : 'Objet'
  }
  return CONTENT_TYPE_LABELS[content.contentType] || 'Contenu'
}

const activeTvModeLabel = computed(() => {
  // En mode « contenu », le nom de la fiche est plus informatif que le mode lui-même.
  // Les 7 familles exposent toutes un `name` (cf. les *Preview() de CommandPalette).
  if (tvMode.value === 'content' && activeContent.value?.contentData?.name) {
    return activeContent.value.contentData.name
  }
  const mode = tvModes.value.find(item => item.key === tvMode.value)
  return mode?.label || tvMode.value
})

// Précision affichée entre parenthèses à côté du libellé : le type de fiche projetée.
const activeTvModeDetail = computed(() => (
  tvMode.value === 'content' ? contentTypeLabel(activeContent.value) : ''
))

const activeSessionLabel = computed(() => {
  if (!sessionStore.activeSession) return ''
  return `${sessionStore.activeSession.name} - ${sessionStore.activeSession.code}`
})

// ── Actions ──────────────────────────────────────────────────────────────
function setTvMode(mode) {
  if (!sessionStore.activeSession?.id) return
  const modeObj = tvModes.value.find(item => item.key === mode)
  if (!modeObj?.ready) return
  const socket = getSocket(authStore.token)
  socket.emit(SET_TV_MODE, { sessionId: sessionStore.activeSession.id, mode })
}

function logout() {
  resetSocket()
  authStore.logout()
  router.push('/')
}

// ── Palette de commande (recherche globale, Ctrl+K) ─────────────────────
function openPalette() { isPaletteOpen.value = true }
function closePalette() { isPaletteOpen.value = false }

function onGlobalKeydown(e) {
  const isK = e.key === 'k' || e.key === 'K'
  if (isK && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    isPaletteOpen.value = !isPaletteOpen.value
  }
}

function setTheme(next) {
  theme.value = next
  setThemePreference('admin', next)
  applyTheme(next)
  // La TV suit le thème du MJ via ce socket — contrat inchangé par la refonte.
  if (sessionStore.activeSession?.id) {
    const socket = getSocket(authStore.token)
    socket.emit('set-tv-theme', { sessionId: sessionStore.activeSession.id, theme: next })
  }
}

function setDensity(next) {
  density.value = next
  setDensityPreference('admin', next)
  applyDensity(next)
}

function adjustRound(delta) {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket(authStore.token)
  const newRound = Math.max(0, combatRound.value + delta)
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: newRound })
}

function resetRound() {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket(authStore.token)
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: 0 })
}

// ── Socket handlers ───────────────────────────────────────────────────────
function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  tvMode.value = data.tvMode || 'lobby'
  combatRound.value = data.combatRound || 0

  hasActiveVote.value = !!data.activeVote
  hasActiveImage.value = !!data.currentImageUrl
  hasActiveVideo.value = !!data.currentVideoUrl
  hasActiveMerchant.value = !!data.activeMerchant
  hasActiveDoom.value = !!data.doomClock
  hasActiveTension.value = !!data.tensionScale
  hasActiveTimeScale.value = !!data.timeScale
  hasActiveMap.value = !!(data.mapState?.mapUrl)
  activePuzzle.value = data.activePuzzle || null
  hasActiveReputation.value = Array.isArray(data.factions) && data.factions.length > 0
  activeContent.value = data.activeContent || null
  if (data.isDemo !== undefined && authStore.admin) {
    authStore.admin = { ...authStore.admin, is_demo: data.isDemo }
  }
}

function handleTvModeChanged(payload) {
  if (payload?.mode) tvMode.value = payload.mode
  if (payload?.imageUrl !== undefined) hasActiveImage.value = !!payload.imageUrl
  if (payload?.videoUrl !== undefined) hasActiveVideo.value = !!payload.videoUrl
  // Basé sur `mode`, pas sur la présence de `merchantData` : `close-merchant` et un
  // changement de mode générique (`set-tv-mode`) émettent tous deux `{ mode }` SANS clé
  // `merchantData` — `!== undefined` ne s'y déclenchait donc jamais, et le marchand restait
  // « actif » indéfiniment après fermeture (pastille bloquée + `ready` resté vrai, ce qui
  // permettait de resélectionner « Marchand » depuis le sélecteur générique sans
  // `current_merchant_id` associé côté serveur → TV blanche, aucune des branches `v-else-if`
  // de TvView ne correspondant).
  if (payload?.mode !== undefined) hasActiveMerchant.value = payload.mode === 'merchant'
  if (payload?.mode === 'content' && payload?.contentData) {
    activeContent.value = { contentType: payload.contentType, contentData: payload.contentData }
  }
  if (payload?.mode === 'puzzle' && payload?.puzzleImageId) {
    activePuzzle.value = { puzzleImageId: payload.puzzleImageId, puzzleSeed: payload.puzzleSeed, puzzleClicks: activePuzzle.value?.puzzleClicks || [] }
  }
}

// ── Data loading ─────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const res = await apiFetch('/api/sessions', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (res.ok) sessionStore.setSessions(data)
  } catch {
    // SessionManager garde son propre chargement en secours.
  }
}

async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`)
    if (res.ok) {
      const cfg = await res.json()
      generatorEnabled.value = cfg.generatorEnabled !== false
    }
  } catch { /* silently ignore */ }
}

// Détecte un compte admin supprimé côté serveur (token toujours valide mais compte
// disparu — /api/auth/me répond 404). Un token expiré/invalide est déjà géré par
// apiFetch() lui-même (401).
async function verifySession() {
  try {
    const res = await apiFetch('/api/auth/me')
    if (res.status === 404) {
      authStore.logout()
      resetSocket()
      router.push({ path: '/', query: { expired: '1' } })
    }
  } catch { /* erreur réseau — pas un problème d'auth */ }
}

// Au montage (notamment un F5 sur /admin/session/:code), la session active vit en mémoire
// (sessionStore) et n'est jamais restaurée automatiquement : on la retrouve via le code
// présent dans l'URL parmi les sessions de l'admin, sinon on retombe sur /admin sans code.
async function restoreSessionFromRoute() {
  await loadSessions()
  if (sessionStore.activeSession) return
  const code = route.params.code
  if (!code) return
  const match = sessionStore.sessions.find(s => s.code === code && s.status === 'active')
  if (match) sessionStore.setActiveSession(match)
  else router.replace({ name: 'admin', params: { tab: activeTab.value } })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  document.body.classList.add('page-admin')
  window.addEventListener('keydown', onGlobalKeydown)
  restoreSessionFromRoute()
  loadConfig()
  verifySession()
  releaseNotesStore.load()
  _socket = getSocket(authStore.token)

  _socket.on('connect', () => {
    if (sessionStore.activeSession?.id) {
      _socket.emit(ADMIN_JOIN, sessionStore.activeSession.id)
    }
  })

  _socket.on(PLAYER_JOINED, (player) => { sessionStore.addPlayer(player) })
  _socket.on(PLAYER_LEFT, (data) => { sessionStore.removePlayer(data.playerId) })
  _socket.on(PLAYERS_SNAPSHOT, ({ sessionId, players }) => {
    if (sessionStore.activeSession?.id !== sessionId) return
    sessionStore.setPlayers(players)
  })
  _socket.on(HP_UPDATED, ({ playerId, newHp, newMaxHp }) => {
    sessionStore.updatePlayerHp(playerId, newHp, newMaxHp)
  })
  _socket.on(CONDITIONS_UPDATED, ({ playerId, conditions }) => {
    sessionStore.updatePlayerConditions(playerId, conditions)
  })
  _socket.on(CONCENTRATION_UPDATED, ({ playerId, isConcentrating }) => {
    sessionStore.updatePlayerConcentration(playerId, isConcentrating)
  })
  _socket.on(INITIATIVE_UPDATED, ({ playerId, initiative }) => {
    sessionStore.updatePlayerInitiative(playerId, initiative)
  })
  _socket.on(ADMIN_STATE, handleAdminState)
  _socket.on(TV_MODE_CHANGED, handleTvModeChanged)
  _socket.on(VOTE_STARTED, () => { hasActiveVote.value = true })
  _socket.on(VOTE_CLOSED, () => { hasActiveVote.value = false })
  _socket.on(MAP_STATE, (data) => { hasActiveMap.value = !!(data?.mapUrl) })
  // Ne force plus `true` inconditionnellement : cet événement suit aussi les éditions
  // d'un marchand qui n'est pas forcément diffusé (voir le commentaire de
  // handleTvModeChanged pour la même confusion « existe » / « diffusé »).
  _socket.on(MERCHANT_ITEMS_UPDATED, () => { hasActiveMerchant.value = tvMode.value === 'merchant' })
  _socket.on(PUZZLE_CLOSED, () => {
    activePuzzle.value = null
    if (tvMode.value === 'puzzle') tvMode.value = 'lobby'
  })
  _socket.on(DOOM_CLOCK_STARTED, () => { hasActiveDoom.value = true })
  _socket.on(DOOM_CLOCK_STOPPED, () => {
    hasActiveDoom.value = false
    if (tvMode.value === 'doom') tvMode.value = 'lobby'
  })
  _socket.on(TENSION_SCALE_UPDATED, () => { hasActiveTension.value = true })
  _socket.on(TENSION_SCALE_ENDED, () => {
    hasActiveTension.value = false
    if (tvMode.value === 'tension') tvMode.value = 'lobby'
  })
  _socket.on(TIME_SCALE_UPDATED, () => { hasActiveTimeScale.value = true })
  _socket.on(TIME_SCALE_ENDED, () => {
    hasActiveTimeScale.value = false
    if (tvMode.value === 'timescale') tvMode.value = 'lobby'
  })
  _socket.on(PLAYER_ROLL_RESULT, (payload) => {
    try {
      if (payload && typeof payload === 'object') pushPlayerRollToast(payload)
    } catch (err) {
      console.error('player-roll-result handler error:', err)
    }
  })
  _socket.on(DEMO_RESET, () => { window.location.reload() })
  _socket.on(FACTIONS_UPDATED, (factions) => {
    hasActiveReputation.value = Array.isArray(factions) && factions.length > 0
  })

  _socket.on(ROUND_UPDATED, ({ round }) => {
    combatRound.value = round
  })
})

watch(
  () => sessionStore.activeSession?.id,
  (sessionId) => {
    if (!sessionId) return
    isSessionPanelCollapsed.value = true
    const socket = getSocket(authStore.token)
    socket.emit(ADMIN_JOIN, sessionId)
    socket.emit('set-tv-theme', { sessionId, theme: theme.value })
  },
  { immediate: true }
)

// Garde l'URL synchronisée quand la session active change EN COURS DE VIE du composant
// (sélection/création/fermeture dans SessionManager) — PAS `immediate: true` : au montage,
// activeSession vaut encore null pendant que restoreSessionFromRoute() résout le code de
// l'URL ; un déclenchement immédiat verrait ce null et effacerait le code avant restauration.
watch(
  () => sessionStore.activeSession?.code,
  (code) => {
    if (code) {
      if (route.params.code !== code) {
        router.replace({ name: 'admin-session', params: { code, tab: activeTab.value } })
      }
    } else if (route.name === 'admin-session') {
      router.replace({ name: 'admin', params: { tab: isSessionlessTab.value ? activeTab.value : undefined } })
    }
  }
)

onUnmounted(() => {
  document.body.classList.remove('page-admin')
  window.removeEventListener('keydown', onGlobalKeydown)
  if (_socket) {
    _socket.off('connect')
    _socket.off(PLAYER_JOINED)
    _socket.off(PLAYER_LEFT)
    _socket.off(PLAYERS_SNAPSHOT)
    _socket.off(HP_UPDATED)
    _socket.off(CONDITIONS_UPDATED)
    _socket.off(CONCENTRATION_UPDATED)
    _socket.off(INITIATIVE_UPDATED)
    _socket.off(ADMIN_STATE, handleAdminState)
    _socket.off(TV_MODE_CHANGED, handleTvModeChanged)
    _socket.off(VOTE_STARTED)
    _socket.off(VOTE_CLOSED)
    _socket.off(MERCHANT_ITEMS_UPDATED)
    _socket.off(PUZZLE_CLOSED)
    _socket.off(DOOM_CLOCK_STARTED)
    _socket.off(DOOM_CLOCK_STOPPED)
    _socket.off(TENSION_SCALE_UPDATED)
    _socket.off(TENSION_SCALE_ENDED)
    _socket.off(TIME_SCALE_UPDATED)
    _socket.off(TIME_SCALE_ENDED)
    _socket.off(MAP_STATE)
    _socket.off(PLAYER_ROLL_RESULT)
    _socket.off(DEMO_RESET)
    _socket.off(FACTIONS_UPDATED)
    _socket.off(ROUND_UPDATED)
    _socket = null
  }
})
</script>

<template>
  <div class="admin-wrapper">
    <AdminForcePasswordModal v-if="authStore.admin?.must_change_password" />
    <DemoBanner v-if="authStore.admin?.is_demo" />

    <AdminHeader
      :admin="authStore.admin"
      :app-version="appVersion"
      :theme="theme"
      :density="density"
      :is-session-panel-collapsed="isSessionPanelCollapsed"
      :active-session-label="activeSessionLabel"
      :has-active-session="!!sessionStore.activeSession"
      @logout="logout"
      @update:theme="setTheme"
      @update:density="setDensity"
      @toggle-session-panel="isSessionPanelCollapsed = !isSessionPanelCollapsed"
      @open-search="openPalette"
    />

    <AdminSceneBar
      :tv-modes="tvModes"
      :tv-mode="tvMode"
      :has-active-session="!!sessionStore.activeSession"
      :active-tv-mode-label="activeTvModeLabel"
      :active-tv-mode-detail="activeTvModeDetail"
      :combat-round="combatRound"
      @set-mode="setTvMode"
      @adjust-round="adjustRound"
      @reset-round="resetRound"
    />

    <div class="admin-body">
      <AdminNavSidebar
        :tabs="tabs"
        :nav-groups="navGroups"
        :active-tab="activeTab"
        :tab-activity="tabActivity"
        :locked-tabs="lockedTabs"
        :is-collapsed="isNavCollapsed"
        @update:active-tab="goToTab"
        @update:is-collapsed="isNavCollapsed = $event"
      />

      <div class="admin-content-area">
        <div class="admin-main-grid">
          <section class="admin-main">
            <div v-if="lockedTabs[activeTab]" class="locked-tab-panel">
              <AppIcon icon="lucide:lock" size="1.4em" />
              <p class="locked-tab-title">{{ lockedTabs[activeTab].title }}</p>
              <!-- eslint-disable-next-line vue/no-v-html — contenu défini en dur, pas d'entrée utilisateur -->
              <p class="locked-tab-text" v-html="lockedTabs[activeTab].text"></p>
            </div>
            <template v-else-if="sessionStore.activeSession || isSessionlessTab">
              <Transition name="tab-fade" mode="out-in">
                <KeepAlive>
                  <component
                    :is="currentTabComponent"
                    :key="activeTab"
                    v-bind="activeTab === 'puzzle' ? { activePuzzle }
                      : activeTab === 'equipment' ? { category: 'equipment' }
                      : activeTab === 'magic' ? { category: 'magic' }
                      : {}"
                  />
                </KeepAlive>
              </Transition>
            </template>
            <p v-else class="no-session-msg">Sélectionnez ou créez une session pour accéder aux outils de jeu — ou consultez Sorts, Objets, Races, Classes et Origines dans le domaine « Grimoire » à gauche, sans session.</p>
          </section>
        </div>
      </div>
    </div>

    <PlayerRollToasts
      :toasts="playerRollToasts"
      @dismiss="dismissPlayerRollToast"
      @pause="pauseToast"
      @resume="resumeToast"
    />

    <CommandPalette
      :open="isPaletteOpen"
      :visible-tab-keys="visibleTabKeys"
      :is-demo="!!authStore.admin?.is_demo"
      @close="closePalette"
    />
  </div>
</template>

<style scoped>
.admin-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0 auto;
  width: 100%;
  color: var(--color-text);
}

.admin-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.admin-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

/* Une seule colonne depuis que la régie TV est passée en barre de scène persistante :
   le panneau de travail récupère les 320 px de la colonne droite supprimée. */
.admin-main-grid {
  flex: 1;
  padding: var(--space-5);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.admin-main {
  min-width: 0;
  background: var(--gradient-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}
/* Rapatrié depuis style.css, où la règle avait besoin d'un `!important` pour passer
   devant la déclaration scoped ci-dessus. */
@media (min-width: 1024px) {
  .admin-main { padding: var(--space-8); }
}

.no-session-msg { font-size: var(--text-base); color: var(--color-text-dim); padding: var(--space-4) 0; }

.locked-tab-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-10) var(--space-4);
  color: var(--color-warning);
}
.locked-tab-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.locked-tab-text {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  max-width: 360px;
}
.locked-tab-text :deep(code) {
  font-family: monospace;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-gold-bright);
}

/* noinspection CssUnusedSymbol */
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity 0.15s ease; }
/* noinspection CssUnusedSymbol */
.tab-fade-enter-from, .tab-fade-leave-to { opacity: 0; }

/* Le point de rupture à 1100 px n'a plus lieu d'être : il existait pour escamoter la colonne
   de régie TV, qui est maintenant une barre persistante visible à tous les gabarits. */
@media (max-width: 767px) {
  .admin-body { flex-direction: column; }
  .admin-main-grid { padding: var(--space-3); }
  .admin-main { padding: var(--space-3); }
}
</style>
