import { useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

export function Poker() {
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

  function send(type, extra = {}) {
    ws.current?.send(JSON.stringify({ type: "action", action: { type, ...extra } }));
  }

  function sendNewHand() {
    ws.current?.send(JSON.stringify({ type: "newHand" }));
  }

  if (!joined || !gameState) {
    return (
      <main className="poker">
        <p className="poker-back">
          <a href="/">← All games</a>
        </p>
        <h1>Texas Hold'em</h1>
        <form className="poker-join" onSubmit={handleJoin}>
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
          <p role="alert" className="poker-error">
            {error}
          </p>
        )}
      </main>
    );
  }

  const activePlayer = gameState.players.find((p) => p.seat === gameState.activeSeat);
  const activePlayerName = activePlayer?.name ?? "";
  const legalActions = gameState.legalActions ?? [];

  let statusText;
  if (gameState.winner) {
    statusText = `${gameState.winner.name} wins the pot of ${gameState.winner.amount} chips with ${gameState.winner.handName}`;
  } else if (gameState.phase === "waiting") {
    statusText = `Waiting for players… (${gameState.players.length}/4)`;
  } else {
    statusText = `${activePlayerName}'s turn`;
  }

  return (
    <main className="poker">
      <p className="poker-back">
        <a href="/">← All games</a>
      </p>
      <h1>Texas Hold'em</h1>

      <p id="status" role="status" aria-live="polite" className="poker-status">
        {statusText}
      </p>

      <section aria-label="Community cards">
        <h2>Community cards</h2>
        {gameState.community.length === 0 ? (
          <p>None yet</p>
        ) : (
          <ul className="poker-cards">
            {gameState.community.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        <p className="poker-pot">Pot: {gameState.pot} chips</p>
      </section>

      {gameState.myHoleCards?.length === 2 && (
        <section aria-label="Your cards">
          <h2>Your cards</h2>
          <ul className="poker-cards poker-hole">
            {gameState.myHoleCards.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Players">
        <h2>Players</h2>
        <ul className="poker-players">
          {gameState.players.map((p) => (
            <li
              key={p.seat}
              aria-current={p.seat === gameState.activeSeat ? "true" : undefined}
            >
              {p.name}
              {p.seat === gameState.dealer ? " 🎲" : ""}
              {p.folded ? " (folded)" : ""}
            </li>
          ))}
        </ul>
      </section>

      {legalActions.length > 0 && (
        <section aria-label="Your actions" className="poker-actions">
          <button
            className="btn"
            type="button"
            onClick={() => send("fold")}
            disabled={!legalActions.includes("fold")}
          >
            Fold
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => send("check")}
            disabled={!legalActions.includes("check")}
          >
            Check
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => send("call")}
            disabled={!legalActions.includes("call")}
          >
            Call
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => send("raise")}
            disabled={!legalActions.includes("raise")}
          >
            Raise
          </button>
        </section>
      )}

      {gameState.phase === "showdown" && (
        <button className="btn" type="button" onClick={sendNewHand}>
          Play again
        </button>
      )}

      {error && (
        <p role="alert" className="poker-error">
          {error}
        </p>
      )}
    </main>
  );
}
