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

  it('reconnecting player reclaims the same seat without re-adding to engine state', () => {
    const room = manager().createRoom('test');
    const fakeClient = { readyState: 1, send: () => {} };
    room.addPlayer('p1', 'Alice', fakeClient);
    room.removePlayer('p1'); // simulate disconnect
    const seat = room.addPlayer('p1', 'Alice', fakeClient); // reconnect
    expect(seat).toBe(0);
    expect(room.state.players).toHaveLength(1); // not double-added
  });
});

// --- Rooms / matchmaking platform layer ---------------------------------

// A fake engine with a turn pointer so timeout/bot driving can be exercised.
const turnEngine = {
  createGame: (options = {}) => ({ players: [], turn: 0, log: [], options }),
  addPlayer: (state, { id, name }) => ({
    ...state,
    players: [...state.players, { id, name, seat: state.players.length }],
  }),
  publicState: (state, seat) => ({ turn: state.turn, mySeat: seat, log: state.log }),
};

function turnAdapter(overrides = {}) {
  return {
    engine: turnEngine,
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: () => null,
    onMessage: (state, playerId, msg) => ({
      ...state,
      turn: (state.turn + 1) % state.players.length,
      log: [...state.log, { playerId, msg }],
    }),
    activeSeat: (state) => (state.players.length ? state.turn : -1),
    timeoutAction: (_state, seat) => ({ skip: seat }),
    botMove: (_state, seat) => ({ bot: seat }),
    optionsSchema: { stakes: { type: 'enum', values: ['low', 'high'], default: 'low' } },
    ...overrides,
  };
}

const mgr = () => new RoomManager({ test: turnAdapter() });

describe('Room host controls', () => {
  it('makes the first human the host', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    expect(room.host).toBe('h');
  });

  it('lets the host lock the room, blocking new joins', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.lock('h', true);
    expect(() => room.addPlayer('g', 'Guest', {})).toThrow(/room locked/);
  });

  it('rejects host controls from a non-host', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    expect(() => room.lock('g', true)).toThrow(/host only/);
    expect(() => room.kick('g', 'h')).toThrow(/host only/);
  });

  it('kicks a member but never the host', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    room.kick('h', 'g');
    expect(room.members.has('g')).toBe(false);
    expect(() => room.kick('h', 'h')).toThrow(/cannot kick the host/);
  });

  it('start-early fills empty seats with bots and starts', () => {
    // autoStart that flips a started flag without dropping the players array.
    const m = new RoomManager({
      test: turnAdapter({ autoStart: (state) => ({ ...state, started: true }) }),
    });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    room.startEarly('h');
    expect(room.isFull).toBe(true);
    expect(room.botSeats.size).toBe(2);
    expect(room.state.started).toBe(true);
  });

  it('start-early requires minPlayers', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    expect(() => room.startEarly('h')).toThrow(/not enough players/);
  });
});

describe('Room bots & spectators', () => {
  it('fills remaining seats with bots', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    expect(room.fillWithBots()).toBe(3);
    expect(room.isFull).toBe(true);
    expect(room.botSeats).toEqual(new Set([1, 2, 3]));
  });

  it('a spectator never receives another seat private view', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addSpectator('spec:x', {});
    // viewFor an unknown id is the seatless view.
    expect(room.viewFor('spec:x').mySeat).toBe(-1);
  });

  it('counts a bot-only room as having no humans (for GC)', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.fillWithBots();
    expect(room.hasHumanMembers).toBe(true);
    room.removePlayer('h');
    expect(room.hasHumanMembers).toBe(false);
  });
});

describe('Room.tick (heartbeat-driven)', () => {
  const tickOpts = { deadAfterMs: 100, graceMs: 50, forfeitMs: 1000 };

  it('reaps a member whose pong is stale', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {}, { now: 0 });
    room.addPlayer('g', 'Guest', {}, { now: 0 });
    const { reaped } = room.tick({ now: 200, ...tickOpts });
    // Neither has ponged since now=0, so both are >100ms stale.
    expect(reaped.sort()).toEqual(['g', 'h']);
    expect(room.members.size).toBe(0);
  });

  it('keeps a member alive after a fresh pong', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {}, { now: 0 });
    room.recordPong('h', { now: 180 });
    const { reaped } = room.tick({ now: 200, ...tickOpts });
    expect(reaped).toEqual([]);
  });

  it('auto-acts (timeout) for the active seat when its player is dark', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {}, { now: 0 });
    room.addPlayer('g', 'Guest', {}, { now: 0 });
    // Host (seat 0) keeps ponging; guest (seat 1) goes dark. Make it seat 1's turn.
    room.state.turn = 1;
    room.turnStartedAt = 0;
    room.recordPong('h', { now: 190 });
    const { timeout } = room.tick({ now: 200, ...tickOpts });
    // seat 0 still live; seat 1 dark and past grace -> timeout for seat 1.
    expect(timeout).toMatchObject({ seat: 1, reason: 'disconnect' });
  });

  it('drives a bot move on the bot seat turn', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {}, { now: 0 });
    room.fillWithBots(); // seats 1..3 are bots
    room.state.turn = 1;
    room.recordPong('h', { now: 0 });
    const { botMsg, botSeat } = room.tick({ now: 0, ...tickOpts });
    expect(botSeat).toBe(1);
    expect(botMsg).toEqual({ bot: 1 });
  });
});

describe('RoomManager quick-match & GC', () => {
  it('creates a fresh room when none is open', () => {
    const m = mgr();
    const room = m.quickMatch('test');
    expect(room.playerCount).toBe(0);
    expect(m.rooms.size).toBe(1);
  });

  it('reuses the fullest open room instead of creating one', () => {
    const m = mgr();
    const a = m.createRoom('test');
    a.addPlayer('p1', 'A', {});
    a.addPlayer('p2', 'B', {});
    const b = m.createRoom('test');
    b.addPlayer('p3', 'C', {});
    expect(m.quickMatch('test').code).toBe(a.code); // a is fuller
  });

  it('plumbs validated options into the engine on create', () => {
    const m = mgr();
    const room = m.createRoom('test', { stakes: 'high' });
    expect(room.options).toEqual({ stakes: 'high' });
    expect(room.state.options).toEqual({ stakes: 'high' });
  });

  it('rejects invalid options at creation', () => {
    expect(() => mgr().createRoom('test', { stakes: 'nope' })).toThrow(/invalid option stakes/);
  });

  it('GCs rooms with no humans', () => {
    const m = mgr();
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.fillWithBots();
    room.removePlayer('h'); // only bots remain
    expect(m.reapEmptyRooms()).toEqual([room.code]);
    expect(m.rooms.size).toBe(0);
  });
});

describe('Room event log', () => {
  it('applyMessage appends an entry with stateHash, seq, playerId, msg', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    room.applyMessage('h', { skip: 0 });
    expect(room.eventLog).toHaveLength(1);
    const e = room.eventLog[0];
    expect(e.seq).toBe(0);
    expect(e.playerId).toBe('h');
    expect(e.msg).toEqual({ skip: 0 });
    expect(typeof e.stateHash).toBe('string');
    expect(e.stateHash).toHaveLength(16);
  });

  it('ring buffer caps at 200 entries', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    for (let i = 0; i < 201; i++) room.applyMessage('h', { skip: i });
    expect(room.eventLog).toHaveLength(200);
    expect(room.eventLog[0].msg).toEqual({ skip: 1 }); // oldest dropped
  });

  it('phaseEnteredAt is set when state.phase changes', () => {
    const phaseAdapter = makeAdapter({
      onMessage: (state, _pid, msg) => ({ ...state, phase: msg.phase }),
    });
    const m = new RoomManager({ test: phaseAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', {});
    room.addPlayer('g', 'Guest', {});
    expect(room.phaseEnteredAt).toBeNull();
    room.applyMessage('h', { phase: 'active' });
    expect(room.phaseEnteredAt).toBeGreaterThan(0);
  });
});
