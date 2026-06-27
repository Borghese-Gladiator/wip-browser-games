// Shared lobby UI for multiplayer games. Lets a player set a name, then either
// create a new room (getting a shareable code) or join an existing one by code.
// Also lists open rooms for this game so players can join with one click.
import { useEffect, useState } from "react";

export function Lobby({ title, rooms, error, onCreate, onJoin, onRefresh }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  const nameOk = name.trim().length > 0;

  return (
    <main className="lobby">
      <p className="lobby-back">
        <a href="/">← All games</a>
      </p>
      <h1>{title}</h1>

      <form
        className="lobby-name"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameOk) onCreate(name.trim());
        }}
      >
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="btn" type="submit" disabled={!nameOk}>
          Create room
        </button>
      </form>

      <form
        className="lobby-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameOk && code.trim()) onJoin(code.trim().toUpperCase(), name.trim());
        }}
      >
        <label htmlFor="room-code">Room code</label>
        <input
          id="room-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD"
          maxLength={4}
        />
        <button className="btn" type="submit" disabled={!nameOk || !code.trim()}>
          Join by code
        </button>
      </form>

      <section aria-label="Open rooms" className="lobby-rooms">
        <h2>
          Open rooms{" "}
          <button className="btn" type="button" onClick={() => onRefresh?.()}>
            Refresh
          </button>
        </h2>
        {rooms.length === 0 ? (
          <p>No open rooms. Create one above.</p>
        ) : (
          <ul>
            {rooms.map((r) => (
              <li key={r.code}>
                <button
                  className="btn"
                  type="button"
                  disabled={!nameOk}
                  onClick={() => onJoin(r.code, name.trim())}
                >
                  {r.code} ({r.players}/{r.max})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="lobby-error">
          {error}
        </p>
      )}
    </main>
  );
}
