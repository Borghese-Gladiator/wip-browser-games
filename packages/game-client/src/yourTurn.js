// Pure "your turn" detection. No DOM deps so it's unit-testable.

// True only on the tick where the active seat transitions TO mySeat.
export function isYourTurn(prevActiveSeat, nextActiveSeat, mySeat) {
  return (
    mySeat != null &&
    mySeat >= 0 &&
    nextActiveSeat === mySeat &&
    prevActiveSeat !== mySeat
  );
}
