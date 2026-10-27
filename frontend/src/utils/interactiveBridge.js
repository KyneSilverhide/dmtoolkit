// Pont « dmt-bridge v1 » entre DM Toolkit et une page interactive servie dans une iframe
// sandboxée (origine opaque : on ne peut pas filtrer par origin, on filtre par event.source).
//
//   page   → parent : { type: 'dmt:ready', version: 1 }        dès que la page écoute
//   parent → page   : { type: 'dmt:init', version: 1, role: 'gm' | 'tv', players, state }
//   page   → parent : { type: 'dmt:state', state }             (MJ seulement, à chaque changement)
//   parent → page   : { type: 'dmt:state', state }             (TV seulement, état reçu du MJ)
//
// `players` n'est envoyé qu'au chargement : la page n'est pas resynchronisée ensuite.
// Une page qui n'annonce jamais `dmt:ready` passe en repli : les clics du MJ (relayés par le
// script injecté côté serveur, message `puzzle-click`) sont rejoués sur la TV.

export const BRIDGE_VERSION = 1

// postMessage refuse les Proxy réactifs de Vue (DataCloneError) : on n'envoie que du JSON.
function plain(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

/** Joueurs de la session au format exposé aux pages (rien d'interne : ni socket, ni session). */
export function bridgePlayers(players, backendUrl = '') {
  return (Array.isArray(players) ? players : []).map(p => ({
    id: p.id,
    name: p.player_name,
    avatarUrl: p.avatar_url ? `${backendUrl}${p.avatar_url}` : null,
    dndClass: p.dnd_class || null,
    subclass: p.subclass || null,
    race: p.race || null,
    ac: p.ac ?? null,
    maxHp: p.max_hp ?? null,
    currentHp: p.current_hp ?? null,
    tempHp: p.temp_hp ?? 0,
    online: !!p.socket_id,
  }))
}

/**
 * Écoute les messages d'UNE iframe et parle le pont avec elle.
 * @param {object} opts
 * @param {() => HTMLIFrameElement|null} opts.getFrame
 * @param {'gm'|'tv'} opts.role
 * @param {() => { players: Array, state: any }} opts.getInit - lu au moment du `dmt:ready`
 * @param {(state: any) => void} [opts.onState] - MJ : état envoyé par la page
 * @param {(path: number[]) => void} [opts.onClick] - MJ : clic d'une page sans pont (repli)
 */
export function connectBridge({ getFrame, role, getInit, onState, onClick }) {
  let bridged = false
  // Une iframe rechargée garde le même contentWindow : `readySeen` dit si le document
  // courant s'est annoncé (voir consumeReady), indépendamment de l'état du précédent.
  let readySeen = false

  function post(message) {
    getFrame()?.contentWindow?.postMessage(message, '*')
  }

  function onMessage(event) {
    const frameWindow = getFrame()?.contentWindow
    if (!frameWindow || event.source !== frameWindow) return
    const data = event.data
    if (!data || typeof data.type !== 'string') return
    if (data.type === 'dmt:ready') {
      bridged = true
      readySeen = true
      const { players, state } = getInit()
      post({ type: 'dmt:init', version: BRIDGE_VERSION, role, players: plain(players) || [], state: plain(state) })
    } else if (data.type === 'dmt:state' && role === 'gm') {
      onState?.(data.state)
    } else if (data.type === 'puzzle-click' && role === 'gm' && !bridged && Array.isArray(data.path)) {
      onClick?.(data.path)
    }
  }

  window.addEventListener('message', onMessage)

  return {
    isBridged: () => bridged,
    /**
     * À appeler peu après le `load` de l'iframe : vrai si le document chargé s'est annoncé.
     * Sinon la page ne parle pas le pont et on repasse en repli (rejeu des clics).
     */
    consumeReady() {
      const seen = readySeen
      readySeen = false
      if (!seen) bridged = false
      return seen
    },
    sendState(state) { if (bridged) post({ type: 'dmt:state', state: plain(state) }) },
    replayClicks(paths) {
      for (const path of paths || []) post({ type: 'puzzle-remote-click', path: Array.from(path) })
    },
    dispose() { window.removeEventListener('message', onMessage) },
  }
}
