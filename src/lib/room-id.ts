/** Generates a short, URL-safe room id. Each id names its own Durable Object. */
export function randomRoomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const ROOM_ID = /^[a-z0-9-]{3,64}$/i;

/**
 * Accepts a full share link, a `/room/...` path, or a bare room id and returns
 * the room id, or null when the input is not a valid room.
 */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      candidate = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }
  const match = candidate.match(/room\/([^/?#]+)/i);
  if (match) candidate = match[1];
  candidate = candidate.replace(/^\/+|\/+$/g, "");

  return ROOM_ID.test(candidate) ? candidate : null;
}
