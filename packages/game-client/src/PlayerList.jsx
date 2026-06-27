import { playerColor } from '@portal/shared/identity';

// Generic seat roster: deterministic avatar color from name + presence dot
// from heartbeat. Names are unique within a room, so color is stable.
export function PlayerList({ players = [], presence, mySeat, activeSeat }) {
  return (
    <ul className="player-list">
      {players.map((p) => {
        const pres = presence?.find((x) => x.seat === p.seat);
        const live = pres ? pres.isBot || pres.latencyMs >= 0 : true;
        const color = playerColor(p.name);
        return (
          <li
            key={p.seat}
            aria-current={p.seat === activeSeat ? 'true' : undefined}
            className="player-list-item"
          >
            <span
              className="player-avatar"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span
              className={`presence-dot ${live ? 'is-live' : 'is-dark'}`}
              aria-hidden="true"
            />
            {p.name}
            {pres?.isBot ? ' 🤖' : ''}
            {p.seat === mySeat ? ' (you)' : ''}
          </li>
        );
      })}
    </ul>
  );
}
