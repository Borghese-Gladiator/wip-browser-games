// Pure backoff math for socket auto-reconnect. No React/DOM deps so it's unit-testable.

export const MAX_ATTEMPTS = 10;

// Exponential backoff with jitter, clamped to [base, max].
export function nextDelay(attempt, { base = 500, max = 30_000 } = {}) {
  return Math.min(base * 2 ** attempt, max) * (0.85 + Math.random() * 0.3);
}

export function shouldReconnect(attempt) {
  return attempt < MAX_ATTEMPTS;
}
