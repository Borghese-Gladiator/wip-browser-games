import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  createGame,
  addPlayer,
  startHand,
  applyAction,
  publicState,
} from './engine.js';

const PORT = process.env.PORT || 3001;
let state = createGame();
const clients = new Map(); // ws -> { id, seat }

const wss = new WebSocketServer({ port: PORT });
console.log(`Poker WS server listening on :${PORT}`);

wss.on('connection', (ws) => {
  const id = crypto.randomUUID();
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'join') handleJoin(ws, id, msg);
    else if (msg.type === 'action') handleAction(ws, id, msg);
    else if (msg.type === 'newHand') handleNewHand(ws);
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function handleJoin(ws, id, msg) {
  try {
    state = addPlayer(state, { id, name: msg.name });
    const seat = state.players.find((p) => p.id === id).seat;
    clients.set(ws, { id, seat });
    broadcast();
    if (state.players.length === 4) {
      state = startHand(state);
      broadcast();
    }
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

function handleAction(ws, id, msg) {
  try {
    state = applyAction(state, id, msg.action);
    broadcast();
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

function handleNewHand(ws) {
  try {
    state = startHand(state);
    broadcast();
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

function broadcast() {
  for (const [ws, { seat }] of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(publicState(state, seat)));
    }
  }
}
