// Pure optimistic-action helpers. No React deps so they're unit-testable.

// Apply an action locally before the server confirms it.
export function applyOptimistic(serverState, action, reduce) {
  return reduce(serverState, action);
}

// When authoritative server state arrives, trust it: this drops the optimistic
// prediction and rolls back to the server's view if the action was rejected.
export function reconcile(serverState, _pendingAction, _localState) {
  return serverState;
}
