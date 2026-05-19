/**
 * Named constants for all Socket.IO events in the application.
 *
 * Usage (frontend):
 *   import EVENTS from '@/socket-events.js'
 *   socket.emit(EVENTS.JOIN_SESSION, { code, playerName, ... })
 *
 * All new code should import from this file rather than using string literals,
 * to prevent typos and make event names discoverable via IDE autocomplete.
 *
 * Socket room naming convention (backend):
 *   - `session:<sessionId>` — all players in a session
 *   - `admin:<sessionId>`   — the MJ/DM managing the session
 *   - `tv:<sessionId>`      — TV display screen(s)
 */

// ── Incoming events: Player → Server ────────────────────────────────────────

/** Player joins a session: { code, playerName, ac, hp, dndClass, avatarUrl } */
export const JOIN_SESSION = 'join-session'

/** Player leaves the session voluntarily */
export const LEAVE_SESSION = 'leave-session'

/** Player updates their current HP: { newHp } */
export const UPDATE_HP = 'update-hp'

/** Player updates their max HP: { newMaxHp } */
export const UPDATE_MAX_HP = 'update-max-hp'

/** Player updates their conditions array: { conditions } */
export const UPDATE_CONDITIONS = 'update-conditions'

/** Player toggles concentration: { isConcentrating } */
export const UPDATE_CONCENTRATION = 'update-concentration'

/** Player rolls dice and sends result to admin: { diceCount, diceType, modifier, rollType, total, hidden } */
export const PLAYER_ROLL = 'player-roll'

/** Player updates their initiative: { initiative } */
export const UPDATE_INITIATIVE = 'update-initiative'

/** Player requests purchase of a single item (legacy): { itemId, quantity } */
export const REQUEST_PURCHASE = 'request-purchase'

/** Player requests batch purchase (cart): { items: [{itemId, quantity}] } */
export const REQUEST_BATCH_PURCHASE = 'request-batch-purchase'

/** Player responds to a counter-offer: { requestId, accept } */
export const RESPOND_COUNTER_OFFER = 'respond-counter-offer'

/** Player submits a vote: { voteId, optionIndex } */
export const SUBMIT_VOTE = 'submit-vote'

// ── Incoming events: Admin → Server ─────────────────────────────────────────

/** Admin joins their session room and receives a snapshot: (sessionId) */
export const ADMIN_JOIN = 'admin-join'

/** TV display joins a session room: { sessionCode } */
export const TV_JOIN = 'tv-join'

/** Admin changes the TV display mode: { sessionId, mode } */
export const SET_TV_MODE = 'set-tv-mode'

/** Admin starts the doom clock: { sessionId, title, durationSeconds } */
export const START_DOOM_CLOCK = 'start-doom-clock'

/** Admin stops the doom clock: { sessionId } */
export const STOP_DOOM_CLOCK = 'stop-doom-clock'

/** Admin creates a tension scale: { sessionId, title, steps, direction, vibrationEnabled } */
export const CREATE_TENSION_SCALE = 'create-tension-scale'

/** Admin advances the tension scale by one step: { sessionId } */
export const INCREMENT_TENSION_SCALE = 'increment-tension-scale'

/** Admin ends the tension scale: { sessionId } */
export const END_TENSION_SCALE = 'end-tension-scale'

/** Admin creates a vote: { sessionId, question, options, isAnonymous } */
export const CREATE_VOTE = 'create-vote'

/** Admin manually closes the active vote: { sessionId } */
export const CLOSE_VOTE = 'close-vote'

/** Admin displays an image on the TV: { sessionId, imageUrl } */
export const SHOW_IMAGE = 'show-image'

/** Admin displays a battlemap on the TV: { sessionId, imageUrl } */
export const SHOW_MAP = 'show-map'

/** Admin toggles the battlemap fog of war: { sessionId, enabled } */
export const MAP_SET_FOG = 'map-set-fog'

/** Admin updates the battlemap viewport: { sessionId, xn, yn, scale } */
export const MAP_VIEWPORT_UPDATE = 'map-viewport-update'

/** Admin reveals fog areas (adds strokes): { sessionId, strokes } */
export const MAP_FOG_CLEAR = 'map-fog-clear'

/** Admin resets the fog (covers entire map): { sessionId } */
export const MAP_FOG_RESET = 'map-fog-reset'

/** Admin moves a player token on the map: { sessionId, playerId, nx, ny, name } */
export const MAP_TOKEN_MOVE = 'map-token-move'

/** Admin removes a player token from the map: { sessionId, playerId } */
export const MAP_TOKEN_REMOVE = 'map-token-remove'

/** Admin sends a message to one or all players: { sessionId, toPlayerId?, type, content, voiceStyle, textEffect, authorName } */
export const SEND_MESSAGE = 'send-message'

/** Admin sends a dice roll result to one or all players: { sessionId, combatType, rollValue, resultText, toPlayerId? } */
export const SEND_DICE_RESULT = 'send-dice-result'

/** Admin creates a merchant: { sessionId, name, description, items } */
export const CREATE_MERCHANT = 'create-merchant'

/** Admin shows a merchant on the TV: { sessionId, merchantId } */
export const SHOW_MERCHANT = 'show-merchant'

/** Admin closes the merchant view: { sessionId } */
export const CLOSE_MERCHANT = 'close-merchant'

/** Admin responds to a single-item purchase request (legacy): { requestId, action, finalPrice? } */
export const RESPOND_PURCHASE = 'respond-purchase'

/** Admin responds to a batch purchase request: { batchId, action, finalPrice? } */
export const RESPOND_BATCH_PURCHASE = 'respond-batch-purchase'

/** Admin kicks a player from the session: { playerId } */
export const KICK_PLAYER = 'kick-player'

// ── Outgoing events: Server → Client ────────────────────────────────────────

/** Sent to player on successful join: { session, player, activeMerchant? } */
export const SESSION_JOINED = 'session-joined'

/** Sent to admin with initial player list: { sessionId, players } */
export const PLAYERS_SNAPSHOT = 'players-snapshot'

/** Sent to admin with full session state: { sessionId, tvMode, doomClock, tensionScale, activeVote, activeMerchant, mapState } */
export const ADMIN_STATE = 'admin-state'

/** Sent to TV with full session state: { session, players, tvMode, ... } */
export const TV_SNAPSHOT = 'tv-snapshot'

/** Sent to admin + TV when a player joins: (player row) */
export const PLAYER_JOINED = 'player-joined'

/** Sent to admin + TV when a player leaves or is kicked: { playerId } */
export const PLAYER_LEFT = 'player-left'

/** Sent to admin + TV when player HP changes: { playerId, newHp } */
export const HP_UPDATED = 'hp-updated'

/** Sent to player confirming HP update: { newHp } */
export const HP_UPDATE_CONFIRMED = 'hp-update-confirmed'

/** Sent to player confirming max HP update: { newMaxHp } */
export const MAX_HP_UPDATE_CONFIRMED = 'max-hp-update-confirmed'

/** Sent to player when taking damage while concentrating: { damage, dc } */
export const CONCENTRATION_WARNING = 'concentration-warning'

/** Sent to admin + TV when concentration changes: { playerId, isConcentrating } */
export const CONCENTRATION_UPDATED = 'concentration-updated'

/** Sent to player confirming concentration update: { isConcentrating } */
export const CONCENTRATION_CONFIRMED = 'concentration-confirmed'

/** Sent to admin + TV when initiative changes: { playerId, initiative } */
export const INITIATIVE_UPDATED = 'initiative-updated'

/** Sent to player confirming initiative update: { initiative } */
export const INITIATIVE_CONFIRMED = 'initiative-confirmed'

/** Sent to admin + TV when conditions change: { playerId, conditions } */
export const CONDITIONS_UPDATED = 'conditions-updated'

/** Sent to TV + admin when the TV display mode changes: { mode, ...extra } */
export const TV_MODE_CHANGED = 'tv-mode-changed'

/** Sent to TV + admin when the doom clock starts: { title, endAt } */
export const DOOM_CLOCK_STARTED = 'doom-clock-started'

/** Sent to TV + admin when the doom clock stops */
export const DOOM_CLOCK_STOPPED = 'doom-clock-stopped'

/** Sent to TV + admin when the tension scale is updated: { title, steps, level, direction, vibrationEnabled } */
export const TENSION_SCALE_UPDATED = 'tension-scale-updated'

/** Sent to TV + admin when the tension scale ends */
export const TENSION_SCALE_ENDED = 'tension-scale-ended'

/** Sent to TV + session + admin when a vote is created: (voteState) */
export const VOTE_STARTED = 'vote-started'

/** Sent to TV + admin with updated vote results: (voteState) */
export const VOTE_UPDATED = 'vote-updated'

/** Sent to TV + session + admin when a vote is closed: (voteState) */
export const VOTE_CLOSED = 'vote-closed'

/** Sent to player confirming their vote: { optionIndex } */
export const VOTE_SUBMITTED = 'vote-submitted'

/** Sent to player on vote error: { message } */
export const VOTE_ERROR = 'vote-error'

/** Sent to TV + admin with full battlemap state: { mapUrl, fogEnabled, viewport, fogStrokes, mapTokens } */
export const MAP_STATE = 'map-state'

/** Sent to TV + admin when fog is toggled: { enabled } */
export const MAP_FOG_UPDATED = 'map-fog-updated'

/** Sent to TV when the viewport changes: { xn, yn, scale } */
export const MAP_VIEWPORT_CHANGED = 'map-viewport-changed'

/** Sent to TV + admin with new fog-reveal strokes: { strokes } */
export const MAP_FOG_PATCH = 'map-fog-patch'

/** Sent to TV + admin when fog is fully reset */
export const MAP_FOG_RESET_EVENT = 'map-fog-reset'

/** Sent to TV + admin when a token is moved: { playerId, nx, ny, name? } */
export const MAP_TOKEN_MOVED = 'map-token-moved'

/** Sent to TV + admin when a token is removed: { playerId } */
export const MAP_TOKEN_REMOVED = 'map-token-removed'

/** Sent to player(s) with a new DM message: { fromName, type, content, voiceStyle, textEffect, sentAt } */
export const NEW_MESSAGE = 'new-message'

/** Sent to player(s) with a dice roll result: { combatType, rollValue, resultText, createdAt } */
export const DICE_RESULT = 'dice-result'

/** Sent to admin recording a session event (join/leave/damage/heal/death): { eventType, description, playerName, value?, createdAt } */
export const SESSION_EVENT = 'session-event'

/** Sent to admin after merchant creation: (merchantData) */
export const MERCHANT_CREATED = 'merchant-created'

/** Sent to session (players) when a merchant is shown: (merchantData) */
export const MERCHANT_SHOWN = 'merchant-shown'

/** Sent to session (players) when the merchant is closed */
export const MERCHANT_CLOSED = 'merchant-closed'

/** Sent to admin with updated merchant data: (merchantData) */
export const MERCHANT_UPDATED = 'merchant-updated'

/** Sent to TV + session when merchant stock changes: (merchantData) */
export const MERCHANT_ITEMS_UPDATED = 'merchant-items-updated'

/** Sent to admin with a player's purchase request: (requestData) */
export const PURCHASE_REQUEST = 'purchase-request'

/** Sent to player confirming their purchase request: { requestId?, batchId?, ... } */
export const PURCHASE_REQUESTED = 'purchase-requested'

/** Sent to player on purchase error: { message } */
export const PURCHASE_ERROR = 'purchase-error'

/** Sent to player with admin's counter-offer: { requestId, action, finalPrice, itemName } */
export const PURCHASE_COUNTER_OFFER = 'purchase-counter-offer'

/** Sent to admin confirming purchase response: { requestId?, batchId?, action, ... } */
export const PURCHASE_RESPONDED = 'purchase-responded'

/** Sent to player when their purchase/batch is accepted: { items, totalPrice, batchId? } */
export const BATCH_ACCEPTED = 'batch-accepted'

/** Sent to player when their purchase/batch is rejected: { items, batchId? } */
export const BATCH_REJECTED = 'batch-rejected'

/** Sent to player with result of their counter-offer response: { requestId, accepted, itemName, finalPrice? } */
export const COUNTER_OFFER_RESULT = 'counter-offer-result'

/** Sent to admin when player responds to a counter-offer: { requestId, accepted, playerName } */
export const COUNTER_OFFER_RESPONSE = 'counter-offer-response'

/** Sent to TV + admin when the lobby background changes: { url } */
export const LOBBY_BG_UPDATED = 'lobby-bg-updated'

/** Sent to TV + admin when combat round changes: { round } */
export const ROUND_UPDATED = 'round-updated'

/** Sent to TV + admin when a timer is active: { label, endAt } */
export const TIMER_UPDATED = 'timer-updated'

/** Sent to TV + admin when the timer is stopped */
export const TIMER_STOPPED = 'timer-stopped'

/** Sent to admin when a merchant is permanently deleted: { merchantId } */
export const MERCHANT_DELETED = 'merchant-deleted'

/** Sent to admin with a dice roll result from a player: { playerName, diceCount, diceType, modifier, rollType, total, hidden } */
export const PLAYER_ROLL_RESULT = 'player-roll-result'

/** Sent to player confirming their dice roll was sent visibly to admin */
export const PLAYER_ROLL_CONFIRMED = 'player-roll-confirmed'

/** Sent to player confirming their hidden dice roll was sent to admin */
export const PLAYER_ROLL_HIDDEN_SENT = 'player-roll-hidden-sent'

/** Sent to all connected clients when the demo account is reset — triggers page reload */
export const DEMO_RESET = 'demo-reset'

/** Sent to a player when they are kicked from the session */
export const KICKED = 'kicked'

/** Generic error event: { message } */
export const ERROR = 'error'

/** Error in TV control operations: { message } */
export const TV_CONTROL_ERROR = 'tv-control-error'

/** Error when sending a message/dice result: { message } */
export const SEND_ERROR = 'send-error'

export default {
  // Incoming — Player
  JOIN_SESSION,
  LEAVE_SESSION,
  UPDATE_HP,
  UPDATE_MAX_HP,
  UPDATE_CONDITIONS,
  UPDATE_CONCENTRATION,
  PLAYER_ROLL,
  UPDATE_INITIATIVE,
  SUBMIT_VOTE,
  REQUEST_PURCHASE,
  REQUEST_BATCH_PURCHASE,
  RESPOND_COUNTER_OFFER,
  // Incoming — Admin
  ADMIN_JOIN,
  TV_JOIN,
  SET_TV_MODE,
  START_DOOM_CLOCK,
  STOP_DOOM_CLOCK,
  CREATE_TENSION_SCALE,
  INCREMENT_TENSION_SCALE,
  END_TENSION_SCALE,
  CREATE_VOTE,
  CLOSE_VOTE,
  SHOW_IMAGE,
  SHOW_MAP,
  MAP_SET_FOG,
  MAP_VIEWPORT_UPDATE,
  MAP_FOG_CLEAR,
  MAP_FOG_RESET,
  MAP_TOKEN_MOVE,
  MAP_TOKEN_REMOVE,
  SEND_MESSAGE,
  SEND_DICE_RESULT,
  CREATE_MERCHANT,
  SHOW_MERCHANT,
  CLOSE_MERCHANT,
  RESPOND_PURCHASE,
  RESPOND_BATCH_PURCHASE,
  KICK_PLAYER,
  // Outgoing
  SESSION_JOINED,
  PLAYERS_SNAPSHOT,
  ADMIN_STATE,
  TV_SNAPSHOT,
  PLAYER_JOINED,
  PLAYER_LEFT,
  HP_UPDATED,
  HP_UPDATE_CONFIRMED,
  MAX_HP_UPDATE_CONFIRMED,
  CONCENTRATION_WARNING,
  CONCENTRATION_UPDATED,
  CONCENTRATION_CONFIRMED,
  INITIATIVE_UPDATED,
  INITIATIVE_CONFIRMED,
  CONDITIONS_UPDATED,
  TV_MODE_CHANGED,
  DOOM_CLOCK_STARTED,
  DOOM_CLOCK_STOPPED,
  TENSION_SCALE_UPDATED,
  TENSION_SCALE_ENDED,
  VOTE_STARTED,
  VOTE_UPDATED,
  VOTE_CLOSED,
  VOTE_SUBMITTED,
  VOTE_ERROR,
  MAP_STATE,
  MAP_FOG_UPDATED,
  MAP_VIEWPORT_CHANGED,
  MAP_FOG_PATCH,
  MAP_FOG_RESET_EVENT,
  MAP_TOKEN_MOVED,
  MAP_TOKEN_REMOVED,
  NEW_MESSAGE,
  DICE_RESULT,
  SESSION_EVENT,
  MERCHANT_CREATED,
  MERCHANT_SHOWN,
  MERCHANT_CLOSED,
  MERCHANT_UPDATED,
  MERCHANT_ITEMS_UPDATED,
  MERCHANT_DELETED,
  PURCHASE_REQUEST,
  PURCHASE_REQUESTED,
  PURCHASE_ERROR,
  PURCHASE_COUNTER_OFFER,
  PURCHASE_RESPONDED,
  BATCH_ACCEPTED,
  BATCH_REJECTED,
  COUNTER_OFFER_RESULT,
  COUNTER_OFFER_RESPONSE,
  LOBBY_BG_UPDATED,
  ROUND_UPDATED,
  TIMER_UPDATED,
  TIMER_STOPPED,
  PLAYER_ROLL_RESULT,
  PLAYER_ROLL_CONFIRMED,
  PLAYER_ROLL_HIDDEN_SENT,
  DEMO_RESET,
  KICKED,
  ERROR,
  TV_CONTROL_ERROR,
  SEND_ERROR,
}
