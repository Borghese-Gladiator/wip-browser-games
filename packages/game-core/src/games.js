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
//   getOutcome   - (state) => { outcomes: [{playerId, rank, score, meta}] } | null.
//                  How a game declares its scoring: null until the game is over,
//                  then the per-player result. The framework persists it.
//   achievements - [{ id, name, predicate(playerId, newRecord, playerRecords) }].
//                  Unlock conditions the framework evaluates and records.
//
// To add a new multiplayer game: import its engine and add one entry here.

import * as poker from '@browser-games/engine-poker';
import * as shengJi from '@browser-games/engine-sheng-ji';

// True exactly once: when newRecord is the player's first recorded rank-1 finish.
const isFirstWin = (playerId, _newRecord, playerRecords) =>
  playerRecords.filter((r) => r.outcomes.some((o) => o.playerId === playerId && o.rank === 1))
    .length === 1;

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
  getOutcome: (state) => {
    if (state.phase !== 'showdown' || !state.winner) return null;
    return {
      outcomes: state.players.map((p) => {
        const won = p.seat === state.winner.seat;
        return {
          playerId: p.id,
          rank: won ? 1 : 2,
          score: won ? state.winner.amount : 0,
          meta: won ? { handName: state.winner.handName } : {},
        };
      }),
    };
  },
  achievements: [{ id: 'poker-first-win', name: 'First Win', predicate: isFirstWin }],
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
  getOutcome: (state) => {
    if (state.phase !== 'deal-over' || !state.result) return null;
    const winTeam = state.result.winnerTeam;
    return {
      // Teams: seats 0&2 => team 0, seats 1&3 => team 1 (p.seat % 2).
      outcomes: state.players.map((p) => ({
        playerId: p.id,
        rank: p.seat % 2 === winTeam ? 1 : 2,
        score: state.result.teamPoints[p.seat % 2],
        meta: { winnerTeam: winTeam, teamPoints: [...state.result.teamPoints] },
      })),
    };
  },
  achievements: [{ id: 'shengji-first-win', name: 'Team Player', predicate: isFirstWin }],
};

export const adapters = {
  poker: pokerAdapter,
  'sheng-ji': shengJiAdapter,
};
