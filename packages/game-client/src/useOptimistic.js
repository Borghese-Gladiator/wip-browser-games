import { useState, useRef, useCallback } from 'react';
import { reconcile } from './optimistic.js';

// Apply an action locally for snappy UI, then reconcile against authoritative
// server state when it arrives (rolling back if the server rejected the action).
export function useOptimistic(serverState, reduce) {
  const [localState, setLocalState] = useState(null);
  const pending = useRef(null);
  const prevServer = useRef(null);

  if (serverState !== prevServer.current) {
    prevServer.current = serverState;
    if (pending.current) {
      reconcile(serverState, pending.current, localState);
      setLocalState(null);
      pending.current = null;
    }
  }

  const apply = useCallback(
    (action, sendFn) => {
      pending.current = action;
      setLocalState((prev) => reduce(prev ?? serverState, action));
      sendFn();
    },
    [serverState, reduce],
  );

  return [localState ?? serverState, apply];
}
