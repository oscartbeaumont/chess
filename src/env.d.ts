// Secrets are supplied outside `wrangler.jsonc`: locally through `.dev.vars`,
// in production through `wrangler secret put`. Bindings and vars declared in
// `wrangler.jsonc` are generated into `worker-configuration.d.ts`.
interface Env {
  VAPID_PRIVATE_KEY: string;
}
