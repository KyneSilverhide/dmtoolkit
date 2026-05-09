/**
 * Named constants for all Socket.IO events in the application.
 *
 * Usage (backend):
 *   const EVENTS = require('./socket-events')
 *   socket.emit(EVENTS.HP_UPDATED, { playerId, newHp })
 *
 * All new code should import from this file rather than using string literals,
 * to prevent typos and make event names discoverable via IDE autocomplete.
 *
 * Socket room naming convention:
 *   - `session:<sessionId>` — all players in a session
 *   - `admin:<sessionId>`   — the MJ/DM managing the session
 *   - `tv:<sessionId>`      — TV display screen(s)
 */

// ── Incoming events: Player → Server ────────────────────────────────────────

/** Player joins a session: { code, playerName, ac, hp, dndClass, avatarUrl } */
const JOIN_SESSION = 'join-session'

/** Player leaves the session voluntarily */
const LEAVE_SESSION = 'leave-session'

/** Player updates their current HP: { newHp } */
const UPDATE_HP = 'update-hp'

/** Player updates their conditions: { conditions } */
const UPDATE_CONDITIONS = 'update-conditions'

/** Player toggles concentration: { isConcentrating } */
const UPDATE_CONCENTRATION = 'update-concentration'

/** Player updates their initiative: { initiative } */
const UPDATE_INITIATIVE = 'update-initiative'

/** Player submits a vote: { voteId, optionIndex } */
const SUBMIT_VOTE = 'submit-vote'

/** Player requests purchase of a single item (legacy): { itemId, quantity } */
const REQUEST_PURCHASE = 'request-purchase'

/** Player requests batch purchase (cart): { items: [{itemId, quantity}] } */
const REQUEST_BATCH_PURCHASE = 'request-batch-purchase'

/** Player responds to a counter-offer: { requestId, accept } */
const RESPOND_COUNTER_OFFER = 'respond-counter-offer'

// ── Incoming events: Admin → Server ─────────────────────────────────────────

/** Admin joins their session room and receives a snapshot: (sessionId) */
const ADMIN_JOIN = 'admin-join'

/** TV display joins a session room: { sessionCode } */
const TV_JOIN = 'tv-join'

/** Admin changes the TV display mode: { sessionId, mode } */
const SET_TV_MODE = 'set-tv-mode'

/** Admin starts the doom clock: { sessionId, title, durationSeconds } */
const START_DOOM_CLOCK = 'start-doom-clock'

/** Admin stops the doom clock: { sessionId } */
const STOP_DOOM_CLOCK = 'stop-doom-clock'

/** Admin creates a tension scale: { sessionId, title, steps, direction, vibrationEnabled } */
const CREATE_TENSION_SCALE = 'create-tension-scale'

/** Admin advances the tension scale by one step: { sessionId } */
const INCREMENT_TENSION_SCALE = 'increment-tension-scale'

/** Admin ends the tension scale: { sessionId } */
const END_TENSION_SCALE = 'end-tension-scale'

/** Admin creates a vote: { sessionId, question, options, isAnonymous } */
const CREATE_VOTE = 'create-vote'

/** Admin manually closes the active vote: { sessionId } */
const CLOSE_VOTE = 'close-vote'

/** Admin displays an image on the TV: { sessionId, imageUrl } */
const SHOW_IMAGE = 'show-image'

/** Admin displays a battlemap on the TV: { sessionId, imageUrl } */
const SHOW_MAP = 'show-map'

/** Admin toggles the battlemap fog of war: { sessionId, enabled } */
const MAP_SET_FOG = 'map-set-fog'

/** Admin updates the battlemap viewport: { sessionId, xn, yn, scale } */
const MAP_VIEWPORT_UPDATE = 'map-viewport-update'

/** Admin reveals fog areas (adds strokes): { sessionId, strokes } */
const MAP_FOG_CLEAR = 'map-fog-clear'

/** Admin resets the fog (covers entire map): { sessionId } */
const MAP_FOG_RESET = 'map-fog-reset'

/** Admin moves a player token on the map: { sessionId, playerId, nx, ny, name } */
const MAP_TOKEN_MOVE = 'map-token-move'

/** Admin removes a player token from the map: { sessionId, playerId } */
const MAP_TOKEN_REMOVE = 'map-token-remove'

/** Admin sends a message to one or all players: { sessionId, toPlayerId?, type, content, voiceStyle, textEffect, authorName } */
const SEND_MESSAGE = 'send-message'

/** Admin sends a dice roll result to one or all players: { sessionId, combatType, rollValue, resultText, toPlayerId? } */
const SEND_DICE_RESULT = 'send-dice-result'

/** Admin creates a merchant: { sessionId, name, description, items } */
const CREATE_MERCHANT = 'create-merchant'

/** Admin shows a merchant on the TV: { sessionId, merchantId } */
const SHOW_MERCHANT = 'show-merchant'

/** Admin closes the merchant view: { sessionId } */
const CLOSE_MERCHANT = 'close-merchant'

/** Admin responds to a single-item purchase request (legacy): { requestId, action, finalPrice? } */
const RESPOND_PURCHASE = 'respond-purchase'

/** Admin responds to a batch purchase request: { batchId, action, finalPrice? } */
const RESPOND_BATCH_PURCHASE = 'respond-batch-purchase'

/** Admin kicks a player from the session: { playerId } */
const KICK_PLAYER = 'kick-player'

// ── Outgoing events: Server → Client ────────────────────────────────────────

/** Sent to player on successful join: { session, player, activeMerchant? } */
const SESSION_JOINED = 'session-joined'

/** Sent to admin with initial player list: { sessionId, players } */
const PLAYERS_SNAPSHOT = 'players-snapshot'

/** Sent to admin with full session state: { sessionId, tvMode, doomClock, tensionScale, activeVote, activeMerchant, mapState } */
const ADMIN_STATE = 'admin-state'

/** Sent to TV with full session state: { session, players, tvMode, ... } */
const TV_SNAPSHOT = 'tv-snapshot'

/** Sent to admin + TV when a player joins: (player row) */
const PLAYER_JOINED = 'player-joined'

/** Sent to admin + TV when a player leaves or is kicked: { playerId } */
const PLAYER_LEFT = 'player-left'

/** Sent to admin + TV when player HP changes: { playerId, newHp } */
const HP_UPDATED = 'hp-updated'

/** Sent to player confirming HP update: { newHp } */
const HP_UPDATE_CONFIRMED = 'hp-update-confirmed'

/** Sent to player when taking damage while concentrating: { damage, dc } */
const CONCENTRATION_WARNING = 'concentration-warning'

/** Sent to admin + TV when concentration changes: { playerId, isConcentrating } */
const CONCENTRATION_UPDATED = 'concentration-updated'

/** Sent to player confirming concentration update: { isConcentrating } */
const CONCENTRATION_CONFIRMED = 'concentration-confirmed'

/** Sent to admin + TV when initiative changes: { playerId, initiative } */
const INITIATIVE_UPDATED = 'initiative-updated'

/** Sent to player confirming initiative update: { initiative } */
const INITIATIVE_CONFIRMED = 'initiative-confirmed'

/** Sent to admin + TV when conditions change: { playerId, conditions } */
const CONDITIONS_UPDATED = 'conditions-updated'

/** Sent to TV + admin when the TV display mode changes: { mode, ...extra } */
const TV_MODE_CHANGED = 'tv-mode-changed'

/** Sent to TV + admin when the doom clock starts: { title, endAt } */
const DOOM_CLOCK_STARTED = 'doom-clock-started'

/** Sent to TV + admin when the doom clock stops */
const DOOM_CLOCK_STOPPED = 'doom-clock-stopped'

/** Sent to TV + admin when the tension scale is updated: { title, steps, level, direction, vibrationEnabled } */
const TENSION_SCALE_UPDATED = 'tension-scale-updated'

/** Sent to TV + admin when the tension scale ends */
const TENSION_SCALE_ENDED = 'tension-scale-ended'

/** Sent to TV + session + admin when a vote is created: (voteState) */
const VOTE_STARTED = 'vote-started'

/** Sent to TV + admin with updated vote results: (voteState) */
const VOTE_UPDATED = 'vote-updated'

/** Sent to TV + session + admin when a vote is closed: (voteState) */
const VOTE_CLOSED = 'vote-closed'

/** Sent to player confirming their vote: { optionIndex } */
const VOTE_SUBMITTED = 'vote-submitted'

/** Sent to player on vote error: { message } */
const VOTE_ERROR = 'vote-error'

/** Sent to TV + admin with full battlemap state: { mapUrl, fogEnabled, viewport, fogStrokes, mapTokens } */
const MAP_STATE = 'map-state'

/** Sent to TV + admin when fog is toggled: { enabled } */
const MAP_FOG_UPDATED = 'map-fog-updated'

/** Sent to TV when the viewport changes: { xn, yn, scale } */
const MAP_VIEWPORT_CHANGED = 'map-viewport-changed'

/** Sent to TV + admin with new fog-reveal strokes: { strokes } */
const MAP_FOG_PATCH = 'map-fog-patch'

/** Sent to TV + admin when fog is fully reset */
const MAP_FOG_RESET_EVENT = 'map-fog-reset'

/** Sent to TV + admin when a token is moved: { playerId, nx, ny, name? } */
const MAP_TOKEN_MOVED = 'map-token-moved'

/** Sent to TV + admin when a token is removed: { playerId } */
const MAP_TOKEN_REMOVED = 'map-token-removed'

/** Sent to player(s) with a new DM message: { fromName, type, content, voiceStyle, textEffect, sentAt } */
const NEW_MESSAGE = 'new-message'

/** Sent to player(s) with a dice roll result: { combatType, rollValue, resultText, createdAt } */
const DICE_RESULT = 'dice-result'

/** Sent to admin recording a session event (join/leave/damage/heal/death): { eventType, description, playerName, value?, createdAt } */
const SESSION_EVENT = 'session-event'

/** Sent to admin after merchant creation: (merchantData) */
const MERCHANT_CREATED = 'merchant-created'

/** Sent to session (players) when a merchant is shown: (merchantData) */
const MERCHANT_SHOWN = 'merchant-shown'

/** Sent to session (players) when the merchant is closed */
const MERCHANT_CLOSED = 'merchant-closed'

/** Sent to admin with updated merchant data: (merchantData) */
const MERCHANT_UPDATED = 'merchant-updated'

/** Sent to TV + session when merchant stock changes: (merchantData) */
const MERCHANT_ITEMS_UPDATED = 'merchant-items-updated'

/** Sent to admin with a player's purchase request: (requestData) */
const PURCHASE_REQUEST = 'purchase-request'

/** Sent to player confirming their purchase request: { requestId?, batchId?, ... } */
const PURCHASE_REQUESTED = 'purchase-requested'

/** Sent to player on purchase error: { message } */
const PURCHASE_ERROR = 'purchase-error'

/** Sent to player with admin's counter-offer: { requestId, action, finalPrice, itemName } */
const PURCHASE_COUNTER_OFFER = 'purchase-counter-offer'

/** Sent to admin confirming purchase response: { requestId?, batchId?, action, ... } */
const PURCHASE_RESPONDED = 'purchase-responded'

/** Sent to player when their purchase/batch is accepted: { items, totalPrice, batchId? } */
const BATCH_ACCEPTED = 'batch-accepted'

/** Sent to player when their purchase/batch is rejected: { items, batchId? } */
const BATCH_REJECTED = 'batch-rejected'

/** Sent to player with result of their counter-offer response: { requestId, accepted, itemName, finalPrice? } */
const COUNTER_OFFER_RESULT = 'counter-offer-result'

/** Sent to admin when player responds to a counter-offer: { requestId, accepted, playerName } */
const COUNTER_OFFER_RESPONSE = 'counter-offer-response'

/** Sent to a player when they are kicked from the session */
const KICKED = 'kicked'

/** Generic error event: { message } */
const ERROR = 'error'

/** Error in TV control operations: { message } */
const TV_CONTROL_ERROR = 'tv-control-error'

/** Error when sending a message/dice result: { message } */
const SEND_ERROR = 'send-error'

module.exports = {
  // Incoming — Player
  JOIN_SESSION,
  LEAVE_SESSION,
  UPDATE_HP,
  UPDATE_CONDITIONS,
  UPDATE_CONCENTRATION,
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
  PURCHASE_REQUEST,
  PURCHASE_REQUESTED,
  PURCHASE_ERROR,
  PURCHASE_COUNTER_OFFER,
  PURCHASE_RESPONDED,
  BATCH_ACCEPTED,
  BATCH_REJECTED,
  COUNTER_OFFER_RESULT,
  COUNTER_OFFER_RESPONSE,
  KICKED,
  ERROR,
  TV_CONTROL_ERROR,
  SEND_ERROR,
}
