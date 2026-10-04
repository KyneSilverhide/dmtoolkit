import { io } from 'socket.io-client'

import { BACKEND_URL } from '@/config.js'

let socket = null
let socketToken = null

// Singleton Socket.IO. Le token est figé dans le handshake à la création : si un appelant en
// demande un autre (ex. un admin revenu sur /admin après être passé par une vue joueur, qui
// avait créé le socket sans token), le socket existant est remplacé — sinon `socket.admin`
// n'est jamais posé côté serveur et tous les handlers admin ignorent silencieusement les
// commandes. Un appelant sans token (`getSocket()`) réutilise le socket courant tel quel.
export function getSocket(token = null) {
  if (socket && token && token !== socketToken) {
    socket.disconnect()
    socket = null
  }
  if (!socket) {
    socketToken = token
    socket = io(BACKEND_URL, { auth: { token } })
  }
  return socket
}

// Socket existant sans le créer (nettoyage au démontage).
export function peekSocket() {
  return socket
}

export function resetSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    socketToken = null
  }
}
