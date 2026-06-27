import { useState, useEffect } from 'react';
import { fetchLeaderboard } from './leaderboard.js';

// Generic leaderboard chrome: renders the board scopes (all-time / weekly /
// daily) for a game, optionally scoped to a room.
export function Leaderboard({ gameId, roomCode }) {
  const [window, setWindow] = useState('all-time');
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    fetchLeaderboard({ gameId, roomCode, window }).then((d) =>
      setEntries(d.entries ?? []),
    );
  }, [gameId, roomCode, window]);
  return (
    <section aria-label="Leaderboard" className="leaderboard">
      <h2>Leaderboard</h2>
      <div className="leaderboard-tabs">
        {['all-time', 'weekly', 'daily'].map((w) => (
          <button
            key={w}
            className={`btn btn-sm${window === w ? ' btn-active' : ''}`}
            type="button"
            onClick={() => setWindow(w)}
          >
            {w}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((e) => (
            <li key={e.playerId}>
              #{e.rank} — {e.playerId.slice(0, 8)}… · {e.wins}W / {e.games}G
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
