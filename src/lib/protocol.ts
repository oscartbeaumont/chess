import type { Color, PieceSymbol, Square } from "chess.js";

export type { Color, PieceSymbol, Square };

/** A player's seat in a room. `null` means the seat is still open. */
export type Seat = Color | null;

/** The lifecycle of a game inside a room. */
export type GameStatus = "waiting" | "playing" | "checkmate" | "stalemate" | "draw" | "resigned";

/** One move, in the minimal form needed to replay the game. */
export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

/** A move after the server accepted it. */
export interface PlayedMove extends MoveInput {
  san: string;
  color: Color;
}

/**
 * The full shared view of a room. `you` is filled in per connection, so two
 * players see the same board but a different seat.
 */
export interface RoomState {
  roomId: string;
  fen: string;
  turn: Color;
  moves: PlayedMove[];
  you: Color | "spectator";
  whiteConnected: boolean;
  blackConnected: boolean;
  whiteSeated: boolean;
  blackSeated: boolean;
  status: GameStatus;
  result: string | null;
  winner: Color | null;
  inCheck: boolean;
  drawOffer: Color | null;
  lastMove: MoveInput | null;
}

/** A browser push subscription, as produced by `PushSubscription.toJSON()`. */
export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Messages the browser sends to the room. */
export type ClientMessage =
  | { type: "move"; from: Square; to: Square; promotion?: PieceSymbol }
  | { type: "resign" }
  | { type: "offerDraw" }
  | { type: "acceptDraw" }
  | { type: "declineDraw" }
  | { type: "reset" }
  | { type: "pushSubscribe"; subscription: PushSubscriptionJSON }
  | { type: "pushUnsubscribe"; endpoint: string };

/** Messages the room sends to the browser. */
export type ServerMessage =
  | { type: "state"; state: RoomState }
  | { type: "error"; message: string }
  | { type: "hello"; playerId: string };

/** True when the status means the game has finished. */
export function isOver(status: GameStatus): boolean {
  return (
    status === "checkmate" || status === "stalemate" || status === "draw" || status === "resigned"
  );
}
