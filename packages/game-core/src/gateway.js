// Single WebSocket gateway hosting every multiplayer game. Clients connect once,
// then speak a small protocol: lobby messages to create/list/join rooms, and
// game messages routed to the room's engine via its adapter.
//
// Protocol (client -> server):
//   { t: 'lobby:list',   gameId }
//   { t: 'lobby:create', gameId, name }
//   { t: 'lobby:join',   gameId, code, name }
//   { t: 'game',         ...gameMsg }          // after joining a room
//   { t: 'restart' }                            // new hand/deal, in-room
//
// Server -> client:
//   { t: 'rooms',  rooms: [{code, players, max}] }
//   { t: 'joined', code, seat }
//   { t: 'state',  ...publicState }
//   { t: 'error',  message }
//
// The connection-handling logic is split out as handleMessage so it can be unit
// tested with a fake client (anything with .send()).

import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { adapters } from './games.js';
import { sanitizeName } from '@portal/shared/sanitize';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Per-connection session. Tracks which room (if any) this socket is seated in.
// The playerId is supplied by the client (localStorage UUID) so a returning
// player keeps the same identity across reconnects.
class Session {
  constructor(client, playerId) {
    this.client = client;
    this.playerId = playerId;
    this.room = null;
  }
  send(obj) {
    this.client.send(JSON.stringify(obj));
  }
}

function broadcastRoom(room) {
  for (const { id, client } of room.members.values()) {
    if (client.readyState === undefined || client.readyState === 1) {
      client.send(JSON.stringify({ t: 'state', ...room.viewFor(id) }));
    }
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
        const room = manager.createRoom(msg.gameId);
        joinRoom(room, session, name);
        return;
      }
      case 'lobby:join': {
        const name = sanitizeName(msg.name);
        const room = manager.getRoom(msg.code);
        joinRoom(room, session, name);
        return;
      }
      case 'game': {
        if (!session.room) throw new Error('not in a room');
        session.room.applyMessage(session.playerId, msg);
        broadcastRoom(session.room);
        return;
      }
      case 'restart': {
        if (!session.room) throw new Error('not in a room');
        session.room.applyMessage(session.playerId, { restart: true });
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

function joinRoom(room, session, name) {
  const seat = room.addPlayer(session.playerId, name, session.client);
  session.room = room;
  session.send({ t: 'joined', code: room.code, seat });
  broadcastRoom(room);
}

export function createGateway({ port = 3001, manager = new RoomManager(adapters) } = {}) {
  const wss = new WebSocketServer({ port });
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

  return wss;
}

function leave(manager, session) {
  const room = session.room;
  if (!room) return;
  room.removePlayer(session.playerId);
  if (room.isEmpty) manager.deleteRoom(room.code);
  else broadcastRoom(room);
  session.room = null;
}

export { RoomManager, adapters };
