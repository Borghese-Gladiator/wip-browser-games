// Bot fill-with-AI seam. A bot is just a seated "member" with no socket; when
// it is a bot's turn the gateway asks the adapter for its move and applies it
// like any other game message. This keeps a quiet lobby playable and testable.
//
// The adapter supplies the actual policy via `botMove(state, seat) -> gameMsg`
// (trivial policies are fine — the point is the seam). This module owns only the
// bot-identity helpers and the "whose turn is a bot" decision, which is pure.

import crypto from 'node:crypto';

// Stable, recognizable bot ids/names. A bot id is a normal playerId (a UUID) so
// it flows through the engine's seat model unchanged; we tag membership as a bot
// out-of-band (Room tracks which member ids are bots).
export function makeBot(index) {
  return { id: crypto.randomUUID(), name: `Bot ${index + 1}` };
}

// Given the active seat and the set of bot seats, decide whether the gateway
// should drive a bot move this tick. Pure: returns the bot's game message (via
// the adapter) or null when it isn't a bot's turn / the adapter declines.
export function botActionFor(state, adapter, botSeats) {
  const seat = adapter.activeSeat?.(state);
  if (seat == null || seat < 0 || !botSeats.has(seat)) return null;
  return adapter.botMove?.(state, seat) ?? null;
}
