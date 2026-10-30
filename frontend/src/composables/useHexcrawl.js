import { ref, computed } from 'vue'
import { getSocket } from '@/socket.js'
import { sessionStore } from '@/stores/session.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { computeHexcrawl, normalizeConfig, publicHexcrawl } from '@/utils/hexcrawl.js'

// Voyage de la carte affichée. Le serveur garde le journal ; ce composable le rejoue, applique chaque
// action tout de suite en local (réactivité au clic) puis se recale sur le serveur. Tant que des actions
// sont en route, les échos sont ignorés : ils effaceraient les actions suivantes du journal local, et
// l'état public calculé à partir de lui serait faux. Le dernier accusé de réception donne le journal final.
export function useHexcrawl({ onChange = () => {}, neighbors } = {}) {
  const hexcrawl = ref(null)
  const config = computed(() => normalizeConfig(hexcrawl.value?.config))
  const status = computed(() => (hexcrawl.value ? computeHexcrawl(config.value, hexcrawl.value.log, { neighbors }) : null))
  let pending = 0

  async function load() {
    const sessionId = sessionStore.activeSession?.id
    if (!sessionId) { hexcrawl.value = null; return }
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/hexcrawls/current`)
      if (res.ok) {
        hexcrawl.value = await res.json()
        onChange()
      }
    } catch (err) { console.error(err) }
  }

  function handleUpdated(payload) {
    if (pending) return
    hexcrawl.value = payload
    onChange()
  }

  function handleAck(id, result) {
    pending = Math.max(0, pending - 1)
    if (pending || hexcrawl.value?.id !== id) return
    if (result?.hexcrawl) {
      hexcrawl.value = result.hexcrawl
      onChange()
    } else {
      load()
    }
  }

  // Une coupure fait manquer des échos, et les accusés des actions perdues n'arriveront jamais.
  function handleReconnect() {
    pending = 0
    load()
  }

  function send(op, nextLog, entry) {
    if (!hexcrawl.value) return
    const next = computeHexcrawl(config.value, nextLog, { neighbors })
    const id = hexcrawl.value.id
    hexcrawl.value = { ...hexcrawl.value, log: nextLog }
    onChange()
    pending += 1
    getSocket().emit('hexcrawl-action', {
      sessionId: sessionStore.activeSession.id,
      hexcrawlId: id,
      op,
      entry,
      publicState: publicHexcrawl(config.value, next),
      token: next.position ? { nx: next.position.nx, ny: next.position.ny } : null,
    }, result => handleAck(id, result))
  }

  const act = entry => send('append', [...hexcrawl.value.log, entry], entry)
  const undo = () => { if (hexcrawl.value?.log.length) send('undo', hexcrawl.value.log.slice(0, -1)) }
  const reset = () => send('reset', [])
  // La carte, son brouillard et ses jetons restent : seul le suivi du voyage disparaît.
  const remove = () => {
    if (!hexcrawl.value) return
    getSocket().emit('hexcrawl-delete', { sessionId: sessionStore.activeSession.id, hexcrawlId: hexcrawl.value.id })
    hexcrawl.value = null
    onChange()
  }

  function register() {
    getSocket().on('hexcrawl-updated', handleUpdated)
    getSocket().on('connect', handleReconnect)
  }
  function unregister() {
    getSocket().off('hexcrawl-updated', handleUpdated)
    getSocket().off('connect', handleReconnect)
  }

  return { hexcrawl, config, status, load, act, undo, reset, remove, register, unregister }
}

/** Enregistre les réglages d'une carte. Renvoie { hexcrawl } ou { error }. */
export function saveHexcrawlConfig(imageId, config, log = [], neighbors) {
  const normalized = normalizeConfig(config)
  return new Promise(resolve => {
    getSocket().emit('hexcrawl-save', {
      sessionId: sessionStore.activeSession.id,
      imageId,
      config: normalized,
      publicState: publicHexcrawl(normalized, computeHexcrawl(normalized, log, { neighbors })),
    }, resolve)
  })
}
