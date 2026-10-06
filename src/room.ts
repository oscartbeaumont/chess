import { DurableObject } from "cloudflare:workers";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import {
  type ClientMessage,
  type GameStatus,
  type MoveInput,
  type PlayedMove,
  type PushSubscriptionJSON,
  type RoomState,
  type ServerMessage,
} from "./lib/protocol";
import { pushConfigured, sendPush, type PushPayload, type StoredSubscription } from "./lib/webpush";

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
  subscriptions: "subscriptions",
} as const;

/** The maximum number of stored push subscriptions per room. */
const MAX_SUBSCRIPTIONS = 20;

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
  private subscriptions: StoredSubscription[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.moves = (await ctx.storage.get<MoveInput[]>(STORAGE_KEYS.moves)) ?? [];
      this.seats = (await ctx.storage.get<Seats>(STORAGE_KEYS.seats)) ?? { w: null, b: null };
      this.override = (await ctx.storage.get<Override>(STORAGE_KEYS.override)) ?? null;
      this.drawOffer = (await ctx.storage.get<Color>(STORAGE_KEYS.drawOffer)) ?? null;
      this.subscriptions =
        (await ctx.storage.get<StoredSubscription[]>(STORAGE_KEYS.subscriptions)) ?? [];
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
      const joined = await this.seat(playerId);
      server.send(JSON.stringify({ type: "hello", playerId }));
      this.sendState(server);
      this.broadcast();
      // A newly filled seat means someone is waiting on a move they can now
      // make; tell them their opponent has arrived.
      if (joined) await this.notifyTurn();
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
        await this.notifyAfterMove(color);
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
        await this.notifyTo(color === "w" ? "b" : "w", {
          title: "Your opponent resigned",
          body: `You win by resignation in room ${this.roomId()}.`,
          url: this.roomUrl(),
          tag: "game-over",
        });
        return;
      }
      case "offerDraw": {
        if (color === "spectator") throw new Error("You are watching.");
        if (over) throw new Error("This game is over.");
        this.drawOffer = color;
        await this.persist();
        this.broadcast();
        await this.notifyTo(color === "w" ? "b" : "w", {
          title: "Draw offered",
          body: "Your opponent offers a draw.",
          url: this.roomUrl(),
          tag: "draw-offer",
        });
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
        await this.notifyTo(color === "w" ? "b" : "w", {
          title: "Draw agreed",
          body: "The game is a draw.",
          url: this.roomUrl(),
          tag: "game-over",
        });
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
        await this.notifyTurn();
        return;
      }
      case "pushSubscribe": {
        if (color === "spectator") throw new Error("Only seated players can subscribe.");
        const playerId = this.attachment(ws)?.playerId;
        if (playerId) await this.subscribe(playerId, message.subscription);
        return;
      }
      case "pushUnsubscribe": {
        await this.unsubscribe(message.endpoint);
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

  /** Claims an open seat for `playerId`. Returns true when it just joined. */
  private async seat(playerId: string): Promise<boolean> {
    if (this.seats.w === playerId || this.seats.b === playerId) return false;
    if (this.seats.w === null) this.seats.w = playerId;
    else if (this.seats.b === null) this.seats.b = playerId;
    else return false;
    await this.ctx.storage.put(STORAGE_KEYS.seats, this.seats);
    return true;
  }

  private roomId(): string {
    return this.ctx.id.name ?? "room";
  }

  private roomUrl(): string {
    return `/room/${encodeURIComponent(this.roomId())}`;
  }

  private async subscribe(playerId: string, subscription: PushSubscriptionJSON): Promise<void> {
    if (!subscription?.endpoint) return;
    this.subscriptions = this.subscriptions.filter(
      (entry) => entry.endpoint !== subscription.endpoint,
    );
    this.subscriptions.push({
      playerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
    if (this.subscriptions.length > MAX_SUBSCRIPTIONS)
      this.subscriptions = this.subscriptions.slice(-MAX_SUBSCRIPTIONS);
    await this.ctx.storage.put(STORAGE_KEYS.subscriptions, this.subscriptions);
  }

  private async unsubscribe(endpoint: string): Promise<void> {
    const next = this.subscriptions.filter((entry) => entry.endpoint !== endpoint);
    if (next.length === this.subscriptions.length) return;
    this.subscriptions = next;
    await this.ctx.storage.put(STORAGE_KEYS.subscriptions, this.subscriptions);
  }

  /** Sends a notification to every device registered to one seat. */
  private async notifyTo(color: Color, payload: PushPayload): Promise<void> {
    if (!pushConfigured(this.env)) return;
    const playerId = this.seats[color];
    if (!playerId) return;

    const targets = this.subscriptions.filter((entry) => entry.playerId === playerId);
    if (targets.length === 0) return;

    const keys = {
      publicKey: this.env.VAPID_PUBLIC_KEY,
      privateKey: this.env.VAPID_PRIVATE_KEY,
      subject: this.env.VAPID_SUBJECT,
    };

    const expired: string[] = [];
    await Promise.all(
      targets.map(async (target) => {
        try {
          if ((await sendPush(target, payload, keys)) === "gone") expired.push(target.endpoint);
        } catch (error) {
          console.error("push send failed", this.roomId(), error);
        }
      }),
    );

    if (expired.length > 0) {
      this.subscriptions = this.subscriptions.filter((entry) => !expired.includes(entry.endpoint));
      await this.ctx.storage.put(STORAGE_KEYS.subscriptions, this.subscriptions);
    }
  }

  /** Notifies the player who must move next. Does nothing before the game starts. */
  private async notifyTurn(): Promise<void> {
    const game = this.game();
    if (this.override || game.isGameOver()) return;
    if (!this.seats.w || !this.seats.b) return;
    await this.notifyTo(game.turn(), {
      title: "Your move",
      body: `It's your turn in room ${this.roomId()}.`,
      url: this.roomUrl(),
      tag: `turn-${this.moves.length}`,
    });
  }

  /** Sends the notification that fits the position after a move. */
  private async notifyAfterMove(mover: Color): Promise<void> {
    const game = this.game();
    const derived = this.deriveStatus(game);
    if (derived.status === "checkmate") {
      await this.notifyTo(game.turn(), {
        title: "Checkmate",
        body: "Your opponent won the game.",
        url: this.roomUrl(),
        tag: "game-over",
      });
      return;
    }
    if (derived.status === "stalemate" || derived.status === "draw") {
      await this.notifyTo(mover === "w" ? "b" : "w", {
        title: "Draw",
        body: "The game ended in a draw.",
        url: this.roomUrl(),
        tag: "game-over",
      });
      return;
    }
    await this.notifyTurn();
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
