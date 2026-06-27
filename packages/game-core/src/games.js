// Adapter registry: maps a gameId to its pure engine plus the small amount of
// per-game glue the generic gateway needs. Everything game-specific lives here;
// rooms.js and gateway.js stay engine-agnostic.
//
// An adapter:
//   engine       - the pure module (createGame, addPlayer, publicState, ...)
//   minPlayers   - players required before a game can start
//   maxPlayers   - seats at the table
//   autoStart    - (state) => state | null. Called after each join; return a
//                  started state when ready, else null/undefined.
//   onMessage    - (state, playerId, msg) => state. Maps an in-room game message
//                  to an engine call. `msg` is the client payload minus routing.
//
// To add a new multiplayer game: import its engine and add one entry here.

import * as poker from '@browser-games/engine-poker';
import * as shengJi from '@browser-games/engine-sheng-ji';

const pokerAdapter = {
  id: 'poker',
  engine: poker,
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: (state) =>
    state.players.length === 4 ? poker.startHand(state) : null,
  onMessage: (state, playerId, msg) => {
    if (msg.action) return poker.applyAction(state, playerId, msg.action);
    if (msg.restart) return poker.startHand(state);
    throw new Error('unknown poker message');
  },
};

const shengJiAdapter = {
  id: 'sheng-ji',
  engine: shengJi,
  minPlayers: 4,
  maxPlayers: 4,
  autoStart: (state) =>
    state.players.length === 4 ? shengJi.startDeal(state) : null,
  onMessage: (state, playerId, msg) => {
    if (msg.cardId) return shengJi.playCard(state, playerId, msg.cardId);
    if (msg.restart) return shengJi.startDeal(state);
    throw new Error('unknown sheng-ji message');
  },
};

export const adapters = {
  poker: pokerAdapter,
  'sheng-ji': shengJiAdapter,
};
