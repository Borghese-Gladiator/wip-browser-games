import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { RoomManager } from './rooms.js';
import { handleMessage } from './gateway.js';

// Recreates the gateway's Session shape with a capturing fake client so the
// lobby/game dispatch can be tested without a real WebSocket.
function fakeSession() {
  const sent = [];
  const client = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  return {
    client,
    playerId: crypto.randomUUID(),
    room: null,
    sent,
    send(obj) {
      client.send(JSON.stringify(obj));
    },
  };
}

const fakeEngine = {
  createGame: () => ({ players: [] }),
  addPlayer: (state, { id, name }) => {
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return { ...state, players: [...state.players, { id, name, seat: state.players.length }] };
  },
  publicState: (state, seat) => ({ players: state.players, mySeat: seat }),
};

const adapter = {
  engine: fakeEngine,
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: () => null,
  onMessage: (state, playerId, msg) => ({ ...state, lastMsg: msg, lastPlayer: playerId }),
};

describe('gateway handleMessage', () => {
  let manager;
  beforeEach(() => {
    manager = new RoomManager({ test: adapter });
  });

  it('lists open rooms', () => {
    manager.createRoom('test');
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:list', gameId: 'test' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'rooms' });
    expect(s.sent.at(-1).rooms).toHaveLength(1);
  });

  it('creates a room and replies joined with a code and seat', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const joined = s.sent.find((m) => m.t === 'joined');
    expect(joined.seat).toBe(0);
    expect(joined.code).toHaveLength(4);
    expect(s.room).not.toBeNull();
  });

  it('lets a second player join an existing room by code', () => {
    const host = fakeSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;

    const guest = fakeSession();
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });
    expect(guest.sent.find((m) => m.t === 'joined').seat).toBe(1);
  });

  it('errors when joining a bad code', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:join', gameId: 'test', code: 'ZZZZ', name: 'Bob' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error', message: 'room not found' });
  });

  it('routes a game message to the room engine and broadcasts state', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    s.sent.length = 0;
    handleMessage(manager, s, { t: 'game', cardId: 'X' });
    expect(s.room.state.lastMsg).toMatchObject({ cardId: 'X' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'state' });
  });

  it('rejects a game message before joining a room', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'game', cardId: 'X' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error', message: 'not in a room' });
  });

  it('keeps two rooms independent', () => {
    const a = fakeSession();
    const b = fakeSession();
    handleMessage(manager, a, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    handleMessage(manager, b, { t: 'lobby:create', gameId: 'test', name: 'Bob' });
    expect(a.room.code).not.toBe(b.room.code);
    handleMessage(manager, a, { t: 'game', cardId: 'fromA' });
    expect(b.room.state.lastMsg).toBeUndefined();
  });
});
