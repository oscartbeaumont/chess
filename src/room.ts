import { DurableObject } from "cloudflare:workers";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import {
  type ClientMessage,
  type GameStatus,
  type MoveInput,
  type PlayedMove,
  type RoomState,
  type ServerMessage,
} from "./lib/protocol";

interface Override {
  status: GameStatus;
  result: string | null;
  winner: Color | null;
}

interface Seats {
  w: string | null;
  b: string | null;
}

interface Attachment {
  playerId: string;
}

const STORAGE_KEYS = {
  moves: "moves",
  seats: "seats",
  override: "override",
  drawOffer: "drawOffer",
} as const;

/**
 * One chess room per Durable Object. The share link's room id names the object,
 * so every link gets its own independent game. Clients connect over a
 * hibernating WebSocket, and all moves are validated and stored here so the
 * board survives disconnects, refreshes, and worker restarts.
 */
export class ChessRoom extends DurableObject<Env> {
  private moves: MoveInput[] = [];
  private seats: Seats = { w: null, b: null };
  private override: Override | null = null;
  private drawOffer: Color | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.moves = (await ctx.storage.get<MoveInput[]>(STORAGE_KEYS.moves)) ?? [];
      this.seats = (await ctx.storage.get<Seats>(STORAGE_KEYS.seats)) ?? { w: null, b: null };
      this.override = (await ctx.storage.get<Override>(STORAGE_KEYS.override)) ?? null;
      this.drawOffer = (await ctx.storage.get<Color>(STORAGE_KEYS.drawOffer)) ?? null;
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    if (upgrade?.toLowerCase() === "websocket") {
      const playerId = url.searchParams.get("playerId") || crypto.randomUUID();
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId } satisfies Attachment);
      await this.seat(playerId);
      server.send(JSON.stringify({ type: "hello", playerId }));
      this.sendState(server);
      this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }

    return Response.json(this.snapshot(this.colorFor(null)));
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const playerId = this.attachment(ws)?.playerId ?? null;
    const color = this.colorFor(playerId);

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      this.send(ws, { type: "error", message: "Malformed message." });
      return;
    }

    try {
      await this.handle(ws, color, parsed);
    } catch (error) {
      this.send(ws, {
        type: "error",
        message: error instanceof Error ? error.message : "Move failed.",
      });
    }
  }

  override async webSocketClose(): Promise<void> {
    this.broadcast();
  }

  override async webSocketError(): Promise<void> {
    this.broadcast();
  }

  private async handle(
    ws: WebSocket,
    color: Color | "spectator",
    message: ClientMessage,
  ): Promise<void> {
    const game = this.game();
    const over = this.override !== null || game.isGameOver();

    switch (message.type) {
      case "move": {
        if (color === "spectator") throw new Error("Only seated players can move.");
        if (over) throw new Error("This game is over.");
        if (game.turn() !== color) throw new Error("It is not your turn.");

        const promotion = this.promotion(game, message);
        const result = game.move({
          from: message.from,
          to: message.to,
          promotion,
        });
        this.moves.push({
          from: result.from,
          to: result.to,
          ...(result.promotion ? { promotion: result.promotion } : {}),
        });
        this.drawOffer = null;
        await this.persist();
        this.broadcast();
        return;
      }
      case "resign": {
        if (color === "spectator") throw new Error("You are watching.");
        if (over) throw new Error("This game is over.");
        this.override = {
          status: "resigned",
          result: color === "w" ? "0-1" : "1-0",
          winner: color === "w" ? "b" : "w",
        };
        this.drawOffer = null;
        await this.persist();
        this.broadcast();
        return;
      }
      case "offerDraw": {
        if (color === "spectator") throw new Error("You are watching.");
        if (over) throw new Error("This game is over.");
        this.drawOffer = color;
        await this.persist();
        this.broadcast();
        return;
      }
      case "acceptDraw": {
        if (color === "spectator") throw new Error("You are watching.");
        if (over) throw new Error("This game is over.");
        if (this.drawOffer === null || this.drawOffer === color)
          throw new Error("There is no draw to accept.");
        this.override = {
          status: "draw",
          result: "1/2-1/2",
          winner: null,
        };
        this.drawOffer = null;
        await this.persist();
        this.broadcast();
        return;
      }
      case "declineDraw": {
        if (this.drawOffer !== null && this.drawOffer !== color) {
          this.drawOffer = null;
          await this.persist();
          this.broadcast();
        }
        return;
      }
      case "reset": {
        if (!over && this.moves.length > 0)
          throw new Error("Finish the game before starting a rematch.");
        this.moves = [];
        this.override = null;
        this.drawOffer = null;
        this.seats = { w: this.seats.b, b: this.seats.w };
        await this.persist();
        this.broadcast();
        return;
      }
      default:
        this.send(ws, { type: "error", message: "Unknown message." });
    }
  }

  /** Fills the pawn promotion that a move implied but did not name. */
  private promotion(
    game: Chess,
    move: Extract<ClientMessage, { type: "move" }>,
  ): PieceSymbol | undefined {
    if (move.promotion) return move.promotion;
    const piece = game.get(move.from as Square);
    const rank = move.to[1];
    if (piece?.type === "p" && (rank === "8" || rank === "1")) return "q";
    return undefined;
  }

  private async seat(playerId: string): Promise<void> {
    if (this.seats.w === playerId || this.seats.b === playerId) return;
    if (this.seats.w === null) this.seats.w = playerId;
    else if (this.seats.b === null) this.seats.b = playerId;
    await this.ctx.storage.put(STORAGE_KEYS.seats, this.seats);
  }

  private colorFor(playerId: string | null): Color | "spectator" {
    if (playerId && this.seats.w === playerId) return "w";
    if (playerId && this.seats.b === playerId) return "b";
    return "spectator";
  }

  private connectionColors(): Set<Color> {
    const colors = new Set<Color>();
    for (const socket of this.ctx.getWebSockets()) {
      const color = this.colorFor(this.attachment(socket)?.playerId ?? null);
      if (color !== "spectator") colors.add(color);
    }
    return colors;
  }

  private attachment(ws: WebSocket): Attachment | undefined {
    try {
      return ws.deserializeAttachment() as Attachment | undefined;
    } catch {
      return undefined;
    }
  }

  private game(): Chess {
    const game = new Chess();
    for (const move of this.moves)
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
    return game;
  }

  private snapshot(you: Color | "spectator"): RoomState {
    const game = this.game();
    const connected = this.connectionColors();
    const history = game.history({ verbose: true }) as PlayedMove[];
    const derived = this.deriveStatus(game);
    const last = this.moves.at(-1) ?? null;

    return {
      roomId: this.ctx.id.name ?? "",
      fen: game.fen(),
      turn: game.turn(),
      moves: history.map((move) => ({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
        san: move.san,
        color: move.color,
      })),
      you,
      whiteConnected: connected.has("w"),
      blackConnected: connected.has("b"),
      whiteSeated: this.seats.w !== null,
      blackSeated: this.seats.b !== null,
      status: derived.status,
      result: derived.result,
      winner: derived.winner,
      inCheck: game.isCheck(),
      drawOffer: this.drawOffer,
      lastMove: last && { from: last.from, to: last.to },
    };
  }

  private deriveStatus(game: Chess): Override {
    if (this.override) return this.override;
    if (game.isCheckmate())
      return {
        status: "checkmate",
        result: game.turn() === "w" ? "0-1" : "1-0",
        winner: game.turn() === "w" ? "b" : "w",
      };
    if (game.isStalemate()) return { status: "stalemate", result: "1/2-1/2", winner: null };
    if (game.isDraw()) return { status: "draw", result: "1/2-1/2", winner: null };
    const started = this.moves.length > 0 || (this.seats.w && this.seats.b);
    return started
      ? { status: "playing", result: null, winner: null }
      : { status: "waiting", result: null, winner: null };
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEYS.moves, this.moves);
    await this.ctx.storage.put(STORAGE_KEYS.seats, this.seats);
    await this.ctx.storage.put(STORAGE_KEYS.override, this.override);
    await this.ctx.storage.put(STORAGE_KEYS.drawOffer, this.drawOffer);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The socket closed between read and write; the next broadcast will
      // reconcile the room.
    }
  }

  private sendState(ws: WebSocket): void {
    const you = this.colorFor(this.attachment(ws)?.playerId ?? null);
    this.send(ws, { type: "state", state: this.snapshot(you) });
  }

  private broadcast(): void {
    for (const socket of this.ctx.getWebSockets()) this.sendState(socket);
  }
}
