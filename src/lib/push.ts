import { isServer } from "@solidjs/web";
import type { PushSubscriptionJSON } from "./protocol";

/** True when the browser can register push notifications at all. */
export function pushSupported(): boolean {
  if (isServer) return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The current notification permission, if the API exists. */
export function pushPermission(): NotificationPermission {
  if (!pushSupported()) return "denied";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function vapidKey(): Promise<string> {
  const response = await fetch("/api/push/key");
  if (!response.ok) throw new Error("Could not load the notification key.");
  const data = (await response.json()) as { key?: string };
  if (!data.key) throw new Error("Notifications are not configured.");
  return data.key;
}

/** The subscription this device already has, if any. */
export async function existingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Asks for permission and returns a push subscription. Must be called from a
 * user gesture: iOS only allows the permission prompt from one.
 */
export async function enablePush(): Promise<PushSubscriptionJSON> {
  if (!pushSupported()) throw new Error("Notifications are not supported here.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await vapidKey()),
    }));
  return subscription.toJSON() as PushSubscriptionJSON;
}

/** Removes the local subscription and returns its endpoint, if there was one. */
export async function disablePush(): Promise<string | null> {
  const subscription = await existingSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
