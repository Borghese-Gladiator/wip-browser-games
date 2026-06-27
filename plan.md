# Plan: Framework + Lobby for browser-games

## Brief
Scale the repo from 3 games to ~13 by removing the two structural bottlenecks:
1. Each multiplayer game ships a near-identical copy-pasted WS server on its own port.
2. There is one global game per server process — no rooms, no lobby, no concurrent games.

Target: a single **gateway** WS server that hosts every game, routed by `gameId`,
with a shared **room-aware** core and a built-in **lobby** (create / list / join rooms
by code). Each game contributes only a pure engine + a tiny adapter. Adding a game
becomes: drop an engine + adapter, add one registry line. Vite inputs derived, not
hand-maintained.

## Architecture (target)
```
packages/
  shared/                  # registry (extended) + theme  [exists]
  game-core/               # NEW: generic room-aware server + lobby + gateway
    src/
      rooms.js             # Room + RoomManager (per-room engine state, seats, clients)
      gateway.js           # single WS server, routes by gameId, dispatches lobby vs game msgs
      lobby.js             # createRoom/listRooms/joinRoom protocol
      games.js             # adapter registry: gameId -> { engine, adapter }
  engines/                 # NEW: pure engines moved out of *-server packages
    poker/   (createGame, addPlayer, startHand, applyAction, publicState, handEval)
    sheng-ji/(createGame, addPlayer, startDeal, playCard, publicState)
  game-client/             # NEW: shared React client
    useGameSocket.js       # connect to gateway, join room, send actions
    Lobby.jsx              # shared lobby UI (name, create/join room)
games/
  poker/     sheng-ji/     # thin UI; use game-client + lobby; no bespoke WS code
  tic-tac-toe/             # unchanged (local game, no server)
bin/dev-server.js          # boots the single gateway (replaces 2 per-game servers)
```

Old `packages/poker-server` and `packages/sheng-ji-server` are replaced; their engine
files move to `packages/engines/*`, transport deleted.

## The adapter contract
Each multiplayer game registers an adapter so the generic gateway can drive it:
```js
{
  id: 'poker',
  engine,                              // the pure module
  minPlayers, maxPlayers,
  autoStart(state) -> state|null,      // called after each join; null = not ready
  // map inbound client messages to engine calls, returning next state
  onMessage(state, playerId, msg) -> state,
  // map inbound "restart" intent (poker:newHand, sheng-ji:newDeal)
}
```
This isolates the only real per-game differences (message names, start fn) while
`createGame/addPlayer/publicState` stay uniform.

## Rooms / lobby protocol (client <-> gateway)
- `{type:'lobby:list', gameId}` -> `{type:'lobby:rooms', rooms:[{code,players,max}]}`
- `{type:'lobby:create', gameId, name}` -> joins new room, server replies `{type:'joined', code, seat}`
- `{type:'lobby:join', gameId, code, name}` -> `{type:'joined', code, seat}` or error
- `{type:'game', code, ...gameMsg}` -> routed to that room's engine via adapter
- Server broadcasts `publicState` per seat to a room's clients after every change.

## Changes
1. `packages/game-core` — rooms.js, lobby.js, gateway.js, games.js (adapters).
2. `packages/engines/poker`, `packages/engines/sheng-ji` — move engine + tests; delete transport.
3. `packages/game-client` — useGameSocket.js + Lobby.jsx.
4. `games/poker/src/Poker.jsx`, `games/sheng-ji/src/ShengJi.jsx` — use shared client + lobby + room code.
5. `packages/shared/src/registry.js` — add `multiplayer` + per-game adapter pointer; derive vite input.
6. `vite.config.js` — build `input` from registry instead of hardcoding.
7. `bin/dev-server.js` + root `package.json` scripts — single gateway; update playwright webServer.
8. Remove `packages/poker-server`, `packages/sheng-ji-server` from workspace.

## Tests
### Unit
- Move existing engine tests under engines/* (keep passing unchanged — proves engine behavior preserved).
- New: `rooms.test.js` — create room generates unique code; join assigns seats; full room rejects; per-room isolation (two rooms don't share state); autoStart fires at capacity.
- New: `lobby.test.js` — list returns open rooms; create+join round-trip; join bad code errors.
### Manual (browser)
- `npm run dev` + gateway. Open portal, pick Poker.
- Tab A: create room -> get code. Tabs B/C/D: join by code -> 4 players -> hand starts.
- Separately, Tab E: create a *second* poker room -> independent game (proves concurrency).
- Play a hand to showdown in room 1; room 2 unaffected.
- Repeat join-by-code flow for Sheng Ji on the same gateway (proves gameId routing).
- Portal still lists all games; tic-tac-toe still works locally.
```
