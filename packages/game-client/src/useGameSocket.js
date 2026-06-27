// Shared multiplayer client hook. Connects to the gateway, exposes the lobby
// actions (create/join/list room) and a generic send() for in-room game
// messages, and surfaces the latest per-seat publicState.
//
// All games connect to the same gateway URL and identify themselves by gameId;
// the server routes by room code once joined.
import { useCallback, useEffect, useRef, useState } from "react";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3001";

export function useGameSocket(gameId) {
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null); // { code, seat } once joined
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState("");
  const ws = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(GATEWAY_URL);
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
          setRoom({ code: msg.code, seat: msg.seat });
          break;
        case "state":
          setError("");
          setGameState(msg);
          break;
        case "error":
          setError(msg.message);
          break;
        default:
          break;
      }
    };
    return () => socket.close();
  }, []);

  const rawSend = useCallback((obj) => ws.current?.send(JSON.stringify(obj)), []);

  const listRooms = useCallback(
    () => rawSend({ t: "lobby:list", gameId }),
    [rawSend, gameId],
  );
  const createRoom = useCallback(
    (name) => rawSend({ t: "lobby:create", gameId, name }),
    [rawSend, gameId],
  );
  const joinRoom = useCallback(
    (code, name) => rawSend({ t: "lobby:join", gameId, code, name }),
    [rawSend, gameId],
  );

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
    send,
    restart,
  };
}
