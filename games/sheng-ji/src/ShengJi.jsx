import { useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_SJ_WS_URL || "ws://localhost:3002";

const SUIT_NAMES = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };

function cardSuit(card) {
  return card[card.length - 1];
}
function cardRank(card) {
  return card.slice(0, card.length - 1);
}
function cardDisplayName(card) {
  return `${cardRank(card)} of ${SUIT_NAMES[cardSuit(card)]}`;
}
function cardShort(card) {
  return `${cardRank(card)}${SUIT_SYMBOLS[cardSuit(card)]}`;
}

// Team A = seats 0 & 2; Team B = seats 1 & 3.
function teamLabel(team) {
  return team === 0 ? "Team A" : "Team B";
}

export function ShengJi() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState("");
  const ws = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    ws.current = socket;
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "error") {
        setError(msg.message);
      } else {
        setError("");
        setGameState(msg);
      }
    };
    return () => socket.close();
  }, []);

  function handleJoin(e) {
    e.preventDefault();
    ws.current?.send(JSON.stringify({ type: "join", name }));
    setJoined(true);
  }

  function sendPlayCard(cardId) {
    ws.current?.send(JSON.stringify({ type: "playCard", cardId }));
  }

  function sendNewDeal() {
    ws.current?.send(JSON.stringify({ type: "newDeal" }));
  }

  if (!joined || !gameState) {
    return (
      <main className="sj">
        <p className="sj-back">
          <a href="/">← All games</a>
        </p>
        <h1>Sheng Ji (升级)</h1>
        <form className="sj-join" onSubmit={handleJoin}>
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="btn" type="submit">
            Join Table
          </button>
        </form>
        {error && (
          <p className="sj-error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  const {
    phase,
    players,
    trumpSuit,
    trumpRank,
    dealerSeat,
    activeSeat,
    currentTrick,
    completedTricks,
    teamPoints,
    lastTrickWinner,
    result,
    mySeat,
    myHand,
    legalCards,
  } = gameState;

  const nameForSeat = (seat) => players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;
  const legalSet = new Set(legalCards ?? []);

  let status;
  if (result) {
    status = `${teamLabel(result.winnerTeam)} wins — ${teamPoints[0]} / ${teamPoints[1]} pts`;
  } else if (phase === "waiting") {
    status = `Waiting for players… (${players.length}/4)`;
  } else if (mySeat === activeSeat) {
    status = "Your turn";
  } else {
    status = `${nameForSeat(activeSeat)}'s turn`;
  }

  return (
    <main className="sj">
      <p className="sj-back">
        <a href="/">← All games</a>
      </p>
      <h1>Sheng Ji (升级)</h1>

      <section aria-label="Status">
        <p role="status" aria-live="polite">
          {status}
        </p>
      </section>

      {trumpSuit && (
        <section aria-label="Trump">
          <p>
            Trump: rank {trumpRank}, suit {SUIT_NAMES[trumpSuit]}
          </p>
        </section>
      )}

      <section aria-label="Score">
        <p>
          Team A (0 &amp; 2): {teamPoints[0]} pts | Team B (1 &amp; 3): {teamPoints[1]} pts
        </p>
        <p>Tricks played: {completedTricks}</p>
      </section>

      <section aria-label="Current trick">
        {currentTrick.plays.length === 0 ? (
          <p>
            No cards played yet
            {lastTrickWinner != null && completedTricks > 0 && (
              <> — Last trick won by: {nameForSeat(lastTrickWinner)}</>
            )}
          </p>
        ) : (
          <ul className="sj-trick">
            {currentTrick.plays.map((play) => (
              <li key={play.seat}>
                {nameForSeat(play.seat)}: {cardShort(play.card)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your hand">
        <ul className="sj-hand">
          {myHand.map((card) => (
            <li key={card}>
              <button
                type="button"
                className="sj-card-btn"
                aria-label={`Play ${cardDisplayName(card)}`}
                disabled={!legalSet.has(card)}
                onClick={() => sendPlayCard(card)}
              >
                {cardShort(card)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Players">
        <ul>
          {players.map((p) => (
            <li key={p.seat} aria-current={p.seat === activeSeat ? "true" : undefined}>
              {p.name} (seat {p.seat})
              {p.seat === dealerSeat ? " 🎲" : ""} — {p.handCount} cards
            </li>
          ))}
        </ul>
      </section>

      {phase === "deal-over" && (
        <button className="btn" type="button" onClick={sendNewDeal}>
          New Deal
        </button>
      )}
    </main>
  );
}
