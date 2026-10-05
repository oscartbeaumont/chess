import { isServer } from "@solidjs/web";
import { createSignal, onCleanup } from "solid-js";
import type { ClientMessage, RoomState, ServerMessage } from "./protocol";

export type ConnectionStatus = "connecting" | "open" | "offline";

const PLAYER_KEY = "chess:playerId";

/** A stable per-browser id, so a refresh keeps a player in their seat. */
export function playerId(): string {
  if (typeof localStorage === "undefined") return "";
  let id = localStorage.getItem(PLAYER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_KEY, id);
  }
  return id;
}

export interface RoomSession {
  state: () => RoomState | null;
  connection: () => ConnectionStatus;
  error: () => string | null;
  dismissError: () => void;
  send: (message: ClientMessage) => void;
}

/**
 * Connects to a room's Durable Object over a WebSocket and keeps the latest
 * room state in a signal. Reconnects with capped backoff if the socket drops.
 */
export function createRoomSession(roomId: string): RoomSession {
  const [state, setState] = createSignal<RoomState | null>(null);
  const [connection, setConnection] = createSignal<ConnectionStatus>("connecting");
  const [error, setError] = createSignal<string | null>(null);
  let socket: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed) return;
    setConnection("connecting");
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}/api/rooms/${encodeURIComponent(roomId)}/ws?playerId=${encodeURIComponent(playerId())}`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      attempts = 0;
      setConnection("open");
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "state") {
        setState(message.state);
        setError(null);
      } else if (message.type === "error") {
        setError(message.message);
      }
    };
    ws.onclose = () => {
      socket = null;
      if (closed) return;
      setConnection("offline");
      attempts += 1;
      timer = setTimeout(connect, Math.min(1000 * attempts, 8000));
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // Already closing.
      }
    };
  };

  // Start the socket immediately on the client. The server never runs this
  // module, but the guard keeps the code safe if it is ever rendered.
  if (!isServer) {
    connect();
    onCleanup(() => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    });
  }

  const send = (message: ClientMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else setError("Not connected. Trying to reconnect…");
  };

  return {
    state,
    connection,
    error,
    dismissError: () => setError(null),
    send,
  };
}
