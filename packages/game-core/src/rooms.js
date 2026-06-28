// Generic, engine-agnostic room management. A Room holds one engine game state
// plus the members (seated players, bots, and spectators) attached to it.
// RoomManager owns many rooms across many games, keyed by a short join code.
//
// No socket I/O lives here — the gateway wires sockets in and reads room data
// out. The one effect a Room performs is sending engine messages through its
// adapter (applyMessage), which is pure with respect to the outside world.

import crypto from 'node:crypto';
import { makeBot, botActionFor } from './bots.js';
import { decideTimeout } from './timers.js';
import { validateOptions } from './options.js';
import { pickQuickMatchRoom } from './matchmaking.js';
import { hashState } from './observability.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity
const MAX_EVENT_LOG = 200;

function makeCode(taken) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
}

// One game table. `adapter` is the per-game contract (see games.js); `state` is
// whatever the engine's createGame(options) returned.
//
// Member kinds:
//   seated player — has a seat in engine state and (usually) a live socket.
//   bot           — has a seat in engine state, no socket; driven by the gateway.
//   spectator     — no seat; receives only the seatless public view (-1).
export class Room {
  // onGameEnd (optional): called with the adapter's outcome when a message
  // transitions the game into a terminal state. Wired by RoomManager.
  constructor(code, adapter, onGameEnd, options = {}, onGameStart = null) {
    this.code = code;
    this.adapter = adapter;
    this.options = validateOptions(adapter.optionsSchema, options);
    this.state = adapter.engine.createGame(this.options);
    // playerId -> { id, seat, client, isBot, isSpectator, lastPong, latencyMs }
    this.members = new Map();
    this.spectators = new Map(); // clientKey -> { client, lastPong, latencyMs }
    this.host = null; // playerId of the room host (first to join)
    this.locked = false; // host can lock to stop new joins
    this.turnStartedAt = null; // ms timestamp the current active seat began
    this._lastActiveSeat = null;
    this._onGameEnd = onGameEnd;
    this.createdAt = Date.now();
    this.eventLog = [];
    this._eventSeq = 0;
    this.phaseEnteredAt = null;
    this._onGameStart = onGameStart;
    this._gameStarted = false;
  }

  get playerCount() {
    return this.state.players.length;
  }

  get isFull() {
    return this.playerCount >= this.adapter.maxPlayers;
  }

  get botSeats() {
    const seats = new Set();
    for (const m of this.members.values()) {
      if (m.isBot) seats.add(m.seat);
    }
    return seats;
  }

  // Seats with a connected, recently-ponging human. Bots count as live (always
  // responsive); humans are live until the heartbeat reaps them.
  liveSeats(now, deadAfterMs) {
    const seats = new Set();
    for (const m of this.members.values()) {
      if (m.isSpectator) continue;
      if (m.isBot || now - m.lastPong < deadAfterMs) seats.add(m.seat);
    }
    return seats;
  }

  // Seat a player. The first human to join becomes the host. Throws (via the
  // engine) if the name is taken or the table is full. Returns the assigned seat.
  // Fires the adapter's autoStart when at capacity.
  addPlayer(playerId, name, client, { now = Date.now() } = {}) {
    if (this.locked && !this.state.players.some((p) => p.id === playerId)) {
      throw new Error('room locked');
    }
    // Reconnect: player already seated in engine state — restore the socket
    // reference only; engine state (including per-seat private state) is intact.
    const existing = this.state.players.find((p) => p.id === playerId);
    if (existing) {
      this.members.set(playerId, {
        id: playerId, seat: existing.seat, client,
        isBot: false, isSpectator: false, lastPong: now, latencyMs: 0,
      });
      return existing.seat;
    }
    this.state = this.adapter.engine.addPlayer(this.state, { id: playerId, name });
    const seat = this.state.players.find((p) => p.id === playerId).seat;
    this.members.set(playerId, {
      id: playerId, seat, client,
      isBot: false, isSpectator: false, lastPong: now, latencyMs: 0,
    });
    if (this.host === null) this.host = playerId;
    this._maybeAutoStart();
    return seat;
  }

  // Seat a bot in the next open seat. No socket; the gateway drives its moves.
  addBot(index) {
    const { id, name } = makeBot(index);
    this.state = this.adapter.engine.addPlayer(this.state, { id, name });
    const seat = this.state.players.find((p) => p.id === id).seat;
    this.members.set(id, {
      id, seat, client: null, isBot: true, isSpectator: false,
      lastPong: Infinity, latencyMs: 0,
    });
    this._maybeAutoStart();
    return seat;
  }

  // Fill every remaining open seat with bots, then start. Used by quick-match and
  // by the host's "start early" control so a quiet table is still playable.
  fillWithBots() {
    let added = 0;
    while (!this.isFull) {
      this.addBot(this.playerCount);
      added++;
    }
    return added;
  }

  // Attach a spectator (no seat). Keyed by an arbitrary client key so multiple
  // spectators on one room are tracked independently.
  addSpectator(clientKey, client, { now = Date.now() } = {}) {
    this.spectators.set(clientKey, { client, lastPong: now, latencyMs: 0 });
  }

  removeSpectator(clientKey) {
    this.spectators.delete(clientKey);
  }

  removePlayer(playerId) {
    this.members.delete(playerId);
  }

  // Host-only kick: drop a member and remove their seat from engine state so the
  // seat frees up. (We can't un-deal cards mid-hand cleanly, so a kick before the
  // hand starts simply removes them; mid-hand the adapter's timeout/forfeit path
  // handles the seat going dark.)
  kick(requesterId, targetId) {
    this._assertHost(requesterId);
    if (targetId === this.host) throw new Error('cannot kick the host');
    this.members.delete(targetId);
  }

  lock(requesterId, locked) {
    this._assertHost(requesterId);
    this.locked = !!locked;
  }

  // Host starts before the table is full. Requires the adapter's minPlayers of
  // real members (humans + bots); fills the rest with bots, then starts.
  startEarly(requesterId) {
    this._assertHost(requesterId);
    if (this.playerCount < this.adapter.minPlayers) {
      throw new Error('not enough players to start');
    }
    this.fillWithBots();
    this._maybeAutoStart();
  }

  _assertHost(requesterId) {
    if (requesterId !== this.host) throw new Error('host only');
  }

  _maybeAutoStart() {
    // Idempotent: once the game has started, don't ask the adapter to start
    // again. autoStart calls the engine's start (e.g. poker.startHand), which
    // throws "hand in progress" mid-hand. startEarly fills with bots — the last
    // seat already auto-starts — so a second call here would otherwise throw and
    // abort the host:start handler before it can broadcast the started state.
    if (this._gameStarted) return;
    const started = this.adapter.autoStart?.(this.state);
    if (started) {
      this.state = started;
      this.phaseEnteredAt = Date.now();
      if (this._onGameStart) this._onGameStart();
      this._gameStarted = true;
    }
  }

  // Only bots and spectators left → no live human; the room can be reaped.
  get isEmpty() {
    return this.members.size === 0 && this.spectators.size === 0;
  }

  get hasHumanMembers() {
    for (const m of this.members.values()) {
      if (!m.isBot) return true;
    }
    return false;
  }

  // Route a game message through the adapter, mutating room state. When a message
  // moves the game into a terminal state, fire onGameEnd exactly once for that
  // game (edge-triggered: a terminal state already recorded won't re-fire).
  applyMessage(playerId, msg, { now = Date.now() } = {}) {
    if (this.adapter.anticheat) {
      const reason = this.adapter.anticheat(this.state, playerId, msg);
      if (reason) throw new Error(`anticheat: ${reason}`);
    }
    const before = this._onGameEnd && this.adapter.getOutcome
      ? this.adapter.getOutcome(this.state)
      : null;
    const phaseBefore = this.state?.phase;
    this.state = this.adapter.onMessage(this.state, playerId, msg);
    const phaseAfter = this.state?.phase;
    if (phaseAfter !== phaseBefore) this.phaseEnteredAt = now;
    this._refreshTurnClock(now);
    const entry = { seq: this._eventSeq++, ts: now, playerId, msg, stateHash: hashState(this.state) };
    if (this.eventLog.length >= MAX_EVENT_LOG) this.eventLog.shift();
    this.eventLog.push(entry);
    if (this._onGameEnd && this.adapter.getOutcome) {
      const after = this.adapter.getOutcome(this.state);
      if (after && !before) this._onGameEnd(after);
    }
  }

  // Reset the turn clock whenever the active seat changes, so each player gets a
  // fresh budget for their own turn (and a stalled seat is measured from when its
  // turn began, not from the last message).
  _refreshTurnClock(now) {
    const seat = this.adapter.activeSeat?.(this.state);
    if (seat !== this._lastActiveSeat) {
      this._lastActiveSeat = seat;
      this.turnStartedAt = seat != null && seat >= 0 ? now : null;
    }
  }

  // Record a pong from a member or spectator and update its latency. `sentAt` is
  // the timestamp the gateway stamped on the matching ping.
  recordPong(clientKey, { now = Date.now(), sentAt } = {}) {
    const member = this.members.get(clientKey);
    const target = member ?? this.spectators.get(clientKey);
    if (!target) return;
    target.lastPong = now;
    if (sentAt != null) target.latencyMs = now - sentAt;
  }

  // One heartbeat tick of room logic (pure w.r.t. sockets — returns intents the
  // gateway executes). Reaps dead human members (freeing their seat from the
  // member map), then asks the timer whether the active seat should be auto-acted.
  // Returns { reaped: [playerId], timeout: {seat,msg,reason}|null, botMsg }.
  tick({ now = Date.now(), deadAfterMs, graceMs, forfeitMs }) {
    const reaped = [];
    for (const [id, m] of this.members) {
      if (m.isBot || m.isSpectator) continue;
      if (now - m.lastPong >= deadAfterMs) {
        this.members.delete(id);
        reaped.push(id);
      }
    }
    for (const [key, s] of this.spectators) {
      if (now - s.lastPong >= deadAfterMs) this.spectators.delete(key);
    }

    // Liveness for turn purposes uses the (shorter) grace window, not the dead
    // window: a player silent past grace is "dark" and may be auto-acted on even
    // though their seat isn't reaped until deadAfterMs.
    const liveSeats = this.liveSeats(now, graceMs);
    const timeout = decideTimeout(
      { state: this.state, adapter: this.adapter, turnStartedAt: this.turnStartedAt, liveSeats },
      { now, graceMs, forfeitMs },
    );

    // A bot whose turn it is plays automatically (independent of timeouts).
    const botMsg = botActionFor(this.state, this.adapter, this.botSeats);
    const botSeat = botMsg ? this.adapter.activeSeat(this.state) : null;

    return { reaped, timeout, botMsg, botSeat };
  }

  // Public lobby view of this room.
  summary() {
    return {
      code: this.code,
      players: this.playerCount,
      max: this.adapter.maxPlayers,
      locked: this.locked,
      host: this.host,
    };
  }

  // Per-seat public view for a member; spectators (and unknown ids) get the
  // seatless view (-1), which the engine renders with no private per-seat data.
  viewFor(playerId) {
    const member = this.members.get(playerId);
    const seat = member ? member.seat : -1;
    return this.adapter.engine.publicState(this.state, seat);
  }

  // Presence/latency snapshot the gateway can broadcast (drives presence dots).
  presence() {
    const out = [];
    for (const m of this.members.values()) {
      if (m.isSpectator) continue;
      out.push({ seat: m.seat, isBot: m.isBot, latencyMs: m.latencyMs });
    }
    return out;
  }

  // Serializable snapshot of the room for the persistence seam. Live socket
  // references are dropped; members keep only the durable seat/identity fields.
  snapshot() {
    return {
      code: this.code,
      gameId: this.gameId,
      options: this.options,
      state: this.state,
      eventLog: this.eventLog,
      _eventSeq: this._eventSeq,
      host: this.host,
      locked: this.locked,
      turnStartedAt: this.turnStartedAt,
      _lastActiveSeat: this._lastActiveSeat,
      createdAt: this.createdAt,
      phaseEnteredAt: this.phaseEnteredAt,
      _gameStarted: this._gameStarted,
      members: [...this.members.entries()].map(([id, m]) => ({ id, seat: m.seat, isBot: m.isBot })),
    };
  }

  // Rebuild a Room from a snapshot. Engine state is restored verbatim; members
  // come back without sockets (humans must reconnect, which restores client refs).
  static fromSnapshot(snap, adapter, onGameEnd, onGameStart) {
    const room = new Room(snap.code, adapter, onGameEnd, snap.options, onGameStart);
    room.state = snap.state;
    room.eventLog = snap.eventLog ?? [];
    room._eventSeq = snap._eventSeq ?? room.eventLog.length;
    room.host = snap.host;
    room.locked = snap.locked;
    room.turnStartedAt = snap.turnStartedAt;
    room._lastActiveSeat = snap._lastActiveSeat;
    room.createdAt = snap.createdAt;
    room.phaseEnteredAt = snap.phaseEnteredAt;
    room._gameStarted = snap._gameStarted;
    for (const m of snap.members ?? []) {
      room.members.set(m.id, {
        id: m.id, seat: m.seat, isBot: m.isBot,
        client: null, isSpectator: false, lastPong: Date.now(), latencyMs: 0,
      });
    }
    return room;
  }
}

export class RoomManager {
  constructor(adapters, { onGameEnd, onGameStart } = {}) {
    this.adapters = adapters; // gameId -> adapter
    this.rooms = new Map(); // code -> Room
    this._onGameEnd = onGameEnd; // (outcome, { gameId, roomCode }) => void
    this._onGameStart = onGameStart; // ({ gameId, roomCode }) => void
  }

  createRoom(gameId, options = {}) {
    const adapter = this.adapters[gameId];
    if (!adapter) throw new Error(`unknown game: ${gameId}`);
    if (adapter.enabled === false) throw new Error(`game ${gameId} is disabled`);
    const code = makeCode(this.rooms);
    const cb = this._onGameEnd
      ? (outcome) => this._onGameEnd(outcome, { gameId, roomCode: code })
      : undefined;
    const startCb = this._onGameStart
      ? () => this._onGameStart({ gameId, roomCode: code })
      : undefined;
    const room = new Room(code, adapter, cb, options, startCb);
    room.gameId = gameId;
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('room not found');
    return room;
  }

  // Re-seat a room from a persisted snapshot on startup. Skips unknown or
  // now-disabled games rather than reviving a room nobody can join.
  restoreRoom(snap) {
    const adapter = this.adapters[snap.gameId];
    if (!adapter || adapter.enabled === false) return;
    const cb = this._onGameEnd
      ? (outcome) => this._onGameEnd(outcome, { gameId: snap.gameId, roomCode: snap.code })
      : undefined;
    const startCb = this._onGameStart
      ? () => this._onGameStart({ gameId: snap.gameId, roomCode: snap.code })
      : undefined;
    const room = Room.fromSnapshot(snap, adapter, cb, startCb);
    room.gameId = snap.gameId;
    this.rooms.set(snap.code, room);
  }

  // Open rooms (not full, not locked) for a given game, for the lobby list.
  listRooms(gameId) {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.gameId === gameId && !room.isFull && !room.locked) {
        out.push(room.summary());
      }
    }
    return out;
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  // Quick-match ("Play now"): pick the fullest open room for this game, or create
  // a fresh one when none is joinable. Returns the Room; the gateway seats the
  // player into it. Pure selection lives in matchmaking.js.
  quickMatch(gameId, options = {}) {
    const open = this.listRooms(gameId);
    const code = pickQuickMatchRoom(open);
    return code ? this.getRoom(code) : this.createRoom(gameId, options);
  }

  // Empty-room garbage collection: drop any room with no live humans (a room of
  // only bots is dead too) and no spectators. Called by the gateway after each
  // heartbeat tick.
  reapEmptyRooms() {
    const removed = [];
    for (const [code, room] of this.rooms) {
      if (!room.hasHumanMembers && room.spectators.size === 0) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
