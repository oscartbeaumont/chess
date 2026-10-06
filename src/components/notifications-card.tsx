import { createSignal, createTrackedEffect, Show } from "solid-js";
import type { PushSubscriptionJSON } from "~/lib/protocol";
import type { RoomSession } from "~/lib/session";
import {
  disablePush,
  enablePush,
  existingSubscription,
  pushPermission,
  pushSupported,
} from "~/lib/push";
import { isIos, isStandalone } from "~/lib/pwa";

export interface NotificationsCardProps {
  session: RoomSession;
  seated: () => boolean;
}

/**
 * Lets a seated player turn on Web Push. iOS only supports push for the app
 * installed to the Home Screen, so it points Safari users at that first.
 */
export function NotificationsCard(props: NotificationsCardProps) {
  const [supported] = createSignal(pushSupported());
  const [subscribed, setSubscribed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const refresh = async () => {
    try {
      const subscription = await existingSubscription();
      setSubscribed(Boolean(subscription) && pushPermission() === "granted");
    } catch {
      setSubscribed(false);
    }
  };

  // Once connected and seated, make sure the server has this device's
  // subscription (it may have restarted or been re-created).
  createTrackedEffect(() => {
    const connection = props.session.connection();
    const seated = props.seated();
    if (connection !== "open" || !seated) return;
    void (async () => {
      try {
        const subscription = await existingSubscription();
        if (subscription && pushPermission() === "granted") {
          setSubscribed(true);
          props.session.send({
            type: "pushSubscribe",
            subscription: subscription.toJSON() as PushSubscriptionJSON,
          });
        }
      } catch {
        // Leave the UI as-is; the player can retry.
      }
    })();
  });

  createTrackedEffect(() => {
    void refresh();
  });

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await enablePush();
      props.session.send({ type: "pushSubscribe", subscription });
      setSubscribed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const endpoint = await disablePush();
      if (endpoint) props.session.send({ type: "pushUnsubscribe", endpoint });
      setSubscribed(false);
    } catch {
      setError("Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={supported()}>
      <div class="rounded-xl bg-surface p-3 ring-1 ring-border">
        <h2 class="mb-1 px-1 text-xs font-semibold tracking-wide text-text-subtle uppercase">
          Notifications
        </h2>

        <Show
          when={isIos() && !isStandalone()}
          fallback={
            <div class="px-1">
              <Show
                when={subscribed()}
                fallback={
                  <>
                    <p class="mb-2 text-sm text-text-muted">
                      Get a ping when it is your move, even with the app closed.
                    </p>
                    <button
                      type="button"
                      disabled={busy()}
                      onClick={enable}
                      class="h-10 w-full rounded-lg bg-accent text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {busy() ? "Enabling…" : "Notify me on my move"}
                    </button>
                  </>
                }
              >
                <p class="mb-2 text-sm text-text-muted">
                  Notifications are on. We will ping you when it is your move.
                </p>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={disable}
                  class="h-10 w-full rounded-lg border border-border bg-surface-subtle text-sm font-semibold text-text transition-colors hover:bg-border disabled:opacity-50"
                >
                  {busy() ? "Turning off…" : "Turn off"}
                </button>
              </Show>
            </div>
          }
        >
          <p class="px-1 text-sm text-text-muted">
            To get move notifications, add Chess to your Home Screen first: tap{" "}
            <span class="mx-0.5 inline-flex translate-y-[2px]">
              <ShareIcon />
            </span>{" "}
            Share, then <span class="font-medium text-text">Add to Home Screen</span>, and open it
            from there.
          </p>
        </Show>

        <Show when={pushPermission() === "denied"}>
          <p class="mt-2 px-1 text-xs text-danger-strong">
            Notifications are blocked. Allow them in your browser or system settings.
          </p>
        </Show>

        <Show when={error()}>
          {(message) => (
            <p class="mt-2 px-1 text-xs text-danger-strong" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      class="inline h-4 w-4"
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
