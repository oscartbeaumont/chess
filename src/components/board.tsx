import { Chess, type Square } from "chess.js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { PieceSymbol, RoomState } from "~/lib/protocol";
import { cn } from "~/lib/utils";

const GLYPHS: Record<PieceSymbol, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const PROMOTIONS: PieceSymbol[] = ["q", "r", "b", "n"];

interface SquareView {
  square: Square;
  dark: boolean;
  file: string;
  rank: string;
}

export interface BoardProps {
  state: RoomState;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
}

/**
 * The interactive chessboard. It renders from the authoritative FEN, orients
 * itself to the local player's colour, and highlights legal moves using the
 * same chess rules as the server.
 */
export function Board(props: BoardProps) {
  const game = createMemo(() => new Chess(props.state.fen));
  const [selected, setSelected] = createSignal<Square | null>(null);
  const [pending, setPending] = createSignal<{ from: Square; to: Square } | null>(null);

  const orientation = () => (props.state.you === "b" ? "b" : "w");

  const squares = createMemo<SquareView[]>(() => {
    const ranks = orientation() === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files =
      orientation() === "w"
        ? ["a", "b", "c", "d", "e", "f", "g", "h"]
        : ["h", "g", "f", "e", "d", "c", "b", "a"];
    const out: SquareView[] = [];
    for (const rank of ranks) {
      for (const file of files) {
        const square = `${file}${rank}` as Square;
        const fileIndex = file.charCodeAt(0) - 97;
        out.push({
          square,
          dark: (fileIndex + rank) % 2 === 1,
          file,
          rank: String(rank),
        });
      }
    }
    return out;
  });

  const myTurn = () => props.state.status === "playing" && props.state.turn === props.state.you;

  const targets = createMemo(() => {
    const from = selected();
    if (!from || !myTurn()) return new Set<string>();
    return new Set(
      game()
        .moves({ square: from, verbose: true })
        .map((move) => move.to as string),
    );
  });

  const checkedKing = createMemo<Square | null>(() => {
    if (!props.state.inCheck) return null;
    const turn = props.state.turn;
    for (const row of game().board())
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  });

  const click = (square: Square) => {
    if (pending()) return;
    const piece = game().get(square);
    const from = selected();

    if (from) {
      if (targets().has(square)) {
        const moving = game().get(from);
        const lastRank = square[1] === "8" || square[1] === "1";
        if (moving?.type === "p" && lastRank) {
          setPending({ from, to: square });
          return;
        }
        props.onMove(from, square);
        setSelected(null);
        return;
      }
      if (piece && piece.color === props.state.you && myTurn()) {
        setSelected(square);
        return;
      }
      setSelected(null);
      return;
    }

    if (piece && piece.color === props.state.you && myTurn()) setSelected(square);
  };

  const choosePromotion = (promotion: PieceSymbol) => {
    const target = pending();
    if (!target) return;
    props.onMove(target.from, target.to, promotion);
    setPending(null);
    setSelected(null);
  };

  return (
    <div
      class="relative mx-auto aspect-square w-full max-w-[600px] overflow-hidden rounded-lg ring-1 shadow-2xl ring-black/25"
      style={{ "container-type": "inline-size" }}
    >
      <div class="grid h-full w-full grid-cols-8 grid-rows-8">
        <For each={squares()} keyed={false}>
          {(view, index) => {
            const square = () => view().square;
            const dark = () => view().dark;
            const piece = () => game().get(square());
            const isTarget = () => targets().has(square());
            const showRank = () => index % 8 === 0;
            const showFile = () => index >= 56;
            return (
              <button
                type="button"
                class={cn(
                  "relative flex touch-manipulation items-center justify-center outline-none",
                  dark() ? "bg-[var(--color-dark-square)]" : "bg-[var(--color-light-square)]",
                  myTurn() && "cursor-pointer",
                )}
                onClick={() => click(square())}
                aria-label={`${square()}${piece() ? ` ${piece()!.color === "w" ? "white" : "black"} ${piece()!.type}` : ""}`}
              >
                <Show
                  when={
                    props.state.lastMove?.from === square() || props.state.lastMove?.to === square()
                  }
                >
                  <span class="pointer-events-none absolute inset-0 bg-[var(--color-last-move)]" />
                </Show>
                <Show when={selected() === square()}>
                  <span class="pointer-events-none absolute inset-0 bg-[var(--color-selected)]" />
                </Show>
                <Show when={checkedKing() === square()}>
                  <span class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(220,38,38,0.9),transparent_70%)]" />
                </Show>

                <Show when={showRank()}>
                  <span
                    class={cn(
                      "pointer-events-none absolute top-[3%] left-[5%] text-[2.4cqw] font-semibold",
                      dark() ? "text-white/70" : "text-black/45",
                    )}
                  >
                    {view().rank}
                  </span>
                </Show>
                <Show when={showFile()}>
                  <span
                    class={cn(
                      "pointer-events-none absolute right-[5%] bottom-[2%] text-[2.4cqw] font-semibold",
                      dark() ? "text-white/70" : "text-black/45",
                    )}
                  >
                    {view().file}
                  </span>
                </Show>

                <span
                  class={cn(
                    "piece relative z-10 text-[11cqw]",
                    piece()?.color === "w" ? "piece-white" : "piece-black",
                  )}
                  aria-hidden="true"
                >
                  {piece() ? GLYPHS[piece()!.type] : ""}
                </span>

                <Show when={isTarget()}>
                  <span
                    class={cn(
                      "pointer-events-none absolute z-20",
                      piece()
                        ? "inset-0 ring-[0.8cqw] ring-black/30 ring-inset"
                        : "h-[3.4cqw] w-[3.4cqw] rounded-full bg-black/30",
                    )}
                  />
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      <Show when={pending()}>
        <div class="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div class="flex flex-col items-center gap-3 rounded-xl bg-surface px-5 py-4 shadow-2xl ring-1 ring-border">
            <p class="text-sm font-semibold text-text">Promote pawn</p>
            <div class="flex gap-2">
              <For each={PROMOTIONS} keyed={false}>
                {(promotion) => (
                  <button
                    type="button"
                    class="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-subtle text-4xl transition-colors hover:bg-accent hover:text-accent-contrast"
                    onClick={() => choosePromotion(promotion())}
                    aria-label={`Promote to ${promotion()}`}
                  >
                    <span
                      class={cn("piece", props.state.you === "b" ? "piece-black" : "piece-white")}
                    >
                      {GLYPHS[promotion()]}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
