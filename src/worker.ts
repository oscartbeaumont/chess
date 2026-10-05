import solidHandler from "virtual:solid-ssr-handler";
import { ChessRoom } from "./room";

// Durable Object classes must be exported from the Worker entry.
export { ChessRoom };

/**
 * The Worker entry. Room WebSockets and room metadata go to the room's
 * Durable Object, static client assets go straight from the asset binding,
 * and everything else is server-rendered by the generated Solid handler.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });

    if (url.pathname.startsWith("/api/rooms/")) {
      const roomId = decodeURIComponent(
        url.pathname.slice("/api/rooms/".length).split("/")[0] ?? "",
      );
      if (!roomId) return Response.json({ error: "Missing room id." }, { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      return stub.fetch(request);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    return solidHandler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
