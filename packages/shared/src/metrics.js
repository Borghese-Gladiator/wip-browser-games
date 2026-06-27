export const SLOW_GAME_THRESHOLD_MS = 600_000; // 10 minutes

export function isSlowGame(phaseEnteredAt, now, thresholdMs = SLOW_GAME_THRESHOLD_MS) {
  if (phaseEnteredAt == null) return false;
  return now - phaseEnteredAt >= thresholdMs;
}

// Returns msg/sec rounded to 1 decimal.
export function rollupMessagesPerSec(count, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  return Math.round((count / elapsedMs) * 1000 * 10) / 10;
}
