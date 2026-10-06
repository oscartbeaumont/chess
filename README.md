# Chess ♟️

> The worst chess game known to man — made for me and my girlfriend to play.

No accounts, no matchmaking, no clocks, no engine, no elo. Just two people and
one shared link. Start a game, send the link, and play. It works, and that is
honestly the nicest thing I can say about it.

Live at **[chess.otbeaumont.me](https://chess.otbeaumont.me)**.

## What it does

- Open a game and share the link; the next person to open it takes the other seat.
- Real-time play over WebSockets, with one Cloudflare Durable Object per game.
- The server checks every move, so refreshing to cheat is (mostly) not a thing.
- Legal-move hints, check highlights, pawn promotion, resign, draw offers, and rematch.
- Your seat and the game survive refreshes and disconnects.
- Add it to your phone's home screen and get a notification when it's your move.
- Anyone else who opens the link just watches.

## How it's built

- **Solid v2** single-page app, using the Solid Vite plugin in start mode.
- **Cloudflare Workers**, with one Durable Object per share link.
- **Tailwind v4** for styling and **chess.js** for the rules.
- Deployed with the **Cloudflare Vite plugin** and **Wrangler**.

## Contributing

It isn't looking for contributors, but it is looking for players.

If you want to run it yourself:

```bash
pnpm install
pnpm dev
```

Then open the printed local URL, start a game, and open the share link on a
second device.

Other handy commands:

```bash
pnpm build      # build the client and the Worker
pnpm preview    # run the build in the Workers runtime
pnpm deploy     # ship it to Cloudflare
pnpm typecheck  # type-check
pnpm lint       # lint with oxlint
pnpm format     # format with oxfmt
```
