import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileRoutes } from "filesystem-routing/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    dedupe: ["solid-js", "@solidjs/web"],
    tsconfigPaths: true,
  },
  plugins: [
    // The Cloudflare plugin owns the Worker build. `external` hands the
    // server environment over to it; our Worker entry (`src/worker.ts`)
    // wraps the generated Solid handler and adds the Durable Object.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    solid({
      start: { external: true },
      ssr: true,
    }),
    fileRoutes({ httpMethods: true }),
    tailwindcss(),
  ],
});
