import { buildPushPayload } from "@block65/webcrypto-web-push";

/** A push subscription stored against the player who registered it. */
export interface StoredSubscription {
  playerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The notification body sent to a service worker. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** True when the VAPID keys needed to send push messages are configured. */
export function pushConfigured(env: Env): env is Env & {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
} {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

/** `"gone"` means the subscription is dead and should be removed. */
export type PushResult = "ok" | "gone" | "error";

/**
 * Encrypts and delivers one Web Push message (RFC 8291) with VAPID
 * authentication (RFC 8292). Works in the Workers runtime via Web Crypto.
 */
export async function sendPush(
  subscription: StoredSubscription,
  payload: PushPayload,
  keys: PushKeys,
): Promise<PushResult> {
  const data: Record<string, string> = { title: payload.title, body: payload.body };
  if (payload.url) data.url = payload.url;
  if (payload.tag) data.tag = payload.tag;

  const { headers, method, body } = await buildPushPayload(
    {
      data,
      options: {
        ttl: 60 * 60 * 24,
        urgency: "high",
        ...(payload.tag ? { topic: payload.tag } : {}),
      },
    },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    keys,
  );

  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) requestHeaders.set(name, String(value));
  }
  // The runtime sets the length for the byte body; drop the library's copy.
  requestHeaders.delete("content-length");

  const response = await fetch(subscription.endpoint, {
    method,
    headers: requestHeaders,
    body,
  });

  if (response.status === 404 || response.status === 410) return "gone";
  if (!response.ok) return "error";
  return "ok";
}
