import { io } from 'socket.io-client'

import { BACKEND_URL } from '@/config.js'

let socket = null

export function getSocket(token = null) {
  if (!socket) {
    socket = io(BACKEND_URL, { auth: { token } })
  }
  return socket
}

export function resetSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
