import type { ParentProps } from "solid-js";
import { HydrationScript } from "@solidjs/web";

/** The HTML document shell for both server rendering and client hydration. */
export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0b0b0f" />
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
