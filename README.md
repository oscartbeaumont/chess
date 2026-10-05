# Chess

A multiplayer chess app for two players, built with Solid v2 and deployed on
Cloudflare Workers.

Each game lives at its own share link (`/room/<id>`). Every link maps to a
separate Cloudflare Durable Object, so many games can run at the same time.
The Durable Object is the authority on the game: it checks every move, stores
the position, and pushes updates to both players over a hibernating WebSocket.

Live at [chess.otbeaumont.me](https://chess.otbeaumont.me).

## Features

- Two players per room; extra visitors become spectators.
- Share a link to start a game — no account or sign-up.
- Server-validated moves, legal-move hints, and check highlighting.
- Pawn promotion picker, resign, draw offers, and a rematch that swaps colours.
- Games survive refreshes and disconnects; players keep their seat.
- Responsive board that orients itself to your colour.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the printed URL, start a game, and open the share link in another browser
or device to play.

## Scripts

| Command          | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `pnpm dev`       | Start the Vite dev server with the Worker and Durable Object |
| `pnpm build`     | Build the client and the Worker                              |
| `pnpm preview`   | Run the built app in the Workers runtime                     |
| `pnpm deploy`    | Build and deploy to Cloudflare                               |
| `pnpm typecheck` | Type-check the project                                       |
| `pnpm lint`      | Lint with oxlint                                             |
| `pnpm format`    | Format with oxfmt                                            |
| `pnpm cf:types`  | Regenerate Cloudflare binding types                          |

## How it works

- **Client** — a Solid v2 single-page app (Solid Vite plugin, start mode),
  styled with Tailwind v4 and routed with filesystem-routing.
- **Worker** (`src/worker.ts`) — serves static assets, forwards room traffic to
  the matching Durable Object, and server-renders the app.
- **Room** (`src/room.ts`) — the `ChessRoom` Durable Object. It validates moves
  with `chess.js`, persists state in Durable Object storage, and broadcasts room
  state over WebSockets.
- **Protocol** (`src/lib/protocol.ts`) — the shared message and state types.

Each room id is hashed to one Durable Object with `idFromName`, so
`/room/abc` and `/room/xyz` are fully independent games.

## Deployment

`wrangler.jsonc` configures the Worker, its assets, the `ROOMS` Durable Object
binding, and the `chess.otbeaumont.me` custom domain. Deploy with:

```bash
pnpm deploy
```
