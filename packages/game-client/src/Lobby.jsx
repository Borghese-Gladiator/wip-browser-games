// Shared lobby UI for multiplayer games. Lets a player set a name, then either
// create a new room (getting a shareable code) or join an existing one by code.
// Also lists open rooms for this game so players can join with one click.
import { useEffect, useState } from "react";
import { useIdentity } from "./useIdentity.js";
import { PlayerCodeModal } from "./PlayerCodeModal.jsx";

export function Lobby({ title, rooms, error, onCreate, onJoin, onRefresh, onQuickMatch, onSpectate }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { color, playerCode, importIdentity } = useIdentity();
  const [showCode, setShowCode] = useState(false);

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
        {onQuickMatch && (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!nameOk}
            onClick={() => onQuickMatch(name.trim())}
          >
            Play now
          </button>
        )}
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
                  {r.code} ({r.players}/{r.max}){r.locked ? " 🔒" : ""}
                </button>
                {onSpectate && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => onSpectate(r.code)}
                  >
                    Watch
                  </button>
                )}
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

      <div className="lobby-identity">
        <span className="lobby-avatar" style={{ background: color }} aria-hidden="true" />
        <button className="btn" type="button" onClick={() => setShowCode(true)}>
          Player code
        </button>
      </div>
      {showCode && (
        <PlayerCodeModal
          playerCode={playerCode}
          onImport={importIdentity}
          onClose={() => setShowCode(false)}
        />
      )}
    </main>
  );
}
