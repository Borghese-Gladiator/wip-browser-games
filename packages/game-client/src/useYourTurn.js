import { useEffect, useRef } from 'react';
import { isYourTurn } from './yourTurn.js';

// Generic "your turn" notifier: beeps and blinks the tab title when the active
// seat becomes the local player's. Stops as soon as the turn moves on.
export function useYourTurn(gameState, mySeat) {
  const prevActiveSeat = useRef(null);
  const blinkTimer = useRef(null);
  const originalTitle = useRef(document.title);

  useEffect(() => {
    const next = gameState?.activeSeat;
    if (isYourTurn(prevActiveSeat.current, next, mySeat)) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 440;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        /* Web Audio unavailable — skip the beep */
      }
      clearInterval(blinkTimer.current);
      let on = false;
      blinkTimer.current = setInterval(() => {
        document.title = on ? originalTitle.current : '⚡ Your turn!';
        on = !on;
      }, 600);
    } else {
      clearInterval(blinkTimer.current);
      document.title = originalTitle.current;
    }
    prevActiveSeat.current = next;
    return () => clearInterval(blinkTimer.current);
  }, [gameState?.activeSeat, mySeat]);
}
