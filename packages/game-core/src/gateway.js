// Single WebSocket gateway hosting every multiplayer game. Clients connect once,
// then speak a small protocol: lobby messages to create/list/join rooms, and
// game messages routed to the room's engine via its adapter.
//
// Protocol (client -> server):
//   { t: 'lobby:list',       gameId }
//   { t: 'lobby:create',     gameId, name, options? }
//   { t: 'lobby:join',       gameId, code, name }
//   { t: 'lobby:quickmatch', gameId, name, options? }   // "Play now"
//   { t: 'lobby:spectate',   gameId, code }             // watch, no seat
//   { t: 'host:kick',  targetId }                       // host only
//   { t: 'host:lock',  locked }                         // host only
//   { t: 'host:start' }                                 // host only, start early
//   { t: 'game',       ...gameMsg }                     // after joining a room
//   { t: 'restart' }                                    // new hand/deal, in-room
//   { t: 'pong',       sentAt }                          // heartbeat reply
//
// Server -> client:
//   { t: 'rooms',    rooms: [{code, players, max, locked, host}] }
//   { t: 'joined',   code, seat, isHost, options }       // seat -1 = spectator
//   { t: 'state',    ...publicState, presence, isHost }
//   { t: 'ping',     sentAt }                             // heartbeat
//   { t: 'error',    message }
//
// The connection-handling logic is split out as handleMessage so it can be unit
// tested with a fake client (anything with .send()).

import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { adapters } from './games.js';
import { OutcomeStore, AchievementStore } from './store.js';
import { sanitizeName } from '@portal/shared/sanitize';
import {
  computeBoard,
  matchHistory,
  headToHead,
  checkAchievements,
} from '@portal/shared/leaderboard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// One heartbeat clock drives everything: presence dots, latency, dead-socket
// reaping, and turn-timeout enforcement. PING_MS is how often we ping; a socket
// silent for DEAD_MS is reaped; GRACE_MS is how long a dark seated player's turn
// waits before auto-action; FORFEIT_MS is the hard cap even for present idlers.
const HEARTBEAT = {
  PING_MS: 5000,
  DEAD_MS: 15000,
  GRACE_MS: 10000,
  FORFEIT_MS: 60000,
};

// Per-connection session. Tracks which room (if any) this socket is in and
// whether it's a spectator. The playerId is supplied by the client (localStorage
// UUID) so a returning player keeps the same identity across reconnects.
class Session {
  constructor(client, playerId) {
    this.client = client;
    this.playerId = playerId;
    this.room = null;
    this.spectator = false;
  }
  send(obj) {
    this.client.send(JSON.stringify(obj));
  }
  // Key used to find this connection in the room's member/spectator maps.
  get key() {
    return this.spectator ? `spec:${this.playerId}` : this.playerId;
  }
}

function isOpen(client) {
  return client && (client.readyState === undefined || client.readyState === 1);
}

// Broadcast the current per-seat state to every seated member and spectator.
// Spectators are keyed separately and always get the seatless view.
function broadcastRoom(room) {
  for (const { id, client, isBot } of room.members.values()) {
    if (isBot || !isOpen(client)) continue;
    client.send(
      JSON.stringify({
        t: 'state',
        ...room.viewFor(id),
        presence: room.presence(),
        isHost: id === room.host,
      }),
    );
  }
  for (const { client } of room.spectators.values()) {
    if (!isOpen(client)) continue;
    client.send(
      JSON.stringify({
        t: 'state',
        ...room.adapter.engine.publicState(room.state, -1),
        presence: room.presence(),
        isHost: false,
      }),
    );
  }
}

// Core dispatch. Pure-ish: depends only on the manager and the session. Exported
// for tests. Returns nothing; effects happen via session.send / broadcastRoom.
export function handleMessage(manager, session, msg) {
  try {
    switch (msg.t) {
      case 'lobby:list': {
        session.send({ t: 'rooms', rooms: manager.listRooms(msg.gameId) });
        return;
      }
      case 'lobby:create': {
        const name = sanitizeName(msg.name); // throws → outer catch → error reply
        const room = manager.createRoom(msg.gameId, msg.options); // validateOptions may throw
        joinRoom(room, session, name);
        return;
      }
      case 'lobby:join': {
        const name = sanitizeName(msg.name);
        const room = manager.getRoom(msg.code);
        joinRoom(room, session, name);
        return;
      }
      case 'lobby:quickmatch': {
        const name = sanitizeName(msg.name);
        const room = manager.quickMatch(msg.gameId, msg.options);
        joinRoom(room, session, name);
        return;
      }
      case 'lobby:spectate': {
        const room = manager.getRoom(msg.code);
        session.spectator = true;
        session.room = room;
        room.addSpectator(session.key, session.client);
        session.send({ t: 'joined', code: room.code, seat: -1, isHost: false, options: room.options });
        broadcastRoom(room);
        return;
      }
      case 'host:kick': {
        requireRoom(session).kick(session.playerId, msg.targetId);
        broadcastRoom(session.room);
        return;
      }
      case 'host:lock': {
        requireRoom(session).lock(session.playerId, msg.locked);
        broadcastRoom(session.room);
        return;
      }
      case 'host:start': {
        requireRoom(session).startEarly(session.playerId);
        broadcastRoom(session.room);
        return;
      }
      case 'pong': {
        session.room?.recordPong(session.key, { sentAt: msg.sentAt });
        return;
      }
      case 'game': {
        if (session.spectator) throw new Error('spectators cannot act');
        requireRoom(session).applyMessage(session.playerId, msg);
        broadcastRoom(session.room);
        return;
      }
      case 'restart': {
        if (session.spectator) throw new Error('spectators cannot act');
        requireRoom(session).applyMessage(session.playerId, { restart: true });
        broadcastRoom(session.room);
        return;
      }
      default:
        throw new Error(`unknown message: ${msg.t}`);
    }
  } catch (e) {
    session.send({ t: 'error', message: e.message });
  }
}

function requireRoom(session) {
  if (!session.room) throw new Error('not in a room');
  return session.room;
}

function joinRoom(room, session, name) {
  const seat = room.addPlayer(session.playerId, name, session.client);
  session.spectator = false;
  session.room = room;
  session.send({
    t: 'joined',
    code: room.code,
    seat,
    isHost: session.playerId === room.host,
    options: room.options,
  });
  broadcastRoom(room);
}

export function createGateway({
  port = 3001,
  outcomesPath = './outcomes.json',
  achievementsPath = './achievements.json',
  manager,
} = {}) {
  const outcomeStore = new OutcomeStore(outcomesPath);
  const achievementStore = new AchievementStore(achievementsPath);

  // The single framework-side hook every game flows through when it ends. The
  // adapter declared the scoring (outcome) and any achievement predicates; here
  // we persist the outcome and record newly-unlocked achievements per player.
  function onGameEnd(outcome, { gameId, roomCode }) {
    const record = outcomeStore.record({ gameId, roomCode, outcomes: outcome.outcomes });
    const achievements = adapters[gameId]?.achievements ?? [];
    if (achievements.length === 0) return;
    for (const { playerId } of outcome.outcomes) {
      const playerRecords = outcomeStore
        .all()
        .filter((r) => r.outcomes.some((o) => o.playerId === playerId));
      for (const achievementId of checkAchievements(achievements, playerId, record, playerRecords)) {
        achievementStore.record({ playerId, achievementId, gameId });
      }
    }
  }

  if (!manager) manager = new RoomManager(adapters, { onGameEnd });

  // Read-only HTTP surface for leaderboards / history / head-to-head, served on
  // the same port as the WebSocket gateway. All views derive from outcomeStore.
  function handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    const records = outcomeStore.all();
    if (url.pathname === '/api/leaderboard') {
      const entries = computeBoard(records, {
        gameId: url.searchParams.get('gameId') || undefined,
        roomCode: url.searchParams.get('roomCode') || undefined,
        window: url.searchParams.get('window') || 'all-time',
      });
      res.end(JSON.stringify({ entries }));
    } else if (url.pathname === '/api/history') {
      const playerId = url.searchParams.get('playerId');
      res.end(JSON.stringify({ games: matchHistory(records, playerId) }));
    } else if (url.pathname === '/api/h2h') {
      const stats = headToHead(
        records,
        url.searchParams.get('playerA'),
        url.searchParams.get('playerB'),
      );
      res.end(JSON.stringify(stats));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  }

  const httpServer = createServer(handleHttp);
  const wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(port);
  console.log(`Game gateway listening on :${port}`);

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const clientId = params.get('playerId');
    const playerId = isValidUUID(clientId) ? clientId : crypto.randomUUID();
    const session = new Session(ws, playerId);
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      handleMessage(manager, session, msg);
    });
    ws.on('close', () => leave(manager, session));
    ws.on('error', () => leave(manager, session));
  });

  // The single heartbeat clock. Each tick pings every connected socket and runs
  // room-level reaping / bot moves / turn-timeout enforcement.
  const heartbeat = setInterval(() => {
    pingAll(wss);
    runHeartbeat(manager, broadcastRoom, HEARTBEAT);
  }, HEARTBEAT.PING_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

// Ping every open socket so clients can reply with a pong; the sentAt stamp lets
// the room compute round-trip latency.
function pingAll(wss) {
  const ping = JSON.stringify({ t: 'ping', sentAt: Date.now() });
  for (const ws of wss.clients) {
    if (isOpen(ws)) ws.send(ping);
  }
}

// One pass of room maintenance, driven by the heartbeat. Exported and parameterized
// over `broadcast` and the timing opts so it can be unit/integration tested with a
// fake clock. Applies bot moves and timeout auto-actions, then GCs empty rooms.
export function runHeartbeat(manager, broadcast, opts, now = Date.now()) {
  for (const room of manager.rooms.values()) {
    const { reaped, timeout, botMsg, botSeat } = room.tick({ now, ...opts });
    let changed = reaped.length > 0;

    if (botMsg) {
      const botId = room.state.players[botSeat]?.id;
      if (botId) {
        room.applyMessage(botId, botMsg, { now });
        changed = true;
      }
    } else if (timeout) {
      // Auto-act for the dark/idle seat so the game cannot stall. The engine
      // attributes the action to that seat's playerId.
      const playerId = room.state.players[timeout.seat]?.id;
      if (playerId) {
        room.applyMessage(playerId, timeout.msg, { now });
        changed = true;
      }
    }

    if (changed) broadcast(room);
  }
  manager.reapEmptyRooms();
}

// A socket dropped. Spectators leave immediately. A *seated* player is NOT
// removed here: their seat is held so a reconnect inside the grace window
// resumes cleanly. The heartbeat reaps the seat only after the socket has been
// silent past DEAD_MS, and the turn timer auto-acts for them meanwhile so the
// game never stalls. We just mark the socket closed so presence reflects it.
function leave(manager, session) {
  const room = session.room;
  if (!room) return;
  if (session.spectator) {
    room.removeSpectator(session.key);
  } else {
    const member = room.members.get(session.playerId);
    if (member) member.client = null; // held seat, no live socket
  }
  if (room.isEmpty) manager.deleteRoom(room.code);
  else broadcastRoom(room);
  session.room = null;
}

export { RoomManager, adapters };
