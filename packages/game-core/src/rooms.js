// Generic, engine-agnostic room management. A Room holds one engine game state
// plus the sockets seated at it. RoomManager owns many rooms across many games,
// keyed by a short join code. No I/O here — the gateway wires sockets in.

import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity

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
// whatever the engine's createGame() returned.
export class Room {
  constructor(code, adapter) {
    this.code = code;
    this.adapter = adapter;
    this.state = adapter.engine.createGame();
    this.members = new Map(); // playerId -> { id, seat, client }
  }

  get playerCount() {
    return this.state.players.length;
  }

  get isFull() {
    return this.playerCount >= this.adapter.maxPlayers;
  }

  // Seat a player. Throws (via the engine) if the name is taken or table full.
  // Returns the assigned seat. Fires the adapter's autoStart when at capacity.
  addPlayer(playerId, name, client) {
    this.state = this.adapter.engine.addPlayer(this.state, { id: playerId, name });
    const seat = this.state.players.find((p) => p.id === playerId).seat;
    this.members.set(playerId, { id: playerId, seat, client });
    const started = this.adapter.autoStart?.(this.state);
    if (started) this.state = started;
    return seat;
  }

  removePlayer(playerId) {
    this.members.delete(playerId);
  }

  get isEmpty() {
    return this.members.size === 0;
  }

  // Route a game message through the adapter, mutating room state.
  applyMessage(playerId, msg) {
    this.state = this.adapter.onMessage(this.state, playerId, msg);
  }

  // Per-seat public view for a member.
  viewFor(playerId) {
    const member = this.members.get(playerId);
    const seat = member ? member.seat : -1;
    return this.adapter.engine.publicState(this.state, seat);
  }
}

export class RoomManager {
  constructor(adapters) {
    this.adapters = adapters; // gameId -> adapter
    this.rooms = new Map(); // code -> Room
  }

  createRoom(gameId) {
    const adapter = this.adapters[gameId];
    if (!adapter) throw new Error(`unknown game: ${gameId}`);
    const code = makeCode(this.rooms);
    const room = new Room(code, adapter);
    room.gameId = gameId;
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('room not found');
    return room;
  }

  // Open rooms (not full) for a given game, for the lobby list.
  listRooms(gameId) {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.gameId === gameId && !room.isFull) {
        out.push({ code: room.code, players: room.playerCount, max: room.adapter.maxPlayers });
      }
    }
    return out;
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }
}
