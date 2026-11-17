import { bindings, defineConfig, exports } from "cf/config";

/**
 * One Worker: the Solid SSR handler, the room Durable Object, and the static
 * client build that `@cloudflare/vite-plugin` emits into `dist/client`.
 */
export default defineConfig({
  worker: {
    name: "chess",
    compatibilityDate: "2026-10-05",
    entrypoint: "./src/worker.ts",
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        persist: true,
      },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: true,
    },
    domains: ["chess.otbeaumont.me"],
    env: {
      VAPID_PUBLIC_KEY: bindings.text(
        "BIKGTLYuocQMjA3Nm-auKJnV7QIomV3T4jH4i7ol10g5RHAqaMoSfqh3-dQCmLxENPgVWCF6aICukVu8SzKYT3k",
      ),
      VAPID_SUBJECT: bindings.text("mailto:oscar@otbeaumont.me"),
      VAPID_PRIVATE_KEY: bindings.secret(),
      ROOMS: bindings.durableObject({
        worker: "chess",
        exportName: "ChessRoom",
      }),
      ASSETS: bindings.assets(),
    },
    exports: {
      ChessRoom: exports.durableObject({
        storage: "sqlite",
      }),
    },
  },
});
