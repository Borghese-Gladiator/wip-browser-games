import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";

export function Poker() {
  const {
    rooms,
    room,
    gameState,
    error,
    listRooms,
    createRoom,
    joinRoom,
    send,
    restart,
  } = useGameSocket("poker");

  if (!room || !gameState) {
    return (
      <Lobby
        title="Texas Hold'em"
        rooms={rooms}
        error={error}
        onCreate={createRoom}
        onJoin={joinRoom}
        onRefresh={listRooms}
      />
    );
  }

  const act = (type, extra = {}) => send({ action: { type, ...extra } });

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
      <p className="poker-room">Room: {room.code}</p>

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
            onClick={() => act("fold")}
            disabled={!legalActions.includes("fold")}
          >
            Fold
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("check")}
            disabled={!legalActions.includes("check")}
          >
            Check
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("call")}
            disabled={!legalActions.includes("call")}
          >
            Call
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("raise")}
            disabled={!legalActions.includes("raise")}
          >
            Raise
          </button>
        </section>
      )}

      {gameState.phase === "showdown" && (
        <button className="btn" type="button" onClick={restart}>
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
