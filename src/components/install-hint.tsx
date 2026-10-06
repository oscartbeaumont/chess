import { createSignal, createTrackedEffect, Show } from "solid-js";
import { dismissInstallHint, recordInstallVisit, shouldShowInstallHint } from "~/lib/pwa";

/** A dismissible hint that points iOS Safari users at Add to Home Screen. */
export function InstallHint() {
  const [visible, setVisible] = createSignal(false);

  createTrackedEffect(() => {
    recordInstallVisit();
    setVisible(shouldShowInstallHint());
  });

  const dismiss = () => {
    dismissInstallHint();
    setVisible(false);
  };

  return (
    <Show when={visible()}>
      <div
        class="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
        style={{ "padding-bottom": "calc(var(--safe-bottom) + 0.75rem)" }}
      >
        <div
          class="flex w-full max-w-md items-start gap-3 rounded-2xl bg-surface p-4 shadow-2xl ring-1 ring-border"
          role="region"
          aria-label="Add to Home Screen"
        >
          <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-text">
            <ShareIcon />
          </span>
          <div class="min-w-0 flex-1 text-sm text-text-muted">
            <p class="font-semibold text-text">Add Chess to your Home Screen</p>
            <p class="mt-0.5">
              Tap <ShareIcon class="mx-0.5 inline h-3.5 w-3.5 translate-y-[2px]" /> Share, then{" "}
              <span class="font-medium text-text">Add to Home Screen</span> for a full-screen app
              and move notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            class="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface-subtle hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  );
}

function ShareIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      class={props.class ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
