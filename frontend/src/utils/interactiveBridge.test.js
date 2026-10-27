import { describe, it, expect, vi, afterEach } from 'vitest'
import { reactive } from 'vue'
import { bridgePlayers, connectBridge, BRIDGE_VERSION } from './interactiveBridge.js'

describe('bridgePlayers', () => {
  it('expose les champs utiles et un avatar absolu', () => {
    const [p] = bridgePlayers([{
      id: 3, player_name: 'Tana', avatar_url: '/uploads/a/b.png', dnd_class: 'Barde',
      race: 'Elfe', ac: 15, max_hp: 40, current_hp: 32, temp_hp: 5, socket_id: 'abc', session_id: 9,
    }], 'http://api')
    expect(p).toEqual({
      id: 3, name: 'Tana', avatarUrl: 'http://api/uploads/a/b.png', dndClass: 'Barde', subclass: null,
      race: 'Elfe', ac: 15, maxHp: 40, currentHp: 32, tempHp: 5, online: true,
    })
  })

  it('tolère une liste absente', () => {
    expect(bridgePlayers(undefined)).toEqual([])
  })
})

describe('connectBridge', () => {
  let bridge
  afterEach(() => bridge?.dispose())

  function setup(role, extra = {}) {
    const frameWindow = { postMessage: vi.fn() }
    const frame = { contentWindow: frameWindow }
    bridge = connectBridge({ getFrame: () => frame, role, getInit: () => ({ players: [{ id: 1 }], state: { n: 2 } }), ...extra })
    const send = data => window.dispatchEvent(new MessageEvent('message', { data, source: frameWindow }))
    return { frameWindow, send }
  }

  it('répond à dmt:ready par dmt:init', () => {
    const { frameWindow, send } = setup('tv')
    send({ type: 'dmt:ready', version: 1 })
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      { type: 'dmt:init', version: BRIDGE_VERSION, role: 'tv', players: [{ id: 1 }], state: { n: 2 } }, '*')
    expect(bridge.isBridged()).toBe(true)
  })

  it('remonte l\'état de la page du MJ', () => {
    const onState = vi.fn()
    const { send } = setup('gm', { onState })
    send({ type: 'dmt:state', state: { round: 3 } })
    expect(onState).toHaveBeenCalledWith({ round: 3 })
  })

  it('ignore les messages d\'une autre source', () => {
    const onState = vi.fn()
    setup('gm', { onState })
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'dmt:state', state: 1 }, source: null }))
    expect(onState).not.toHaveBeenCalled()
  })

  it('ne relaie les clics que pour une page sans pont', () => {
    const onClick = vi.fn()
    const { send } = setup('gm', { onClick })
    send({ type: 'puzzle-click', path: [0, 1] })
    expect(onClick).toHaveBeenCalledWith([0, 1])
    send({ type: 'dmt:ready', version: 1 })
    send({ type: 'puzzle-click', path: [2] })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('envoie une copie simple d\'un état réactif (postMessage refuse les Proxy)', () => {
    const { frameWindow, send } = setup('tv')
    send({ type: 'dmt:ready', version: 1 })
    bridge.sendState(reactive({ nested: { a: 1 } }))
    const sent = frameWindow.postMessage.mock.calls.at(-1)[0].state
    expect(sent).toEqual({ nested: { a: 1 } })
    expect(() => structuredClone(sent)).not.toThrow()
  })

  it('n\'envoie l\'état à la TV qu\'une fois la page annoncée', () => {
    const { frameWindow, send } = setup('tv')
    bridge.sendState({ a: 1 })
    expect(frameWindow.postMessage).not.toHaveBeenCalled()
    send({ type: 'dmt:ready', version: 1 })
    bridge.sendState({ a: 1 })
    expect(frameWindow.postMessage).toHaveBeenLastCalledWith({ type: 'dmt:state', state: { a: 1 } }, '*')
  })
})
