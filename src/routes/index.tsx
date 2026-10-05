import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { parseRoomInput, randomRoomId } from "~/lib/room-id";

const primaryButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-base font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none sm:w-auto";

/** The landing page: start a fresh room, or join one from a link or code. */
export default function Home() {
  const navigate = useNavigate();
  const [join, setJoin] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const start = () => navigate(`/room/${randomRoomId()}`);

  const joinRoom = (event: SubmitEvent) => {
    event.preventDefault();
    const id = parseRoomInput(join());
    if (!id) {
      setError("That does not look like a room link or code.");
      return;
    }
    navigate(`/room/${id}`);
  };

  return (
    <main class="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
      <div
        class="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, rgba(255,214,0,0.14), transparent 60%)",
        }}
      />
      <div class="relative w-full max-w-md">
        <Title>Chess — play with a friend</Title>
        <div class="rounded-2xl bg-surface p-8 shadow-2xl ring-1 ring-border">
          <div class="mb-6 flex flex-col items-center text-center">
            <div class="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-subtle text-6xl ring-1 ring-border">
              <span class="piece piece-white">♞</span>
            </div>
            <h1 class="text-3xl font-bold tracking-tight text-text">Play chess with a friend</h1>
            <p class="mt-2 text-sm text-text-muted">
              Start a game, share the link, and play in real time. No account needed.
            </p>
          </div>

          <button type="button" class={primaryButton} onClick={start}>
            Start a new game
          </button>

          <div class="my-6 flex items-center gap-3 text-xs text-text-subtle">
            <span class="h-px flex-1 bg-border" />
            or join a game
            <span class="h-px flex-1 bg-border" />
          </div>

          <form class="flex flex-col gap-3 sm:flex-row" onSubmit={joinRoom}>
            <input
              type="text"
              value={join()}
              onInput={(event) => {
                setJoin(event.currentTarget.value);
                setError(null);
              }}
              placeholder="Paste a link or room code"
              autocomplete="off"
              spellcheck={false}
              aria-label="Room link or code"
              class="h-12 min-w-0 flex-1 rounded-lg border border-border bg-canvas px-4 text-sm text-text placeholder:text-text-subtle focus:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            />
            <button
              type="submit"
              class="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-surface-subtle px-5 text-sm font-semibold text-text transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              Join
            </button>
          </form>

          <Show when={error()}>
            <p class="mt-3 text-sm text-danger-strong" role="alert">
              {error()}
            </p>
          </Show>
        </div>

        <p class="mt-4 text-center text-xs text-text-subtle">
          Every link is a private room for exactly two players.
        </p>
      </div>
    </main>
  );
}
