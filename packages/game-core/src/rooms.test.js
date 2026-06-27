import { describe, it, expect } from 'vitest';
import { RoomManager } from './rooms.js';

// A tiny fake engine so room/manager behavior is tested without real game logic.
const fakeEngine = {
  createGame: () => ({ players: [], started: false }),
  addPlayer: (state, { id, name }) => {
    if (state.players.length >= 4) throw new Error('table full');
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return {
      ...state,
      players: [...state.players, { id, name, seat: state.players.length }],
    };
  },
  publicState: (state, seat) => ({ players: state.players, started: state.started, mySeat: seat }),
};

function makeAdapter(overrides = {}) {
  return {
    engine: fakeEngine,
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: (state) => (state.players.length === 4 ? { ...state, started: true } : null),
    onMessage: (state) => state,
    ...overrides,
  };
}

function manager() {
  return new RoomManager({ test: makeAdapter() });
}

describe('RoomManager', () => {
  it('creates a room with a unique 4-char code', () => {
    const m = manager();
    const a = m.createRoom('test');
    const b = m.createRoom('test');
    expect(a.code).toHaveLength(4);
    expect(a.code).not.toBe(b.code);
  });

  it('rejects an unknown game', () => {
    expect(() => manager().createRoom('nope')).toThrow(/unknown game/);
  });

  it('assigns sequential seats as players join', () => {
    const room = manager().createRoom('test');
    expect(room.addPlayer('p1', 'Alice', {})).toBe(0);
    expect(room.addPlayer('p2', 'Bob', {})).toBe(1);
  });

  it('rejects a player past max capacity', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'A', {});
    room.addPlayer('p2', 'B', {});
    room.addPlayer('p3', 'C', {});
    room.addPlayer('p4', 'D', {});
    expect(() => room.addPlayer('p5', 'E', {})).toThrow(/table full/);
  });

  it('fires autoStart when the room reaches capacity', () => {
    const room = manager().createRoom('test');
    for (const [id, n] of [['p1', 'A'], ['p2', 'B'], ['p3', 'C']]) room.addPlayer(id, n, {});
    expect(room.state.started).toBe(false);
    room.addPlayer('p4', 'D', {});
    expect(room.state.started).toBe(true);
  });

  it('keeps rooms isolated from one another', () => {
    const m = manager();
    const r1 = m.createRoom('test');
    const r2 = m.createRoom('test');
    r1.addPlayer('p1', 'Alice', {});
    expect(r1.playerCount).toBe(1);
    expect(r2.playerCount).toBe(0);
  });

  it('lists only open (non-full) rooms for a game', () => {
    const m = manager();
    const full = m.createRoom('test');
    for (const [id, n] of [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]) {
      full.addPlayer(id, n, {});
    }
    const open = m.createRoom('test');
    open.addPlayer('e', 'E', {});
    const listed = m.listRooms('test');
    expect(listed.map((r) => r.code)).toEqual([open.code]);
    expect(listed[0]).toMatchObject({ players: 1, max: 4 });
  });

  it('viewFor returns the caller seat', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', {});
    room.addPlayer('p2', 'Bob', {});
    expect(room.viewFor('p2').mySeat).toBe(1);
  });
});
