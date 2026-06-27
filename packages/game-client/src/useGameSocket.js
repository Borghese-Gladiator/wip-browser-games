// Shared multiplayer client hook. Connects to the gateway, exposes the lobby
// actions (create/join/list room) and a generic send() for in-room game
// messages, and surfaces the latest per-seat publicState.
//
// All games connect to the same gateway URL and identify themselves by gameId;
// the server routes by room code once joined.
import { useCallback, useEffect, useRef, useState } from "react";
import { useIdentity } from "./useIdentity.js";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3001";

export function useGameSocket(gameId) {
  const { playerId } = useIdentity();
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null); // { code, seat, isHost, options } once joined
  const [gameState, setGameState] = useState(null); // includes presence, isHost
  const [error, setError] = useState("");
  const ws = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(`${GATEWAY_URL}?playerId=${encodeURIComponent(playerId)}`);
    ws.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.t) {
        case "rooms":
          setRooms(msg.rooms);
          break;
        case "joined":
          setError("");
          setRoom({ code: msg.code, seat: msg.seat, isHost: msg.isHost, options: msg.options });
          break;
        case "state":
          setError("");
          setGameState(msg);
          break;
        case "ping":
          // The one heartbeat the server drives; reply so it can measure latency
          // and know we're alive (so our seat isn't reaped / auto-folded).
          socket.send(JSON.stringify({ t: "pong", sentAt: msg.sentAt }));
          break;
        case "error":
          setError(msg.message);
          break;
        default:
          break;
      }
    };
    return () => socket.close();
  }, [playerId]);

  const rawSend = useCallback((obj) => ws.current?.send(JSON.stringify(obj)), []);

  const listRooms = useCallback(
    () => rawSend({ t: "lobby:list", gameId }),
    [rawSend, gameId],
  );
  const createRoom = useCallback(
    (name, options) => rawSend({ t: "lobby:create", gameId, name, options }),
    [rawSend, gameId],
  );
  const joinRoom = useCallback(
    (code, name) => rawSend({ t: "lobby:join", gameId, code, name }),
    [rawSend, gameId],
  );
  // Quick-match: drop into any open room or create one, filling with bots so a
  // quiet lobby is still playable.
  const quickMatch = useCallback(
    (name, options) => rawSend({ t: "lobby:quickmatch", gameId, name, options }),
    [rawSend, gameId],
  );
  const spectate = useCallback(
    (code) => rawSend({ t: "lobby:spectate", gameId, code }),
    [rawSend, gameId],
  );

  // Host controls (no-ops server-side unless this player is the host).
  const kick = useCallback((targetId) => rawSend({ t: "host:kick", targetId }), [rawSend]);
  const lockRoom = useCallback((locked) => rawSend({ t: "host:lock", locked }), [rawSend]);
  const startEarly = useCallback(() => rawSend({ t: "host:start" }), [rawSend]);

  // In-room game message (engine payload), e.g. { action: {...} } or { cardId }.
  const send = useCallback((payload) => rawSend({ t: "game", ...payload }), [rawSend]);
  const restart = useCallback(() => rawSend({ t: "restart" }), [rawSend]);

  return {
    connected,
    rooms,
    room,
    gameState,
    error,
    listRooms,
    createRoom,
    joinRoom,
    quickMatch,
    spectate,
    kick,
    lockRoom,
    startEarly,
    send,
    restart,
  };
}
