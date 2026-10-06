import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { isServer } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Board } from "~/components/board";
import { NotificationsCard } from "~/components/notifications-card";
import { createRoomSession } from "~/lib/session";
import {
  isOver,
  type GameStatus,
  type PieceSymbol,
  type RoomState,
  type Square,
} from "~/lib/protocol";
import { cn } from "~/lib/utils";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

/** Splits the flat move list into numbered white/black rows. */
function moveRows(moves: RoomState["moves"]) {
  const rows: { number: number; white?: string; black?: string }[] = [];
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({
      number: index / 2 + 1,
      white: moves[index]?.san,
      black: moves[index + 1]?.san,
    });
  }
  return rows;
}

/** Signs the material difference from the board in the given FEN. */
function material(fen: string): { white: number; black: number; diff: number } {
  const placement = fen.split(" ")[0] ?? "";
  let white = 0;
  let black = 0;
  for (const character of placement) {
    const value = PIECE_VALUES[character.toLowerCase()];
    if (!value) continue;
    if (character === character.toUpperCase()) white += value;
    else black += value;
  }
  return { white, black, diff: white - black };
}

function statusLine(state: RoomState, offline: boolean) {
  if (offline) return { headline: "Reconnecting…", detail: "Hold on a moment." };
  switch (state.status) {
    case "waiting":
      return state.you === "spectator"
        ? { headline: "Waiting for players", detail: "" }
        : { headline: "Waiting for opponent", detail: "Share the link to start." };
    case "playing": {
      if (state.inCheck)
        return {
          headline: `${state.turn === "w" ? "White" : "Black"} is in check`,
          detail: "",
        };
      if (state.you === "spectator")
        return {
          headline: `${state.turn === "w" ? "White" : "Black"} to move`,
          detail: "You are watching.",
        };
      return state.turn === state.you
        ? { headline: "Your move", detail: "" }
        : { headline: "Opponent's move", detail: "" };
    }
    case "checkmate":
      return {
        headline: `Checkmate — ${state.winner === "w" ? "White" : "Black"} wins`,
        detail: state.result ?? "",
      };
    case "resigned":
      return {
        headline: `${state.winner === "w" ? "Black" : "White"} resigned`,
        detail: `${state.winner === "w" ? "White" : "Black"} wins ${state.result ?? ""}`,
      };
    case "stalemate":
      return { headline: "Stalemate", detail: "The game is a draw." };
    case "draw":
      return { headline: "Draw", detail: "The game is a draw." };
  }
}

function ConnectionDot(props: { connection: "connecting" | "open" | "offline" }) {
  return (
    <span
      class={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        props.connection === "open" && "bg-success",
        props.connection === "connecting" && "animate-pulse bg-accent",
        props.connection === "offline" && "bg-danger",
      )}
      title={props.connection}
    />
  );
}

function PlayerRow(props: {
  name: string;
  you: boolean;
  connected: boolean;
  seated: boolean;
  turn: boolean;
  status: GameStatus;
  advantage: number;
}) {
  return (
    <div
      class={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        props.turn && props.status === "playing"
          ? "bg-accent/15 ring-1 ring-accent/40"
          : "bg-surface-subtle",
      )}
    >
      <span
        class={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-2xl",
          props.name === "White" ? "piece-white" : "piece-black",
        )}
      >
        ♟
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-semibold text-text">
            {props.seated ? props.name : "Open seat"}
          </span>
          <Show when={props.you}>
            <span class="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent-contrast uppercase">
              You
            </span>
          </Show>
        </div>
        <span class="text-xs text-text-subtle">
          {props.seated ? (props.connected ? "Connected" : "Offline") : "Waiting for a player"}
        </span>
      </div>
      <Show when={props.advantage > 0}>
        <span class="text-sm font-semibold text-success-strong">+{props.advantage}</span>
      </Show>
      <Show when={props.seated}>
        <span
          class={cn(
            "h-2.5 w-2.5 rounded-full",
            props.connected ? "bg-success" : "bg-border-strong",
          )}
        />
      </Show>
    </div>
  );
}

function RoomView(props: { roomId: string }) {
  const session = createRoomSession(props.roomId);
  const state = session.state;
  const [origin] = createSignal(isServer ? "" : location.origin);
  const [copied, setCopied] = createSignal(false);

  createEffect(
    () => session.error(),
    (message) => {
      if (!message) return;
      const timer = setTimeout(session.dismissError, 3500);
      return () => clearTimeout(timer);
    },
  );

  const shareUrl = () => `${origin()}/room/${props.roomId}`;

  const copyLink = async () => {
    const url = `${origin() || location.origin}/room/${props.roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be denied; the link is still shown on screen.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const materialScore = createMemo(() =>
    state() ? material(state()!.fen) : { white: 0, black: 0, diff: 0 },
  );
  const whiteAdvantage = () => Math.max(0, materialScore().diff);
  const blackAdvantage = () => Math.max(0, -materialScore().diff);

  const offline = () => session.connection() === "offline" || session.connection() === "connecting";
  const line = () => (state() ? statusLine(state()!, offline()) : null);

  const onMove = (from: Square, to: Square, promotion?: PieceSymbol) =>
    session.send({ type: "move", from, to, ...(promotion ? { promotion } : {}) });

  const seated = () => state()?.you === "w" || state()?.you === "b";
  const gameOver = () => (state() ? isOver(state()!.status) : false);
  const canRematch = () =>
    gameOver() || (state()?.status === "waiting" && state()!.moves.length === 0);

  return (
    <div class="flex min-h-dvh flex-col">
      <Title>{`Chess room ${props.roomId}`}</Title>

      <header
        class="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur"
        style={{
          "padding-top": "var(--safe-top)",
          "padding-left": "var(--safe-left)",
          "padding-right": "var(--safe-right)",
        }}
      >
        <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <a
            href="/"
            class="flex items-center gap-2 rounded-lg px-1 text-lg font-bold tracking-tight text-text"
          >
            <span class="text-2xl leading-none">♞</span>
            Chess
          </a>
          <span class="hidden text-text-subtle sm:inline">·</span>
          <div class="hidden min-w-0 items-center gap-2 sm:flex">
            <span class="text-xs text-text-subtle">Room</span>
            <code class="truncate rounded bg-surface-subtle px-2 py-1 font-mono text-xs text-text">
              {props.roomId}
            </code>
          </div>
          <div class="ml-auto flex items-center gap-3">
            <span class="flex items-center gap-2 text-xs text-text-muted">
              <ConnectionDot connection={session.connection()} />
              <span class="hidden sm:inline">
                {session.connection() === "open"
                  ? "Live"
                  : session.connection() === "connecting"
                    ? "Connecting"
                    : "Offline"}
              </span>
            </span>
            <button
              type="button"
              onClick={copyLink}
              class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {copied() ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      </header>

      <main
        class="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        style={{
          "padding-left": "max(1rem, var(--safe-left))",
          "padding-right": "max(1rem, var(--safe-right))",
          "padding-bottom": "max(1.5rem, var(--safe-bottom))",
        }}
      >
        <section class="flex flex-col gap-4">
          <Show when={state()} fallback={<BoardSkeleton />}>
            {(current) => (
              <>
                <div
                  class={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3 ring-1",
                    offline()
                      ? "bg-surface-subtle ring-border"
                      : current().inCheck || gameOver()
                        ? "bg-danger/10 ring-danger/40"
                        : "bg-surface ring-border",
                  )}
                >
                  <div>
                    <p class="text-sm font-semibold text-text">{line()?.headline}</p>
                    <Show when={line()?.detail}>
                      <p class="text-xs text-text-muted">{line()?.detail}</p>
                    </Show>
                  </div>
                  <Show when={current().status === "playing"}>
                    <span class="rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium text-text-muted">
                      {current().moves.length} move
                      {current().moves.length === 1 ? "" : "s"}
                    </span>
                  </Show>
                </div>

                <div class="relative">
                  <Board state={current()} onMove={onMove} />
                  <Show when={current().status === "waiting" && seated()}>
                    <div class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/60 px-6 text-center backdrop-blur-sm">
                      <p class="text-lg font-bold text-white">Waiting for your opponent</p>
                      <p class="max-w-sm text-sm text-white/80">
                        Send them this link. The game starts the moment they open it.
                      </p>
                      <code class="max-w-full truncate rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-white">
                        {shareUrl()}
                      </code>
                      <button
                        type="button"
                        onClick={copyLink}
                        class="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
                      >
                        {copied() ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                  </Show>
                  <Show when={current().you === "spectator"}>
                    <div class="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white">
                      Watching
                    </div>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </section>

        <aside class="flex flex-col gap-4">
          <Show when={state()}>
            {(current) => (
              <>
                <div class="flex flex-col gap-2">
                  <PlayerRow
                    name="White"
                    you={current().you === "w"}
                    connected={current().whiteConnected}
                    seated={current().whiteSeated}
                    turn={current().turn === "w"}
                    status={current().status}
                    advantage={whiteAdvantage()}
                  />
                  <PlayerRow
                    name="Black"
                    you={current().you === "b"}
                    connected={current().blackConnected}
                    seated={current().blackSeated}
                    turn={current().turn === "b"}
                    status={current().status}
                    advantage={blackAdvantage()}
                  />
                </div>

                <Show when={seated()}>
                  <NotificationsCard session={session} seated={seated} />
                </Show>

                <div class="rounded-xl bg-surface p-3 ring-1 ring-border">
                  <h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-text-subtle uppercase">
                    Moves
                  </h2>
                  <div class="max-h-64 min-h-24 overflow-y-auto pr-1">
                    <Show
                      when={current().moves.length > 0}
                      fallback={
                        <p class="px-1 py-6 text-center text-sm text-text-subtle">No moves yet.</p>
                      }
                    >
                      <table class="w-full text-sm">
                        <tbody>
                          <For each={moveRows(current().moves)} keyed={false}>
                            {(row) => (
                              <tr class="border-b border-border/60 last:border-0">
                                <td class="w-8 py-1 text-right font-mono text-xs text-text-subtle">
                                  {row().number}.
                                </td>
                                <td class="py-1 pl-3 font-mono text-text">{row().white ?? ""}</td>
                                <td class="py-1 pl-3 font-mono text-text">{row().black ?? ""}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </Show>
                  </div>
                </div>

                <div class="flex flex-col gap-2">
                  <Show when={seated() && !gameOver()}>
                    <button
                      type="button"
                      disabled={current().status !== "playing"}
                      onClick={() => session.send({ type: "resign" })}
                      class="h-10 rounded-lg border border-border bg-surface text-sm font-semibold text-text transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Resign
                    </button>
                  </Show>

                  <Show when={seated() && !gameOver() && current().status === "playing"}>
                    <Show
                      when={current().drawOffer === null || current().drawOffer === current().you}
                      fallback={
                        <div class="rounded-lg bg-surface ring-1 ring-border">
                          <p class="border-b border-border px-3 py-2 text-sm text-text">
                            Opponent offers a draw.
                          </p>
                          <div class="grid grid-cols-2 gap-2 p-2">
                            <button
                              type="button"
                              onClick={() => session.send({ type: "acceptDraw" })}
                              class="h-9 rounded-md bg-success text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => session.send({ type: "declineDraw" })}
                              class="h-9 rounded-md border border-border bg-surface-subtle text-sm font-semibold text-text transition-colors hover:bg-border"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => session.send({ type: "offerDraw" })}
                        class="h-10 rounded-lg border border-border bg-surface text-sm font-semibold text-text transition-colors hover:bg-surface-subtle"
                      >
                        {current().drawOffer === current().you ? "Draw offered…" : "Offer draw"}
                      </button>
                    </Show>
                  </Show>

                  <Show when={canRematch()}>
                    <button
                      type="button"
                      onClick={() => session.send({ type: "reset" })}
                      class="h-10 rounded-lg bg-accent text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
                    >
                      {current().status === "waiting" ? "New game" : "Rematch (colours swap)"}
                    </button>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </aside>
      </main>

      <Show when={session.error()}>
        {(message) => (
          <div class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div
              class="pointer-events-auto rounded-lg bg-danger-strong px-4 py-2 text-sm font-medium text-white shadow-lg"
              role="alert"
            >
              {message()}
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div class="flex flex-col gap-4">
      <div class="h-14 animate-pulse rounded-xl bg-surface-subtle" />
      <div class="aspect-square w-full max-w-[600px] animate-pulse rounded-lg bg-surface-subtle" />
    </div>
  );
}

/** Route entry: keeps a fresh session per room id. */
export default function RoomRoute() {
  const params = useParams();
  const roomId = () => params.id ?? "";
  return (
    <Show when={roomId()} keyed>
      {(id) => <RoomView roomId={id} />}
    </Show>
  );
}
